import { BodyState } from './bodies';
import { EARTH_ROTATION_IN_PLANE, R_EARTH } from './constants';
import { Vec3, length, sub } from './math/vec3';

/**
 * Layered exponential atmosphere (Vallado model, "Fundamentals of Astrodynamics
 * and Applications", table 8‑4, derived from the U.S. Standard Atmosphere 1976).
 * Each row: base altitude (km), density at the base (kg/m³) and scale height (km).
 */
const LAYERS: readonly (readonly [number, number, number])[] = [
  [0, 1.225, 7.249],
  [25, 3.899e-2, 6.349],
  [30, 1.774e-2, 6.682],
  [40, 3.972e-3, 7.554],
  [50, 1.057e-3, 8.382],
  [60, 3.206e-4, 7.714],
  [70, 8.77e-5, 6.549],
  [80, 1.905e-5, 5.799],
  [90, 3.396e-6, 5.382],
  [100, 5.297e-7, 5.877],
  [110, 9.661e-8, 7.263],
  [120, 2.438e-8, 9.473],
  [130, 8.484e-9, 12.636],
  [140, 3.845e-9, 16.149],
  [150, 2.07e-9, 22.523],
  [180, 5.464e-10, 29.74],
];

export const SEA_LEVEL_DENSITY = LAYERS[0][1];
/** Above this altitude drag is neglected (the simulator's orbital flight has no atmosphere). */
export const ATMOSPHERE_TOP = 200; // km

/** Air density (kg/m³) at an altitude in km. */
export function airDensity(altitude: number): number {
  if (altitude >= ATMOSPHERE_TOP) return 0;
  const h = Math.max(0, altitude);
  let i = LAYERS.length - 1;
  while (i > 0 && h < LAYERS[i][0]) i--;
  const [h0, rho0, scale] = LAYERS[i];
  return rho0 * Math.exp(-(h - h0) / scale);
}

/**
 * Ambient pressure relative to sea level. Approximated by the density
 * ratio (isothermal atmosphere): good enough to interpolate the specific impulse.
 */
export const pressureRatio = (altitude: number): number => airDensity(altitude) / SEA_LEVEL_DENSITY;

/**
 * Velocity of the air (and the ground) at a point: the atmosphere rotates with Earth.
 * The model is planar, so the component of Earth's rotation in the orbital
 * plane (that of the launch site) is used.
 */
export function airVelocity(r: Vec3, earth: BodyState): Vec3 {
  const rel = sub(r, earth.r);
  const w = EARTH_ROTATION_IN_PLANE;
  return { x: earth.v.x - w * rel.y, y: earth.v.y + w * rel.x, z: earth.v.z };
}

export const altitudeOver = (r: Vec3, earth: BodyState): number => length(sub(r, earth.r)) - R_EARTH;
