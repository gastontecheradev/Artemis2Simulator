import { Ephemeris } from './bodies';
import { Vec3 } from './math/vec3';

/** Aceleración gravitatoria (km/s²) sobre la nave en la posición r y el instante t. */
export function acceleration(r: Vec3, t: number, eph: Ephemeris): Vec3 {
  const e = eph.earth(t).r;
  const dx = r.x - e.x;
  const dy = r.y - e.y;
  const dz = r.z - e.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  const k = -eph.gmEarth / (d2 * Math.sqrt(d2));
  let ax = k * dx;
  let ay = k * dy;
  let az = k * dz;
  if (eph.gmMoon !== 0) {
    const m = eph.moon(t).r;
    const mx = r.x - m.x;
    const my = r.y - m.y;
    const mz = r.z - m.z;
    const m2 = mx * mx + my * my + mz * mz;
    const km = -eph.gmMoon / (m2 * Math.sqrt(m2));
    ax += km * mx;
    ay += km * my;
    az += km * mz;
  }
  return { x: ax, y: ay, z: az };
}
