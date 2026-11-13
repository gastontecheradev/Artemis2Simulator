import { evaluateAlarms } from './alarms';
import { DeltaV, ZERO_DV, applyBurn, dvMagnitude, referenceBody } from './burns';
import { commsStatus, losClearance, networkForAltitude } from './comms';
import {
  BURN_LEAD_TIME,
  BURN_WINDOW_TOLERANCE,
  CM_SEP_AUTO_ALTITUDE,
  CM_SEP_PROMPT_ALTITUDE,
  EARTH_MOON_DISTANCE,
  ENTRY_CORRIDOR,
  LOST_DISTANCE,
  MET_E6_PROX_OPS_END,
  MET_E6_PROX_OPS_START,
  R_EARTH,
} from './constants';
import { SimEvent, integrateWithEvents } from './events';
import { formatDvMs, formatNumber } from './format';
import { ShipState } from './integrator';
import { Vec3, distance } from './math/vec3';
import { isPostTli } from './mission/phases';
import { MANEUVER_TITLE, firstIncompleteProcedure, procedureComplete } from './mission/procedures';
import { EventId, eventNumber } from './mission/timeline';
import { earthElements } from './orbit';
import { Prediction, entryInterfaceOf, periluneOf, propagate, sampleInterval } from './propagate';
import { PropSystem, burnBlocker, consume } from './propulsion';
import { Alarm, LogLevel, Maneuver, ManeuverId, Outcome, SimState, ephemerisOf } from './state';

/** Copia de trabajo de un estado: se muta localmente y se devuelve como estado nuevo. */
export type Draft = { -readonly [K in keyof SimState]: SimState[K] };

const DAY = 86400;
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
  d.trailNextT = t + sampleInterval(s, t, eph);
}

export function setManeuver(d: Draft, id: ManeuverId, patch: Partial<Maneuver>): void {
  d.maneuvers = { ...d.maneuvers, [id]: { ...d.maneuvers[id], ...patch } };
}

function autoPause(d: Draft): void {
  if (d.switches.autoPause && !d.headless) d.clock = { running: false, warp: 1 };
}

/** Encendido impulsivo. Devuelve false (y lo anota en el log) si está inhibido. */
export function executeBurn(
  d: Draft,
  system: PropSystem,
  dv: DeltaV,
  title: string,
  eventId: EventId | null,
): boolean {
  const mag = dvMagnitude(dv);
  const blocker = burnBlocker(system, mag, d.propulsion, d.vehicle);
  if (blocker) {
    logTo(d, 'WARNING', `${title}: encendido inhibido. ${blocker}.`);
    return false;
  }
  const eph = ephemerisOf(d);
  d.ship = applyBurn(d.ship, dv, referenceBody(d.ship, d.t, eph));
  d.propulsion = consume(d.propulsion, system, mag);
  pushTrail(d, d.t, d.ship);
  if (eventId) mark(d, eventId, d.ship.r, d.t);
  logTo(
    d,
    'EVENT',
    `${eventId ? `${eventId} · ` : ''}${title}: Δv ${formatDvMs(mag)} m/s (${system}).`,
    eventId ?? undefined,
  );
  d.predictionDirty = true;
  return true;
}

/** Ejecuta la maniobra de la tripulación `id` con su Δv planeado. */
export function executeManeuver(d: Draft, id: ManeuverId): boolean {
  const m = d.maneuvers[id];
  if (!executeBurn(d, m.system, m.dv, MANEUVER_TITLE[id], m.eventId)) {
    if (m.status === 'committed') setManeuver(d, id, { status: 'pending' });
    return false;
  }
  const done = { executions: m.executions + 1, lastExecutedAt: d.t };
  if (m.tig === null) {
    // Las correcciones y la maniobra manual son repetibles: vuelven a quedar en blanco.
    setManeuver(d, id, { ...done, status: 'pending', confirmed: false, computed: false, dv: ZERO_DV });
  } else {
    setManeuver(d, id, { ...done, status: 'done' });
  }
  // La guarda se cierra sola después del encendido.
  d.switches = { ...d.switches, mainArm: m.system === 'MAIN' ? false : d.switches.mainArm, auxArm: m.system === 'AUX' ? false : d.switches.auxArm };
  if (id === 'E9') {
    d.phase = 'TRANSITO_IDA';
    d.record = { ...d.record, tliAt: d.t };
  }
  return true;
}

