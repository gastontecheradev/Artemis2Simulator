import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { KM_TO_SCENE } from './worldToScene';

/**
 * Abstracción de cámara. El resto de render/ no sabe si la vista es cenital (2D)
 * o en perspectiva (3D): con el origen flotante, la cámara siempre mira al origen
 * de la escena y solo cambia cuánto abarca (`viewRadius`, en km).
 */
export interface CameraRig {
  readonly kind: '2d' | '3d';
  readonly camera: THREE.Camera;
  resize(width: number, height: number): void;
  /** Semialto visible en km (2D) o radio encuadrado (3D). */
  getViewRadius(): number;
  setViewRadius(km: number): void;
  /** Solo la cámara activa atiende la rueda y los gestos. */
  setActive(on: boolean): void;
  update(): void;
  dispose(): void;
}

/** Encuadre mínimo: unos metros, para ver la nave a escala real. */
const MIN_RADIUS = 0.004; // km
const MAX_RADIUS = 3e6;
const clampRadius = (km: number): number => Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, km));

/** Cámara ortográfica cenital con zoom por rueda y pellizco. */
export function createOrthoRig(dom: HTMLElement): CameraRig {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  camera.position.set(0, 0, 2000);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  let radius = 300000;
  let aspect = 1;
  let active = true;

  const apply = (): void => {
    const h = radius * KM_TO_SCENE;
    // El radio se aplica a la dimensión más chica para que siempre entre completo.
    const k = aspect >= 1 ? 1 : 1 / aspect;
    camera.top = h * k;
    camera.bottom = -h * k;
    camera.left = -h * k * aspect;
    camera.right = h * k * aspect;
    camera.updateProjectionMatrix();
  };

  const onWheel = (e: WheelEvent): void => {
    if (!active) return;
    e.preventDefault();
    radius = clampRadius(radius * Math.exp(e.deltaY * 0.0015));
    apply();
  };
  const touches = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;
  let radiusStart = 0;
  const spread = (): number => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onDown = (e: PointerEvent): void => {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      pinchStart = spread();
      radiusStart = radius;
    }
  };
  const onMove = (e: PointerEvent): void => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (active && touches.size === 2 && pinchStart > 0) {
      radius = clampRadius((radiusStart * pinchStart) / Math.max(1, spread()));
      apply();
    }
  };
  const onUp = (e: PointerEvent): void => {
    touches.delete(e.pointerId);
  };
  dom.addEventListener('wheel', onWheel, { passive: false });
  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onUp);

  return {
    kind: '2d',
    camera,
    resize(w, h) {
      aspect = w / Math.max(1, h);
      apply();
    },
    getViewRadius: () => radius,
    setViewRadius(km) {
      radius = clampRadius(km);
      apply();
    },
    setActive(on) {
      active = on;
    },
    update: () => undefined,
    dispose() {
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
    },
  };
}

const FOV = 40;
/** Distancia de cámara que encuadra un radio dado con el FOV vertical. */
const distanceFor = (radiusKm: number): number =>
  (radiusKm * KM_TO_SCENE) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));

/** Cámara en perspectiva con OrbitControls. El plano orbital es xy; z es "arriba". */
export function createPerspectiveRig(dom: HTMLElement): CameraRig {
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1e-7, 1e5);
  camera.up.set(0, 0, 1);
  const d0 = distanceFor(300000);
  camera.position.set(0, -d0 * 0.75, d0 * 0.66);
  const controls = new OrbitControls(camera, dom);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = distanceFor(MIN_RADIUS);
  controls.maxDistance = distanceFor(MAX_RADIUS);
  controls.target.set(0, 0, 0);
  controls.update();

  return {
    kind: '3d',
    camera,
    resize(w, h) {
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    },
    getViewRadius: () => camera.position.length() * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) / KM_TO_SCENE,
    setViewRadius(km) {
      camera.position.setLength(distanceFor(clampRadius(km)));
      controls.update();
    },
    setActive(on) {
      controls.enabled = on;
    },
    update: () => {
      controls.update();
      // El plano cercano acompaña al zoom: de metros (nave a escala real) a cientos de miles de km.
      camera.near = Math.max(1e-9, camera.position.length() * 0.02);
      camera.updateProjectionMatrix();
    },
    dispose: () => controls.dispose(),
  };
}
