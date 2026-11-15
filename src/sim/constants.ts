/**
 * Constantes físicas y datos convertidos de las imágenes de referencia y de las guías
 * de NASA. Unidades de la simulación: km, s, km/s.
 *
 * Fuentes citadas:
 * - [SLS] NASA, "Space Launch System Reference Guide for Artemis II", SLS‑5558, oct. 2025.
 * - [A2]  NASA, "Artemis II Reference Guide", 2026.
 * - [TL]  NASA, "Artemis II Overview Timeline", 18/03/2026 (STRIVES 20260002249).
 * - [3.png] infografía de ascenso y órbita terrestre (docs/reference/3.png), igual a la tabla de [SLS].
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
export const NM_TO_KM = 1.852;
export const MI_TO_KM = 1.609344;

const hms = (h: number, m: number, s: number): number => h * 3600 + m * 60 + s;
const dhms = (d: number, h: number, m: number, s: number): number => d * 86400 + hms(h, m, s);

// --- Datos de ascenso de 3.png y de la tabla de eventos de [SLS] (convertidos una sola vez, acá) ---
export interface AscentPoint {
  readonly label: string;
  readonly met: number; // s
  /** Velocidad relativa a la Tierra en rotación (km/s). */
  readonly speed: number;
  readonly altitude: number; // km
}
export const ASCENT_TABLE: readonly AscentPoint[] = [
  { label: 'Lanzamiento', met: 0, speed: 0, altitude: 0 },
  { label: 'Torre despejada', met: hms(0, 0, 7), speed: 70 * MPH_TO_KMS, altitude: 468 * FT_TO_KM },
  { label: 'Mach 1', met: hms(0, 0, 55), speed: 710 * MPH_TO_KMS, altitude: 25745 * FT_TO_KM },
  { label: 'Max Q', met: hms(0, 1, 11), speed: 1041 * MPH_TO_KMS, altitude: 43795 * FT_TO_KM },
  { label: 'RS‑25 al 85 %', met: hms(0, 2, 4), speed: 2989 * MPH_TO_KMS, altitude: 139757 * FT_TO_KM },
  { label: 'Separación de SRB', met: hms(0, 2, 8), speed: 3006 * MPH_TO_KMS, altitude: 148384 * FT_TO_KM },
  { label: 'Eyección del LAS', met: hms(0, 3, 28), speed: 4487 * MPH_TO_KMS, altitude: 286146 * FT_TO_KM },
  { label: 'Aceleración máxima', met: hms(0, 7, 1), speed: 13207 * MPH_TO_KMS, altitude: 431633 * FT_TO_KM },
  { label: 'RS‑25 al 67 %', met: hms(0, 8, 1), speed: 17261 * MPH_TO_KMS, altitude: 502630 * FT_TO_KM },
  { label: 'MECO', met: hms(0, 8, 6), speed: 17599 * MPH_TO_KMS, altitude: 511884 * FT_TO_KM },
  { label: 'Separación etapa central/ICPS', met: hms(0, 8, 18), speed: 17627 * MPH_TO_KMS, altitude: 534564 * FT_TO_KM },
];

/**
 * Puntos de control en órbita terrestre de la tabla de eventos de [SLS]. Acá la velocidad
 * publicada es inercial (en órbita las tablas de NASA dejan de restar la rotación terrestre).
 */
export const ORBIT_TABLE: readonly AscentPoint[] = [
  { label: 'Elevación del perigeo (ICPS)', met: hms(0, 49, 52), speed: 14145 * MPH_TO_KMS, altitude: 7181309 * FT_TO_KM },
  { label: 'Elevación del apogeo (ICPS)', met: hms(1, 46, 37), speed: 18510 * MPH_TO_KMS, altitude: 701589 * FT_TO_KM },
  { label: 'Separación ICPS/Orion', met: hms(3, 22, 46), speed: 9598 * MPH_TO_KMS, altitude: 72546507 * FT_TO_KM },
  { label: 'Inicio demo de proximidad', met: hms(3, 23, 36), speed: 9552 * MPH_TO_KMS, altitude: 73128169 * FT_TO_KM },
  { label: 'Fin demo de proximidad', met: hms(4, 53, 36), speed: 6460 * MPH_TO_KMS, altitude: 125055993 * FT_TO_KM },
  { label: 'Eliminación del ICPS', met: hms(5, 0, 33), speed: 6305 * MPH_TO_KMS, altitude: 128352996 * FT_TO_KM },
  { label: 'Liberación de CubeSats', met: hms(5, 20, 23), speed: 5896 * MPH_TO_KMS, altitude: 137337463 * FT_TO_KM },
];

