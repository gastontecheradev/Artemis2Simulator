import {
  MET_CORE_SEPARATION,
  MET_E4_PERIGEE_RAISE,
  MET_E5_APOGEE_RAISE,
  MET_E6_PROX_OPS_START,
} from '../constants';
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
  readonly responsible: Responsible;
  /** MET nominal (s). null si depende de la trayectoria. */
  readonly met: number | null;
}

/** Eventos E1–E15 con la numeración de docs/reference/1.png. */
export function timeline(params: MissionParams): readonly MissionEvent[] {
  const b = params.burns;
  const n = params.nominal;
  return [
    { id: 'E1', n: 1, name: 'Lanzamiento desde LC‑39B', responsible: 'NONE', met: 0 },
    { id: 'E2', n: 2, name: 'Separación de boosters, carenados y LAS', responsible: 'NONE', met: 128 },
    { id: 'E3', n: 3, name: 'MECO y separación de la etapa central', responsible: 'NONE', met: MET_CORE_SEPARATION },
    { id: 'E4', n: 4, name: 'Elevación del perigeo (ICPS)', responsible: 'AUTO', met: MET_E4_PERIGEE_RAISE },
    { id: 'E5', n: 5, name: 'Elevación del apogeo a órbita alta (ICPS)', responsible: 'AUTO', met: MET_E5_APOGEE_RAISE },
    { id: 'E6', n: 6, name: 'Separación Orion/ICPS y demo de proximidad', responsible: 'CREW', met: MET_E6_PROX_OPS_START },
    { id: 'E7', n: 7, name: 'Encendido de separación de la etapa superior (USS)', responsible: 'CREW', met: b.E7.met },
    { id: 'E8', n: 8, name: 'Elevación del perigeo (Orion)', responsible: 'CREW', met: b.E8.met },
    { id: 'E9', n: 9, name: 'Inyección translunar (TLI)', responsible: 'CREW', met: b.E9.met },
    { id: 'E10', n: 10, name: 'Tránsito de ida y correcciones (OTC)', responsible: 'CREW', met: null },
    { id: 'E11', n: 11, name: 'Sobrevuelo lunar', responsible: 'NONE', met: n.flybyMet || null },
    { id: 'E12', n: 12, name: 'Regreso y correcciones (RTC)', responsible: 'CREW', met: null },
    { id: 'E13', n: 13, name: 'Separación CM/SM', responsible: 'CREW', met: null },
    { id: 'E14', n: 14, name: 'Interfaz de entrada (EI)', responsible: 'NONE', met: n.eiMet || null },
    { id: 'E15', n: 15, name: 'Amerizaje en el Pacífico', responsible: 'NONE', met: null },
  ];
}

export const eventNumber = (id: EventId): number => Number(id.slice(1));
