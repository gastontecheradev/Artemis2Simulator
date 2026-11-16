import * as THREE from 'three';
import { cruiseSense, runningEngines } from '../sim/advance';
import { sunDirection } from '../sim/bodies';
import { EARTH_ROTATION_IN_PLANE, MOON_SOI, R_EARTH, R_MOON } from '../sim/constants';
import { getLocale } from '../sim/i18n';
import { Vec3, ZERO, add, angleBetween, cross, length, normalize, rotateAbout, rotateZ, scale, sub } from '../sim/math/vec3';
import nominalRaw from '../sim/mission/nominal-path.json';
import { MissionParams } from '../sim/mission/params';
import { timeline } from '../sim/mission/timeline';
import { Prediction } from '../sim/propagate';
import { SimState, TrailPoint, ephemerisOf } from '../sim/state';
import { VehicleConfig } from '../sim/vehicle';
import { createBodies } from './bodies';
import { CameraRig, createOrthoRig, createPerspectiveRig } from './camera';
import { createOverlay } from './markers';
import { createStars } from './stars';
import { createTrails } from './trails';
import { createDebrisModels, createVehicleModel, debrisLength, vehicleExtent, vehicleIconSvg } from './vehicle';
import { KM_TO_SCENE, ViewFrame, toDisplayFrame, worldToScene } from './worldToScene';

/** 'auto' follows the spacecraft up close (3D). The fixed modes frame the spacecraft, Earth, the Moon or the whole system. */
export type CameraMode = 'auto' | 'overview' | 'ship' | 'earth' | 'moon';
type FixedMode = Exclude<CameraMode, 'auto'>;
/**
 * Three views: the 2D map (static, fixed scale covering the whole mission, in the
 * rotating or inertial frame), the Earth-vicinity inset (static, centered on Earth) and the
 * 3D perspective view.
 */
export type ViewDim = '2d' | 'inset' | '3d';

export interface ViewSettings {
  readonly cameraMode: CameraMode;
  readonly frame: 'inertial' | 'rotating';
  /** 2D map frame: rotating (Earth and Moon still) or inertial (the Moon travels along its orbit). */
  readonly mapFrame: 'inertial' | 'rotating';
}

export interface TrajectoryViewDeps {
  /** Read-only: render never modifies the simulation. */
  getState(): SimState;
  getSettings(): ViewSettings;
  /** Called once per frame, before drawing, with the real dt in seconds. */
  onFrame?(dt: number): void;
}

/** Nominal plan sampled by scripts/nominal-path.ts: [MET, x, y] in inertial km. */
const NOMINAL_PATH = nominalRaw as unknown as readonly (readonly [number, number, number])[];

const Z: Vec3 = { x: 0, y: 0, z: 1 };
/** 1 m in scene units. */
const M_TO_SCENE = KM_TO_SCENE / 1000;
/** Fixed radii of the Earth-vicinity inset (km): low-orbit phase and afterwards. */
const INSET_RADIUS_LOW = 9000;
const INSET_RADIUS_HIGH = 95000;
/**
 * On the way back the inset returns to the initial scale from CM/SM separation (E13)
 * or, if it does not separate, below this distance from Earth's center (km), with the
 * spacecraft already inside the view.
 */
const INSET_LANDING_DISTANCE = 0.9 * INSET_RADIUS_LOW;
/**
 * Moon-vicinity inset: fixed radius (km), halfway between the framing on
 * entering the sphere of influence (1.1 × SOI) and that of the flyby (12,000 km). It used to
 * follow the spacecraft's distance and looked like a continuous zoom.
 */
const LUNAR_RADIUS = (12000 + MOON_SOI * 1.1) / 2;

/**
 * What the inset shows: the Earth vicinity or, inside the lunar sphere of
 * influence (the same criterion the physics uses for the burn frame), the Moon vicinity.
 */
export function insetTarget(s: SimState): 'earth' | 'moon' {
  return length(sub(s.ship.r, ephemerisOf(s).moon(s.t).r)) < MOON_SOI ? 'moon' : 'earth';
}

