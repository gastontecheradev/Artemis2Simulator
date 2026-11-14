import { DeltaV } from '../burns';
import { PropSystem } from '../propulsion';
import { AscentParams } from './ascent';
import raw from './params.json';

export interface BurnParams {
  /** Instante de ignición (MET, s). */
  readonly met: number;
  readonly system: PropSystem;
  /** Δv ideal del encendido, por componente del marco local (km/s). */
  readonly dv: DeltaV;
}

export interface MissionParams {
  /** Guiado del ascenso (lo ajusta scripts/tune-free-return.ts). */
  readonly ascent: AscentParams;
  /**
   * Ángulo de la Luna en MET 0 (grados), medido desde la dirección Tierra→plataforma
   * de lanzamiento. Es la "fase relativa a la Luna": equivale a elegir la fecha de lanzamiento.
   */
  readonly moonAngle0Deg: number;
  readonly burns: {
    readonly E4: BurnParams;
    readonly E5: BurnParams;
    readonly E7: BurnParams;
    readonly E8: BurnParams;
    readonly E9: BurnParams;
  };
  /** Resultado de volar la misión nominal con estos parámetros (informativo). */
  readonly nominal: {
    readonly insertionSpeed: number;
    readonly insertionFpaDeg: number;
    readonly flybyAltitude: number;
    readonly flybyMet: number;
    readonly eiMet: number;
    readonly eiFpaDeg: number;
    readonly eiSpeed: number;
  };
}

/** Parámetros ajustados por scripts/tune-free-return.ts. */
export const MISSION_PARAMS = raw as MissionParams;
