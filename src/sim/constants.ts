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

/** Velocidad angular de rotación de la Tierra (rad/s). */
export const EARTH_ROTATION_RATE = 7.2921159e-5;
/** Latitud de la plataforma LC‑39B (grados). */
export const LAUNCH_LATITUDE_DEG = 28.627;
/**
 * Rotación terrestre vista en el plano de la órbita. El modelo es plano: el suelo y el
 * aire del sitio de lanzamiento se mueven hacia el este a Ω·R·cos(latitud) ≈ 0,408 km/s,
 * y esa es la velocidad que el cohete ya trae al despegar.
 */
export const EARTH_ROTATION_IN_PLANE = EARTH_ROTATION_RATE * Math.cos((LAUNCH_LATITUDE_DEG * Math.PI) / 180);

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

/** Altitudes publicadas en MECO y en la separación de la etapa central: objetivos del guiado del ascenso. */
export const MECO_ALTITUDE = 511884 * FT_TO_KM; // 156,02 km
export const INSERTION_ALTITUDE = 534564 * FT_TO_KM; // 162,94 km
/**
 * Velocidad publicada en la separación de la etapa central: 17.627 mph. Es relativa a la
 * Tierra en rotación, no inercial: el ascenso simulado con los datos reales del cohete la
 * reproduce así, y como velocidad inercial sería incompatible con los tiempos publicados.
 */
export const INSERTION_SPEED_REL = 17627 * MPH_TO_KMS; // 7,880 km/s
/** El TLI se centra en el perigeo: la ignición es este tiempo antes (≈ media duración del encendido). */
export const TLI_HALF_BURN = 185; // s

// --- Misión ---
/** Interfaz de entrada: 400.000 ft. */
export const EI_ALTITUDE = 400000 * FT_TO_KM; // 121,92 km
/** Altitud media del sobrevuelo lunar (1.png). */
export const FLYBY_ALTITUDE_TARGET = 6513; // km
/** Duración del chequeo en órbita alta (1.png): 23,5 h. */
export const HEO_CHECKOUT_DURATION = 23.5 * 3600;

/**
 * Corredor de entrada: ángulo de trayectoria inercial en EI (grados, negativo = descendiendo).
 * Objetivo: −5,66°, el valor volado por Artemis I a 400.000 ft (NASA, AAS 24‑174,
 * "Orion Artemis I Entry Performance"). No hay dato público equivalente de Artemis II.
 * El ancho de ±1° es un supuesto: SIN VERIFICAR.
 */
export const ENTRY_CORRIDOR = { min: -6.66, target: -5.66, max: -4.66 } as const;

/**
 * Límite NSN/DSN por altitud. 2.png es esquemático y no da el valor. Se usa la
 * altitud geoestacionaria: los satélites relé de la Near Space Network orbitan ahí,
 * así que por encima no hay cobertura de relé y se pasa a Deep Space Network.
 */
export const NSN_MAX_ALTITUDE = 35786; // km

/** Umbral de CAUTION por propelente bajo en el módulo de servicio (fracción restante). */
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

// --- Actitud (SUPUESTOS: no encontré los ritmos de maniobra reales de Orion) ---
/** Ritmo al que el piloto automático reorienta la nave (rad/s). */
export const ATTITUDE_SLEW_RATE = (3 * Math.PI) / 180;
/** Ritmo de rotación que comanda el controlador manual a fondo (rad/s). */
export const RHC_RATE = (3 * Math.PI) / 180;
/** Error de actitud aceptable para considerar la nave orientada (rad). */
export const ATTITUDE_TOLERANCE = (2 * Math.PI) / 180;
