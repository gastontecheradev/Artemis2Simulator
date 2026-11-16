import * as THREE from 'three';
import { DebrisKind } from '../sim/state';
import { EngineId, VehicleConfig } from '../sim/vehicle';

/**
 * Modelo del vehículo por partes. Todo está en metros, con el eje largo sobre +x
 * (la punta hacia +x) y el origen en la base de la cápsula. Las medidas son las
 * publicadas por NASA (cohete de 98 m, etapa central de 64,6 m × 8,4 m, boosters de
 * 54 m × 3,7 m, ICPS de 13,7 m × 5,1 m, cápsula de 5 m de diámetro); el detalle de
 * cada pieza es propio y simplificado. Sin logos. Referencias: 4.png y 6.png.
 */

export interface VehicleColors {
  readonly hull: string;
  readonly dark: string;
  readonly solar: string;
  readonly core: string;
  readonly flame: string;
}

type PartId = 'CM' | 'LAS' | 'FAIRING' | 'SM' | 'ICPS' | 'CORE' | 'SRB_L' | 'SRB_R';

/** Extremos de cada parte sobre el eje x (m) y su desplazamiento lateral. */
const EXTENT: Readonly<Record<PartId, { x0: number; x1: number; y: number }>> = {
  CM: { x0: -0.2, x1: 3.3, y: 0 },
  LAS: { x0: 0.2, x1: 13.4, y: 0 },
  FAIRING: { x0: -4.6, x1: 0, y: 0 },
  SM: { x0: -5.6, x1: 0, y: 0 },
  ICPS: { x0: -18.3, x1: -4.4, y: 0 },
  CORE: { x0: -87.5, x1: -15.5, y: 0 },
  SRB_L: { x0: -88.5, x1: -32, y: 6.3 },
  SRB_R: { x0: -88.5, x1: -32, y: -6.3 },
};

const partsOf = (cfg: VehicleConfig): PartId[] => {
  const parts: PartId[] = ['CM'];
  if (!cfg.cmSeparated) parts.push('SM');
  if (!cfg.lasJettisoned) parts.push('LAS', 'FAIRING');
  if (!cfg.icpsSeparated) parts.push('ICPS');
  if (!cfg.coreSeparated) parts.push('CORE');
  if (!cfg.srbSeparated) parts.push('SRB_L', 'SRB_R');
  return parts;
};

/** Extremos del vehículo completo en su configuración actual (m). */
export function vehicleExtent(cfg: VehicleConfig): { x0: number; x1: number; length: number; center: number } {
  const { x0, x1 } = extentOf(partsOf(cfg));
  return { x0, x1, length: x1 - x0, center: (x0 + x1) / 2 };
}

const DEBRIS_PART: Readonly<Record<string, PartId>> = {
  'SRB-L': 'SRB_L',
  'SRB-R': 'SRB_R',
  LAS: 'LAS',
  FAIRING: 'FAIRING',
  CORE: 'CORE',
  ICPS: 'ICPS',
  SM: 'SM',
};

/** Los CubeSats son cajas de 12U: 0,37 × 0,24 × 0,22 m [SLS]. */
const CUBESAT_SIZE = { x: 0.366, y: 0.239, z: 0.224 };
const isCubesat = (id: string): boolean => id.startsWith('CUBESAT');

/** Largo (m) de una parte desprendida, para escalarla en pantalla. */
export const debrisLength = (id: string): number => {
  if (isCubesat(id)) return CUBESAT_SIZE.x;
  const e = EXTENT[DEBRIS_PART[id] ?? 'SM'];
  return e.x1 - e.x0;
};

// ---------- Geometría común (3D e ícono 2D) ----------

type Mat = 'hull' | 'dark' | 'core';

/**
 * Tramo de revolución sobre el eje x: radio `r0` en `x0` y `r1` en `x0 + len`, con su eje
 * corrido a (y, z). El modelo 3D lo hace cilindro o cono; el ícono 2D, el trapecio que se
 * ve mirando desde +z, que es como mira el mapa (el eje z local de la nave es la normal
 * del plano, ver `orient` en `scene.ts`).
 */
