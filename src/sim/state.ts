import { Ephemeris, createCircularEphemeris } from './bodies';
import { DeltaV, ZERO_DV } from './burns';
import { CommsStatus, commsStatus, networkForAltitude } from './comms';
import { R_EARTH } from './constants';
import { ShipState } from './integrator';
import { Vec3, add, distance, vec3 } from './math/vec3';
import { MissionParams } from './mission/params';
import { Phase } from './mission/phases';
import { EventId } from './mission/timeline';
import { EntryInterface, Perilune, Prediction } from './propagate';
import { INITIAL_PROPULSION, PropSystem, PropulsionState, VehicleConfig } from './propulsion';

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
export type ManeuverStatus = 'pending' | 'committed' | 'done' | 'missed';

export interface Maneuver {
  readonly id: ManeuverId;
  readonly eventId: EventId | null;
  readonly system: PropSystem;
  /** Instante de encendido. null = se ejecuta al accionar. */
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
  readonly status: 'pending' | 'done' | 'cancelled';
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
  readonly vehicle: VehicleConfig;
  readonly propulsion: PropulsionState;
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
  readonly record: MissionRecord;
  readonly outcome: Outcome | null;
  /** Sin predicción ni alarmas: para scripts y tests. */
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
 * Estado inicial en E3 (separación de la etapa central): la nave está sobre el eje +x
 * respecto de la Tierra y se mueve en sentido antihorario, igual que la Luna.
 */
export function createInitialState(params: MissionParams, opts: InitOptions = {}): SimState {
  const eph = ephemerisOf({ params });
  const ins = params.insertion;
  const t = ins.met;
  const earth = eph.earth(t);
  const r0 = R_EARTH + ins.altitude;
  const g = (ins.fpaDeg * Math.PI) / 180;
  const ship: ShipState = {
    r: add(earth.r, vec3(r0, 0, 0)),
    v: add(earth.v, vec3(ins.speed * Math.sin(g), ins.speed * Math.cos(g), 0)),
  };
  const b = params.burns;
  const first: TrailPoint = {
    t,
    r: ship.r,
    alt: ins.altitude,
    phase: 'INSERCION',
    net: networkForAltitude(ins.altitude),
    prox: false,
  };
  return {
    params,
    t,
    ship,
    hNext: 1,
    phase: 'INSERCION',
    clock: { running: false, warp: 1 },
    vehicle: { icpsSeparated: false, cmSeparated: false },
    propulsion: INITIAL_PROPULSION,
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
    comms: commsStatus(ship.r, t, eph),
    prediction: null,
    predictionDirty: true,
    alarms: [],
    log: [
      {
        t,
        level: 'EVENT',
        text: 'E3 · MECO y separación de la etapa central. Arranca la física.',
        eventId: 'E3',
      },
    ],
    markers: [{ eventId: 'E3', n: 3, t, r: ship.r }],
    trail: [first],
    trailNextT: t,
    record: { apsides: [], perilune: null, ei: null, tliAt: null, icpsSepAt: null, cmSepAt: null },
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
