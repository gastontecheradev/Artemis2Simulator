import { airDensity, airVelocity, pressureRatio } from './atmosphere';
import { Ephemeris } from './bodies';
import { R_EARTH } from './constants';
import { PowerModel } from './integrator';
import { Vec3, ZERO, length, scale, sub } from './math/vec3';
import { ENGINES, EngineId, G0, VehicleConfig, dragArea, fullMassFlow, srbMassFlow, totalMass } from './vehicle';

/** Ley de dirección del empuje: vector unitario en función del instante y del estado. */
export type DirectionLaw = (t: number, r: Vec3, v: Vec3) => Vec3;

export interface PowerInput {
  readonly eph: Ephemeris;
  readonly cfg: VehicleConfig;
  /** Motores encendidos durante el tramo. */
  readonly engines: readonly EngineId[];
  readonly direction: DirectionLaw;
  /** Instante de ignición de los boosters (para su perfil de empuje). */
  readonly srbIgnition?: number;
  /** Límite de aceleración (m/s²) que respetan los RS‑25 bajando el empuje. */
  readonly gLimit?: number;
  /** Sentido del empuje del RCS de traslación respecto del eje de la nave (+1 o −1). */
  readonly rcsSign?: number;
}

export interface Forces {
  /** Aceleración por empuje (m/s²), módulo. */
  readonly thrustAccel: number;
  /** Presión dinámica (Pa). */
  readonly q: number;
  /** Aceleración por arrastre (m/s²), módulo. */
  readonly dragAccel: number;
  /** Empuje total (N). */
  readonly thrust: number;
  /** Consumo por tanque (kg/s, negativo). */
  readonly dprop: readonly number[];
  readonly mass: number;
}

/** Fuerzas no gravitatorias sobre la nave en un instante. Lo usan el integrador y los instrumentos. */
export function forces(input: PowerInput, t: number, r: Vec3, v: Vec3, prop: readonly number[]): Forces {
  const earth = input.eph.earth(t);
  const altitude = length(sub(r, earth.r)) - R_EARTH;
  const rho = airDensity(altitude);
  const p = pressureRatio(altitude);
  const mass = totalMass(input.cfg, prop);
  let thrust = 0;
  const dprop = [0, 0, 0, 0];
  for (const id of input.engines) {
    const e = ENGINES[id];
    if (prop[e.tank] <= 0) continue;
    const isp = e.ispVac - (e.ispVac - e.ispSl) * p;
    let flow: number;
    if (id === 'SRB') {
      flow = srbMassFlow(t - (input.srbIgnition ?? 0));
    } else if (id === 'RS25' && input.gLimit) {
      // Los RS‑25 bajan el empuje para no pasar el límite de aceleración.
      const full = fullMassFlow(e) * G0 * isp;
      flow = fullMassFlow(e) * Math.min(1, (input.gLimit * mass) / full);
    } else {
      flow = fullMassFlow(e);
    }
    thrust += flow * G0 * isp * (id === 'RCS' ? (input.rcsSign ?? 1) : 1);
    dprop[e.tank] -= flow;
  }
  let q = 0;
  let dragAccel = 0;
  if (rho > 0) {
    const vAir = length(sub(v, airVelocity(r, earth))) * 1000; // m/s
    q = 0.5 * rho * vAir * vAir;
    dragAccel = (q * dragArea(input.cfg)) / mass;
  }
  return { thrustAccel: thrust / mass, q, dragAccel, thrust, dprop, mass };
}

/** Modelo de fuerzas para el integrador (aceleración en km/s²). */
export function makePower(input: PowerInput): PowerModel {
  return (t, r, v, prop) => {
    const f = forces(input, t, r, v, prop);
    let a: Vec3 = f.thrustAccel !== 0 ? scale(input.direction(t, r, v), f.thrustAccel / 1000) : ZERO;
    if (f.dragAccel > 0) {
      const vAir = sub(v, airVelocity(r, input.eph.earth(t)));
      const speed = length(vAir);
      if (speed > 0) {
        const k = -f.dragAccel / 1000 / speed;
        a = { x: a.x + k * vAir.x, y: a.y + k * vAir.y, z: a.z + k * vAir.z };
      }
    }
    return { a, dprop: f.dprop };
  };
}

/** Solo arrastre, para las partes desprendidas: `ballistic` es Cd·A/m (m²/kg). */
export function makeDrag(eph: Ephemeris, ballistic: number): PowerModel {
  return (t, r, v) => {
    const earth = eph.earth(t);
    const rho = airDensity(length(sub(r, earth.r)) - R_EARTH);
    if (rho <= 0) return { a: ZERO, dprop: [] };
    const vAir = sub(v, airVelocity(r, earth));
    const speed = length(vAir) * 1000;
    // a = −½·ρ·v²·(CdA/m) en m/s², pasado a km/s² y proyectado sobre la velocidad relativa al aire.
    const k = (-0.5 * rho * speed * ballistic) / 1000;
    return { a: scale(vAir, k * 1000), dprop: [] };
  };
}
