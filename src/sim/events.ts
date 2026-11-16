import { Ephemeris } from './bodies';
import { losClearance } from './comms';
import { EI_ALTITUDE, MOON_SOI, NSN_MAX_ALTITUDE, R_EARTH, R_MOON } from './constants';
import { ShipState, StepperOptions, dp45Step, initialStep, integrate } from './integrator';
import { dot, length, sub } from './math/vec3';

export type SimEventType =
  | 'periapsis'
  | 'apoapsis'
  | 'perilune'
  | 'soi-enter'
  | 'soi-exit'
  | 'ei'
  | 'moon-impact'
  | 'surface'
  | 'los'
  | 'aos'
  | 'net-dsn'
  | 'net-nsn';

export interface SimEvent {
  readonly type: SimEventType;
  readonly t: number;
  readonly state: ShipState;
  /** Propellant per tank at that instant (empty if the segment was unpowered). */
  readonly prop: readonly number[];
}

const TERMINAL: ReadonlySet<SimEventType> = new Set<SimEventType>(['ei', 'moon-impact', 'surface']);
export const isTerminal = (type: SimEventType): boolean => TERMINAL.has(type);

type G = (s: ShipState, t: number, eph: Ephemeris) => number;

interface Monitor {
  readonly g: G;
  /** Event when crossing from negative to positive. */
  readonly rising?: SimEventType;
  /** Event when crossing from positive to negative. */
  readonly falling?: SimEventType;
}

const moonDist: G = (s, t, eph) => length(sub(s.r, eph.moon(t).r));
const earthDist: G = (s, t, eph) => length(sub(s.r, eph.earth(t).r));

const MONITORS: readonly Monitor[] = [
  {
    // Radial velocity relative to Earth: apsides.
    g: (s, t, eph) => {
      const b = eph.earth(t);
      return dot(sub(s.r, b.r), sub(s.v, b.v));
    },
    rising: 'periapsis',
    falling: 'apoapsis',
  },
  {
    // Radial velocity relative to the Moon: closest approach.
    g: (s, t, eph) => {
      const b = eph.moon(t);
      return dot(sub(s.r, b.r), sub(s.v, b.v));
    },
    rising: 'perilune',
  },
  { g: (s, t, eph) => moonDist(s, t, eph) - MOON_SOI, rising: 'soi-exit', falling: 'soi-enter' },
  { g: (s, t, eph) => earthDist(s, t, eph) - (R_EARTH + EI_ALTITUDE), falling: 'ei' },
  { g: (s, t, eph) => moonDist(s, t, eph) - R_MOON, falling: 'moon-impact' },
  // Impact with Earth's surface (only reached without having crossed EI going down: failed ascent, falling stages).
  { g: (s, t, eph) => earthDist(s, t, eph) - R_EARTH, falling: 'surface' },
  { g: (s, t, eph) => losClearance(s.r, eph.earth(t).r, eph.moon(t).r), rising: 'aos', falling: 'los' },
  {
    g: (s, t, eph) => earthDist(s, t, eph) - R_EARTH - NSN_MAX_ALTITUDE,
    rising: 'net-dsn',
    falling: 'net-nsn',
  },
];

/** Refines the instant of g's zero crossing between tA and tB (regula falsi, Illinois variant). */
function refine(
  g: G,
  sA: ShipState,
  tA: number,
  gA: number,
  tB: number,
  gB: number,
  eph: Ephemeris,
  opts: StepperOptions,
  propA: readonly number[],
): { t: number; state: ShipState; prop: readonly number[] } {
  const at = (tx: number): { state: ShipState; prop: readonly number[] } =>
    tx <= tA ? { state: sA, prop: propA } : integrate(sA, tA, tx, eph, { ...opts, hInit: tx - tA, prop: propA });
  let a = tA;
  let fa = gA;
  let b = tB;
  let fb = gB;
  let tx = tB;
  let px = at(tB);
  let sx = px.state;
  let side = 0;
  for (let i = 0; i < 60 && b - a > 1e-7; i++) {
    tx = (a * fb - b * fa) / (fb - fa);
    if (!(tx > a && tx < b)) tx = 0.5 * (a + b);
    px = at(tx);
    sx = px.state;
    const fx = g(sx, tx, eph);
    if (fx === 0) break;
    if (fx > 0 === fa > 0) {
      a = tx;
      fa = fx;
      if (side === -1) fb /= 2;
      side = -1;
    } else {
      b = tx;
      fb = fx;
      if (side === 1) fa /= 2;
      side = 1;
    }
  }
  return { t: tx, state: sx, prop: px.prop };
}

