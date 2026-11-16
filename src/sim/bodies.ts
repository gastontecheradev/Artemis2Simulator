import {
  EARTH_MOON_DISTANCE,
  EARTH_ORBIT_RATE,
  EARTH_ROTATION_IN_PLANE,
  GM_EARTH,
  GM_MOON,
  LAUNCH_BEFORE_SUNSET,
  MOON_ANGULAR_RATE,
  MOON_ORBIT,
  MOON_SIDEREAL_PERIOD,
} from './constants';
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
  /** Ángulo (rad) del eje Tierra→Luna en t, sin cortes en 2π. Define el marco rotante. */
  moonAngle(t: number): number;
  /** Período de la órbita lunar (s): una vuelta completa de `moon(t)`. Para dibujarla. */
  readonly moonPeriod: number;
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
    moonPeriod: MOON_SIDEREAL_PERIOD,
  };
}

/**
 * Efemérides de la misión: la Luna recorre una elipse kepleriana alrededor de la Tierra
 * (problema de dos cuerpos con GM_T + GM_L) y las dos giran alrededor del baricentro, que
 * queda quieto en el origen. Los elementos (`MOON_ORBIT`) salen de JPL Horizons para la
 * fecha de la misión, así la distancia Tierra‑Luna y la velocidad de la Luna son las de
 * abril de 2026. `moonAngle0` es el ángulo de la Luna en t = 0, como en el modelo
 * circular: el retorno libre lo ajusta y con él gira la elipse entera.
 * El problema deja de ser el CR3BP circular: la constante de Jacobi no se conserva.
 */
export function createKeplerEphemeris(moonAngle0 = 0, orbit: { a: number; e: number; apogeeMet: number } = MOON_ORBIT): Ephemeris {
  const gm = GM_EARTH + GM_MOON;
  const mu = GM_MOON / gm;
  const { a, e } = orbit;
  const n = Math.sqrt(gm / (a * a * a));
  const p = a * (1 - e * e);
  const h = Math.sqrt(gm / p);
  // Para la anomalía verdadera sin cortes: ν = E + 2·atan(β·sen E / (1 − β·cos E)).
  const beta = e / (1 + Math.sqrt(1 - e * e));
  const meanAt = (t: number): number => Math.PI + n * (t - orbit.apogeeMet);
  const trueAnomaly = (t: number): number => {
    const m = meanAt(t);
    let ecc = m + e * Math.sin(m);
    for (let i = 0; i < 12; i++) {
      const d = (ecc - e * Math.sin(ecc) - m) / (1 - e * Math.cos(ecc));
      ecc -= d;
      if (Math.abs(d) < 1e-15) break;
    }
    return ecc + 2 * Math.atan((beta * Math.sin(ecc)) / (1 - beta * Math.cos(ecc)));
  };
  // Dirección del perigeo: deja la Luna en `moonAngle0` en t = 0.
  const varpi = moonAngle0 - trueAnomaly(0);

  // El integrador pide Tierra y Luna en el mismo t: se guarda el último cálculo.
  let lastT = NaN;
  let rel: { r: Vec3; v: Vec3; angle: number } = { r: vec3(), v: vec3(), angle: 0 };
  const relative = (t: number): { r: Vec3; v: Vec3; angle: number } => {
    if (t === lastT) return rel;
    const nu = trueAnomaly(t);
    const angle = varpi + nu;
    const r = p / (1 + e * Math.cos(nu));
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const vr = h * e * Math.sin(nu);
    const vt = h * (1 + e * Math.cos(nu));
    rel = { r: vec3(r * c, r * s, 0), v: vec3(vr * c - vt * s, vr * s + vt * c, 0), angle };
    lastT = t;
    return rel;
  };
  const part = (k: number, t: number): BodyState => {
    const x = relative(t);
    return { r: vec3(k * x.r.x, k * x.r.y, 0), v: vec3(k * x.v.x, k * x.v.y, 0) };
  };
  return {
    gmEarth: GM_EARTH,
    gmMoon: GM_MOON,
    earth: (t) => part(-mu, t),
    moon: (t) => part(1 - mu, t),
    moonAngle: (t) => relative(t).angle,
    moonPeriod: (2 * Math.PI) / n,
  };
}

/** Solo la Tierra, fija en el origen. Para tests de dos cuerpos. */
export function createEarthOnlyEphemeris(): Ephemeris {
  const earth: BodyState = { r: vec3(), v: vec3() };
  const moon: BodyState = { r: vec3(EARTH_MOON_DISTANCE, 0, 0), v: vec3() };
  return { gmEarth: GM_EARTH, gmMoon: 0, earth: () => earth, moon: () => moon, moonAngle: () => 0, moonPeriod: MOON_SIDEREAL_PERIOD };
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
