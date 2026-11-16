import { Draft, advance, endBurn, executeManeuver, logTo, produce, separateCm, separateIcps, setManeuver } from './advance';
import { dvMagnitude } from './burns';
import { BURN_LEAD_TIME, WARP_LEVELS } from './constants';
import { formatDvMs, formatMet } from './format';
import { tr } from './i18n';
import { solveCorrection } from './guidance';
import { MissionParams } from './mission/params';
import {
  MANEUVER_TITLE,
  PROCEDURE_ORDER,
  SYSTEM_SWITCH,
  activeManeuverId,
  currentStepIndex,
  procedureView,
} from './mission/procedures';
import { burnBlocker } from './propulsion';
import { DapMode, InitOptions, ProcedureId, SimState, SwitchName, createInitialState } from './state';

/**
 * Command API: everything the UI can do to the simulation goes through here.
 * Each command is a pure state → state function.
 */

/** Advances one frame: `frameDt` real seconds times the simulation speed. */
export const tick = (s: SimState, frameDt: number): SimState => advance(s, frameDt * s.clock.warp);

export const play = (s: SimState): SimState =>
  s.outcome || s.clock.running ? s : { ...s, clock: { ...s.clock, running: true } };

export const pause = (s: SimState): SimState =>
  s.clock.running ? { ...s, clock: { ...s.clock, running: false } } : s;

export const togglePlay = (s: SimState): SimState => (s.clock.running ? pause(s) : play(s));

export function setWarp(s: SimState, warp: number): SimState {
  const w = WARP_LEVELS.includes(warp as (typeof WARP_LEVELS)[number]) ? warp : 1;
  // A manual change cancels the pending automatic restore.
  return w === s.clock.warp ? s : { ...s, clock: { ...s.clock, warp: w }, warpRestore: null };
}

export const reset = (params: MissionParams, opts: InitOptions = {}): SimState =>
  produce(createInitialState(params, opts), () => undefined);

/** Acknowledges all active alarms (turns off the Master Alarm). */
export function ackAlarms(s: SimState): SimState {
  if (s.alarms.every((a) => a.acked)) return s;
  return { ...s, alarms: s.alarms.map((a) => (a.acked ? a : { ...a, acked: true })) };
}

/** Actuates a switch. Lowering an engine's guard disarms it and uncommits the burn. */
export function setSwitch(s: SimState, name: SwitchName, value: boolean): SimState {
  if (s.switches[name] === value || s.outcome) return s;
  return produce(s, (d) => {
    d.switches = { ...d.switches, [name]: value };
    if (!value && (name === 'mainArm' || name === 'auxArm')) {
      const system = name === 'mainArm' ? 'MAIN' : 'AUX';
      // With the engine firing, lowering the guard cuts it off.
      if (d.burn && d.burn.system === system) endBurn(d, 'cutoff');
      for (const m of Object.values(d.maneuvers)) {
        if (m.system === system && m.status === 'committed') {
          setManeuver(d, m.id, { status: 'pending' });
          logTo(d, 'INFO', tr('cmd.disarmCancel', { id: m.id, sw: SYSTEM_SWITCH[system] }));
        }
      }
    }
    if (name === 'autoCrew') {
      logTo(d, 'INFO', tr(value ? 'cmd.autoCrewOn' : 'cmd.autoCrewOff'));
    }
  });
}

/**
 * Actuates an engine switch (FIRE). Requires the guard raised, a maneuver
 * loaded in Procs for that system and a confirmed Δv. Before TIG the burn
 * is committed and executes on its own at TIG; after TIG it executes immediately.
 */
export function fireEngine(s: SimState, system: 'MAIN' | 'AUX'): SimState {
  if (s.outcome) return s;
  const armed = system === 'MAIN' ? s.switches.mainArm : s.switches.auxArm;
  if (!armed) return s;
  return produce(s, (d) => {
    const sw = SYSTEM_SWITCH[system];
    const id = activeManeuverId(d);
    const m = id ? d.maneuvers[id] : null;
    if (!id || !m || m.system !== system) {
      logTo(d, 'INFO', tr('cmd.noManeuver', { sw }));
      return;
    }
    if (m.status === 'done' || m.status === 'committed' || m.status === 'burning') return;
    if (!m.confirmed) {
      logTo(d, 'CAUTION', tr('cmd.unconfirmed', { id }));
      return;
    }
    const blocker = burnBlocker(system, dvMagnitude(m.dv), d.propulsion, d.vehicle);
    if (blocker) {
      logTo(d, 'WARNING', tr('burn.inhibited', { title: `${id} · ${MANEUVER_TITLE[id]}`, reason: blocker }));
      return;
    }
    if (m.tig !== null && d.t < m.tig) {
      const windowSkipped = d.proc.skipped.includes(`${id}:0`);
      if (d.t < m.tig - BURN_LEAD_TIME && !windowSkipped) {
        logTo(d, 'CAUTION', tr('cmd.outOfWindow', { id, tig: formatMet(m.tig) }));
        return;
      }
      setManeuver(d, id, { status: 'committed' });
      logTo(d, 'INFO', tr('cmd.committed', { id, tig: formatMet(m.tig) }));
      return;
    }
    executeManeuver(d, id);
  });
}

export function fireIcpsSeparation(s: SimState): SimState {
  if (s.outcome || !s.switches.icpsSepArm || s.vehicle.icpsSeparated) return s;
  return produce(s, separateIcps);
}

