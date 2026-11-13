import * as THREE from 'three';
import { BodyState } from '../sim/bodies';
import { R_EARTH, R_MOON } from '../sim/constants';
import { Vec3, ZERO, add, dot, length, scale, sub } from '../sim/math/vec3';
import { MissionParams } from '../sim/mission/params';
import { timeline } from '../sim/mission/timeline';
import { Prediction } from '../sim/propagate';
import { SimState, TrailPoint, ephemerisOf } from '../sim/state';
import { EXAGGERATION, createBodies } from './bodies';
import { CameraRig, createOrthoRig, createPerspectiveRig } from './camera';
import { createOverlay } from './markers';
import { createShipModel, shipIconSvg } from './ship';
import { createStars } from './stars';
import { TrailColorMode, createTrails } from './trails';
import { KM_TO_SCENE, ViewFrame, toDisplayFrame, worldToScene } from './worldToScene';

/** 'auto' elige el encuadre según la fase de la misión. */
export type CameraMode = 'auto' | 'overview' | 'ship' | 'earth' | 'moon';
type FixedMode = Exclude<CameraMode, 'auto'>;

export interface ViewSettings {
  readonly cameraMode: CameraMode;
  readonly frame: 'inertial' | 'rotating';
  readonly colorMode: TrailColorMode;
  readonly exaggerate: boolean;
  readonly dim: '2d' | '3d';
}

export interface TrajectoryViewDeps {
  /** Solo lectura: render nunca modifica la simulación. */
  getState(): SimState;
  getSettings(): ViewSettings;
  /** Se llama una vez por frame, antes de dibujar, con el dt real en segundos. */
  onFrame(dt: number): void;
}

/** Semialto visible por defecto (km) para cada modo de cámara. */
function defaultRadius(mode: FixedMode, rotating: boolean): number {
  switch (mode) {
    case 'overview':
      return rotating ? 290000 : 470000;
    case 'ship':
      return 25000;
    case 'earth':
      return 95000;
    case 'moon':
      return 30000;
  }
}

/** Encuadre de la cámara automática: sigue lo que importa en cada fase. */
function autoCamera(s: SimState, earth: BodyState): { mode: FixedMode; radius?: number } {
  switch (s.phase) {
    case 'ASCENSO':
      return { mode: 'ship', radius: 1100 };
    case 'INSERCION':
    case 'ORBITA_BAJA':
      return { mode: 'earth', radius: 13000 };
    case 'ORBITA_ALTA':
      return { mode: 'earth' };
    case 'TRANSITO_IDA':
      return { mode: 'overview' };
    case 'SOBREVUELO':
      return { mode: 'moon', radius: 85000 };
    case 'REGRESO': {
      const rel = sub(s.ship.r, earth.r);
      const inbound = dot(rel, sub(s.ship.v, earth.v)) < 0;
      return inbound && length(rel) < 70000 ? { mode: 'earth', radius: 80000 } : { mode: 'overview' };
    }
    case 'ENTRADA':
      return { mode: 'earth', radius: 20000 };
  }
}

const cssVar = (el: Element, name: string): string => getComputedStyle(el).getPropertyValue(name).trim() || '#888888';

