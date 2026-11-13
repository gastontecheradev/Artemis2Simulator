import { Ephemeris } from '../bodies';
import { ASCENT_TABLE, R_EARTH } from '../constants';
import { ShipState } from '../integrator';
import { add, scale, sub, vec3 } from '../math/vec3';
import { EventId } from './timeline';

/**
 * Ascenso guionado (E1 → E3). NO es física: reproduce la tabla de 3.png interpolando
 * linealmente entre sus puntos. La velocidad de la tabla es relativa a la Tierra
 * (ver process.md), por eso al llegar a E3 la velocidad inercial "salta" al valor
 * calibrado: ahí arranca la física.
 */

export interface AscentSample {
  /** Altitud (km). */
  readonly altitude: number;
  /** Velocidad de la tabla de 3.png (km/s, relativa a la Tierra). */
  readonly speed: number;
  /** Velocidad vertical (km/s): pendiente de la altitud en el tramo. */
  readonly verticalSpeed: number;
}

const T_END = ASCENT_TABLE[ASCENT_TABLE.length - 1].met;

export function ascentSample(t: number): AscentSample {
  const tc = Math.max(0, Math.min(T_END, t));
  let i = 0;
  while (i < ASCENT_TABLE.length - 2 && tc > ASCENT_TABLE[i + 1].met) i++;
  const a = ASCENT_TABLE[i];
  const b = ASCENT_TABLE[i + 1];
  const u = (tc - a.met) / (b.met - a.met);
  return {
    altitude: a.altitude + u * (b.altitude - a.altitude),
    speed: a.speed + u * (b.speed - a.speed),
    verticalSpeed: (b.altitude - a.altitude) / (b.met - a.met),
  };
}

/**
 * Ángulo recorrido sobre la Tierra (rad) acumulado segundo a segundo, integrando la
 * componente horizontal de la velocidad de la tabla. Sirve solo para dibujar la subida.
 */
const DOWNRANGE: number[] = (() => {
  const acc = [0];
  for (let t = 0; t < T_END; t++) {
    const s = ascentSample(t + 0.5);
    const horizontal = Math.sqrt(Math.max(0, s.speed * s.speed - s.verticalSpeed * s.verticalSpeed));
    acc.push(acc[t] + horizontal / (R_EARTH + s.altitude));
  }
  return acc;
})();

function downrange(t: number): number {
  const tc = Math.max(0, Math.min(T_END, t));
  const i = Math.min(T_END - 1, Math.floor(tc));
  return DOWNRANGE[i] + (tc - i) * (DOWNRANGE[i + 1] - DOWNRANGE[i]);
}

/**
 * Estado dibujable de la nave durante el ascenso. La posición termina exactamente en
 * el punto de inserción (sobre +x respecto de la Tierra en el MET de E3).
 */
export function ascentState(t: number, eph: Ephemeris): ShipState {
  const position = (tt: number): ShipState['r'] => {
    const s = ascentSample(tt);
    const angle = downrange(tt) - DOWNRANGE[T_END];
    const r = R_EARTH + s.altitude;
    return add(eph.earth(tt).r, vec3(r * Math.cos(angle), r * Math.sin(angle), 0));
  };
  const t0 = Math.max(0, t - 0.5);
  const t1 = Math.min(T_END, t + 0.5);
  return { r: position(t), v: scale(sub(position(t1), position(t0)), 1 / (t1 - t0)) };
}

export interface AscentEvent {
  readonly met: number;
  readonly text: string;
  readonly eventId?: EventId;
}

/** Hitos del ascenso con los MET de 3.png. */
export const ASCENT_EVENTS: readonly AscentEvent[] = [
  { met: 7, text: 'Torre despejada. Maniobra de giro y cabeceo.' },
  { met: 71, text: 'Max Q: máxima presión dinámica.' },
  { met: 128, text: 'E2 · Separación de los boosters (SRB).', eventId: 'E2' },
  { met: 208, text: 'E2 · Eyección del sistema de aborto de lanzamiento (LAS).', eventId: 'E2' },
  { met: 486, text: 'MECO: corte de los motores de la etapa central.' },
];
