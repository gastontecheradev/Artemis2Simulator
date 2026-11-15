import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { advance } from '../../src/sim/advance';
import {
  E7_BURN_DURATION,
  HEO_ORBIT,
  INSERTION_ALTITUDE,
  INSERTION_SPEED_REL,
  MECO_ALTITUDE,
  MET_E4_PERIGEE_RAISE,
  MET_E5_APOGEE_RAISE,
  MET_E7_DEPARTURE,
  POST_ARB_ORBIT,
  POST_PRM_ORBIT,
  R_EARTH,
  TLI_HALF_BURN,
} from '../../src/sim/constants';
import { ASCENT_SEQUENCE, AscentParams } from '../../src/sim/mission/ascent';
import { BurnParams, MissionParams } from '../../src/sim/mission/params';
import { OrbitElements, earthElements } from '../../src/sim/orbit';
import { SimState, altitudeOf, createInitialState, ephemerisOf } from '../../src/sim/state';
import { ENGINES, burnDuration, dvForDuration, totalMass } from '../../src/sim/vehicle';

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

export function withBurn(p: MissionParams, id: BurnId, patch: { met?: number; prograde?: number; radial?: number; hold?: boolean }): MissionParams {
  const b: BurnParams = p.burns[id];
  return {
    ...p,
    burns: {
      ...p.burns,
      [id]: {
        ...b,
        hold: patch.hold ?? b.hold,
        met: patch.met ?? b.met,
        dv: { ...b.dv, prograde: patch.prograde ?? b.dv.prograde, radial: patch.radial ?? b.dv.radial },
      },
    },
  };
}

const noBurn = (q: MissionParams, ids: BurnId[]): MissionParams =>
  ids.reduce((acc, id) => withBurn(acc, id, { prograde: 0, radial: 0 }), q);

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

/** Resuelve F(x) = 0 en 2 dimensiones por Newton amortiguado con diferencias finitas. */
export function newton2(
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
    const J = [
      [0, 0],
      [0, 0],
    ];
    for (let j = 0; j < 2; j++) {
      const xp = [...x];
      xp[j] += steps[j];
      const fp = f(xp);
      for (let i = 0; i < 2; i++) J[i][j] = (fp[i] - fx[i]) / steps[j];
    }
    const D = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (!Number.isFinite(D) || D === 0) throw new Error('newton2: jacobiano singular');
    const dx = [-(fx[0] * J[1][1] - fx[1] * J[0][1]) / D, -(J[0][0] * fx[1] - J[1][0] * fx[0]) / D];
    const k = Math.min(1, ...dx.map((v, j) => maxMove[j] / Math.max(1e-300, Math.abs(v))));
    x = x.map((v, j) => v + k * dx[j]);
  }
  throw new Error('newton2: no converge');
}

const firstApsis = (s: SimState, type: 'periapsis' | 'apoapsis', after: number): number | null =>
  s.record.apsides.find((a) => a.type === type && a.t > after)?.t ?? null;

const elementsOf = (s: SimState): OrbitElements => earthElements(s.ship, s.t, ephemerisOf(s));

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
 * Calibra la fase en órbita terrestre contra las órbitas publicadas en la guía del SLS
 * para Artemis II. Los instantes de ignición de E4, E5 y E7 son los publicados; lo que
 * se ajusta es cuánto empuja cada encendido:
 * 1. Guiado del ascenso (ver `tuneAscent`).
 * 2. Δv de E4 (prograde): deja el perigeo publicado (100 NM).
 * 3. Δv de E5 (prograde y radial): deja la órbita publicada de 0 × 40.000 NM.
 * 4. Δv de E7: dos minutos de auxiliares (duración publicada).
 * 5. TIG y Δv de E8: en el apogeo, sube el perigeo al publicado (100 NM).
 * 6. TIG de E9: centrado en el perigeo siguiente.
 */
