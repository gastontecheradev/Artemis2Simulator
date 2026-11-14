import { evaluateAlarms } from './alarms';
import { ATMOSPHERE_TOP, airVelocity } from './atmosphere';
import { DeltaV, ZERO_DV, burnDirection, dvMagnitude, referenceBody } from './burns';
import { commsStatus, losClearance, networkForAltitude } from './comms';
import {
  ATTITUDE_SLEW_RATE,
  BURN_LEAD_TIME,
  BURN_WINDOW_TOLERANCE,
  CM_SEP_AUTO_ALTITUDE,
  CM_SEP_PROMPT_ALTITUDE,
  EARTH_MOON_DISTANCE,
  ENTRY_CORRIDOR,
  LOST_DISTANCE,
  MET_E6_PROX_OPS_END,
  MET_E6_PROX_OPS_START,
  RHC_RATE,
  R_EARTH,
} from './constants';
import { SimEvent, integrateWithEvents } from './events';
import { formatDvMs, formatMet, formatNumber } from './format';
import { ShipState, integrate } from './integrator';
import { Vec3, add, angleBetween, cross, distance, length, normalize, rotateAbout, scale, sub } from './math/vec3';
import { ASCENT_SEQUENCE, airPathTangent, ascentDirection } from './mission/ascent';
import { isPostTli } from './mission/phases';
import { MANEUVER_TITLE, firstIncompleteProcedure, procedureComplete } from './mission/procedures';
import { EventId, eventNumber } from './mission/timeline';
import { earthElements } from './orbit';
import { PowerInput, forces, makeDrag, makePower } from './power';
import { Prediction, entryInterfaceOf, periluneOf, propagate, sampleInterval } from './propagate';
import { PropSystem, SYSTEM_ENGINE, burnBlocker } from './propulsion';
import {
  Alarm,
  Debris,
  DebrisKind,
  LogLevel,
  Maneuver,
  ManeuverId,
  Outcome,
  SimState,
  ephemerisOf,
} from './state';
import { ENGINES, EngineId, G0, MASS, PropLoad, TANK, burnDuration, totalMass } from './vehicle';

/** Copia de trabajo de un estado: se muta localmente y se devuelve como estado nuevo. */
export type Draft = { -readonly [K in keyof SimState]: SimState[K] };

const DAY = 86400;
const Z: Vec3 = { x: 0, y: 0, z: 1 };
/** Límite de sub‑pasos del integrador por llamada, para no congelar el navegador. */
export const DEFAULT_MAX_STEPS = 1500;

export function logTo(d: Draft, level: LogLevel, text: string, eventId?: EventId): void {
  d.log = [...d.log, { t: d.t, level, text, eventId }];
}

function mark(d: Draft, eventId: EventId, r: Vec3, t: number): void {
  if (d.markers.some((m) => m.eventId === eventId)) return;
  d.markers = [...d.markers, { eventId, n: eventNumber(eventId), t, r }];
}

function pushTrail(d: Draft, t: number, s: ShipState): void {
  const eph = ephemerisOf(d);
  const earth = eph.earth(t).r;
  const alt = distance(s.r, earth) - R_EARTH;
  const los = losClearance(s.r, earth, eph.moon(t).r) < 0;
  const sepAt = d.record.icpsSepAt;
  d.trail.push({
    t,
    r: s.r,
    alt,
    phase: d.phase,
    net: los ? 'LOS' : networkForAltitude(alt),
    prox: sepAt !== null && t >= sepAt && t <= MET_E6_PROX_OPS_END,
  });
  // Con motores encendidos la trayectoria cambia rápido: se muestrea más seguido.
  const natural = sampleInterval(s, t, eph);
  d.trailNextT = t + (d.phase === 'ASCENSO' ? Math.min(3, natural) : d.burn ? Math.min(10, natural) : natural);
}

export function setManeuver(d: Draft, id: ManeuverId, patch: Partial<Maneuver>): void {
  d.maneuvers = { ...d.maneuvers, [id]: { ...d.maneuvers[id], ...patch } };
}

function autoPause(d: Draft): void {
  if (d.switches.autoPause && !d.headless) d.clock = { running: false, warp: 1 };
}

const setProp = (d: Draft, prop: readonly number[]): void => {
  d.propulsion = { ...d.propulsion, prop: [prop[0], prop[1], prop[2], prop[3]] as PropLoad };
};

// ---------- Fuerzas y actitud ----------

/** Motores encendidos en este instante. */
export function runningEngines(s: SimState): EngineId[] {
  const engines: EngineId[] = s.phase === 'ASCENSO' ? [...s.ascentEngines] : [];
  if (s.burn) engines.push(SYSTEM_ENGINE[s.burn.system]);
  if (s.thc !== 0 && s.vehicle.icpsSeparated && !s.vehicle.cmSeparated && !engines.includes('RCS')) engines.push('RCS');
  return engines;
}

/**
 * Descripción de las fuerzas no gravitatorias en el estado actual, o null si la nave
 * está en vuelo libre fuera de la atmósfera. La usan el integrador y los instrumentos.
 */
