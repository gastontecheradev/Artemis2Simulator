import { DeltaV } from '../burns';
import { PropSystem } from '../propulsion';
import raw from './params.json';

export interface BurnParams {
  /** Instante de encendido (MET, s). */
  readonly met: number;
  readonly system: PropSystem;
  readonly dv: DeltaV; // km/s
}

export interface MissionParams {
  /** Estado en E3 (separación de la etapa central). */
  readonly insertion: {
    readonly met: number;
    readonly altitude: number; // km
    readonly speed: number; // km/s, inercial
    readonly fpaDeg: number;
  };
  /**
   * Ángulo de la Luna en MET 0 (grados), medido desde la dirección Tierra→nave en E3.
   * Es la "fase relativa a la Luna" del TLI: equivale a elegir la fecha de lanzamiento.
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
    readonly flybyAltitude: number;
    readonly flybyMet: number;
    readonly eiMet: number;
    readonly eiFpaDeg: number;
    readonly eiSpeed: number;
  };
}

/** Parámetros ajustados por scripts/calibrate-insertion.ts y scripts/tune-free-return.ts. */
export const MISSION_PARAMS = raw as MissionParams;
