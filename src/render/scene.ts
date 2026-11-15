import * as THREE from 'three';
import { runningEngines } from '../sim/advance';
import { EARTH_ROTATION_IN_PLANE, MOON_SOI, R_EARTH, R_MOON } from '../sim/constants';
import { getLocale } from '../sim/i18n';
import { Vec3, ZERO, add, cross, length, normalize, rotateZ, scale, sub } from '../sim/math/vec3';
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
import { TrailColorMode, createTrails } from './trails';
import { createDebrisModels, createVehicleModel, debrisLength, vehicleExtent, vehicleIconSvg } from './vehicle';
import { KM_TO_SCENE, ViewFrame, toDisplayFrame, worldToScene } from './worldToScene';

/** 'auto' sigue a la nave de cerca (3D). Los modos fijos encuadran la nave, la Tierra, la Luna o el conjunto. */
export type CameraMode = 'auto' | 'overview' | 'ship' | 'earth' | 'moon';
type FixedMode = Exclude<CameraMode, 'auto'>;
/**
 * Tres vistas: el mapa 2D (estático, escala fija que abarca toda la misión, en el
 * marco rotante o en el inercial), el recuadro del entorno terrestre (estático, centrado en la Tierra) y la
 * vista 3D en perspectiva.
 */
export type ViewDim = '2d' | 'inset' | '3d';

