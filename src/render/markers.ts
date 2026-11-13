import * as THREE from 'three';
import { formatMet } from '../sim/format';
import { Vec3 } from '../sim/math/vec3';
import { Marker } from '../sim/state';
import { ViewFrame, worldToScene } from './worldToScene';

export interface OverlayAnchors {
  readonly earth: Vec3;
  readonly moon: Vec3;
  readonly ship: Vec3;
  readonly t: number;
  /** Rumbo de la nave en pantalla (rad, antihorario). */
  readonly shipAngle: number;
  readonly showShipIcon: boolean;
  /** Radio en pantalla de cada cuerpo (px). */
  readonly radiusPx: { readonly earth: number; readonly moon: number };
}

/**
 * Capa HTML sobre el canvas: marcadores numerados de eventos (como los de 1.png),
 * etiquetas y puntos de los cuerpos, ícono 2D de la nave y destello de encendido.
 * Cada elemento se ubica proyectando su posición con la cámara activa, así sirve
 * igual en 2D y en 3D.
 */
export interface Overlay {
  /** `names` da el texto del tooltip de cada evento. */
  setMarkers(markers: readonly Marker[], names: ReadonlyMap<string, string>): void;
  update(camera: THREE.Camera, width: number, height: number, frame: ViewFrame, anchors: OverlayAnchors): void;
  setShipIcon(svg: string): void;
  /** Destello en la posición de la nave: se dispara con cada encendido. */
  flash(): void;
  dispose(): void;
}

const markerClass = (n: number): string => (n === 6 ? 'prox' : n >= 12 ? 'ret' : 'out');
/** Por debajo de este radio en pantalla el cuerpo se marca con un punto para que no se pierda. */
const MIN_VISIBLE_RADIUS_PX = 3;

export function createOverlay(root: HTMLElement): Overlay {
  const layer = document.createElement('div');
  layer.className = 'view-overlay';
  root.appendChild(layer);

  const make = (className: string, text = ''): HTMLDivElement => {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    layer.appendChild(el);
    return el;
  };
  const earthDot = make('body-dot earth');
  const moonDot = make('body-dot moon');
  const earthLabel = make('body-label', 'TIERRA');
  const moonLabel = make('body-label', 'LUNA');
  const burnFlash = make('burn-flash');
  const ship = make('ship-marker');

  let markers: readonly Marker[] = [];
  const markerEls = new Map<string, HTMLDivElement>();
  const v = new THREE.Vector3();

  const project = (camera: THREE.Camera, w: number, h: number): { x: number; y: number; visible: boolean } => {
    v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z > -1 && v.z < 1 };
  };
  const put = (el: HTMLElement, p: { x: number; y: number; visible: boolean }, extra = '', show = true): void => {
    el.style.display = p.visible && show ? '' : 'none';
    el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) ${extra}`;
  };

  return {
    setMarkers(next, names) {
      if (next === markers) return;
      markers = next;
      for (const m of next) {
        if (markerEls.has(m.eventId)) continue;
        const el = make(`event-marker ${markerClass(m.n)}`, String(m.n));
        el.title = `${m.eventId} · ${names.get(m.eventId) ?? ''} · MET ${formatMet(m.t)}`;
        markerEls.set(m.eventId, el);
      }
      for (const [id, el] of markerEls) {
        if (!next.some((m) => m.eventId === id)) {
          el.remove();
          markerEls.delete(id);
        }
      }
    },
    update(camera, w, h, frame, a) {
      for (const m of markers) {
        const el = markerEls.get(m.eventId);
        if (!el) continue;
        worldToScene(m.r, m.t, frame, v);
        put(el, project(camera, w, h), 'translate(-50%, -50%)');
      }
      const body = (pos: Vec3, radiusPx: number, dot: HTMLElement, label: HTMLElement): void => {
        worldToScene(pos, a.t, frame, v);
        const p = project(camera, w, h);
        const small = radiusPx < MIN_VISIBLE_RADIUS_PX;
        put(dot, p, 'translate(-50%, -50%)', small);
        const offset = Math.min(h, small ? MIN_VISIBLE_RADIUS_PX : radiusPx) + 6;
        put(label, p, `translate(-50%, ${offset.toFixed(1)}px)`);
      };
      body(a.earth, a.radiusPx.earth, earthDot, earthLabel);
      body(a.moon, a.radiusPx.moon, moonDot, moonLabel);

      worldToScene(a.ship, a.t, frame, v);
      const p = project(camera, w, h);
      put(burnFlash, p, 'translate(-50%, -50%)');
      // En pantalla el eje y va hacia abajo: el ángulo se invierte.
      put(ship, p, `translate(-50%, -50%) rotate(${(-a.shipAngle).toFixed(4)}rad)`, a.showShipIcon);
    },
    setShipIcon(svg) {
      ship.innerHTML = svg;
    },
    flash() {
      // Reinicia la animación CSS.
      burnFlash.classList.remove('on');
      void burnFlash.offsetWidth;
      burnFlash.classList.add('on');
    },
    dispose() {
      layer.remove();
    },
  };
}
