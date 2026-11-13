import {
  BURN_LEAD_TIME,
  CM_SEP_PROMPT_ALTITUDE,
  MET_E6_PROX_OPS_END,
  MET_E6_PROX_OPS_START,
  R_EARTH,
} from '../constants';
import { formatMet, formatNumber } from '../format';
import { distance } from '../math/vec3';
import { PropSystem } from '../propulsion';
import { ManeuverId, ProcedureId, SimState, ephemerisOf } from '../state';
import { phaseIndex } from './phases';

export const MANEUVER_TITLE: Readonly<Record<ManeuverId, string>> = {
  E7: 'Encendido de separación de la etapa superior (USS)',
  E8: 'Elevación del perigeo',
  E9: 'Inyección translunar (TLI)',
  E10: 'Corrección de trayectoria de ida (OTC)',
  E12: 'Corrección de trayectoria de regreso (RTC)',
  MAN: 'Maniobra manual',
};

export const SYSTEM_SWITCH: Readonly<Record<PropSystem, string>> = {
  MAIN: 'MAIN ENG',
  AUX: 'AUX THR',
  ICPS: 'ICPS',
  RCS: 'RCS',
};

export type StepKind = 'AUTO' | 'CREW';

export interface ProcStep {
  readonly text: string;
  readonly kind: StepKind;
  readonly done: boolean;
}

export interface ProcedureView {
  readonly id: ProcedureId;
  /** Código corto para la barra del visor, p. ej. "E9 TLI". */
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

const earthAltitude = (s: SimState): number =>
  distance(s.ship.r, ephemerisOf(s).earth(s.t).r) - R_EARTH;

function maneuverSteps(s: SimState, id: ManeuverId): ProcStep[] {
  const m = s.maneuvers[id];
  const sw = SYSTEM_SWITCH[m.system];
  const armed = m.system === 'MAIN' ? s.switches.mainArm : s.switches.auxArm;
  const fired = m.status === 'committed' || m.status === 'done';
  const dv = `${formatNumber(m.dv[m.axis] * 1000, 1)} m/s ${m.axis === 'radial' ? 'radial' : 'prograde'}`;
  const steps: ProcStep[] = [];
  if (m.tig !== null) {
    const open = s.t >= m.tig - BURN_LEAD_TIME || fired;
    steps.push({ text: `Verificar ventana: TIG ${formatMet(m.tig)}`, kind: 'AUTO', done: open });
    steps.push({ text: 'Orientar la nave para el encendido', kind: 'AUTO', done: open });
  } else if (id !== 'MAN') {
    const target = id === 'E10' ? 'sobrevuelo a 6.513 km' : 'corredor de entrada';
    steps.push({ text: `Calcular corrección (tecla CALC): ${target}`, kind: 'CREW', done: m.computed });
  } else {
    steps.push({ text: 'Cargar Δv con las teclas ΔV (modo ADV)', kind: 'CREW', done: m.dv[m.axis] !== 0 });
  }
  steps.push({ text: `Armar ${sw}: levantar la guarda`, kind: 'CREW', done: armed || fired });
  steps.push({ text: `Confirmar Δv planeado: ${dv}`, kind: 'CREW', done: m.confirmed || fired });
  steps.push({ text: `Ejecutar: accionar ${sw}`, kind: 'CREW', done: fired });
  if (m.tig !== null) steps.push({ text: 'Encendido en TIG', kind: 'AUTO', done: m.status === 'done' });
  return steps;
}

/** Vista del procedimiento `id` con el estado de cada paso calculado desde la simulación. */
export function procedureView(s: SimState, id: ProcedureId): ProcedureView {
  if (id === 'SEP_ICPS') {
    const sep = s.vehicle.icpsSeparated;
    return {
      id,
      code: CODE[id],
      title: 'Separación Orion/ICPS y demo de proximidad',
      optional: false,
      steps: [
        { text: `Esperar fin de encendidos del ICPS: MET ${formatMet(MET_E6_PROX_OPS_START)}`, kind: 'AUTO', done: s.t >= MET_E6_PROX_OPS_START || sep },
        { text: 'Armar ICPS SEP: levantar la guarda', kind: 'CREW', done: s.switches.icpsSepArm || sep },
        { text: 'Separar: accionar ICPS SEP', kind: 'CREW', done: sep },
        { text: `Demo de proximidad hasta MET ${formatMet(MET_E6_PROX_OPS_END)}`, kind: 'AUTO', done: sep && s.t >= MET_E6_PROX_OPS_END },
      ],
    };
  }
  if (id === 'SEP_CM') {
    const sep = s.vehicle.cmSeparated;
    const near = phaseIndex(s.phase) >= phaseIndex('TRANSITO_IDA') && earthAltitude(s) < CM_SEP_PROMPT_ALTITUDE;
    return {
      id,
      code: CODE[id],
      title: 'Separación módulo de tripulación / módulo de servicio',
      optional: false,
      steps: [
        { text: `Esperar regreso: altitud < ${formatNumber(CM_SEP_PROMPT_ALTITUDE)} km`, kind: 'AUTO', done: near || sep },
        { text: 'Armar CM/SM SEP: levantar la guarda', kind: 'CREW', done: s.switches.cmSepArm || sep },
        { text: 'Separar: accionar CM/SM SEP', kind: 'CREW', done: sep },
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

/** true si el procedimiento ya no requiere nada más (para avanzar al siguiente). */
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

/** Maniobra asociada al procedimiento activo, si es un encendido. */
export function activeManeuverId(s: SimState): ManeuverId | null {
  return isManeuver(s.proc.activeId) ? s.proc.activeId : null;
}

/**
 * Índice del paso actual: el elegido con Jump to Step o, si no, el primer paso
 * pendiente que no fue salteado. Devuelve steps.length si están todos completos.
 */
export function currentStepIndex(s: SimState, view: ProcedureView): number {
  if (s.proc.cursor !== null && s.proc.cursor < view.steps.length) return s.proc.cursor;
  for (let i = 0; i < view.steps.length; i++) {
    if (!view.steps[i].done && !s.proc.skipped.includes(`${view.id}:${i}`)) return i;
  }
  return view.steps.length;
}
