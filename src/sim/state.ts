import { airVelocity } from './atmosphere';
import { Ephemeris, createCircularEphemeris } from './bodies';
import { DeltaV, ZERO_DV } from './burns';
import { CommsStatus, commsStatus } from './comms';
import { R_EARTH } from './constants';
import { ShipState } from './integrator';
import { Vec3, add, distance, vec3 } from './math/vec3';
import { MissionParams } from './mission/params';
import { Phase } from './mission/phases';
import { EventId } from './mission/timeline';
import { EntryInterface, Perilune, Prediction } from './propagate';
import { INITIAL_PROPULSION, PropSystem, PropulsionState } from './propulsion';
import { CONFIG_AT_LIFTOFF, EngineId, VehicleConfig } from './vehicle';

export type LogLevel = 'INFO' | 'EVENT' | 'CAUTION' | 'WARNING';

export interface LogEntry {
  readonly t: number;
  readonly level: LogLevel;
  readonly text: string;
  readonly eventId?: EventId;
}

/** Marcador numerado que queda sobre el trazo cuando ocurre un evento. */
export interface Marker {
  readonly eventId: EventId;
  readonly n: number;
  readonly t: number;
  readonly r: Vec3;
}

export type TrailNet = 'NSN' | 'DSN' | 'LOS';

export interface TrailPoint {
  readonly t: number;
  readonly r: Vec3;
  /** Altitud sobre la Tierra (km). */
  readonly alt: number;
  readonly phase: Phase;
  readonly net: TrailNet;
  /** Durante la demo de operaciones de proximidad (E6). */
  readonly prox: boolean;
}

export type ManeuverId = 'E7' | 'E8' | 'E9' | 'E10' | 'E12' | 'MAN';
export type ProcedureId = 'SEP_ICPS' | ManeuverId | 'SEP_CM';
export type ManeuverStatus = 'pending' | 'committed' | 'burning' | 'done' | 'missed';

export interface Maneuver {
  readonly id: ManeuverId;
  readonly eventId: EventId | null;
  readonly system: PropSystem;
  /** Instante de ignición. null = enciende al accionar. */
  readonly tig: number | null;
  /** Δv planeado (editable en modo avanzado). */
  readonly dv: DeltaV;
  /** Eje que ajustan las teclas ΔV± y el guiado. */
  readonly axis: keyof DeltaV;
  readonly confirmed: boolean;
  /** El guiado ya calculó el Δv (solo correcciones). */
  readonly computed: boolean;
  readonly status: ManeuverStatus;
  /** Cantidad de veces ejecutada (las correcciones son repetibles). */
  readonly executions: number;
  readonly lastExecutedAt: number | null;
}

export interface AutoBurn {
  readonly id: 'E4' | 'E5';
  readonly met: number;
  readonly dv: DeltaV;
  readonly status: 'pending' | 'burning' | 'done' | 'cancelled';
}

/** Encendido en curso: el motor empuja hasta `tEnd` (o hasta que se corte o se quede sin propelente). */
export interface ActiveBurn {
  readonly id: 'E4' | 'E5' | ManeuverId;
  readonly system: PropSystem;
  readonly tStart: number;
  readonly tEnd: number;
  /** Δv ideal pedido (km/s) y su reparto en el marco local: fija la dirección del empuje. */
  readonly dv: DeltaV;
  /** Masa y propelente del tanque al encender (kg), para medir el Δv entregado. */
  readonly massStart: number;
  readonly propStart: number;
}

export interface Switches {
  readonly mainArm: boolean;
  readonly auxArm: boolean;
  readonly icpsSepArm: boolean;
  readonly cmSepArm: boolean;
  /** La tripulación automática ejecuta los pasos manuales en su momento nominal. */
  readonly autoCrew: boolean;
  /** Pausa automática antes de cada acción de la tripulación. */
  readonly autoPause: boolean;
}
export type SwitchName = keyof Switches;

/**
 * Piloto automático digital (DAP):
 * - AUTO: el guiado orienta la nave (prograde en crucero, actitud de encendido en las maniobras).
 * - INRTL: mantiene la actitud inercial actual.
 * - MAN: la tripulación rota la nave con el controlador de rotación (RHC).
 */
export type DapMode = 'AUTO' | 'INRTL' | 'MAN';

export interface Attitude {
  /** Eje longitudinal de la nave (unitario, marco inercial): hacia donde empujan los motores. */
  readonly dir: Vec3;
  readonly mode: DapMode;
  /** Deflexión del controlador de rotación en cabeceo: −1, 0 o +1. */
  readonly rhc: number;
}

export interface ProcState {
  readonly activeId: ProcedureId;
  /** Paso elegido con Jump to Step; null = sigue al primer paso pendiente. */
  readonly cursor: number | null;
  /** Pasos salteados con Skip, como "PROC:índice". */
  readonly skipped: readonly string[];
  /** Modo avanzado: permite editar el Δv planeado. */
  readonly advanced: boolean;
}