/**
 * Orientation of the 2D map (rotation subtracted from the drawing). The camera looks from +z
 * (north), so any rotation keeps the real sense: Earth spins, the spacecraft
 * orbits Earth and the Moon orbits its own counterclockwise, and in the rotating frame the
 * flyby goes around the Moon clockwise over the far side (as in NASA's mission map, which
 * is drawn with Earth on the left: this is that view rotated 180°, not mirrored).
 * Rotating: the Moon (on +x in the frame) ends up on the left and Earth on the right.
 * Inertial: the Moon at the nominal flyby ends up to the left of Earth.
 */
function mapAngleFor(rotating: boolean, eph: ReturnType<typeof ephemerisOf>, flybyMet: number): number {
  return rotating ? Math.PI : eph.moonAngle(flybyMet) + Math.PI;
}

/** Time constant (real s) with which the spacecraft drawing turns towards its heading. */
const HEADING_SMOOTHING = 0.12;

/**
 * Direction of the trail as drawn: the velocity in the drawing frame (in the
 * rotating one it includes the frame's own motion). Derived numerically with a 1 s step.
 */
function displayVelocityDir(r: Vec3, v: Vec3, t: number, frame: ViewFrame): Vec3 {
  return normalize(sub(toDisplayFrame(add(r, v), t + 1, frame), toDisplayFrame(r, t, frame)));
}

/** Turns `from` towards `to` by a fraction `k` of the angle between them. */
function turnToward(from: Vec3, to: Vec3, k: number): Vec3 {
  const angle = angleBetween(from, to);
  if (angle < 1e-6 || k >= 1) return to;
  const n = cross(from, to);
  const axis = length(n) > 1e-9 ? normalize(n) : Z;
  return normalize(rotateAbout(from, axis, angle * k));
}

/** Spacecraft close-up in 3D: fits entirely at real scale. */
const closeRadius = (cfg: VehicleConfig): number => Math.max(0.006, (vehicleExtent(cfg).length * 0.72) / 1000);

/** Default visible half-height (km) for each 3D camera mode. */
function defaultRadius(mode: FixedMode, rotating: boolean, cfg: VehicleConfig): number {
  switch (mode) {
    case 'overview':
      return rotating ? 290000 : 470000;
    case 'ship':
      return closeRadius(cfg);
    // Bodies at real scale in 3D: framings of about three times their radius plus low orbit.
    case 'earth':
      return 22000;
    case 'moon':
      return 7000;
  }
}

const cssVar = (el: Element, name: string): string => getComputedStyle(el).getPropertyValue(name).trim() || '#888888';

/**
 * Map framing: the rectangle that contains the whole nominal plan and both
 * bodies (in the inertial frame, the Moon along its whole path during the mission), with
 * a margin. Returns the center and the half-height that fit everything in a view of
 * `px.width` × `px.height`, leaving `px.top` and `px.bottom` pixels free.
 */
