/**
 * El vehículo: etapas, masas y motores. Unidades de este archivo: kg, N, s (SI).
 *
 * Fuentes (ver también process.md):
 * - [SLS] NASA, "Space Launch System Reference Guide for Artemis II", SLS‑5558, octubre
 *   de 2025 (fuente primaria): masas de boosters, etapa central, motores RS‑25, ICPS,
 *   adaptadores LVSA y OSA, CubeSats; curva de empuje de los boosters; programa de
 *   potencia de los RS‑25; motores de separación de los boosters.
 * - [A2] NASA, "Artemis II Reference Guide", 2026 (fuente primaria): masas de Orion
 *   (módulo de tripulación, módulo de servicio, torre de escape, paneles, adaptador),
 *   propulsores del módulo de servicio y de la cápsula.
 * - Lo que no está en esas guías se marca con su fuente secundaria o como SUPUESTO.
 */

/** Gravedad estándar, para pasar de impulso específico a velocidad de escape. */
export const G0 = 9.80665; // m/s²

/** Qué partes siguen unidas a la nave. */
export interface VehicleConfig {
  /** Los dos boosters de combustible sólido ya se separaron. */
  readonly srbSeparated: boolean;
  /** Se eyectaron la torre de escape (LAS) y los paneles del módulo de servicio. */
  readonly lasJettisoned: boolean;
  /** La etapa central (con el adaptador LVSA) ya se separó. */
  readonly coreSeparated: boolean;
  /** Orion ya se separó del ICPS (que se lleva el adaptador OSA, los CubeSats y el adaptador de la nave). */
  readonly icpsSeparated: boolean;
  /** El módulo de tripulación ya se separó del módulo de servicio. */
  readonly cmSeparated: boolean;
}

export const CONFIG_AT_LIFTOFF: VehicleConfig = {
  srbSeparated: false,
  lasJettisoned: false,
  coreSeparated: false,
  icpsSeparated: false,
  cmSeparated: false,
};

/** Tanques, en el orden del vector de propelente que lleva el integrador. */
export const TANK = { SRB: 0, CORE: 1, ICPS: 2, ESM: 3, CM: 4 } as const;
export type TankName = keyof typeof TANK;
export type PropLoad = readonly [number, number, number, number, number];
export const TANK_COUNT = 5;

/** [SLS] Booster: 726 t cargado, 99,3 t vacío. */
const SRB_LOADED_EACH = 726_000;
const SRB_EMPTY_EACH = 99_300;

export const MASS = {
  srbDry: 2 * SRB_EMPTY_EACH,
  srbProp: 2 * (SRB_LOADED_EACH - SRB_EMPTY_EACH),
  /** [SLS] Etapa central vacía sin motores 85,3 t + cuatro RS‑25 de 3,52 t. */
  coreDry: 85_300 + 4 * 3_520,
  /**
   * [SLS] Etapa central cargada sin motores 1.089 t menos vacía 85,3 t. La misma guía
   * da 998 t ("total propellant weight") y 987,5 t (capacidad de LH2 + LOX): se toma
   * cargada − vacía porque los dos datos salen de la misma tabla.
   */
  coreProp: 1_089_000 - 85_300,
  /** [SLS] Adaptador de etapas (LVSA): se va con la etapa central. */
  lvsa: 4_500,
  /** [SLS] ICPS: 32,748 t cargado, 3,719 t vacío. */
  icpsDry: 3_719,
  icpsProp: 32_748 - 3_719,
  /** [SLS] Adaptador de Orion (OSA) y cuatro CubeSats de hasta 26 kg (se usa el máximo). Quedan con el ICPS. */
  osa: 820,
  cubesat: 26,
  /** [A2] Adaptador de la nave (entre el módulo de servicio y el OSA): queda con el ICPS. */
  spacecraftAdapter: 1_270,
  /** [A2] Torre de escape (LAS) y paneles protectores del módulo de servicio. */
  las: 7_711,
  fairing: 454,
  /** [A2] Módulo de servicio 15.558 kg con 8.618 kg de propelente útil. */
  smDry: 15_558 - 8_618,
  esmProp: 8_618,
  /** [A2] Módulo de tripulación al lanzamiento (llega al agua con 9.299 kg). */
  cm: 10_387,
  /** SUPUESTO: propelente del RCS de la cápsula (no publicado). */
  cmProp: 150,
} as const;

export const CUBESAT_COUNT = 4;

export const FULL_TANKS: PropLoad = [MASS.srbProp, MASS.coreProp, MASS.icpsProp, MASS.esmProp, MASS.cmProp];

