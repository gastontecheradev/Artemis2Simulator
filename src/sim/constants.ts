/**
 * Physical constants and data converted from the reference images and the NASA
 * guides. Simulation units: km, s, km/s.
 *
 * Cited sources:
 * - [SLS] NASA, "Space Launch System Reference Guide for Artemis II", SLS‑5558, oct. 2025.
 * - [A2]  NASA, "Artemis II Reference Guide", 2026.
 * - [TL]  NASA, "Artemis II Overview Timeline", 18/03/2026 (STRIVES 20260002249).
 * - [AV]  NASA, "Artemis II Mission Availability – April 2026" (launch windows).
 * - [ASC] NASA, ascent and Earth-orbit infographic for Artemis II, same as the [SLS] table.
 * - [JPL] NASA/JPL, Horizons ephemeris system (ssd.jpl.nasa.gov/horizons), accessed 2026-11-15.
 * - [ORG] NASA, "Orion Reference Guide", 2022-11-10 (predates Artemis I; Orion data).
 */

// --- Physics ---
export const GM_EARTH = 398600.4418; // km³/s²
export const GM_MOON = 4902.8; // km³/s²
export const R_EARTH = 6378.137; // km
export const R_MOON = 1737.4; // km
/**
 * Mean Earth‑Moon distance. Used by the circular model (CR3BP tests) and the sphere of
 * influence; the mission flies with the elliptical orbit of `MOON_ORBIT`.
 */
export const EARTH_MOON_DISTANCE = 384400; // km
export const MOON_SIDEREAL_PERIOD = 27.321661 * 86400; // s
export const MOON_ANGULAR_RATE = (2 * Math.PI) / MOON_SIDEREAL_PERIOD; // rad/s
export const C_LIGHT = 299792.458; // km/s

/** Earth's rotation rate (rad/s). */
export const EARTH_ROTATION_RATE = 7.2921159e-5;
/** Latitude of pad LC‑39B (degrees). */
export const LAUNCH_LATITUDE_DEG = 28.627;
/**
 * Earth's rotation seen in the orbital plane. The model is planar: the ground and the
 * air at the launch site move east at Ω·R·cos(latitude) ≈ 0.408 km/s,
 * and that is the velocity the rocket already has at liftoff.
 */
export const EARTH_ROTATION_IN_PLANE = EARTH_ROTATION_RATE * Math.cos((LAUNCH_LATITUDE_DEG * Math.PI) / 180);

/**
 * [AV] Opening of the 2026-04-01 window (06:24 PM EDT = 22:24 UTC): "1.28 Hours
 * Before Sunset" at the pad. The model lifts off at that instant (MET 0) and the Sun
 * direction comes from this figure: sunset happens when Earth's rotation brings the
 * pad's vertical to 90° from the Sun.
 */
export const LAUNCH_BEFORE_SUNSET = 1.28 * 3600; // s
/** Earth's mean motion around the Sun (sidereal year of 365.256 days): the Sun advances ~0.99°/day. */
export const EARTH_ORBIT_RATE = (2 * Math.PI) / (365.256 * 86400); // rad/s

/**
 * [JPL] Moon's orbit during the mission: Keplerian ellipse (two bodies, GM_EARTH + GM_MOON)
 * least-squares fitted to the geocentric vectors from JPL Horizons (Moon, code
 * 301, center 500@399), hourly from 2026-04-01 12:00 to 2026-04-12 12:00 UTC,
 * projected onto their mean plane. MET 0 = 2026-04-01 22:24 UTC ([AV]).
 * Error against Horizons: < 400 km in distance between MET 3 d and 6 d (flyby), 1,860 km
 * at most (at liftoff) and < 811 km along the whole orbit.
 * The Moon passed apogee on 2026-04-07 (404,964 km): during the flyby it was ~5 %
 * farther than the mean distance, and that lengthens both transits. The apogee
 * direction does not come from here: it is set by the free-return lunar phase (`moonAngle0Deg`).
 */
export const MOON_ORBIT = {
  /** Semi-major axis (km). */
  a: 382778.4,
  e: 0.05777,
  /** MET of the apogee passage (s): 5.2027 d. */
  apogeeMet: 5.2027 * 86400,
} as const;

/** Radius of the lunar sphere of influence (Laplace): D·(GM_MOON/GM_EARTH)^(2/5). */
export const MOON_SOI = EARTH_MOON_DISTANCE * Math.pow(GM_MOON / GM_EARTH, 2 / 5);