function mapFraming(
  eph: ReturnType<typeof ephemerisOf>,
  px: { width: number; height: number; top: number; bottom: number },
  frame: ViewFrame,
): { center: Vec3; radius: number } {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  const take = (p: Vec3): void => {
    xMin = Math.min(xMin, p.x);
    xMax = Math.max(xMax, p.x);
    yMin = Math.min(yMin, p.y);
    yMax = Math.max(yMax, p.y);
  };
  for (const [t, x, y] of NOMINAL_PATH) take(toDisplayFrame({ x, y, z: 0 }, t, frame));
  const earth = toDisplayFrame(eph.earth(0).r, 0, frame);
  const re = R_EARTH;
  take(add(earth, { x: re, y: re, z: 0 }));
  take(add(earth, { x: -re, y: -re, z: 0 }));
  if (frame.rotating) {
    // The Moon with its whole (dashed) sphere of influence.
    const moon = toDisplayFrame(eph.moon(0).r, 0, frame);
    take(add(moon, { x: MOON_SOI, y: MOON_SOI, z: 0 }));
    take(add(moon, { x: -MOON_SOI, y: -MOON_SOI, z: 0 }));
  } else {
    // The Moon moves: its whole arc fits, from launch to the end of the plan.
    const tEnd = NOMINAL_PATH.length ? NOMINAL_PATH[NOMINAL_PATH.length - 1][0] : 0;
    const r = R_MOON * 2;
    for (let i = 0; i <= 64; i++) {
      const m = toDisplayFrame(eph.moon((tEnd * i) / 64).r, 0, frame);
      take(add(m, { x: r, y: r, z: 0 }));
      take(add(m, { x: -r, y: -r, z: 0 }));
    }
  }
  // Pixels per km: the rectangle (with margin) fits in width and in the free height between
  // the toolbar and the HUD.
  const boxW = Math.max(1, xMax - xMin) * 1.12;
  const boxH = Math.max(1, yMax - yMin) * 1.12;
  const k = Math.min(px.width / boxW, Math.max(1, px.height - px.top - px.bottom) / boxH);
  // The orthographic camera applies the radius to the smaller dimension (see camera.ts).
  const radius = Math.min(px.width, px.height) / 2 / k;
  // The view center is shifted so the rectangle is centered in the free height.
  const cy = (yMin + yMax) / 2 + (px.top - px.bottom) / (2 * k);
  return { center: { x: (xMin + xMax) / 2, y: cy, z: 0 }, radius };
}

/** Height covered by the map's toolbar and HUD (px), when the framing needs it. */
const MAP_PAD_TOP = 40;
const MAP_PAD_BOTTOM = 100;

