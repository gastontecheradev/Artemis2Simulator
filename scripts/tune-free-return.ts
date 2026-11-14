/**
 * Ajuste completo de la misión nominal. Todo se vuela con la física real (motores,
 * masas, arrastre); el script solo busca los parámetros de guiado y de encendido.
 *
 * 1. Ascenso y órbita terrestre: ver scripts/lib/calibration.ts.
 * 2. Retorno libre. Variables: fase de la Luna (moonAngle0Deg, equivale a elegir la
 *    fecha de lanzamiento) y Δv del TLI. Objetivos:
 *      a. altitud de sobrevuelo lunar = 6.513 km;
 *      b. ángulo de trayectoria en la interfaz de entrada = objetivo del corredor.
 *    Método: grilla gruesa (para cada Δv, las fases que dan el sobrevuelo pedido y su
 *    error de perigeo de retorno), después Newton en 2D volando la misión completa,
 *    alternado con la recalibración de la órbita terrestre.
 *
 * Uso: npm run tune   →  escribe src/sim/mission/params.json
 */
import { executeManeuver, produce, setManeuver } from '../src/sim/advance';
import { ENTRY_CORRIDOR, FLYBY_ALTITUDE_TARGET, R_EARTH } from '../src/sim/constants';
import { formatMet } from '../src/sim/format';
import { perigeeRadiusForEntry } from '../src/sim/guidance';
import { add, sub } from '../src/sim/math/vec3';
import { MISSION_PARAMS, MissionParams } from '../src/sim/mission/params';
import { SimState, ephemerisOf } from '../src/sim/state';
import { bisect, calibrate, fly, flyFrom, saveParams, withBurn } from './lib/calibration';

const DAY = 86400;

interface Miss {
  /** Altitud de sobrevuelo (km), o null si no pasa por la esfera de influencia. */
  alt: number | null;
  /** Perigeo de retorno sin atmósfera menos el perigeo objetivo (km). Infinity si no vuelve. */
  rpMiss: number;
}

/**
 * Lee de una misión volada el sobrevuelo y el error de perigeo del PRIMER regreso a la
 * Tierra. Si la nave pasa por el perigeo sin entrar, sigue en una órbita de varios días
 * y puede entrar en una pasada posterior: esa entrada no cuenta.
 */
function measure(s: SimState): Miss {
  const per = s.record.perilune;
  if (!per) return { alt: null, rpMiss: Infinity };
  const peri = s.record.apsides.find((a) => a.type === 'periapsis' && a.t > per.t);
  const ei = s.record.ei;
  if (ei && (!peri || ei.t < peri.t)) {
    return { alt: per.altitude, rpMiss: ei.rp - perigeeRadiusForEntry(ei.energy, ENTRY_CORRIDOR.target) };
  }
  if (!peri) return { alt: per.altitude, rpMiss: Infinity };
  return { alt: per.altitude, rpMiss: peri.radius - perigeeRadiusForEntry(Math.min(peri.energy, -0.01), ENTRY_CORRIDOR.target) };
}

// ---------- (a) Grilla gruesa ----------

function coarse(base: MissionParams): { theta: number; dv: number } {
  // Estado en el instante de ignición del TLI. Hasta ahí la fase lunar casi no influye.
  const pre = fly(withBurn(base, 'E9', { prograde: 0 }), base.burns.E9.met);
  const eph0 = ephemerisOf(pre);
  const t = pre.t;
  const e0 = eph0.earth(t);

  const evalAt = (thetaDeg: number, dv: number): Miss => {
    const params: MissionParams = { ...pre.params, moonAngle0Deg: thetaDeg };
    const e = ephemerisOf({ params }).earth(t);
    // Misma posición y velocidad respecto de la Tierra, con la Luna en otra fase.
    const ship = { r: add(sub(pre.ship.r, e0.r), e.r), v: add(sub(pre.ship.v, e0.v), e.v) };
    const lit = produce({ ...pre, params, ship, trail: [], log: [], record: { ...pre.record, apsides: [] } }, (d) => {
      setManeuver(d, 'E9', { dv: { prograde: dv, normal: 0, radial: 0 }, status: 'pending' });
      executeManeuver(d, 'E9');
    });
    return measure(flyFrom(lit, t + 12 * DAY));
  };

  // Para un Δv dado: fases (θ) que dan el sobrevuelo a la altitud pedida.
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
  for (let dv = 0.375; dv <= 0.45001; dv += 0.0025) {
    const roots = flybyRoots(dv).map((theta) => ({ theta, rpMiss: evalAt(theta, dv).rpMiss }));
    rows.push({ dv, roots });
    console.log(
      `  Δv ${(dv * 1000).toFixed(1)} m/s: ` +
        (roots.map((r) => `θ=${r.theta.toFixed(3)}° Δrp=${Number.isFinite(r.rpMiss) ? r.rpMiss.toFixed(0) : '∞'} km`).join(' | ') || 'sin sobrevuelo'),
    );
  }
  // Cambio de signo del error de perigeo entre dos Δv consecutivos, en la misma rama
  // (las ramas se emparejan por cercanía de θ).
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
      console.log(`Semilla: θ = ${seed.theta.toFixed(3)}°, Δv = ${(seed.dv * 1000).toFixed(2)} m/s`);
      return seed;
    }
  }
  throw new Error('La grilla gruesa no encontró un retorno libre: ampliar el rango de Δv.');
}

// ---------- (b) Newton con la misión completa ----------

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
  const hT = 1e-4; // grados
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
console.log(`Δv ICPS: ${(pr.icpsDvUsed * 1000).toFixed(1)} m/s · Δv Orion: ${(pr.orionDvUsed * 1000).toFixed(1)} m/s · propelente del módulo de servicio al final: ${pr.prop[3].toFixed(0)} kg`);
console.log(`Resultado: ${s.outcome.kind}`);
console.log('params.json actualizado.');
