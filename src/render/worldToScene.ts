import * as THREE from 'three';
import { Ephemeris } from '../sim/bodies';
import { Vec3, rotateZ } from '../sim/math/vec3';

/** 1 unidad de escena = 1.000 km. */
export const KM_TO_SCENE = 1e-3;

export interface ViewFrame {
  readonly eph: Ephemeris;
  /** true = marco rotante Tierra‑Luna (la Luna queda fija sobre +x). */
  readonly rotating: boolean;
  /**
   * Origen flotante: punto (km, ya en el marco de dibujo) que se dibuja en el origen
   * de la escena. Es lo que sigue la cámara, así float32 nunca ve números grandes.
   */
  readonly origin: Vec3;
}

/** Posición en el marco de dibujo (km): inercial tal cual, o rotada según la Luna en t. */
export function toDisplayFrame(p: Vec3, t: number, frame: ViewFrame): Vec3 {
  return frame.rotating ? rotateZ(p, -frame.eph.moonAngle(t)) : p;
}

/**
 * Única conversión de km de simulación a unidades de escena.
 * `t` es el instante al que corresponde la posición (importa en el marco rotante).
 */
export function worldToScene(p: Vec3, t: number, frame: ViewFrame, out = new THREE.Vector3()): THREE.Vector3 {
  const d = toDisplayFrame(p, t, frame);
  return out.set(
    (d.x - frame.origin.x) * KM_TO_SCENE,
    (d.y - frame.origin.y) * KM_TO_SCENE,
    (d.z - frame.origin.z) * KM_TO_SCENE,
  );
}
