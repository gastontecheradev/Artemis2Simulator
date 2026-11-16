import {
  EARTH_MOON_DISTANCE,
  EARTH_ORBIT_RATE,
  EARTH_ROTATION_IN_PLANE,
  GM_EARTH,
  GM_MOON,
  LAUNCH_BEFORE_SUNSET,
  MOON_ANGULAR_RATE,
  MOON_ORBIT,
  MOON_SIDEREAL_PERIOD,
} from './constants';
import { Vec3, vec3 } from './math/vec3';

export interface BodyState {
  readonly r: Vec3; // km
  readonly v: Vec3; // km/s
}

/**
 * Ephemeris: position and velocity of Earth and Moon as a function of t.
 * The rest of the simulation only knows this interface, so it can be replaced
 * with real ephemerides (JPL Horizons) without touching anything else.
 */
export interface Ephemeris {
  readonly gmEarth: number;
  readonly gmMoon: number;
  earth(t: number): BodyState;
  moon(t: number): BodyState;
  /** Angle (rad) of the Earth→Moon axis at t, without 2π wraps. Defines the rotating frame. */
  moonAngle(t: number): number;
  /** Period of the lunar orbit (s): one full revolution of `moon(t)`. For drawing it. */
  readonly moonPeriod: number;
}

/**
 * Circular CR3BP: Earth and Moon revolve around the barycenter (origin) at
 * constant angular velocity. `moonAngle0` is the Moon's angle at t = 0.
 */
export function createCircularEphemeris(moonAngle0 = 0): Ephemeris {
  const mu = GM_MOON / (GM_EARTH + GM_MOON);
  const rEarth = -mu * EARTH_MOON_DISTANCE;
  const rMoon = (1 - mu) * EARTH_MOON_DISTANCE;
  const w = MOON_ANGULAR_RATE;
  const at = (radius: number, t: number): BodyState => {
    const a = moonAngle0 + w * t;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { r: vec3(radius * c, radius * s, 0), v: vec3(-radius * w * s, radius * w * c, 0) };
  };
  return {
    gmEarth: GM_EARTH,
    gmMoon: GM_MOON,
    earth: (t) => at(rEarth, t),
    moon: (t) => at(rMoon, t),
    moonAngle: (t) => moonAngle0 + w * t,
    moonPeriod: MOON_SIDEREAL_PERIOD,
  };
}

/**
 * Mission ephemeris: the Moon follows a Keplerian ellipse around Earth
 * (two-body problem with GM_EARTH + GM_MOON) and both revolve around the barycenter, which
 * stays fixed at the origin. The elements (`MOON_ORBIT`) come from JPL Horizons for the
 * mission date, so the Earth‑Moon distance and the Moon's velocity are those of
 * April 2026. `moonAngle0` is the Moon's angle at t = 0, as in the circular
 * model: the free return tunes it and the whole ellipse rotates with it.
 * The problem is no longer the circular CR3BP: the Jacobi constant is not conserved.
 */
export function createKeplerEphemeris(moonAngle0 = 0, orbit: { a: number; e: number; apogeeMet: number } = MOON_ORBIT): Ephemeris {
  const gm = GM_EARTH + GM_MOON;
  const mu = GM_MOON / gm;
  const { a, e } = orbit;
  const n = Math.sqrt(gm / (a * a * a));
  const p = a * (1 - e * e);
  const h = Math.sqrt(gm / p);
  // For the true anomaly without wraps: ν = E + 2·atan(β·sin E / (1 − β·cos E)).
  const beta = e / (1 + Math.sqrt(1 - e * e));
  const meanAt = (t: number): number => Math.PI + n * (t - orbit.apogeeMet);
  const trueAnomaly = (t: number): number => {
    const m = meanAt(t);
    let ecc = m + e * Math.sin(m);
    for (let i = 0; i < 12; i++) {
      const d = (ecc - e * Math.sin(ecc) - m) / (1 - e * Math.cos(ecc));
      ecc -= d;
      if (Math.abs(d) < 1e-15) break;
    }
    return ecc + 2 * Math.atan((beta * Math.sin(ecc)) / (1 - beta * Math.cos(ecc)));
  };
  // Perigee direction: puts the Moon at `moonAngle0` at t = 0.
  const varpi = moonAngle0 - trueAnomaly(0);

  // The integrator asks for Earth and Moon at the same t: the last computation is cached.
  let lastT = NaN;
  let rel: { r: Vec3; v: Vec3; angle: number } = { r: vec3(), v: vec3(), angle: 0 };
  const relative = (t: number): { r: Vec3; v: Vec3; angle: number } => {
    if (t === lastT) return rel;
    const nu = trueAnomaly(t);
    const angle = varpi + nu;
    const r = p / (1 + e * Math.cos(nu));
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const vr = h * e * Math.sin(nu);
    const vt = h * (1 + e * Math.cos(nu));
    rel = { r: vec3(r * c, r * s, 0), v: vec3(vr * c - vt * s, vr * s + vt * c, 0), angle };
    lastT = t;
    return rel;
  };
  const part = (k: number, t: number): BodyState => {
    const x = relative(t);
    return { r: vec3(k * x.r.x, k * x.r.y, 0), v: vec3(k * x.v.x, k * x.v.y, 0) };
  };
  return {
    gmEarth: GM_EARTH,
    gmMoon: GM_MOON,
    earth: (t) => part(-mu, t),
    moon: (t) => part(1 - mu, t),
    moonAngle: (t) => relative(t).angle,
    moonPeriod: (2 * Math.PI) / n,
  };
}

/** Earth only, fixed at the origin. For two-body tests. */
export function createEarthOnlyEphemeris(): Ephemeris {
  const earth: BodyState = { r: vec3(), v: vec3() };
  const moon: BodyState = { r: vec3(EARTH_MOON_DISTANCE, 0, 0), v: vec3() };
  return { gmEarth: GM_EARTH, gmMoon: 0, earth: () => earth, moon: () => moon, moonAngle: () => 0, moonPeriod: MOON_SIDEREAL_PERIOD };
}

/**
 * Direction (unit, inertial) towards the Sun at t. The Sun is in the model's plane
 * (the lunar orbit differs from the ecliptic by ~5°) and so far away that the direction is the
 * same for Earth, the Moon and the spacecraft.
 *
 * The pad is on +y at t = 0 and Earth rotates counterclockwise (towards
 * −x, east). At liftoff there are LAUNCH_BEFORE_SUNSET seconds left until sunset: the Sun
 * is to the west, at 90° minus what the pad rotates in that interval from the vertical.
 * It then advances with Earth's annual motion (counterclockwise seen from the north).
 */
export function sunDirection(t: number): Vec3 {
  const a = LAUNCH_BEFORE_SUNSET * (EARTH_ROTATION_IN_PLANE - EARTH_ORBIT_RATE) + EARTH_ORBIT_RATE * t;
  return vec3(Math.cos(a), Math.sin(a), 0);
}
