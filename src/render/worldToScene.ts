import * as THREE from 'three';
import { Ephemeris } from '../sim/bodies';
import { Vec3, rotateZ } from '../sim/math/vec3';

/** 1 scene unit = 1,000 km. */
export const KM_TO_SCENE = 1e-3;

export interface ViewFrame {
  readonly eph: Ephemeris;
  /** true = Earth‑Moon rotating frame (the Moon stays fixed on +x). */
  readonly rotating: boolean;
  /**
   * Fixed rotation (rad) subtracted from the drawing, in either frame (in the
   * rotating one, on top of the Moon's rotation). The 2D map uses it for its orientation; 0 or
   * absent = axes as they are.
   */
  readonly angle?: number;
  /**
   * Floating origin: point (km, already in the drawing frame) drawn at the scene
   * origin. It is what the camera follows, so float32 never sees large numbers.
   */
  readonly origin: Vec3;
}

/** Position in the drawing frame (km): inertial (with its fixed rotation), or rotated according to the Moon at t. */
export function toDisplayFrame(p: Vec3, t: number, frame: ViewFrame): Vec3 {
  const a = (frame.rotating ? frame.eph.moonAngle(t) : 0) + (frame.angle ?? 0);
  return a ? rotateZ(p, -a) : p;
}

/**
 * The single conversion from simulation km to scene units.
 * `t` is the instant the position corresponds to (it matters in the rotating frame).
 */
export function worldToScene(p: Vec3, t: number, frame: ViewFrame, out = new THREE.Vector3()): THREE.Vector3 {
  const d = toDisplayFrame(p, t, frame);
  return out.set(
    (d.x - frame.origin.x) * KM_TO_SCENE,
    (d.y - frame.origin.y) * KM_TO_SCENE,
    (d.z - frame.origin.z) * KM_TO_SCENE,
  );
}
