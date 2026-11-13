import {
  MET_CORE_SEPARATION,
  MET_E4_PERIGEE_RAISE,
  MET_E5_APOGEE_RAISE,
  MET_E6_PROX_OPS_START,
} from '../constants';
import type { SimState } from '../state';
import { MissionParams } from './params';

export type EventId =
  | 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6' | 'E7' | 'E8'
  | 'E9' | 'E10' | 'E11' | 'E12' | 'E13' | 'E14' | 'E15';

export type Responsible = 'AUTO' | 'CREW' | 'NONE';

export interface MissionEvent {
  readonly id: EventId;
  /** Número del evento en 1.png. */
  readonly n: number;
  readonly name: string;
  /** Nombre corto para tablas y cuentas regresivas. */
  readonly short: string;
  readonly responsible: Responsible;
  /** MET nominal (s). null si depende de la trayectoria. */
  readonly met: number | null;
}

/** Eventos E1–E15 con la numeración de docs/reference/1.png. */
export function timeline(params: MissionParams): readonly MissionEvent[] {
  const b = params.burns;
  const n = params.nominal;
  return [
    { id: 'E1', n: 1, name: 'Lanzamiento desde LC‑39B', short: 'LANZAMIENTO', responsible: 'NONE', met: 0 },
    { id: 'E2', n: 2, name: 'Separación de boosters, carenados y LAS', short: 'SEP SRB / LAS', responsible: 'NONE', met: 128 },
    { id: 'E3', n: 3, name: 'MECO y separación de la etapa central', short: 'MECO / SEP', responsible: 'NONE', met: MET_CORE_SEPARATION },
    { id: 'E4', n: 4, name: 'Elevación del perigeo (ICPS)', short: 'PERIGEO ICPS', responsible: 'AUTO', met: MET_E4_PERIGEE_RAISE },
    { id: 'E5', n: 5, name: 'Elevación del apogeo a órbita alta (ICPS)', short: 'APOGEO ICPS', responsible: 'AUTO', met: MET_E5_APOGEE_RAISE },
    { id: 'E6', n: 6, name: 'Separación Orion/ICPS y demo de proximidad', short: 'ICPS SEP', responsible: 'CREW', met: MET_E6_PROX_OPS_START },
    { id: 'E7', n: 7, name: 'Encendido de separación de la etapa superior (USS)', short: 'USS', responsible: 'CREW', met: b.E7.met },
    { id: 'E8', n: 8, name: 'Elevación del perigeo (Orion)', short: 'PERIGEO ORION', responsible: 'CREW', met: b.E8.met },
    { id: 'E9', n: 9, name: 'Inyección translunar (TLI)', short: 'TLI', responsible: 'CREW', met: b.E9.met },
    { id: 'E10', n: 10, name: 'Tránsito de ida y correcciones (OTC)', short: 'TRÁNSITO IDA', responsible: 'CREW', met: b.E9.met + 86400 },
    { id: 'E11', n: 11, name: 'Sobrevuelo lunar', short: 'SOBREVUELO', responsible: 'NONE', met: n.flybyMet || null },
    { id: 'E12', n: 12, name: 'Regreso y correcciones (RTC)', short: 'REGRESO', responsible: 'CREW', met: null },
    { id: 'E13', n: 13, name: 'Separación CM/SM', short: 'CM/SM SEP', responsible: 'CREW', met: null },
    { id: 'E14', n: 14, name: 'Interfaz de entrada (EI)', short: 'ENTRADA EI', responsible: 'NONE', met: n.eiMet || null },
    { id: 'E15', n: 15, name: 'Amerizaje en el Pacífico', short: 'AMERIZAJE', responsible: 'NONE', met: n.eiMet || null },
  ];
}

export const eventNumber = (id: EventId): number => Number(id.slice(1));

export interface TimelineRow extends MissionEvent {
  readonly done: boolean;
  /** MET real si ya ocurrió; si no, el nominal (o el predicho cuando hay predicción). */
  readonly time: number | null;
  /** true si `time` viene de la trayectoria predicha y no del plan. */
  readonly predicted: boolean;
}

/** Estado de cada evento de la misión: hecho o pendiente, con su MET real, predicho o nominal. */
export function timelineStatus(s: SimState): TimelineRow[] {
  const p = s.prediction;
  return timeline(s.params).map((ev) => {
    const marker = s.markers.find((m) => m.eventId === ev.id);
    // E1 y E2 ocurrieron aunque la simulación haya arrancado en E3.
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

/** Próximo evento con instante conocido (planificado o predicho), para la cuenta regresiva. */
export function nextEvent(s: SimState): NextEvent | null {
  if (s.outcome) return null;
  let best: NextEvent | null = null;
  for (const row of timelineStatus(s)) {
    if (row.done || row.time === null || row.time <= s.t || row.id === 'E15') continue;
    // E10 y E12 son tramos, no instantes; E6–E9 solo cuentan mientras sigan pendientes.
    if (row.id === 'E10' || row.id === 'E12') continue;
    if (!best || row.time < best.t) best = { id: row.id, short: row.short, t: row.time };
  }
  return best;
}
