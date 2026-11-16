import { evaluateAlarms } from './alarms';
import { ATMOSPHERE_TOP, airVelocity } from './atmosphere';
import { DeltaV, ZERO_DV, burnDirection, dvMagnitude, referenceBody } from './burns';
import { commsStatus, losClearance, networkForAltitude } from './comms';
import {
  ATTITUDE_SLEW_RATE,
  BURN_LEAD_TIME,
  BURN_WINDOW_TOLERANCE,
  CM_SEP_LEAD_TIME,
  CM_SEP_PROMPT_LEAD_TIME,
  CUBESAT_DEPLOYMENTS,
  CUBESAT_DEPLOY_SPEED,
  EARTH_MOON_DISTANCE,
  ENTRY_CORRIDOR,
  ICPS_DISPOSAL_DV,
  LOST_DISTANCE,
  MET_E6_PROX_OPS_END,
  MET_E6_PROX_OPS_START,
  MET_ICPS_DISPOSAL,
  RHC_RATE,
  R_EARTH,
} from './constants';
import { SimEvent, integrateWithEvents } from './events';
import { formatDvMs, formatMet, formatNumber } from './format';
import { tr } from './i18n';
import { ShipState, integrate } from './integrator';
import { Vec3, add, angleBetween, cross, distance, length, normalize, rotateAbout, scale, sub } from './math/vec3';
import { ASCENT_SEQUENCE, airPathTangent, ascentDirection } from './mission/ascent';
import { isPostTli } from './mission/phases';
import { MANEUVER_TITLE, firstIncompleteProcedure, procedureComplete } from './mission/procedures';
import { EventId, eventNumber } from './mission/timeline';
import { earthElements, timeToEntry } from './orbit';
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
  padState,
} from './state';
import { ENGINES, EngineId, G0, MASS, PropLoad, SRB_SEPARATION_SPEED, TANK, TANK_COUNT, burnDuration, totalMass } from './vehicle';

/** Working copy of a state: mutated locally and returned as a new state. */
export type Draft = { -readonly [K in keyof SimState]: SimState[K] };

const DAY = 86400;
const Z: Vec3 = { x: 0, y: 0, z: 1 };
/** Cap on integrator sub-steps per call, so the browser does not freeze. */
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
  // With engines firing the trajectory changes fast: sample more often.
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
  const next = Array.from({ length: TANK_COUNT }, (_, i) => prop[i] ?? 0) as unknown as PropLoad;
  d.propulsion = { ...d.propulsion, prop: next };
};

// ---------- Forces and attitude ----------

/** Available translation thrusters: the service module's or, without it, the capsule's. */
export const thcEngine = (s: SimState): EngineId => (s.vehicle.cmSeparated ? 'CMRCS' : 'RCS');

/** Engines firing at this instant. */
export function runningEngines(s: SimState): EngineId[] {
  const engines: EngineId[] = s.phase === 'ASCENSO' ? [...s.ascentEngines] : [];
  if (s.burn) engines.push(SYSTEM_ENGINE[s.burn.system]);
  if (s.thc !== 0 && s.vehicle.icpsSeparated) {
    const e = thcEngine(s);
    if (!engines.includes(e)) engines.push(e);
  }
  return engines;
}

/**
 * Description of the non-gravitational forces in the current state, or null if the spacecraft
 * is coasting outside the atmosphere. Used by the integrator and the instruments.
 */
export function powerInputOf(s: SimState): PowerInput | null {
  const eph = ephemerisOf(s);
  const engines = runningEngines(s);
  if (engines.length === 0 && distance(s.ship.r, eph.earth(s.t).r) - R_EARTH > ATMOSPHERE_TOP + 20) return null;
  const hold = s.attitude.dir;
  const fixed = s.burn?.fixedDir ?? null;
  const direction =
    s.phase === 'ASCENSO'
      ? ascentDirection(s.params.ascent, s.ascentTan, eph)
      : s.burn && s.attitude.mode === 'AUTO'
        ? fixed
          ? () => fixed
          : burnDirection(s.burn.dv, eph)
        : () => hold;
  return { eph, cfg: s.vehicle, engines, direction, srbIgnition: 0, gLimit: s.params.ascent.gLimit, rcsSign: s.thc };
}