/** Creates a trajectory view inside `container` and starts its draw loop. */
export function createTrajectoryView(container: HTMLElement, dim: ViewDim, deps: TrajectoryViewDeps): { dispose(): void } {
  const is3d = dim === '3d';
  const isMap = dim === '2d';
  const isInset = dim === 'inset';
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(cssVar(container, '--c-screen'));
  renderer.autoClear = false;
  renderer.domElement.className = 'view-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // The Sun: its direction comes from the simulation every frame (sunDirection, the date and
  // time of the launch window) and is the same for Earth, the Moon and the spacecraft.
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  scene.add(sun, new THREE.AmbientLight(0xffffff, 0.16));

  const vehicleColors = {
    hull: cssVar(container, '--c-ship-hull'),
    dark: cssVar(container, '--c-ship-dark'),
    solar: cssVar(container, '--c-ship-solar'),
    core: cssVar(container, '--c-ship-core'),
    flame: cssVar(container, '--c-trail-prox'),
  };
  const stars = createStars(cssVar(container, '--c-label'));
  const bodies = createBodies({
    earth: cssVar(container, '--c-body-earth'),
    moon: cssVar(container, '--c-body-moon'),
    orbit: cssVar(container, '--c-label'),
    ei: cssVar(container, '--c-caution'),
  }, isMap);
  bodies.setLit(is3d);
  const trails = createTrails({
    out: cssVar(container, '--c-trail-out'),
    ret: cssVar(container, '--c-trail-return'),
    prox: cssVar(container, '--c-trail-prox'),
    predicted: cssVar(container, '--c-label'),
  });
  const model = createVehicleModel(vehicleColors);
  const debrisModels = createDebrisModels(vehicleColors);
  const debrisGroup = new THREE.Group();
  model.group.visible = is3d;
  scene.add(bodies.group, trails.group, model.group, debrisGroup);
  const overlay = createOverlay(container);
  const rig: CameraRig = is3d ? createPerspectiveRig(renderer.domElement) : createOrthoRig(renderer.domElement);
  // The inset is static. The map has zoom (wheel or pinch, towards the cursor) and can be
  // dragged; double-click returns to the whole-mission framing.
  if (isInset) rig.setActive(false);
  const onDoubleClick = (): void => {
    lastCameraKey = '';
  };
  if (isMap) renderer.domElement.addEventListener('dblclick', onDoubleClick);

  // Key of the last applied framing (invalidated on resize).
  let lastCameraKey = '';
  let width = 1;
  let height = 1;
  const resize = (): void => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height);
    rig.resize(width, height);
    trails.setResolution(width, height);
    lastCameraKey = '';
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  // Caches so geometries are not rebuilt needlessly.
  let lastTrail: TrailPoint[] | null = null;
  let lastTrailKey = '';
  let lastPrediction: Prediction | null | undefined;
  let lastPredictionKey = '';
  let lastNominalKey = '';
  let lastIconKey = '';
  let lastEngines = '';
  let lastParams: MissionParams | null = null;
  let eventNames: ReadonlyMap<string, string> = new Map();
  let mapCenter: Vec3 = ZERO;
  /** Ephemeris the drawn lunar orbit was built with. */
  let orbitEph: ReturnType<typeof ephemerisOf> | null = null;
  /** Heading the spacecraft is drawn with (drawing frame), smoothed between frames. */
  let heading: Vec3 | null = null;
  let lastT = -Infinity;
  let frameCount = 0;
  let lastTime = performance.now();
  let raf = 0;
  const basis = new THREE.Matrix4();
  const vx = new THREE.Vector3();
  const vy = new THREE.Vector3();
  const vz = new THREE.Vector3();

  /** Orients an object with its +x axis along `dir` and its +y axis in the orbital plane. */
  const orient = (object: THREE.Object3D, dir: Vec3): void => {
    const side = cross(Z, dir);
    const y = length(side) > 1e-6 ? normalize(side) : { x: 0, y: 1, z: 0 };
    const z = cross(dir, y);
    basis.makeBasis(vx.set(dir.x, dir.y, dir.z), vy.set(y.x, y.y, y.z), vz.set(z.x, z.y, z.z));
    object.quaternion.setFromRotationMatrix(basis);
  };

  /**
   * Initial 3D framing of the spacecraft: from the side (tangent to the local vertical) and from
   * above the orbital plane, with a bit of height. Looking from the planet's side the
   * camera would end up underground on the pad.
   */
  const aimFromSide = (pos: THREE.Vector3, s: SimState): void => {
    const eph = ephemerisOf(s);
    const e = eph.earth(s.t).r;
    const m = eph.moon(s.t).r;
    const body = length(sub(s.ship.r, m)) < MOON_SOI ? m : e;
    const rotating = deps.getSettings().frame === 'rotating';
    const f: ViewFrame = { eph, rotating, origin: ZERO };
    const up = normalize(sub(toDisplayFrame(s.ship.r, s.t, f), toDisplayFrame(body, s.t, f)));
    const side = normalize(cross(Z, up));
    const d = add(add(scale(side, -0.72), scale(Z, 0.62)), scale(up, 0.3));
    const dist = pos.length();
    pos.set(d.x, d.y, d.z).setLength(dist);
  };
  const tmp = new THREE.Vector3();
  const keepOutside = (pos: THREE.Vector3, center: THREE.Vector3, radius: number): void => {
    tmp.subVectors(pos, center);
    const min = radius * (1 + 1e-6) + pos.length() * 0.05;
    if (tmp.length() < min) pos.copy(center).addScaledVector(tmp.normalize(), min);
  };

  const draw = (now: number): void => {
    raf = requestAnimationFrame(draw);
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    deps.onFrame?.(dt);
    frameCount++;

    const s = deps.getState();
    const settings = deps.getSettings();
    const eph = ephemerisOf(s);
    // The inset lives in the rotating frame; the map, in the chosen one (rotating by default).
    const rotating = is3d ? settings.frame === 'rotating' : isMap ? settings.mapFrame === 'rotating' : true;
    const earth = eph.earth(s.t);
    const moon = eph.moon(s.t);
    // 2D map and inset: Earth on the right and the Moon on the left (see mapAngleFor).
    const flybyMet = s.params.nominal.flybyMet;
    const mapAngle = is3d ? 0 : mapAngleFor(rotating, eph, flybyMet);
    const frameAngle = rotating ? eph.moonAngle(s.t) + mapAngle : mapAngle;
    /** Inertial direction brought into the drawing frame. */
    const displayDir = (d: Vec3): Vec3 => (frameAngle ? rotateZ(d, -frameAngle) : d);
    const toSun = displayDir(sunDirection(s.t));
    sun.position.set(toSun.x, toSun.y, toSun.z);

    // --- Camera: effective mode and framing ---
    const base: ViewFrame = { eph, rotating, angle: mapAngle, origin: ZERO };
    let camera: { mode: FixedMode; radius: number };
    if (isMap) {
      const key = `map|${settings.mapFrame}|${width}x${height}|${s.params.moonAngle0Deg}`;
      if (key !== lastCameraKey) {
        // With the rotation, the rotating frame ends up vertical: both frames need the margins.
        const pad = { top: MAP_PAD_TOP, bottom: MAP_PAD_BOTTOM };
        const f = mapFraming(eph, { width, height, ...pad }, base);
        mapCenter = f.center;
        rig.setViewRadius(f.radius);
        rig.setPan(0, 0);
        lastCameraKey = key;
      }
      camera = { mode: 'overview', radius: rig.getViewRadius() };
    } else if (isInset) {
      if (insetTarget(s) === 'moon') {
        // Moon vicinity: centered on the Moon, with a fixed scale.
        camera = { mode: 'moon', radius: LUNAR_RADIUS };
        if (lastCameraKey !== 'inset|moon') {
          rig.setViewRadius(camera.radius);
          lastCameraKey = 'inset|moon';
        }
      } else {
        // From E13 (CM/SM separation) or, if the crew does not separate, near Earth.
        const landing =
          (s.phase === 'REGRESO' || s.phase === 'ENTRADA') &&
          (s.vehicle.cmSeparated || length(sub(s.ship.r, earth.r)) < INSET_LANDING_DISTANCE);
        const high = !landing && (s.autoBurns.E5.status === 'done' || s.autoBurns.E5.status === 'burning' || s.vehicle.icpsSeparated);
        camera = { mode: 'earth', radius: high ? INSET_RADIUS_HIGH : INSET_RADIUS_LOW };
        const key = `inset|${camera.radius}`;
        if (key !== lastCameraKey) {
          rig.setViewRadius(camera.radius);
          lastCameraKey = key;
        }
      }
    } else {
      const mode: FixedMode = settings.cameraMode !== 'auto' ? settings.cameraMode : 'ship';
      const radius = defaultRadius(mode, rotating, s.vehicle);
      camera = { mode, radius };
      const cameraKey = `${settings.cameraMode}|${mode}|${radius}|${settings.frame}`;
      if (cameraKey !== lastCameraKey) {
        // Only reframes when the mode or the stage changes: in between, the manual zoom is respected.
        rig.setViewRadius(radius);
        if (mode === 'ship') aimFromSide(rig.camera.position, s);
        lastCameraKey = cameraKey;
      }
    }

    // --- Drawing frame and floating origin ---
    const cfg = s.vehicle;
    const shipDir = displayDir(s.attitude.dir);
    // Drawn heading: in cruise, along the trail (forwards, or backwards with the
    // capsule alone); otherwise (ascent, burns, pre-burn orientation, DAP in INRTL or MAN),
    // the actual attitude. The switch between the two is smoothed so it does not jump.
    const sense = cruiseSense(s);
    const headingTarget = sense !== 0 ? scale(displayVelocityDir(s.ship.r, s.ship.v, s.t, base), sense) : shipDir;
    heading = !heading || s.t < lastT ? headingTarget : turnToward(heading, headingTarget, 1 - Math.exp(-dt / HEADING_SMOOTHING));
    lastT = s.t;
    // While the core stage is attached, the model rests on its base (the nozzles) so that
    // on the pad the rocket sits on the ground; the camera looks at its center.
    const anchorBase = !cfg.coreSeparated;
    const shipCenterKm = anchorBase ? vehicleExtent(cfg).length / 2 / 1000 : 0;
    const focus = (): Vec3 => {
      if (isMap) {
        const pan = rig.getPan();
        return { x: mapCenter.x + pan.x, y: mapCenter.y + pan.y, z: 0 };
      }
      if (camera.mode === 'ship') return add(toDisplayFrame(s.ship.r, s.t, base), scale(shipDir, shipCenterKm));
      if (camera.mode === 'earth') return toDisplayFrame(earth.r, s.t, base);
      if (camera.mode === 'moon') return toDisplayFrame(moon.r, s.t, base);
      return rotating ? scale(add(toDisplayFrame(earth.r, s.t, base), toDisplayFrame(moon.r, s.t, base)), 0.5) : ZERO;
    };
    const frame: ViewFrame = { eph, rotating, angle: mapAngle, origin: focus() };

    // --- Bodies and references ---
    worldToScene(earth.r, s.t, frame, bodies.earth.position);
    worldToScene(moon.r, s.t, frame, bodies.moon.position);
    // Earth rotates with the pad: that way the launch site always falls on a
    // vertex of the sphere and the rocket rests on the ground, not on a lower facet.
    bodies.earth.rotation.z = EARTH_ROTATION_IN_PLANE * s.t - frameAngle;
    bodies.eiRing.position.copy(bodies.earth.position);
    bodies.soiRing.position.copy(bodies.moon.position);
    worldToScene(ZERO, s.t, frame, bodies.moonOrbit.position);
    // The lunar orbit is an ellipse that depends on the phase: rebuilt if the ephemeris changes.
    if (eph !== orbitEph) {
      const pts: Vec3[] = [];
      for (let i = 0; i < 360; i++) pts.push(eph.moon((eph.moonPeriod * i) / 360).r);
      bodies.setMoonOrbit(pts);
      orbitEph = eph;
    }
    bodies.moonOrbit.rotation.z = -frameAngle;
    // In the rotating frame the Moon barely moves: its orbit adds nothing.
    bodies.moonOrbit.visible = !rotating;

    // --- Trails ---
    const tip = { t: s.t, r: s.ship.r };
    const viewKey = `${rotating}|${camera.mode}`;
    const trailEvery = s.trail.length > 6000 ? 6 : 1;
    const trailKey = `${viewKey}|${s.trail.length}|${s.t}`;
    if (s.trail !== lastTrail || (trailKey !== lastTrailKey && frameCount % trailEvery === 0)) {
      trails.setTraveled(s.trail, tip, frame);
      lastTrail = s.trail;
      lastTrailKey = trailKey;
    }
    // The 3D view only draws what has been flown: the remaining trajectory is left to the map and the inset.
    const predictionKey = `${viewKey}|${Math.floor(frameCount / 10)}|${s.t}`;
    if (!is3d && (s.prediction !== lastPrediction || predictionKey !== lastPredictionKey)) {
      trails.setPredicted(s.prediction ? s.prediction.points : [], tip, frame);
      lastPrediction = s.prediction;
      lastPredictionKey = predictionKey;
    }
    // The nominal plan is only drawn on the map and the inset, and only rebuilt if the origin changes.
    if (!is3d) {
      const nominalKey = `${rotating}|${frame.origin.x.toFixed(0)}|${frame.origin.y.toFixed(0)}|${s.params.moonAngle0Deg}`;
      if (nominalKey !== lastNominalKey) {
        trails.setNominal(NOMINAL_PATH, frame);
        lastNominalKey = nominalKey;
      }
    }
    trails.place(frame);
    const viewRadiusScene = rig.getViewRadius() * KM_TO_SCENE;
    trails.setDashScale(viewRadiusScene);

    // --- Spacecraft: oriented by its attitude, with the parts of the current stage ---
    const engines = runningEngines(s);
    const enginesKey = engines.join(',');
    const iconKey = `${cfg.srbSeparated}${cfg.lasJettisoned}${cfg.coreSeparated}${cfg.icpsSeparated}${cfg.cmSeparated}|${enginesKey}`;
    let shipLengthM = 0;
    if (is3d) {
      shipLengthM = model.update(cfg, engines, anchorBase);
      worldToScene(s.ship.r, s.t, frame, model.group.position);
      orient(model.group, heading);
      // Always at real scale; when it is smaller than a few pixels, the HTML layer marks it with a dot.
      model.group.scale.setScalar(M_TO_SCENE);
    } else if (iconKey !== lastIconKey) {
      overlay.setShipIcon(vehicleIconSvg(cfg, engines));
    }
    lastIconKey = iconKey;
    // Flash when an engine ignites.
    if (lastEngines !== enginesKey && engines.some((e) => !lastEngines.split(',').includes(e)) && frameCount > 1) overlay.flash();
    lastEngines = enginesKey;

    // --- Jettisoned parts ---
    if (is3d) {
      const alive = new Set(s.debris.map((b) => b.id));
      for (const child of [...debrisGroup.children]) if (!alive.has(child.name)) debrisGroup.remove(child);
      for (const b of s.debris) {
        const g = debrisModels.get(b.id);
        if (g.parent !== debrisGroup) {
          g.name = b.id;
          debrisGroup.add(g);
        }
        worldToScene(b.ship.r, b.t, frame, g.position);
        orient(g, displayDir(b.dir));
        g.scale.setScalar(M_TO_SCENE);
      }
    }

    // --- HTML layer ---
    if (s.params !== lastParams) {
      eventNames = new Map(timeline(s.params).map((e) => [e.id, e.name]));
      lastParams = s.params;
    }
    overlay.setMarkers(s.markers, eventNames);
    rig.update();
    if (is3d) {
      // The camera never ends up inside a body (at real scale, near the spacecraft in
      // low orbit, the surface is meters away): it is pushed outside, along the vertical.
      keepOutside(rig.camera.position, bodies.earth.position, R_EARTH * KM_TO_SCENE);
      keepOutside(rig.camera.position, bodies.moon.position, R_MOON * KM_TO_SCENE);
    }
    rig.camera.updateMatrixWorld();
    const pxPerScene = Math.min(width, height) / 2 / viewRadiusScene;
    const es = getLocale() === 'es';
    overlay.update(rig.camera, width, height, frame, {
      earth: earth.r,
      moon: moon.r,
      ship: s.ship.r,
      t: s.t,
      shipAngle: Math.atan2(heading.y, heading.x),
      shipPx: is3d ? shipLengthM * M_TO_SCENE * pxPerScene : Infinity,
      showIcons: !is3d,
      radiusPx: {
        earth: R_EARTH * KM_TO_SCENE * pxPerScene,
        moon: R_MOON * KM_TO_SCENE * pxPerScene,
      },
      debris: s.debris.map((item) => {
        const d = displayDir(item.dir);
        return { item, angle: Math.atan2(d.y, d.x), px: is3d ? debrisLength(item.id) * M_TO_SCENE * pxPerScene : Infinity };
      }),
      labels: { earth: es ? 'TIERRA' : 'EARTH', moon: es ? 'LUNA' : 'MOON' },
      // Inertial map: where the Moon will be when the spacecraft arrives (nominal flyby).
      ghost:
        isMap && !rotating && s.t < flybyMet
          ? {
              r: eph.moon(flybyMet).r,
              t: flybyMet,
              radiusPx: R_MOON * KM_TO_SCENE * pxPerScene,
              label: es ? 'LUNA EN EL SOBREVUELO' : 'MOON AT FLYBY',
            }
          : null,
    });

    // --- Drawing: star background and, on top, the scene ---
    renderer.clear();
    stars.render(renderer, rig.camera, width / height, frameAngle);
    renderer.clearDepth();
    renderer.render(scene, rig.camera);
  };
  raf = requestAnimationFrame(draw);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener('dblclick', onDoubleClick);
      rig.dispose();
      overlay.dispose();
      bodies.dispose();
      trails.dispose();
      stars.dispose();
      model.dispose();
      debrisModels.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
