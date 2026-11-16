/**
 * Full tuning of the nominal mission. Everything is flown with the real physics (engines,
 * masses, drag); the script only searches for the guidance and burn parameters.
 *
 * 1. Ascent and Earth orbit: see scripts/lib/calibration.ts.
 * 2. Free return. Variables: lunar phase (moonAngle0Deg, equivalent to choosing the
 *    launch date) and TLI Δv. Targets:
 *      a. lunar flyby altitude = 6,513 km;
 *      b. flight-path angle at entry interface = corridor target.
 *    Method: coarse grid (for each Δv, the phases that give the requested flyby and their
 *    return perigee error), then 2D Newton flying the whole mission,
 *    alternated with the recalibration of the Earth orbit.
 *
 * Usage: npm run tune   →  writes src/sim/mission/params.json
 */
import { executeManeuver, produce, setManeuver } from '../src/sim/advance';
import { ENTRY_CORRIDOR, FLYBY_ALTITUDE_TARGET, PUBLISHED_MET, R_EARTH } from '../src/sim/constants';
import { formatMet } from '../src/sim/format';
import { perigeeRadiusForEntry } from '../src/sim/guidance';
import { add, sub } from '../src/sim/math/vec3';
import { MISSION_PARAMS, MissionParams } from '../src/sim/mission/params';
import { SimState, ephemerisOf } from '../src/sim/state';
import { bisect, calibrate, fly, flyFrom, saveParams, withBurn } from './lib/calibration';
import { writeNominalPath } from './lib/nominal-path';

const DAY = 86400;

interface Miss {
  /** Flyby altitude (km), or null if it does not pass through the sphere of influence. */
  alt: number | null;
  /** Return perigee without atmosphere minus the target perigee (km). Infinity if it does not return. */
  rpMiss: number;
  /** MET of the return (entry or perigee), or null. */
  tReturn: number | null;
}

/**
 * Reads from a flown mission the flyby and the perigee error of the FIRST return to
 * Earth. If the spacecraft passes perigee without entering, it stays in an orbit of several days
 * and may enter on a later pass: that entry does not count.
 */
function measure(s: SimState): Miss {
  const per = s.record.perilune;
  if (!per) return { alt: null, rpMiss: Infinity, tReturn: null };
  const peri = s.record.apsides.find((a) => a.type === 'periapsis' && a.t > per.t);
  const ei = s.record.ei;
  if (ei && (!peri || ei.t < peri.t)) {
    return { alt: per.altitude, rpMiss: ei.rp - perigeeRadiusForEntry(ei.energy, ENTRY_CORRIDOR.target), tReturn: ei.t };
  }
  if (!peri) return { alt: per.altitude, rpMiss: Infinity, tReturn: null };
  return { alt: per.altitude, rpMiss: peri.radius - perigeeRadiusForEntry(Math.min(peri.energy, -0.01), ENTRY_CORRIDOR.target), tReturn: peri.t };
}

// ---------- (a) Coarse grid ----------

