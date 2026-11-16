/**
 * The vehicle: stages, masses and engines. Units in this file: kg, N, s (SI).
 *
 * Sources (see also process.md):
 * - [SLS] NASA, "Space Launch System Reference Guide for Artemis II", SLS‑5558, October
 *   2025 (primary source): masses of the boosters, core stage, RS‑25 engines, ICPS,
 *   LVSA and OSA adapters, CubeSats; booster thrust curve; RS‑25 power
 *   schedule; booster separation motors.
 * - [A2] NASA, "Artemis II Reference Guide", 2026 (primary source): Orion masses
 *   (crew module, service module, launch abort system, fairings, adapter),
 *   service module and capsule thrusters.
 * - Whatever is not in those guides is marked with its secondary source or as an ASSUMPTION.
 */

/** Standard gravity, to convert specific impulse to exhaust velocity. */
export const G0 = 9.80665; // m/s²

/** Which parts are still attached to the spacecraft. */
export interface VehicleConfig {
  /** The two solid rocket boosters have already separated. */
  readonly srbSeparated: boolean;
  /** The launch abort system (LAS) and the service module fairings have been jettisoned. */
  readonly lasJettisoned: boolean;
  /** The core stage (with the LVSA adapter) has already separated. */
  readonly coreSeparated: boolean;
  /** Orion has already separated from the ICPS (which keeps the OSA adapter, the CubeSats and the spacecraft adapter). */
  readonly icpsSeparated: boolean;
  /** The crew module has already separated from the service module. */
  readonly cmSeparated: boolean;
}

export const CONFIG_AT_LIFTOFF: VehicleConfig = {
  srbSeparated: false,
  lasJettisoned: false,
  coreSeparated: false,
  icpsSeparated: false,
  cmSeparated: false,
};

/** Tanks, in the order of the propellant vector carried by the integrator. */
export const TANK = { SRB: 0, CORE: 1, ICPS: 2, ESM: 3, CM: 4 } as const;
export type TankName = keyof typeof TANK;
export type PropLoad = readonly [number, number, number, number, number];
export const TANK_COUNT = 5;

/** [SLS] Booster: 726 t loaded, 99.3 t empty. */
const SRB_LOADED_EACH = 726_000;
const SRB_EMPTY_EACH = 99_300;

export const MASS = {
  srbDry: 2 * SRB_EMPTY_EACH,
  srbProp: 2 * (SRB_LOADED_EACH - SRB_EMPTY_EACH),
  /** [SLS] Empty core stage without engines 85.3 t + four RS‑25 of 3.52 t. */
  coreDry: 85_300 + 4 * 3_520,
  /**
   * [SLS] Loaded core stage without engines 1,089 t minus empty 85.3 t. The same guide
   * gives 998 t ("total propellant weight") and 987.5 t (LH2 + LOX capacity): loaded −
   * empty is used because both figures come from the same table.
   */
  coreProp: 1_089_000 - 85_300,
  /** [SLS] Launch vehicle stage adapter (LVSA): leaves with the core stage. */
  lvsa: 4_500,
  /** [SLS] ICPS: 32.748 t loaded, 3.719 t empty. */
  icpsDry: 3_719,
  icpsProp: 32_748 - 3_719,
  /** [SLS] Orion stage adapter (OSA) and four CubeSats of up to 26 kg (the maximum is used). They stay with the ICPS. */
  osa: 820,
  cubesat: 26,
  /** [A2] Spacecraft adapter (between the service module and the OSA): stays with the ICPS. */
  spacecraftAdapter: 1_270,
  /** [A2] Launch abort system (LAS) and service module protective fairings. */
  las: 7_711,
  fairing: 454,
  /** [A2] Service module 15,558 kg with 8,618 kg of usable propellant. */
  smDry: 15_558 - 8_618,
  esmProp: 8_618,
  /** [A2] Crew module at launch (reaches the water with 9,299 kg). */
  cm: 10_387,
  /** ASSUMPTION: capsule RCS propellant (not published). */
  cmProp: 150,
} as const;

export const CUBESAT_COUNT = 4;

export const FULL_TANKS: PropLoad = [MASS.srbProp, MASS.coreProp, MASS.icpsProp, MASS.esmProp, MASS.cmProp];

/** Mass of the attached parts, without propellant (kg). */
export function dryMass(cfg: VehicleConfig): number {
  let m = MASS.cm;
  if (!cfg.cmSeparated) m += MASS.smDry;
  if (!cfg.icpsSeparated) m += MASS.icpsDry + MASS.osa + CUBESAT_COUNT * MASS.cubesat + MASS.spacecraftAdapter;
  if (!cfg.coreSeparated) m += MASS.coreDry + MASS.lvsa;
  if (!cfg.srbSeparated) m += MASS.srbDry;
  if (!cfg.lasJettisoned) m += MASS.las + MASS.fairing;
  return m;
}

