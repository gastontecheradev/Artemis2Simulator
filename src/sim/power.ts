import { airDensity, airVelocity, pressureRatio } from './atmosphere';
import { Ephemeris } from './bodies';
import { R_EARTH } from './constants';
import { PowerModel } from './integrator';
import { Vec3, ZERO, length, scale, sub } from './math/vec3';
import { ENGINES, EngineId, G0, TANK_COUNT, VehicleConfig, dragArea, fullMassFlow, rs25Throttle, srbMassFlow, totalMass } from './vehicle';

/** Thrust direction law: unit vector as a function of instant and state. */
export type DirectionLaw = (t: number, r: Vec3, v: Vec3) => Vec3;

export interface PowerInput {
  readonly eph: Ephemeris;
  readonly cfg: VehicleConfig;
  /** Engines firing during the segment. */
  readonly engines: readonly EngineId[];
  readonly direction: DirectionLaw;
  /** Booster ignition instant (for their thrust profile). */
  readonly srbIgnition?: number;
  /** Acceleration limit (m/s²) that the RS‑25s respect by throttling down. */
  readonly gLimit?: number;
  /** Direction of the translation RCS thrust relative to the spacecraft axis (+1 or −1). */
  readonly rcsSign?: number;
}

export interface Forces {
  /** Acceleration from thrust (m/s²), magnitude. */
  readonly thrustAccel: number;
  /** Dynamic pressure (Pa). */
  readonly q: number;
  /** Acceleration from drag (m/s²), magnitude. */
  readonly dragAccel: number;
  /** Total thrust (N). */
  readonly thrust: number;
  /** Flow per tank (kg/s, negative). */
  readonly dprop: readonly number[];
  readonly mass: number;
}

/** Non-gravitational forces on the spacecraft at an instant. Used by the integrator and the instruments. */
export function forces(input: PowerInput, t: number, r: Vec3, v: Vec3, prop: readonly number[]): Forces {
  const earth = input.eph.earth(t);
  const altitude = length(sub(r, earth.r)) - R_EARTH;
  const rho = airDensity(altitude);
  const p = pressureRatio(altitude);
  const mass = totalMass(input.cfg, prop);
  let thrust = 0;
  const dprop = new Array<number>(TANK_COUNT).fill(0);
  for (const id of input.engines) {
    const e = ENGINES[id];
    if (prop[e.tank] <= 0) continue;
    const isp = e.ispVac - (e.ispVac - e.ispSl) * p;
    let flow: number;
    if (id === 'SRB') {
      flow = srbMassFlow(t - (input.srbIgnition ?? 0));
    } else if (id === 'RS25') {
      // Published power schedule, and in addition they throttle down so as not to exceed the acceleration limit.
      const full = fullMassFlow(e) * G0 * isp;
      const limit = input.gLimit ? (input.gLimit * mass) / full : 1;
      flow = fullMassFlow(e) * Math.min(rs25Throttle(t), limit);
    } else {
      flow = fullMassFlow(e);
    }
    thrust += flow * G0 * isp * (id === 'RCS' || id === 'CMRCS' ? (input.rcsSign ?? 1) : 1);
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

/** Force model for the integrator (acceleration in km/s²). */
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

/** Drag only, for the jettisoned parts: `ballistic` is Cd·A/m (m²/kg). */
export function makeDrag(eph: Ephemeris, ballistic: number): PowerModel {
  return (t, r, v) => {
    const earth = eph.earth(t);
    const rho = airDensity(length(sub(r, earth.r)) - R_EARTH);
    if (rho <= 0) return { a: ZERO, dprop: [] };
    const vAir = sub(v, airVelocity(r, earth));
    const speed = length(vAir) * 1000;
    // a = −½·ρ·v²·(CdA/m) in m/s², converted to km/s² and projected onto the air-relative velocity.
    const k = (-0.5 * rho * speed * ballistic) / 1000;
    return { a: scale(vAir, k * 1000), dprop: [] };
  };
}
