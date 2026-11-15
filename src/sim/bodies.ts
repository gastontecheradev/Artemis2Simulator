import { EARTH_MOON_DISTANCE, EARTH_ORBIT_RATE, EARTH_ROTATION_IN_PLANE, GM_EARTH, GM_MOON, LAUNCH_BEFORE_SUNSET, MOON_ANGULAR_RATE } from './constants';
import { Vec3, vec3 } from './math/vec3';

export interface BodyState {
  readonly r: Vec3; // km
  readonly v: Vec3; // km/s
}

/**
 * Efemérides: posición y velocidad de la Tierra y la Luna en función de t.
 * El resto de la simulación solo conoce esta interfaz, así que se puede reemplazar
 * por efemérides reales (JPL Horizons) sin tocar nada más.
 */
export interface Ephemeris {
  readonly gmEarth: number;
  readonly gmMoon: number;
  earth(t: number): BodyState;
  moon(t: number): BodyState;
  /** Ángulo (rad) del eje Tierra→Luna en t. Define el marco rotante. */
  moonAngle(t: number): number;
}

/**
 * CR3BP circular: Tierra y Luna giran alrededor del baricentro (origen) con
 * velocidad angular constante. `moonAngle0` es el ángulo de la Luna en t = 0.
 */
export function createCircularEphemeris(moonAngle0 = 0): Ephemeris {
  const mu = GM_MOON / (GM_EARTH + GM_MOON);
  const rEarth = -mu * EARTH_MOON_DISTANCE;
  const rMoon = (1 - mu) * EARTH_MOON_DISTANCE;
  const w = MOON_ANGULAR_RATE;
  const at = (radius: number, t: number): BodyState => {
    const a = moonAngle0 + w * t;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { r: vec3(radius * c, radius * s, 0), v: vec3(-radius * w * s, radius * w * c, 0) };
  };
  return {
    gmEarth: GM_EARTH,
    gmMoon: GM_MOON,
    earth: (t) => at(rEarth, t),
    moon: (t) => at(rMoon, t),
    moonAngle: (t) => moonAngle0 + w * t,
  };
}

/** Solo la Tierra, fija en el origen. Para tests de dos cuerpos. */
export function createEarthOnlyEphemeris(): Ephemeris {
  const earth: BodyState = { r: vec3(), v: vec3() };
  const moon: BodyState = { r: vec3(EARTH_MOON_DISTANCE, 0, 0), v: vec3() };
  return { gmEarth: GM_EARTH, gmMoon: 0, earth: () => earth, moon: () => moon, moonAngle: () => 0 };
}

/**
 * Dirección (unitaria, inercial) hacia el Sol en t. El Sol está en el plano del modelo
 * (la órbita lunar difiere de la eclíptica en ~5°) y tan lejos que la dirección es la
 * misma para la Tierra, la Luna y la nave.
 *
 * La plataforma está sobre +y en t = 0 y la Tierra gira en sentido antihorario (hacia
 * −x, el este). Al despegar faltan LAUNCH_BEFORE_SUNSET segundos para la puesta: el Sol
 * está al oeste, a 90° menos lo que la plataforma rota en ese lapso desde la vertical.
 * Después avanza con el movimiento anual de la Tierra (antihorario visto desde el norte).
 */
export function sunDirection(t: number): Vec3 {
  const a = LAUNCH_BEFORE_SUNSET * (EARTH_ROTATION_IN_PLANE - EARTH_ORBIT_RATE) + EARTH_ORBIT_RATE * t;
  return vec3(Math.cos(a), Math.sin(a), 0);
}
