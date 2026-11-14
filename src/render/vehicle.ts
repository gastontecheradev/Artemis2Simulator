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
  const parts = partsOf(cfg);
  const x0 = Math.min(...parts.map((p) => EXTENT[p].x0));
  const x1 = Math.max(...parts.map((p) => EXTENT[p].x1));
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

/** Largo (m) de una parte desprendida, para escalarla en pantalla. */
export const debrisLength = (id: string): number => {
  const e = EXTENT[DEBRIS_PART[id] ?? 'SM'];
  return e.x1 - e.x0;
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
  switch (id) {
    case 'CM':
      // Módulo de tripulación: cono truncado sobre el escudo térmico.
      g.add(tube(kit, 2.51, 0.6, 0, 3.3, kit.hull), tube(kit, 2.3, 2.51, -0.2, 0.2, kit.dark));
      break;
    case 'LAS':
      // Torre de escape: carenado ojival sobre la cápsula, torre con los motores y punta.
      g.add(
        tube(kit, 2.62, 0.55, 0.2, 5.6, kit.hull),
        tube(kit, 0.55, 0.45, 5.8, 6.2, kit.hull),
        tube(kit, 0.9, 0.55, 8.6, 0.9, kit.dark),
        tube(kit, 0.45, 0.05, 12, 1.4, kit.hull),
      );
      break;
    case 'FAIRING': {
      // Tres paneles que cubren el módulo de servicio durante el ascenso.
      for (let i = 0; i < 3; i++) {
        const geo = kit.track(new THREE.CylinderGeometry(2.62, 2.62, 4.6, 16, 1, true, (i * 2 * Math.PI) / 3 + 0.04, (2 * Math.PI) / 3 - 0.08));
        geo.rotateZ(-Math.PI / 2);
        const panel = new THREE.Mesh(geo, kit.hull);
        panel.position.x = -2.3;
        g.add(panel);
      }
      break;
    }
    case 'SM': {
      // Módulo de servicio: cuerpo, tobera del motor principal y cuatro paneles solares en X.
      g.add(tube(kit, 2.05, 2.05, -4.2, 4.2, kit.hull), tube(kit, 0.95, 0.4, -5.6, 1.4, kit.dark, true));
      const wing = kit.track(new THREE.PlaneGeometry(1.9, 7));
      for (let i = 0; i < 4; i++) {
        const arm = new THREE.Group();
        arm.rotation.x = Math.PI / 4 + (i * Math.PI) / 2;
        const panel = new THREE.Mesh(wing, kit.solar);
        panel.position.set(-3.2, 5.6, 0);
        panel.rotation.z = 0.22;
        arm.add(panel);
        arm.name = 'array';
        g.add(arm);
      }
      break;
    }
    case 'ICPS':
      // Etapa superior: adaptador hacia Orion, tanque y tobera del RL10.
      g.add(
        tube(kit, 2.55, 2.1, -6, 1.6, kit.hull),
        tube(kit, 2.55, 2.55, -15.5, 9.5, kit.hull),
        tube(kit, 1.05, 0.3, -18.3, 2.8, kit.dark, true),
      );
      break;
    case 'CORE': {
      // Etapa central: adaptador cónico, tanques y cuatro RS‑25.
      g.add(tube(kit, 4.2, 2.55, -22.5, 7, kit.hull), tube(kit, 4.2, 4.2, -84.5, 62, kit.core));
      for (const [y, z] of [[1.9, 1.9], [1.9, -1.9], [-1.9, 1.9], [-1.9, -1.9]]) {
        const nozzle = tube(kit, 1.15, 0.4, -87.5, 3, kit.dark, true);
        nozzle.position.y = y;
        nozzle.position.z = z;
        g.add(nozzle);
      }
      break;
    }
    case 'SRB_L':
    case 'SRB_R': {
      const y = EXTENT[id].y;
      for (const piece of [tube(kit, 1.86, 1.86, -86, 50, kit.hull), tube(kit, 1.86, 0.2, -36, 4, kit.hull), tube(kit, 1.9, 1.2, -88.5, 2.5, kit.dark, true)]) {
        piece.position.y = y;
        g.add(piece);
      }
      break;
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
  /** Grupo a orientar y ubicar. Su origen es el centro del vehículo en la configuración actual. */
  readonly group: THREE.Group;
  /** Muestra las partes unidas y las llamas de los motores encendidos. Devuelve el largo actual (m). */
  update(cfg: VehicleConfig, running: readonly EngineId[]): number;
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
  const flames: Readonly<Record<EngineId, THREE.Object3D[]>> = {
    SRB: [flame(kit, -88.5, 6.3, 1.7, 34), flame(kit, -88.5, -6.3, 1.7, 34)],
    RS25: [flame(kit, -87.5, 0, 3.1, 26)],
    RL10: [flame(kit, -18.3, 0, 1.0, 11)],
    MAIN: [flame(kit, -5.6, 0, 0.9, 7)],
    AUX: [flame(kit, -5.2, 0, 1.6, 3)],
    RCS: [flame(kit, -4.4, 0, 2.3, 1.2)],
  };
  for (const list of Object.values(flames)) for (const f of list) stack.add(f);

  return {
    group,
    update(cfg, running) {
      const present = partsOf(cfg);
      for (const [id, g] of parts) g.visible = present.includes(id);
      // Los paneles solares se despliegan ya en órbita, sin los paneles protectores.
      const deployed = cfg.lasJettisoned && cfg.coreSeparated;
      parts.get('SM')?.children.forEach((c) => {
        if (c.name === 'array') c.visible = deployed;
      });
      for (const [id, list] of Object.entries(flames)) for (const f of list) f.visible = running.includes(id as EngineId);
      const ext = vehicleExtent(cfg);
      stack.position.x = -ext.center;
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

const CM_ICON = '<path d="M 15 0 L 12.5 -2.2 L 5 -5.6 L 5 5.6 L 12.5 2.2 Z" class="hull"/>';
const SM_ICON = '<path d="M -9 -2.2 L -13.5 -4 L -13.5 4 L -9 2.2 Z" class="nozzle"/><rect x="-9" y="-5" width="11" height="10" class="hull"/><rect x="2" y="-5.6" width="3" height="11.2" class="adapter"/>';
const ARRAYS_ICON =
  '<path d="M -2 -3 L -16 -17 L -12.5 -18.5 L 1 -4 Z" class="wing"/><path d="M -2 3 L -16 17 L -12.5 18.5 L 1 4 Z" class="wing"/>' +
  '<path d="M -3 -3 L 9 -13 L 11 -10.5 L 0 -2 Z" class="wing far"/><path d="M -3 3 L 9 13 L 11 10.5 L 0 2 Z" class="wing far"/>';
const svg = (body: string): string => `<svg viewBox="-20 -20 40 40" class="ship-icon">${body}</svg>`;
const fire = (x: number, half: number, len: number, y = 0): string =>
  `<path d="M ${x} ${y - half} L ${x - len} ${y} L ${x} ${y + half} Z" class="flame"/>`;

/**
 * Ícono 2D propio de la nave, visto de costado y apuntando hacia +x. Cambia con la
 * etapa: cohete completo, sin boosters, ICPS + Orion, Orion y cápsula sola.
 */
export function vehicleIconSvg(cfg: VehicleConfig, running: readonly EngineId[]): string {
  if (cfg.cmSeparated) return svg(`${CM_ICON}<path d="M 5 -5.6 Q 3.2 0 5 5.6" class="shield"/>`);
  if (cfg.icpsSeparated) {
    const f = running.includes('MAIN') ? fire(-13.5, 3.4, 9) : running.includes('AUX') ? fire(-13.5, 4, 4) : '';
    return svg(`${f}${ARRAYS_ICON}${SM_ICON}${CM_ICON}`);
  }
  if (cfg.coreSeparated) {
    // ICPS + Orion: la etapa superior detrás del módulo de servicio.
    const f = running.includes('RL10') ? fire(-19, 2.6, 9) : '';
    return svg(
      `${f}<path d="M -15 -2.4 L -19 -3.6 L -19 3.6 L -15 2.4 Z" class="nozzle"/><rect x="-15" y="-4.6" width="13" height="9.2" class="hull"/>` +
        '<rect x="-2" y="-4.1" width="6" height="8.2" class="hull"/><path d="M 14 0 L 12 -1.8 L 5 -4.6 L 5 4.6 L 12 1.8 Z" class="hull"/><rect x="4" y="-4.6" width="1.6" height="9.2" class="adapter"/>',
    );
  }
  // Cohete: etapa central, parte superior y, si siguen, boosters y torre de escape.
  const boosters = cfg.srbSeparated
    ? ''
    : '<rect x="-18" y="-6.6" width="15" height="2.6" class="hull"/><path d="M -3 -6.6 L -1 -5.3 L -3 -4 Z" class="hull"/>' +
      '<rect x="-18" y="4" width="15" height="2.6" class="hull"/><path d="M -3 4 L -1 5.3 L -3 6.6 Z" class="hull"/>';
  const tower = cfg.lasJettisoned ? '<path d="M 14.5 0 L 12.5 -1.6 L 11 -1.6 L 11 1.6 L 12.5 1.6 Z" class="hull"/>' : '<path d="M 19 0 L 15 -0.5 L 13 -1.7 L 11 -1.7 L 11 1.7 L 13 1.7 L 15 0.5 Z" class="hull"/>';
  const f =
    (running.includes('RS25') ? fire(-18, 2.2, 10) : '') +
    (running.includes('SRB') && !cfg.srbSeparated ? fire(-18, 1.2, 12, -5.3) + fire(-18, 1.2, 12, 5.3) : '');
  return svg(
    `${f}${boosters}<rect x="-18" y="-2.8" width="22" height="5.6" class="core"/><path d="M 4 -2.8 L 6.5 -1.8 L 6.5 1.8 L 4 2.8 Z" class="hull"/><rect x="6.5" y="-1.8" width="4.5" height="3.6" class="hull"/>${tower}`,
  );
}

/** Ícono 2D de una parte desprendida. */
export function debrisIconSvg(kind: DebrisKind): string {
  switch (kind) {
    case 'SRB':
      return svg('<rect x="-9" y="-1.4" width="16" height="2.8" class="hull"/><path d="M 7 -1.4 L 9.5 0 L 7 1.4 Z" class="hull"/>');
    case 'LAS':
      return svg('<path d="M 8 0 L 2 -0.7 L -1 -2.6 L -5 -2.6 L -5 2.6 L -1 2.6 L 2 0.7 Z" class="hull"/>');
    case 'FAIRING':
      return svg('<path d="M -4 -4 Q 0 -6 4 -4" class="arc"/><path d="M -4 0 Q 0 -2 4 0" class="arc"/><path d="M -4 4 Q 0 2 4 4" class="arc"/>');
    case 'CORE':
      return svg('<rect x="-12" y="-2.8" width="22" height="5.6" class="core"/><path d="M 10 -2.8 L 12.5 -1.8 L 12.5 1.8 L 10 2.8 Z" class="hull"/>');
    case 'ICPS':
      return svg('<path d="M -5 -2.4 L -9 -3.6 L -9 3.6 L -5 2.4 Z" class="nozzle"/><rect x="-5" y="-4.6" width="13" height="9.2" class="hull"/>');
    case 'SM':
      return svg(`${ARRAYS_ICON}${SM_ICON}`);
  }
}