/** Crea la vista de trayectoria dentro de `container` y arranca el loop de dibujo. */
export function createTrajectoryView(container: HTMLElement, deps: TrajectoryViewDeps): { dispose(): void } {
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(cssVar(container, '--c-screen'));
  renderer.autoClear = false;
  renderer.domElement.className = 'view-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(-1, -0.25, 0.3);
  scene.add(sun, new THREE.AmbientLight(0xffffff, 0.12));

  const stars = createStars(cssVar(container, '--c-label'));
  const bodies = createBodies({
    earth: cssVar(container, '--c-body-earth'),
    moon: cssVar(container, '--c-body-moon'),
    orbit: cssVar(container, '--c-label'),
    ei: cssVar(container, '--c-caution'),
  });
  const trails = createTrails({
    out: cssVar(container, '--c-trail-out'),
    ret: cssVar(container, '--c-trail-return'),
    prox: cssVar(container, '--c-trail-prox'),
    nsn: cssVar(container, '--c-net-nsn'),
    dsn: cssVar(container, '--c-net-dsn'),
    los: cssVar(container, '--c-label'),
    predicted: cssVar(container, '--c-label'),
  });
  const model = createShipModel({
    hull: cssVar(container, '--c-ship-hull'),
    dark: cssVar(container, '--c-ship-dark'),
    solar: cssVar(container, '--c-ship-solar'),
  });
  scene.add(bodies.group, trails.group, model.group);
  const overlay = createOverlay(container);

  const rigs: Record<'2d' | '3d', CameraRig> = {
    '2d': createOrthoRig(renderer.domElement),
    '3d': createPerspectiveRig(renderer.domElement),
  };
  rigs['3d'].setActive(false);

  let width = 1;
  let height = 1;
  const resize = (): void => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height);
    rigs['2d'].resize(width, height);
    rigs['3d'].resize(width, height);
    trails.setResolution(width, height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  // Cachés para no reconstruir geometrías sin necesidad.
  let lastSettings: ViewSettings | null = null;
  let lastCameraKey = '';
  let lastTrail: TrailPoint[] | null = null;
  let lastTrailKey = '';
  let lastPrediction: Prediction | null | undefined;
  let lastPredictionKey = '';
  let lastCapsule: boolean | null = null;
  let lastBurns = -1;
  let lastParams: MissionParams | null = null;
  let eventNames: ReadonlyMap<string, string> = new Map();
  let frameCount = 0;
  let lastTime = performance.now();
  let raf = 0;
  const tmp = new THREE.Vector3();
  const xAxis = new THREE.Vector3(1, 0, 0);

  const draw = (now: number): void => {
    raf = requestAnimationFrame(draw);
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    deps.onFrame(dt);
    frameCount++;

    const s = deps.getState();
    const settings = deps.getSettings();
    const eph = ephemerisOf(s);
    const rotating = settings.frame === 'rotating';
    const rig = rigs[settings.dim];
    const earth = eph.earth(s.t);
    const moon = eph.moon(s.t);

    if (settings !== lastSettings) {
      const prev = lastSettings;
      if (!prev || prev.dim !== settings.dim) {
        rigs['2d'].setActive(settings.dim === '2d');
        rigs['3d'].setActive(settings.dim === '3d');
        bodies.setLit(settings.dim === '3d');
      }
      bodies.setExaggerated(settings.exaggerate);
      lastSettings = settings;
    }

    // --- Cámara: modo efectivo y encuadre ---
    const camera: { mode: FixedMode; radius?: number } =
      settings.cameraMode === 'auto' ? autoCamera(s, earth) : { mode: settings.cameraMode };
    const cameraKey = `${settings.cameraMode}|${camera.mode}|${camera.radius}|${settings.frame}|${settings.dim}`;
    if (cameraKey !== lastCameraKey) {
      // Solo se reencuadra cuando cambia el modo: mientras tanto se respeta el zoom manual.
      rig.setViewRadius(camera.radius ?? defaultRadius(camera.mode, rotating));
      lastCameraKey = cameraKey;
    }

    // --- Marco de dibujo y origen flotante ---
    const base: ViewFrame = { eph, rotating, origin: ZERO };
    const focus = (): Vec3 => {
      if (camera.mode === 'ship') return toDisplayFrame(s.ship.r, s.t, base);
      if (camera.mode === 'earth') return toDisplayFrame(earth.r, s.t, base);
      if (camera.mode === 'moon') return toDisplayFrame(moon.r, s.t, base);
      return rotating ? scale(add(toDisplayFrame(earth.r, s.t, base), toDisplayFrame(moon.r, s.t, base)), 0.5) : ZERO;
    };
    const frame: ViewFrame = { eph, rotating, origin: focus() };

    // --- Cuerpos y referencias ---
    worldToScene(earth.r, s.t, frame, bodies.earth.position);
    worldToScene(moon.r, s.t, frame, bodies.moon.position);
    bodies.eiRing.position.copy(bodies.earth.position);
    bodies.soiRing.position.copy(bodies.moon.position);
    worldToScene(ZERO, s.t, frame, bodies.moonOrbit.position);
    // En el marco rotante la Luna está quieta: su órbita no aporta nada.
    bodies.moonOrbit.visible = !rotating;

    // --- Trazos ---
    const tip = { t: s.t, r: s.ship.r };
    const viewKey = `${settings.frame}|${settings.colorMode}`;
    const trailEvery = s.trail.length > 6000 ? 6 : 1;
    const trailKey = `${viewKey}|${s.trail.length}|${s.t}`;
    if (s.trail !== lastTrail || (trailKey !== lastTrailKey && frameCount % trailEvery === 0)) {
      trails.setTraveled(s.trail, tip, frame, settings.colorMode);
      lastTrail = s.trail;
      lastTrailKey = trailKey;
    }
    const predictionKey = `${viewKey}|${Math.floor(frameCount / 10)}|${s.t}`;
    if (s.prediction !== lastPrediction || predictionKey !== lastPredictionKey) {
      trails.setPredicted(s.prediction ? s.prediction.points : [], tip, frame);
      lastPrediction = s.prediction;
      lastPredictionKey = predictionKey;
    }
    trails.place(frame);
    const viewRadiusScene = rig.getViewRadius() * KM_TO_SCENE;
    trails.setDashScale(viewRadiusScene);

    // --- Nave ---
    const capsuleOnly = s.vehicle.cmSeparated;
    if (capsuleOnly !== lastCapsule) {
      overlay.setShipIcon(shipIconSvg(capsuleOnly));
      model.setCapsuleOnly(capsuleOnly);
      lastCapsule = capsuleOnly;
    }
    // Dirección de avance en el marco de dibujo (relativa a la Tierra en el inercial).
    const p0 = toDisplayFrame(s.ship.r, s.t, base);
    const ahead = rotating
      ? toDisplayFrame(add(s.ship.r, s.ship.v), s.t + 1, base)
      : add(s.ship.r, sub(s.ship.v, earth.v));
    const dir = sub(ahead, p0);
    const shipAngle = Math.atan2(dir.y, dir.x);
    const is3d = settings.dim === '3d';
    model.group.visible = is3d;
    if (is3d) {
      worldToScene(s.ship.r, s.t, frame, model.group.position);
      tmp.set(dir.x, dir.y, dir.z).normalize();
      if (tmp.lengthSq() > 0) model.group.quaternion.setFromUnitVectors(xAxis, tmp);
      model.group.scale.setScalar(viewRadiusScene * 0.15);
    }

    // --- Destello de encendido ---
    const burns = s.propulsion.mainBurns + s.propulsion.auxBurns + s.propulsion.icpsBurns;
    if (lastBurns >= 0 && burns > lastBurns) overlay.flash();
    lastBurns = burns;

    // --- Capa HTML ---
    if (s.params !== lastParams) {
      eventNames = new Map(timeline(s.params).map((e) => [e.id, e.name]));
      lastParams = s.params;
    }
    overlay.setMarkers(s.markers, eventNames);
    rig.update();
    rig.camera.updateMatrixWorld();
    const pxPerScene = Math.min(width, height) / 2 / viewRadiusScene;
    const k = settings.exaggerate ? EXAGGERATION : 1;
    overlay.update(rig.camera, width, height, frame, {
      earth: earth.r,
      moon: moon.r,
      ship: s.ship.r,
      t: s.t,
      shipAngle,
      showShipIcon: !is3d,
      radiusPx: {
        earth: R_EARTH * k * KM_TO_SCENE * pxPerScene,
        moon: R_MOON * k * KM_TO_SCENE * pxPerScene,
      },
    });

    // --- Dibujo: fondo de estrellas y, encima, la escena ---
    renderer.clear();
    stars.render(renderer, rig.camera, width / height, rotating ? eph.moonAngle(s.t) : 0);
    renderer.clearDepth();
    renderer.render(scene, rig.camera);
  };
  raf = requestAnimationFrame(draw);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      rigs['2d'].dispose();
      rigs['3d'].dispose();
      overlay.dispose();
      bodies.dispose();
      trails.dispose();
      stars.dispose();
      model.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
