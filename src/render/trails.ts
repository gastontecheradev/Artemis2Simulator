import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { Vec3 } from '../sim/math/vec3';
import { TrajectoryPoint } from '../sim/propagate';
import { TrailPoint } from '../sim/state';
import { KM_TO_SCENE, ViewFrame, worldToScene } from './worldToScene';

export interface TrailColors {
  readonly out: string;
  readonly ret: string;
  readonly prox: string;
  readonly predicted: string;
}

export interface Trails {
  readonly group: THREE.Group;
  /** Flown trail (solid), colored by phase as in NASA's mission map. */
  setTraveled(points: readonly TrailPoint[], tip: { t: number; r: Vec3 }, frame: ViewFrame): void;
  /** Predicted trajectory (dashed), from the spacecraft forward. */
  setPredicted(points: readonly TrajectoryPoint[], tip: { t: number; r: Vec3 }, frame: ViewFrame): void;
  /** Whole nominal plan (faint), drawn from the start. `points` = [t, x, y] in inertial km. */
  setNominal(points: readonly (readonly [number, number, number])[], frame: ViewFrame): void;
  /** Repositions the geometries according to the current floating origin. */
  place(frame: ViewFrame): void;
  setResolution(width: number, height: number): void;
  /** Constant on-screen dash length: takes the visible half-height in scene units. */
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
  const nominalMaterial = new LineMaterial({
    color: new THREE.Color(colors.predicted).getHex(),
    linewidth: 1.2,
    worldUnits: false,
    transparent: true,
    opacity: 0.28,
  });
  let traveled: Line2 | null = null;
  let predicted: Line2 | null = null;
  let nominal: Line2 | null = null;
  let nominalAnchor: Vec3 = { x: 0, y: 0, z: 0 };
  // Each geometry is built relative to the floating origin of the moment: that way the vertices
  // (float32) are small numbers near the spacecraft and the trail does not jitter in close-ups.
  let traveledAnchor: Vec3 = { x: 0, y: 0, z: 0 };
  let predictedAnchor: Vec3 = { x: 0, y: 0, z: 0 };

  const c = {
    out: new THREE.Color(colors.out),
    ret: new THREE.Color(colors.ret),
    prox: new THREE.Color(colors.prox),
  };
  const colorOf = (p: TrailPoint): THREE.Color => {
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
    setTraveled(points, tip, frame) {
      const f = frame;
      traveledAnchor = frame.origin;
      const positions: number[] = [];
      const cols: number[] = [];
      let last = c.out;
      for (const p of points) {
        worldToScene(p.r, p.t, f, v);
        positions.push(v.x, v.y, v.z);
        last = colorOf(p);
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
    setNominal(points, frame) {
      nominalAnchor = frame.origin;
      const positions: number[] = [];
      for (const [t, x, y] of points) {
        worldToScene({ x, y, z: 0 }, t, frame, v);
        positions.push(v.x, v.y, v.z);
      }
      nominal = replace(nominal, positions, null, nominalMaterial);
      if (nominal) nominal.renderOrder = -1;
    },
    place(frame) {
      const o = frame.origin;
      traveled?.position.set((traveledAnchor.x - o.x) * KM_TO_SCENE, (traveledAnchor.y - o.y) * KM_TO_SCENE, (traveledAnchor.z - o.z) * KM_TO_SCENE);
      predicted?.position.set((predictedAnchor.x - o.x) * KM_TO_SCENE, (predictedAnchor.y - o.y) * KM_TO_SCENE, (predictedAnchor.z - o.z) * KM_TO_SCENE);
      nominal?.position.set((nominalAnchor.x - o.x) * KM_TO_SCENE, (nominalAnchor.y - o.y) * KM_TO_SCENE, (nominalAnchor.z - o.z) * KM_TO_SCENE);
    },
    setResolution(width, height) {
      traveledMaterial.resolution.set(width, height);
      predictedMaterial.resolution.set(width, height);
      nominalMaterial.resolution.set(width, height);
    },
    setDashScale(viewRadiusScene) {
      predictedMaterial.dashScale = 45 / Math.max(1e-9, viewRadiusScene);
    },
    dispose() {
      traveled?.geometry.dispose();
      predicted?.geometry.dispose();
      nominal?.geometry.dispose();
      traveledMaterial.dispose();
      predictedMaterial.dispose();
      nominalMaterial.dispose();
    },
  };
}
