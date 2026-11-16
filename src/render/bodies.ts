import * as THREE from 'three';
import { EARTH_MOON_DISTANCE, EI_ALTITUDE, GM_EARTH, GM_MOON, MOON_SOI, R_EARTH, R_MOON } from '../sim/constants';
import { Vec3 } from '../sim/math/vec3';
import { KM_TO_SCENE } from './worldToScene';

/** Earth's own glow in 3D (fraction of its color), only so the night side is visible. */
const EARTH_NIGHT_GLOW = 0.35;
/** Lightening of the lit Earth's color in 3D (mix with white). Low so it stays blue. */
const EARTH_DAY_LIFT = 0.12;

export interface BodyMeshes {
  readonly group: THREE.Group;
  readonly earth: THREE.Mesh;
  readonly moon: THREE.Mesh;
  /** Lunar orbit around the barycenter (reference; ellipse, inertial, without the drawing rotation). */
  readonly moonOrbit: THREE.LineLoop;
  /** Replaces the lunar orbit with these points (km, inertial, relative to the barycenter). */
  setMoonOrbit(points: readonly Vec3[]): void;
  /** Entry interface altitude (400,000 ft) around Earth. */
  readonly eiRing: THREE.LineLoop;
  /** Lunar sphere of influence (in the orbital plane). */
  readonly soiRing: THREE.Line;
  /** In 3D the bodies are lit by the "Sun"; in 2D they are flat disks. */
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
 * Earth and Moon as plain-colored spheres, plus the geometric references that do not
 * depend on images. The NASA textures (Blue Marble, CGI Moon Kit) remain
 * pending until they are chosen and registered in ASSETS.md.
 */
export function createBodies(
  colors: { earth: string; moon: string; orbit: string; ei: string },
  /** 2D map: lightened Moon (mixed with white, no new hues) and a more visible orbit. */
  contrast = false,
): BodyMeshes {
  const group = new THREE.Group();
  const moonColor = contrast ? `#${new THREE.Color(colors.moon).lerp(new THREE.Color(0xffffff), 0.35).getHexString()}` : colors.moon;
  const geometry = new THREE.SphereGeometry(1, 192, 96);
  // The sphere's poles lie along z (perpendicular to the orbital plane).
  geometry.rotateX(Math.PI / 2);

  const lighten = (color: string, k: number): string => `#${new THREE.Color(color).lerp(new THREE.Color(0xffffff), k).getHexString()}`;
  const make = (color: string, glow = 0, dayLift = 0): { flat: THREE.MeshBasicMaterial; lit: THREE.MeshStandardMaterial } => ({
    flat: new THREE.MeshBasicMaterial({ color }),
    lit: new THREE.MeshStandardMaterial({ color: lighten(color, dayLift), roughness: 0.95, metalness: 0, emissive: color, emissiveIntensity: glow }),
  });
  // In 3D Earth has a faint glow of its own (its same color) so the night side
  // stands out from the background, and the day side is lightened (mixed with white, no
  // new hues) so the terminator reads. Not the Moon: its dark side stays dark.
  const earthMat = make(colors.earth, EARTH_NIGHT_GLOW, EARTH_DAY_LIFT);
  const moonMat = make(moonColor);
  const earth: THREE.Mesh = new THREE.Mesh(geometry, earthMat.flat);
  const moon: THREE.Mesh = new THREE.Mesh(geometry, moonMat.flat);

  // Mean circle until the scene passes the real orbit with `setMoonOrbit`.
  const mu = GM_MOON / (GM_EARTH + GM_MOON);
  let orbitGeometry = circle((1 - mu) * EARTH_MOON_DISTANCE * KM_TO_SCENE, 256, true);
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

  // Earth and Moon always at real scale, in all three views.
  earth.scale.setScalar(R_EARTH * KM_TO_SCENE);
  moon.scale.setScalar(R_MOON * KM_TO_SCENE);

  return {
    group,
    earth,
    moon,
    moonOrbit,
    eiRing,
    soiRing,
    setMoonOrbit(points) {
      const next = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x * KM_TO_SCENE, p.y * KM_TO_SCENE, p.z * KM_TO_SCENE)));
      orbitGeometry.dispose();
      orbitGeometry = next;
      moonOrbit.geometry = next;
    },
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
