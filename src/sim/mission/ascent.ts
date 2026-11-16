import { airVelocity } from '../atmosphere';
import { Ephemeris } from '../bodies';
import { Vec3, cross, dot, normalize, sub } from '../math/vec3';
import { DirectionLaw } from '../power';
import { SRB_BURN_TIME } from '../vehicle';

/**
 * Simulated ascent (E1 → E3): real thrust, mass, drag and gravity. The only things
 * programmed are what is also programmed in the real rocket: the time-based event
 * sequence and the guidance law that points the thrust.
 */

/** Ascent sequence (MET in s). The times are the ones published by NASA for Artemis II. */
export const ASCENT_SEQUENCE = {
  /** Tower cleared: the pitch maneuver begins. */
  pitchStart: 7,
  /** End of the initial pitch-over; the gravity turn follows. */
  pitchEnd: 17,
  srbBurnout: SRB_BURN_TIME,
  srbSeparation: 128,
  /** Linear-tangent guidance begins (outside the dense atmosphere). */
  linearTangentStart: 135,
  lasJettison: 208,
  meco: 486,
  coreSeparation: 498,
} as const;

/** Guidance parameters. Tuned by `tuneAscent` in scripts/lib/calibration.ts (they live in params.json). */
export interface AscentParams {
  /** Initial pitch-over angle from the vertical (degrees). */
  readonly kickDeg: number;
  /** Rate at which the tangent of the pitch angle decreases in linear-tangent guidance (1/s). */
  readonly tanRate: number;
  /** RS‑25 acceleration limit (m/s²). */
  readonly gLimit: number;
}

const Z: Vec3 = { x: 0, y: 0, z: 1 };

/** Local axes at a point: vertical (up) and horizontal towards the east (direction of Earth's rotation). */
function localAxes(r: Vec3, t: number, eph: Ephemeris): { up: Vec3; east: Vec3 } {
  const up = normalize(sub(r, eph.earth(t).r));
  return { up, east: normalize(cross(Z, up)) };
}

const blend = (up: Vec3, east: Vec3, pitchFromVertical: number): Vec3 => {
  const c = Math.cos(pitchFromVertical);
  const s = Math.sin(pitchFromVertical);
  return { x: c * up.x + s * east.x, y: c * up.y + s * east.y, z: c * up.z + s * east.z };
};

/** Tangent of the angle of the air-relative velocity above the local horizontal. */
export function airPathTangent(r: Vec3, v: Vec3, t: number, eph: Ephemeris): number {
  const { up, east } = localAxes(r, t, eph);
  const vAir = sub(v, airVelocity(r, eph.earth(t)));
  return dot(vAir, up) / Math.max(1e-9, dot(vAir, east));
}

/**
 * Ascent guidance law:
 * 1. Vertical rise until the tower is cleared.
 * 2. Pitch-over: the thrust tilts east up to `kickDeg`.
 * 3. Gravity turn: the thrust follows the air-relative velocity (zero angle of attack).
 * 4. Linear tangent: the tangent of the pitch above the horizontal decreases at a constant rate
 *    from the value it had at the end of the gravity turn (`tanAtHandover`).
 */
export function ascentDirection(p: AscentParams, tanAtHandover: number | null, eph: Ephemeris): DirectionLaw {
  const S = ASCENT_SEQUENCE;
  const kick = (p.kickDeg * Math.PI) / 180;
  return (t, r, v) => {
    const { up, east } = localAxes(r, t, eph);
    if (t < S.pitchStart) return up;
    if (t < S.pitchEnd) return blend(up, east, (kick * (t - S.pitchStart)) / (S.pitchEnd - S.pitchStart));
    if (t < S.linearTangentStart || tanAtHandover === null) {
      const vAir = sub(v, airVelocity(r, eph.earth(t)));
      return normalize(vAir);
    }
    const pitch = Math.atan(tanAtHandover - p.tanRate * (t - S.linearTangentStart));
    return blend(up, east, Math.PI / 2 - pitch);
  };
}
