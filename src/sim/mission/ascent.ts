import { airVelocity } from '../atmosphere';
import { Ephemeris } from '../bodies';
import { Vec3, cross, dot, normalize, sub } from '../math/vec3';
import { DirectionLaw } from '../power';
import { SRB_BURN_TIME } from '../vehicle';

/**
 * Ascenso simulado (E1 → E3): empuje, masa, arrastre y gravedad reales. Lo único
 * programado es lo que en el cohete real también lo está: la secuencia de eventos
 * por tiempo y la ley de guiado que orienta el empuje.
 */

/** Secuencia del ascenso (MET en s). Los tiempos son los publicados por NASA para Artemis II. */
export const ASCENT_SEQUENCE = {
  /** Torre despejada: empieza la maniobra de cabeceo. */
  pitchStart: 7,
  /** Fin del cabeceo inicial; sigue el giro por gravedad. */
  pitchEnd: 17,
  srbBurnout: SRB_BURN_TIME,
  srbSeparation: 128,
  /** Empieza el guiado de tangente lineal (fuera de la atmósfera densa). */
  linearTangentStart: 135,
  lasJettison: 208,
  meco: 486,
  coreSeparation: 498,
} as const;

/** Parámetros del guiado. Los ajusta `tuneAscent` en scripts/lib/calibration.ts (viven en params.json). */
export interface AscentParams {
  /** Ángulo del cabeceo inicial respecto de la vertical (grados). */
  readonly kickDeg: number;
  /** Ritmo al que baja la tangente del ángulo de cabeceo en el guiado de tangente lineal (1/s). */
  readonly tanRate: number;
  /** Límite de aceleración de los RS‑25 (m/s²). */
  readonly gLimit: number;
}

const Z: Vec3 = { x: 0, y: 0, z: 1 };

/** Ejes locales en un punto: vertical (hacia arriba) y horizontal hacia el este (sentido del giro terrestre). */
function localAxes(r: Vec3, t: number, eph: Ephemeris): { up: Vec3; east: Vec3 } {
  const up = normalize(sub(r, eph.earth(t).r));
  return { up, east: normalize(cross(Z, up)) };
}

const blend = (up: Vec3, east: Vec3, pitchFromVertical: number): Vec3 => {
  const c = Math.cos(pitchFromVertical);
  const s = Math.sin(pitchFromVertical);
  return { x: c * up.x + s * east.x, y: c * up.y + s * east.y, z: c * up.z + s * east.z };
};

/** Tangente del ángulo de la velocidad relativa al aire sobre la horizontal local. */
export function airPathTangent(r: Vec3, v: Vec3, t: number, eph: Ephemeris): number {
  const { up, east } = localAxes(r, t, eph);
  const vAir = sub(v, airVelocity(r, eph.earth(t)));
  return dot(vAir, up) / Math.max(1e-9, dot(vAir, east));
}

/**
 * Ley de guiado del ascenso:
 * 1. Subida vertical hasta despejar la torre.
 * 2. Cabeceo: el empuje se inclina hacia el este hasta `kickDeg`.
 * 3. Giro por gravedad: el empuje sigue a la velocidad relativa al aire (ángulo de ataque nulo).
 * 4. Tangente lineal: la tangente del cabeceo sobre la horizontal baja a ritmo constante
 *    desde el valor que tenía al terminar el giro por gravedad (`tanAtHandover`).
 */
export function ascentDirection(p: AscentParams, tanAtHandover: number | null, eph: Ephemeris): DirectionLaw {
  const S = ASCENT_SEQUENCE;
  const kick = (p.kickDeg * Math.PI) / 180;
  return (t, r, v) => {
    const { up, east } = localAxes(r, t, eph);
    if (t < S.pitchStart) return up;
    if (t < S.pitchEnd) return blend(up, east, (kick * (t - S.pitchStart)) / (S.pitchEnd - S.pitchStart));
    if (t < S.linearTangentStart || tanAtHandover === null) {
      const vAir = sub(v, airVelocity(r, eph.earth(t)));
      return normalize(vAir);
    }
    const pitch = Math.atan(tanAtHandover - p.tanRate * (t - S.linearTangentStart));
    return blend(up, east, Math.PI / 2 - pitch);
  };
}
