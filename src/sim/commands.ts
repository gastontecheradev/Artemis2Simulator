import { Draft, advance, executeManeuver, logTo, produce, separateCm, separateIcps, setManeuver } from './advance';
import { dvMagnitude } from './burns';
import { BURN_LEAD_TIME, WARP_LEVELS } from './constants';
import { formatDvMs, formatMet } from './format';
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
import { InitOptions, ProcedureId, SimState, SwitchName, createInitialState } from './state';

/**
 * API de comandos: todo lo que la UI puede hacerle a la simulación pasa por acá.
 * Cada comando es una función pura estado → estado.
 */

/** Avanza un frame: `frameDt` segundos reales por la velocidad de simulación. */
export const tick = (s: SimState, frameDt: number): SimState => advance(s, frameDt * s.clock.warp);

export const play = (s: SimState): SimState =>
  s.outcome || s.clock.running ? s : { ...s, clock: { ...s.clock, running: true } };

export const pause = (s: SimState): SimState =>
  s.clock.running ? { ...s, clock: { ...s.clock, running: false } } : s;

export const togglePlay = (s: SimState): SimState => (s.clock.running ? pause(s) : play(s));

export function setWarp(s: SimState, warp: number): SimState {
  const w = WARP_LEVELS.includes(warp as (typeof WARP_LEVELS)[number]) ? warp : 1;
  // Un cambio manual cancela la restauración automática pendiente.
  return w === s.clock.warp ? s : { ...s, clock: { ...s.clock, warp: w }, warpRestore: null };
}

export const reset = (params: MissionParams, opts: InitOptions = {}): SimState =>
  produce(createInitialState(params, opts), () => undefined);

/** Reconoce todas las alarmas activas (apaga el Master Alarm). */
export function ackAlarms(s: SimState): SimState {
  if (s.alarms.every((a) => a.acked)) return s;
  return { ...s, alarms: s.alarms.map((a) => (a.acked ? a : { ...a, acked: true })) };
}

/** Acciona un interruptor. Bajar la guarda de un motor desarma y descompromete el encendido. */
export function setSwitch(s: SimState, name: SwitchName, value: boolean): SimState {
  if (s.switches[name] === value || s.outcome) return s;
  return produce(s, (d) => {
    d.switches = { ...d.switches, [name]: value };
    if (!value && (name === 'mainArm' || name === 'auxArm')) {
      const system = name === 'mainArm' ? 'MAIN' : 'AUX';
      for (const m of Object.values(d.maneuvers)) {
        if (m.system === system && m.status === 'committed') {
          setManeuver(d, m.id, { status: 'pending' });
          logTo(d, 'INFO', `${m.id} · ${SYSTEM_SWITCH[system]} desarmado: encendido cancelado.`);
        }
      }
    }
    if (name === 'autoCrew') {
      logTo(d, 'INFO', value ? 'Tripulación automática activada.' : 'Tripulación automática desactivada.');
    }
  });
}

/**
 * Acciona el interruptor de un motor (FIRE). Requiere guarda levantada, maniobra
 * cargada en Procs para ese sistema y Δv confirmado. Antes del TIG el encendido
 * queda comprometido y se ejecuta solo en el TIG; después del TIG se ejecuta ya.
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
      logTo(d, 'INFO', `${sw}: no hay una maniobra de este sistema cargada en Procs.`);
      return;
    }
    if (m.status === 'done' || m.status === 'committed') return;
    if (!m.confirmed) {
      logTo(d, 'CAUTION', `${id} · Δv sin confirmar: confirmar en Procs antes de ejecutar.`);
      return;
    }
    const blocker = burnBlocker(system, dvMagnitude(m.dv), d.propulsion, d.vehicle);
    if (blocker) {
      logTo(d, 'WARNING', `${id} · ${MANEUVER_TITLE[id]}: encendido inhibido. ${blocker}.`);
      return;
    }
    if (m.tig !== null && d.t < m.tig) {
      const windowSkipped = d.proc.skipped.includes(`${id}:0`);
      if (d.t < m.tig - BURN_LEAD_TIME && !windowSkipped) {
        logTo(d, 'CAUTION', `${id} · Fuera de ventana: TIG ${formatMet(m.tig)}.`);
        return;
      }
      setManeuver(d, id, { status: 'committed' });
      logTo(d, 'INFO', `${id} · Encendido comprometido para TIG ${formatMet(m.tig)}.`);
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

/** Skip: saltea el paso actual. Saltear la confirmación equivale a aceptar el Δv planeado. */
export function skipStep(s: SimState): SimState {
  const view = procedureView(s, s.proc.activeId);
  const i = currentStepIndex(s, view);
  if (i >= view.steps.length) return s;
  return produce(s, (d: Draft) => {
    d.proc = { ...d.proc, cursor: null, skipped: [...d.proc.skipped, `${view.id}:${i}`] };
    const id = activeManeuverId(d);
    if (id && view.steps[i].text.startsWith('Confirmar')) setManeuver(d, id, { confirmed: true });
  });
}

/** Jump to Step: mueve el cursor al paso siguiente (cíclico). */
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

/** Ajusta el Δv planeado de la maniobra activa (solo en modo avanzado). */
export function adjustDv(s: SimState, delta: number): SimState {
  const id = activeManeuverId(s);
  if (!id || !s.proc.advanced) return s;
  const m = s.maneuvers[id];
  if (m.status === 'done' || m.status === 'committed') return s;
  return produce(s, (d) => {
    const value = Math.round((m.dv[m.axis] + delta) * 1e7) / 1e7;
    setManeuver(d, id, { dv: { ...m.dv, [m.axis]: value }, confirmed: false });
  });
}

/** Cambia el sistema de la maniobra manual entre motor principal y auxiliares. */
export function toggleManualSystem(s: SimState): SimState {
  const m = s.maneuvers.MAN;
  return produce(s, (d) => setManeuver(d, 'MAN', { system: m.system === 'MAIN' ? 'AUX' : 'MAIN' }));
}

/** Guiado: calcula el Δv de la corrección activa (OTC u RTC). */
export function computeCorrection(s: SimState): SimState {
  const id = activeManeuverId(s);
  if (id !== 'E10' && id !== 'E12') return s;
  return produce(s, (d) => {
    const m = d.maneuvers[id];
    const res = solveCorrection(d, id === 'E10' ? 'flyby' : 'entry', m.axis);
    if (res.ok) {
      setManeuver(d, id, { dv: { ...m.dv, [m.axis]: res.dv }, computed: true, confirmed: false });
      logTo(d, 'INFO', `${id} · Guiado: Δv ${formatDvMs(res.dv)} m/s (${res.message}).`);
    } else {
      logTo(d, 'CAUTION', `${id} · Guiado: ${res.message}.`);
    }
  });
}
