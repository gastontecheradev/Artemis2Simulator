import * as THREE from 'three';
import { R_EARTH, R_MOON } from '../sim/constants';
import { Vec3, ZERO, add, scale, sub } from '../sim/math/vec3';
import { Prediction } from '../sim/propagate';
import { SimState, TrailPoint, ephemerisOf } from '../sim/state';
import { EXAGGERATION, createBodies } from './bodies';
import { CameraRig, createOrthoRig, createPerspectiveRig } from './camera';
import { createOverlay } from './markers';
import { createShipModel, shipIconSvg } from './ship';
import { TrailColorMode, createTrails } from './trails';
import { KM_TO_SCENE, ViewFrame, toDisplayFrame, worldToScene } from './worldToScene';

export type CameraMode = 'overview' | 'ship' | 'earth' | 'moon';

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
function defaultRadius(mode: CameraMode, rotating: boolean): number {
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

const cssVar = (el: Element, name: string): string => getComputedStyle(el).getPropertyValue(name).trim() || '#888888';

/** Crea la vista de trayectoria dentro de `container` y arranca el loop de dibujo. */
export function createTrajectoryView(container: HTMLElement, deps: TrajectoryViewDeps): { dispose(): void } {
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(cssVar(container, '--c-screen'));
  renderer.domElement.className = 'view-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(-1, -0.25, 0.3);
  scene.add(sun, new THREE.AmbientLight(0xffffff, 0.12));

  const bodies = createBodies({
    earth: cssVar(container, '--c-body-earth'),
    moon: cssVar(container, '--c-body-moon'),
    orbit: cssVar(container, '--c-label'),
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
  const model = createShipModel();
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
  let lastTrail: TrailPoint[] | null = null;
  let lastTrailKey = '';
  let lastPrediction: Prediction | null | undefined;
  let lastPredictionKey = '';
  let lastCapsule: boolean | null = null;
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

    const changed = settings !== lastSettings;
    if (changed) {
      const prev = lastSettings;
      if (!prev || prev.dim !== settings.dim) {
        rigs['2d'].setActive(settings.dim === '2d');
        rigs['3d'].setActive(settings.dim === '3d');
        bodies.setLit(settings.dim === '3d');
      }
      if (!prev || prev.cameraMode !== settings.cameraMode || prev.frame !== settings.frame || prev.dim !== settings.dim) {
        rig.setViewRadius(defaultRadius(settings.cameraMode, rotating));
      }
      bodies.setExaggerated(settings.exaggerate);
      lastSettings = settings;
    }

    // --- Marco de dibujo y origen flotante ---
    const earth = eph.earth(s.t);
    const moon = eph.moon(s.t);
    const base: ViewFrame = { eph, rotating, origin: ZERO };
    const focusOf = (mode: CameraMode): Vec3 => {
      if (mode === 'ship') return toDisplayFrame(s.ship.r, s.t, base);
      if (mode === 'earth') return toDisplayFrame(earth.r, s.t, base);
      if (mode === 'moon') return toDisplayFrame(moon.r, s.t, base);
      return rotating ? scale(add(toDisplayFrame(earth.r, s.t, base), toDisplayFrame(moon.r, s.t, base)), 0.5) : ZERO;
    };
    const frame: ViewFrame = { eph, rotating, origin: focusOf(settings.cameraMode) };

    // --- Cuerpos ---
    worldToScene(earth.r, s.t, frame, bodies.earth.position);
    worldToScene(moon.r, s.t, frame, bodies.moon.position);
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

    // --- Capa HTML ---
    overlay.setMarkers(s.markers);
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
      labelOffsetPx: {
        earth: Math.min(height, R_EARTH * k * KM_TO_SCENE * pxPerScene) + 6,
        moon: Math.min(height, R_MOON * k * KM_TO_SCENE * pxPerScene) + 6,
      },
    });

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
      model.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