interface Seg {
  readonly r0: number;
  readonly r1: number;
  readonly x0: number;
  readonly len: number;
  readonly mat: Mat;
  readonly open?: boolean;
  readonly y?: number;
  readonly z?: number;
}

const seg = (r0: number, r1: number, x0: number, len: number, mat: Mat, more: Partial<Seg> = {}): Seg => ({ r0, r1, x0, len, mat, ...more });

const srbProfile = (y: number): Seg[] => [
  seg(1.86, 1.86, -86, 50, 'hull', { y }),
  seg(1.86, 0.2, -36, 4, 'hull', { y }),
  seg(1.9, 1.2, -88.5, 2.5, 'dark', { y, open: true }),
];

/** Piezas de revolución de cada parte. Los paneles protectores y las alas solares van aparte. */
const PROFILE: Readonly<Record<PartId, readonly Seg[]>> = {
  // Módulo de tripulación: cono truncado sobre el escudo térmico.
  CM: [seg(2.51, 0.6, 0, 3.3, 'hull'), seg(2.3, 2.51, -0.2, 0.2, 'dark')],
  // Torre de escape: carenado ojival sobre la cápsula, torre con los motores y punta.
  LAS: [seg(2.62, 0.55, 0.2, 5.6, 'hull'), seg(0.55, 0.45, 5.8, 6.2, 'hull'), seg(0.9, 0.55, 8.6, 0.9, 'dark'), seg(0.45, 0.05, 12, 1.4, 'hull')],
  FAIRING: [],
  // Módulo de servicio: cuerpo y tobera del motor principal.
  SM: [seg(2.05, 2.05, -4.2, 4.2, 'hull'), seg(0.95, 0.4, -5.6, 1.4, 'dark', { open: true })],
  // Etapa superior: adaptador hacia Orion, tanque y tobera del RL10.
  ICPS: [seg(2.55, 2.1, -6, 1.6, 'hull'), seg(2.55, 2.55, -15.5, 9.5, 'hull'), seg(1.05, 0.3, -18.3, 2.8, 'dark', { open: true })],
  // Etapa central: adaptador cónico, tanques y cuatro RS‑25.
  CORE: [
    seg(4.2, 2.55, -22.5, 7, 'hull'),
    seg(4.2, 4.2, -84.5, 62, 'core'),
    ...[[1.9, 1.9], [1.9, -1.9], [-1.9, 1.9], [-1.9, -1.9]].map(([y, z]) => seg(1.15, 0.4, -87.5, 3, 'dark', { open: true, y, z })),
  ],
  SRB_L: srbProfile(EXTENT.SRB_L.y),
  SRB_R: srbProfile(EXTENT.SRB_R.y),
};

/** Paneles protectores del módulo de servicio: tres tramos de un cilindro abierto. */
const FAIRING_PANEL = { r: 2.62, x0: -4.6, len: 4.6 };

/**
 * Alas solares en X: cada brazo gira `ARM_ANGLES` alrededor del eje; el ala tiene su
 * centro a `r` del eje y en `x`, con la cara hacia el eje de la nave e inclinada `tilt` hacia atrás.
 */
const WING = { width: 1.9, length: 7, x: -3.2, r: 5.6, tilt: 0.22 };
const ARM_ANGLES = [0, 1, 2, 3].map((i) => Math.PI / 4 + (i * Math.PI) / 2);

/** Los paneles solares se despliegan ya en órbita, sin los paneles protectores. */
const arraysDeployed = (cfg: VehicleConfig): boolean => cfg.lasJettisoned && cfg.coreSeparated;