export function powerInputOf(s: SimState): PowerInput | null {
  const eph = ephemerisOf(s);
  const engines = runningEngines(s);
  if (engines.length === 0 && distance(s.ship.r, eph.earth(s.t).r) - R_EARTH > ATMOSPHERE_TOP + 20) return null;
  const hold = s.attitude.dir;
  const direction =
    s.phase === 'ASCENSO'
      ? ascentDirection(s.params.ascent, s.ascentTan, eph)
      : s.burn && s.attitude.mode === 'AUTO'
        ? burnDirection(s.burn.dv, eph)
        : () => hold;
  return { eph, cfg: s.vehicle, engines, direction, srbIgnition: 0, gLimit: s.params.ascent.gLimit, rcsSign: s.thc };
}

/** Δv del encendido para el que el piloto automático tiene que orientar la nave, si hay alguno. */
function attitudeTargetDv(s: SimState): DeltaV | null {
  if (s.burn) return s.burn.dv;
  for (const id of ['E4', 'E5'] as const) {
    const ab = s.autoBurns[id];
    if (ab.status === 'pending' && ab.met - s.t <= BURN_LEAD_TIME && !s.vehicle.icpsSeparated) return ab.dv;
  }
  const id = s.proc.activeId;
  if (id === 'SEP_ICPS' || id === 'SEP_CM') return null;
  const m = s.maneuvers[id];
  if (dvMagnitude(m.dv) === 0 || m.status === 'done') return null;
  if (m.status === 'committed') return m.dv;
  if (m.tig !== null) return s.t >= m.tig - BURN_LEAD_TIME ? m.dv : null;
  return m.confirmed || m.computed ? m.dv : null;
}

/** Actitud que comanda el guiado: la del cohete en el ascenso, la del encendido que viene, o prograde. */
export function commandedDirection(s: SimState): Vec3 {
  const eph = ephemerisOf(s);
  if (s.phase === 'ASCENSO') return ascentDirection(s.params.ascent, s.ascentTan, eph)(s.t, s.ship.r, s.ship.v);
  const dv = attitudeTargetDv(s);
  if (dv) return burnDirection(dv, eph)(s.t, s.ship.r, s.ship.v);
  return normalize(sub(s.ship.v, referenceBody(s.ship, s.t, eph).v));
}

/** Avanza la actitud `dt` segundos según el modo del piloto automático. */
function updateAttitude(d: Draft, dt: number): void {
  const a = d.attitude;
  if (a.mode === 'INRTL') return;
  if (a.mode === 'MAN') {
    if (a.rhc !== 0) d.attitude = { ...a, dir: normalize(rotateAbout(a.dir, Z, a.rhc * RHC_RATE * dt)) };
    return;
  }
  const cmd = commandedDirection(d);
  const angle = angleBetween(a.dir, cmd);
  const thrusting = d.phase === 'ASCENSO' || d.burn !== null;
  if (thrusting || angle <= ATTITUDE_SLEW_RATE * dt) {
    if (angle > 1e-9) d.attitude = { ...a, dir: cmd };
    return;
  }
  const n = cross(a.dir, cmd);
  const axis = length(n) > 1e-9 ? normalize(n) : Z;
  d.attitude = { ...a, dir: normalize(rotateAbout(a.dir, axis, ATTITUDE_SLEW_RATE * dt)) };
}

// ---------- Partes que se desprenden ----------

/** Aviso del log cuando una parte desprendida termina su caída. */
const DEBRIS_FALL: Readonly<Record<DebrisKind, string>> = {
  SRB: 'Los boosters caen al océano.',
  LAS: 'La torre de escape cae al océano.',
  FAIRING: 'Los paneles del módulo de servicio caen al océano.',
  CORE: 'La etapa central reingresa y cae al océano.',
  ICPS: 'La etapa superior (ICPS) reingresa y cae.',
  SM: 'El módulo de servicio reingresa y cae.',
};

/**
 * Suelta una parte con una velocidad relativa (m/s) a lo largo del eje de la nave y
 * de costado. SUPUESTO: las velocidades de separación y los coeficientes balísticos
 * (Cd·A/m, en m²/kg) son órdenes de magnitud, no datos publicados.
 */
function spawnDebris(
  d: Draft,
  kind: DebrisKind,
  id: string,
  /** Velocidad relativa (m/s): a lo largo del eje y de costado. */
  speed: readonly [number, number],
  /** Dónde queda el centro de la parte respecto del centro de la nave (m): a lo largo del eje y de costado. */
  offset: readonly [number, number],
  ballistic: number,
): void {
  if (d.headless) return;
  const dir = d.attitude.dir;
  const side = normalize(cross(Z, dir));
  const r = add(d.ship.r, add(scale(dir, offset[0] / 1e3), scale(side, offset[1] / 1e3)));
  const v = add(d.ship.v, add(scale(dir, speed[0] / 1000), scale(side, speed[1] / 1000)));
  d.debris = [...d.debris, { id, kind, ship: { r, v }, t: d.t, hNext: 0.5, ballistic, since: d.t, dir }];
}

