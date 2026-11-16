import { DV_LOW_FRACTION } from './constants';
import { tr } from './i18n';
import { ENGINES, EngineId, FULL_TANKS, MASS, PropLoad, TANK, VehicleConfig, idealDv, totalMass } from './vehicle';

/**
 * Propulsion systems handled by the crew or by the automatic sequence in space:
 * - ICPS: the rocket's upper stage (RL10 engine), automatic burns before separation.
 * - MAIN: service module main engine (large maneuvers).
 * - AUX: auxiliary thrusters (corrections and small maneuvers).
 * - RCS: reaction control: attitude and fine translations with the hand controller.
 */
export type PropSystem = 'ICPS' | 'MAIN' | 'AUX' | 'RCS';

export const SYSTEM_ENGINE: Readonly<Record<PropSystem, EngineId>> = {
  ICPS: 'RL10',
  MAIN: 'MAIN',
  AUX: 'AUX',
  RCS: 'RCS',
};

export interface PropulsionState {
  /** Remaining propellant per tank (kg): boosters, core stage, ICPS, service module. */
  readonly prop: PropLoad;
  /** Ideal Δv delivered by Orion (MAIN + AUX + RCS), km/s. */
  readonly orionDvUsed: number;
  readonly mainDvUsed: number;
  readonly auxDvUsed: number;
  readonly rcsDvUsed: number;
  /** Ideal Δv delivered by the ICPS, km/s. */
  readonly icpsDvUsed: number;
  readonly mainBurns: number;
  readonly auxBurns: number;
  readonly icpsBurns: number;
}

export const INITIAL_PROPULSION: PropulsionState = {
  prop: FULL_TANKS,
  orionDvUsed: 0,
  mainDvUsed: 0,
  auxDvUsed: 0,
  rcsDvUsed: 0,
  icpsDvUsed: 0,
  mainBurns: 0,
  auxBurns: 0,
  icpsBurns: 0,
};

/** Δv (km/s) left to a system with the current propellant and mass. */
export function dvAvailable(system: PropSystem, p: PropulsionState, cfg: VehicleConfig): number {
  const e = ENGINES[SYSTEM_ENGINE[system]];
  return idealDv(e, totalMass(cfg, p.prop), p.prop[e.tank]);
}

/** Δv left to Orion with the main engine. */
export const orionDvRemaining = (p: PropulsionState, cfg: VehicleConfig): number =>
  cfg.cmSeparated ? 0 : dvAvailable('MAIN', p, cfg);

/** Service module propellant fraction. */
export const tankFraction = (p: PropulsionState): number => p.prop[TANK.ESM] / MASS.esmProp;
export const isDvLow = (p: PropulsionState): boolean => tankFraction(p) < DV_LOW_FRACTION;

export type SystemStatus = 'DISPONIBLE' | 'ENCENDIDO' | 'ACOPLADO' | 'SEPARADO' | 'AGOTADO';
/** Status label in the current language. */
export const systemStatusLabel = (st: SystemStatus): string => tr(`st.${st}`);

/** Status of a system based on the vehicle configuration and which engines are firing. */
export function systemStatus(
  system: PropSystem,
  p: PropulsionState,
  cfg: VehicleConfig,
  running: readonly EngineId[] = [],
): SystemStatus {
  const e = ENGINES[SYSTEM_ENGINE[system]];
  if (system === 'ICPS') {
    if (cfg.icpsSeparated) return 'SEPARADO';
  } else {
    if (cfg.cmSeparated) return 'SEPARADO';
    if (!cfg.icpsSeparated) return 'ACOPLADO';
  }
  if (p.prop[e.tank] <= 0) return 'AGOTADO';
  if (running.includes(SYSTEM_ENGINE[system])) return 'ENCENDIDO';
  return 'DISPONIBLE';
}

/** Reason why a burn cannot be executed, or null if it can. `dv` in km/s. */
export function burnBlocker(system: PropSystem, dv: number, p: PropulsionState, cfg: VehicleConfig): string | null {
  const st = systemStatus(system, p, cfg);
  if (st === 'SEPARADO') return tr(system === 'ICPS' ? 'blk.icpsSeparated' : 'blk.smSeparated');
  if (st === 'ACOPLADO') return tr('blk.docked');
  if (system === 'ICPS' && !cfg.coreSeparated) return tr('blk.coreAttached');
  if (st === 'AGOTADO') return tr('blk.empty');
  if (dv > dvAvailable(system, p, cfg) + 1e-9) return tr('blk.insufficient');
  return null;
}
