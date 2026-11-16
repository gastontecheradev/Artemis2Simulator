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
  PUBLISHED_MET,
  R_EARTH,
  TLI_HALF_BURN,
} from '../../src/sim/constants';
import { formatMet } from '../../src/sim/format';
import { ASCENT_SEQUENCE, AscentParams } from '../../src/sim/mission/ascent';
import { BurnParams, MissionParams } from '../../src/sim/mission/params';
import { OrbitElements, earthElements } from '../../src/sim/orbit';
import { SimState, altitudeOf, createInitialState, ephemerisOf } from '../../src/sim/state';
import { ENGINES, burnDuration, dvForDuration, totalMass } from '../../src/sim/vehicle';

export const PARAMS_PATH = fileURLToPath(new URL('../../src/sim/mission/params.json', import.meta.url));

/** Keeps flying a state until `until` (MET) or the end of the mission. */
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

/** Flies the mission from the pad, without UI and with the automatic crew. */
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

/** Bisection of f on [lo, hi] with f(lo) < 0 < f(hi). */
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

/** Solves F(x) = 0 in 3 dimensions by damped Newton with finite differences. */
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
    // Jacobian by columns.
    const J = [0, 1, 2].map(() => [0, 0, 0]);
    for (let j = 0; j < 3; j++) {
      const xp = [...x];
      xp[j] += steps[j];
      const fp = f(xp);
      for (let i = 0; i < 3; i++) J[i][j] = (fp[i] - fx[i]) / steps[j];
    }
    // Cramer's rule.
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

/** Solves F(x) = 0 in 2 dimensions by damped Newton with finite differences. */
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
 * Tunes the ascent guidance so that the rocket, with its real engines and masses,
 * reproduces the three published figures at the end of the ascent:
 * - altitude at MECO,
 * - altitude at core stage separation, and
 * - velocity (relative to Earth) at separation.
 * The three unknowns are the initial pitch-over, the linear-tangent rate and the
 * RS‑25 acceleration limit.
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
 * Calibrates the Earth-orbit phase against the orbits published in the SLS guide
 * for Artemis II. The ignition instants of E4, E5 and E7 are the published ones; what
 * is tuned is how much each burn thrusts:
 * 1. Ascent guidance (see `tuneAscent`).
 * 2. E4 Δv (prograde): leaves the published perigee (100 NM).
 * 3. E7 Δv: two minutes of auxiliaries (published duration).
 * 4. E5 Δv (prograde and radial): published perigee (0) and the apogee that makes the TLI
 *    ignite at the [TL] timeline MET (~70,100 km; [SLS] gives 40,000 NM = 74,080 km).
 * 5. E8 TIG and Δv: at apogee, raises the perigee to the published one (100 NM).
 * 6. E9 TIG: centered on the next perigee.
 */
