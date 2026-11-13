import { BodyState, Ephemeris } from './bodies';
import { MOON_SOI } from './constants';
import { ShipState } from './integrator';
import { Vec3, add, cross, distance, normalize, scale, sub } from './math/vec3';

/** Delta‑v en el marco local de la nave (km/s). */
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
 * Marco local respecto de un cuerpo: prograde = dirección de la velocidad relativa,
 * normal = dirección del momento angular, radial = prograde × normal (hacia afuera
 * en una órbita circular).
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
 * Cuerpo de referencia del marco local: la Luna dentro de su esfera de influencia,
 * la Tierra en el resto.
 */
export function referenceBody(ship: ShipState, t: number, eph: Ephemeris): BodyState {
  const moon = eph.moon(t);
  return distance(ship.r, moon.r) < MOON_SOI ? moon : eph.earth(t);
}

/** Encendido impulsivo: suma el delta‑v instantáneamente. Devuelve un estado nuevo. */
export function applyBurn(ship: ShipState, dv: DeltaV, body: BodyState): ShipState {
  const f = localFrame(ship, body);
  const d = add(add(scale(f.prograde, dv.prograde), scale(f.normal, dv.normal)), scale(f.radial, dv.radial));
  return { r: ship.r, v: add(ship.v, d) };
}