/** Llama de cada motor: cono que sale de la tobera (en `x`) hacia −x. */
const FLAMES: Readonly<Record<EngineId, readonly { x: number; y: number; radius: number; len: number }[]>> = {
  SRB: [
    { x: -88.5, y: 6.3, radius: 1.7, len: 34 },
    { x: -88.5, y: -6.3, radius: 1.7, len: 34 },
  ],
  RS25: [{ x: -87.5, y: 0, radius: 3.1, len: 26 }],
  RL10: [{ x: -18.3, y: 0, radius: 1.0, len: 11 }],
  MAIN: [{ x: -5.6, y: 0, radius: 0.9, len: 7 }],
  AUX: [{ x: -5.2, y: 0, radius: 1.6, len: 3 }],
  RCS: [{ x: -4.4, y: 0, radius: 2.3, len: 1.2 }],
  CMRCS: [{ x: 0.2, y: 0, radius: 2.4, len: 1.0 }],
};

// ---------- Geometría 3D ----------

interface Kit {
  hull: THREE.Material;
  dark: THREE.Material;
  solar: THREE.Material;
  core: THREE.Material;
  flame: THREE.Material;
  track<T extends { dispose(): void }>(x: T): T;
}

/** Cilindro o cono sobre el eje x: radio `r0` en x0 y `r1` en x0 + len. */
function tube(kit: Kit, r0: number, r1: number, x0: number, len: number, material: THREE.Material, open = false): THREE.Mesh {
  const g = kit.track(new THREE.CylinderGeometry(r1, r0, len, 32, 1, open));
  g.rotateZ(-Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.position.x = x0 + len / 2;
  return m;
}

function buildPart(id: PartId, kit: Kit): THREE.Group {
  const g = new THREE.Group();
  for (const s of PROFILE[id]) {
    const piece = tube(kit, s.r0, s.r1, s.x0, s.len, kit[s.mat], s.open);
    piece.position.y = s.y ?? 0;
    piece.position.z = s.z ?? 0;
    g.add(piece);
  }
  if (id === 'FAIRING') {
    // Tres paneles que cubren el módulo de servicio durante el ascenso.
    const { r, x0, len } = FAIRING_PANEL;
    for (let i = 0; i < 3; i++) {
      const geo = kit.track(new THREE.CylinderGeometry(r, r, len, 16, 1, true, (i * 2 * Math.PI) / 3 + 0.04, (2 * Math.PI) / 3 - 0.08));
      geo.rotateZ(-Math.PI / 2);
      const panel = new THREE.Mesh(geo, kit.hull);
      panel.position.x = x0 + len / 2;
      g.add(panel);
    }
  }
  if (id === 'SM') {
    // Cuatro paneles solares en X. Cada ala con la cara hacia el eje de la nave (se ve de
    // frente mirando la nave desde adelante, como en 4.png): el plano se gira 90° sobre su
    // largo, que es radial.
    const wing = kit.track(new THREE.PlaneGeometry(WING.width, WING.length));
    wing.rotateY(Math.PI / 2);
    for (const angle of ARM_ANGLES) {
      const arm = new THREE.Group();
      arm.rotation.x = angle;
      const panel = new THREE.Mesh(wing, kit.solar);
      panel.position.set(WING.x, WING.r, 0);
      panel.rotation.z = WING.tilt;
      arm.add(panel);
      arm.name = 'array';
      g.add(arm);
    }
  }
  return g;
}

/** Llama del escape de un motor: cono translúcido que sale de la tobera hacia −x. */
function flame(kit: Kit, x: number, y: number, radius: number, len: number): THREE.Mesh {
  const m = tube(kit, 0.05, radius, x - len, len, kit.flame, true);
  m.position.y = y;
  return m;
}

function createKit(colors: VehicleColors): Kit & { dispose(): void } {
  const items: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    items.push(x);
    return x;
  };
  return {
    hull: track(new THREE.MeshStandardMaterial({ color: colors.hull, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide })),
    dark: track(new THREE.MeshStandardMaterial({ color: colors.dark, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide })),
    solar: track(new THREE.MeshStandardMaterial({ color: colors.solar, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide })),
    core: track(new THREE.MeshStandardMaterial({ color: colors.core, roughness: 0.75, metalness: 0.05 })),
    flame: track(new THREE.MeshBasicMaterial({ color: colors.flame, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })),
    track,
    dispose: () => items.forEach((i) => i.dispose()),
  };
}

