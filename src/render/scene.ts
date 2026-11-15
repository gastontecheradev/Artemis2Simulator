import * as THREE from 'three';
import { runningEngines } from '../sim/advance';
import { R_EARTH, R_MOON } from '../sim/constants';
import { getLocale } from '../sim/i18n';
import { Vec3, ZERO, add, cross, length, normalize, rotateZ, scale } from '../sim/math/vec3';
import nominalRaw from '../sim/mission/nominal-path.json';
import { MissionParams } from '../sim/mission/params';
import { timeline } from '../sim/mission/timeline';
import { Prediction } from '../sim/propagate';
import { SimState, TrailPoint, ephemerisOf } from '../sim/state';
import { VehicleConfig } from '../sim/vehicle';
import { EXAGGERATION, createBodies } from './bodies';
import { CameraRig, createOrthoRig, createPerspectiveRig } from './camera';
import { createOverlay } from './markers';
import { createStars } from './stars';
import { TrailColorMode, createTrails } from './trails';
import { createDebrisModels, createVehicleModel, debrisLength, vehicleExtent, vehicleIconSvg } from './vehicle';
import { KM_TO_SCENE, ViewFrame, toDisplayFrame, worldToScene } from './worldToScene';

/** 'auto' sigue a la nave de cerca (3D). Los modos fijos encuadran la nave, la Tierra, la Luna o el conjunto. */
export type CameraMode = 'auto' | 'overview' | 'ship' | 'earth' | 'moon';
type FixedMode = Exclude<CameraMode, 'auto'>;
/**
 * Tres vistas: el mapa 2D (estático, marco rotante, escala fija que abarca toda la
 * misión), el recuadro del entorno terrestre (estático, centrado en la Tierra) y la
 * vista 3D en perspectiva.
 */
export type ViewDim = '2d' | 'inset' | '3d';

export interface ViewSettings {
  readonly cameraMode: CameraMode;
  readonly frame: 'inertial' | 'rotating';
  readonly colorMode: TrailColorMode;
  readonly exaggerate: boolean;
}

export interface TrajectoryViewDeps {
  /** Solo lectura: render nunca modifica la simulación. */
  getState(): SimState;
  getSettings(): ViewSettings;
  /** Se llama una vez por frame, antes de dibujar, con el dt real en segundos. */
  onFrame?(dt: number): void;
}

/** Plan nominal muestreado por scripts/nominal-path.ts: [MET, x, y] en km inerciales. */
const NOMINAL_PATH = nominalRaw as unknown as readonly (readonly [number, number, number])[];

const Z: Vec3 = { x: 0, y: 0, z: 1 };
/** 1 m en unidades de escena. */
const M_TO_SCENE = KM_TO_SCENE / 1000;
/** Tamaño mínimo aparente de la nave: fracción del semialto de la vista. */
const MIN_APPARENT = 0.28;
/** Agrandamiento de los cuerpos en el mapa (en 3D se usa EXAGGERATION). */
const MAP_EXAGGERATION = 3;
/** Radios fijos del recuadro del entorno terrestre (km): fase de órbita baja y después. */
const INSET_RADIUS_LOW = 9000;
const INSET_RADIUS_HIGH = 95000;

/** Primer plano de la nave en 3D: entra completa a escala real. */
const closeRadius = (cfg: VehicleConfig): number => Math.max(0.006, (vehicleExtent(cfg).length * 0.72) / 1000);

/** Semialto visible por defecto (km) para cada modo de cámara en 3D. */
function defaultRadius(mode: FixedMode, rotating: boolean, cfg: VehicleConfig): number {
  switch (mode) {
    case 'overview':
      return rotating ? 290000 : 470000;
    case 'ship':
      return closeRadius(cfg);
    case 'earth':
      return 95000;
    case 'moon':
      return 30000;
  }
}

const cssVar = (el: Element, name: string): string => getComputedStyle(el).getPropertyValue(name).trim() || '#888888';

/**
 * Encuadre del mapa: el rectángulo que contiene el plan nominal completo y los dos
 * cuerpos, en el marco rotante, con un margen. Devuelve el centro y el semialto que
 * hace entrar todo con la relación de aspecto dada.
 */
