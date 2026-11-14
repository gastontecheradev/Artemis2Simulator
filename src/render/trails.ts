import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { Vec3 } from '../sim/math/vec3';
import { TrajectoryPoint } from '../sim/propagate';
import { TrailPoint } from '../sim/state';
import { KM_TO_SCENE, ViewFrame, worldToScene } from './worldToScene';

export type TrailColorMode = 'phase' | 'network';

export interface TrailColors {
  readonly out: string;
  readonly ret: string;
  readonly prox: string;
  readonly nsn: string;
  readonly dsn: string;
  readonly los: string;
  readonly predicted: string;
}

export interface Trails {
  readonly group: THREE.Group;
  /** Trazo recorrido (sólido), coloreado por fase (1.png) o por red (2.png). */
  setTraveled(points: readonly TrailPoint[], tip: { t: number; r: Vec3 }, frame: ViewFrame, mode: TrailColorMode): void;
  /** Trayectoria predicha (punteada), desde la nave hacia adelante. */
  setPredicted(points: readonly TrajectoryPoint[], tip: { t: number; r: Vec3 }, frame: ViewFrame): void;
  /** Reubica las geometrías según el origen flotante actual. */
  place(frame: ViewFrame): void;
  setResolution(width: number, height: number): void;
  /** Largo de guion constante en pantalla: recibe el semialto visible en unidades de escena. */
  setDashScale(viewRadiusScene: number): void;
  dispose(): void;
}

export function createTrails(colors: TrailColors): Trails {
  const group = new THREE.Group();
  const traveledMaterial = new LineMaterial({ linewidth: 2.5, vertexColors: true, worldUnits: false });
  const predictedMaterial = new LineMaterial({
    color: new THREE.Color(colors.predicted).getHex(),
    linewidth: 1.5,
    worldUnits: false,
    dashed: true,
    dashSize: 1,
    gapSize: 1,
    transparent: true,
    opacity: 0.75,
  });
  let traveled: Line2 | null = null;
  let predicted: Line2 | null = null;
  // Cada geometría se construye relativa al origen flotante del momento: así los vértices
  // (float32) son números chicos cerca de la nave y el trazo no tiembla en los primeros planos.
  let traveledAnchor: Vec3 = { x: 0, y: 0, z: 0 };
  let predictedAnchor: Vec3 = { x: 0, y: 0, z: 0 };

  const c = {
    out: new THREE.Color(colors.out),
    ret: new THREE.Color(colors.ret),
    prox: new THREE.Color(colors.prox),
    nsn: new THREE.Color(colors.nsn),
    dsn: new THREE.Color(colors.dsn),
    los: new THREE.Color(colors.los),
  };
  const colorOf = (p: TrailPoint, mode: TrailColorMode): THREE.Color => {
    if (mode === 'network') return p.net === 'LOS' ? c.los : p.net === 'NSN' ? c.nsn : c.dsn;
    if (p.prox) return c.prox;
    return p.phase === 'REGRESO' || p.phase === 'ENTRADA' ? c.ret : c.out;
  };

  const replace = (old: Line2 | null, positions: number[], cols: number[] | null, material: LineMaterial): Line2 | null => {
    if (old) {
      group.remove(old);
      old.geometry.dispose();
    }
    if (positions.length < 6) return null;
    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    if (cols) geometry.setColors(cols);
    const line = new Line2(geometry, material);
    line.computeLineDistances();
    line.frustumCulled = false;
    group.add(line);
    return line;
  };

  const v = new THREE.Vector3();
  return {
    group,
    setTraveled(points, tip, frame, mode) {
      const f = frame;
      traveledAnchor = frame.origin;
      const positions: number[] = [];
      const cols: number[] = [];
      let last = c.out;
      for (const p of points) {
        worldToScene(p.r, p.t, f, v);
        positions.push(v.x, v.y, v.z);
        last = colorOf(p, mode);
        cols.push(last.r, last.g, last.b);
      }
      worldToScene(tip.r, tip.t, f, v);
      positions.push(v.x, v.y, v.z);
      cols.push(last.r, last.g, last.b);
      traveled = replace(traveled, positions, cols, traveledMaterial);
    },
    setPredicted(points, tip, frame) {
      const f = frame;
      predictedAnchor = frame.origin;
      const positions: number[] = [];
      worldToScene(tip.r, tip.t, f, v);
      positions.push(v.x, v.y, v.z);
      for (const p of points) {
        if (p.t <= tip.t) continue;
        worldToScene(p.r, p.t, f, v);
        positions.push(v.x, v.y, v.z);
      }
      predicted = replace(predicted, positions, null, predictedMaterial);
    },
    place(frame) {
      const o = frame.origin;
      traveled?.position.set((traveledAnchor.x - o.x) * KM_TO_SCENE, (traveledAnchor.y - o.y) * KM_TO_SCENE, (traveledAnchor.z - o.z) * KM_TO_SCENE);
      predicted?.position.set((predictedAnchor.x - o.x) * KM_TO_SCENE, (predictedAnchor.y - o.y) * KM_TO_SCENE, (predictedAnchor.z - o.z) * KM_TO_SCENE);
    },
    setResolution(width, height) {
      traveledMaterial.resolution.set(width, height);
      predictedMaterial.resolution.set(width, height);
    },
    setDashScale(viewRadiusScene) {
      predictedMaterial.dashScale = 45 / Math.max(1e-9, viewRadiusScene);
    },
    dispose() {
      traveled?.geometry.dispose();
      predicted?.geometry.dispose();
      traveledMaterial.dispose();
      predictedMaterial.dispose();
    },
  };
}