/** Propaga las partes desprendidas hasta el instante actual (gravedad + arrastre). */
function advanceDebris(d: Draft): void {
  if (d.debris.length === 0) return;
  const eph = ephemerisOf(d);
  const next: Debris[] = [];
  for (const b of d.debris) {
    let cur = b;
    let gone = false;
    // El presupuesto de pasos crece con el atraso, para ponerse al día después de un avance largo.
    let budget = Math.max(400, Math.ceil((d.t - cur.t) / 2));
    while (cur.t < d.t && budget > 0 && !gone) {
      const res = integrateWithEvents(cur.ship, cur.t, d.t, eph, { power: makeDrag(eph, cur.ballistic), hInit: cur.hNext, maxSteps: budget });
      budget -= res.steps;
      cur = { ...cur, ship: res.state, t: res.t, hNext: res.hNext };
      if (!res.terminal) break;
      if (res.terminal.type === 'surface' || res.terminal.type === 'moon-impact') gone = true;
      else {
        // Cruzó la interfaz de entrada: sigue cayendo. Un tramo corto sin eventos evita re‑detectar el cruce.
        const step = integrate(cur.ship, cur.t, cur.t + 1, eph, { power: makeDrag(eph, cur.ballistic), hInit: 0.2 });
        cur = { ...cur, ship: step.state, t: step.t, hNext: 0.2 };
      }
    }
    if (distance(cur.ship.r, eph.earth(cur.t).r) > LOST_DISTANCE) continue;
    if (gone) {
      // Los dos boosters caen juntos: un solo aviso.
      if (cur.id !== 'SRB-R' && cur.kind !== 'FAIRING') {
        const at = d.t;
        d.t = cur.t;
        logTo(d, 'INFO', DEBRIS_FALL[cur.kind]);
        d.t = at;
      }
      continue;
    }
    next.push(cur);
  }
  d.debris = next;
}

// ---------- Encendidos ----------

const AUTO_TITLE = { E4: 'Elevación del perigeo', E5: 'Elevación del apogeo a órbita alta' } as const;
const burnTitle = (id: 'E4' | 'E5' | ManeuverId): string => (id === 'E4' || id === 'E5' ? AUTO_TITLE[id] : MANEUVER_TITLE[id]);

/**
 * Enciende un motor para entregar el Δv pedido. El encendido dura lo que tarda ese
 * motor, con la masa actual, en dar ese Δv; se apaga solo al final (ver `endBurn`).
 * Devuelve false (y lo anota en el log) si está inhibido.
 */
export function startBurn(d: Draft, id: 'E4' | 'E5' | ManeuverId, system: PropSystem, dv: DeltaV, eventId: EventId | null): boolean {
  const title = burnTitle(id);
  const mag = dvMagnitude(dv);
  const blocker = d.burn ? 'Hay otro encendido en curso' : mag <= 0 ? 'Δv nulo' : burnBlocker(system, mag, d.propulsion, d.vehicle);
  if (blocker) {
    logTo(d, 'WARNING', `${title}: encendido inhibido. ${blocker}.`);
    return false;
  }
  const engine = ENGINES[SYSTEM_ENGINE[system]];
  const mass = totalMass(d.vehicle, d.propulsion.prop);
  const duration = burnDuration(engine, mass, mag);
  d.burn = { id, system, tStart: d.t, tEnd: d.t + duration, dv, massStart: mass, propStart: d.propulsion.prop[engine.tank] };
  d.hNext = Math.min(d.hNext, 1);
  pushTrail(d, d.t, d.ship);
  if (eventId) mark(d, eventId, d.ship.r, d.t);
  logTo(
    d,
    'EVENT',
    `${eventId ? `${eventId} · ` : ''}${title}: ignición (${system}). Δv ${formatDvMs(mag)} m/s en ${formatNumber(duration, 0)} s.`,
    eventId ?? undefined,
  );
  return true;
}

