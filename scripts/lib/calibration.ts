import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { advance } from '../../src/sim/advance';
import {
  HEO_CHECKOUT_DURATION,
  INSERTION_ALTITUDE,
  INSERTION_SPEED_REL,
  MECO_ALTITUDE,
  MET_E4_PERIGEE_RAISE,
  MET_E5_APOGEE_RAISE,
  TLI_HALF_BURN,
} from '../../src/sim/constants';
import { ASCENT_SEQUENCE, AscentParams } from '../../src/sim/mission/ascent';
import { BurnParams, MissionParams } from '../../src/sim/mission/params';
import { SimState, altitudeOf, createInitialState } from '../../src/sim/state';
import { dvAvailable } from '../../src/sim/propulsion';
import { ENGINES, G0, MASS, burnDuration } from '../../src/sim/vehicle';

export const PARAMS_PATH = fileURLToPath(new URL('../../src/sim/mission/params.json', import.meta.url));

/** Sigue volando un estado hasta `until` (MET) o el final de la misión. */
export function flyFrom(state: SimState, until = Infinity): SimState {
  let s: SimState = state.clock.running ? state : { ...state, clock: { running: true, warp: 1 } };
  const limit = Math.min(until, 40 * 86400);
  while (s.t < limit && !s.outcome) {
    const next = advance(s, limit - s.t, Infinity);
    if (next === s) break;
    s = next;
  }
  return s;
}

/** Vuela la misión desde la plataforma, sin interfaz y con tripulación automática. */
export const fly = (params: MissionParams, until = Infinity): SimState =>
  flyFrom(createInitialState(params, { headless: true, autoCrew: true }), until);

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

const noBurn = (q: MissionParams, ids: BurnId[]): MissionParams =>
  ids.reduce((acc, id) => withBurn(acc, id, { prograde: 0 }), q);