export type AlarmLevel = 'WARNING' | 'CAUTION';
export interface Alarm {
  readonly id: string;
  readonly level: AlarmLevel;
  readonly text: string;
  readonly since: number;
  readonly acked: boolean;
}

export interface ApsisRecord {
  readonly type: 'periapsis' | 'apoapsis';
  readonly t: number;
  /** Radio desde el centro de la Tierra (km). */
  readonly radius: number;
  /** Energía específica respecto de la Tierra (km²/s²). */
  readonly energy: number;
}

export interface EntryRecord extends EntryInterface {
  /** Perigeo osculante en EI (km desde el centro): el que tendría sin atmósfera. */
  readonly rp: number;
  readonly energy: number;
}

export type OutcomeKind =
  | 'success'
  | 'entry-shallow'
  | 'entry-steep'
  | 'entry-no-sep'
  | 'reentry-early'
  | 'crash'
  | 'moon-impact'
  | 'lost';

export interface Outcome {
  readonly kind: OutcomeKind;
  readonly t: number;
  readonly text: string;
}

export interface MissionRecord {
  readonly apsides: readonly ApsisRecord[];
  readonly perilune: Perilune | null;
  readonly ei: EntryRecord | null;
  readonly tliAt: number | null;
  readonly icpsSepAt: number | null;
  readonly cmSepAt: number | null;
  /** Estado en E3 (separación de la etapa central): velocidad inercial y ángulo de trayectoria. */
  readonly insertion: {
    readonly t: number;
    readonly altitude: number;
    /** Velocidad inercial (km/s). */
    readonly speed: number;
    /** Velocidad relativa a la Tierra en rotación (km/s): la que publican las tablas de ascenso. */
    readonly speedRel: number;
    readonly fpaDeg: number;
  } | null;
  /** Presión dinámica máxima del ascenso (Pa) y cuándo ocurrió. */
  readonly maxQ: { readonly t: number; readonly q: number; readonly logged: boolean } | null;
}

export type DebrisKind = 'SRB' | 'LAS' | 'FAIRING' | 'CORE' | 'ICPS' | 'SM';

/** Parte desprendida de la nave: sigue su propia trayectoria (gravedad y arrastre). */
export interface Debris {
  readonly id: string;
  readonly kind: DebrisKind;
  readonly ship: ShipState;
  /** Instante hasta el que está propagada. */
  readonly t: number;
  readonly hNext: number;
  /** Coeficiente balístico inverso Cd·A/m (m²/kg). */
  readonly ballistic: number;
  /** MET del desprendimiento. */
  readonly since: number;
  /** Eje longitudinal que tenía al desprenderse (para dibujarla). */
  readonly dir: Vec3;
}

export interface SimState {
  readonly params: MissionParams;
  /** Tiempo de misión (MET) en segundos. */
  readonly t: number;
  readonly ship: ShipState;
  /** Paso sugerido por el integrador para continuar. */
  readonly hNext: number;
  readonly phase: Phase;
  readonly clock: { readonly running: boolean; readonly warp: number };
  /** Warp a restaurar después de una bajada automática (null si no hay ninguna en curso). */
  readonly warpRestore: number | null;
  readonly vehicle: VehicleConfig;
  readonly propulsion: PropulsionState;
  /** Motores del cohete encendidos durante el ascenso. */
  readonly ascentEngines: readonly EngineId[];
  /** Tangente del cabeceo al empezar el guiado de tangente lineal (null antes de eso). */
  readonly ascentTan: number | null;
  /** Encendido en curso en el espacio. */
  readonly burn: ActiveBurn | null;
  readonly attitude: Attitude;
  /** Controlador de traslación (THC) sobre el eje de la nave: −1, 0 o +1. */
  readonly thc: number;
  readonly switches: Switches;
  readonly maneuvers: Readonly<Record<ManeuverId, Maneuver>>;
  readonly autoBurns: Readonly<Record<'E4' | 'E5', AutoBurn>>;
  readonly proc: ProcState;
  /** Claves de disparadores de un solo uso ya consumidos. */
  readonly oneShots: readonly string[];
  readonly comms: CommsStatus;
  readonly prediction: Prediction | null;
  readonly predictionDirty: boolean;
  readonly alarms: readonly Alarm[];
  readonly log: readonly LogEntry[];
  readonly markers: readonly Marker[];
  /** Trazo recorrido. Solo se le agregan puntos (buffer compartido entre estados). */
  readonly trail: TrailPoint[];
  readonly trailNextT: number;
  readonly debris: readonly Debris[];
  readonly record: MissionRecord;
  readonly outcome: Outcome | null;
  /** Sin predicción, alarmas ni partes desprendidas: para scripts y tests. */
  readonly headless: boolean;
}

