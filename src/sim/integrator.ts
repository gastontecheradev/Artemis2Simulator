import { Ephemeris } from './bodies';
import { acceleration } from './gravity';
import { Vec3, distance, length } from './math/vec3';

/** Dynamic state of the spacecraft in the barycentric inertial frame. */
export interface ShipState {
  readonly r: Vec3; // km
  readonly v: Vec3; // km/s
}

/**
 * Non-gravitational forces: thrust and drag. Takes the instant, the state and the
 * propellant of each tank (kg) and returns the acceleration (km/s²) and the flow of
 * each tank (kg/s, negative). The integrator carries the propellant as state.
 */
export type PowerModel = (
  t: number,
  r: Vec3,
  v: Vec3,
  prop: readonly number[],
) => { readonly a: Vec3; readonly dprop: readonly number[] };

export interface StepperOptions {
  /** Relative tolerance per step (position relative to the nearest body). */
  rtol?: number;
  /** Maximum step in seconds. */
  maxStep?: number;
  /** Powered flight or flight with drag. Without this, only gravity acts. */
  power?: PowerModel;
}

export interface StepResult {
  readonly state: ShipState;
  /** Propellant per tank at the end of the step (same as the input if there is no `power`). */
  readonly prop: readonly number[];
  readonly t: number;
  /** Suggested step to continue. */
  readonly hNext: number;
}

/**
 * Default tolerance. It is strict on purpose: the free return is very sensitive
 * and the result cannot depend on how frames split the steps.
 */
export const DEFAULT_RTOL = 1e-11;

const NO_PROP: readonly number[] = [];

// Dormand–Prince 5(4) coefficients
const C2 = 1 / 5, C3 = 3 / 10, C4 = 4 / 5, C5 = 8 / 9;
const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
const B1 = 35 / 384, B3 = 500 / 1113, B4 = 125 / 192, B5 = -2187 / 6784, B6 = 11 / 84;
const E1 = 71 / 57600, E3 = -71 / 16695, E4 = 71 / 1920, E5 = -17253 / 339200, E6 = 22 / 525, E7 = -1 / 40;

/** Derivative of the state vector [r, v, propellant…]. */
function deriv(t: number, y: number[], eph: Ephemeris, power: PowerModel | undefined): number[] {
  const r = { x: y[0], y: y[1], z: y[2] };
  const g = acceleration(r, t, eph);
  const out = new Array<number>(y.length);
  out[0] = y[3];
  out[1] = y[4];
  out[2] = y[5];
  if (!power) {
    out[3] = g.x;
    out[4] = g.y;
    out[5] = g.z;
    return out;
  }
  const p = power(t, r, { x: y[3], y: y[4], z: y[5] }, y.slice(6));
  out[3] = g.x + p.a.x;
  out[4] = g.y + p.a.y;
  out[5] = g.z + p.a.z;
  for (let i = 6; i < y.length; i++) out[i] = p.dprop[i - 6] ?? 0;
  return out;
}

/** Initial step: a fraction of the local dynamical time. */
export function initialStep(state: ShipState, t: number, eph: Ephemeris): number {
  const d = Math.min(distance(state.r, eph.earth(t).r), distance(state.r, eph.moon(t).r));
  return Math.max(1e-3, (1e-3 * d) / Math.max(length(state.v), 1e-3));
}

/**
 * Takes one accepted Dormand–Prince 5(4) step with error control.
 * Tries with `hTry` (clipped so as not to pass `tMax`) and shrinks it until accepted.
 * Error control looks at position and velocity; the propellant goes along.
 */
