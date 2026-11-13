import * as THREE from 'three';
import { EARTH_MOON_DISTANCE, GM_EARTH, GM_MOON, R_EARTH, R_MOON } from '../sim/constants';
import { KM_TO_SCENE } from './worldToScene';

/** Factor del toggle "tamaño exagerado": a escala real los cuerpos casi no se ven. */
export const EXAGGERATION = 6;

export interface BodyMeshes {
  readonly group: THREE.Group;
  readonly earth: THREE.Mesh;
  readonly moon: THREE.Mesh;
  /** Circunferencia de la órbita lunar alrededor del baricentro (referencia). */
  readonly moonOrbit: THREE.LineLoop;
  setExaggerated(on: boolean): void;
  /** En 3D los cuerpos se iluminan con el "Sol"; en 2D son discos planos. */
  setLit(on: boolean): void;
  dispose(): void;
}

/**
 * Tierra y Luna como esferas de color liso. Las texturas de NASA (Blue Marble,
 * CGI Moon Kit) quedan pendientes hasta que estén elegidas y registradas en ASSETS.md.
 */
export function createBodies(colors: { earth: string; moon: string; orbit: string }): BodyMeshes {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(1, 64, 32);
  // Los polos de la esfera van sobre z (perpendicular al plano orbital).
  geometry.rotateX(Math.PI / 2);

  const make = (color: string): { flat: THREE.MeshBasicMaterial; lit: THREE.MeshStandardMaterial } => ({
    flat: new THREE.MeshBasicMaterial({ color }),
    lit: new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 }),
  });
  const earthMat = make(colors.earth);
  const moonMat = make(colors.moon);
  const earth: THREE.Mesh = new THREE.Mesh(geometry, earthMat.flat);
  const moon: THREE.Mesh = new THREE.Mesh(geometry, moonMat.flat);
  group.add(earth, moon);

  const mu = GM_MOON / (GM_EARTH + GM_MOON);
  const pts: THREE.Vector3[] = [];
  const rOrbit = (1 - mu) * EARTH_MOON_DISTANCE * KM_TO_SCENE;
  for (let i = 0; i < 256; i++) {
    const a = (i / 256) * 2 * Math.PI;
    pts.push(new THREE.Vector3(rOrbit * Math.cos(a), rOrbit * Math.sin(a), 0));
  }
  const orbitGeometry = new THREE.BufferGeometry().setFromPoints(pts);
  const orbitMaterial = new THREE.LineBasicMaterial({ color: colors.orbit, transparent: true, opacity: 0.18 });
  const moonOrbit = new THREE.LineLoop(orbitGeometry, orbitMaterial);
  group.add(moonOrbit);

  const setExaggerated = (on: boolean): void => {
    const k = on ? EXAGGERATION : 1;
    earth.scale.setScalar(R_EARTH * KM_TO_SCENE * k);
    moon.scale.setScalar(R_MOON * KM_TO_SCENE * k);
  };
  setExaggerated(false);

  return {
    group,
    earth,
    moon,
    moonOrbit,
    setExaggerated,
    setLit(on) {
      earth.material = on ? earthMat.lit : earthMat.flat;
      moon.material = on ? moonMat.lit : moonMat.flat;
    },
    dispose() {
      geometry.dispose();
      orbitGeometry.dispose();
      orbitMaterial.dispose();
      for (const m of [earthMat, moonMat]) {
        m.flat.dispose();
        m.lit.dispose();
      }
    },
  };
}
