import { Ephemeris } from './bodies';
import { C_LIGHT, NSN_MAX_ALTITUDE, R_EARTH, R_MOON } from './constants';
import { Vec3, addScaled, distance, dot, sub } from './math/vec3';

export type Network = 'NSN' | 'DSN';

export interface CommsStatus {
  readonly network: Network;
  /** true si la Luna bloquea la línea de vista con la Tierra. */
  readonly los: boolean;
  /** Distancia nave–centro de la Tierra (km). */
  readonly distance: number;
  /** Retardo de señal de ida (s). */
  readonly delay: number;
}

/**
 * Margen de la línea de vista: distancia del centro de la Luna al segmento
 * nave–Tierra menos el radio lunar. Negativo = bloqueada (LOS).
 */
export function losClearance(ship: Vec3, earth: Vec3, moon: Vec3): number {
  const seg = sub(earth, ship);
  const len2 = dot(seg, seg);
  const u = len2 > 0 ? Math.max(0, Math.min(1, dot(sub(moon, ship), seg) / len2)) : 0;
  return distance(addScaled(ship, seg, u), moon) - R_MOON;
}

export const networkForAltitude = (altitude: number): Network =>
  altitude < NSN_MAX_ALTITUDE ? 'NSN' : 'DSN';

export function commsStatus(ship: Vec3, t: number, eph: Ephemeris): CommsStatus {
  const earth = eph.earth(t).r;
  const moon = eph.moon(t).r;
  const d = distance(ship, earth);
  return {
    network: networkForAltitude(d - R_EARTH),
    los: losClearance(ship, earth, moon) < 0,
    distance: d,
    // El retardo se mide hasta la superficie (la antena), no hasta el centro.
    delay: Math.max(0, d - R_EARTH) / C_LIGHT,
  };
}