/** Apaga el motor del encendido en curso y deja asentado lo que entregó. */
export function endBurn(d: Draft, reason: 'complete' | 'cutoff'): void {
  const b = d.burn;
  if (!b) return;
  const engine = ENGINES[SYSTEM_ENGINE[b.system]];
  const mass = totalMass(d.vehicle, d.propulsion.prop);
  // Δv ideal entregado (ecuación del cohete con la masa realmente consumida).
  const delivered = ((G0 * engine.ispVac) / 1000) * Math.log(b.massStart / mass);
  const p = d.propulsion;
  d.propulsion =
    b.system === 'ICPS'
      ? { ...p, icpsDvUsed: p.icpsDvUsed + delivered, icpsBurns: p.icpsBurns + 1 }
      : b.system === 'MAIN'
        ? { ...p, orionDvUsed: p.orionDvUsed + delivered, mainDvUsed: p.mainDvUsed + delivered, mainBurns: p.mainBurns + 1 }
        : { ...p, orionDvUsed: p.orionDvUsed + delivered, auxDvUsed: p.auxDvUsed + delivered, auxBurns: p.auxBurns + 1 };
  d.burn = null;
  pushTrail(d, d.t, d.ship);
  d.predictionDirty = true;
  const planned = dvMagnitude(b.dv);
  const short = delivered < planned - 1e-4;
  const why = reason === 'cutoff' ? 'Corte manual' : short ? 'Propelente agotado' : 'Fin del encendido';
  logTo(d, short ? 'CAUTION' : 'INFO', `${b.id} · ${why}: Δv entregado ${formatDvMs(delivered)} m/s en ${formatNumber(d.t - b.tStart, 0)} s.`);
  if (b.id === 'E4' || b.id === 'E5') {
    d.autoBurns = { ...d.autoBurns, [b.id]: { ...d.autoBurns[b.id], status: 'done' } };
    d.phase = b.id === 'E4' ? 'ORBITA_BAJA' : 'ORBITA_ALTA';
    return;
  }
  const m = d.maneuvers[b.id];
  const done = { executions: m.executions + 1, lastExecutedAt: d.t };
  if (m.tig === null) {
    // Las correcciones y la maniobra manual son repetibles: vuelven a quedar en blanco.
    setManeuver(d, b.id, { ...done, status: 'pending', confirmed: false, computed: false, dv: ZERO_DV });
  } else {
    setManeuver(d, b.id, { ...done, status: 'done' });
  }
  // La guarda se cierra sola después del encendido.
  d.switches = { ...d.switches, mainArm: b.system === 'MAIN' ? false : d.switches.mainArm, auxArm: b.system === 'AUX' ? false : d.switches.auxArm };
  if (b.id === 'E9') {
    d.phase = 'TRANSITO_IDA';
    d.record = { ...d.record, tliAt: d.t };
  }
}

/** Enciende la maniobra de la tripulación `id` con su Δv planeado. */
export function executeManeuver(d: Draft, id: ManeuverId): boolean {
  const m = d.maneuvers[id];
  if (!startBurn(d, id, m.system, m.dv, m.eventId)) {
    if (m.status === 'committed') setManeuver(d, id, { status: 'pending' });
    return false;
  }
  setManeuver(d, id, { status: 'burning' });
  return true;
}

// ---------- Separaciones ----------

function separateSrb(d: Draft): void {
  d.vehicle = { ...d.vehicle, srbSeparated: true };
  const p = d.propulsion.prop;
  setProp(d, [0, p[1], p[2], p[3]]);
  spawnDebris(d, 'SRB', 'SRB-L', [-6, 9], [-20, 6.3], 1.0e-4);
  spawnDebris(d, 'SRB', 'SRB-R', [-6, -9], [-20, -6.3], 1.0e-4);
  mark(d, 'E2', d.ship.r, d.t);
  logTo(d, 'EVENT', 'E2 · Separación de los boosters.', 'E2');
}

function jettisonLas(d: Draft): void {
  d.vehicle = { ...d.vehicle, lasJettisoned: true };
  spawnDebris(d, 'LAS', 'LAS', [45, 12], [49, 0], 2.8e-3);
  spawnDebris(d, 'FAIRING', 'FAIRING', [-4, -10], [40, 0], 2e-2);
  logTo(d, 'EVENT', 'E2 · Eyección de la torre de escape (LAS) y de los paneles del módulo de servicio.', 'E2');
}

function separateCore(d: Draft): void {
  const eph = ephemerisOf(d);
  d.vehicle = { ...d.vehicle, coreSeparated: true };
  const p = d.propulsion.prop;
  spawnDebris(d, 'CORE', 'CORE', [-1.5, 0], [-45, 0], 5.5e-4);
  setProp(d, [p[0], 0, p[2], p[3]]);
  d.phase = 'INSERCION';
  d.ascentEngines = [];
  const el = earthElements(d.ship, d.t, eph);
  const speedRel = length(sub(d.ship.v, airVelocity(d.ship.r, eph.earth(d.t))));
  d.record = { ...d.record, insertion: { t: d.t, altitude: el.r - R_EARTH, speed: el.speed, speedRel, fpaDeg: el.fpaDeg } };
  mark(d, 'E3', d.ship.r, d.t);
  logTo(
    d,
    'EVENT',
    `E3 · Separación de la etapa central a ${formatNumber(el.r - R_EARTH, 1)} km y ${formatNumber(el.speed, 3)} km/s inerciales. Orion y el ICPS siguen en órbita.`,
    'E3',
  );
  d.predictionDirty = true;
}