/** Δv of the burn the autopilot has to orient the spacecraft for, if any. */
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

/**
 * Attitude commanded by guidance: the rocket's during ascent, the upcoming burn's,
 * prograde or, with the capsule alone, retrograde (heat shield forward for entry).
 */
export function commandedDirection(s: SimState): Vec3 {
  const eph = ephemerisOf(s);
  if (s.phase === 'ASCENSO') return ascentDirection(s.params.ascent, s.ascentTan, eph)(s.t, s.ship.r, s.ship.v);
  if (s.burn?.fixedDir) return s.burn.fixedDir;
  // After E13 the spacecraft axis (the capsule's nose) points backwards: the heat
  // shield, at the base, faces the velocity, as in the real entry.
  if (s.vehicle.cmSeparated && !s.burn) return normalize(sub(referenceBody(s.ship, s.t, eph).v, s.ship.v));
  const dv = attitudeTargetDv(s);
  if (dv) return burnDirection(dv, eph)(s.t, s.ship.r, s.ship.v);
  return normalize(sub(s.ship.v, referenceBody(s.ship, s.t, eph).v));
}

/**
 * Cruise: the DAP in AUTO is only holding the spacecraft prograde (1) or, with the capsule alone,
 * retrograde (−1), with no burn in progress or upcoming, no translation and outside the
 * ascent. Returns 0 in any other case. The views use it to draw the spacecraft
 * along its trail: "prograde" is relative to the reference body, which does not match
 * the trail tangent in the rotating frame nor, near the Moon, in the inertial one.
 */
export function cruiseSense(s: SimState): 1 | -1 | 0 {
  if (s.phase === 'ASCENSO' || s.attitude.mode !== 'AUTO' || s.burn || s.thc !== 0) return 0;
  if (s.vehicle.cmSeparated) return -1;
  return attitudeTargetDv(s) === null ? 1 : 0;
}

/** Advances the attitude `dt` seconds according to the autopilot mode. */
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

// ---------- Jettisoned parts ----------


/**
 * Releases a part with a relative velocity (m/s) along an axis and sideways.
 * The booster separation velocities come from their published separation
 * motors; the rest, and the ballistic coefficients (Cd·A/m, in m²/kg), are
 * ASSUMPTIONS: orders of magnitude, not published data.
 */
function spawnDebris(
  d: Draft,
  kind: DebrisKind,
  id: string,
  /** Relative velocity (m/s): along the axis and sideways. */
  speed: readonly [number, number],
  /** Where the part's center sits relative to the spacecraft's center (m): along the axis and sideways. */
  offset: readonly [number, number],
  ballistic: number,
  from: { readonly ship: ShipState; readonly dir: Vec3 } = { ship: d.ship, dir: d.attitude.dir },
  name?: string,
): void {
  if (d.headless) return;
  const dir = from.dir;
  const side = normalize(cross(Z, dir));
  const r = add(from.ship.r, add(scale(dir, offset[0] / 1e3), scale(side, offset[1] / 1e3)));
  const v = add(from.ship.v, add(scale(dir, speed[0] / 1000), scale(side, speed[1] / 1000)));
  d.debris = [...d.debris, { id, kind, name, ship: { r, v }, t: d.t, hNext: 0.5, ballistic, since: d.t, dir }];
}

/** [SLS] ICPS disposal burn: a small retrograde impulse on the already-jettisoned stage (assumed Δv). */
function icpsDisposalBurn(d: Draft): void {
  const icps = d.debris.find((b) => b.kind === 'ICPS');
  logTo(d, 'INFO', tr('log.icpsDisposal'));
  if (!icps) return;
  const eph = ephemerisOf(d);
  const prograde = normalize(sub(icps.ship.v, eph.earth(icps.t).v));
  const ship = { r: icps.ship.r, v: sub(icps.ship.v, scale(prograde, ICPS_DISPOSAL_DV / 1000)) };
  d.debris = d.debris.map((b) => (b === icps ? { ...b, ship, hNext: 0.5 } : b));
}

