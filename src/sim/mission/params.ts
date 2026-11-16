import { DeltaV } from '../burns';
import { PropSystem } from '../propulsion';
import { AscentParams } from './ascent';
import raw from './params.json';

export interface BurnParams {
  /** Ignition instant (MET, s). */
  readonly met: number;
  readonly system: PropSystem;
  /** Ideal Δv of the burn, per local-frame component (km/s). */
  readonly dv: DeltaV;
  /**
   * true: the attitude is frozen at the ignition instant (inertial frame), as in a
   * long upper-stage burn without active guidance; the components of `dv` are
   * interpreted in the local frame at ignition. false (default): the thrust follows
   * the local frame for the whole burn.
   */
  readonly hold?: boolean;
}

export interface MissionParams {
  /** Ascent guidance (tuned by scripts/tune-free-return.ts). */
  readonly ascent: AscentParams;
  /**
   * Moon angle at MET 0 (degrees), measured from the Earth→launch pad
   * direction. It is the "phase relative to the Moon": equivalent to choosing the launch date.
   */
  readonly moonAngle0Deg: number;
  readonly burns: {
    readonly E4: BurnParams;
    readonly E5: BurnParams;
    readonly E7: BurnParams;
    readonly E8: BurnParams;
    readonly E9: BurnParams;
  };
  /** Result of flying the nominal mission with these parameters (informative). */
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

/** Parameters tuned by scripts/tune-free-return.ts. */
export const MISSION_PARAMS = raw as MissionParams;