export function separateIcps(d: Draft): void {
  if (d.vehicle.icpsSeparated) return;
  if (d.burn?.system === 'ICPS') endBurn(d, 'cutoff');
  d.vehicle = { ...d.vehicle, icpsSeparated: true };
  d.record = { ...d.record, icpsSepAt: d.t };
  d.switches = { ...d.switches, icpsSepArm: false };
  spawnDebris(d, 'ICPS', 'ICPS', [-0.6, 0], [-11, 0], 5e-3);
  const p = d.propulsion.prop;
  setProp(d, [p[0], p[1], 0, p[3]]);
  mark(d, 'E6', d.ship.r, d.t);
  logTo(d, 'EVENT', 'E6 · Separación Orion/ICPS. Demo de operaciones de proximidad.', 'E6');
  for (const id of ['E4', 'E5'] as const) {
    if (d.autoBurns[id].status === 'pending') {
      d.autoBurns = { ...d.autoBurns, [id]: { ...d.autoBurns[id], status: 'cancelled' } };
      logTo(d, 'WARNING', `${id}: encendido del ICPS cancelado, la etapa ya se separó.`);
    }
  }
  d.predictionDirty = true;
}

export function separateCm(d: Draft): void {
  if (d.vehicle.cmSeparated) return;
  if (d.burn && d.burn.system !== 'ICPS') endBurn(d, 'cutoff');
  d.vehicle = { ...d.vehicle, cmSeparated: true };
  d.record = { ...d.record, cmSepAt: d.t };
  d.switches = { ...d.switches, cmSepArm: false, mainArm: false, auxArm: false };
  d.thc = 0;
  spawnDebris(d, 'SM', 'SM', [-1.2, 0], [-4.3, 0], 1.7e-3);
  const p = d.propulsion.prop;
  setProp(d, [p[0], p[1], p[2], 0]);
  mark(d, 'E13', d.ship.r, d.t);
  logTo(d, 'EVENT', 'E13 · Separación CM/SM. La nave es solo la cápsula.', 'E13');
}

function finish(d: Draft, kind: Outcome['kind'], text: string): void {
  d.outcome = { kind, t: d.t, text };
  d.clock = { running: false, warp: 1 };
  d.prediction = null;
  d.burn = null;
  d.ascentEngines = [];
  d.thc = 0;
}

function handleEvent(d: Draft, ev: SimEvent): void {
  const eph = ephemerisOf(d);
  const at = d.t;
  d.t = ev.t; // el log lleva el instante exacto del evento
  switch (ev.type) {
    case 'periapsis':
    case 'apoapsis': {
      const el = earthElements(ev.state, ev.t, eph);
      d.record = {
        ...d.record,
        apsides: [...d.record.apsides.slice(-49), { type: ev.type, t: ev.t, radius: el.r, energy: el.energy }],
      };
      if (!isPostTli(d.phase) && d.phase !== 'ASCENSO') {
        const name = ev.type === 'periapsis' ? 'Perigeo' : 'Apogeo';
        logTo(d, 'INFO', `${name}: ${formatNumber(el.r - R_EARTH, 0)} km de altitud.`);
      }
      break;
    }
    case 'perilune': {
      const p = periluneOf(ev, eph);
      if (!d.record.perilune || p.altitude < d.record.perilune.altitude) d.record = { ...d.record, perilune: p };
      mark(d, 'E11', ev.state.r, ev.t);
      logTo(d, 'EVENT', `E11 · Sobrevuelo lunar: máximo acercamiento a ${formatNumber(p.altitude, 0)} km de altitud.`, 'E11');
      break;
    }
    case 'soi-enter':
      d.phase = 'SOBREVUELO';
      logTo(d, 'INFO', 'Entrada a la esfera de influencia lunar.');
      break;
    case 'soi-exit':
      d.phase = 'REGRESO';
      mark(d, 'E12', ev.state.r, ev.t);
      logTo(d, 'INFO', 'E12 · Salida de la esfera de influencia lunar. Regreso a la Tierra.', 'E12');
      break;
    case 'los':
      logTo(d, 'CAUTION', 'LOS · Pérdida de señal: la Luna bloquea el enlace con la Tierra.');
      break;
    case 'aos':
      logTo(d, 'INFO', 'AOS · Señal recuperada.');
      break;
    case 'net-dsn':
      logTo(d, 'INFO', 'COMM · Cambio a Deep Space Network (DSN).');
      break;
    case 'net-nsn':
      logTo(d, 'INFO', 'COMM · Cambio a Near Space Network (NSN).');
      break;
    case 'moon-impact':
      logTo(d, 'WARNING', 'Impacto contra la superficie lunar.');
      finish(d, 'moon-impact', 'La nave impactó contra la Luna.');
      break;
    case 'surface':
      logTo(d, 'WARNING', 'Impacto contra la superficie terrestre.');
      finish(d, 'crash', 'La nave cayó a la superficie sin alcanzar la órbita.');
      break;
    case 'ei': {
      const el = earthElements(ev.state, ev.t, eph);
      const ei = entryInterfaceOf(ev, eph);
      d.record = { ...d.record, ei: { ...ei, rp: el.rp, energy: el.energy } };
      const postTli = isPostTli(d.phase);
      d.phase = 'ENTRADA';
      mark(d, 'E14', ev.state.r, ev.t);
      const data = `γ = ${formatNumber(ei.fpaDeg, 2)}°, V = ${formatNumber(ei.speed, 3)} km/s`;
      logTo(d, 'EVENT', `E14 · Interfaz de entrada: ${data}. Fin de la física.`, 'E14');
      if (!postTli) {
        finish(d, 'reentry-early', 'La nave reentró a la atmósfera antes de la inyección translunar.');
      } else if (!d.vehicle.cmSeparated) {
        finish(d, 'entry-no-sep', 'Entrada sin separar el módulo de servicio: la cápsula no puede orientar el escudo térmico.');
      } else if (ei.fpaDeg > ENTRY_CORRIDOR.max) {
        finish(d, 'entry-shallow', `Entrada demasiado rasante (${data}): la cápsula rebota en la atmósfera.`);
      } else if (ei.fpaDeg < ENTRY_CORRIDOR.min) {
        finish(d, 'entry-steep', `Entrada demasiado empinada (${data}): desaceleración y calor excesivos.`);
      } else {
        logTo(d, 'EVENT', 'E15 · Amerizaje en el Pacífico y recuperación (el descenso atmosférico no se simula).', 'E15');
        finish(d, 'success', `Entrada dentro del corredor (${data}). Amerizaje en el Pacífico.`);
      }
      break;
    }
  }
  if (!d.outcome) d.t = at;
}