function coarse(base: MissionParams): { theta: number; dv: number } {
  // State at the TLI ignition instant. Up to there the lunar phase has almost no influence.
  const pre = fly(withBurn(base, 'E9', { prograde: 0 }), base.burns.E9.met);
  const eph0 = ephemerisOf(pre);
  const t = pre.t;
  const e0 = eph0.earth(t);

  const evalAt = (thetaDeg: number, dv: number): Miss => {
    const params: MissionParams = { ...pre.params, moonAngle0Deg: thetaDeg };
    const e = ephemerisOf({ params }).earth(t);
    // Same position and velocity relative to Earth, with the Moon at another phase.
    const ship = { r: add(sub(pre.ship.r, e0.r), e.r), v: add(sub(pre.ship.v, e0.v), e.v) };
    const lit = produce({ ...pre, params, ship, trail: [], log: [], record: { ...pre.record, apsides: [] } }, (d) => {
      setManeuver(d, 'E9', { dv: { prograde: dv, normal: 0, radial: 0 }, status: 'pending' });
      executeManeuver(d, 'E9');
    });
    return measure(flyFrom(lit, t + 12 * DAY));
  };

  // For a given Δv: phases (θ) that give the flyby at the requested altitude.
  const flybyRoots = (dv: number): number[] => {
    const roots: number[] = [];
    let prev: { th: number; f: number } | null = null;
    for (let th = 0; th <= 360; th += 1) {
      const o = evalAt(th, dv);
      const cur = o.alt === null ? null : { th, f: o.alt - FLYBY_ALTITUDE_TARGET };
      if (prev && cur && prev.f < 0 !== cur.f < 0) {
        const sign = prev.f < 0 ? 1 : -1;
        const f = (x: number): number => {
          const a = evalAt(x, dv).alt;
          return (a === null ? 1e9 : a - FLYBY_ALTITUDE_TARGET) * sign;
        };
        roots.push(bisect(f, prev.th, cur.th, 1e-5));
      }
      prev = cur;
    }
    return roots;
  };

  console.log('Grilla gruesa (Δv TLI → fases con sobrevuelo a 6.513 km y error de perigeo de retorno):');
  type Row = { dv: number; roots: { theta: number; rpMiss: number }[] };
  const rows: Row[] = [];
  for (let dv = 0.3; dv <= 0.45001; dv += 0.0025) {
    const roots = flybyRoots(dv).map((theta) => ({ theta, rpMiss: evalAt(theta, dv).rpMiss }));
    rows.push({ dv, roots });
    console.log(
      `  Δv ${(dv * 1000).toFixed(1)} m/s: ` +
        (roots.map((r) => `θ=${r.theta.toFixed(3)}° Δrp=${Number.isFinite(r.rpMiss) ? r.rpMiss.toFixed(0) : '∞'} km`).join(' | ') || 'sin sobrevuelo'),
    );
  }
  // Sign change of the perigee error between two consecutive Δv, on the same branch
  // (branches are paired by closeness of θ). There can be several free returns:
  // the one returning on the date closest to the published timeline is chosen.
  const seeds: { theta: number; dv: number; tReturn: number }[] = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    for (const a of rows[i].roots) {
      const b = rows[i + 1].roots.reduce<{ theta: number; rpMiss: number } | null>(
        (best, r) => (!best || Math.abs(r.theta - a.theta) < Math.abs(best.theta - a.theta) ? r : best),
        null,
      );
      if (!b || Math.abs(b.theta - a.theta) > 8) continue;
      if (!Number.isFinite(a.rpMiss) || !Number.isFinite(b.rpMiss) || a.rpMiss < 0 === b.rpMiss < 0) continue;
      const u = a.rpMiss / (a.rpMiss - b.rpMiss);
      const seed = { theta: a.theta + u * (b.theta - a.theta), dv: rows[i].dv + u * (rows[i + 1].dv - rows[i].dv) };
      const tReturn = evalAt(seed.theta, seed.dv).tReturn ?? Infinity;
      console.log(`Semilla candidata: θ = ${seed.theta.toFixed(3)}°, Δv = ${(seed.dv * 1000).toFixed(2)} m/s, regreso en ${(tReturn / DAY).toFixed(2)} d`);
      seeds.push({ ...seed, tReturn });
    }
  }
  if (seeds.length === 0) throw new Error('La grilla gruesa no encontró un retorno libre: ampliar el rango de Δv.');
  const best = seeds.reduce((p, q) => (Math.abs(q.tReturn - PUBLISHED_MET.ei) < Math.abs(p.tReturn - PUBLISHED_MET.ei) ? q : p));
  console.log(`Semilla elegida: θ = ${best.theta.toFixed(3)}°, Δv = ${(best.dv * 1000).toFixed(2)} m/s`);
  return best;
}

// ---------- (b) Newton with the whole mission ----------

const withTli = (p: MissionParams, theta: number, dv: number): MissionParams =>
  withBurn({ ...p, moonAngle0Deg: theta }, 'E9', { prograde: dv });

function evaluate(p: MissionParams): { alt: number; rpMiss: number } {
  const m = measure(fly(p, p.burns.E9.met + 12 * DAY));
  if (m.alt === null) throw new Error('evaluate: la trayectoria no pasa por la esfera de influencia lunar');
  if (!Number.isFinite(m.rpMiss)) throw new Error('evaluate: la trayectoria no vuelve a la Tierra');
  return { alt: m.alt, rpMiss: m.rpMiss };
}