/** [SLS] Release of a CubeSat from the adapter that stayed with the ICPS. */
function deployCubesat(d: Draft, i: number): void {
  const { name } = CUBESAT_DEPLOYMENTS[i];
  const icps = d.debris.find((b) => b.kind === 'ICPS');
  logTo(d, 'INFO', tr('log.cubesat', { name }));
  if (!icps) return;
  // They exit through the adapter, forward relative to the stage, each one slightly sideways.
  const sideways = [0.6, -0.6, 0.3, -0.3][i] * CUBESAT_DEPLOY_SPEED;
  // 26 kg, 0.37 × 0.24 m face and Cd ≈ 2.2 (ASSUMPTION for the ballistic coefficient).
  spawnDebris(d, 'CUBESAT', `CUBESAT-${i}`, [CUBESAT_DEPLOY_SPEED, sideways], [8, 0], 7.5e-3, { ship: icps.ship, dir: icps.dir }, name);
}

/** Propagates the jettisoned parts up to the current instant (gravity + drag). */
function advanceDebris(d: Draft): void {
  if (d.debris.length === 0) return;
  const eph = ephemerisOf(d);
  const next: Debris[] = [];
  for (const b of d.debris) {
    let cur = b;
    let gone = false;
    // The step budget grows with the lag, to catch up after a long advance.
    let budget = Math.max(400, Math.ceil((d.t - cur.t) / 2));
    while (cur.t < d.t && budget > 0 && !gone) {
      const res = integrateWithEvents(cur.ship, cur.t, d.t, eph, { power: makeDrag(eph, cur.ballistic), hInit: cur.hNext, maxSteps: budget });
      budget -= res.steps;
      cur = { ...cur, ship: res.state, t: res.t, hNext: res.hNext };
      if (!res.terminal) break;
      if (res.terminal.type === 'surface' || res.terminal.type === 'moon-impact') gone = true;
      else {
        // It crossed entry interface: keeps falling. A short segment without events avoids re-detecting the crossing.
        const step = integrate(cur.ship, cur.t, cur.t + 1, eph, { power: makeDrag(eph, cur.ballistic), hInit: 0.2 });
        cur = { ...cur, ship: step.state, t: step.t, hNext: 0.2 };
      }
    }
    if (distance(cur.ship.r, eph.earth(cur.t).r) > LOST_DISTANCE) continue;
    if (gone) {
      // Both boosters fall together: a single notice.
      if (cur.id !== 'SRB-R' && cur.kind !== 'FAIRING') {
        const at = d.t;
        d.t = cur.t;
        logTo(d, 'INFO', tr(`fall.${cur.kind}` as const, { name: cur.name ?? cur.id }));
        d.t = at;
      }
      continue;
    }
    next.push(cur);
  }
  d.debris = next;
}

// ---------- Burns ----------

const burnTitle = (id: 'E4' | 'E5' | ManeuverId): string => (id === 'E4' || id === 'E5' ? tr(`burn.${id}`) : MANEUVER_TITLE[id]);

/**
 * Fires an engine to deliver the requested Δv. The burn lasts as long as that
 * engine, with the current mass, takes to deliver that Δv; it shuts down on its own at the end (see `endBurn`).
 * Returns false (and logs it) if it is inhibited.
 */
export function startBurn(d: Draft, id: 'E4' | 'E5' | ManeuverId, system: PropSystem, dv: DeltaV, eventId: EventId | null, hold = false): boolean {
  const title = burnTitle(id);
  const mag = dvMagnitude(dv);
  const blocker = d.burn ? tr('burn.blockerOther') : mag <= 0 ? tr('burn.blockerZero') : burnBlocker(system, mag, d.propulsion, d.vehicle);
  if (blocker) {
    logTo(d, 'WARNING', tr('burn.inhibited', { title, reason: blocker }));
    return false;
  }
  const engine = ENGINES[SYSTEM_ENGINE[system]];
  const mass = totalMass(d.vehicle, d.propulsion.prop);
  const duration = burnDuration(engine, mass, mag);
  const fixedDir = hold ? burnDirection(dv, ephemerisOf(d))(d.t, d.ship.r, d.ship.v) : null;
  d.burn = { id, system, tStart: d.t, tEnd: d.t + duration, dv, massStart: mass, propStart: d.propulsion.prop[engine.tank], fixedDir };
  d.hNext = Math.min(d.hNext, 1);
  pushTrail(d, d.t, d.ship);
  if (eventId) mark(d, eventId, d.ship.r, d.t);
  logTo(
    d,
    'EVENT',
    tr('burn.ignition', { prefix: eventId ? `${eventId} · ` : '', title, system, dv: formatDvMs(mag), dur: formatNumber(duration, 0) }),
    eventId ?? undefined,
  );
  return true;
}