interface Breakpoint {
  readonly t: number;
  readonly key: string;
  readonly apply: (d: Draft) => void;
}

/** Disparadores por tiempo pendientes (cada uno se consume una sola vez). */
function breakpoints(d: Draft): Breakpoint[] {
  const list: Breakpoint[] = [];
  const once = (key: string, t: number, apply: (d: Draft) => void): void => {
    if (!d.oneShots.includes(key)) list.push({ t, key, apply });
  };
  if (d.phase === 'ASCENSO') {
    const S = ASCENT_SEQUENCE;
    once('asc:liftoff', 0, (x) => logTo(x, 'EVENT', 'E1 · Ignición y despegue.', 'E1'));
    once('asc:pitch', S.pitchStart, (x) => logTo(x, 'INFO', 'Torre despejada. Maniobra de cabeceo.'));
    // Solo corta el tramo: la ley de guiado cambia de forma en ese instante.
    once('asc:turn', S.pitchEnd, () => undefined);
    once('asc:burnout', S.srbBurnout, (x) => {
      x.ascentEngines = x.ascentEngines.filter((e) => e !== 'SRB');
      logTo(x, 'INFO', 'Boosters agotados.');
    });
    once('asc:srb', S.srbSeparation, separateSrb);
    once('asc:lt', S.linearTangentStart, (x) => {
      x.ascentTan = airPathTangent(x.ship.r, x.ship.v, x.t, ephemerisOf(x));
    });
    once('asc:las', S.lasJettison, jettisonLas);
    once('asc:meco', S.meco, (x) => {
      x.ascentEngines = [];
      const left = x.propulsion.prop[TANK.CORE];
      logTo(x, 'EVENT', `MECO: corte de los motores de la etapa central. Propelente restante: ${formatNumber((100 * left) / MASS.coreProp, 1)} %.`);
    });
    once('asc:core', S.coreSeparation, separateCore);
  }
  if (d.burn) {
    const b = d.burn;
    once(`end:${b.id}:${b.tStart}`, b.tEnd, (x) => endBurn(x, 'complete'));
  }
  for (const id of ['E4', 'E5'] as const) {
    const ab = d.autoBurns[id];
    // Pasada la ignición se vuelve solo al warp que había, salvo que la tripulación lo haya cambiado.
    once(`unwarp:${id}`, ab.met + 20, (x) => {
      if (x.warpRestore !== null && x.clock.warp === 10) x.clock = { ...x.clock, warp: x.warpRestore };
      x.warpRestore = null;
    });
    if (ab.status !== 'pending') continue;
    once(`warp:${id}`, ab.met - 30, (x) => {
      // Con tripulación automática (modo demostración) no se frena: nadie tiene que mirar el encendido.
      if (x.headless || x.switches.autoCrew || x.clock.warp <= 10) return;
      x.warpRestore = x.clock.warp;
      x.clock = { ...x.clock, warp: 10 };
    });
    once(`burn:${id}`, ab.met, (x) => {
      const ok = startBurn(x, id, 'ICPS', x.autoBurns[id].dv, id);
      x.autoBurns = { ...x.autoBurns, [id]: { ...x.autoBurns[id], status: ok ? 'burning' : 'cancelled' } };
    });
  }
  once('e6:start', MET_E6_PROX_OPS_START, (x) => {
    if (x.vehicle.icpsSeparated) return;
    if (x.switches.autoCrew) {
      separateIcps(x);
    } else {
      x.proc = { ...x.proc, activeId: 'SEP_ICPS', cursor: null };
      logTo(x, 'INFO', 'Ventana de separación Orion/ICPS abierta. Acción de la tripulación requerida.');
      autoPause(x);
    }
  });
  once('e6:end', MET_E6_PROX_OPS_END, (x) => {
    if (x.vehicle.icpsSeparated) logTo(x, 'INFO', 'Fin de la demo de operaciones de proximidad.');
  });
  for (const id of ['E7', 'E8', 'E9'] as const) {
    const m = d.maneuvers[id];
    if (m.tig === null || m.status === 'done' || m.status === 'burning') continue;
    const title = MANEUVER_TITLE[id];
    once(`lead:${id}`, m.tig - BURN_LEAD_TIME, (x) => {
      if (x.switches.autoCrew) return;
      x.proc = { ...x.proc, activeId: id, cursor: null };
      logTo(x, 'INFO', `${id} · ${title}: ventana abierta, ignición en ${BURN_LEAD_TIME} s.`);
      autoPause(x);
    });
    once(`tig:${id}`, m.tig, (x) => {
      const cur = x.maneuvers[id];
      if (cur.status === 'committed' || x.switches.autoCrew) executeManeuver(x, id);
      else logTo(x, 'CAUTION', `${id} · ${title}: pasó el instante de ignición (TIG ${formatMet(cur.tig ?? 0)}) sin encender.`);
    });
    once(`miss:${id}`, m.tig + BURN_WINDOW_TOLERANCE, (x) => {
      const cur = x.maneuvers[id];
      if (cur.status === 'done' || cur.status === 'burning') return;
      setManeuver(x, id, { status: 'missed' });
      logTo(x, 'WARNING', `${id} · ${title}: ventana de encendido perdida.`);
    });
  }
  const tli = d.record.tliAt;
  if (tli !== null) {
    once('e10:mark', tli + DAY, (x) => {
      mark(x, 'E10', x.ship.r, x.t);
      logTo(x, 'INFO', 'E10 · Tránsito de ida: correcciones de trayectoria (OTC) disponibles en Procs.', 'E10');
    });
  }
  return list;
}

