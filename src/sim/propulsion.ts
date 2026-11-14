import { DV_LOW_FRACTION } from './constants';
import { ENGINES, EngineId, FULL_TANKS, MASS, PropLoad, TANK, VehicleConfig, idealDv, totalMass } from './vehicle';

/**
 * Sistemas de propulsión que maneja la tripulación o la secuencia automática en el espacio:
 * - ICPS: etapa superior del cohete (motor RL10), encendidos automáticos antes de la separación.
 * - MAIN: motor principal del módulo de servicio (grandes maniobras).
 * - AUX: propulsores auxiliares (correcciones y maniobras chicas).
 * - RCS: control de reacción: actitud y traslaciones finas con el controlador manual.
 */
export type PropSystem = 'ICPS' | 'MAIN' | 'AUX' | 'RCS';

export const SYSTEM_ENGINE: Readonly<Record<PropSystem, EngineId>> = {
  ICPS: 'RL10',
  MAIN: 'MAIN',
  AUX: 'AUX',
  RCS: 'RCS',
};

export interface PropulsionState {
  /** Propelente restante por tanque (kg): boosters, etapa central, ICPS, módulo de servicio. */
  readonly prop: PropLoad;
  /** Δv ideal entregado por Orion (MAIN + AUX + RCS), km/s. */
  readonly orionDvUsed: number;
  readonly mainDvUsed: number;
  readonly auxDvUsed: number;
  readonly rcsDvUsed: number;
  /** Δv ideal entregado por el ICPS, km/s. */
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

/** Δv (km/s) que le queda a un sistema con el propelente y la masa actuales. */
export function dvAvailable(system: PropSystem, p: PropulsionState, cfg: VehicleConfig): number {
  const e = ENGINES[SYSTEM_ENGINE[system]];
  return idealDv(e, totalMass(cfg, p.prop), p.prop[e.tank]);
}

/** Δv que le queda a Orion con el motor principal. */
export const orionDvRemaining = (p: PropulsionState, cfg: VehicleConfig): number =>
  cfg.cmSeparated ? 0 : dvAvailable('MAIN', p, cfg);

/** Fracción de propelente del módulo de servicio. */
export const tankFraction = (p: PropulsionState): number => p.prop[TANK.ESM] / MASS.esmProp;
export const isDvLow = (p: PropulsionState): boolean => tankFraction(p) < DV_LOW_FRACTION;

export type SystemStatus = 'DISPONIBLE' | 'ENCENDIDO' | 'ACOPLADO' | 'SEPARADO' | 'AGOTADO';

/** Estado de un sistema según la configuración del vehículo y qué motores están encendidos. */
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

/** Motivo por el que un encendido no se puede ejecutar, o null si se puede. `dv` en km/s. */
export function burnBlocker(system: PropSystem, dv: number, p: PropulsionState, cfg: VehicleConfig): string | null {
  const st = systemStatus(system, p, cfg);
  if (st === 'SEPARADO') return system === 'ICPS' ? 'ICPS ya separado' : 'Módulo de servicio separado';
  if (st === 'ACOPLADO') return 'Orion sigue acoplado al ICPS';
  if (system === 'ICPS' && !cfg.coreSeparated) return 'La etapa central sigue unida';
  if (st === 'AGOTADO') return 'Sin propelente';
  if (dv > dvAvailable(system, p, cfg) + 1e-9) return 'Propelente insuficiente para ese Δv';
  return null;
}
