import { airVelocity } from './atmosphere';
import { Ephemeris, createKeplerEphemeris } from './bodies';
import { DeltaV, ZERO_DV } from './burns';
import { CommsStatus, commsStatus } from './comms';
import { EARTH_ROTATION_IN_PLANE, R_EARTH } from './constants';
import { RS25_START_BEFORE_LIFTOFF } from './vehicle';
import { tr } from './i18n';
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

/** Numbered marker left on the trail when an event occurs. */
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
  /** Altitude above Earth (km). */
  readonly alt: number;
  readonly phase: Phase;
  readonly net: TrailNet;
  /** During the proximity operations demo (E6). */
  readonly prox: boolean;
}

export type ManeuverId = 'E7' | 'E8' | 'E9' | 'E10' | 'E12' | 'MAN';
export type ProcedureId = 'SEP_ICPS' | ManeuverId | 'SEP_CM';
export type ManeuverStatus = 'pending' | 'committed' | 'burning' | 'done' | 'missed';

export interface Maneuver {
  readonly id: ManeuverId;
  readonly eventId: EventId | null;
  readonly system: PropSystem;
  /** Ignition instant. null = fires when actuated. */
  readonly tig: number | null;
  /** Planned Δv (editable in advanced mode). */
  readonly dv: DeltaV;
  /** Axis adjusted by the ΔV± keys and by guidance. */
  readonly axis: keyof DeltaV;
  readonly confirmed: boolean;
  /** Guidance has already computed the Δv (corrections only). */
  readonly computed: boolean;
  readonly status: ManeuverStatus;
  /** Number of times executed (corrections are repeatable). */
  readonly executions: number;
  readonly lastExecutedAt: number | null;
}

export interface AutoBurn {
  readonly id: 'E4' | 'E5';
  readonly met: number;
  readonly dv: DeltaV;
  /** Fixed inertial attitude during the burn (see BurnParams.hold). */
  readonly hold: boolean;
  readonly status: 'pending' | 'burning' | 'done' | 'cancelled';
}

/** Burn in progress: the engine thrusts until `tEnd` (or until it is cut off or runs out of propellant). */
export interface ActiveBurn {
  readonly id: 'E4' | 'E5' | ManeuverId;
  readonly system: PropSystem;
  readonly tStart: number;
  readonly tEnd: number;
  /** Requested ideal Δv (km/s) and its split in the local frame: sets the thrust direction. */
  readonly dv: DeltaV;
  /** Mass and tank propellant at ignition (kg), to measure the delivered Δv. */
  readonly massStart: number;
  readonly propStart: number;
  /** Fixed inertial thrust direction (burns with `hold`), or null if it follows the local frame. */
  readonly fixedDir: Vec3 | null;
}

export interface Switches {
  readonly mainArm: boolean;
  readonly auxArm: boolean;
  readonly icpsSepArm: boolean;
  readonly cmSepArm: boolean;
  /** The automatic crew performs the manual steps at their nominal time. */
  readonly autoCrew: boolean;
  /** Automatic pause before each crew action. */
  readonly autoPause: boolean;
}
export type SwitchName = keyof Switches;

/**
 * Digital autopilot (DAP):
 * - AUTO: guidance orients the spacecraft (prograde in cruise, burn attitude during maneuvers).
 * - INRTL: holds the current inertial attitude.
 * - MAN: the crew rotates the spacecraft with the rotational hand controller (RHC).
 */
export type DapMode = 'AUTO' | 'INRTL' | 'MAN';

export interface Attitude {
  /** Spacecraft longitudinal axis (unit, inertial frame): where the engines thrust. */
  readonly dir: Vec3;
  readonly mode: DapMode;
  /** Rotational hand controller deflection in pitch: −1, 0 or +1. */
  readonly rhc: number;
}

export interface ProcState {
  readonly activeId: ProcedureId;
  /** Step chosen with Jump to Step; null = follows the first pending step. */
  readonly cursor: number | null;
  /** Steps skipped with Skip, as "PROC:index". */
  readonly skipped: readonly string[];
  /** Advanced mode: allows editing the planned Δv. */
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
  /** Radius from Earth's center (km). */
  readonly radius: number;
  /** Specific energy relative to Earth (km²/s²). */
  readonly energy: number;
}

export interface EntryRecord extends EntryInterface {
  /** Osculating perigee at EI (km from the center): the one it would have without atmosphere. */
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
  /** State at E3 (core stage separation): inertial velocity and flight-path angle. */
  readonly insertion: {
    readonly t: number;
    readonly altitude: number;
    /** Inertial velocity (km/s). */
    readonly speed: number;
    /** Velocity relative to the rotating Earth (km/s): the one published in the ascent tables. */
    readonly speedRel: number;
    readonly fpaDeg: number;
  } | null;
  /** Maximum dynamic pressure of the ascent (Pa) and when it occurred. */
  readonly maxQ: { readonly t: number; readonly q: number; readonly logged: boolean } | null;
}

export type DebrisKind = 'SRB' | 'LAS' | 'FAIRING' | 'CORE' | 'ICPS' | 'SM' | 'CUBESAT';

