import { DV_LOW_FRACTION, ORION_DV_BUDGET } from './constants';

/**
 * Sistemas de propulsión (4.png):
 * - ICPS: etapa superior del cohete, encendidos automáticos antes de la separación.
 * - MAIN: motor principal del módulo de servicio (grandes maniobras).
 * - AUX: propulsores auxiliares (correcciones y maniobras chicas).
 * - RCS: control de actitud. No afecta la trayectoria (no se simula actitud).
 */
export type PropSystem = 'ICPS' | 'MAIN' | 'AUX' | 'RCS';

export interface PropulsionState {
  /** Δv consumido por Orion (MAIN + AUX comparten tanques), km/s. */
  readonly orionDvUsed: number;
  readonly mainDvUsed: number;
  readonly auxDvUsed: number;
  /** Δv entregado por el ICPS, km/s (solo informativo). */
  readonly icpsDvUsed: number;
  readonly mainBurns: number;
  readonly auxBurns: number;
  readonly icpsBurns: number;
}

export const INITIAL_PROPULSION: PropulsionState = {
  orionDvUsed: 0,
  mainDvUsed: 0,
  auxDvUsed: 0,
  icpsDvUsed: 0,
  mainBurns: 0,
  auxBurns: 0,
  icpsBurns: 0,
};

export interface VehicleConfig {
  /** Orion ya se separó del ICPS. */
  readonly icpsSeparated: boolean;
  /** El módulo de tripulación ya se separó del módulo de servicio. */
  readonly cmSeparated: boolean;
}

export const orionDvRemaining = (p: PropulsionState): number => Math.max(0, ORION_DV_BUDGET - p.orionDvUsed);
export const tankFraction = (p: PropulsionState): number => orionDvRemaining(p) / ORION_DV_BUDGET;
export const isDvLow = (p: PropulsionState): boolean => tankFraction(p) < DV_LOW_FRACTION;

export type SystemStatus = 'DISPONIBLE' | 'ACOPLADO' | 'SEPARADO' | 'AGOTADO';

/** Estado de un sistema según la configuración del vehículo. */
export function systemStatus(system: PropSystem, p: PropulsionState, cfg: VehicleConfig): SystemStatus {
  if (system === 'ICPS') return cfg.icpsSeparated ? 'SEPARADO' : 'DISPONIBLE';
  if (system === 'RCS') return 'DISPONIBLE';
  if (cfg.cmSeparated) return 'SEPARADO';
  if (!cfg.icpsSeparated) return 'ACOPLADO';
  return orionDvRemaining(p) > 0 ? 'DISPONIBLE' : 'AGOTADO';
}

/** Motivo por el que un encendido no se puede ejecutar, o null si se puede. */
export function burnBlocker(
  system: PropSystem,
  dv: number,
  p: PropulsionState,
  cfg: VehicleConfig,
): string | null {
  if (system === 'RCS') return 'El RCS no hace maniobras de trayectoria';
  const st = systemStatus(system, p, cfg);
  if (st === 'SEPARADO') return system === 'ICPS' ? 'ICPS ya separado' : 'Módulo de servicio separado';
  if (st === 'ACOPLADO') return 'Orion sigue acoplado al ICPS';
  if (system !== 'ICPS' && dv > orionDvRemaining(p) + 1e-12) return 'Δv insuficiente';
  return null;
}

/** Descuenta el Δv de un encendido. Devuelve un estado nuevo. */
export function consume(p: PropulsionState, system: PropSystem, dv: number): PropulsionState {
  switch (system) {
    case 'ICPS':
      return { ...p, icpsDvUsed: p.icpsDvUsed + dv, icpsBurns: p.icpsBurns + 1 };
    case 'MAIN':
      return { ...p, orionDvUsed: p.orionDvUsed + dv, mainDvUsed: p.mainDvUsed + dv, mainBurns: p.mainBurns + 1 };
    case 'AUX':
      return { ...p, orionDvUsed: p.orionDvUsed + dv, auxDvUsed: p.auxDvUsed + dv, auxBurns: p.auxBurns + 1 };
    case 'RCS':
      return p;
  }
}
