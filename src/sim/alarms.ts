import { CM_SEP_PROMPT_ALTITUDE, ENTRY_CORRIDOR, R_EARTH } from './constants';
import { isPostTli } from './mission/phases';
import { earthElements } from './orbit';
import { isDvLow } from './propulsion';
import { AlarmLevel, ManeuverId, SimState, ephemerisOf } from './state';

export interface AlarmCondition {
  readonly id: string;
  readonly level: AlarmLevel;
  readonly text: string;
}

const TIMED: readonly ManeuverId[] = ['E7', 'E8', 'E9'];

/**
 * Condiciones de Master Alarm activas en este estado.
 * WARNING (rojo): impacto o reentrada predichos, ventana de encendido perdida.
 * CAUTION (ámbar): entrada fuera del corredor, sin retorno, Δv bajo, pérdida de señal.
 */
export function evaluateAlarms(s: SimState): AlarmCondition[] {
  const out: AlarmCondition[] = [];
  if (s.outcome) return out;
  const p = s.prediction;
  const postTli = isPostTli(s.phase);

  if (p?.end === 'moon-impact') {
    out.push({ id: 'moon-impact', level: 'WARNING', text: 'IMPACTO LUNAR PREDICHO' });
  }
  // En la órbita de inserción el perigeo bajo es nominal mientras E4 siga programado.
  const e4 = s.autoBurns.E4.status;
  const insertionNominal = s.phase === 'INSERCION' && (e4 === 'pending' || e4 === 'burning');
  if (p?.end === 'ei' && !postTli && !insertionNominal) {
    out.push({ id: 'reentry', level: 'WARNING', text: 'REENTRADA PREDICHA' });
  }
  for (const id of TIMED) {
    if (s.maneuvers[id].status === 'missed') {
      out.push({ id: `missed:${id}`, level: 'WARNING', text: `VENTANA ${id} PERDIDA` });
    }
  }
  if (postTli && p) {
    if (p.ei) {
      if (p.ei.fpaDeg > ENTRY_CORRIDOR.max || p.ei.fpaDeg < ENTRY_CORRIDOR.min) {
        out.push({ id: 'corridor', level: 'CAUTION', text: 'EI PREDICHA FUERA DEL CORREDOR' });
      }
    } else if (p.end === 'horizon') {
      out.push({ id: 'no-return', level: 'CAUTION', text: 'SIN RETORNO PREDICHO' });
    }
  }
  if (isDvLow(s.propulsion) && s.vehicle.icpsSeparated && !s.vehicle.cmSeparated) {
    out.push({ id: 'dv-low', level: 'CAUTION', text: 'PROPELENTE BAJO' });
  }
  if (s.comms.los) {
    out.push({ id: 'los', level: 'CAUTION', text: 'LOS · SIN ENLACE CON TIERRA' });
  }
  // Con tripulación automática la separación ocurre sola más abajo: no hace falta avisar.
  if (postTli && !s.vehicle.cmSeparated && !s.switches.autoCrew) {
    const el = earthElements(s.ship, s.t, ephemerisOf(s));
    if (el.radialSpeed < 0 && el.r - R_EARTH < CM_SEP_PROMPT_ALTITUDE) {
      out.push({ id: 'cm-sep', level: 'CAUTION', text: 'SEPARACIÓN CM/SM PENDIENTE' });
    }
  }
  return out;
}