// --- Imperial unit conversion (exact factors) ---
export const FT_TO_KM = 0.3048 / 1000;
export const MPH_TO_KMS = 0.44704 / 1000;
export const NM_TO_KM = 1.852;
export const MI_TO_KM = 1.609344;

const hms = (h: number, m: number, s: number): number => h * 3600 + m * 60 + s;
const dhms = (d: number, h: number, m: number, s: number): number => d * 86400 + hms(h, m, s);

// --- Ascent data from [ASC] and the [SLS] event table (converted once, here) ---
export interface AscentPoint {
  readonly label: string;
  readonly met: number; // s
  /** Velocity relative to the rotating Earth (km/s). */
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
 * Earth-orbit checkpoints from the [SLS] event table. Here the published velocity
 * is inertial (in orbit NASA's tables stop subtracting Earth's rotation).
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

// --- Event METs ([SLS] event table; E4 and E6 match [ASC]) ---
export const MET_MECO = hms(0, 8, 6);
export const MET_CORE_SEPARATION = hms(0, 8, 18); // E3
export const MET_E4_PERIGEE_RAISE = hms(0, 49, 52);
/** [SLS] table: 01:46:37 ([ASC] gives 01:48:48 and the [TL] timeline 0/01:47; the table, the most detailed, is used). */
export const MET_E5_APOGEE_RAISE = hms(1, 46, 37);
/** [SLS] Orion/ICPS separation 03:22:46 and proximity demo until Orion's departure burn at 04:53:15. */
export const MET_E6_PROX_OPS_START = hms(3, 22, 46);
export const MET_E6_PROX_OPS_END = hms(4, 53, 15);
/** [SLS] Orion departure burn (E7): two minutes. The text says "the service module engine"; the demo diagram labels it "AUX DEPARTURE". The auxiliaries are used. */
export const MET_E7_DEPARTURE = hms(4, 53, 15);
export const E7_BURN_DURATION = 120; // s
/** [SLS] ICPS disposal burn and CubeSat release (payload table, in deployment order). */
export const MET_ICPS_DISPOSAL = hms(5, 0, 33);
export const CUBESAT_DEPLOYMENTS: readonly { readonly name: string; readonly met: number }[] = [
  { name: 'ATENEA (CONAE)', met: hms(5, 29, 10) },
  { name: 'Space Weather CubeSat‑1 (SSA)', met: hms(5, 31, 10) },
  { name: 'TACHELES (DLR)', met: hms(5, 32, 10) },
  { name: 'K‑Rad Cube (KASA)', met: hms(5, 33, 10) },
];
/** [SLS] ICPS splashdown in the Pacific: 25:23:01 (check value). */
export const MET_ICPS_SPLASHDOWN = hms(25, 23, 1);

/**
 * ASSUMPTION: Δv of the ICPS disposal burn (retrograde, m/s). The guide does not give
 * the value; the perigee is already at zero altitude after E5, so it only adjusts the
 * reentry point.
 */
export const ICPS_DISPOSAL_DV = 5; // m/s
/** ASSUMPTION: deployment speed of each CubeSat from the dispenser (m/s). */
export const CUBESAT_DEPLOY_SPEED = 1.5;

// --- Published orbits ([SLS] "Artemis II by the Numbers", in nautical miles) ---
export interface PublishedOrbit {
  readonly perigee: number; // km of altitude
  readonly apogee: number;
}
/** Insertion orbit: 15 × 1,200 NM. Check value (it comes out of the ascent), not a target. */
export const INSERTION_ORBIT: PublishedOrbit = { perigee: 15 * NM_TO_KM, apogee: 1200 * NM_TO_KM };
/** After the ICPS perigee raise (E4): 100 × 1,200 NM. Target of E4: the perigee. */
export const POST_PRM_ORBIT: PublishedOrbit = { perigee: 100 * NM_TO_KM, apogee: 1200 * NM_TO_KM };
/**
 * After the apogee raise (E5): 0 × 40,000 NM. Target of E5: the perigee (at zero it
 * leaves the ICPS reentering on its own). The apogee is a check value, not a target: with 40,000 NM the
 * period is ~25.1 h and the TLI would fall 1 h 45 min after the [TL] timeline. E5 is
 * tuned so that the TLI ignites at the published MET (see `PUBLISHED_MET.tli`).
 */
export const POST_ARB_ORBIT: PublishedOrbit = { perigee: 0, apogee: 40000 * NM_TO_KM };
/** High orbit after Orion's perigee raise (E8): 100 × 40,000 NM. Target of E8: the perigee (the apogee is a check value). */
export const HEO_ORBIT: PublishedOrbit = { perigee: 100 * NM_TO_KM, apogee: 40000 * NM_TO_KM };

/** Published altitudes at MECO and at core stage separation: targets of the ascent guidance. */
export const MECO_ALTITUDE = 511884 * FT_TO_KM; // 156.02 km
export const INSERTION_ALTITUDE = 534564 * FT_TO_KM; // 162.94 km
/**
 * Published velocity at core stage separation: 17,627 mph. It is relative to the
 * rotating Earth, not inertial: the ascent simulated with the real rocket data reproduces
 * it that way, and as an inertial velocity it would be incompatible with the published times.
 */
export const INSERTION_SPEED_REL = 17627 * MPH_TO_KMS; // 7.880 km/s
/** The TLI is centered on perigee: ignition is this long before it (≈ half the burn duration). */
export const TLI_HALF_BURN = 185; // s

// --- Published timeline [TL] (check values: the model computes its own from physics) ---
export const PUBLISHED_MET = {
  /** Orion perigee raise (E8), "~0/13:30". */
  prb: dhms(0, 13, 30, 0),
  /**
   * TLI ignition. It is a calibration target: the apogee of the high orbit (E5) is
   * tuned so that the next perigee falls TLI_HALF_BURN later. The timeline
   * implies half an orbit of ~11 h 41 min between the perigee raise and the TLI, i.e. a
   * period of ~23.4 h and an apogee of ~70,100 km (37,850 NM), not the 40,000 NM of [SLS]
   * (25.1 h). The timeline is followed because it is the most recent document and the one that sets
   * the times; the [SLS] 40,000 NM remain as a check value.
   */
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
/** Apollo 13's distance-from-Earth record (km), which [TL] marks as surpassed before the flyby. NASA figure. */
export const APOLLO_13_RECORD_DISTANCE = 400171;

// --- Mission ---
/** Entry interface: 400,000 ft. */
export const EI_ALTITUDE = 400000 * FT_TO_KM; // 121.92 km
/** Mean lunar flyby altitude (NASA's Artemis II mission map). [A2] says "~4,700 miles"; the map value is kept. */
export const FLYBY_ALTITUDE_TARGET = 6513; // km

/**
 * Entry corridor: inertial flight-path angle at EI (degrees, negative = descending).
 * Target: −5.66°, the value flown by Artemis I at 400,000 ft (NASA, AAS 24‑174,
 * "Orion Artemis I Entry Performance"). There is no equivalent public figure for Artemis II.
 * The ±1° width is an assumption: UNVERIFIED.
 */
export const ENTRY_CORRIDOR = { min: -6.66, target: -5.66, max: -4.66 } as const;

/**
 * NSN/DSN boundary by altitude. NASA's Artemis II network map is schematic and does not give the value, but it shows NSN
 * at the TLI (near perigee) and DSN in the high orbit: the boundary lies within that
 * orbit. Geostationary altitude is used, where the Near Space Network relay satellites
 * orbit; above it, Deep Space Network takes over.
 */
export const NSN_MAX_ALTITUDE = 35786; // km

/** CAUTION threshold for low propellant in the service module (remaining fraction). */
export const DV_LOW_FRACTION = 0.1;

/** Beyond this distance from Earth the spacecraft is considered lost. */
export const LOST_DISTANCE = 1.5e6; // km

// --- Operation ---
/** Lead time of the auto-pause before a crew burn. */
export const BURN_LEAD_TIME = 120; // s
/** Tolerance after TIG before declaring the window missed. */
export const BURN_WINDOW_TOLERANCE = 300; // s
/** [TL] CM/SM separation happens 20 min before entry interface (9/01:09 → 9/01:29). */
export const CM_SEP_LEAD_TIME = PUBLISHED_MET.ei - PUBLISHED_MET.cmSep; // 1,200 s
/** Lead time with which the separation is requested from the crew (and the procedure opens). */
export const CM_SEP_PROMPT_LEAD_TIME = 2 * CM_SEP_LEAD_TIME;
export const WARP_LEVELS = [1, 10, 100, 1000, 10000] as const;

// --- Attitude (ASSUMPTIONS: I could not find Orion's real maneuver rates) ---
/** Rate at which the autopilot reorients the spacecraft (rad/s). */
export const ATTITUDE_SLEW_RATE = (3 * Math.PI) / 180;
/** Rotation rate commanded by the hand controller at full deflection (rad/s). */
export const RHC_RATE = (3 * Math.PI) / 180;
/** Acceptable attitude error to consider the spacecraft aligned (rad). */
export const ATTITUDE_TOLERANCE = (2 * Math.PI) / 180;
