import { Ephemeris } from './bodies';
import { R_EARTH, R_MOON } from './constants';
import { SimEvent, integrateWithEvents } from './events';
import { ShipState } from './integrator';
import { Vec3, distance, length, sub } from './math/vec3';
import { earthElements } from './orbit';

export interface TrajectoryPoint {
  readonly t: number;
  readonly r: Vec3;
}

export interface EntryInterface {
  readonly t: number;
  /** Ángulo de trayectoria respecto de la Tierra (grados, negativo = descendiendo). */
  readonly fpaDeg: number;
  /** Velocidad respecto de la Tierra (km/s). */
  readonly speed: number;
}

export interface Perilune {
  readonly t: number;
  /** km sobre la superficie lunar */
  readonly altitude: number;
}

export interface Prediction {
  readonly t0: number;
  readonly tEnd: number;
  readonly points: readonly TrajectoryPoint[];
  readonly end: 'horizon' | 'ei' | 'moon-impact';
  readonly ei: EntryInterface | null;
  /** Máximo acercamiento a la Luna más cercano dentro de la predicción. */
  readonly perilune: Perilune | null;
  /** Primer periapsis terrestre de la predicción. */
  readonly periapsis: { readonly t: number; readonly altitude: number; readonly rp: number } | null;
  readonly events: readonly SimEvent[];
  readonly final: ShipState;
}

/**
 * Intervalo de muestreo del trazo: una fracción del tiempo dinámico local,
 * así hay más puntos cerca de los cuerpos y menos en crucero.
 */
export function sampleInterval(s: ShipState, t: number, eph: Ephemeris): number {
  const e = eph.earth(t);
  const m = eph.moon(t);
  const tauE = distance(s.r, e.r) / Math.max(length(sub(s.v, e.v)), 1e-3);
  const tauM = distance(s.r, m.r) / Math.max(length(sub(s.v, m.v)), 1e-3);
  return Math.max(1, 0.012 * Math.min(tauE, tauM));
}

export function entryInterfaceOf(ev: SimEvent, eph: Ephemeris): EntryInterface {
  const el = earthElements(ev.state, ev.t, eph);
  return { t: ev.t, fpaDeg: el.fpaDeg, speed: el.speed };
}

export const periluneOf = (ev: SimEvent, eph: Ephemeris): Perilune => ({
  t: ev.t,
  altitude: distance(ev.state.r, eph.moon(ev.t).r) - R_MOON,
});

/**
 * Propaga el estado `duration` segundos hacia adelante sin encendidos (trayectoria
 * predicha). Corta en la interfaz de entrada o en un impacto lunar.
 */
export function propagate(
  state: ShipState,
  t0: number,
  duration: number,
  eph: Ephemeris,
  opts: { maxStep?: number; rtol?: number } = {},
): Prediction {
  const points: TrajectoryPoint[] = [{ t: t0, r: state.r }];
  let lastT = t0;
  let lastState = state;
  const res = integrateWithEvents(state, t0, t0 + duration, eph, {
    maxStep: opts.maxStep,
    rtol: opts.rtol,
    onSample: (t, s) => {
      if (t - lastT >= sampleInterval(lastState, lastT, eph)) {
        points.push({ t, r: s.r });
        lastT = t;
        lastState = s;
      }
    },
  });
  if (lastT < res.t) points.push({ t: res.t, r: res.state.r });
  let perilune: Perilune | null = null;
  let periapsis: Prediction['periapsis'] = null;
  for (const ev of res.events) {
    if (ev.type === 'perilune') {
      const p = periluneOf(ev, eph);
      if (!perilune || p.altitude < perilune.altitude) perilune = p;
    } else if (ev.type === 'periapsis' && !periapsis) {
      const rp = distance(ev.state.r, eph.earth(ev.t).r);
      periapsis = { t: ev.t, altitude: rp - R_EARTH, rp };
    }
  }
  const term = res.terminal;
  return {
    t0,
    tEnd: res.t,
    points,
    end: term ? (term.type === 'ei' ? 'ei' : 'moon-impact') : 'horizon',
    ei: term && term.type === 'ei' ? entryInterfaceOf(term, eph) : null,
    perilune,
    periapsis,
    events: res.events,
    final: res.state,
  };
}