/** Bisección de f en [lo, hi] con f(lo) < 0 < f(hi). */
export function bisect(f: (x: number) => number, lo: number, hi: number, xtol: number): number {
  const flo = f(lo);
  const fhi = f(hi);
  if (!(flo < 0 && fhi > 0)) throw new Error(`bisect: sin cambio de signo en [${lo}, ${hi}]: f = ${flo}, ${fhi}`);
  while (hi - lo > xtol) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Resuelve F(x) = 0 en 3 dimensiones por Newton amortiguado con diferencias finitas. */
export function newton3(
  f: (x: number[]) => number[],
  x0: number[],
  steps: number[],
  maxMove: number[],
  tol: number[],
  log: (msg: string) => void = () => undefined,
): number[] {
  let x = [...x0];
  for (let it = 0; it < 40; it++) {
    const fx = f(x);
    log(`    it ${it}: x = [${x.map((v) => v.toPrecision(7)).join(', ')}] → F = [${fx.map((v) => v.toFixed(4)).join(', ')}]`);
    if (fx.every((v, i) => Math.abs(v) < tol[i])) return x;
    // Jacobiano por columnas.
    const J = [0, 1, 2].map(() => [0, 0, 0]);
    for (let j = 0; j < 3; j++) {
      const xp = [...x];
      xp[j] += steps[j];
      const fp = f(xp);
      for (let i = 0; i < 3; i++) J[i][j] = (fp[i] - fx[i]) / steps[j];
    }
    // Regla de Cramer.
    const det = (m: number[][]): number =>
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(J);
    if (!Number.isFinite(D) || D === 0) throw new Error('newton3: jacobiano singular');
    const dx = [0, 1, 2].map((j) => {
      const M = J.map((row, i) => row.map((v, c) => (c === j ? -fx[i] : v)));
      return det(M) / D;
    });
    const k = Math.min(1, ...dx.map((v, j) => maxMove[j] / Math.max(1e-300, Math.abs(v))));
    x = x.map((v, j) => v + k * dx[j]);
  }
  throw new Error('newton3: no converge');
}

const firstApsis = (s: SimState, type: 'periapsis' | 'apoapsis', after: number): number | null =>
  s.record.apsides.find((a) => a.type === type && a.t > after)?.t ?? null;

/**
 * Ajusta el guiado del ascenso para que el cohete, con sus motores y masas reales,
 * reproduzca los tres datos publicados del final del ascenso:
 * - altitud en MECO,
 * - altitud en la separación de la etapa central, y
 * - velocidad (relativa a la Tierra) en la separación.
 * Las tres incógnitas son el cabeceo inicial, el ritmo de la tangente lineal y el
 * límite de aceleración de los RS‑25.
 */
export function tuneAscent(base: MissionParams, log: (msg: string) => void = () => undefined): MissionParams {
  const S = ASCENT_SEQUENCE;
  const withAscent = (a: AscentParams): MissionParams => ({ ...base, ascent: a });
  const miss = ([kickDeg, tanRate, gLimit]: number[]): number[] => {
    const start = createInitialState(withAscent({ kickDeg, tanRate, gLimit }), { headless: true, autoCrew: true });
    const meco = flyFrom(start, S.meco);
    if (meco.outcome) return [-1e3, -1e3, -1e4];
    const sep = flyFrom(meco, S.coreSeparation);
    if (sep.outcome || !sep.record.insertion) return [-1e3, -1e3, -10];
    return [
      altitudeOf(meco) - MECO_ALTITUDE,
      altitudeOf(sep) - INSERTION_ALTITUDE,
      sep.record.insertion.speedRel - INSERTION_SPEED_REL,
    ];
  };
  const a0 = base.ascent;
  const x = newton3(miss, [a0.kickDeg, a0.tanRate, a0.gLimit], [1e-4, 1e-8, 1e-4], [0.15, 2e-4, 1.5], [1e-5, 1e-5, 1e-7], log);
  return { ...base, ascent: { kickDeg: x[0], tanRate: x[1], gLimit: x[2] } };
}

/**
 * Calibra la fase en órbita terrestre. Los instantes de ignición de E4 y E5 son los
 * publicados; lo que se ajusta es cuánto empuja cada uno:
 * 1. Guiado del ascenso (ver `tuneAscent`).
 * 2. Δv de E4: sube el perigeo lo justo para que el encendido de E5 quede centrado
 *    en el perigeo (así se pierde lo mínimo por gravedad).
 * 3. Δv de E5 y TIG de E8 (en el apogeo): la órbita alta vuelve al perigeo 23,5 h
 *    después de E5, y el TLI se enciende centrado en ese perigeo.
 */
export function calibrate(base: MissionParams, log: (msg: string) => void = () => undefined): MissionParams {
  let p = tuneAscent(base, log);
  const a = p.ascent;
  log(`Ascenso: cabeceo ${a.kickDeg.toFixed(4)}°, tangente ${a.tanRate.toExponential(4)} 1/s, límite ${(a.gLimit / 9.80665).toFixed(3)} g`);

  // 2 · E4
  // Instante medio del encendido de E5: depende de la masa que deja E4 y del Δv de E5
  // (se usa el de la pasada anterior; el script principal repite hasta que no cambia).
  const stackMass = MASS.icpsDry + MASS.icpsProp + MASS.cm + MASS.smDry + MASS.esmProp;
  const exhaust = (G0 * ENGINES.RL10.ispVac) / 1000;
  const e5Center = (dvE4: number): number =>
    MET_E5_APOGEE_RAISE +
    0.5 * burnDuration(ENGINES.RL10, stackMass * Math.exp(-dvE4 / exhaust), Math.max(1.5, p.burns.E5.dv.prograde));
  const tPeriAfterE4 = (dv: number): number => {
    const s = fly(noBurn(withBurn(p, 'E4', { met: MET_E4_PERIGEE_RAISE, prograde: dv }), ['E5']), MET_E5_APOGEE_RAISE + 4000);
    const t = firstApsis(s, 'periapsis', MET_E4_PERIGEE_RAISE + 600);
    return t === null ? -1e6 : t - e5Center(dv);
  };
  let hi = 0.01;
  while (tPeriAfterE4(hi) < 0) {
    hi += 0.01;
    if (hi > 1.5) throw new Error('E4: no se encontró cota superior');
  }
  const dvE4 = bisect(tPeriAfterE4, hi - 0.01, hi, 1e-12);
  if (Math.abs(tPeriAfterE4(dvE4)) > 0.01) throw new Error('E4: la raíz cae en una discontinuidad');
  p = withBurn(p, 'E4', { met: MET_E4_PERIGEE_RAISE, prograde: dvE4 });
  log(`E4: Δv = ${(dvE4 * 1000).toFixed(3)} m/s`);

  // 3 · E5 y TIG de E8
  const tliCenter = MET_E5_APOGEE_RAISE + HEO_CHECKOUT_DURATION;
  const tliMet = tliCenter - TLI_HALF_BURN;
  const e8MetFor = (dv: number): number | null => {
    const q = noBurn(withBurn(p, 'E5', { met: MET_E5_APOGEE_RAISE, prograde: dv }), ['E8', 'E9']);
    return firstApsis(fly(q, MET_E5_APOGEE_RAISE + 20 * 3600), 'apoapsis', MET_E5_APOGEE_RAISE + 3000);
  };
  // Cota superior: lo que le queda al ICPS después de E4.
  const atE5 = fly(noBurn(p, ['E5']), MET_E5_APOGEE_RAISE);
  const e5Max = 0.999 * dvAvailable('ICPS', atE5.propulsion, atE5.vehicle);
  const dvE5 = bisect(
    (dv) => {
      const e8Met = e8MetFor(dv);
      if (e8Met === null) return 1e6;
      const q = noBurn(withBurn(withBurn(p, 'E5', { met: MET_E5_APOGEE_RAISE, prograde: dv }), 'E8', { met: e8Met }), ['E9']);
      const t = firstApsis(fly(q, e8Met + 24 * 3600), 'periapsis', e8Met + 600);
      return t === null ? 1e6 : t - tliCenter;
    },
    1.5,
    e5Max,
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
