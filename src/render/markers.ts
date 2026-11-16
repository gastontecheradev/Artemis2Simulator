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
  /** Heading of the spacecraft axis on screen (rad, counterclockwise). */
  readonly shipAngle: number;
  /** Spacecraft length on screen (px) in 3D; below a few pixels it is marked with a dot. */
  readonly shipPx: number;
  /** 2D icons of the spacecraft and the jettisoned parts (in 3D they are drawn as models). */
  readonly showIcons: boolean;
  /** On-screen radius of each body (px). */
  readonly radiusPx: { readonly earth: number; readonly moon: number };
  /** Jettisoned parts, with the on-screen heading of each one. */
  readonly debris: readonly { readonly item: Debris; readonly angle: number; readonly px: number }[];
  /** Body labels in the current language. */
  readonly labels: { readonly earth: string; readonly moon: string };
  /** Future position of the Moon (dashed outline with label), or null to hide it. */
  readonly ghost?: { readonly r: Vec3; readonly t: number; readonly radiusPx: number; readonly label: string } | null;
}

/**
 * HTML layer over the canvas: numbered event markers (like those in 1.png),
 * body labels and dots, 2D icons of the spacecraft and the jettisoned
 * parts, and the ignition flash. Each element is placed by projecting its
 * position with the active camera, so it works the same in 2D and in 3D.
 */
export interface Overlay {
  /** `names` gives the tooltip text of each event. */
  setMarkers(markers: readonly Marker[], names: ReadonlyMap<string, string>): void;
  update(camera: THREE.Camera, width: number, height: number, frame: ViewFrame, anchors: OverlayAnchors): void;
  setShipIcon(svg: string): void;
  /** Flash at the spacecraft's position: triggered on every ignition. */
  flash(): void;
  dispose(): void;
}

const markerClass = (n: number): string => (n === 6 ? 'prox' : n >= 12 ? 'ret' : 'out');
/** Below this on-screen radius the body is marked with a dot so it is not lost. */
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
  // On-screen radius (px) of each 2D icon: declared by the SVG (`data-r`) and scaled by the layer's `--icon-k`
  // (the inset shrinks it). It is not measured in the DOM: when created it may have no layout.
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
  // On screen the y axis points down: the angle is inverted.
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
        // With the body larger than the view the label would end up outside: it is hidden.
        const offset = (small ? MIN_VISIBLE_RADIUS_PX : radiusPx) + 6;
        put(label, p, `translate(-50%, ${offset.toFixed(1)}px)`, radiusPx < Math.max(w, h));
      };
      if (earthLabel.textContent !== a.labels.earth) earthLabel.textContent = a.labels.earth;
      if (moonLabel.textContent !== a.labels.moon) moonLabel.textContent = a.labels.moon;
      body(a.earth, a.radiusPx.earth, earthDot, earthLabel);
      body(a.moon, a.radiusPx.moon, moonDot, moonLabel);

      // Future Moon (inertial map).
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
      // Jettisoned parts.
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
        // In 3D the model is at real scale: if it looks smaller than a few pixels, a dot.
        // In 2D the icons are not at map scale: while the part is in the same
        // place as the spacecraft, its icon would surround it (the service module fairings
        // around the capsule); until they separate on screen, a dot.
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
      // Restarts the CSS animation.
      burnFlash.classList.remove('on');
      void burnFlash.offsetWidth;
      burnFlash.classList.add('on');
    },
    dispose() {
      layer.remove();
    },
  };
}
