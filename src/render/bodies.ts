import * as THREE from 'three';
import { EARTH_MOON_DISTANCE, EI_ALTITUDE, GM_EARTH, GM_MOON, MOON_SOI, R_EARTH, R_MOON } from '../sim/constants';
import { KM_TO_SCENE } from './worldToScene';

/** Brillo propio de la Tierra en 3D (fracción de su color), solo para que se vea el lado nocturno. */
const EARTH_NIGHT_GLOW = 0.3;
/** Aclarado del color de la Tierra iluminada en 3D (mezcla con blanco). */
const EARTH_DAY_LIFT = 0.3;

export interface BodyMeshes {
  readonly group: THREE.Group;
  readonly earth: THREE.Mesh;
  readonly moon: THREE.Mesh;
  /** Circunferencia de la órbita lunar alrededor del baricentro (referencia). */
  readonly moonOrbit: THREE.LineLoop;
  /** Altitud de la interfaz de entrada (400.000 ft) alrededor de la Tierra. */
  readonly eiRing: THREE.LineLoop;
  /** Esfera de influencia lunar (en el plano orbital). */
  readonly soiRing: THREE.Line;
  /** Factor de tamaño de los cuerpos (1 = escala real). */
  setBodyScale(k: number): void;
  /** En 3D los cuerpos se iluminan con el "Sol"; en 2D son discos planos. */
  setLit(on: boolean): void;
  dispose(): void;
}

function circle(radius: number, segments: number, closed: boolean): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const n = closed ? segments : segments + 1;
  for (let i = 0; i < n; i++) {
    const a = (i / segments) * 2 * Math.PI;
    pts.push(new THREE.Vector3(radius * Math.cos(a), radius * Math.sin(a), 0));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

/**
 * Tierra y Luna como esferas de color liso, más las referencias geométricas que no
 * dependen de imágenes. Las texturas de NASA (Blue Marble, CGI Moon Kit) quedan
 * pendientes hasta que estén elegidas y registradas en ASSETS.md.
 */
export function createBodies(
  colors: { earth: string; moon: string; orbit: string; ei: string },
  /** Mapa 2D: Luna aclarada (mezcla con blanco, sin matices nuevos) y órbita más visible. */
  contrast = false,
): BodyMeshes {
  const group = new THREE.Group();
  const moonColor = contrast ? `#${new THREE.Color(colors.moon).lerp(new THREE.Color(0xffffff), 0.35).getHexString()}` : colors.moon;
  const geometry = new THREE.SphereGeometry(1, 192, 96);
  // Los polos de la esfera van sobre z (perpendicular al plano orbital).
  geometry.rotateX(Math.PI / 2);

  const lighten = (color: string, k: number): string => `#${new THREE.Color(color).lerp(new THREE.Color(0xffffff), k).getHexString()}`;
  const make = (color: string, glow = 0, dayLift = 0): { flat: THREE.MeshBasicMaterial; lit: THREE.MeshStandardMaterial } => ({
    flat: new THREE.MeshBasicMaterial({ color }),
    lit: new THREE.MeshStandardMaterial({ color: lighten(color, dayLift), roughness: 0.95, metalness: 0, emissive: color, emissiveIntensity: glow }),
  });
  // En 3D la Tierra tiene un brillo propio tenue (su mismo color) para que el lado
  // nocturno se distinga del fondo, y el lado diurno se aclara (mezcla con blanco, sin
  // matices nuevos) para que el terminador se lea. La Luna no: su lado oscuro queda oscuro.
  const earthMat = make(colors.earth, EARTH_NIGHT_GLOW, EARTH_DAY_LIFT);
  const moonMat = make(moonColor);
  const earth: THREE.Mesh = new THREE.Mesh(geometry, earthMat.flat);
  const moon: THREE.Mesh = new THREE.Mesh(geometry, moonMat.flat);

  const mu = GM_MOON / (GM_EARTH + GM_MOON);
  const orbitGeometry = circle((1 - mu) * EARTH_MOON_DISTANCE * KM_TO_SCENE, 256, true);
  const orbitMaterial = new THREE.LineBasicMaterial({ color: colors.orbit, transparent: true, opacity: contrast ? 0.42 : 0.18 });
  const moonOrbit = new THREE.LineLoop(orbitGeometry, orbitMaterial);

  const eiGeometry = circle((R_EARTH + EI_ALTITUDE) * KM_TO_SCENE, 720, true);
  const eiMaterial = new THREE.LineBasicMaterial({ color: colors.ei, transparent: true, opacity: 0.7 });
  const eiRing = new THREE.LineLoop(eiGeometry, eiMaterial);

  const soiGeometry = circle(MOON_SOI * KM_TO_SCENE, 180, false);
  const soiMaterial = new THREE.LineDashedMaterial({ color: colors.orbit, transparent: true, opacity: contrast ? 0.5 : 0.3, dashSize: 2.2, gapSize: 2.4 });
  const soiRing = new THREE.Line(soiGeometry, soiMaterial);
  soiRing.computeLineDistances();

  group.add(earth, moon, moonOrbit, eiRing, soiRing);

  const setBodyScale = (k: number): void => {
    earth.scale.setScalar(R_EARTH * KM_TO_SCENE * k);
    moon.scale.setScalar(R_MOON * KM_TO_SCENE * k);
    // El anillo de EI está a escala real: con la Tierra agrandada quedaría adentro del disco.
    eiRing.visible = k === 1;
  };
  setBodyScale(1);

  return {
    group,
    earth,
    moon,
    moonOrbit,
    eiRing,
    soiRing,
    setBodyScale,
    setLit(on) {
      earth.material = on ? earthMat.lit : earthMat.flat;
      moon.material = on ? moonMat.lit : moonMat.flat;
    },
    dispose() {
      for (const g of [geometry, orbitGeometry, eiGeometry, soiGeometry]) g.dispose();
      for (const m of [orbitMaterial, eiMaterial, soiMaterial]) m.dispose();
      for (const m of [earthMat, moonMat]) {
        m.flat.dispose();
        m.lit.dispose();
      }
    },
  };
}
