import { burnDirection, dvMagnitude } from '../burns';
import {
  ATTITUDE_TOLERANCE,
  BURN_LEAD_TIME,
  CM_SEP_PROMPT_LEAD_TIME,
  MET_E6_PROX_OPS_END,
  MET_E6_PROX_OPS_START,
} from '../constants';
import { formatMet, formatNumber } from '../format';
import { tr } from '../i18n';
import { angleBetween } from '../math/vec3';
import { timeToEntry } from '../orbit';
import { PropSystem } from '../propulsion';
import { ManeuverId, ProcedureId, SimState, ephemerisOf } from '../state';
import { phaseIndex } from './phases';

/** Maneuver titles in the current language (read on every access). */
export const MANEUVER_TITLE: Readonly<Record<ManeuverId, string>> = new Proxy({} as Record<ManeuverId, string>, {
  get: (_t, id: string) => tr(`man.${id as ManeuverId}`),
});

export const SYSTEM_SWITCH: Readonly<Record<PropSystem, string>> = {
  MAIN: 'MAIN ENG',
  AUX: 'AUX THR',
  ICPS: 'ICPS',
  RCS: 'RCS',
};

export type StepKind = 'AUTO' | 'CREW';

export interface ProcStep {
  /** Stable step identifier (language-independent). */
  readonly key: string;
  readonly text: string;
  readonly kind: StepKind;
  readonly done: boolean;
}

export interface ProcedureView {
  readonly id: ProcedureId;
  /** Short code for the viewer bar, e.g. "E9 TLI". */
  readonly code: string;
  readonly title: string;
  readonly optional: boolean;
  readonly steps: readonly ProcStep[];
}

export const PROCEDURE_ORDER: readonly ProcedureId[] = ['SEP_ICPS', 'E7', 'E8', 'E9', 'E10', 'E12', 'SEP_CM', 'MAN'];

const CODE: Readonly<Record<ProcedureId, string>> = {
  SEP_ICPS: 'E6 ICPS SEP',
  E7: 'E7 USS',
  E8: 'E8 PRM',
  E9: 'E9 TLI',
  E10: 'E10 OTC',
  E12: 'E12 RTC',
  SEP_CM: 'E13 CM/SM SEP',
  MAN: 'MANUAL',
};

const isManeuver = (id: ProcedureId): id is ManeuverId => id !== 'SEP_ICPS' && id !== 'SEP_CM';

function maneuverSteps(s: SimState, id: ManeuverId): ProcStep[] {
  const m = s.maneuvers[id];
  const sw = SYSTEM_SWITCH[m.system];
  const armed = m.system === 'MAIN' ? s.switches.mainArm : s.switches.auxArm;
  const fired = m.status === 'committed' || m.status === 'burning' || m.status === 'done';
  // The spacecraft is aligned when its axis points in the burn direction.
  const aligned =
    dvMagnitude(m.dv) > 0 &&
    angleBetween(s.attitude.dir, burnDirection(m.dv, ephemerisOf(s))(s.t, s.ship.r, s.ship.v)) < ATTITUDE_TOLERANCE;
  const dv = `${formatNumber(m.dv[m.axis] * 1000, 1)} m/s ${tr(m.axis === 'radial' ? 'proc.radial' : 'proc.prograde')}`;
  const steps: ProcStep[] = [];
  if (m.tig !== null) {
    const open = s.t >= m.tig - BURN_LEAD_TIME || fired;
    steps.push({ key: 'window', text: tr('proc.window', { tig: formatMet(m.tig) }), kind: 'AUTO', done: open });
    steps.push({ key: 'orient', text: tr('proc.orient'), kind: 'AUTO', done: (open && aligned) || fired });
  } else if (id !== 'MAN') {
    steps.push({ key: 'calc', text: tr('proc.calc', { target: tr(id === 'E10' ? 'proc.targetFlyby' : 'proc.targetCorridor') }), kind: 'CREW', done: m.computed });
  } else {
    steps.push({ key: 'load', text: tr('proc.loadDv'), kind: 'CREW', done: m.dv[m.axis] !== 0 });
  }
  if (m.tig === null) steps.push({ key: 'orient', text: tr('proc.orient'), kind: 'AUTO', done: aligned || fired });
  steps.push({ key: 'arm', text: tr('proc.arm', { sw }), kind: 'CREW', done: armed || fired });
  steps.push({ key: 'confirm', text: tr('proc.confirm', { dv }), kind: 'CREW', done: m.confirmed || fired });
  steps.push({ key: 'execute', text: tr('proc.execute', { sw }), kind: 'CREW', done: fired });
  if (m.tig !== null) steps.push({ key: 'tig', text: tr('proc.tigAuto'), kind: 'AUTO', done: m.status === 'done' });
  return steps;
}