function mapFraming(eph: ReturnType<typeof ephemerisOf>, aspect: number): { center: Vec3; radius: number } {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  const frame: ViewFrame = { eph, rotating: true, origin: ZERO };
  const take = (p: Vec3): void => {
    xMin = Math.min(xMin, p.x);
    xMax = Math.max(xMax, p.x);
    yMin = Math.min(yMin, p.y);
    yMax = Math.max(yMax, p.y);
  };
  for (const [t, x, y] of NOMINAL_PATH) take(toDisplayFrame({ x, y, z: 0 }, t, frame));
  const earth = toDisplayFrame(eph.earth(0).r, 0, frame);
  const moon = toDisplayFrame(eph.moon(0).r, 0, frame);
  take(add(earth, { x: -R_EARTH * MAP_EXAGGERATION, y: 0, z: 0 }));
  take(add(moon, { x: R_MOON * MAP_EXAGGERATION * 2, y: 0, z: 0 }));
  const halfW = (xMax - xMin) / 2;
  const halfH = (yMax - yMin) / 2;
  const a = Math.max(0.2, aspect);
  // La cámara ortográfica aplica el radio a la dimensión más chica (ver camera.ts).
  const radius = a >= 1 ? Math.max(halfH, halfW / a) : Math.max(halfW, halfH * a);
  return { center: { x: (xMin + xMax) / 2, y: (yMin + yMax) / 2, z: 0 }, radius: radius * 1.12 };
}