export function fireCmSeparation(s: SimState): SimState {
  if (s.outcome || !s.switches.cmSepArm || s.vehicle.cmSeparated) return s;
  return produce(s, separateCm);
}

// --- Procs ---

export function selectProcedure(s: SimState, id: ProcedureId): SimState {
  return id === s.proc.activeId ? s : { ...s, proc: { ...s.proc, activeId: id, cursor: null } };
}

export function cycleProcedure(s: SimState, dir: 1 | -1): SimState {
  const i = PROCEDURE_ORDER.indexOf(s.proc.activeId);
  const n = PROCEDURE_ORDER.length;
  return selectProcedure(s, PROCEDURE_ORDER[(i + dir + n) % n]);
}

/** Skip: skips the current step. Skipping the confirmation is equivalent to accepting the planned Δv. */
export function skipStep(s: SimState): SimState {
  const view = procedureView(s, s.proc.activeId);
  const i = currentStepIndex(s, view);
  if (i >= view.steps.length) return s;
  return produce(s, (d: Draft) => {
    d.proc = { ...d.proc, cursor: null, skipped: [...d.proc.skipped, `${view.id}:${i}`] };
    const id = activeManeuverId(d);
    if (id && view.steps[i].key === 'confirm') setManeuver(d, id, { confirmed: true });
  });
}

/** Jump to Step: moves the cursor to the next step (cyclic). */
export function jumpStep(s: SimState): SimState {
  const view = procedureView(s, s.proc.activeId);
  const n = view.steps.length;
  const next = (Math.min(currentStepIndex(s, view), n - 1) + 1) % n;
  return { ...s, proc: { ...s.proc, cursor: next } };
}

export function confirmDv(s: SimState): SimState {
  const id = activeManeuverId(s);
  if (!id || s.maneuvers[id].confirmed || s.maneuvers[id].status === 'done') return s;
  return produce(s, (d) => {
    setManeuver(d, id, { confirmed: true });
    d.proc = { ...d.proc, cursor: null };
  });
}

export const toggleAdvanced = (s: SimState): SimState => ({
  ...s,
  proc: { ...s.proc, advanced: !s.proc.advanced },
});

/** Adjusts the planned Δv of the active maneuver (advanced mode only). */
export function adjustDv(s: SimState, delta: number): SimState {
  const id = activeManeuverId(s);
  if (!id || !s.proc.advanced) return s;
  const m = s.maneuvers[id];
  if (m.status === 'done' || m.status === 'committed' || m.status === 'burning') return s;
  return produce(s, (d) => {
    const value = Math.round((m.dv[m.axis] + delta) * 1e7) / 1e7;
    setManeuver(d, id, { dv: { ...m.dv, [m.axis]: value }, confirmed: false });
  });
}

/** Switches the manual maneuver's system between main engine and auxiliaries. */
export function toggleManualSystem(s: SimState): SimState {
  const m = s.maneuvers.MAN;
  return produce(s, (d) => setManeuver(d, 'MAN', { system: m.system === 'MAIN' ? 'AUX' : 'MAIN' }));
}

/** Guidance: computes the Δv of the active correction (OTC or RTC). */
export function computeCorrection(s: SimState): SimState {
  const id = activeManeuverId(s);
  if (id !== 'E10' && id !== 'E12') return s;
  return produce(s, (d) => {
    const m = d.maneuvers[id];
    const res = solveCorrection(d, id === 'E10' ? 'flyby' : 'entry', m.axis);
    if (res.ok) {
      setManeuver(d, id, { dv: { ...m.dv, [m.axis]: res.dv }, computed: true, confirmed: false });
      logTo(d, 'INFO', tr('cmd.guidance', { id, dv: formatDvMs(res.dv), msg: res.message }));
    } else {
      logTo(d, 'CAUTION', tr('cmd.guidanceFail', { id, msg: res.message }));
    }
  });
}

// --- Attitude and hand controllers ---

/** Changes the digital autopilot (DAP) mode. During the ascent the rocket guidance is in control. */
export function setDapMode(s: SimState, mode: DapMode): SimState {
  if (s.outcome || s.attitude.mode === mode) return s;
  return produce(s, (d) => {
    if (d.phase === 'ASCENSO') {
      logTo(d, 'INFO', tr('cmd.dapAscent'));
      return;
    }
    d.attitude = { ...d.attitude, mode, rhc: 0 };
    logTo(d, 'INFO', tr('cmd.dapMode', { mode }));
  });
}

/** Rotational hand controller (RHC), pitch axis: −1, 0 or +1. Only acts with the DAP in MAN. */
export function setRhc(s: SimState, value: number): SimState {
  const v = Math.sign(value);
  if (s.outcome || s.attitude.rhc === v || s.attitude.mode !== 'MAN') return s;
  return { ...s, attitude: { ...s.attitude, rhc: v } };
}

/**
 * Translational hand controller (THC) along the spacecraft axis: +1 thrusts forward,
 * −1 backward, with the service module's reaction control thrusters
 * (or the capsule's, after separating it). Requires Orion already separated from the ICPS.
 */
export function setThc(s: SimState, value: number): SimState {
  const v = Math.sign(value);
  if (s.outcome || s.thc === v) return s;
  if (v !== 0 && !s.vehicle.icpsSeparated) {
    return produce(s, (d) => logTo(d, 'INFO', tr('cmd.thcUnavailable')));
  }
  return produce(s, (d) => {
    d.thc = v;
    d.hNext = Math.min(d.hNext, 1);
    if (v === 0) d.predictionDirty = true;
  });
}