/** Shuts down the engine of the burn in progress and records what it delivered. */
export function endBurn(d: Draft, reason: 'complete' | 'cutoff'): void {
  const b = d.burn;
  if (!b) return;
  const engine = ENGINES[SYSTEM_ENGINE[b.system]];
  const mass = totalMass(d.vehicle, d.propulsion.prop);
  // Ideal Δv delivered (rocket equation with the mass actually consumed).
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
  const why = tr(reason === 'cutoff' ? 'burn.cutoffManual' : short ? 'burn.depleted' : 'burn.complete');
  logTo(d, short ? 'CAUTION' : 'INFO', tr('burn.end', { id: b.id, why, dv: formatDvMs(delivered), dur: formatNumber(d.t - b.tStart, 0) }));
  if (b.id === 'E4' || b.id === 'E5') {
    d.autoBurns = { ...d.autoBurns, [b.id]: { ...d.autoBurns[b.id], status: 'done' } };
    d.phase = b.id === 'E4' ? 'ORBITA_BAJA' : 'ORBITA_ALTA';
    return;
  }
  const m = d.maneuvers[b.id];
  const done = { executions: m.executions + 1, lastExecutedAt: d.t };
  if (m.tig === null) {
    // Corrections and the manual maneuver are repeatable: they go back to blank.
    setManeuver(d, b.id, { ...done, status: 'pending', confirmed: false, computed: false, dv: ZERO_DV });
  } else {
    setManeuver(d, b.id, { ...done, status: 'done' });
  }
  // The guard closes on its own after the burn.
  d.switches = { ...d.switches, mainArm: b.system === 'MAIN' ? false : d.switches.mainArm, auxArm: b.system === 'AUX' ? false : d.switches.auxArm };
  if (b.id === 'E9') {
    d.phase = 'TRANSITO_IDA';
    d.record = { ...d.record, tliAt: d.t };
  }
}

/** Fires the crew maneuver `id` with its planned Δv. */
export function executeManeuver(d: Draft, id: ManeuverId): boolean {
  const m = d.maneuvers[id];
  if (!startBurn(d, id, m.system, m.dv, m.eventId)) {
    if (m.status === 'committed') setManeuver(d, id, { status: 'pending' });
    return false;
  }
  setManeuver(d, id, { status: 'burning' });
  return true;
}

// ---------- Separations ----------

function separateSrb(d: Draft): void {
  d.vehicle = { ...d.vehicle, srbSeparated: true };
  const p = d.propulsion.prop;
  setProp(d, [0, p[1], p[2], p[3], p[4]]);
  // The 8 separation motors of each booster push it sideways (~7 m/s); the rest is the thrust of the RS‑25s that keep firing.
  spawnDebris(d, 'SRB', 'SRB-L', [-1, SRB_SEPARATION_SPEED], [-20, 6.3], 1.0e-4);
  spawnDebris(d, 'SRB', 'SRB-R', [-1, -SRB_SEPARATION_SPEED], [-20, -6.3], 1.0e-4);
  mark(d, 'E2', d.ship.r, d.t);
  logTo(d, 'EVENT', tr('log.srbSep'), 'E2');
}

function jettisonLas(d: Draft): void {
  d.vehicle = { ...d.vehicle, lasJettisoned: true };
  spawnDebris(d, 'LAS', 'LAS', [45, 12], [49, 0], 2.8e-3);
  spawnDebris(d, 'FAIRING', 'FAIRING', [-4, -10], [40, 0], 2e-2);
  logTo(d, 'EVENT', tr('log.las'), 'E2');
}