/** Masa de las partes unidas, sin propelente (kg). */
export function dryMass(cfg: VehicleConfig): number {
  let m = MASS.cm;
  if (!cfg.cmSeparated) m += MASS.smDry;
  if (!cfg.icpsSeparated) m += MASS.icpsDry + MASS.osa + CUBESAT_COUNT * MASS.cubesat + MASS.spacecraftAdapter;
  if (!cfg.coreSeparated) m += MASS.coreDry + MASS.lvsa;
  if (!cfg.srbSeparated) m += MASS.srbDry;
  if (!cfg.lasJettisoned) m += MASS.las + MASS.fairing;
  return m;
}

/** Masa total de la nave (kg). El propelente de una etapa separada ya no cuenta. */
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
  /** Empuje en vacío a pleno (N), sumando todas las unidades. */
  readonly thrustVac: number;
  /** Impulso específico en vacío y a nivel del mar (s). */
  readonly ispVac: number;
  readonly ispSl: number;
  readonly tank: number;
}

// ---------- Boosters ----------

/**
 * [SLS] Curva de empuje en vacío de cada booster (s, kN): 16.014 kN máximos durante
 * unos 25 s, baja a 12.455 kN al pasar por Max Q (T+71 s), vuelve a 14.679 kN y
 * empieza a decaer a los ~90 s; quemado de ~126 s. Los 14.679 kN "al despegue" de la
 * guía son el valor a nivel del mar de ese máximo (14.679/16.014 = 0,917, la relación
 * nivel del mar/vacío de estos boosters): así el empuje total al despegue da los
 * 36.787 kN publicados. La forma del decaimiento final (de 90 s al apagado) es un
 * SUPUESTO: la guía solo da el instante en que empieza.
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
/** [SLS] Empuje de un booster al despegue (nivel del mar), kN. */
const SRB_THRUST_SL_LAUNCH = 14_679;

/** Duración del quemado de los boosters (s). */
export const SRB_BURN_TIME = SRB_THRUST_PROFILE[SRB_THRUST_PROFILE.length - 1][0];

/** Empuje de UN booster (N) a `t` segundos de la ignición, interpolando la curva publicada. */
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

/** Impulso total de un booster (N·s): integral de la curva de empuje. */
const SRB_IMPULSE_EACH = SRB_THRUST_PROFILE.reduce((acc, [t1, f1], i, P) => {
  if (i === 0) return 0;
  const [t0, f0] = P[i - 1];
  return acc + 500 * (f0 + f1) * (t1 - t0);
}, 0);

/**
 * Impulso específico efectivo de los boosters: el que hace que la curva de empuje
 * publicada consuma exactamente el propelente publicado (≈ 262 s). Wikipedia cita
 * 269 s; la diferencia está dentro de lo "aproximado" de la curva.
 */
export const SRB_ISP = SRB_IMPULSE_EACH / (G0 * (SRB_LOADED_EACH - SRB_EMPTY_EACH));
/** Empuje máximo de los dos boosters (N). */
const SRB_THRUST_MAX = 2 * 1000 * Math.max(...SRB_THRUST_PROFILE.map(([, f]) => f));

/** Consumo de los dos boosters (kg/s) a `t` segundos de la ignición. */
export const srbMassFlow = (tSinceIgnition: number): number => (2 * srbThrustEach(tSinceIgnition)) / (G0 * SRB_ISP);

// ---------- RS‑25 ----------

/** [SLS] RS‑25 al 109 %: 2.279 kN en vacío, 1.859 kN al despegue (nivel del mar). */
const RS25_THRUST_VAC_109 = 2_279_000;
const RS25_THRUST_SL_109 = 1_859_000;
/** Isp en vacío del RS‑25: 452 s (Wikipedia; NO es fuente primaria). El de nivel del mar sale del cociente de empujes publicado. */
const RS25_ISP_VAC = 452;

/** Instante (s antes de T‑0) en que arrancan los RS‑25, sujetos a la plataforma. [SLS] */
export const RS25_START_BEFORE_LIFTOFF = 6;

/**
 * [SLS] Programa de potencia de los RS‑25 (fracción de la potencia nominal, RPL):
 * arranque escalonado ~6 s antes del despegue hasta el 100 % un segundo antes de T‑0;
 * 109 % desde T‑0; 85 % entre T+124 y T+128 ("bolt bucket" de la separación de los
 * boosters, tabla de eventos); 109 % después; 67 % desde T+481 hasta MECO (T+486).
 * La limitación de aceleración desde ~T+421 la impone `gLimit` (ver power.ts).
 * No se modela una bajada en Max Q: la guía la describe como condicional ("si hace falta").
 * SUPUESTO: la rampa de arranque es lineal.
 */
export function rs25PowerLevel(t: number): number {
  if (t < -RS25_START_BEFORE_LIFTOFF) return 0;
  if (t < -1) return (t + RS25_START_BEFORE_LIFTOFF) / (RS25_START_BEFORE_LIFTOFF - 1);
  if (t < 0) return 1 + 0.09 * (t + 1);
  if (t >= 124 && t < 128) return 0.85;
  if (t >= 481) return 0.67;
  return 1.09;
}