export interface EventIntegrateOptions extends StepperOptions {
  hInit?: number;
  maxSteps?: number;
  /** Called on every accepted step (to record the trail). */
  onSample?: (t: number, state: ShipState) => void;
  /** Initial propellant per tank (only with `power`). */
  prop?: readonly number[];
}

export interface EventIntegrateResult {
  readonly state: ShipState;
  readonly prop: readonly number[];
  readonly t: number;
  readonly hNext: number;
  readonly steps: number;
  /** Detected events, in chronological order. */
  readonly events: readonly SimEvent[];
  /** Terminal event (EI, lunar impact or surface impact): the integration stopped there. */
  readonly terminal: SimEvent | null;
  /** true if it reached t1; false if it stopped on a terminal event or on `maxSteps`. */
  readonly complete: boolean;
}

/**
 * Integrates from t0 to t1 detecting events by sign changes of monitor functions.
 * If a terminal event occurs, returns the state exactly at that instant.
 */
export function integrateWithEvents(
  state: ShipState,
  t0: number,
  t1: number,
  eph: Ephemeris,
  opts: EventIntegrateOptions = {},
): EventIntegrateResult {
  let s = state;
  let prop: readonly number[] = opts.prop ?? [];
  let t = t0;
  let h = opts.hInit ?? initialStep(state, t0, eph);
  let steps = 0;
  const maxSteps = opts.maxSteps ?? Infinity;
  const events: SimEvent[] = [];
  let gPrev = MONITORS.map((m) => m.g(s, t, eph));
  while (t < t1 && steps < maxSteps) {
    const res = dp45Step(s, t, h, t1, eph, opts, prop);
    steps++;
    const gNew = MONITORS.map((m) => m.g(res.state, res.t, eph));
    const found: SimEvent[] = [];
    for (let i = 0; i < MONITORS.length; i++) {
      const g0 = gPrev[i];
      const g1 = gNew[i];
      let type: SimEventType | undefined;
      if (g0 < 0 && g1 >= 0) type = MONITORS[i].rising;
      else if (g0 >= 0 && g1 < 0) type = MONITORS[i].falling;
      if (!type) continue;
      const hit = refine(MONITORS[i].g, s, t, g0, res.t, g1, eph, opts, prop);
      // Closest approach to the Moon only counts inside its sphere of influence.
      if (type === 'perilune' && moonDist(hit.state, hit.t, eph) > MOON_SOI) continue;
      found.push({ type, t: hit.t, state: hit.state, prop: hit.prop });
    }
    found.sort((p, q) => p.t - q.t);
    const term = found.find((e) => isTerminal(e.type));
    if (term) {
      for (const e of found) if (e.t <= term.t) events.push(e);
      opts.onSample?.(term.t, term.state);
      return { state: term.state, prop: term.prop, t: term.t, hNext: res.hNext, steps, events, terminal: term, complete: false };
    }
    events.push(...found);
    s = res.state;
    prop = res.prop;
    t = res.t;
    h = res.hNext;
    gPrev = gNew;
    opts.onSample?.(t, s);
  }
  return { state: s, prop, t, hNext: h, steps, events, terminal: null, complete: t >= t1 };
}