/** Crea una vista de trayectoria dentro de `container` y arranca su loop de dibujo. */
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
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  // El Sol queda del lado de la plataforma: el lanzamiento es de día.
  sun.position.set(1, -0.45, 0.35);
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
  });
  bodies.setLit(is3d);
  const trails = createTrails({
    out: cssVar(container, '--c-trail-out'),
    ret: cssVar(container, '--c-trail-return'),
    prox: cssVar(container, '--c-trail-prox'),
    nsn: cssVar(container, '--c-net-nsn'),
    dsn: cssVar(container, '--c-net-dsn'),
    los: cssVar(container, '--c-label'),
    predicted: cssVar(container, '--c-label'),
  });
  const model = createVehicleModel(vehicleColors);
  const debrisModels = createDebrisModels(vehicleColors);
  const debrisGroup = new THREE.Group();
  model.group.visible = is3d;
  scene.add(bodies.group, trails.group, model.group, debrisGroup);
  const overlay = createOverlay(container);
  const rig: CameraRig = is3d ? createPerspectiveRig(renderer.domElement) : createOrthoRig(renderer.domElement);
  // El mapa y el recuadro son estáticos: sin rueda ni pellizco.
  if (!is3d) rig.setActive(false);

  // Clave del último encuadre aplicado (se invalida al cambiar el tamaño).
  let lastCameraKey = '';
  let width = 1;
  let height = 1;
  let aspect = 1;
  const resize = (): void => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    aspect = width / height;
    renderer.setSize(width, height);
    rig.resize(width, height);
    trails.setResolution(width, height);
    lastCameraKey = '';
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  // Cachés para no reconstruir geometrías sin necesidad.
  let lastSettings: ViewSettings | null = null;
  let lastBodyScale = 0;
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
  let frameCount = 0;
  let lastTime = performance.now();
  let raf = 0;
  const basis = new THREE.Matrix4();
  const vx = new THREE.Vector3();
  const vy = new THREE.Vector3();
  const vz = new THREE.Vector3();

  /** Orienta un objeto con su eje +x sobre `dir` y su eje +y en el plano orbital. */
  const orient = (object: THREE.Object3D, dir: Vec3): void => {
    const side = cross(Z, dir);
    const y = length(side) > 1e-6 ? normalize(side) : { x: 0, y: 1, z: 0 };
    const z = cross(dir, y);
    basis.makeBasis(vx.set(dir.x, dir.y, dir.z), vy.set(y.x, y.y, y.z), vz.set(z.x, z.y, z.z));
    object.quaternion.setFromRotationMatrix(basis);
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
    // El mapa y el recuadro viven en el marco rotante: la Tierra y la Luna no se mueven.
    const rotating = is3d ? settings.frame === 'rotating' : true;
    const earth = eph.earth(s.t);
    const moon = eph.moon(s.t);
    const frameAngle = rotating ? eph.moonAngle(s.t) : 0;
    /** Dirección inercial llevada al marco de dibujo. */
    const displayDir = (d: Vec3): Vec3 => (rotating ? rotateZ(d, -frameAngle) : d);

    const bodyScale = isInset ? 1 : settings.exaggerate ? (is3d ? EXAGGERATION : MAP_EXAGGERATION) : 1;
    if (settings !== lastSettings || bodyScale !== lastBodyScale) {
      bodies.setBodyScale(bodyScale);
      lastSettings = settings;
      lastBodyScale = bodyScale;
    }

    // --- Cámara: modo efectivo y encuadre ---
    const base: ViewFrame = { eph, rotating, origin: ZERO };
    let camera: { mode: FixedMode; radius: number };
    if (isMap) {
      const key = `map|${aspect.toFixed(3)}|${s.params.moonAngle0Deg}`;
      if (key !== lastCameraKey) {
        const f = mapFraming(eph, aspect);
        mapCenter = f.center;
        rig.setViewRadius(f.radius);
        lastCameraKey = key;
      }
      camera = { mode: 'overview', radius: rig.getViewRadius() };
    } else if (isInset) {
      const high = s.autoBurns.E5.status === 'done' || s.autoBurns.E5.status === 'burning' || s.vehicle.icpsSeparated;
      camera = { mode: 'earth', radius: high ? INSET_RADIUS_HIGH : INSET_RADIUS_LOW };
      const key = `inset|${camera.radius}`;
      if (key !== lastCameraKey) {
        rig.setViewRadius(camera.radius);
        lastCameraKey = key;
      }
    } else {
      const mode: FixedMode = settings.cameraMode !== 'auto' ? settings.cameraMode : 'ship';
      const radius = defaultRadius(mode, rotating, s.vehicle);
      camera = { mode, radius };
      const cameraKey = `${settings.cameraMode}|${mode}|${radius}|${settings.frame}`;
      if (cameraKey !== lastCameraKey) {
        // Solo se reencuadra cuando cambia el modo o la etapa: mientras tanto se respeta el zoom manual.
        rig.setViewRadius(radius);
        lastCameraKey = cameraKey;
      }
    }

    // --- Marco de dibujo y origen flotante ---
    const focus = (): Vec3 => {
      if (isMap) return mapCenter;
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
    const viewKey = `${rotating}|${settings.colorMode}|${camera.mode}`;
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
    // El plan nominal solo se dibuja en el mapa y el recuadro, y solo se reconstruye si cambia el origen.
    if (!is3d) {
      const nominalKey = `${frame.origin.x.toFixed(0)}|${frame.origin.y.toFixed(0)}|${s.params.moonAngle0Deg}`;
      if (nominalKey !== lastNominalKey) {
        trails.setNominal(NOMINAL_PATH, frame);
        lastNominalKey = nominalKey;
      }
    }
    trails.place(frame);
    const viewRadiusScene = rig.getViewRadius() * KM_TO_SCENE;
    trails.setDashScale(viewRadiusScene);

    // --- Nave: orientada según su actitud, con las partes de la etapa actual ---
    const engines = runningEngines(s);
    const enginesKey = engines.join(',');
    const cfg = s.vehicle;
    const iconKey = `${cfg.srbSeparated}${cfg.lasJettisoned}${cfg.coreSeparated}${cfg.icpsSeparated}${cfg.cmSeparated}|${enginesKey}`;
    const shipDir = displayDir(s.attitude.dir);
    if (is3d) {
      const lengthM = model.update(cfg, engines);
      worldToScene(s.ship.r, s.t, frame, model.group.position);
      orient(model.group, shipDir);
      // A escala real de cerca; de lejos se agranda para que no desaparezca.
      model.group.scale.setScalar(M_TO_SCENE * Math.max(1, (viewRadiusScene * MIN_APPARENT) / (lengthM * M_TO_SCENE)));
    } else if (iconKey !== lastIconKey) {
      overlay.setShipIcon(vehicleIconSvg(cfg, engines));
    }
    lastIconKey = iconKey;
    // Destello cuando enciende un motor.
    if (lastEngines !== enginesKey && engines.some((e) => !lastEngines.split(',').includes(e)) && frameCount > 1) overlay.flash();
    lastEngines = enginesKey;

    // --- Partes desprendidas ---
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
        g.scale.setScalar(M_TO_SCENE * Math.max(1, (viewRadiusScene * MIN_APPARENT * 0.6) / (debrisLength(b.id) * M_TO_SCENE)));
      }
    }

    // --- Capa HTML ---
    if (s.params !== lastParams) {
      eventNames = new Map(timeline(s.params).map((e) => [e.id, e.name]));
      lastParams = s.params;
    }
    overlay.setMarkers(s.markers, eventNames);
    rig.update();
    rig.camera.updateMatrixWorld();
    const pxPerScene = Math.min(width, height) / 2 / viewRadiusScene;
    const es = getLocale() === 'es';
    overlay.update(rig.camera, width, height, frame, {
      earth: earth.r,
      moon: moon.r,
      ship: s.ship.r,
      t: s.t,
      shipAngle: Math.atan2(shipDir.y, shipDir.x),
      showIcons: !is3d,
      radiusPx: {
        earth: R_EARTH * bodyScale * KM_TO_SCENE * pxPerScene,
        moon: R_MOON * bodyScale * KM_TO_SCENE * pxPerScene,
      },
      debris: s.debris.map((item) => {
        const d = displayDir(item.dir);
        return { item, angle: Math.atan2(d.y, d.x) };
      }),
      labels: { earth: es ? 'TIERRA' : 'EARTH', moon: es ? 'LUNA' : 'MOON' },
    });

    // --- Dibujo: fondo de estrellas y, encima, la escena ---
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