export function dp45Step(
  state: ShipState,
  t: number,
  hTry: number,
  tMax: number,
  eph: Ephemeris,
  opts: StepperOptions = {},
  prop: readonly number[] = NO_PROP,
): StepResult {
  const rtol = opts.rtol ?? DEFAULT_RTOL;
  const maxStep = opts.maxStep ?? Infinity;
  const power = opts.power;
  const y: number[] = [state.r.x, state.r.y, state.r.z, state.v.x, state.v.y, state.v.z, ...(power ? prop : NO_PROP)];
  const n = y.length;
  const dNear = Math.min(distance(state.r, eph.earth(t).r), distance(state.r, eph.moon(t).r));
  const scR = rtol * dNear;
  const scV = rtol * Math.max(length(state.v), 1e-3);
  const k1 = deriv(t, y, eph, power);
  let h = Math.min(hTry, maxStep);
  const yt = new Array<number>(n);
  for (let attempt = 0; attempt < 80; attempt++) {
    const remaining = tMax - t;
    const truncated = h >= remaining;
    const hs = truncated ? remaining : h;
    for (let i = 0; i < n; i++) yt[i] = y[i] + hs * A21 * k1[i];
    const k2 = deriv(t + C2 * hs, yt, eph, power);
    for (let i = 0; i < n; i++) yt[i] = y[i] + hs * (A31 * k1[i] + A32 * k2[i]);
    const k3 = deriv(t + C3 * hs, yt, eph, power);
    for (let i = 0; i < n; i++) yt[i] = y[i] + hs * (A41 * k1[i] + A42 * k2[i] + A43 * k3[i]);
    const k4 = deriv(t + C4 * hs, yt, eph, power);
    for (let i = 0; i < n; i++) yt[i] = y[i] + hs * (A51 * k1[i] + A52 * k2[i] + A53 * k3[i] + A54 * k4[i]);
    const k5 = deriv(t + C5 * hs, yt, eph, power);
    for (let i = 0; i < n; i++)
      yt[i] = y[i] + hs * (A61 * k1[i] + A62 * k2[i] + A63 * k3[i] + A64 * k4[i] + A65 * k5[i]);
    const k6 = deriv(t + hs, yt, eph, power);
    const yn = new Array<number>(n);
    for (let i = 0; i < n; i++)
      yn[i] = y[i] + hs * (B1 * k1[i] + B3 * k3[i] + B4 * k4[i] + B5 * k5[i] + B6 * k6[i]);
    const k7 = deriv(t + hs, yn, eph, power);
    let er = 0;
    let ev = 0;
    for (let i = 0; i < 6; i++) {
      const e = hs * (E1 * k1[i] + E3 * k3[i] + E4 * k4[i] + E5 * k5[i] + E6 * k6[i] + E7 * k7[i]);
      if (i < 3) er += e * e;
      else ev += e * e;
    }
    const err = Math.max(Math.sqrt(er) / scR, Math.sqrt(ev) / scV);
    const factor = err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * Math.pow(err, -0.2)));
    // With already tiny steps it is accepted anyway: happens at discontinuities (shutdown on an empty tank).
    if (err <= 1 || hs < 1e-6) {
      // If the step was clipped to land exactly on tMax, the suggestion keeps the natural step.
      const hNext = Math.min(maxStep, truncated ? Math.max(h, hs * factor) : hs * factor);
      return {
        state: { r: { x: yn[0], y: yn[1], z: yn[2] }, v: { x: yn[3], y: yn[4], z: yn[5] } },
        prop: power ? yn.slice(6).map((p) => Math.max(0, p)) : prop,
        t: truncated ? tMax : t + hs,
        hNext: Math.max(hNext, 1e-6),
      };
    }
    h = hs * factor;
  }
  throw new Error(`Integrador: el paso no converge en t=${t}`);
}

export interface IntegrateOptions extends StepperOptions {
  hInit?: number;
  maxSteps?: number;
  /** Initial propellant per tank (only with `power`). */
  prop?: readonly number[];
}

export interface IntegrateResult extends StepResult {
  readonly steps: number;
  /** false if it stopped on `maxSteps` before reaching t1. */
  readonly complete: boolean;
}

/** Integrates from t0 to t1 (t1 ≥ t0) without event detection. */
export function integrate(
  state: ShipState,
  t0: number,
  t1: number,
  eph: Ephemeris,
  opts: IntegrateOptions = {},
): IntegrateResult {
  let s = state;
  let prop = opts.prop ?? NO_PROP;
  let t = t0;
  let h = opts.hInit ?? initialStep(state, t0, eph);
  let steps = 0;
  const maxSteps = opts.maxSteps ?? Infinity;
  while (t < t1 && steps < maxSteps) {
    const res = dp45Step(s, t, h, t1, eph, opts, prop);
    s = res.state;
    prop = res.prop;
    t = res.t;
    h = res.hNext;
    steps++;
  }
  return { state: s, prop, t, hNext: h, steps, complete: t >= t1 };
}
