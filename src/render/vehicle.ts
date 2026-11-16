import * as THREE from 'three';
import { DebrisKind } from '../sim/state';
import { EngineId, VehicleConfig } from '../sim/vehicle';

/**
 * Vehicle model by parts. Everything is in meters, with the long axis along +x
 * (nose towards +x) and the origin at the base of the capsule. The dimensions are the
 * ones published by NASA (98 m rocket, 64.6 m × 8.4 m core stage, 54 m × 3.7 m
 * boosters, 13.7 m × 5.1 m ICPS, 5 m diameter capsule); the detail of
 * each piece is our own and simplified. No logos. References: NASA's Orion and SLS illustrations.
 */

export interface VehicleColors {
  readonly hull: string;
  readonly dark: string;
  readonly solar: string;
  readonly core: string;
  readonly flame: string;
}

type PartId = 'CM' | 'LAS' | 'FAIRING' | 'SM' | 'ICPS' | 'CORE' | 'SRB_L' | 'SRB_R';

/** Ends of each part along the x axis (m) and its lateral offset. */
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

/** Ends of the whole vehicle in its current configuration (m). */
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

/** The CubeSats are 12U boxes: 0.37 × 0.24 × 0.22 m [SLS]. */
const CUBESAT_SIZE = { x: 0.366, y: 0.239, z: 0.224 };
const isCubesat = (id: string): boolean => id.startsWith('CUBESAT');

/** Length (m) of a jettisoned part, to scale it on screen. */
export const debrisLength = (id: string): number => {
  if (isCubesat(id)) return CUBESAT_SIZE.x;
  const e = EXTENT[DEBRIS_PART[id] ?? 'SM'];
  return e.x1 - e.x0;
};

// ---------- Shared geometry (3D and 2D icon) ----------

type Mat = 'hull' | 'dark' | 'core';

/**
 * Solid-of-revolution segment along the x axis: radius `r0` at `x0` and `r1` at `x0 + len`, with its axis
 * shifted to (y, z). The 3D model makes it a cylinder or cone; the 2D icon, the trapezoid
 * seen looking from +z, which is how the map looks (the spacecraft's local z axis is the normal
 * to the plane, see `orient` in `scene.ts`).
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

/** Revolution pieces of each part. The protective fairings and the solar wings are separate. */
const PROFILE: Readonly<Record<PartId, readonly Seg[]>> = {
  // Crew module: truncated cone on top of the heat shield.
  CM: [seg(2.51, 0.6, 0, 3.3, 'hull'), seg(2.3, 2.51, -0.2, 0.2, 'dark')],
  // Launch abort system: ogive fairing over the capsule, tower with the motors, and tip.
  LAS: [seg(2.62, 0.55, 0.2, 5.6, 'hull'), seg(0.55, 0.45, 5.8, 6.2, 'hull'), seg(0.9, 0.55, 8.6, 0.9, 'dark'), seg(0.45, 0.05, 12, 1.4, 'hull')],
  FAIRING: [],
  // Service module: body and main engine nozzle.
  SM: [seg(2.05, 2.05, -4.2, 4.2, 'hull'), seg(0.95, 0.4, -5.6, 1.4, 'dark', { open: true })],
  // Upper stage: adapter towards Orion, tank and RL10 nozzle.
  ICPS: [seg(2.55, 2.1, -6, 1.6, 'hull'), seg(2.55, 2.55, -15.5, 9.5, 'hull'), seg(1.05, 0.3, -18.3, 2.8, 'dark', { open: true })],
  // Core stage: conical adapter, tanks and four RS‑25s.
  CORE: [
    seg(4.2, 2.55, -22.5, 7, 'hull'),
    seg(4.2, 4.2, -84.5, 62, 'core'),
    ...[[1.9, 1.9], [1.9, -1.9], [-1.9, 1.9], [-1.9, -1.9]].map(([y, z]) => seg(1.15, 0.4, -87.5, 3, 'dark', { open: true, y, z })),
  ],
  SRB_L: srbProfile(EXTENT.SRB_L.y),
  SRB_R: srbProfile(EXTENT.SRB_R.y),
};

/** Service module protective fairings: three segments of an open cylinder. */
const FAIRING_PANEL = { r: 2.62, x0: -4.6, len: 4.6 };

/**
 * Solar wings in an X: each arm rotates `ARM_ANGLES` about the axis; the wing has its
 * center at `r` from the axis and at `x`, facing the spacecraft axis and tilted `tilt` backwards.
 */
const WING = { width: 1.9, length: 7, x: -3.2, r: 5.6, tilt: 0.22 };
const ARM_ANGLES = [0, 1, 2, 3].map((i) => Math.PI / 4 + (i * Math.PI) / 2);

/** The solar arrays deploy once in orbit, without the protective fairings. */
const arraysDeployed = (cfg: VehicleConfig): boolean => cfg.lasJettisoned && cfg.coreSeparated;

/** Flame of each engine: cone coming out of the nozzle (at `x`) towards −x. */
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

// ---------- 3D geometry ----------

