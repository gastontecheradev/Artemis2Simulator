import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { advance } from '../../src/sim/advance';
import {
  HEO_CHECKOUT_DURATION,
  INSERTION_ALTITUDE,
  INSERTION_VERTICAL_SPEED,
  MET_CORE_SEPARATION,
  MET_E4_PERIGEE_RAISE,
  MET_E5_APOGEE_RAISE,
} from '../../src/sim/constants';
import { BurnParams, MissionParams } from '../../src/sim/mission/params';
import { SimState, createInitialState } from '../../src/sim/state';

export const PARAMS_PATH = fileURLToPath(new URL('../../src/sim/mission/params.json', import.meta.url));

/** Vuela la misión sin interfaz, con tripulación automática, hasta `until` (MET) o el final. */
export function fly(params: MissionParams, until = Infinity): SimState {
  let s = createInitialState(params, { headless: true, autoCrew: true });
  s = { ...s, clock: { running: true, warp: 1 } };
  const limit = Math.min(until, 40 * 86400);
  while (s.t < limit && !s.outcome) {
    const next = advance(s, limit - s.t, Infinity);
    if (next === s) break;
    s = next;
  }
  return s;
}

type BurnId = keyof MissionParams['burns'];

export function withBurn(p: MissionParams, id: BurnId, patch: { met?: number; prograde?: number }): MissionParams {
  const b: BurnParams = p.burns[id];
  return {
    ...p,
    burns: {
      ...p.burns,
      [id]: { ...b, met: patch.met ?? b.met, dv: { ...b.dv, prograde: patch.prograde ?? b.dv.prograde } },
    },
  };
}

/** Bisección de f en [lo, hi] con f(lo) < 0 < f(hi). */
export function bisect(f: (x: number) => number, lo: number, hi: number, xtol: number): number {
  let flo = f(lo);
  const fhi = f(hi);
  if (!(flo < 0 && fhi > 0)) throw new Error(`bisect: sin cambio de signo en [${lo}, ${hi}]: f = ${flo}, ${fhi}`);
  while (hi - lo > xtol) {
    const mid = 0.5 * (lo + hi);
    const fm = f(mid);
    if (fm < 0) {
      lo = mid;
      flo = fm;
    } else {
      hi = mid;
    }
  }
  return 0.5 * (lo + hi);
}

const firstApsis = (s: SimState, type: 'periapsis' | 'apoapsis', after: number): number | null =>
  s.record.apsides.find((a) => a.type === type && a.t > after)?.t ?? null;

/**
 * Calibra la fase en órbita terrestre contra los tiempos de 3.png:
 * 1. Velocidad de inserción: el apogeo de la órbita de inserción cae en el MET de E4.
 *    El ángulo de trayectoria sale de la velocidad vertical medida en 3.png.
 * 2. Δv de E4 (en el apogeo): el perigeo siguiente cae en el MET de E5.
 * 3. Δv de E5 (en el perigeo) y TIG de E8 (en el apogeo): el perigeo de la órbita alta,
 *    donde se hace el TLI, cae 23,5 h después de E5.
 */
export function calibrate(base: MissionParams, log: (msg: string) => void = () => undefined): MissionParams {
  let p = base;
  const noBurn = (q: MissionParams, ids: BurnId[]): MissionParams =>
    ids.reduce((acc, id) => withBurn(acc, id, { prograde: 0 }), q);

  // 1 · Inserción
  const withSpeed = (speed: number): MissionParams => ({
    ...p,
    insertion: {
      met: MET_CORE_SEPARATION,
      altitude: INSERTION_ALTITUDE,
      speed,
      fpaDeg: (Math.asin(INSERTION_VERTICAL_SPEED / speed) * 180) / Math.PI,
    },
  });
  const speed = bisect(
    (v) => {
      const s = fly(noBurn(withSpeed(v), ['E4', 'E5']), MET_E4_PERIGEE_RAISE + 3000);
      const tApo = firstApsis(s, 'apoapsis', MET_CORE_SEPARATION);
      return tApo === null ? 1e6 : tApo - MET_E4_PERIGEE_RAISE;
    },
    7.9,
    8.8,
    1e-12,
  );
  p = withSpeed(speed);
  log(`Inserción: v = ${speed.toFixed(6)} km/s, γ = ${p.insertion.fpaDeg.toFixed(4)}°`);

  // 2 · E4
  const tPeriAfterE4 = (dv: number): number => {
    const s = fly(noBurn(withBurn(p, 'E4', { met: MET_E4_PERIGEE_RAISE, prograde: dv }), ['E5']), MET_E5_APOGEE_RAISE + 4000);
    const t = firstApsis(s, 'periapsis', MET_E4_PERIGEE_RAISE + 60);
    return t === null ? -1e6 : t - MET_E5_APOGEE_RAISE;
  };
  let hi = 0.02;
  while (tPeriAfterE4(hi) < 0) {
    hi += 0.02;
    if (hi > 1.5) throw new Error('E4: no se encontró cota superior');
  }
  const dvE4 = bisect(tPeriAfterE4, hi - 0.02, hi, 1e-12);
  if (Math.abs(tPeriAfterE4(dvE4)) > 0.01) throw new Error('E4: la raíz cae en una discontinuidad');
  p = withBurn(p, 'E4', { met: MET_E4_PERIGEE_RAISE, prograde: dvE4 });
  log(`E4: Δv = ${(dvE4 * 1000).toFixed(3)} m/s`);

  // 3 · E5 y TIG de E8
  const tliMet = MET_E5_APOGEE_RAISE + HEO_CHECKOUT_DURATION;
  const e8MetFor = (dv: number): number | null => {
    const q = noBurn(withBurn(p, 'E5', { met: MET_E5_APOGEE_RAISE, prograde: dv }), ['E8', 'E9']);
    return firstApsis(fly(q, MET_E5_APOGEE_RAISE + 20 * 3600), 'apoapsis', MET_E5_APOGEE_RAISE + 600);
  };
  const dvE5 = bisect(
    (dv) => {
      const e8Met = e8MetFor(dv);
      if (e8Met === null) return 1e6;
      const q = noBurn(withBurn(withBurn(p, 'E5', { met: MET_E5_APOGEE_RAISE, prograde: dv }), 'E8', { met: e8Met }), ['E9']);
      const t = firstApsis(fly(q, e8Met + 24 * 3600), 'periapsis', e8Met + 600);
      return t === null ? 1e6 : t - tliMet;
    },
    1.5,
    3.0,
    1e-12,
  );
  const e8Met = e8MetFor(dvE5);
  if (e8Met === null) throw new Error('E5: sin apogeo en la órbita alta');
  p = withBurn(withBurn(p, 'E5', { met: MET_E5_APOGEE_RAISE, prograde: dvE5 }), 'E8', { met: e8Met });
  p = withBurn(p, 'E9', { met: tliMet });
  log(`E5: Δv = ${(dvE5 * 1000).toFixed(3)} m/s · E8 TIG = ${e8Met.toFixed(1)} s · TLI TIG = ${tliMet} s`);
  return p;
}

export function saveParams(p: MissionParams): void {
  writeFileSync(PARAMS_PATH, `${JSON.stringify(p, null, 2)}\n`);
}
