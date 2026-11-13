/**
 * Búsqueda de los parámetros del TLI para un retorno libre.
 *
 * Variables: fase de la Luna (moonAngle0Deg, equivale al momento del TLI relativo a
 * la Luna) y magnitud del Δv del TLI. El TLI se hace en el perigeo de la órbita alta.
 * Objetivos:
 *   1. Altitud de sobrevuelo lunar = 6.513 km (1.png).
 *   2. Ángulo de trayectoria en la interfaz de entrada = objetivo del corredor.
 *
 * Método: (a) grilla gruesa con propagación directa desde el estado previo al TLI:
 * para cada Δv se buscan las fases que dan el sobrevuelo pedido y se mira el perigeo
 * de retorno; (b) refinamiento con Newton en 2D volando la misión completa, alternado
 * con la recalibración de la órbita terrestre (que depende levemente de la fase lunar).
 *
 * Uso: npm run tune   →  escribe src/sim/mission/params.json
 */
import { createCircularEphemeris } from '../src/sim/bodies';
import { applyBurn } from '../src/sim/burns';
import { ENTRY_CORRIDOR, FLYBY_ALTITUDE_TARGET, R_EARTH } from '../src/sim/constants';
import { formatMet } from '../src/sim/format';
import { perigeeRadiusForEntry } from '../src/sim/guidance';
import { ShipState } from '../src/sim/integrator';
import { add, sub } from '../src/sim/math/vec3';
import { MISSION_PARAMS, MissionParams } from '../src/sim/mission/params';
import { earthElements } from '../src/sim/orbit';
import { propagate } from '../src/sim/propagate';
import { ephemerisOf } from '../src/sim/state';
import { bisect, calibrate, fly, saveParams, withBurn } from './lib/calibration';

const DAY = 86400;
const rad = (deg: number): number => (deg * Math.PI) / 180;

interface Outcome {
  /** Altitud de sobrevuelo (km), o null si no pasa por la esfera de influencia. */
  alt: number | null;
  /** Perigeo de retorno sin atmósfera menos el perigeo objetivo (km). Infinity si no vuelve. */
  rpMiss: number;
}

// ---------- (a) Grilla gruesa ----------

function coarse(base: MissionParams): { theta: number; dv: number } {
  const pre = fly(withBurn(base, 'E9', { prograde: 0 }), base.burns.E9.met);
  const eph0 = ephemerisOf(pre);
  const t = pre.t;
  const e0 = eph0.earth(t);
  const rel: ShipState = { r: sub(pre.ship.r, e0.r), v: sub(pre.ship.v, e0.v) };

  const evalAt = (thetaDeg: number, dv: number): Outcome => {
    const eph = createCircularEphemeris(rad(thetaDeg));
    const e = eph.earth(t);
    const ship = applyBurn({ r: add(e.r, rel.r), v: add(e.v, rel.v) }, { prograde: dv, normal: 0, radial: 0 }, e);
    const p = propagate(ship, t, 12 * DAY, eph, { rtol: 1e-9 });
    if (!p.perilune) return { alt: null, rpMiss: Infinity };
    const el = earthElements(p.final, p.tEnd, eph);
    const peri = p.events.find((ev) => ev.type === 'periapsis' && ev.t > p.perilune!.t);
    const rp = p.ei ? el.rp : peri ? earthElements(peri.state, peri.t, eph).rp : Infinity;
    const target = perigeeRadiusForEntry(Math.min(el.energy, -0.01), ENTRY_CORRIDOR.target);
    return { alt: p.perilune.altitude, rpMiss: rp - target };
  };

  // Para un Δv dado: fases (θ) que dan el sobrevuelo a la altitud pedida.
  const flybyRoots = (dv: number): number[] => {
    const roots: number[] = [];
    let prev: { th: number; f: number } | null = null;
    for (let th = 0; th <= 360; th += 1) {
      const o = evalAt(th, dv);
      const cur = o.alt === null ? null : { th, f: o.alt - FLYBY_ALTITUDE_TARGET };
      if (prev && cur && prev.f < 0 !== cur.f < 0) {
        const f = (x: number): number => {
          const a = evalAt(x, dv).alt;
          return (a === null ? 1e9 : a - FLYBY_ALTITUDE_TARGET) * (prev!.f < 0 ? 1 : -1);
        };
        roots.push(bisect(f, prev.th, cur.th, 1e-7));
      }
      prev = cur;
    }
    return roots;
  };

  console.log('Grilla gruesa (Δv TLI → fases con sobrevuelo a 6.513 km y error de perigeo de retorno):');
  type Row = { dv: number; roots: { theta: number; rpMiss: number }[] };
  const rows: Row[] = [];
  for (let dv = 0.34; dv <= 0.46001; dv += 0.01) {
    const roots = flybyRoots(dv).map((theta) => ({ theta, rpMiss: evalAt(theta, dv).rpMiss }));
    rows.push({ dv, roots });
    console.log(
      `  Δv ${(dv * 1000).toFixed(0)} m/s: ` +
        (roots.map((r) => `θ=${r.theta.toFixed(3)}° Δrp=${Number.isFinite(r.rpMiss) ? r.rpMiss.toFixed(0) : '∞'} km`).join(' | ') || 'sin sobrevuelo'),
    );
  }
  // Busca un cambio de signo del error de perigeo entre dos Δv consecutivos, en la misma rama
  // (las ramas se emparejan por cercanía de θ).
  for (let i = 0; i + 1 < rows.length; i++) {
    for (const a of rows[i].roots) {
      const b = rows[i + 1].roots.reduce<{ theta: number; rpMiss: number } | null>(
        (best, r) => (!best || Math.abs(r.theta - a.theta) < Math.abs(best.theta - a.theta) ? r : best),
        null,
      );
      if (!b || Math.abs(b.theta - a.theta) > 8) continue;
      if (!Number.isFinite(a.rpMiss) || !Number.isFinite(b.rpMiss) || a.rpMiss < 0 === b.rpMiss < 0) continue;
      // Interpolación lineal como semilla para el Newton.
      const u = a.rpMiss / (a.rpMiss - b.rpMiss);
      const seed = { theta: a.theta + u * (b.theta - a.theta), dv: rows[i].dv + u * (rows[i + 1].dv - rows[i].dv) };
      console.log(`Semilla: θ = ${seed.theta.toFixed(3)}°, Δv = ${(seed.dv * 1000).toFixed(2)} m/s`);
      return seed;
    }
  }
  throw new Error('La grilla gruesa no encontró un retorno libre: ampliar el rango de Δv.');
}

