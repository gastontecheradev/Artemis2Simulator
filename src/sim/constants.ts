/**
 * Constantes físicas y datos convertidos de las imágenes de referencia.
 * Unidades de la simulación: km, s, km/s.
 */

// --- Física ---
export const GM_EARTH = 398600.4418; // km³/s²
export const GM_MOON = 4902.8; // km³/s²
export const R_EARTH = 6378.137; // km
export const R_MOON = 1737.4; // km
export const EARTH_MOON_DISTANCE = 384400; // km (fija en el modelo circular)
export const MOON_SIDEREAL_PERIOD = 27.321661 * 86400; // s
export const MOON_ANGULAR_RATE = (2 * Math.PI) / MOON_SIDEREAL_PERIOD; // rad/s
export const C_LIGHT = 299792.458; // km/s

/** Radio de la esfera de influencia lunar (Laplace): D·(GM_L/GM_T)^(2/5). */
export const MOON_SOI = EARTH_MOON_DISTANCE * Math.pow(GM_MOON / GM_EARTH, 2 / 5);

// --- Conversión de unidades imperiales (factores exactos) ---
export const FT_TO_KM = 0.3048 / 1000;
export const MPH_TO_KMS = 0.44704 / 1000;

const hms = (h: number, m: number, s: number): number => h * 3600 + m * 60 + s;

// --- Datos de ascenso de 3.png (convertidos una sola vez, acá) ---
export interface AscentPoint {
  readonly label: string;
  readonly met: number; // s
  readonly speed: number; // km/s
  readonly altitude: number; // km
}
export const ASCENT_TABLE: readonly AscentPoint[] = [
  { label: 'Lanzamiento', met: 0, speed: 0, altitude: 0 },
  { label: 'Torre despejada', met: hms(0, 0, 7), speed: 70 * MPH_TO_KMS, altitude: 468 * FT_TO_KM },
  { label: 'Max Q', met: hms(0, 1, 11), speed: 1041 * MPH_TO_KMS, altitude: 43795 * FT_TO_KM },
  { label: 'Separación de SRB', met: hms(0, 2, 8), speed: 3006 * MPH_TO_KMS, altitude: 148384 * FT_TO_KM },
  { label: 'Eyección del LAS', met: hms(0, 3, 28), speed: 4487 * MPH_TO_KMS, altitude: 286146 * FT_TO_KM },
  { label: 'MECO', met: hms(0, 8, 6), speed: 17599 * MPH_TO_KMS, altitude: 511884 * FT_TO_KM },
  { label: 'Separación etapa central/ICPS', met: hms(0, 8, 18), speed: 17627 * MPH_TO_KMS, altitude: 534564 * FT_TO_KM },
];

// --- MET de eventos (3.png) ---
export const MET_MECO = hms(0, 8, 6);
export const MET_CORE_SEPARATION = hms(0, 8, 18); // E3: arranca la física
export const MET_E4_PERIGEE_RAISE = hms(0, 49, 52);
export const MET_E5_APOGEE_RAISE = hms(1, 48, 48);
export const MET_E6_PROX_OPS_START = hms(3, 25, 41);
export const MET_E6_PROX_OPS_END = hms(4, 53, 36);

/** Altitud en la separación (E3), de 3.png. */
export const INSERTION_ALTITUDE = 534564 * FT_TO_KM; // 162,94 km
/**
 * Velocidad vertical en E3 estimada con 3.png: subida de 511.884 ft a 534.564 ft
 * en los 12 s entre MECO y separación.
 */
export const INSERTION_VERTICAL_SPEED =
  ((534564 - 511884) * FT_TO_KM) / (MET_CORE_SEPARATION - MET_MECO); // km/s

// --- Misión ---
/** Interfaz de entrada: 400.000 ft. */
export const EI_ALTITUDE = 400000 * FT_TO_KM; // 121,92 km
/** Altitud media del sobrevuelo lunar (1.png). */
export const FLYBY_ALTITUDE_TARGET = 6513; // km
/** Duración del chequeo en órbita alta (1.png): 23,5 h. */
export const HEO_CHECKOUT_DURATION = 23.5 * 3600;

/**
 * Corredor de entrada: ángulo de trayectoria en EI (grados, negativo = descendiendo).
 * VALOR A VERIFICAR con fuentes de NASA: se usa −6° ± 1° como orden de magnitud.
 */
export const ENTRY_CORRIDOR = { min: -7.0, target: -6.0, max: -5.0 } as const;

/**
 * Límite NSN/DSN por altitud. 2.png es esquemático y no da el valor. Se usa la
 * altitud geoestacionaria: los satélites relé de la Near Space Network orbitan ahí,
 * así que por encima no hay cobertura de relé y se pasa a Deep Space Network.
 */
export const NSN_MAX_ALTITUDE = 35786; // km

/**
 * Presupuesto de Δv de Orion (motor principal + auxiliares comparten tanques).
 * VALOR A VERIFICAR con fuentes de NASA/ESA. Configurable acá.
 */
export const ORION_DV_BUDGET = 1.2; // km/s
/** Umbral de CAUTION por Δv bajo (fracción restante). */
export const DV_LOW_FRACTION = 0.1;

/** Más allá de esta distancia a la Tierra la nave se da por perdida. */
export const LOST_DISTANCE = 1.5e6; // km

// --- Operación ---
/** Anticipación de la auto‑pausa antes de un encendido de la tripulación. */
export const BURN_LEAD_TIME = 120; // s
/** Tolerancia después del TIG antes de declarar la ventana perdida. */
export const BURN_WINDOW_TOLERANCE = 300; // s
/** Altitud (descendiendo, en el regreso) a la que se pide la separación CM/SM. */
export const CM_SEP_PROMPT_ALTITUDE = 20000; // km
/** Altitud a la que la tripulación automática separa el CM/SM. */
export const CM_SEP_AUTO_ALTITUDE = 12000; // km
export const WARP_LEVELS = [1, 10, 100, 1000, 10000] as const;