function separateCore(d: Draft): void {
  const eph = ephemerisOf(d);
  d.vehicle = { ...d.vehicle, coreSeparated: true };
  const p = d.propulsion.prop;
  spawnDebris(d, 'CORE', 'CORE', [-1.5, 0], [-45, 0], 5.5e-4);
  setProp(d, [p[0], 0, p[2], p[3], p[4]]);
  d.phase = 'INSERCION';
  d.ascentEngines = [];
  const el = earthElements(d.ship, d.t, eph);
  const speedRel = length(sub(d.ship.v, airVelocity(d.ship.r, eph.earth(d.t))));
  d.record = { ...d.record, insertion: { t: d.t, altitude: el.r - R_EARTH, speed: el.speed, speedRel, fpaDeg: el.fpaDeg } };
  mark(d, 'E3', d.ship.r, d.t);
  logTo(d, 'EVENT', tr('log.coreSep', { alt: formatNumber(el.r - R_EARTH, 1), speed: formatNumber(el.speed, 3) }), 'E3');
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
  setProp(d, [p[0], p[1], 0, p[3], p[4]]);
  mark(d, 'E6', d.ship.r, d.t);
  logTo(d, 'EVENT', tr('log.icpsSep'), 'E6');
  for (const id of ['E4', 'E5'] as const) {
    if (d.autoBurns[id].status === 'pending') {
      d.autoBurns = { ...d.autoBurns, [id]: { ...d.autoBurns[id], status: 'cancelled' } };
      logTo(d, 'WARNING', tr('log.icpsBurnCancelled', { id }));
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
  setProp(d, [p[0], p[1], p[2], 0, p[4]]);
  mark(d, 'E13', d.ship.r, d.t);
  logTo(d, 'EVENT', tr('log.cmSep'), 'E13');
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
  d.t = ev.t; // the log carries the exact instant of the event
  switch (ev.type) {
    case 'periapsis':
    case 'apoapsis': {
      const el = earthElements(ev.state, ev.t, eph);
      d.record = {
        ...d.record,
        apsides: [...d.record.apsides.slice(-49), { type: ev.type, t: ev.t, radius: el.r, energy: el.energy }],
      };
      if (!isPostTli(d.phase) && d.phase !== 'ASCENSO') {
        logTo(d, 'INFO', tr(ev.type === 'periapsis' ? 'log.perigee' : 'log.apogee', { alt: formatNumber(el.r - R_EARTH, 0) }));
      }
      break;
    }
    case 'perilune': {
      const p = periluneOf(ev, eph);
      if (!d.record.perilune || p.altitude < d.record.perilune.altitude) d.record = { ...d.record, perilune: p };
      mark(d, 'E11', ev.state.r, ev.t);
      logTo(d, 'EVENT', tr('log.flyby', { alt: formatNumber(p.altitude, 0) }), 'E11');
      break;
    }
    case 'soi-enter':
      d.phase = 'SOBREVUELO';
      logTo(d, 'INFO', tr('log.soiEnter'));
      break;
    case 'soi-exit':
      d.phase = 'REGRESO';
      mark(d, 'E12', ev.state.r, ev.t);
      logTo(d, 'INFO', tr('log.soiExit'), 'E12');
      break;
    case 'los':
      logTo(d, 'CAUTION', tr('log.los'));
      break;
    case 'aos':
      logTo(d, 'INFO', tr('log.aos'));
      break;
    case 'net-dsn':
      logTo(d, 'INFO', tr('log.netDsn'));
      break;
    case 'net-nsn':
      logTo(d, 'INFO', tr('log.netNsn'));
      break;
    case 'moon-impact':
      logTo(d, 'WARNING', tr('log.moonImpact'));
      finish(d, 'moon-impact', tr('out.moonImpact'));
      break;
    case 'surface':
      logTo(d, 'WARNING', tr('log.surface'));
      finish(d, 'crash', tr('out.crash'));
      break;
    case 'ei': {
      const el = earthElements(ev.state, ev.t, eph);
      const ei = entryInterfaceOf(ev, eph);
      d.record = { ...d.record, ei: { ...ei, rp: el.rp, energy: el.energy } };
      const postTli = isPostTli(d.phase);
      d.phase = 'ENTRADA';
      mark(d, 'E14', ev.state.r, ev.t);
      const data = tr('log.eiData', { fpa: formatNumber(ei.fpaDeg, 2), v: formatNumber(ei.speed, 3) });
      logTo(d, 'EVENT', tr('log.ei', { data }), 'E14');
      if (!postTli) {
        finish(d, 'reentry-early', tr('out.reentryEarly'));
      } else if (!d.vehicle.cmSeparated) {
        finish(d, 'entry-no-sep', tr('out.noSep'));
      } else if (ei.fpaDeg > ENTRY_CORRIDOR.max) {
        finish(d, 'entry-shallow', tr('out.shallow', { data }));
      } else if (ei.fpaDeg < ENTRY_CORRIDOR.min) {
        finish(d, 'entry-steep', tr('out.steep', { data }));
      } else {
        logTo(d, 'EVENT', tr('log.e15'), 'E15');
        finish(d, 'success', tr('out.success', { data }));
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

/** Pending time triggers (each one is consumed only once). */
function breakpoints(d: Draft): Breakpoint[] {
  const list: Breakpoint[] = [];
  const once = (key: string, t: number, apply: (d: Draft) => void): void => {
    if (!d.oneShots.includes(key)) list.push({ t, key, apply });
  };
  if (d.phase === 'ASCENSO') {
    const S = ASCENT_SEQUENCE;
    once('asc:liftoff', 0, (x) => {
      // T‑0: the boosters ignite, the umbilicals release and the rocket starts to climb.
      x.ascentEngines = ['SRB', 'RS25'];
      mark(x, 'E1', x.ship.r, 0);
      logTo(x, 'EVENT', tr('log.liftoff'), 'E1');
    });
    once('asc:pitch', S.pitchStart, (x) => logTo(x, 'INFO', tr('log.pitch')));
    // Only splits the segment: the guidance law changes form at this instant.
    once('asc:turn', S.pitchEnd, () => undefined);
    once('asc:burnout', S.srbBurnout, (x) => {
      x.ascentEngines = x.ascentEngines.filter((e) => e !== 'SRB');
      logTo(x, 'INFO', tr('log.srbBurnout'));
    });
    once('asc:srb', S.srbSeparation, separateSrb);
    once('asc:lt', S.linearTangentStart, (x) => {
      x.ascentTan = airPathTangent(x.ship.r, x.ship.v, x.t, ephemerisOf(x));
    });
    once('asc:las', S.lasJettison, jettisonLas);
    once('asc:meco', S.meco, (x) => {
      x.ascentEngines = [];
      const left = x.propulsion.prop[TANK.CORE];
      logTo(x, 'EVENT', tr('log.meco', { pct: formatNumber((100 * left) / MASS.coreProp, 1) }));
    });
    once('asc:core', S.coreSeparation, separateCore);
  }
  if (d.burn) {
    const b = d.burn;
    once(`end:${b.id}:${b.tStart}`, b.tEnd, (x) => endBurn(x, 'complete'));
  }
  for (const id of ['E4', 'E5'] as const) {
    const ab = d.autoBurns[id];
    // Past ignition it returns on its own to the previous warp, unless the crew changed it.
    once(`unwarp:${id}`, ab.met + 20, (x) => {
      if (x.warpRestore !== null && x.clock.warp === 10) x.clock = { ...x.clock, warp: x.warpRestore };
      x.warpRestore = null;
    });
    if (ab.status !== 'pending') continue;
    once(`warp:${id}`, ab.met - 30, (x) => {
      // With the automatic crew (demo mode) it does not slow down: nobody has to watch the burn.
      if (x.headless || x.switches.autoCrew || x.clock.warp <= 10) return;
      x.warpRestore = x.clock.warp;
      x.clock = { ...x.clock, warp: 10 };
    });
    once(`burn:${id}`, ab.met, (x) => {
      const ok = startBurn(x, id, 'ICPS', x.autoBurns[id].dv, id, x.autoBurns[id].hold);
      x.autoBurns = { ...x.autoBurns, [id]: { ...x.autoBurns[id], status: ok ? 'burning' : 'cancelled' } };
    });
  }
  once('e6:start', MET_E6_PROX_OPS_START, (x) => {
    if (x.vehicle.icpsSeparated) return;
    if (x.switches.autoCrew) {
      separateIcps(x);
    } else {
      x.proc = { ...x.proc, activeId: 'SEP_ICPS', cursor: null };
      logTo(x, 'INFO', tr('log.e6Window'));
      autoPause(x);
    }
  });
  once('e6:end', MET_E6_PROX_OPS_END, (x) => {
    if (x.vehicle.icpsSeparated) logTo(x, 'INFO', tr('log.e6End'));
  });
  if (d.vehicle.icpsSeparated && !d.headless) {
    once('icps:disposal', MET_ICPS_DISPOSAL, icpsDisposalBurn);
    CUBESAT_DEPLOYMENTS.forEach((c, i) => once(`cubesat:${i}`, c.met, (x) => deployCubesat(x, i)));
  }
  for (const id of ['E7', 'E8', 'E9'] as const) {
    const m = d.maneuvers[id];
    if (m.tig === null || m.status === 'done' || m.status === 'burning') continue;
    const title = MANEUVER_TITLE[id];
    once(`lead:${id}`, m.tig - BURN_LEAD_TIME, (x) => {
      if (x.switches.autoCrew) return;
      x.proc = { ...x.proc, activeId: id, cursor: null };
      logTo(x, 'INFO', tr('log.lead', { id, title, s: BURN_LEAD_TIME }));
      autoPause(x);
    });
    once(`tig:${id}`, m.tig, (x) => {
      const cur = x.maneuvers[id];
      if (cur.status === 'committed' || x.switches.autoCrew) executeManeuver(x, id);
      else logTo(x, 'CAUTION', tr('log.tigNoFire', { id, title, tig: formatMet(cur.tig ?? 0) }));
    });
    once(`miss:${id}`, m.tig + BURN_WINDOW_TOLERANCE, (x) => {
      const cur = x.maneuvers[id];
      if (cur.status === 'done' || cur.status === 'burning') return;
      setManeuver(x, id, { status: 'missed' });
      logTo(x, 'WARNING', tr('log.windowLost', { id, title }));
    });
  }
  const tli = d.record.tliAt;
  if (tli !== null) {
    once('e10:mark', tli + DAY, (x) => {
      mark(x, 'E10', x.ship.r, x.t);
      logTo(x, 'INFO', tr('log.e10'), 'E10');
    });
  }
  return list;
}

/** State-dependent triggers (altitude, distance, dynamic pressure), evaluated between segments. */
function stateTriggers(d: Draft, input: PowerInput | null): void {
  const eph = ephemerisOf(d);
  const el = earthElements(d.ship, d.t, eph);
  if (d.phase === 'ASCENSO' && input) {
    // Max Q: logged once the dynamic pressure has started to drop.
    const q = forces(input, d.t, d.ship.r, d.ship.v, d.propulsion.prop).q;
    const peak = d.record.maxQ;
    if (!peak || q > peak.q) {
      d.record = { ...d.record, maxQ: { t: d.t, q, logged: false } };
    } else if (!peak.logged && peak.q > 5000 && q < 0.97 * peak.q) {
      d.record = { ...d.record, maxQ: { ...peak, logged: true } };
      logTo(d, 'INFO', tr('log.maxQ', { q: formatNumber(peak.q / 1000, 1), met: formatMet(peak.t) }));
    }
  }
  if (el.r > LOST_DISTANCE) {
    logTo(d, 'WARNING', tr('log.lost'));
    finish(d, 'lost', tr('out.lost'));
    return;
  }
  if (!isPostTli(d.phase) || d.vehicle.cmSeparated || el.radialSpeed >= 0) return;
  // Time to entry interface from the osculating orbit (valid near Earth).
  const tEi = timeToEntry(d);
  if (tEi <= CM_SEP_PROMPT_LEAD_TIME && !d.oneShots.includes('cm:prompt')) {
    d.oneShots = [...d.oneShots, 'cm:prompt'];
    if (!d.switches.autoCrew) {
      d.proc = { ...d.proc, activeId: 'SEP_CM', cursor: null };
      logTo(d, 'INFO', tr('log.cmPrompt', { min: formatNumber(tEi / 60, 0) }));
      autoPause(d);
    }
  }
  if (d.switches.autoCrew && tEi <= CM_SEP_LEAD_TIME) separateCm(d);
}

/**
 * Maximum length of an integration segment. It is shortened when something state-dependent
 * has to be evaluated often: the final approach to Earth (CM/SM separation),
 * manual attitude control and the ascent (Max Q).
 */
function maxChunk(d: Draft): number {
  if (d.attitude.mode === 'MAN' && d.attitude.rhc !== 0) return 1;
  if ((d.burn || d.thc !== 0) && d.attitude.mode !== 'AUTO') return 2;
  if (d.phase === 'ASCENSO') return 5;
  if (!isPostTli(d.phase) || d.vehicle.cmSeparated) return Infinity;
  const el = earthElements(d.ship, d.t, ephemerisOf(d));
  if (el.radialSpeed >= 0 || el.r > 80000) return 1800;
  return timeToEntry(d) < 2 * CM_SEP_PROMPT_LEAD_TIME ? 20 : 120;
}

/**
 * Countdown: the RS‑25s start with the rocket held down on the pad. Until T‑0
 * the spacecraft follows the pad and only the propellant changes (the flow depends on
 * time, so it is integrated with Simpson's rule).
 */
function holdDown(d: Draft, until: number): void {
  const eph = ephemerisOf(d);
  const input = powerInputOf(d);
  const t0 = d.t;
  const t1 = Math.min(until, 0);
  if (input && t1 > t0) {
    const n = Math.max(2, 2 * Math.ceil((t1 - t0) / 0.1));
    const h = (t1 - t0) / n;
    const used = new Array<number>(TANK_COUNT).fill(0);
    for (let i = 0; i <= n; i++) {
      const t = t0 + i * h;
      const w = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2;
      const f = forces(input, t, d.ship.r, d.ship.v, d.propulsion.prop);
      for (let k = 0; k < TANK_COUNT; k++) used[k] += w * f.dprop[k];
    }
    setProp(d, d.propulsion.prop.map((p, k) => Math.max(0, p + (h / 3) * used[k])));
  }
  d.t = t1;
  d.ship = padState(t1, eph);
}

/** Computes the predicted trajectory (without future burns) from the current state. */
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
  // During a burn the trajectory changes all the time: it is refreshed every 20 s of mission time.
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
      // The LOS is already in the log as a communications event.
      if (c.id !== 'los') logTo(d, c.level, tr('log.alarm', { level: c.level, text: c.text }));
    }
  }
  if (next.length !== d.alarms.length || next.some((a, i) => a !== d.alarms[i])) d.alarms = next;
}

/**
 * Recomputes derived data (communications, prediction, alarms, active procedure).
 * Called at the end of every advance and every command.
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

/** Applies a local mutation to a copy of the state and recomputes derived data. */
export function produce(state: SimState, fn: (d: Draft) => void): SimState {
  const d: Draft = { ...state };
  fn(d);
  return finalize(d, state);
}

/**
 * Advances the simulation `dtSim` seconds of mission time: integrates in segments between
 * triggers (engine ignition and cutoff, separations, windows), processes the
 * detected events, moves the attitude and records the trail.
 * If `maxSteps` runs out, it advances less than requested.
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
      if (d.t < 0) {
        holdDown(d, tb);
        budget -= 1;
        continue;
      }
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
        const rcs = ENGINES[thcEngine(d)];
        const before = d.propulsion.prop[rcs.tank];
        setProp(d, res.prop);
        // Propellant spent by RCS translation also counts as Orion Δv.
        if (d.thc !== 0 && !d.burn && before > res.prop[rcs.tank]) {
          const m1 = totalMass(d.vehicle, d.propulsion.prop);
          const dv = ((G0 * rcs.ispVac) / 1000) * Math.log((m1 + before - res.prop[rcs.tank]) / m1);
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
    // Triggers that fall exactly at the end of the segment.
    while (d.clock.running && !d.outcome) {
      const due = breakpoints(d).filter((b) => b.t <= d.t).sort((a, b) => a.t - b.t)[0];
      if (!due) break;
      d.oneShots = [...d.oneShots, due.key];
      due.apply(d);
    }
  });
}