export function calibrate(base: MissionParams, log: (msg: string) => void = () => undefined): MissionParams {
  let p = tuneAscent(base, log);
  const a = p.ascent;
  log(`Ascenso: cabeceo ${a.kickDeg.toFixed(4)}°, tangente ${a.tanRate.toExponential(4)} 1/s, límite ${(a.gLimit / 9.80665).toFixed(3)} g`);

  // 2 · E4: perigeo publicado.
  const afterE4 = (dv: number): OrbitElements =>
    elementsOf(fly(noBurn(withBurn(p, 'E4', { met: MET_E4_PERIGEE_RAISE, prograde: dv }), ['E5', 'E7', 'E8', 'E9']), MET_E4_PERIGEE_RAISE + 400));
  const dvE4 = bisect((dv) => afterE4(dv).rp - R_EARTH - POST_PRM_ORBIT.perigee, 0.005, 0.4, 1e-12);
  p = withBurn(p, 'E4', { met: MET_E4_PERIGEE_RAISE, prograde: dvE4 });
  const e4 = afterE4(dvE4);
  log(`E4: Δv = ${(dvE4 * 1000).toFixed(3)} m/s → ${(e4.rp - R_EARTH).toFixed(1)} × ${(e4.ra - R_EARTH).toFixed(0)} km`);

  // 3 · E7: dos minutos de auxiliares. Su Δv solo depende de la masa de Orion, así que va antes que E5.
  const atE7 = fly(noBurn(p, ['E7', 'E8', 'E9']), MET_E7_DEPARTURE);
  const dvE7 = dvForDuration(ENGINES.AUX, totalMass(atE7.vehicle, atE7.propulsion.prop), E7_BURN_DURATION);
  p = withBurn(p, 'E7', { met: MET_E7_DEPARTURE, prograde: dvE7 });
  log(`E7: Δv = ${(dvE7 * 1000).toFixed(3)} m/s en ${E7_BURN_DURATION} s`);

  // 4 · E5: perigeo publicado al terminar el encendido y apogeo publicado después del
  // encendido de salida de Orion (E7), con actitud inercial fija (prograde + radial en la ignición).
  const afterE5 = ([prograde, radial]: number[]): { rp: number; ra: number } => {
    const q = noBurn(withBurn(p, 'E5', { met: MET_E5_APOGEE_RAISE, prograde, radial, hold: true }), ['E8', 'E9']);
    const s5 = fly(q, MET_E5_APOGEE_RAISE + 1900);
    if (s5.burn || s5.outcome) return { rp: NaN, ra: NaN };
    const s7 = flyFrom(s5, MET_E7_DEPARTURE + E7_BURN_DURATION + 60);
    return { rp: elementsOf(s5).rp, ra: elementsOf(s7).ra };
  };
  const x5 = newton2(
    (x) => {
      const el = afterE5(x);
      return [el.rp - R_EARTH - POST_ARB_ORBIT.perigee, el.ra - R_EARTH - POST_ARB_ORBIT.apogee];
    },
    [Math.max(1.5, p.burns.E5.dv.prograde), p.burns.E5.dv.radial],
    [1e-6, 1e-6],
    [0.1, 0.1],
    [1e-3, 1e-2],
    log,
  );
  p = withBurn(p, 'E5', { met: MET_E5_APOGEE_RAISE, prograde: x5[0], radial: x5[1], hold: true });
  const e5 = afterE5(x5);
  log(`E5: Δv = ${(x5[0] * 1000).toFixed(3)} m/s prograde, ${(x5[1] * 1000).toFixed(3)} m/s radial → ${(e5.rp - R_EARTH).toFixed(1)} km de perigeo; apogeo tras E7 ${(e5.ra - R_EARTH).toFixed(0)} km`);

  // 5 · E8 en el apogeo: perigeo publicado.
  const coast = fly(noBurn(p, ['E8', 'E9']), MET_E7_DEPARTURE + 20 * 3600);
  const tApo = firstApsis(coast, 'apoapsis', MET_E5_APOGEE_RAISE + 3000);
  if (tApo === null) throw new Error('E8: sin apogeo en la órbita alta');
  const atApo = flyFrom(fly(noBurn(p, ['E8', 'E9']), tApo - 60), tApo);
  const massApo = totalMass(atApo.vehicle, atApo.propulsion.prop);
  const afterE8 = (dv: number): OrbitElements => {
    const met = tApo - 0.5 * burnDuration(ENGINES.MAIN, massApo, dv);
    return elementsOf(fly(noBurn(withBurn(p, 'E8', { met, prograde: dv }), ['E9']), met + 600));
  };
  const dvE8 = bisect((dv) => afterE8(dv).rp - R_EARTH - HEO_ORBIT.perigee, 0.0005, 0.1, 1e-12);
  const e8Met = tApo - 0.5 * burnDuration(ENGINES.MAIN, massApo, dvE8);
  p = withBurn(p, 'E8', { met: e8Met, prograde: dvE8 });
  const e8 = afterE8(dvE8);
  log(`E8: Δv = ${(dvE8 * 1000).toFixed(3)} m/s, TIG ${e8Met.toFixed(1)} s → ${(e8.rp - R_EARTH).toFixed(1)} × ${(e8.ra - R_EARTH).toFixed(0)} km`);

  // 6 · E9 centrado en el perigeo siguiente.
  const tPeri = firstApsis(fly(noBurn(p, ['E9']), e8Met + 30 * 3600), 'periapsis', e8Met + 600);
  if (tPeri === null) throw new Error('E9: sin perigeo después de E8');
  const tliMet = tPeri - TLI_HALF_BURN;
  p = withBurn(p, 'E9', { met: tliMet });
  log(`TLI TIG = ${tliMet.toFixed(1)} s (perigeo en ${tPeri.toFixed(1)} s)`);
  return p;
}

export function saveParams(p: MissionParams): void {
  writeFileSync(PARAMS_PATH, `${JSON.stringify(p, null, 2)}\n`);
}