// ---------- (b) Newton con la misión completa ----------

function evaluate(p: MissionParams): { alt: number; rpMiss: number } {
  const s = fly(p);
  const per = s.record.perilune;
  if (!per) throw new Error('evaluate: la trayectoria no pasa por la esfera de influencia lunar');
  let rp: number;
  let energy: number;
  if (s.record.ei) {
    rp = s.record.ei.rp;
    energy = s.record.ei.energy;
  } else {
    const peri = s.record.apsides.find((a) => a.type === 'periapsis' && a.t > per.t);
    if (!peri) throw new Error('evaluate: la trayectoria no vuelve a la Tierra');
    rp = peri.radius;
    energy = peri.energy;
  }
  return { alt: per.altitude, rpMiss: rp - perigeeRadiusForEntry(energy, ENTRY_CORRIDOR.target) };
}

const withTli = (p: MissionParams, theta: number, dv: number): MissionParams =>
  withBurn({ ...p, moonAngle0Deg: theta }, 'E9', { prograde: dv });

function newton(p: MissionParams, theta0: number, dv0: number): { theta: number; dv: number } {
  let theta = theta0;
  let dv = dv0;
  const hT = 1e-4; // grados
  const hV = 1e-7; // km/s
  for (let i = 0; i < 30; i++) {
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
    // Paso amortiguado: lejos de la solución el problema es muy no lineal.
    const k = Math.min(1, 0.5 / Math.abs(dT), 0.002 / Math.abs(dV));
    dT *= k;
    dV *= k;
    theta += dT;
    dv += dV;
  }
  return { theta, dv };
}

// ---------- Principal ----------

let params = calibrate({ ...MISSION_PARAMS, moonAngle0Deg: 0 });
const seed = coarse(params);
let theta = seed.theta;
let dv = seed.dv;
for (let pass = 0; pass < 4; pass++) {
  console.log(`\nPasada ${pass + 1}: recalibración con θ = ${theta.toFixed(5)}°`);
  params = calibrate({ ...params, moonAngle0Deg: theta }, (m) => console.log(`  ${m}`));
  const prev = { theta, dv };
  ({ theta, dv } = newton(params, theta, dv));
  if (pass > 0 && Math.abs(theta - prev.theta) < 1e-7 && Math.abs(dv - prev.dv) < 1e-10) break;
}
params = withTli(params, theta, dv);

const s = fly(params);
if (!s.record.perilune || !s.record.ei || !s.outcome) throw new Error('La misión nominal no llega a la interfaz de entrada.');
params = {
  ...params,
  nominal: {
    flybyAltitude: s.record.perilune.altitude,
    flybyMet: s.record.perilune.t,
    eiMet: s.record.ei.t,
    eiFpaDeg: s.record.ei.fpaDeg,
    eiSpeed: s.record.ei.speed,
  },
};
saveParams(params);

const tli = params.burns.E9;
console.log('\n=== Misión nominal ===');
console.log(`Fase lunar (moonAngle0Deg): ${params.moonAngle0Deg.toFixed(6)}°`);
console.log(`TLI: MET ${formatMet(tli.met)}, Δv ${(tli.dv.prograde * 1000).toFixed(3)} m/s`);
console.log(`Sobrevuelo: MET ${formatMet(s.record.perilune.t)}, altitud ${s.record.perilune.altitude.toFixed(2)} km`);
console.log(`EI: MET ${formatMet(s.record.ei.t)}, γ = ${s.record.ei.fpaDeg.toFixed(4)}°, V = ${s.record.ei.speed.toFixed(4)} km/s`);
console.log(`Ida: ${((s.record.perilune.t - tli.met) / DAY).toFixed(2)} d · Vuelta: ${((s.record.ei.t - s.record.perilune.t) / DAY).toFixed(2)} d · Total: ${(s.record.ei.t / DAY).toFixed(2)} d`);
console.log(`Perigeo de inserción: ${(earthElements(fly(params, 600).ship, 600, ephemerisOf({ params })).rp - R_EARTH).toFixed(1)} km`);
console.log(`Resultado: ${s.outcome.kind} · Δv Orion usado: ${(s.propulsion.orionDvUsed * 1000).toFixed(1)} m/s`);
console.log('params.json actualizado.');
