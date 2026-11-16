import { BodyState, Ephemeris } from './bodies';
import { EI_ALTITUDE, GM_EARTH, MOON_ANGULAR_RATE, R_EARTH } from './constants';
import { ShipState } from './integrator';
import { Vec3, cross, distance, dot, length, sub } from './math/vec3';
import { SimState, ephemerisOf } from './state';

export interface OrbitElements {
  /** Semi-major axis (km). Negative if hyperbolic. */
  readonly a: number;
  readonly e: number;
  /** Periapsis radius (km, from the center). */
  readonly rp: number;
  /** Apoapsis radius (km). Infinity if the orbit is not closed. */
  readonly ra: number;
  /** Period (s). Infinity if the orbit is not closed. */
  readonly period: number;
  /** Specific energy (km²/s²). */
  readonly energy: number;
  /** Flight-path angle (degrees; positive = climbing). */
  readonly fpaDeg: number;
  readonly r: number;
  readonly speed: number;
  /** Radial velocity (km/s). */
  readonly radialSpeed: number;
}

/** Osculating elements from position and velocity relative to the central body. */
export function orbitElements(rRel: Vec3, vRel: Vec3, gm: number): OrbitElements {
  const r = length(rRel);
  const speed = length(vRel);
  const energy = (speed * speed) / 2 - gm / r;
  const h = length(cross(rRel, vRel));
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (gm * gm)));
  const p = (h * h) / gm;
  const rp = p / (1 + e);
  const closed = energy < 0 && e < 1;
  const a = energy !== 0 ? -gm / (2 * energy) : Infinity;
  const ra = closed ? p / (1 - e) : Infinity;
  const period = closed ? 2 * Math.PI * Math.sqrt((a * a * a) / gm) : Infinity;
  const radialSpeed = dot(rRel, vRel) / r;
  const fpaDeg = (Math.asin(Math.max(-1, Math.min(1, radialSpeed / speed))) * 180) / Math.PI;
  return { a, e, rp, ra, period, energy, fpaDeg, r, speed, radialSpeed };
}

/**
 * Time (s) until a spacecraft that is descending (negative radial velocity) reaches
 * radius `rTarget` on its osculating two-body orbit, solved with Kepler's
 * equation (elliptic or hyperbolic). NaN if it is not descending or if the requested radius is
 * below periapsis or above the current radius.
 */
export function timeToDescendTo(el: OrbitElements, rTarget: number, gm: number): number {
  if (el.radialSpeed >= 0 || rTarget >= el.r || rTarget < el.rp || el.e < 1e-9) return NaN;
  const a = el.a;
  const e = el.e;
  if (e < 1) {
    // Negative eccentric anomalies: before periapsis.
    const cosE = (x: number): number => Math.max(-1, Math.min(1, (1 - x / a) / e));
    const E0 = -Math.acos(cosE(el.r));
    const E1 = -Math.acos(cosE(rTarget));
    const M = (E: number): number => E - e * Math.sin(E);
    return (M(E1) - M(E0)) / Math.sqrt(gm / (a * a * a));
  }
  const coshH = (x: number): number => Math.max(1, (1 - x / a) / e);
  const H0 = -Math.acosh(coshH(el.r));
  const H1 = -Math.acosh(coshH(rTarget));
  const M = (H: number): number => e * Math.sinh(H) - H;
  return (M(H1) - M(H0)) / Math.sqrt(gm / (-a * -a * -a));
}

const relElements = (s: ShipState, b: BodyState, gm: number): OrbitElements =>
  orbitElements(sub(s.r, b.r), sub(s.v, b.v), gm);

/** Osculating elements relative to Earth. */
export const earthElements = (s: ShipState, t: number, eph: Ephemeris): OrbitElements =>
  relElements(s, eph.earth(t), eph.gmEarth);

/** Osculating elements relative to the Moon. */
export const moonElements = (s: ShipState, t: number, eph: Ephemeris): OrbitElements =>
  relElements(s, eph.moon(t), eph.gmMoon);

/**
 * Jacobi constant of the circular CR3BP (only valid with `createCircularEphemeris`; with the
 * mission's elliptical lunar orbit it is not conserved), evaluated with the barycentric inertial state:
 * C = 2·(GM_EARTH/r1 + GM_MOON/r2) + 2·ω·(x·vy − y·vx) − v².
 */
export function jacobiConstant(s: ShipState, t: number, eph: Ephemeris): number {
  const r1 = distance(s.r, eph.earth(t).r);
  const r2 = distance(s.r, eph.moon(t).r);
  const lz = s.r.x * s.v.y - s.r.y * s.v.x;
  return 2 * (eph.gmEarth / r1 + eph.gmMoon / r2) + 2 * MOON_ANGULAR_RATE * lz - dot(s.v, s.v);
}

/** Time (s) until crossing entry interface while descending, from the osculating orbit; Infinity if it is not descending towards it. */
export function timeToEntry(s: SimState): number {
  const el = earthElements(s.ship, s.t, ephemerisOf(s));
  const t = timeToDescendTo(el, R_EARTH + EI_ALTITUDE, GM_EARTH);
  return Number.isFinite(t) ? t : Infinity;
}
