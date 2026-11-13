import * as THREE from 'three';
import { Vec3 } from '../sim/math/vec3';
import { Marker } from '../sim/state';
import { ViewFrame, worldToScene } from './worldToScene';

/**
 * Capa HTML sobre el canvas: marcadores numerados de eventos (como los de 1.png),
 * etiquetas de los cuerpos y el ícono 2D de la nave. Cada elemento se ubica
 * proyectando su posición con la cámara activa, así sirve igual en 2D y en 3D.
 */
export interface Overlay {
  setMarkers(markers: readonly Marker[]): void;
  /** Reubica todo. `anchors` trae las posiciones actuales de los elementos fijos. */
  update(
    camera: THREE.Camera,
    width: number,
    height: number,
    frame: ViewFrame,
    anchors: { earth: Vec3; moon: Vec3; ship: Vec3; t: number; shipAngle: number; showShipIcon: boolean; labelOffsetPx: { earth: number; moon: number } },
  ): void;
  setShipIcon(svg: string): void;
  dispose(): void;
}

const markerClass = (n: number): string => (n === 6 ? 'prox' : n >= 12 ? 'ret' : 'out');

export function createOverlay(root: HTMLElement): Overlay {
  const layer = document.createElement('div');
  layer.className = 'view-overlay';
  root.appendChild(layer);

  const label = (text: string): HTMLDivElement => {
    const el = document.createElement('div');
    el.className = 'body-label';
    el.textContent = text;
    layer.appendChild(el);
    return el;
  };
  const earthLabel = label('TIERRA');
  const moonLabel = label('LUNA');
  const ship = document.createElement('div');
  ship.className = 'ship-marker';
  layer.appendChild(ship);

  let markers: readonly Marker[] = [];
  const markerEls = new Map<string, HTMLDivElement>();
  const v = new THREE.Vector3();

  const project = (camera: THREE.Camera, w: number, h: number): { x: number; y: number; visible: boolean } => {
    v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z > -1 && v.z < 1 };
  };
  const put = (el: HTMLElement, p: { x: number; y: number; visible: boolean }, extra = ''): void => {
    el.style.display = p.visible ? '' : 'none';
    el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) ${extra}`;
  };

  return {
    setMarkers(next) {
      markers = next;
      for (const m of next) {
        if (markerEls.has(m.eventId)) continue;
        const el = document.createElement('div');
        el.className = `event-marker ${markerClass(m.n)}`;
        el.textContent = String(m.n);
        el.title = m.eventId;
        layer.appendChild(el);
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
      worldToScene(a.earth, a.t, frame, v);
      put(earthLabel, project(camera, w, h), `translate(-50%, ${a.labelOffsetPx.earth}px)`);
      worldToScene(a.moon, a.t, frame, v);
      put(moonLabel, project(camera, w, h), `translate(-50%, ${a.labelOffsetPx.moon}px)`);
      if (a.showShipIcon) {
        worldToScene(a.ship, a.t, frame, v);
        // En pantalla el eje y va hacia abajo: el ángulo se invierte.
        put(ship, project(camera, w, h), `translate(-50%, -50%) rotate(${(-a.shipAngle).toFixed(4)}rad)`);
      } else {
        ship.style.display = 'none';
      }
    },
    setShipIcon(svg) {
      ship.innerHTML = svg;
    },
    dispose() {
      layer.remove();
    },
  };
}