export interface VehicleModel {
  /**
   * Grupo a orientar y ubicar. Su origen es el centro del vehículo en la configuración
   * actual o, con `anchorBase`, la base (las toberas), para que el cohete apoye en la plataforma.
   */
  readonly group: THREE.Group;
  /** Muestra las partes unidas y las llamas de los motores encendidos. Devuelve el largo actual (m). */
  update(cfg: VehicleConfig, running: readonly EngineId[], anchorBase?: boolean): number;
  dispose(): void;
}

/** Modelo 3D procedural de la nave completa, con sus partes y las llamas de los motores. */
export function createVehicleModel(colors: VehicleColors): VehicleModel {
  const kit = createKit(colors);
  const group = new THREE.Group();
  const stack = new THREE.Group();
  group.add(stack);
  const parts = new Map<PartId, THREE.Group>();
  for (const id of Object.keys(EXTENT) as PartId[]) {
    const g = buildPart(id, kit);
    parts.set(id, g);
    stack.add(g);
  }
  const flames = new Map<EngineId, THREE.Object3D[]>(
    (Object.keys(FLAMES) as EngineId[]).map((id) => [id, FLAMES[id].map((f) => flame(kit, f.x, f.y, f.radius, f.len))]),
  );
  for (const list of flames.values()) for (const f of list) stack.add(f);

  return {
    group,
    update(cfg, running, anchorBase = false) {
      const present = partsOf(cfg);
      for (const [id, g] of parts) g.visible = present.includes(id);
      const deployed = arraysDeployed(cfg);
      parts.get('SM')?.children.forEach((c) => {
        if (c.name === 'array') c.visible = deployed;
      });
      for (const [id, list] of flames) for (const f of list) f.visible = running.includes(id);
      const ext = vehicleExtent(cfg);
      stack.position.x = anchorBase ? -ext.x0 : -ext.center;
      return ext.length;
    },
    dispose: kit.dispose,
  };
}

export interface DebrisModels {
  /** Modelo de la parte desprendida `id`, centrado en su propio centro. Se crea la primera vez. */
  get(id: string): THREE.Group;
  dispose(): void;
}

export function createDebrisModels(colors: VehicleColors): DebrisModels {
  const kit = createKit(colors);
  const cache = new Map<string, THREE.Group>();
  return {
    get(id) {
      let g = cache.get(id);
      if (!g && isCubesat(id)) {
        g = new THREE.Group();
        g.add(new THREE.Mesh(kit.track(new THREE.BoxGeometry(CUBESAT_SIZE.x, CUBESAT_SIZE.y, CUBESAT_SIZE.z)), kit.hull));
        cache.set(id, g);
      }
      if (!g) {
        const part = DEBRIS_PART[id] ?? 'SM';
        const e = EXTENT[part];
        const inner = buildPart(part, kit);
        inner.position.set(-(e.x0 + e.x1) / 2, -e.y, 0);
        g = new THREE.Group();
        g.add(inner);
        cache.set(id, g);
      }
      return g;
    },
    dispose: kit.dispose,
  };
}

// ---------- Íconos 2D ----------

/**
 * El ícono 2D es la misma nave que el modelo 3D, vista desde +z (como mira el mapa):
 * cada tramo de revolución se ve como un trapecio y cada ala solar como su proyección.
 * Así cambia con las mismas piezas que el 3D y con sus proporciones reales.
 */
type Pt = readonly [number, number];
interface Shape {
  readonly pts: readonly Pt[];
  readonly cls: string;
}