/** Fracción del empuje máximo (109 %) que pide el programa de potencia en `t`. */
export const rs25Throttle = (t: number): number => rs25PowerLevel(t) / 1.09;

export const ENGINES: Readonly<Record<EngineId, EngineSpec>> = {
  // Dos boosters: empuje máximo 16.014 kN cada uno [SLS]; el empuje real sigue la curva (ver srbThrustEach).
  SRB: { name: 'BOOSTERS', thrustVac: SRB_THRUST_MAX, ispVac: SRB_ISP, ispSl: SRB_ISP * (SRB_THRUST_SL_LAUNCH / SRB_THRUST_PROFILE[0][1]), tank: TANK.SRB },
  // Cuatro RS‑25 al 109 % [SLS].
  RS25: {
    name: 'RS‑25 ×4',
    thrustVac: 4 * RS25_THRUST_VAC_109,
    ispVac: RS25_ISP_VAC,
    ispSl: RS25_ISP_VAC * (RS25_THRUST_SL_109 / RS25_THRUST_VAC_109),
    tank: TANK.CORE,
  },
  // Un RL10C‑2 de 110,1 kN [SLS]. Isp 465,5 s: dato del RL10B‑2 (NASA, ICPS fact sheet); el del C‑2 no está publicado en las guías.
  RL10: { name: 'RL10C‑2', thrustVac: 110_100, ispVac: 465.5, ispSl: 465.5, tank: TANK.ICPS },
  // Motor principal de Orion (OMS‑E): 26,7 kN [A2]. Isp 316 s: valor del motor OMS del Shuttle del que deriva (no primario).
  MAIN: { name: 'MOTOR PRINCIPAL', thrustVac: 26_700, ispVac: 316, ispSl: 316, tank: TANK.ESM },
  // Ocho auxiliares de 490 N [A2]. SUPUESTO: Isp 312 s.
  AUX: { name: 'AUXILIARES ×8', thrustVac: 8 * 490, ispVac: 312, ispSl: 312, tank: TANK.ESM },
  // RCS del módulo de servicio: 24 propulsores de 222 N, 12 en uso normal [A2]. SUPUESTO: 4 empujan en el eje en una traslación, Isp 270 s.
  RCS: { name: 'RCS SM', thrustVac: 4 * 222, ispVac: 270, ispSl: 270, tank: TANK.ESM },
  // RCS de la cápsula: 12 propulsores de 712 N [A2]. SUPUESTO: 2 empujan en el eje, Isp 270 s.
  CMRCS: { name: 'RCS CM', thrustVac: 2 * 712, ispVac: 270, ispSl: 270, tank: TANK.CM },
};

/** Consumo a pleno empuje (kg/s). */
export const fullMassFlow = (e: EngineSpec): number => e.thrustVac / (G0 * e.ispVac);

/**
 * [SLS] Motores de separación de los boosters: 8 por booster de ~89 kN durante algo
 * menos de 1 s. Sobre los 99,3 t del booster vacío dan ~7,2 m/s de costado.
 */
export const SRB_SEPARATION_SPEED = (8 * 89_000 * 1) / SRB_EMPTY_EACH; // m/s

/**
 * Área de referencia por coeficiente de arrastre (m²). Las áreas salen de los diámetros
 * publicados (etapa central 8,41 m, boosters 3,7 m, ICPS 5,09 m, Orion 5,0 m).
 * SUPUESTO: Cd = 0,5 constante.
 */
export function dragArea(cfg: VehicleConfig): number {
  const cd = 0.5;
  if (!cfg.srbSeparated) return cd * (Math.PI * 4.205 ** 2 + 2 * Math.PI * 1.85 ** 2);
  if (!cfg.coreSeparated) return cd * Math.PI * 4.205 ** 2;
  return cd * Math.PI * 2.5 ** 2;
}

/** Δv ideal (km/s) que da quemar `propellant` kg desde la masa `mass` con un motor (ecuación del cohete). */
export function idealDv(engine: EngineSpec, mass: number, propellant: number): number {
  const burn = Math.min(propellant, mass - 1);
  return burn <= 0 ? 0 : ((G0 * engine.ispVac) / 1000) * Math.log(mass / (mass - burn));
}

/** Duración (s) de un encendido a pleno empuje que entrega un Δv ideal `dv` (km/s) desde la masa `mass`. */
export function burnDuration(engine: EngineSpec, mass: number, dv: number): number {
  return (mass / fullMassFlow(engine)) * (1 - Math.exp((-dv * 1000) / (G0 * engine.ispVac)));
}

/** Δv ideal (km/s) que entrega un encendido de `duration` segundos a pleno empuje desde la masa `mass`. */
export function dvForDuration(engine: EngineSpec, mass: number, duration: number): number {
  return ((G0 * engine.ispVac) / 1000) * Math.log(mass / (mass - fullMassFlow(engine) * duration));
}
