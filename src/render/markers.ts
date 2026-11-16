import * as THREE from 'three';
import { formatMet } from '../sim/format';
import { Vec3 } from '../sim/math/vec3';
import { Debris, Marker } from '../sim/state';
import { debrisIconSvg } from './vehicle';
import { ViewFrame, worldToScene } from './worldToScene';

export interface OverlayAnchors {
  readonly earth: Vec3;
  readonly moon: Vec3;
  readonly ship: Vec3;
  readonly t: number;
  /** Rumbo del eje de la nave en pantalla (rad, antihorario). */
  readonly shipAngle: number;
  /** Largo de la nave en pantalla (px) en 3D; por debajo de unos píxeles se marca con un punto. */
  readonly shipPx: number;
  /** Íconos 2D de la nave y de las partes desprendidas (en 3D se dibujan como modelos). */
  readonly showIcons: boolean;
  /** Radio en pantalla de cada cuerpo (px). */
  readonly radiusPx: { readonly earth: number; readonly moon: number };
  /** Partes desprendidas, con el rumbo en pantalla de cada una. */
  readonly debris: readonly { readonly item: Debris; readonly angle: number; readonly px: number }[];
  /** Etiquetas de los cuerpos en el idioma actual. */
  readonly labels: { readonly earth: string; readonly moon: string };
  /** Posición futura de la Luna (contorno punteado con etiqueta), o null para ocultarla. */
  readonly ghost?: { readonly r: Vec3; readonly t: number; readonly radiusPx: number; readonly label: string } | null;
}

/**
 * Capa HTML sobre el canvas: marcadores numerados de eventos (como los de 1.png),
 * etiquetas y puntos de los cuerpos, íconos 2D de la nave y de las partes
 * desprendidas, y destello de encendido. Cada elemento se ubica proyectando su
 * posición con la cámara activa, así sirve igual en 2D y en 3D.
 */
export interface Overlay {
  /** `names` da el texto del tooltip de cada evento. */
  setMarkers(markers: readonly Marker[], names: ReadonlyMap<string, string>): void;
  update(camera: THREE.Camera, width: number, height: number, frame: ViewFrame, anchors: OverlayAnchors): void;
  setShipIcon(svg: string): void;
  /** Destello en la posición de la nave: se dispara con cada ignición. */
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
  const earthLabel = make('body-label');
  const moonLabel = make('body-label');
  const ghostRing = make('moon-ghost');
  const ghostLabel = make('body-label ghost');
  const burnFlash = make('burn-flash');
  const ship = make('ship-marker');
  const shipDot = make('ship-dot');

  let markers: readonly Marker[] = [];
  const markerEls = new Map<string, HTMLDivElement>();
  const debrisEls = new Map<string, HTMLDivElement>();
  // Radio en pantalla (px) de cada ícono 2D: lo declara el SVG (`data-r`) y se escala con `--icon-k`
  // de la capa (el recuadro lo achica). No se mide en el DOM: al crearse puede no tener layout.
  let iconK = 0;
  const radiusOf = (el: HTMLElement): number => {
    if (!iconK) iconK = parseFloat(getComputedStyle(layer).getPropertyValue('--icon-k')) || 1;
    return parseFloat(el.querySelector('svg')?.dataset.r ?? '0') * iconK;
  };
  let shipRadius = 0;
  const debrisRadius = new Map<string, number>();
  const v = new THREE.Vector3();

  const project = (camera: THREE.Camera, w: number, h: number): { x: number; y: number; visible: boolean } => {
    v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z > -1 && v.z < 1 };
  };
  const put = (el: HTMLElement, p: { x: number; y: number; visible: boolean }, extra = '', show = true): void => {
    el.style.display = p.visible && show ? '' : 'none';
    el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) ${extra}`;
  };
  // En pantalla el eje y va hacia abajo: el ángulo se invierte.
  const spin = (angle: number): string => `translate(-50%, -50%) rotate(${(-angle).toFixed(4)}rad)`;

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
        // Con el cuerpo más grande que la vista la etiqueta quedaría fuera: se oculta.
        const offset = (small ? MIN_VISIBLE_RADIUS_PX : radiusPx) + 6;
        put(label, p, `translate(-50%, ${offset.toFixed(1)}px)`, radiusPx < Math.max(w, h));
      };
      if (earthLabel.textContent !== a.labels.earth) earthLabel.textContent = a.labels.earth;
      if (moonLabel.textContent !== a.labels.moon) moonLabel.textContent = a.labels.moon;
      body(a.earth, a.radiusPx.earth, earthDot, earthLabel);
      body(a.moon, a.radiusPx.moon, moonDot, moonLabel);

      // Luna futura (mapa inercial).
      const g = a.ghost;
      if (g) {
        worldToScene(g.r, g.t, frame, v);
        const p = project(camera, w, h);
        const d = Math.max(2 * MIN_VISIBLE_RADIUS_PX, 2 * g.radiusPx);
        ghostRing.style.width = ghostRing.style.height = `${d.toFixed(1)}px`;
        put(ghostRing, p, 'translate(-50%, -50%)');
        if (ghostLabel.textContent !== g.label) ghostLabel.textContent = g.label;
        put(ghostLabel, p, `translate(-50%, ${(-d / 2 - 18).toFixed(1)}px)`);
      } else {
        ghostRing.style.display = 'none';
        ghostLabel.style.display = 'none';
      }

      worldToScene(a.ship, a.t, frame, v);
      const p = project(camera, w, h);
      put(burnFlash, p, 'translate(-50%, -50%)');
      put(ship, p, spin(a.shipAngle), a.showIcons);
      put(shipDot, p, 'translate(-50%, -50%)', !a.showIcons && a.shipPx < MIN_VISIBLE_RADIUS_PX);
      if (a.showIcons && shipRadius <= 0) shipRadius = radiusOf(ship);
      // Partes desprendidas.
      for (const { item, angle, px } of a.debris) {
        let el = debrisEls.get(item.id);
        if (!el) {
          el = make('debris-marker');
          el.innerHTML = debrisIconSvg(item.kind);
          debrisEls.set(item.id, el);
          debrisRadius.set(item.id, radiusOf(el));
        }
        worldToScene(item.ship.r, item.t, frame, v);
        const q = project(camera, w, h);
        // En 3D el modelo va a escala real: si se ve más chico que unos píxeles, un punto.
        // En 2D los íconos no van a la escala del mapa: mientras la parte está en el mismo
        // lugar que la nave, su ícono la rodearía (los paneles del módulo de servicio
        // alrededor de la cápsula); hasta que se separan en pantalla, un punto.
        const overlapping = a.showIcons && Math.hypot(q.x - p.x, q.y - p.y) < shipRadius + (debrisRadius.get(item.id) ?? 0);
        const dot = overlapping || (!a.showIcons && px < MIN_VISIBLE_RADIUS_PX);
        el.classList.toggle('dot', dot);
        put(el, q, dot ? 'translate(-50%, -50%)' : spin(angle), a.showIcons || dot);
      }
      for (const [id, el] of debrisEls) {
        if (!a.debris.some((x) => x.item.id === id)) {
          el.remove();
          debrisEls.delete(id);
          debrisRadius.delete(id);
        }
      }
    },
    setShipIcon(svg) {
      ship.innerHTML = svg;
      shipRadius = 0;
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