export function separateIcps(d: Draft): void {
  if (d.vehicle.icpsSeparated) return;
  d.vehicle = { ...d.vehicle, icpsSeparated: true };
  d.record = { ...d.record, icpsSepAt: d.t };
  d.switches = { ...d.switches, icpsSepArm: false };
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
  d.vehicle = { ...d.vehicle, cmSeparated: true };
  d.record = { ...d.record, cmSepAt: d.t };
  d.switches = { ...d.switches, cmSepArm: false, mainArm: false, auxArm: false };
  mark(d, 'E13', d.ship.r, d.t);
  logTo(d, 'EVENT', 'E13 · Separación CM/SM. La nave es solo la cápsula.', 'E13');
}

function finish(d: Draft, kind: Outcome['kind'], text: string): void {
  d.outcome = { kind, t: d.t, text };
  d.clock = { running: false, warp: 1 };
  d.prediction = null;
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
      if (!isPostTli(d.phase)) {
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
        logTo(d, 'EVENT', 'E15 · Amerizaje en el Pacífico y recuperación (guionado: sin simulación atmosférica).', 'E15');
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
  for (const id of ['E4', 'E5'] as const) {
    const ab = d.autoBurns[id];
    if (ab.status !== 'pending') continue;
    once(`warp:${id}`, ab.met - 30, (x) => {
      if (!x.headless && x.clock.warp > 10) x.clock = { ...x.clock, warp: 10 };
    });
    once(`burn:${id}`, ab.met, (x) => {
      const title = id === 'E4' ? 'Elevación del perigeo' : 'Elevación del apogeo a órbita alta';
      const ok = executeBurn(x, 'ICPS', x.autoBurns[id].dv, title, id);
      x.autoBurns = { ...x.autoBurns, [id]: { ...x.autoBurns[id], status: ok ? 'done' : 'cancelled' } };
      if (ok) x.phase = id === 'E4' ? 'ORBITA_BAJA' : 'ORBITA_ALTA';
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
    if (m.tig === null || m.status === 'done') continue;
    const title = MANEUVER_TITLE[id];
    once(`lead:${id}`, m.tig - BURN_LEAD_TIME, (x) => {
      if (x.switches.autoCrew) return;
      x.proc = { ...x.proc, activeId: id, cursor: null };
      logTo(x, 'INFO', `${id} · ${title}: ventana abierta, encendido en ${BURN_LEAD_TIME} s.`);
      autoPause(x);
    });
    once(`tig:${id}`, m.tig, (x) => {
      const cur = x.maneuvers[id];
      if (cur.status === 'committed' || x.switches.autoCrew) executeManeuver(x, id);
      else logTo(x, 'CAUTION', `${id} · ${title}: pasó el instante de encendido sin ejecución.`);
    });
    once(`miss:${id}`, m.tig + BURN_WINDOW_TOLERANCE, (x) => {
      if (x.maneuvers[id].status === 'done') return;
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

/** Disparadores que dependen del estado (altitud, distancia), evaluados entre tramos. */
function stateTriggers(d: Draft): void {
  const eph = ephemerisOf(d);
  const el = earthElements(d.ship, d.t, eph);
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
 * Largo máximo de un tramo de integración. En la aproximación final a la Tierra se
 * acorta para que los disparadores por altitud (separación CM/SM) se evalúen a tiempo
 * aunque el avance pedido sea largo.
 */
function maxChunk(d: Draft): number {
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
    if (!d.outcome && (d.predictionDirty || predictionStale(d))) {
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
 * disparadores (encendidos, ventanas), procesa los eventos detectados y registra el trazo.
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
      const res = integrateWithEvents(d.ship, d.t, tb, eph, {
        hInit: d.hNext,
        maxSteps: budget,
        onSample: (t, s) => {
          if (t >= d.trailNextT) pushTrail(d, t, s);
        },
      });
      budget -= res.steps;
      d.ship = res.state;
      d.t = res.t;
      d.hNext = res.hNext;
      for (const ev of res.events) {
        handleEvent(d, ev);
        if (d.outcome) break;
      }
      if (d.outcome) break;
      stateTriggers(d);
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
