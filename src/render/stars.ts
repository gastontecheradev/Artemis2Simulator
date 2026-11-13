import * as THREE from 'three';

export interface Stars {
  /** Dibuja el fondo. Llamar antes de la escena principal, con el buffer ya limpio. */
  render(renderer: THREE.WebGLRenderer, main: THREE.Camera, aspect: number, frameAngle: number): void;
  dispose(): void;
}

/** Generador determinista: el cielo es el mismo en cada carga. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Campo de estrellas de fondo. Es decorativo (posiciones al azar, no un catálogo real).
 * Se dibuja con una cámara propia que solo copia la orientación de la cámara principal,
 * así no depende del zoom ni del origen flotante. En el marco rotante el cielo gira,
 * que es justamente lo que se vería desde ese marco.
 */
export function createStars(color: string, count = 1600): Stars {
  const random = mulberry32(20260401);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    // Punto uniforme sobre la esfera.
    const z = 2 * random() - 1;
    const phi = 2 * Math.PI * random();
    const r = Math.sqrt(1 - z * z);
    positions.set([10 * r * Math.cos(phi), 10 * r * Math.sin(phi), 10 * z], i * 3);
    // Muchas estrellas tenues y pocas brillantes.
    const brightness = 0.12 + 0.75 * Math.pow(random(), 3.2);
    colors.set([base.r * brightness, base.g * brightness, base.b * brightness], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, depthTest: false });
  const points = new THREE.Points(geometry, material);
  const scene = new THREE.Scene();
  scene.add(points);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);

  return {
    render(renderer, main, aspect, frameAngle) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      camera.quaternion.copy(main.quaternion);
      points.rotation.z = -frameAngle;
      renderer.render(scene, camera);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