interface Kit {
  hull: THREE.Material;
  dark: THREE.Material;
  solar: THREE.Material;
  core: THREE.Material;
  flame: THREE.Material;
  track<T extends { dispose(): void }>(x: T): T;
}

/** Cylinder or cone along the x axis: radius `r0` at x0 and `r1` at x0 + len. */
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
    // Three fairings that cover the service module during the ascent.
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
    // Four solar arrays in an X. Each wing faces the spacecraft axis (seen face-on
    // looking at the spacecraft from the front, as in NASA's Orion illustrations): the plane is rotated 90° about its
    // length, which is radial.
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

/** Exhaust flame of an engine: translucent cone coming out of the nozzle towards −x. */
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
   * Group to orient and position. Its origin is the vehicle's center in the current
   * configuration or, with `anchorBase`, the base (the nozzles), so the rocket rests on the pad.
   */
  readonly group: THREE.Group;
  /** Shows the attached parts and the flames of the firing engines. Returns the current length (m). */
  update(cfg: VehicleConfig, running: readonly EngineId[], anchorBase?: boolean): number;
  dispose(): void;
}

/** Procedural 3D model of the whole spacecraft, with its parts and the engine flames. */
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
  /** Model of jettisoned part `id`, centered on its own center. Created the first time. */
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

// ---------- 2D icons ----------

/**
 * The 2D icon is the same spacecraft as the 3D model, seen from +z (as the map looks):
 * each revolution segment is seen as a trapezoid and each solar wing as its projection.
 * That way it changes with the same pieces as the 3D model and with its real proportions.
 */
type Pt = readonly [number, number];
interface Shape {
  readonly pts: readonly Pt[];
  readonly cls: string;
}

/** Drawing order: whatever sits inside another piece in 3D goes first (the ICPS nozzle inside the core stage adapter, the capsule under the tower). */
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

/** Solar wings projected onto the plane: `near` = the ones on the camera side (+z). */
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
 * On-screen size: the full rocket measures `ICON_FULL_PX` and each configuration, according
 * to its length raised to `ICON_POWER` (a drawing choice, not data). At linear scale the
 * capsule alone would be 29 times shorter than the rocket; this way it is ~4.5 times shorter and
 * still visible. Within each configuration the proportions are real.
 */
const ICON_FULL_PX = 72;
const ICON_POWER = 0.45;
/** Minimum side (px) of an icon, so a small piece (a CubeSat) does not disappear. */
const ICON_MIN_PX = 5;
const FULL_LENGTH = lengthOf(ALL_PARTS);
const pxPerMeter = (lengthM: number): number => (ICON_FULL_PX * Math.pow(lengthM / FULL_LENGTH, ICON_POWER)) / lengthM;

const fmt = (n: number): string => n.toFixed(2);
const pathOf = (s: Shape): string => `<path d="M ${s.pts.map(([x, y]) => `${fmt(x)} ${fmt(-y)}`).join(' L ')} Z" class="${s.cls}"/>`;

/**
 * SVG with the spacecraft axis towards +x, centered on the pieces (the flames extend past the box).
 * It measures `pxPerM` pixels per meter, multiplied by `--icon-k` (the inset shrinks it).
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
  // `data-r`: icon radius in px (without `--icon-k`), to know when it overlaps another one.
  const radius = (Math.max(w, h) * k) / 2;
  // In SVG the y axis points down: it is flipped (y = −y) so the local +y side ends up to the left of the heading.
  return (
    `<svg viewBox="${fmt(x0)} ${fmt(-y1)} ${fmt(w)} ${fmt(h)}" class="ship-icon" data-r="${radius.toFixed(1)}" style="width:${size(w)};height:${size(h)}">` +
    `${[...flames, ...shapes].map(pathOf).join('')}</svg>`
  );
}

/**
 * 2D icon of the spacecraft, pointing towards +x: the same pieces as the 3D model in the
 * current stage (full rocket, without boosters, without tower, ICPS + Orion, Orion, capsule
 * alone), with the solar arrays deployed in orbit and the flame of each firing engine.
 */
export function vehicleIconSvg(cfg: VehicleConfig, running: readonly EngineId[]): string {
  const parts = partsOf(cfg);
  const flames = running.flatMap((id) => FLAMES[id].map(flameShape));
  // The arrays are mounted on the service module: with the capsule alone they left with it.
  const arrays = arraysDeployed(cfg) && parts.includes('SM');
  return iconSvg(sideView(parts, arrays), flames, pxPerMeter(lengthOf(parts)));
}

/** Piece that represents each type of jettisoned part. */
const DEBRIS_KIND_PART: Readonly<Record<Exclude<DebrisKind, 'CUBESAT'>, PartId>> = {
  SRB: 'SRB_L',
  LAS: 'LAS',
  FAIRING: 'FAIRING',
  CORE: 'CORE',
  ICPS: 'ICPS',
  SM: 'SM',
};

/**
 * Configuration each part is jettisoned from: the part's icon uses the same
 * scale, so on separation it looks the size it had while attached to the spacecraft.
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

/** 2D icon of a jettisoned part, centered on its own center (like its 3D model). */
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