/** Total spacecraft mass (kg). The propellant of a separated stage no longer counts. */
export function totalMass(cfg: VehicleConfig, prop: readonly number[]): number {
  let m = dryMass(cfg) + prop[TANK.CM];
  if (!cfg.srbSeparated) m += prop[TANK.SRB];
  if (!cfg.coreSeparated) m += prop[TANK.CORE];
  if (!cfg.icpsSeparated) m += prop[TANK.ICPS];
  if (!cfg.cmSeparated) m += prop[TANK.ESM];
  return m;
}

export type EngineId = 'SRB' | 'RS25' | 'RL10' | 'MAIN' | 'AUX' | 'RCS' | 'CMRCS';

export interface EngineSpec {
  readonly name: string;
  /** Full vacuum thrust (N), summing all units. */
  readonly thrustVac: number;
  /** Specific impulse in vacuum and at sea level (s). */
  readonly ispVac: number;
  readonly ispSl: number;
  readonly tank: number;
}

// ---------- Boosters ----------

/**
 * [SLS] Vacuum thrust curve of each booster (s, kN): 16,014 kN maximum for about
 * 25 s, drops to 12,455 kN through Max Q (T+71 s), returns to 14,679 kN and
 * starts tailing off at ~90 s; burnout at ~126 s. The guide's 14,679 kN "at liftoff"
 * is the sea-level value of that maximum (14,679/16,014 = 0.917, the sea-level/vacuum
 * ratio of these boosters): that way the total thrust at liftoff gives the
 * published 36,787 kN. The shape of the final tail-off (from 90 s to burnout) is an
 * ASSUMPTION: the guide only gives the instant it starts.
 */
export const SRB_THRUST_PROFILE: readonly (readonly [number, number])[] = [
  [0, 16_014],
  [25, 16_014],
  [71, 12_455],
  [90, 14_679],
  [105, 11_000],
  [118, 3_000],
  [126, 0],
];
/** [SLS] Thrust of one booster at liftoff (sea level), kN. */
const SRB_THRUST_SL_LAUNCH = 14_679;

/** Booster burn duration (s). */
export const SRB_BURN_TIME = SRB_THRUST_PROFILE[SRB_THRUST_PROFILE.length - 1][0];

/** Thrust of ONE booster (N) `t` seconds after ignition, interpolating the published curve. */
export function srbThrustEach(t: number): number {
  const P = SRB_THRUST_PROFILE;
  if (t < P[0][0] || t >= SRB_BURN_TIME) return 0;
  for (let i = 1; i < P.length; i++) {
    if (t <= P[i][0]) {
      const [t0, f0] = P[i - 1];
      const [t1, f1] = P[i];
      return 1000 * (f0 + ((f1 - f0) * (t - t0)) / (t1 - t0));
    }
  }
  return 0;
}

/** Total impulse of one booster (N·s): integral of the thrust curve. */
const SRB_IMPULSE_EACH = SRB_THRUST_PROFILE.reduce((acc, [t1, f1], i, P) => {
  if (i === 0) return 0;
  const [t0, f0] = P[i - 1];
  return acc + 500 * (f0 + f1) * (t1 - t0);
}, 0);

/**
 * Effective specific impulse of the boosters: the one that makes the published thrust
 * curve consume exactly the published propellant (≈ 262 s). Wikipedia cites
 * 269 s; the difference is within how "approximate" the curve is.
 */
export const SRB_ISP = SRB_IMPULSE_EACH / (G0 * (SRB_LOADED_EACH - SRB_EMPTY_EACH));
/** Maximum thrust of the two boosters (N). */
const SRB_THRUST_MAX = 2 * 1000 * Math.max(...SRB_THRUST_PROFILE.map(([, f]) => f));

/** Propellant flow of the two boosters (kg/s) `t` seconds after ignition. */
export const srbMassFlow = (tSinceIgnition: number): number => (2 * srbThrustEach(tSinceIgnition)) / (G0 * SRB_ISP);

// ---------- RS‑25 ----------

/** [SLS] RS‑25 at 109 %: 2,279 kN in vacuum, 1,859 kN at liftoff (sea level). */
const RS25_THRUST_VAC_109 = 2_279_000;
const RS25_THRUST_SL_109 = 1_859_000;
/** RS‑25 vacuum Isp: 452 s (Wikipedia; NOT a primary source). The sea-level one comes from the published thrust ratio. */
const RS25_ISP_VAC = 452;

/** Instant (s before T‑0) at which the RS‑25s start, held down on the pad. [SLS] */
export const RS25_START_BEFORE_LIFTOFF = 6;

/**
 * [SLS] RS‑25 power schedule (fraction of rated power level, RPL):
 * staggered start ~6 s before liftoff up to 100 % one second before T‑0;
 * 109 % from T‑0; 85 % between T+124 and T+128 ("bolt bucket" of booster
 * separation, event table); 109 % afterwards; 67 % from T+481 until MECO (T+486).
 * Acceleration limiting from ~T+421 is imposed by `gLimit` (see power.ts).
 * No throttle-down at Max Q is modeled: the guide describes it as conditional ("if needed").
 * ASSUMPTION: the start-up ramp is linear.
 */