// --- MET de eventos ([SLS] tabla de eventos; E4 y E6 coinciden con 3.png) ---
export const MET_MECO = hms(0, 8, 6);
export const MET_CORE_SEPARATION = hms(0, 8, 18); // E3
export const MET_E4_PERIGEE_RAISE = hms(0, 49, 52);
/** [SLS] tabla: 01:46:37 (3.png da 01:48:48 y el cronograma [TL] 0/01:47; se toma la tabla, la más detallada). */
export const MET_E5_APOGEE_RAISE = hms(1, 46, 37);
/** [SLS] Separación Orion/ICPS 03:22:46 y demo de proximidad hasta el encendido de salida de Orion a las 04:53:15. */
export const MET_E6_PROX_OPS_START = hms(3, 22, 46);
export const MET_E6_PROX_OPS_END = hms(4, 53, 15);
/** [SLS] Encendido de salida de Orion (E7): dos minutos. El texto dice "el motor del módulo de servicio"; el diagrama de la demo lo rotula "AUX DEPARTURE". Se usan los auxiliares. */
export const MET_E7_DEPARTURE = hms(4, 53, 15);
export const E7_BURN_DURATION = 120; // s
/** [SLS] Encendido de eliminación del ICPS y liberación de los CubeSats (tabla de cargas, por orden de salida). */
export const MET_ICPS_DISPOSAL = hms(5, 0, 33);
export const CUBESAT_DEPLOYMENTS: readonly { readonly name: string; readonly met: number }[] = [
  { name: 'ATENEA (CONAE)', met: hms(5, 29, 10) },
  { name: 'Space Weather CubeSat‑1 (SSA)', met: hms(5, 31, 10) },
  { name: 'TACHELES (DLR)', met: hms(5, 32, 10) },
  { name: 'K‑Rad Cube (KASA)', met: hms(5, 33, 10) },
];
/** [SLS] Caída del ICPS al Pacífico: 25:23:01 (control). */
export const MET_ICPS_SPLASHDOWN = hms(25, 23, 1);

/**
 * SUPUESTO: Δv del encendido de eliminación del ICPS (retrógrado, m/s). La guía no da
 * el valor; el perigeo ya está a altitud cero después de E5, así que solo acomoda el
 * punto de reentrada.
 */
export const ICPS_DISPOSAL_DV = 5; // m/s
/** SUPUESTO: velocidad de salida de cada CubeSat del dispensador (m/s). */
export const CUBESAT_DEPLOY_SPEED = 1.5;

// --- Órbitas publicadas ([SLS] "Artemis II by the Numbers", en millas náuticas) ---
export interface PublishedOrbit {
  readonly perigee: number; // km de altitud
  readonly apogee: number;
}
/** Órbita de inserción: 15 × 1.200 NM. Es control (sale del ascenso), no objetivo. */
export const INSERTION_ORBIT: PublishedOrbit = { perigee: 15 * NM_TO_KM, apogee: 1200 * NM_TO_KM };
/** Tras la elevación del perigeo del ICPS (E4): 100 × 1.200 NM. Objetivo de E4: el perigeo. */
export const POST_PRM_ORBIT: PublishedOrbit = { perigee: 100 * NM_TO_KM, apogee: 1200 * NM_TO_KM };
/** Tras la elevación del apogeo (E5): 0 × 40.000 NM. Objetivo de E5: las dos cosas (el perigeo a cero deja al ICPS reentrando solo). */
export const POST_ARB_ORBIT: PublishedOrbit = { perigee: 0, apogee: 40000 * NM_TO_KM };
/** Órbita alta tras la elevación del perigeo de Orion (E8): 100 × 40.000 NM. Objetivo de E8: el perigeo. */
export const HEO_ORBIT: PublishedOrbit = { perigee: 100 * NM_TO_KM, apogee: 40000 * NM_TO_KM };

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

