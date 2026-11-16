import {
  MET_CORE_SEPARATION,
  MET_E4_PERIGEE_RAISE,
  MET_E5_APOGEE_RAISE,
  MET_E6_PROX_OPS_START,
} from '../constants';
import { tr } from '../i18n';
import type { SimState } from '../state';
import { MissionParams } from './params';

export type EventId =
  | 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6' | 'E7' | 'E8'
  | 'E9' | 'E10' | 'E11' | 'E12' | 'E13' | 'E14' | 'E15';

export type Responsible = 'AUTO' | 'CREW' | 'NONE';

export interface MissionEvent {
  readonly id: EventId;
  /** Event number in 1.png. */
  readonly n: number;
  readonly name: string;
  /** Short name for tables and countdowns. */
  readonly short: string;
  readonly responsible: Responsible;
  /** Nominal MET (s). null if it depends on the trajectory. */
  readonly met: number | null;
}

/** Events E1–E15 with the numbering of docs/reference/1.png. */
export function timeline(params: MissionParams): readonly MissionEvent[] {
  const b = params.burns;
  const n = params.nominal;
  const ev = (id: EventId, responsible: Responsible, met: number | null): MissionEvent => ({
    id,
    n: eventNumber(id),
    name: tr(`ev.${id}.name`),
    short: tr(`ev.${id}.short`),
    responsible,
    met,
  });
  return [
    ev('E1', 'NONE', 0),
    ev('E2', 'NONE', 128),
    ev('E3', 'NONE', MET_CORE_SEPARATION),
    ev('E4', 'AUTO', MET_E4_PERIGEE_RAISE),
    ev('E5', 'AUTO', MET_E5_APOGEE_RAISE),
    ev('E6', 'CREW', MET_E6_PROX_OPS_START),
    ev('E7', 'CREW', b.E7.met),
    ev('E8', 'CREW', b.E8.met),
    ev('E9', 'CREW', b.E9.met),
    ev('E10', 'CREW', b.E9.met + 86400),
    ev('E11', 'NONE', n.flybyMet || null),
    ev('E12', 'CREW', null),
    ev('E13', 'CREW', null),
    ev('E14', 'NONE', n.eiMet || null),
    ev('E15', 'NONE', n.eiMet || null),
  ];
}

export const eventNumber = (id: EventId): number => Number(id.slice(1));

export interface TimelineRow extends MissionEvent {
  readonly done: boolean;
  /** Actual MET if it already happened; otherwise the nominal one (or the predicted one when there is a prediction). */
  readonly time: number | null;
  /** true if `time` comes from the predicted trajectory and not from the plan. */
  readonly predicted: boolean;
}

/** Status of each mission event: done or pending, with its actual, predicted or nominal MET. */
export function timelineStatus(s: SimState): TimelineRow[] {
  const p = s.prediction;
  return timeline(s.params).map((ev) => {
    const marker = s.markers.find((m) => m.eventId === ev.id);
    // E1 and E2 happened even if the simulation started at E3.
    const before = (ev.id === 'E1' || ev.id === 'E2') && ev.met !== null && s.t >= ev.met;
    if (ev.id === 'E15') return { ...ev, done: s.outcome?.kind === 'success', time: s.outcome?.kind === 'success' ? s.outcome.t : (p?.ei?.t ?? ev.met), predicted: !s.outcome && !!p?.ei };
    if (marker || before) return { ...ev, done: true, time: marker ? marker.t : ev.met, predicted: false };
    if (ev.id === 'E11' && p?.perilune && p.perilune.t > s.t) return { ...ev, done: false, time: p.perilune.t, predicted: true };
    if (ev.id === 'E14' && p?.ei) return { ...ev, done: false, time: p.ei.t, predicted: true };
    return { ...ev, done: false, time: ev.met, predicted: false };
  });
}

export interface NextEvent {
  readonly id: EventId;
  readonly short: string;
  readonly t: number;
}

/** Next event with a known instant (planned or predicted), for the countdown. */
export function nextEvent(s: SimState): NextEvent | null {
  if (s.outcome) return null;
  let best: NextEvent | null = null;
  for (const row of timelineStatus(s)) {
    if (row.done || row.time === null || row.time <= s.t || row.id === 'E15') continue;
    // E10 and E12 are spans, not instants; E6–E9 only count while still pending.
    if (row.id === 'E10' || row.id === 'E12') continue;
    if (!best || row.time < best.t) best = { id: row.id, short: row.short, t: row.time };
  }
  return best;
}