function newton(p: MissionParams, theta0: number, dv0: number): { theta: number; dv: number } {
  let theta = theta0;
  let dv = dv0;
  const hT = 1e-4; // degrees
  const hV = 1e-7; // km/s
  for (let i = 0; i < 40; i++) {
    const f = evaluate(withTli(p, theta, dv));
    const f1 = f.alt - FLYBY_ALTITUDE_TARGET;
    const f2 = f.rpMiss;
    console.log(`    it ${i}: θ=${theta.toFixed(6)}° Δv=${(dv * 1000).toFixed(4)} m/s → sobrevuelo ${f.alt.toFixed(3)} km, Δrp ${f2.toFixed(3)} km`);
    if (Math.abs(f1) < 1e-3 && Math.abs(f2) < 1e-3) break;
    const a = evaluate(withTli(p, theta + hT, dv));
    const b = evaluate(withTli(p, theta, dv + hV));
    const j11 = (a.alt - f.alt) / hT;
    const j21 = (a.rpMiss - f2) / hT;
    const j12 = (b.alt - f.alt) / hV;
    const j22 = (b.rpMiss - f2) / hV;
    const det = j11 * j22 - j12 * j21;
    let dT = -(f1 * j22 - f2 * j12) / det;
    let dV = -(j11 * f2 - j21 * f1) / det;
    // Damped step: far from the solution the problem is highly nonlinear.
    const k = Math.min(1, 0.5 / Math.abs(dT), 0.002 / Math.abs(dV));
    dT *= k;
    dV *= k;
    theta += dT;
    dv += dV;
  }
  return { theta, dv };
}

// ---------- Main ----------

const log = (m: string): void => console.log(`  ${m}`);
console.log('Calibración inicial');
let params = calibrate(MISSION_PARAMS, log);
const seed = coarse(params);
let theta = seed.theta;
let dv = seed.dv;
for (let pass = 0; pass < 5; pass++) {
  console.log(`\nPasada ${pass + 1}: recalibración con θ = ${theta.toFixed(5)}°`);
  params = calibrate(withTli(params, theta, dv), log);
  const prev = { theta, dv };
  ({ theta, dv } = newton(params, theta, dv));
  if (pass > 0 && Math.abs(theta - prev.theta) < 1e-7 && Math.abs(dv - prev.dv) < 1e-10) break;
}
params = withTli(params, theta, dv);

const s = fly(params);
if (!s.record.perilune || !s.record.ei || !s.outcome || !s.record.insertion) throw new Error('La misión nominal no llega a la interfaz de entrada.');
params = {
  ...params,
  nominal: {
    insertionSpeed: s.record.insertion.speed,
    insertionFpaDeg: s.record.insertion.fpaDeg,
    flybyAltitude: s.record.perilune.altitude,
    flybyMet: s.record.perilune.t,
    eiMet: s.record.ei.t,
    eiFpaDeg: s.record.ei.fpaDeg,
    eiSpeed: s.record.ei.speed,
  },
};
saveParams(params);
writeNominalPath(params);

const tli = params.burns.E9;
const ins = s.record.insertion;
console.log('\n=== Misión nominal ===');
console.log(`Inserción (E3): ${ins.altitude.toFixed(2)} km, ${ins.speedRel.toFixed(4)} km/s relativos, ${ins.speed.toFixed(4)} km/s inerciales, γ = ${ins.fpaDeg.toFixed(3)}°`);
console.log('Ápsides en órbita terrestre:');
for (const a of s.record.apsides.filter((x) => x.t < tli.met + 600)) {
  console.log(`  ${formatMet(a.t)}  ${a.type === 'apoapsis' ? 'apogeo ' : 'perigeo'}  ${(a.radius - R_EARTH).toFixed(0)} km`);
}
console.log(`Fase lunar (moonAngle0Deg): ${params.moonAngle0Deg.toFixed(6)}°`);
console.log(`TLI: ignición MET ${formatMet(tli.met)}, Δv ${(tli.dv.prograde * 1000).toFixed(3)} m/s`);
console.log(`Sobrevuelo: MET ${formatMet(s.record.perilune.t)}, altitud ${s.record.perilune.altitude.toFixed(2)} km`);
console.log(`EI: MET ${formatMet(s.record.ei.t)}, γ = ${s.record.ei.fpaDeg.toFixed(4)}°, V = ${s.record.ei.speed.toFixed(4)} km/s`);
console.log(`Ida: ${((s.record.perilune.t - tli.met) / DAY).toFixed(2)} d · Vuelta: ${((s.record.ei.t - s.record.perilune.t) / DAY).toFixed(2)} d · Total: ${(s.record.ei.t / DAY).toFixed(2)} d`);
const pr = s.propulsion;
const preSep = fly(params, (s.record.cmSepAt ?? s.t) - 60);
console.log(`Δv ICPS: ${(pr.icpsDvUsed * 1000).toFixed(1)} m/s · Δv Orion: ${(pr.orionDvUsed * 1000).toFixed(1)} m/s · propelente del módulo de servicio antes de separarlo: ${preSep.propulsion.prop[3].toFixed(0)} kg`);
console.log(`Resultado: ${s.outcome.kind}`);
console.log('params.json actualizado.');