// --- Cronograma publicado [TL] (control: el modelo calcula los suyos por física) ---
export const PUBLISHED_MET = {
  tli: dhms(1, 1, 8, 42),
  otc1: dhms(2, 1, 8, 42),
  otc2: dhms(3, 1, 8, 42),
  otc3: dhms(4, 4, 29, 52),
  soiEntry: dhms(4, 6, 38, 0),
  flyby: dhms(5, 0, 29, 59),
  maxEarthDistance: dhms(5, 0, 35, 0),
  soiExit: dhms(5, 18, 53, 0),
  rtc1: dhms(6, 1, 29, 52),
  rtc2: dhms(8, 4, 29, 10),
  rtc3: dhms(8, 20, 29, 10),
  cmSep: dhms(9, 1, 9, 0),
  ei: dhms(9, 1, 29, 0),
  splashdown: dhms(9, 1, 42, 48),
} as const;
/** Récord de distancia a la Tierra de Apollo 13 (km), que [TL] marca como superado antes del sobrevuelo. Dato de NASA. */
export const APOLLO_13_RECORD_DISTANCE = 400171;

// --- Misión ---
/** Interfaz de entrada: 400.000 ft. */
export const EI_ALTITUDE = 400000 * FT_TO_KM; // 121,92 km
/** Altitud media del sobrevuelo lunar (1.png). [A2] dice "~4.700 millas": ver process.md. */
export const FLYBY_ALTITUDE_TARGET = 6513; // km

/**
 * Corredor de entrada: ángulo de trayectoria inercial en EI (grados, negativo = descendiendo).
 * Objetivo: −5,66°, el valor volado por Artemis I a 400.000 ft (NASA, AAS 24‑174,
 * "Orion Artemis I Entry Performance"). No hay dato público equivalente de Artemis II.
 * El ancho de ±1° es un supuesto: SIN VERIFICAR.
 */
export const ENTRY_CORRIDOR = { min: -6.66, target: -5.66, max: -4.66 } as const;

/**
 * Límite NSN/DSN por altitud. 2.png es esquemático y no da el valor, pero muestra NSN
 * en el TLI (cerca del perigeo) y DSN en la órbita alta: el límite cae dentro de esa
 * órbita. Se usa la altitud geoestacionaria, donde orbitan los satélites relé de la
 * Near Space Network; por encima se pasa a Deep Space Network.
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
/** [TL] La separación CM/SM ocurre 20 min antes de la interfaz de entrada (9/01:09 → 9/01:29). */
export const CM_SEP_LEAD_TIME = PUBLISHED_MET.ei - PUBLISHED_MET.cmSep; // 1.200 s
/** Anticipación con la que se pide la separación a la tripulación (y se abre el procedimiento). */
export const CM_SEP_PROMPT_LEAD_TIME = 2 * CM_SEP_LEAD_TIME;
export const WARP_LEVELS = [1, 10, 100, 1000, 10000] as const;

// --- Actitud (SUPUESTOS: no encontré los ritmos de maniobra reales de Orion) ---
/** Ritmo al que el piloto automático reorienta la nave (rad/s). */
export const ATTITUDE_SLEW_RATE = (3 * Math.PI) / 180;
/** Ritmo de rotación que comanda el controlador manual a fondo (rad/s). */
export const RHC_RATE = (3 * Math.PI) / 180;
/** Error de actitud aceptable para considerar la nave orientada (rad). */
export const ATTITUDE_TOLERANCE = (2 * Math.PI) / 180;