/** Orden de dibujo: lo que en 3D queda adentro de otra pieza va antes (la tobera del ICPS dentro del adaptador de la etapa central, la cápsula bajo la torre). */
const DRAW_ORDER: readonly PartId[] = ['SM', 'CM', 'ICPS', 'CORE', 'SRB_L', 'SRB_R', 'FAIRING', 'LAS'];
const ALL_PARTS = Object.keys(EXTENT) as PartId[];

const segShape = (s: Seg): Shape => {
  const y = s.y ?? 0;
  const x1 = s.x0 + s.len;
  return {
    pts: [
      [s.x0, y - s.r0],
      [x1, y - s.r1],
      [x1, y + s.r1],
      [s.x0, y + s.r0],
    ],
    cls: s.mat,
  };
};

const partShapes = (id: PartId): Shape[] => {
  if (id !== 'FAIRING') return PROFILE[id].map(segShape);
  const { r, x0, len } = FAIRING_PANEL;
  return [segShape(seg(r, r, x0, len, 'hull'))];
};

/** Alas solares proyectadas sobre el plano: `near` = las que quedan del lado de la cámara (+z). */
function wingShapes(near: boolean): Shape[] {
  const { width, length: span, x, r, tilt } = WING;
  return ARM_ANGLES.filter((a) => Math.sin(a) > 0 === near).map((a) => ({
    pts: ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([su, sv]): Pt => {
      const u = (su * width) / 2;
      const v = (sv * span) / 2;
      return [x - v * Math.sin(tilt), (r + v * Math.cos(tilt)) * Math.cos(a) + u * Math.sin(a)];
    }),
    cls: near ? 'solar' : 'solar far',
  }));
}

function sideView(parts: readonly PartId[], arrays: boolean): Shape[] {
  const out: Shape[] = arrays ? wingShapes(false) : [];
  for (const id of DRAW_ORDER) {
    if (!parts.includes(id)) continue;
    out.push(...partShapes(id));
    if (id === 'SM' && arrays) out.push(...wingShapes(true));
  }
  return out;
}

const flameShape = (f: (typeof FLAMES)[EngineId][number]): Shape => ({
  pts: [
    [f.x, f.y - f.radius],
    [f.x - f.len, f.y - 0.05],
    [f.x - f.len, f.y + 0.05],
    [f.x, f.y + f.radius],
  ],
  cls: 'flame',
});

function extentOf(parts: readonly PartId[]): { x0: number; x1: number } {
  return { x0: Math.min(...parts.map((p) => EXTENT[p].x0)), x1: Math.max(...parts.map((p) => EXTENT[p].x1)) };
}
const lengthOf = (parts: readonly PartId[]): number => {
  const e = extentOf(parts);
  return e.x1 - e.x0;
};

/**
 * Tamaño en pantalla: el cohete completo mide `ICON_FULL_PX` y cada configuración, según
 * su largo elevado a `ICON_POWER` (elección de dibujo, no un dato). A escala lineal la
 * cápsula sola sería 29 veces más corta que el cohete; así queda ~4,5 veces más corta y
 * se sigue viendo. Dentro de cada configuración las proporciones son las reales.
 */
const ICON_FULL_PX = 72;
const ICON_POWER = 0.45;
/** Lado mínimo (px) de un ícono, para que una pieza chica (un CubeSat) no desaparezca. */
const ICON_MIN_PX = 5;
const FULL_LENGTH = lengthOf(ALL_PARTS);
const pxPerMeter = (lengthM: number): number => (ICON_FULL_PX * Math.pow(lengthM / FULL_LENGTH, ICON_POWER)) / lengthM;

const fmt = (n: number): string => n.toFixed(2);
const pathOf = (s: Shape): string => `<path d="M ${s.pts.map(([x, y]) => `${fmt(x)} ${fmt(-y)}`).join(' L ')} Z" class="${s.cls}"/>`;

/**
 * SVG con el eje de la nave hacia +x, centrado en las piezas (las llamas salen del recuadro).
 * Mide `pxPerM` píxeles por metro, multiplicado por `--icon-k` (el recuadro lo achica).
 */