/** View of procedure `id` with the status of each step computed from the simulation. */
export function procedureView(s: SimState, id: ProcedureId): ProcedureView {
  if (id === 'SEP_ICPS') {
    const sep = s.vehicle.icpsSeparated;
    return {
      id,
      code: CODE[id],
      title: tr('proc.sepIcps.title'),
      optional: false,
      steps: [
        { key: 'wait', text: tr('proc.waitIcps', { met: formatMet(MET_E6_PROX_OPS_START) }), kind: 'AUTO', done: s.t >= MET_E6_PROX_OPS_START || sep },
        { key: 'arm', text: tr('proc.armIcps'), kind: 'CREW', done: s.switches.icpsSepArm || sep },
        { key: 'fire', text: tr('proc.fireIcps'), kind: 'CREW', done: sep },
        { key: 'demo', text: tr('proc.proxDemo', { met: formatMet(MET_E6_PROX_OPS_END) }), kind: 'AUTO', done: sep && s.t >= MET_E6_PROX_OPS_END },
      ],
    };
  }
  if (id === 'SEP_CM') {
    const sep = s.vehicle.cmSeparated;
    const near = phaseIndex(s.phase) >= phaseIndex('TRANSITO_IDA') && timeToEntry(s) <= CM_SEP_PROMPT_LEAD_TIME;
    return {
      id,
      code: CODE[id],
      title: tr('proc.sepCm.title'),
      optional: false,
      steps: [
        { key: 'wait', text: tr('proc.waitReturn', { min: formatNumber(CM_SEP_PROMPT_LEAD_TIME / 60) }), kind: 'AUTO', done: near || sep },
        { key: 'arm', text: tr('proc.armCm'), kind: 'CREW', done: s.switches.cmSepArm || sep },
        { key: 'fire', text: tr('proc.fireCm'), kind: 'CREW', done: sep },
      ],
    };
  }
  return {
    id,
    code: CODE[id],
    title: MANEUVER_TITLE[id],
    optional: id === 'E10' || id === 'E12' || id === 'MAN',
    steps: maneuverSteps(s, id),
  };
}

/** true if the procedure no longer requires anything (to advance to the next one). */
export function procedureComplete(s: SimState, id: ProcedureId): boolean {
  switch (id) {
    case 'SEP_ICPS':
      return s.vehicle.icpsSeparated && s.t >= MET_E6_PROX_OPS_END;
    case 'SEP_CM':
      return s.vehicle.cmSeparated;
    case 'E10':
      return phaseIndex(s.phase) >= phaseIndex('SOBREVUELO');
    case 'E12':
      return s.oneShots.includes('cm:prompt') || s.vehicle.cmSeparated;
    case 'MAN':
      return false;
    default:
      return s.maneuvers[id].status === 'done';
  }
}

export function firstIncompleteProcedure(s: SimState): ProcedureId | null {
  for (const id of PROCEDURE_ORDER) {
    if (id !== 'MAN' && !procedureComplete(s, id)) return id;
  }
  return null;
}

/** Maneuver associated with the active procedure, if it is a burn. */
export function activeManeuverId(s: SimState): ManeuverId | null {
  return isManeuver(s.proc.activeId) ? s.proc.activeId : null;
}

/**
 * Index of the current step: the one chosen with Jump to Step or, otherwise, the first
 * pending step that was not skipped. Returns steps.length if all are complete.
 */
export function currentStepIndex(s: SimState, view: ProcedureView): number {
  if (s.proc.cursor !== null && s.proc.cursor < view.steps.length) return s.proc.cursor;
  for (let i = 0; i < view.steps.length; i++) {
    if (!view.steps[i].done && !s.proc.skipped.includes(`${view.id}:${i}`)) return i;
  }
  return view.steps.length;
}