export interface ViewSettings {
  readonly cameraMode: CameraMode;
  readonly frame: 'inertial' | 'rotating';
  /** Marco del mapa 2D: rotante (Tierra y Luna quietas) o inercial (la Luna recorre su órbita). */
  readonly mapFrame: 'inertial' | 'rotating';
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
/** Agrandamiento de los cuerpos en el mapa. La vista 3D y el recuadro van siempre a escala real. */
const MAP_EXAGGERATION = 3;
/** Radios fijos del recuadro del entorno terrestre (km): fase de órbita baja y después. */
const INSET_RADIUS_LOW = 9000;
const INSET_RADIUS_HIGH = 95000;
/**
 * Recuadro del entorno lunar: radio fijo (km), a mitad de camino entre el encuadre al
 * entrar en la esfera de influencia (1,1 × SOI) y el del sobrevuelo (12.000 km). Antes
 * seguía la distancia de la nave y se veía como un zoom continuo.
 */
const LUNAR_RADIUS = (12000 + MOON_SOI * 1.1) / 2;

/**
 * Qué muestra el recuadro: el entorno terrestre o, dentro de la esfera de influencia
 * lunar (el mismo criterio que usa la física para el marco del encendido), el lunar.
 */
export function insetTarget(s: SimState): 'earth' | 'moon' {
  return length(sub(s.ship.r, ephemerisOf(s).moon(s.t).r)) < MOON_SOI ? 'moon' : 'earth';
}

/**
 * Orientación del mapa 2D (giro que se le resta al dibujo). La cámara mira desde +z
 * (norte), así que cualquier giro conserva el sentido real: la Tierra rota, la nave
 * orbita la Tierra y la Luna la suya en sentido antihorario, y en el marco rotante el
 * sobrevuelo rodea la Luna en sentido horario por la cara oculta (como en 1.png, que
 * está dibujada con la Tierra a la izquierda: esto es esa vista girada 180°, no espejada).
 * Rotante: la Luna (sobre +x en el marco) queda a la izquierda y la Tierra a la derecha.
 * Inercial: la Luna del sobrevuelo nominal queda a la izquierda de la Tierra.
 */
function mapAngleFor(rotating: boolean, eph: ReturnType<typeof ephemerisOf>, flybyMet: number): number {
  return rotating ? Math.PI : eph.moonAngle(flybyMet) + Math.PI;
}

/** Primer plano de la nave en 3D: entra completa a escala real. */
const closeRadius = (cfg: VehicleConfig): number => Math.max(0.006, (vehicleExtent(cfg).length * 0.72) / 1000);

/** Semialto visible por defecto (km) para cada modo de cámara en 3D. */
function defaultRadius(mode: FixedMode, rotating: boolean, cfg: VehicleConfig): number {
  switch (mode) {
    case 'overview':
      return rotating ? 290000 : 470000;
    case 'ship':
      return closeRadius(cfg);
    // Cuerpos a escala real en 3D: encuadres de unas tres veces su radio más la órbita baja.
    case 'earth':
      return 22000;
    case 'moon':
      return 7000;
  }
}

const cssVar = (el: Element, name: string): string => getComputedStyle(el).getPropertyValue(name).trim() || '#888888';

/**
 * Encuadre del mapa: el rectángulo que contiene el plan nominal completo y los dos
 * cuerpos (en el marco inercial, la Luna en todo su recorrido durante la misión), con
 * un margen. Devuelve el centro y el semialto que hace entrar todo en una vista de
 * `px.width` × `px.height`, dejando libres `px.top` y `px.bottom` píxeles.
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
  const re = R_EARTH * MAP_EXAGGERATION;
  take(add(earth, { x: re, y: re, z: 0 }));
  take(add(earth, { x: -re, y: -re, z: 0 }));
  if (frame.rotating) {
    // La Luna con su esfera de influencia (punteada) completa.
    const moon = toDisplayFrame(eph.moon(0).r, 0, frame);
    take(add(moon, { x: MOON_SOI, y: MOON_SOI, z: 0 }));
    take(add(moon, { x: -MOON_SOI, y: -MOON_SOI, z: 0 }));
  } else {
    // La Luna se mueve: entra su arco completo, del lanzamiento al final del plan.
    const tEnd = NOMINAL_PATH.length ? NOMINAL_PATH[NOMINAL_PATH.length - 1][0] : 0;
    const r = R_MOON * MAP_EXAGGERATION * 2;
    for (let i = 0; i <= 64; i++) {
      const m = toDisplayFrame(eph.moon((tEnd * i) / 64).r, 0, frame);
      take(add(m, { x: r, y: r, z: 0 }));
      take(add(m, { x: -r, y: -r, z: 0 }));
    }
  }
  // Píxeles por km: el rectángulo (con margen) entra a lo ancho y en el alto libre entre
  // la barra de herramientas y el HUD.
  const boxW = Math.max(1, xMax - xMin) * 1.12;
  const boxH = Math.max(1, yMax - yMin) * 1.12;
  const k = Math.min(px.width / boxW, Math.max(1, px.height - px.top - px.bottom) / boxH);
  // La cámara ortográfica aplica el radio a la dimensión más chica (ver camera.ts).
  const radius = Math.min(px.width, px.height) / 2 / k;
  // El centro de la vista se corre para que el rectángulo quede centrado en el alto libre.
  const cy = (yMin + yMax) / 2 + (px.top - px.bottom) / (2 * k);
  return { center: { x: (xMin + xMax) / 2, y: cy, z: 0 }, radius };
}

/** Alto que tapan la barra de herramientas y el HUD del mapa (px), cuando el encuadre lo necesita. */
const MAP_PAD_TOP = 40;
const MAP_PAD_BOTTOM = 100;

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
  }, isMap);
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
  // El recuadro es estático. El mapa tiene zoom (rueda o pellizco, hacia el cursor) y se
  // arrastra; doble clic vuelve al encuadre de toda la misión.
  if (isInset) rig.setActive(false);
  const onDoubleClick = (): void => {
    lastCameraKey = '';
  };
  if (isMap) renderer.domElement.addEventListener('dblclick', onDoubleClick);

  // Clave del último encuadre aplicado (se invalida al cambiar el tamaño).
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

  /**
   * Encuadre inicial de la nave en 3D: de costado (tangente a la vertical local) y desde
   * arriba del plano orbital, con un poco de altura. Mirando desde el lado del planeta la
   * cámara quedaría bajo tierra en la plataforma.
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
    // El recuadro vive en el marco rotante; el mapa, en el que se elija (rotante por defecto).
    const rotating = is3d ? settings.frame === 'rotating' : isMap ? settings.mapFrame === 'rotating' : true;
    const earth = eph.earth(s.t);
    const moon = eph.moon(s.t);
    // Mapa 2D y recuadro: la Tierra a la derecha y la Luna a la izquierda (ver mapAngleFor).
    const flybyMet = s.params.nominal.flybyMet;
    const mapAngle = is3d ? 0 : mapAngleFor(rotating, eph, flybyMet);
    const frameAngle = rotating ? eph.moonAngle(s.t) + mapAngle : mapAngle;
    /** Dirección inercial llevada al marco de dibujo. */
    const displayDir = (d: Vec3): Vec3 => (frameAngle ? rotateZ(d, -frameAngle) : d);

    // En 3D todo va a escala real (cuerpos y nave): con la Tierra agrandada, la nave en
    // órbita baja quedaba adentro del planeta.
    const bodyScale = isMap && settings.exaggerate ? MAP_EXAGGERATION : 1;
    if (settings !== lastSettings || bodyScale !== lastBodyScale) {
      bodies.setBodyScale(bodyScale);
      lastSettings = settings;
      lastBodyScale = bodyScale;
    }

    // --- Cámara: modo efectivo y encuadre ---
    const base: ViewFrame = { eph, rotating, angle: mapAngle, origin: ZERO };
    let camera: { mode: FixedMode; radius: number };
    if (isMap) {
      const key = `map|${settings.mapFrame}|${width}x${height}|${s.params.moonAngle0Deg}`;
      if (key !== lastCameraKey) {
        // Con el giro, el rotante queda vertical: los dos marcos necesitan los márgenes.
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
        // Entorno lunar: centrado en la Luna, con escala fija.
        camera = { mode: 'moon', radius: LUNAR_RADIUS };
        if (lastCameraKey !== 'inset|moon') {
          rig.setViewRadius(camera.radius);
          lastCameraKey = 'inset|moon';
        }
      } else {
        const high = s.autoBurns.E5.status === 'done' || s.autoBurns.E5.status === 'burning' || s.vehicle.icpsSeparated;
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
        // Solo se reencuadra cuando cambia el modo o la etapa: mientras tanto se respeta el zoom manual.
        rig.setViewRadius(radius);
        if (mode === 'ship') aimFromSide(rig.camera.position, s);
        lastCameraKey = cameraKey;
      }
    }

    // --- Marco de dibujo y origen flotante ---
    const cfg = s.vehicle;
    const shipDir = displayDir(s.attitude.dir);
    // Mientras sigue la etapa central, el modelo se apoya en su base (las toberas) para que
    // en la plataforma el cohete quede sobre el suelo; la cámara mira a su centro.
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

    // --- Cuerpos y referencias ---
    worldToScene(earth.r, s.t, frame, bodies.earth.position);
    worldToScene(moon.r, s.t, frame, bodies.moon.position);
    // La Tierra gira con la plataforma: así el sitio de lanzamiento cae siempre sobre un
    // vértice de la esfera y el cohete apoya en el suelo, no en una faceta más abajo.
    bodies.earth.rotation.z = EARTH_ROTATION_IN_PLANE * s.t - frameAngle;
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
      const nominalKey = `${rotating}|${frame.origin.x.toFixed(0)}|${frame.origin.y.toFixed(0)}|${s.params.moonAngle0Deg}`;
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
    const iconKey = `${cfg.srbSeparated}${cfg.lasJettisoned}${cfg.coreSeparated}${cfg.icpsSeparated}${cfg.cmSeparated}|${enginesKey}`;
    let shipLengthM = 0;
    if (is3d) {
      shipLengthM = model.update(cfg, engines, anchorBase);
      worldToScene(s.ship.r, s.t, frame, model.group.position);
      orient(model.group, shipDir);
      // Siempre a escala real; cuando mide menos de unos píxeles, la capa HTML la marca con un punto.
      model.group.scale.setScalar(M_TO_SCENE);
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
        g.scale.setScalar(M_TO_SCENE);
      }
    }

    // --- Capa HTML ---
    if (s.params !== lastParams) {
      eventNames = new Map(timeline(s.params).map((e) => [e.id, e.name]));
      lastParams = s.params;
    }
    overlay.setMarkers(s.markers, eventNames);
    rig.update();
    if (is3d) {
      // La cámara nunca queda adentro de un cuerpo (a escala real, cerca de la nave en
      // órbita baja, la superficie está a metros): se la empuja afuera, sobre la vertical.
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
      shipAngle: Math.atan2(shipDir.y, shipDir.x),
      shipPx: is3d ? shipLengthM * M_TO_SCENE * pxPerScene : Infinity,
      showIcons: !is3d,
      radiusPx: {
        earth: R_EARTH * bodyScale * KM_TO_SCENE * pxPerScene,
        moon: R_MOON * bodyScale * KM_TO_SCENE * pxPerScene,
      },
      debris: s.debris.map((item) => {
        const d = displayDir(item.dir);
        return { item, angle: Math.atan2(d.y, d.x), px: is3d ? debrisLength(item.id) * M_TO_SCENE * pxPerScene : Infinity };
      }),
      labels: { earth: es ? 'TIERRA' : 'EARTH', moon: es ? 'LUNA' : 'MOON' },
      // Mapa inercial: dónde va a estar la Luna cuando llegue la nave (sobrevuelo nominal).
      ghost:
        isMap && !rotating && s.t < flybyMet
          ? {
              r: eph.moon(flybyMet).r,
              t: flybyMet,
              radiusPx: R_MOON * bodyScale * KM_TO_SCENE * pxPerScene,
              label: es ? 'LUNA EN EL SOBREVUELO' : 'MOON AT FLYBY',
            }
          : null,
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