/** Disparadores que dependen del estado (altitud, distancia, presión dinámica), evaluados entre tramos. */
function stateTriggers(d: Draft, input: PowerInput | null): void {
  const eph = ephemerisOf(d);
  const el = earthElements(d.ship, d.t, eph);
  if (d.phase === 'ASCENSO' && input) {
    // Max Q: se anota cuando la presión dinámica ya empezó a bajar.
    const q = forces(input, d.t, d.ship.r, d.ship.v, d.propulsion.prop).q;
    const peak = d.record.maxQ;
    if (!peak || q > peak.q) {
      d.record = { ...d.record, maxQ: { t: d.t, q, logged: false } };
    } else if (!peak.logged && peak.q > 5000 && q < 0.97 * peak.q) {
      d.record = { ...d.record, maxQ: { ...peak, logged: true } };
      logTo(d, 'INFO', `Max Q: presión dinámica máxima de ${formatNumber(peak.q / 1000, 1)} kPa en MET ${formatMet(peak.t)}.`);
    }
  }
  if (el.r > LOST_DISTANCE) {
    logTo(d, 'WARNING', 'La nave se aleja sin retorno del sistema Tierra‑Luna.');
    finish(d, 'lost', 'Órbita perdida: la nave escapó del sistema Tierra‑Luna.');
    return;
  }
  const alt = el.r - R_EARTH;
  if (!isPostTli(d.phase) || d.vehicle.cmSeparated || el.radialSpeed >= 0) return;
  if (alt < CM_SEP_PROMPT_ALTITUDE && !d.oneShots.includes('cm:prompt')) {
    d.oneShots = [...d.oneShots, 'cm:prompt'];
    if (!d.switches.autoCrew) {
      d.proc = { ...d.proc, activeId: 'SEP_CM', cursor: null };
      logTo(d, 'INFO', 'E13 · Separación CM/SM requerida antes de la interfaz de entrada.');
      autoPause(d);
    }
  }
  if (d.switches.autoCrew && alt < CM_SEP_AUTO_ALTITUDE) separateCm(d);
}

/**
 * Largo máximo de un tramo de integración. Se acorta cuando algo que depende del estado
 * tiene que evaluarse seguido: la aproximación final a la Tierra (separación CM/SM),
 * el control manual de actitud y el ascenso (Max Q).
 */
function maxChunk(d: Draft): number {
  if (d.attitude.mode === 'MAN' && d.attitude.rhc !== 0) return 1;
  if ((d.burn || d.thc !== 0) && d.attitude.mode !== 'AUTO') return 2;
  if (d.phase === 'ASCENSO') return 5;
  if (!isPostTli(d.phase) || d.vehicle.cmSeparated) return Infinity;
  const el = earthElements(d.ship, d.t, ephemerisOf(d));
  return el.radialSpeed < 0 && el.r < 80000 ? 120 : 1800;
}

/** Calcula la trayectoria predicha (sin encendidos futuros) desde el estado actual. */
export function predict(d: SimState): Prediction {
  const eph = ephemerisOf(d);
  const el = earthElements(d.ship, d.t, eph);
  const bound = !isPostTli(d.phase) && el.ra < 0.5 * EARTH_MOON_DISTANCE;
  const duration = bound ? Math.min(1.02 * el.period, 12 * DAY) : 12 * DAY;
  return propagate(d.ship, d.t, duration, eph, { rtol: 1e-10 });
}