/** Part jettisoned from the spacecraft: follows its own trajectory (gravity and drag). */
export interface Debris {
  readonly id: string;
  readonly kind: DebrisKind;
  /** Name for the log and labels (the CubeSats have their own names). */
  readonly name?: string;
  readonly ship: ShipState;
  /** Instant up to which it has been propagated. */
  readonly t: number;
  readonly hNext: number;
  /** Inverse ballistic coefficient Cd·A/m (m²/kg). */
  readonly ballistic: number;
  /** MET of the jettison. */
  readonly since: number;
  /** Longitudinal axis it had when jettisoned (for drawing it). */
  readonly dir: Vec3;
}

export interface SimState {
  readonly params: MissionParams;
  /** Mission elapsed time (MET) in seconds. */
  readonly t: number;
  readonly ship: ShipState;
  /** Step suggested by the integrator to continue. */
  readonly hNext: number;
  readonly phase: Phase;
  readonly clock: { readonly running: boolean; readonly warp: number };
  /** Warp to restore after an automatic slowdown (null if none is in progress). */
  readonly warpRestore: number | null;
  readonly vehicle: VehicleConfig;
  readonly propulsion: PropulsionState;
  /** Rocket engines firing during the ascent. */
  readonly ascentEngines: readonly EngineId[];
  /** Pitch tangent when linear-tangent guidance starts (null before that). */
  readonly ascentTan: number | null;
  /** Burn in progress in space. */
  readonly burn: ActiveBurn | null;
  readonly attitude: Attitude;
  /** Translational hand controller (THC) along the spacecraft axis: −1, 0 or +1. */
  readonly thc: number;
  readonly switches: Switches;
  readonly maneuvers: Readonly<Record<ManeuverId, Maneuver>>;
  readonly autoBurns: Readonly<Record<'E4' | 'E5', AutoBurn>>;
  readonly proc: ProcState;
  /** Keys of one-shot triggers already consumed. */
  readonly oneShots: readonly string[];
  readonly comms: CommsStatus;
  readonly prediction: Prediction | null;
  readonly predictionDirty: boolean;
  readonly alarms: readonly Alarm[];
  readonly log: readonly LogEntry[];
  readonly markers: readonly Marker[];
  /** Flown trail. Points are only appended (buffer shared between states). */
  readonly trail: TrailPoint[];
  readonly trailNextT: number;
  readonly debris: readonly Debris[];
  readonly record: MissionRecord;
  readonly outcome: Outcome | null;
  /** Without prediction, alarms or jettisoned parts: for scripts and tests. */
  readonly headless: boolean;
}

const ephCache = new Map<number, Ephemeris>();
/** Mission ephemeris (depends only on the lunar phase in the parameters). */
export function ephemerisOf(state: { readonly params: MissionParams }): Ephemeris {
  const deg = state.params.moonAngle0Deg;
  let eph = ephCache.get(deg);
  if (!eph) {
    if (ephCache.size > 64) ephCache.clear();
    eph = createKeplerEphemeris((deg * Math.PI) / 180);
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

/** Initial MET: the RS‑25s start 6 s before liftoff, with the rocket held down on the pad. */
export const INITIAL_MET = -RS25_START_BEFORE_LIFTOFF;

/**
 * Position and velocity of the pad at instant `t`: on Earth's +y axis
 * at MET 0 (up on the map, so the rocket climbs upwards on screen), rotating
 * east with Earth's rotation.
 */
export function padState(t: number, eph: Ephemeris): ShipState {
  const earth = eph.earth(t);
  const a = EARTH_ROTATION_IN_PLANE * t;
  const r = add(earth.r, vec3(-R_EARTH * Math.sin(a), R_EARTH * Math.cos(a), 0));
  return { r, v: airVelocity(r, earth) };
}

/**
 * Initial state: the full rocket on the pad, six seconds before
 * liftoff. On play the RS‑25s start and at T‑0 the boosters ignite.
 */
export function createInitialState(params: MissionParams, opts: InitOptions = {}): SimState {
  const eph = ephemerisOf({ params });
  const ship = padState(INITIAL_MET, eph);
  const b = params.burns;
  return {
    params,
    t: INITIAL_MET,
    ship,
    hNext: 0.05,
    phase: 'ASCENSO',
    clock: { running: false, warp: 1 },
    warpRestore: null,
    vehicle: CONFIG_AT_LIFTOFF,
    propulsion: INITIAL_PROPULSION,
    ascentEngines: ['RS25'],
    ascentTan: null,
    burn: null,
    // On the pad the rocket points up.
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
      E4: { id: 'E4', met: b.E4.met, dv: b.E4.dv, hold: b.E4.hold ?? false, status: 'pending' },
      E5: { id: 'E5', met: b.E5.met, dv: b.E5.dv, hold: b.E5.hold ?? false, status: 'pending' },
    },
    proc: { activeId: 'SEP_ICPS', cursor: null, skipped: [], advanced: false },
    oneShots: [],
    comms: commsStatus(ship.r, INITIAL_MET, eph),
    prediction: null,
    predictionDirty: false,
    alarms: [],
    log: [{ t: INITIAL_MET, level: 'EVENT', text: tr('log.pad'), eventId: 'E1' }],
    markers: [],
    trail: [{ t: INITIAL_MET, r: ship.r, alt: 0, phase: 'ASCENSO', net: 'NSN', prox: false }],
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
  /** Applies a pure state → state function and notifies. */
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
