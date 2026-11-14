/**
 * El vehículo: etapas, masas y motores. Unidades de este archivo: kg, N, s (SI).
 *
 * Fuentes de los datos (ver también process.md):
 * - SLS Block 1, boosters, etapa central e ICPS: Wikipedia, "Space Launch System"
 *   (que cita la SLS Reference Guide de NASA). NO es fuente primaria.
 * - Empuje del ICPS: NASA, ICPS fact sheet (24.750 lbf).
 * - Orion: masas de Wikipedia, "Orion (spacecraft)"; motor principal de 26,7 kN de
 *   NASA NTRS ("Artemis I engine performance"); auxiliares y RCS de NASA/ESA.
 * Lo que no tiene fuente está marcado como SUPUESTO.
 */

/** Gravedad estándar, para pasar de impulso específico a velocidad de escape. */
export const G0 = 9.80665; // m/s²

/** Qué partes siguen unidas a la nave. */
export interface VehicleConfig {
  /** Los dos boosters de combustible sólido ya se separaron. */
  readonly srbSeparated: boolean;
  /** Se eyectaron la torre de escape (LAS) y los paneles del módulo de servicio. */
  readonly lasJettisoned: boolean;
  /** La etapa central ya se separó. */
  readonly coreSeparated: boolean;
  /** Orion ya se separó del ICPS. */
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
export const TANK = { SRB: 0, CORE: 1, ICPS: 2, ESM: 3 } as const;
export type TankName = keyof typeof TANK;
export type PropLoad = readonly [number, number, number, number];

const SRB_GROSS_EACH = 730_000;
/** SUPUESTO: 86 % de la masa del booster es propelente (no encontré el dato publicado). */
const SRB_PROP_EACH = 627_800;

export const MASS = {
  srbDry: 2 * (SRB_GROSS_EACH - SRB_PROP_EACH),
  srbProp: 2 * SRB_PROP_EACH,
  coreDry: 97_940,
  coreProp: 984_000, // 144.000 kg de LH2 + 840.000 kg de LOX
  /** Torre de escape: 33.446 kg (CM + ESM + LAS) − 26.520 kg (CM + ESM). */
  las: 6_926,
  icpsDry: 3_490,
  icpsProp: 32_066 - 3_490,
  /** Módulo de servicio sin propelente: 26.520 − 10.400 (CM) − 8.600 (propelente). */
  smDry: 26_520 - 10_400 - 8_600,
  esmProp: 8_600,
  cm: 10_400,
} as const;

export const FULL_TANKS: PropLoad = [MASS.srbProp, MASS.coreProp, MASS.icpsProp, MASS.esmProp];

/** Masa de las partes unidas, sin propelente (kg). */
export function dryMass(cfg: VehicleConfig): number {
  let m = MASS.cm;
  if (!cfg.cmSeparated) m += MASS.smDry;
  if (!cfg.icpsSeparated) m += MASS.icpsDry;
  if (!cfg.coreSeparated) m += MASS.coreDry;
  if (!cfg.srbSeparated) m += MASS.srbDry;
  if (!cfg.lasJettisoned) m += MASS.las;
  return m;
}

/** Masa total de la nave (kg). El propelente de una etapa separada ya no cuenta. */
export function totalMass(cfg: VehicleConfig, prop: readonly number[]): number {
  let m = dryMass(cfg);
  if (!cfg.srbSeparated) m += prop[TANK.SRB];
  if (!cfg.coreSeparated) m += prop[TANK.CORE];
  if (!cfg.icpsSeparated) m += prop[TANK.ICPS];
  if (!cfg.cmSeparated) m += prop[TANK.ESM];
  return m;
}

export type EngineId = 'SRB' | 'RS25' | 'RL10' | 'MAIN' | 'AUX' | 'RCS';

export interface EngineSpec {
  readonly name: string;
  /** Empuje en vacío a pleno (N), sumando todas las unidades. */
  readonly thrustVac: number;
  /** Impulso específico en vacío y a nivel del mar (s). */
  readonly ispVac: number;
  readonly ispSl: number;
  readonly tank: number;
}

export const ENGINES: Readonly<Record<EngineId, EngineSpec>> = {
  // Dos boosters de 16 MN máximos en vacío (14,6 MN a nivel del mar), Isp 269 s.
  SRB: { name: 'BOOSTERS', thrustVac: 2 * 16.0e6, ispVac: 269, ispSl: 269 * (14.6 / 16), tank: TANK.SRB },
  // Cuatro RS‑25 de 2.281 kN en vacío; Isp 452 s (vacío) y 366 s (nivel del mar).
  RS25: { name: 'RS‑25 ×4', thrustVac: 4 * 2.281e6, ispVac: 452, ispSl: 366, tank: TANK.CORE },
  // Un RL10 de 110,1 kN (24.750 lbf), Isp 465,5 s.
  RL10: { name: 'RL10', thrustVac: 110_100, ispVac: 465.5, ispSl: 465.5, tank: TANK.ICPS },
  // Motor principal de Orion (OMS‑E): 26,7 kN. Isp 316 s: valor del motor OMS del Shuttle del que deriva.
  MAIN: { name: 'MOTOR PRINCIPAL', thrustVac: 26_700, ispVac: 316, ispSl: 316, tank: TANK.ESM },
  // Ocho auxiliares R‑4D‑11 de 490 N. SUPUESTO: Isp 312 s.
  AUX: { name: 'AUXILIARES ×8', thrustVac: 8 * 490, ispVac: 312, ispSl: 312, tank: TANK.ESM },
  // Traslación con RCS: SUPUESTO de 4 de los 24 propulsores de 220 N empujando en el eje, Isp 270 s.
  RCS: { name: 'RCS', thrustVac: 4 * 220, ispVac: 270, ispSl: 270, tank: TANK.ESM },
};

/** Consumo a pleno empuje (kg/s). */
export const fullMassFlow = (e: EngineSpec): number => e.thrustVac / (G0 * e.ispVac);

/** Duración del quemado de los boosters (s). */
export const SRB_BURN_TIME = 126;
/**
 * Perfil de los boosters: el consumo baja linealmente desde el máximo (empuje máximo
 * publicado) hasta agotar exactamente el propelente en el tiempo de quemado publicado.
 * Es una aproximación: la curva real de empuje tiene más estructura.
 */
const SRB_DECAY = 2 * (1 - MASS.srbProp / (fullMassFlow(ENGINES.SRB) * SRB_BURN_TIME));
export function srbMassFlow(tSinceIgnition: number): number {
  if (tSinceIgnition < 0 || tSinceIgnition >= SRB_BURN_TIME) return 0;
  return fullMassFlow(ENGINES.SRB) * (1 - (SRB_DECAY * tSinceIgnition) / SRB_BURN_TIME);
}

/**
 * Área de referencia por coeficiente de arrastre (m²). Las áreas salen de los diámetros
 * (etapa central 8,4 m, boosters 3,7 m, ICPS/Orion 5,1 m). SUPUESTO: Cd = 0,5 constante.
 */
export function dragArea(cfg: VehicleConfig): number {
  const cd = 0.5;
  if (!cfg.srbSeparated) return cd * (Math.PI * 4.2 ** 2 + 2 * Math.PI * 1.85 ** 2);
  if (!cfg.coreSeparated) return cd * Math.PI * 4.2 ** 2;
  return cd * Math.PI * 2.55 ** 2;
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