export function calibrate(base: MissionParams, log: (msg: string) => void = () => undefined): MissionParams {
  let p = tuneAscent(base, log);
  const a = p.ascent;
  log(`Ascenso: cabeceo ${a.kickDeg.toFixed(4)}°, tangente ${a.tanRate.toExponential(4)} 1/s, límite ${(a.gLimit / 9.80665).toFixed(3)} g`);

  // 2 · E4: published perigee.
  const afterE4 = (dv: number): OrbitElements =>
    elementsOf(fly(noBurn(withBurn(p, 'E4', { met: MET_E4_PERIGEE_RAISE, prograde: dv }), ['E5', 'E7', 'E8', 'E9']), MET_E4_PERIGEE_RAISE + 400));
  const dvE4 = bisect((dv) => afterE4(dv).rp - R_EARTH - POST_PRM_ORBIT.perigee, 0.005, 0.4, 1e-12);
  p = withBurn(p, 'E4', { met: MET_E4_PERIGEE_RAISE, prograde: dvE4 });
  const e4 = afterE4(dvE4);
  log(`E4: Δv = ${(dvE4 * 1000).toFixed(3)} m/s → ${(e4.rp - R_EARTH).toFixed(1)} × ${(e4.ra - R_EARTH).toFixed(0)} km`);

  // 3 · E7: two minutes of auxiliaries. Its Δv only depends on Orion's mass, so it goes before E5.
  const atE7 = fly(noBurn(p, ['E7', 'E8', 'E9']), MET_E7_DEPARTURE);
  const dvE7 = dvForDuration(ENGINES.AUX, totalMass(atE7.vehicle, atE7.propulsion.prop), E7_BURN_DURATION);
  p = withBurn(p, 'E7', { met: MET_E7_DEPARTURE, prograde: dvE7 });
  log(`E7: Δv = ${(dvE7 * 1000).toFixed(3)} m/s en ${E7_BURN_DURATION} s`);

  // 4 to 6 · E5, E8 and E9. The E5 apogee is searched (secant) so that the TLI ignites at the
  // published timeline MET; the [SLS] 40,000 NM remain as a check value.
  const withApogee = (apogee: number): { p: MissionParams; tliMet: number } => highOrbit(p, apogee, log);
  let apoA = lastHeoApogee;
  let heo = withApogee(apoA);
  let errA = heo.tliMet - PUBLISHED_MET.tli;
  let apoB = apoA + (errA > 0 ? -300 : 300);
  for (let i = 0; i < 12 && Math.abs(errA) > 0.5; i++) {
    const b = withApogee(apoB);
    const errB = b.tliMet - PUBLISHED_MET.tli;
    log(`  órbita alta: apogeo ${apoB.toFixed(1)} km → TLI ${formatMet(b.tliMet)} (error ${errB.toFixed(1)} s)`);
    const next = apoB - (errB * (apoB - apoA)) / (errB - errA);
    apoA = apoB;
    errA = errB;
    heo = b;
    apoB = next;
  }
  if (Math.abs(errA) > 0.5) throw new Error(`Órbita alta: el TLI no converge al MET publicado (error ${errA.toFixed(1)} s)`);
  lastHeoApogee = apoA;
  log(`Órbita alta: apogeo objetivo de E5 ${apoA.toFixed(1)} km (publicado en [SLS]: ${POST_ARB_ORBIT.apogee.toFixed(0)} km) → TLI ${formatMet(heo.tliMet)}`);
  return heo.p;
}

/** Last high-orbit apogee found: seed for the next calibration (the full tuning calibrates several times). */
let lastHeoApogee = 70100;

/**
 * Steps 4 to 6 of `calibrate` for a given apogee (km of altitude, measured after E7):
 * E5 Δv, E8 at apogee and TLI TIG centered on the next perigee.
 */
function highOrbit(base: MissionParams, apogee: number, log: (msg: string) => void): { p: MissionParams; tliMet: number } {
  let p = base;
  // 4 · E5: published perigee at the end of the burn and the requested apogee after
  // Orion's departure burn (E7), with a fixed inertial attitude (prograde + radial at ignition).
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
      return [el.rp - R_EARTH - POST_ARB_ORBIT.perigee, el.ra - R_EARTH - apogee];
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

  // 5 · E8 at apogee: published perigee.
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

  // 6 · E9 centered on the next perigee.
  const tPeri = firstApsis(fly(noBurn(p, ['E9']), e8Met + 30 * 3600), 'periapsis', e8Met + 600);
  if (tPeri === null) throw new Error('E9: sin perigeo después de E8');
  const tliMet = tPeri - TLI_HALF_BURN;
  p = withBurn(p, 'E9', { met: tliMet });
  log(`TLI TIG = ${tliMet.toFixed(1)} s (perigeo en ${tPeri.toFixed(1)} s)`);
  return { p, tliMet };
}

export function saveParams(p: MissionParams): void {
  writeFileSync(PARAMS_PATH, `${JSON.stringify(p, null, 2)}\n`);
}
