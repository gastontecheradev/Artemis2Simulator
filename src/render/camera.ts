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
  /**
   * Desplazamiento manual del centro de la vista (km, en los ejes de pantalla). Solo lo
   * mueve la cámara 2D (arrastre y zoom hacia el cursor); en 3D es siempre cero.
   */
  getPan(): { x: number; y: number };
  setPan(x: number, y: number): void;
  /** Solo la cámara activa atiende la rueda y los gestos. */
  setActive(on: boolean): void;
  update(): void;
  dispose(): void;
}

/** Encuadre mínimo: unos metros, para ver la nave a escala real. */
const MIN_RADIUS = 0.004; // km
const MAX_RADIUS = 3e6;
const clampRadius = (km: number): number => Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, km));

/**
 * Cámara ortográfica cenital (mira desde +z, con +x a la derecha y +y arriba: nunca
 * espeja). Rueda y pellizco hacen zoom hacia el cursor; arrastrar desplaza la vista.
 */
export function createOrthoRig(dom: HTMLElement): CameraRig {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  camera.position.set(0, 0, 2000);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  let radius = 300000;
  let aspect = 1;
  let active = true;
  let panX = 0;
  let panY = 0;

  /** Semialto visible en km (el radio se aplica a la dimensión más chica). */
  const halfHeight = (): number => radius * (aspect >= 1 ? 1 : 1 / aspect);
  const apply = (): void => {
    const h = halfHeight() * KM_TO_SCENE;
    camera.top = h;
    camera.bottom = -h;
    camera.left = -h * aspect;
    camera.right = h * aspect;
    camera.updateProjectionMatrix();
  };
  /** km por píxel de pantalla. */
  const kmPerPx = (): number => (2 * halfHeight()) / Math.max(1, dom.clientHeight);
  /** Punto de pantalla relativo al centro de la vista, en km (y hacia arriba). */
  const offsetKm = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = dom.getBoundingClientRect();
    const f = kmPerPx();
    return { x: (clientX - rect.left - rect.width / 2) * f, y: -(clientY - rect.top - rect.height / 2) * f };
  };
  /** Cambia el radio dejando fijo el punto de la pantalla que está bajo (clientX, clientY). */
  const zoomAt = (next: number, clientX: number, clientY: number): void => {
    const before = offsetKm(clientX, clientY);
    const r = clampRadius(next);
    const keep = 1 - r / radius;
    panX += before.x * keep;
    panY += before.y * keep;
    radius = r;
    apply();
  };

  const onWheel = (e: WheelEvent): void => {
    if (!active) return;
    e.preventDefault();
    zoomAt(radius * Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY);
  };
  const touches = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;
  let radiusStart = 0;
  const spread = (): number => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onDown = (e: PointerEvent): void => {
    if (!active) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dom.setPointerCapture?.(e.pointerId);
    if (touches.size === 2) {
      pinchStart = spread();
      radiusStart = radius;
    }
  };
  const onMove = (e: PointerEvent): void => {
    const last = touches.get(e.pointerId);
    if (!last || !active) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2 && pinchStart > 0) {
      const [a, b] = [...touches.values()];
      zoomAt((radiusStart * pinchStart) / Math.max(1, spread()), (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (touches.size === 1) {
      // Arrastrar: el punto agarrado sigue al puntero.
      const f = kmPerPx();
      panX -= (e.clientX - last.x) * f;
      panY += (e.clientY - last.y) * f;
    }
  };
  const onUp = (e: PointerEvent): void => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinchStart = 0;
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
    getPan: () => ({ x: panX, y: panY }),
    setPan(x, y) {
      panX = x;
      panY = y;
    },
    setActive(on) {
      active = on;
      if (!on) touches.clear();
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
    getPan: () => ({ x: 0, y: 0 }),
    setPan: () => undefined,
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
