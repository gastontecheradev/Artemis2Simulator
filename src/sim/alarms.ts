import { CM_SEP_PROMPT_LEAD_TIME, ENTRY_CORRIDOR } from './constants';
import { tr } from './i18n';
import { isPostTli } from './mission/phases';
import { timeToEntry } from './orbit';
import { isDvLow } from './propulsion';
import { AlarmLevel, ManeuverId, SimState } from './state';

export interface AlarmCondition {
  readonly id: string;
  readonly level: AlarmLevel;
  readonly text: string;
}

const TIMED: readonly ManeuverId[] = ['E7', 'E8', 'E9'];

/**
 * Master Alarm conditions active in this state.
 * WARNING (red): predicted impact or reentry, missed burn window.
 * CAUTION (amber): entry outside the corridor, no return, low Δv, loss of signal.
 */
export function evaluateAlarms(s: SimState): AlarmCondition[] {
  const out: AlarmCondition[] = [];
  if (s.outcome) return out;
  const p = s.prediction;
  const postTli = isPostTli(s.phase);

  if (p?.end === 'moon-impact') {
    out.push({ id: 'moon-impact', level: 'WARNING', text: tr('alm.moonImpact') });
  }
  // A low perigee is nominal in the insertion orbit while E4 is still scheduled, and in
  // the high orbit (published perigee at zero altitude) while E8 is still scheduled before reentry.
  const e4 = s.autoBurns.E4.status;
  const e8 = s.maneuvers.E8;
  const insertionNominal = s.phase === 'INSERCION' && (e4 === 'pending' || e4 === 'burning');
  const heoNominal =
    (s.phase === 'ORBITA_ALTA' || s.autoBurns.E5.status === 'burning') &&
    (e8.status === 'pending' || e8.status === 'committed') &&
    e8.tig !== null &&
    (p?.ei?.t ?? 0) > e8.tig;
  // During a burn the prediction is provisional (it changes with every second of thrust): no alarm is raised for it.
  if (p?.end === 'ei' && !postTli && !insertionNominal && !heoNominal && !s.burn) {
    out.push({ id: 'reentry', level: 'WARNING', text: tr('alm.reentry') });
  }
  for (const id of TIMED) {
    if (s.maneuvers[id].status === 'missed') {
      out.push({ id: `missed:${id}`, level: 'WARNING', text: tr('alm.missed', { id }) });
    }
  }
  if (postTli && p) {
    if (p.ei) {
      if (p.ei.fpaDeg > ENTRY_CORRIDOR.max || p.ei.fpaDeg < ENTRY_CORRIDOR.min) {
        out.push({ id: 'corridor', level: 'CAUTION', text: tr('alm.corridor') });
      }
    } else if (p.end === 'horizon') {
      out.push({ id: 'no-return', level: 'CAUTION', text: tr('alm.noReturn') });
    }
  }
  if (isDvLow(s.propulsion) && s.vehicle.icpsSeparated && !s.vehicle.cmSeparated) {
    out.push({ id: 'dv-low', level: 'CAUTION', text: tr('alm.dvLow') });
  }
  if (s.comms.los) {
    out.push({ id: 'los', level: 'CAUTION', text: tr('alm.los') });
  }
  // With the automatic crew the separation happens on its own further down: no need to warn.
  if (postTli && !s.vehicle.cmSeparated && !s.switches.autoCrew && timeToEntry(s) <= CM_SEP_PROMPT_LEAD_TIME) {
    out.push({ id: 'cm-sep', level: 'CAUTION', text: tr('alm.cmSep') });
  }
  return out;
}
