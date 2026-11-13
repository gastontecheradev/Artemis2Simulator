import { BodyState, Ephemeris } from './bodies';
import { MOON_ANGULAR_RATE } from './constants';
import { ShipState } from './integrator';
import { Vec3, cross, distance, dot, length, sub } from './math/vec3';

export interface OrbitElements {
  /** Semieje mayor (km). Negativo si es hiperbólica. */
  readonly a: number;
  readonly e: number;
  /** Radio de periapsis (km, desde el centro). */
  readonly rp: number;
  /** Radio de apoapsis (km). Infinity si la órbita no es cerrada. */
  readonly ra: number;
  /** Período (s). Infinity si la órbita no es cerrada. */
  readonly period: number;
  /** Energía específica (km²/s²). */
  readonly energy: number;
  /** Ángulo de trayectoria (grados; positivo = subiendo). */
  readonly fpaDeg: number;
  readonly r: number;
  readonly speed: number;
  /** Velocidad radial (km/s). */
  readonly radialSpeed: number;
}

/** Elementos osculantes a partir de posición y velocidad relativas al cuerpo central. */
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

const relElements = (s: ShipState, b: BodyState, gm: number): OrbitElements =>
  orbitElements(sub(s.r, b.r), sub(s.v, b.v), gm);

/** Elementos osculantes respecto de la Tierra. */
export const earthElements = (s: ShipState, t: number, eph: Ephemeris): OrbitElements =>
  relElements(s, eph.earth(t), eph.gmEarth);

/** Elementos osculantes respecto de la Luna. */
export const moonElements = (s: ShipState, t: number, eph: Ephemeris): OrbitElements =>
  relElements(s, eph.moon(t), eph.gmMoon);

/**
 * Constante de Jacobi del CR3BP circular, evaluada con el estado inercial baricéntrico:
 * C = 2·(GM_T/r1 + GM_L/r2) + 2·ω·(x·vy − y·vx) − v².
 */
export function jacobiConstant(s: ShipState, t: number, eph: Ephemeris): number {
  const r1 = distance(s.r, eph.earth(t).r);
  const r2 = distance(s.r, eph.moon(t).r);
  const lz = s.r.x * s.v.y - s.r.y * s.v.x;
  return 2 * (eph.gmEarth / r1 + eph.gmMoon / r2) + 2 * MOON_ANGULAR_RATE * lz - dot(s.v, s.v);
}
