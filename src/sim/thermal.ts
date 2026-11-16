import { airDensity, airVelocity } from './atmosphere';
import { R_EARTH } from './constants';
import { length, sub } from './math/vec3';
import { SimState, ephemerisOf } from './state';

/**
 * Spacecraft skin temperature: a radiative equilibrium model, not a full thermal
 * model. Two regimes:
 * - Inside the atmosphere: convective heat flux at the stagnation point from
 *   Sutton–Graves (q = k·√(ρ/rₙ)·v³, k = 1.7415·10⁻⁴ in SI units; Sutton & Graves,
 *   NASA TR R‑376, 1971) and radiative equilibrium temperature T = (q/(ε·σ))^¼.
 * - In space: equilibrium of a gray sphere under the Sun at 1 AU, T = (S/(4σ))^¼ ≈ 278 K,
 *   with S = 1,361 W/m² (Kopp & Lean, 2011). Eclipses and thermal inertia are not modeled.
 * ASSUMPTIONS: emissivity 0.85 and nose radius of 0.5 m (fairing/tower) and 6.0 m (Orion's heat shield).
 */
const SUTTON_GRAVES_K = 1.7415e-4;
const SIGMA = 5.670374419e-8;
const EMISSIVITY = 0.85;
const SOLAR_CONSTANT = 1361;
/** Equilibrium temperature in space (K). */
export const SPACE_EQUILIBRIUM_K = Math.pow(SOLAR_CONSTANT / (4 * SIGMA), 0.25);

export interface SkinTemperature {
  readonly kelvin: number;
  /** true if aerodynamic heating dominates (inside the atmosphere). */
  readonly aerodynamic: boolean;
}

export function skinTemperature(s: SimState): SkinTemperature {
  const eph = ephemerisOf(s);
  const earth = eph.earth(s.t);
  const altitude = length(sub(s.ship.r, earth.r)) - R_EARTH;
  const rho = airDensity(altitude);
  if (rho <= 0) return { kelvin: SPACE_EQUILIBRIUM_K, aerodynamic: false };
  const v = length(sub(s.ship.v, airVelocity(s.ship.r, earth))) * 1000; // m/s
  const noseRadius = s.vehicle.cmSeparated ? 6.0 : 0.5;
  const q = SUTTON_GRAVES_K * Math.sqrt(rho / noseRadius) * v * v * v; // W/m²
  const aero = Math.pow(q / (EMISSIVITY * SIGMA), 0.25);
  return aero > SPACE_EQUILIBRIUM_K ? { kelvin: aero, aerodynamic: true } : { kelvin: SPACE_EQUILIBRIUM_K, aerodynamic: false };
}