function predictionStale(d: Draft): boolean {
  const p = d.prediction;
  if (!p) return true;
  // Durante un encendido la trayectoria cambia todo el tiempo: se refresca cada 20 s de misión.
  if (d.burn && d.t - p.t0 > 20) return true;
  return p.end === 'horizon' && d.t > p.t0 + 0.5 * (p.tEnd - p.t0);
}

function mergeAlarms(d: Draft): void {
  const active = evaluateAlarms(d);
  const next: Alarm[] = [];
  for (const c of active) {
    const prev = d.alarms.find((a) => a.id === c.id);
    if (prev) {
      next.push(prev);
    } else {
      next.push({ ...c, since: d.t, acked: false });
      // La LOS ya queda en el log como evento de comunicaciones.
      if (c.id !== 'los') logTo(d, c.level, `${c.level} · ${c.text}`);
    }
  }
  if (next.length !== d.alarms.length || next.some((a, i) => a !== d.alarms[i])) d.alarms = next;
}

/**
 * Recalcula lo derivado (comunicaciones, predicción, alarmas, procedimiento activo).
 * Se llama al final de cada avance y de cada comando.
 */
export function finalize(d: Draft, prev: SimState): SimState {
  const eph = ephemerisOf(d);
  d.comms = commsStatus(d.ship.r, d.t, eph);
  if (!d.headless) {
    advanceDebris(d);
    if (!d.outcome && d.phase !== 'ASCENSO' && (d.predictionDirty || predictionStale(d))) {
      d.prediction = predict(d);
      d.predictionDirty = false;
    }
    mergeAlarms(d);
  }
  const active = d.proc.activeId;
  if (active !== 'MAN' && procedureComplete(d, active) && !procedureComplete(prev, active)) {
    d.proc = { ...d.proc, activeId: firstIncompleteProcedure(d) ?? active, cursor: null };
  }
  return d;
}

/** Aplica una mutación local sobre una copia del estado y recalcula lo derivado. */
export function produce(state: SimState, fn: (d: Draft) => void): SimState {
  const d: Draft = { ...state };
  fn(d);
  return finalize(d, state);
}

/**
 * Avanza la simulación `dtSim` segundos de tiempo de misión: integra por tramos entre
 * disparadores (ignición y corte de motores, separaciones, ventanas), procesa los
 * eventos detectados, mueve la actitud y registra el trazo.
 * Si se agota `maxSteps`, avanza menos de lo pedido.
 */
export function advance(state: SimState, dtSim: number, maxSteps = DEFAULT_MAX_STEPS): SimState {
  if (!state.clock.running || state.outcome || dtSim <= 0) return state;
  return produce(state, (d) => {
    const eph = ephemerisOf(d);
    const target = d.t + dtSim;
    let budget = maxSteps;
    while (d.t < target && budget > 0 && d.clock.running && !d.outcome) {
      const bp = breakpoints(d).reduce<Breakpoint | null>((a, b) => (!a || b.t < a.t ? b : a), null);
      if (bp && bp.t <= d.t) {
        d.oneShots = [...d.oneShots, bp.key];
        bp.apply(d);
        continue;
      }
      const tb = Math.min(target, bp ? bp.t : Infinity, d.t + maxChunk(d));
      const input = powerInputOf(d);
      const t0 = d.t;
      const res = integrateWithEvents(d.ship, d.t, tb, eph, {
        hInit: d.hNext,
        maxSteps: budget,
        power: input ? makePower(input) : undefined,
        prop: input ? d.propulsion.prop : undefined,
        onSample: (t, s) => {
          if (t >= d.trailNextT) pushTrail(d, t, s);
        },
      });
      budget -= res.steps;
      d.ship = res.state;
      d.t = res.t;
      d.hNext = res.hNext;
      if (input) {
        const before = d.propulsion.prop[TANK.ESM];
        setProp(d, res.prop);
        // El propelente que gasta la traslación con RCS también cuenta como Δv de Orion.
        if (d.thc !== 0 && !d.burn && before > res.prop[TANK.ESM]) {
          const m1 = totalMass(d.vehicle, d.propulsion.prop);
          const dv = ((G0 * ENGINES.RCS.ispVac) / 1000) * Math.log((m1 + before - res.prop[TANK.ESM]) / m1);
          d.propulsion = { ...d.propulsion, rcsDvUsed: d.propulsion.rcsDvUsed + dv, orionDvUsed: d.propulsion.orionDvUsed + dv };
          d.predictionDirty = true;
        }
      }
      for (const ev of res.events) {
        handleEvent(d, ev);
        if (d.outcome) break;
      }
      if (d.outcome) break;
      updateAttitude(d, d.t - t0);
      stateTriggers(d, input);
      if (!res.complete) break;
    }
    // Disparadores que caen justo en el final del tramo.
    while (d.clock.running && !d.outcome) {
      const due = breakpoints(d).filter((b) => b.t <= d.t).sort((a, b) => a.t - b.t)[0];
      if (!due) break;
      d.oneShots = [...d.oneShots, due.key];
      due.apply(d);
    }
  });
}