const ephCache = new Map<number, Ephemeris>();
/** Efemérides de la misión (dependen solo de la fase lunar de los parámetros). */
export function ephemerisOf(state: { readonly params: MissionParams }): Ephemeris {
  const deg = state.params.moonAngle0Deg;
  let eph = ephCache.get(deg);
  if (!eph) {
    if (ephCache.size > 64) ephCache.clear();
    eph = createCircularEphemeris((deg * Math.PI) / 180);
    ephCache.set(deg, eph);
  }
  return eph;
}

export const altitudeOf = (state: SimState): number =>
  distance(state.ship.r, ephemerisOf(state).earth(state.t).r) - R_EARTH;

function maneuver(
  id: ManeuverId,
  eventId: EventId | null,
  system: PropSystem,
  tig: number | null,
  dv: DeltaV,
  axis: keyof DeltaV,
): Maneuver {
  return { id, eventId, system, tig, dv, axis, confirmed: false, computed: false, status: 'pending', executions: 0, lastExecutedAt: null };
}

export interface InitOptions {
  headless?: boolean;
  autoCrew?: boolean;
}

/**
 * Estado inicial: el cohete completo en la plataforma, en MET 0. La plataforma está
 * sobre el eje +y respecto de la Tierra (arriba en el mapa, así el cohete sube hacia
 * arriba en pantalla) y ya se mueve hacia el este con la rotación terrestre. Al dar
 * play encienden los motores y despega.
 */
export function createInitialState(params: MissionParams, opts: InitOptions = {}): SimState {
  const eph = ephemerisOf({ params });
  const earth = eph.earth(0);
  const r = add(earth.r, vec3(0, R_EARTH, 0));
  const ship: ShipState = { r, v: airVelocity(r, earth) };
  const b = params.burns;
  return {
    params,
    t: 0,
    ship,
    hNext: 0.05,
    phase: 'ASCENSO',
    clock: { running: false, warp: 1 },
    warpRestore: null,
    vehicle: CONFIG_AT_LIFTOFF,
    propulsion: INITIAL_PROPULSION,
    ascentEngines: ['SRB', 'RS25'],
    ascentTan: null,
    burn: null,
    // En la plataforma el cohete apunta hacia arriba.
    attitude: { dir: vec3(0, 1, 0), mode: 'AUTO', rhc: 0 },
    thc: 0,
    switches: {
      mainArm: false,
      auxArm: false,
      icpsSepArm: false,
      cmSepArm: false,
      autoCrew: opts.autoCrew ?? false,
      autoPause: true,
    },
    maneuvers: {
      E7: maneuver('E7', 'E7', b.E7.system, b.E7.met, b.E7.dv, 'prograde'),
      E8: maneuver('E8', 'E8', b.E8.system, b.E8.met, b.E8.dv, 'prograde'),
      E9: maneuver('E9', 'E9', b.E9.system, b.E9.met, b.E9.dv, 'prograde'),
      E10: maneuver('E10', 'E10', 'AUX', null, ZERO_DV, 'radial'),
      E12: maneuver('E12', 'E12', 'AUX', null, ZERO_DV, 'radial'),
      MAN: maneuver('MAN', null, 'MAIN', null, ZERO_DV, 'prograde'),
    },
    autoBurns: {
      E4: { id: 'E4', met: b.E4.met, dv: b.E4.dv, status: 'pending' },
      E5: { id: 'E5', met: b.E5.met, dv: b.E5.dv, status: 'pending' },
    },
    proc: { activeId: 'SEP_ICPS', cursor: null, skipped: [], advanced: false },
    oneShots: [],
    comms: commsStatus(ship.r, 0, eph),
    prediction: null,
    predictionDirty: false,
    alarms: [],
    log: [{ t: 0, level: 'EVENT', text: 'E1 · Cohete en la plataforma LC‑39B. Listo para el lanzamiento.', eventId: 'E1' }],
    markers: [{ eventId: 'E1', n: 1, t: 0, r: ship.r }],
    trail: [{ t: 0, r: ship.r, alt: 0, phase: 'ASCENSO', net: 'NSN', prox: false }],
    trailNextT: 0,
    debris: [],
    record: { apsides: [], perilune: null, ei: null, tliAt: null, icpsSepAt: null, cmSepAt: null, insertion: null, maxQ: null },
    outcome: null,
    headless: opts.headless ?? false,
  };
}

// --- Store ---

export type Listener = () => void;

export interface Store {
  getState(): SimState;
  /** Aplica una función pura estado → estado y notifica. */
  dispatch(fn: (s: SimState) => SimState): void;
  subscribe(listener: Listener): () => void;
}

export function createStore(initial: SimState): Store {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    dispatch(fn) {
      const next = fn(state);
      if (next !== state) {
        state = next;
        listeners.forEach((l) => l());
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