export function rs25PowerLevel(t: number): number {
  if (t < -RS25_START_BEFORE_LIFTOFF) return 0;
  if (t < -1) return (t + RS25_START_BEFORE_LIFTOFF) / (RS25_START_BEFORE_LIFTOFF - 1);
  if (t < 0) return 1 + 0.09 * (t + 1);
  if (t >= 124 && t < 128) return 0.85;
  if (t >= 481) return 0.67;
  return 1.09;
}

/** Fraction of maximum thrust (109 %) requested by the power schedule at `t`. */
export const rs25Throttle = (t: number): number => rs25PowerLevel(t) / 1.09;

export const ENGINES: Readonly<Record<EngineId, EngineSpec>> = {
  // Two boosters: maximum thrust 16,014 kN each [SLS]; the actual thrust follows the curve (see srbThrustEach).
  SRB: { name: 'BOOSTERS', thrustVac: SRB_THRUST_MAX, ispVac: SRB_ISP, ispSl: SRB_ISP * (SRB_THRUST_SL_LAUNCH / SRB_THRUST_PROFILE[0][1]), tank: TANK.SRB },
  // Four RS‑25s at 109 % [SLS].
  RS25: {
    name: 'RS‑25 ×4',
    thrustVac: 4 * RS25_THRUST_VAC_109,
    ispVac: RS25_ISP_VAC,
    ispSl: RS25_ISP_VAC * (RS25_THRUST_SL_109 / RS25_THRUST_VAC_109),
    tank: TANK.CORE,
  },
  // One 110.1 kN RL10C‑2 [SLS]. Isp 465.5 s: RL10B‑2 figure (NASA, ICPS fact sheet); the C‑2's is not published in the guides.
  RL10: { name: 'RL10C‑2', thrustVac: 110_100, ispVac: 465.5, ispSl: 465.5, tank: TANK.ICPS },
  // Orion main engine (OMS‑E): 26.7 kN [A2]. Isp 316 s: value of the Shuttle OMS engine it derives from (not primary).
  MAIN: { name: 'MOTOR PRINCIPAL', thrustVac: 26_700, ispVac: 316, ispSl: 316, tank: TANK.ESM },
  // Eight 490 N auxiliary thrusters [A2]. ASSUMPTION: Isp 312 s.
  AUX: { name: 'AUXILIARES ×8', thrustVac: 8 * 490, ispVac: 312, ispSl: 312, tank: TANK.ESM },
  // Service module RCS: 24 thrusters of 222 N, 12 in normal use [A2]. ASSUMPTION: 4 push along the axis in a translation, Isp 270 s.
  RCS: { name: 'RCS SM', thrustVac: 4 * 222, ispVac: 270, ispSl: 270, tank: TANK.ESM },
  // Capsule RCS: 12 thrusters of 712 N [A2]. ASSUMPTION: 2 push along the axis, Isp 270 s.
  CMRCS: { name: 'RCS CM', thrustVac: 2 * 712, ispVac: 270, ispSl: 270, tank: TANK.CM },
};

/** Propellant flow at full thrust (kg/s). */
export const fullMassFlow = (e: EngineSpec): number => e.thrustVac / (G0 * e.ispVac);

/**
 * [SLS] Booster separation motors: 8 per booster of ~89 kN for a little
 * under 1 s. On the 99.3 t of the empty booster they give ~7.2 m/s sideways.
 */
export const SRB_SEPARATION_SPEED = (8 * 89_000 * 1) / SRB_EMPTY_EACH; // m/s

/**
 * Reference area times drag coefficient (m²). The areas come from the published
 * diameters (core stage 8.41 m, boosters 3.7 m, ICPS 5.09 m, Orion 5.0 m).
 * ASSUMPTION: Cd = 0.5 constant.
 */
export function dragArea(cfg: VehicleConfig): number {
  const cd = 0.5;
  if (!cfg.srbSeparated) return cd * (Math.PI * 4.205 ** 2 + 2 * Math.PI * 1.85 ** 2);
  if (!cfg.coreSeparated) return cd * Math.PI * 4.205 ** 2;
  return cd * Math.PI * 2.5 ** 2;
}

/** Ideal Δv (km/s) from burning `propellant` kg starting at mass `mass` with one engine (rocket equation). */
export function idealDv(engine: EngineSpec, mass: number, propellant: number): number {
  const burn = Math.min(propellant, mass - 1);
  return burn <= 0 ? 0 : ((G0 * engine.ispVac) / 1000) * Math.log(mass / (mass - burn));
}

/** Duration (s) of a full-thrust burn that delivers an ideal Δv `dv` (km/s) starting at mass `mass`. */
export function burnDuration(engine: EngineSpec, mass: number, dv: number): number {
  return (mass / fullMassFlow(engine)) * (1 - Math.exp((-dv * 1000) / (G0 * engine.ispVac)));
}

/** Ideal Δv (km/s) delivered by a full-thrust burn of `duration` seconds starting at mass `mass`. */
export function dvForDuration(engine: EngineSpec, mass: number, duration: number): number {
  return ((G0 * engine.ispVac) / 1000) * Math.log(mass / (mass - fullMassFlow(engine) * duration));
}
