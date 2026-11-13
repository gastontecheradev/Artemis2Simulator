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
  | 'los'
  | 'aos'
  | 'net-dsn'
  | 'net-nsn';

export interface SimEvent {
  readonly type: SimEventType;
  readonly t: number;
  readonly state: ShipState;
}

const TERMINAL: ReadonlySet<SimEventType> = new Set<SimEventType>(['ei', 'moon-impact']);
export const isTerminal = (type: SimEventType): boolean => TERMINAL.has(type);

type G = (s: ShipState, t: number, eph: Ephemeris) => number;

interface Monitor {
  readonly g: G;
  /** Evento al cruzar de negativo a positivo. */
  readonly rising?: SimEventType;
  /** Evento al cruzar de positivo a negativo. */
  readonly falling?: SimEventType;
}

const moonDist: G = (s, t, eph) => length(sub(s.r, eph.moon(t).r));
const earthDist: G = (s, t, eph) => length(sub(s.r, eph.earth(t).r));

const MONITORS: readonly Monitor[] = [
  {
    // Velocidad radial respecto de la Tierra: ápsides.
    g: (s, t, eph) => {
      const b = eph.earth(t);
      return dot(sub(s.r, b.r), sub(s.v, b.v));
    },
    rising: 'periapsis',
    falling: 'apoapsis',
  },
  {
    // Velocidad radial respecto de la Luna: máximo acercamiento.
    g: (s, t, eph) => {
      const b = eph.moon(t);
      return dot(sub(s.r, b.r), sub(s.v, b.v));
    },
    rising: 'perilune',
  },
  { g: (s, t, eph) => moonDist(s, t, eph) - MOON_SOI, rising: 'soi-exit', falling: 'soi-enter' },
  { g: (s, t, eph) => earthDist(s, t, eph) - (R_EARTH + EI_ALTITUDE), falling: 'ei' },
  { g: (s, t, eph) => moonDist(s, t, eph) - R_MOON, falling: 'moon-impact' },
  { g: (s, t, eph) => losClearance(s.r, eph.earth(t).r, eph.moon(t).r), rising: 'aos', falling: 'los' },
  {
    g: (s, t, eph) => earthDist(s, t, eph) - R_EARTH - NSN_MAX_ALTITUDE,
    rising: 'net-dsn',
    falling: 'net-nsn',
  },
];

/** Refina el instante del cruce por cero de g entre tA y tB (regula falsi, variante Illinois). */
function refine(
  g: G,
  sA: ShipState,
  tA: number,
  gA: number,
  tB: number,
  gB: number,
  eph: Ephemeris,
  opts: StepperOptions,
): { t: number; state: ShipState } {
  const at = (tx: number): ShipState =>
    tx <= tA ? sA : integrate(sA, tA, tx, eph, { ...opts, hInit: tx - tA }).state;
  let a = tA;
  let fa = gA;
  let b = tB;
  let fb = gB;
  let tx = tB;
  let sx = at(tB);
  let side = 0;
  for (let i = 0; i < 60 && b - a > 1e-7; i++) {
    tx = (a * fb - b * fa) / (fb - fa);
    if (!(tx > a && tx < b)) tx = 0.5 * (a + b);
    sx = at(tx);
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
  return { t: tx, state: sx };
}

export interface EventIntegrateOptions extends StepperOptions {
  hInit?: number;
  maxSteps?: number;
  /** Se llama en cada paso aceptado (para registrar el trazo). */
  onSample?: (t: number, state: ShipState) => void;
}

export interface EventIntegrateResult {
  readonly state: ShipState;
  readonly t: number;
  readonly hNext: number;
  readonly steps: number;
  /** Eventos detectados, en orden cronológico. */
  readonly events: readonly SimEvent[];
  /** Evento terminal (EI o impacto lunar): la integración se cortó ahí. */
  readonly terminal: SimEvent | null;
  /** true si llegó a t1; false si cortó por evento terminal o por `maxSteps`. */
  readonly complete: boolean;
}

/**
 * Integra de t0 a t1 detectando eventos por cambio de signo de funciones monitor.
 * Si ocurre un evento terminal, devuelve el estado exactamente en ese instante.
 */
export function integrateWithEvents(
  state: ShipState,
  t0: number,
  t1: number,
  eph: Ephemeris,
  opts: EventIntegrateOptions = {},
): EventIntegrateResult {
  let s = state;
  let t = t0;
  let h = opts.hInit ?? initialStep(state, t0, eph);
  let steps = 0;
  const maxSteps = opts.maxSteps ?? Infinity;
  const events: SimEvent[] = [];
  let gPrev = MONITORS.map((m) => m.g(s, t, eph));
  while (t < t1 && steps < maxSteps) {
    const res = dp45Step(s, t, h, t1, eph, opts);
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
      const hit = refine(MONITORS[i].g, s, t, g0, res.t, g1, eph, opts);
      // El máximo acercamiento a la Luna solo cuenta dentro de su esfera de influencia.
      if (type === 'perilune' && moonDist(hit.state, hit.t, eph) > MOON_SOI) continue;
      found.push({ type, t: hit.t, state: hit.state });
    }
    found.sort((p, q) => p.t - q.t);
    const term = found.find((e) => isTerminal(e.type));
    if (term) {
      for (const e of found) if (e.t <= term.t) events.push(e);
      opts.onSample?.(term.t, term.state);
      return { state: term.state, t: term.t, hNext: res.hNext, steps, events, terminal: term, complete: false };
    }
    events.push(...found);
    s = res.state;
    t = res.t;
    h = res.hNext;
    gPrev = gNew;
    opts.onSample?.(t, s);
  }
  return { state: s, t, hNext: h, steps, events, terminal: null, complete: t >= t1 };
}