function iconSvg(shapes: readonly Shape[], flames: readonly Shape[], pxPerM: number): string {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const s of shapes)
    for (const [x, y] of s.pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  const w = x1 - x0;
  const h = y1 - y0;
  const k = Math.max(pxPerM, ICON_MIN_PX / Math.max(w, h));
  const size = (m: number): string => `calc(var(--icon-k, 1) * ${(m * k).toFixed(1)}px)`;
  // `data-r`: radio del ícono en px (sin `--icon-k`), para saber cuándo se superpone con otro.
  const radius = (Math.max(w, h) * k) / 2;
  // En SVG el eje y va hacia abajo: se invierte (y = −y) para que el lado +y local quede a la izquierda del rumbo.
  return (
    `<svg viewBox="${fmt(x0)} ${fmt(-y1)} ${fmt(w)} ${fmt(h)}" class="ship-icon" data-r="${radius.toFixed(1)}" style="width:${size(w)};height:${size(h)}">` +
    `${[...flames, ...shapes].map(pathOf).join('')}</svg>`
  );
}

/**
 * Ícono 2D de la nave, apuntando hacia +x: las mismas piezas que el modelo 3D en la
 * etapa actual (cohete completo, sin boosters, sin torre, ICPS + Orion, Orion, cápsula
 * sola), con los paneles solares desplegados en órbita y la llama de cada motor encendido.
 */
export function vehicleIconSvg(cfg: VehicleConfig, running: readonly EngineId[]): string {
  const parts = partsOf(cfg);
  const flames = running.flatMap((id) => FLAMES[id].map(flameShape));
  // Los paneles van montados en el módulo de servicio: con la cápsula sola se fueron con él.
  const arrays = arraysDeployed(cfg) && parts.includes('SM');
  return iconSvg(sideView(parts, arrays), flames, pxPerMeter(lengthOf(parts)));
}

/** Pieza que representa cada tipo de parte desprendida. */
const DEBRIS_KIND_PART: Readonly<Record<Exclude<DebrisKind, 'CUBESAT'>, PartId>> = {
  SRB: 'SRB_L',
  LAS: 'LAS',
  FAIRING: 'FAIRING',
  CORE: 'CORE',
  ICPS: 'ICPS',
  SM: 'SM',
};

/**
 * Configuración de la que se desprende cada parte: el ícono de la parte usa su misma
 * escala, así al separarse se ve del tamaño que tenía unida a la nave.
 */
const DEBRIS_PARENT: Readonly<Record<DebrisKind, readonly PartId[]>> = {
  SRB: ALL_PARTS,
  LAS: ALL_PARTS.filter((p) => p !== 'SRB_L' && p !== 'SRB_R'),
  FAIRING: ALL_PARTS.filter((p) => p !== 'SRB_L' && p !== 'SRB_R'),
  CORE: ['CM', 'SM', 'ICPS', 'CORE'],
  ICPS: ['CM', 'SM', 'ICPS'],
  SM: ['CM', 'SM'],
  CUBESAT: ['ICPS'],
};

/** Ícono 2D de una parte desprendida, centrado en su propio centro (como su modelo 3D). */
export function debrisIconSvg(kind: DebrisKind): string {
  const scale = pxPerMeter(lengthOf(DEBRIS_PARENT[kind]));
  if (kind === 'CUBESAT') {
    const { x, y } = CUBESAT_SIZE;
    return iconSvg([segShape(seg(y / 2, y / 2, -x / 2, x, 'hull'))], [], scale);
  }
  const part = DEBRIS_KIND_PART[kind];
  const e = EXTENT[part];
  const dx = -(e.x0 + e.x1) / 2;
  const shapes = sideView([part], part === 'SM').map((s) => ({ ...s, pts: s.pts.map(([x, y]): Pt => [x + dx, y - e.y]) }));
  return iconSvg(shapes, [], scale);
}
