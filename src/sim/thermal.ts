import { airDensity, airVelocity } from './atmosphere';
import { R_EARTH } from './constants';
import { length, sub } from './math/vec3';
import { SimState, ephemerisOf } from './state';

/**
 * Temperatura de la piel de la nave: un modelo radiativo de equilibrio, no un modelo
 * térmico completo. Dos regímenes:
 * - Dentro de la atmósfera: flujo de calor convectivo en el punto de estancamiento según
 *   Sutton–Graves (q = k·√(ρ/rₙ)·v³, k = 1,7415·10⁻⁴ en unidades SI; Sutton & Graves,
 *   NASA TR R‑376, 1971) y temperatura de equilibrio radiativo T = (q/(ε·σ))^¼.
 * - En el espacio: equilibrio de una esfera gris bajo el Sol a 1 UA, T = (S/(4σ))^¼ ≈ 278 K,
 *   con S = 1.361 W/m² (Kopp & Lean, 2011). No se modelan eclipses ni la inercia térmica.
 * SUPUESTOS: emisividad 0,85 y radio de nariz de 0,5 m (cofia/torre) y 6,0 m (escudo de Orion).
 */
const SUTTON_GRAVES_K = 1.7415e-4;
const SIGMA = 5.670374419e-8;
const EMISSIVITY = 0.85;
const SOLAR_CONSTANT = 1361;
/** Temperatura de equilibrio en el espacio (K). */
export const SPACE_EQUILIBRIUM_K = Math.pow(SOLAR_CONSTANT / (4 * SIGMA), 0.25);

export interface SkinTemperature {
  readonly kelvin: number;
  /** true si domina el calentamiento aerodinámico (dentro de la atmósfera). */
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
