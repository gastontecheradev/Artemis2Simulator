import { BodyState, Ephemeris } from './bodies';
import { MOON_SOI } from './constants';
import { ShipState } from './integrator';
import { Vec3, add, cross, distance, normalize, scale, sub } from './math/vec3';

/** Delta‑v in the spacecraft's local frame (km/s). */
export interface DeltaV {
  readonly prograde: number;
  readonly normal: number;
  readonly radial: number;
}

export const ZERO_DV: DeltaV = { prograde: 0, normal: 0, radial: 0 };

export const dvMagnitude = (dv: DeltaV): number =>
  Math.sqrt(dv.prograde * dv.prograde + dv.normal * dv.normal + dv.radial * dv.radial);

export interface LocalFrame {
  readonly prograde: Vec3;
  readonly normal: Vec3;
  readonly radial: Vec3;
}

/**
 * Local frame relative to a body: prograde = direction of the relative velocity,
 * normal = direction of the angular momentum, radial = prograde × normal (outwards
 * in a circular orbit).
 */
export function localFrame(ship: ShipState, body: BodyState): LocalFrame {
  const rRel = sub(ship.r, body.r);
  const vRel = sub(ship.v, body.v);
  const prograde = normalize(vRel);
  const normal = normalize(cross(rRel, vRel));
  const radial = cross(prograde, normal);
  return { prograde, normal, radial };
}

/**
 * Reference body of the local frame: the Moon inside its sphere of influence,
 * Earth everywhere else.
 */
export function referenceBody(ship: ShipState, t: number, eph: Ephemeris): BodyState {
  const moon = eph.moon(t);
  return distance(ship.r, moon.r) < MOON_SOI ? moon : eph.earth(t);
}

/** Impulsive burn: adds the delta‑v instantaneously. Returns a new state. */
export function applyBurn(ship: ShipState, dv: DeltaV, body: BodyState): ShipState {
  const f = localFrame(ship, body);
  const d = add(add(scale(f.prograde, dv.prograde), scale(f.normal, dv.normal)), scale(f.radial, dv.radial));
  return { r: ship.r, v: add(ship.v, d) };
}

/**
 * Thrust direction of a burn: the combination of local-frame axes requested
 * by the Δv, recomputed at every instant (the spacecraft follows, for example, prograde
 * for the whole burn).
 */
export function burnDirection(dv: DeltaV, eph: Ephemeris): (t: number, r: Vec3, v: Vec3) => Vec3 {
  return (t, r, v) => {
    const ship = { r, v };
    const f = localFrame(ship, referenceBody(ship, t, eph));
    return normalize(
      add(add(scale(f.prograde, dv.prograde), scale(f.normal, dv.normal)), scale(f.radial, dv.radial)),
    );
  };
}
