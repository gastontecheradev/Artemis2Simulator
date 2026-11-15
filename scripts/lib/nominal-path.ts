import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MissionParams } from '../../src/sim/mission/params';
import { SimState } from '../../src/sim/state';
import { fly } from './calibration';

export const NOMINAL_PATH_FILE = fileURLToPath(new URL('../../src/sim/mission/nominal-path.json', import.meta.url));

/** Punto del plan nominal: MET (s) y posición inercial baricéntrica (km), redondeados. */
export type NominalPoint = readonly [t: number, x: number, y: number];

/**
 * Muestrea el trazo de la misión nominal volada: lo que el mapa dibuja tenue desde el
 * principio. Se guardan ~2.000 puntos, más densos donde la trayectoria se curva.
 */
export function sampleNominalPath(s: SimState, maxPoints = 2000): NominalPoint[] {
  const trail = s.trail;
  const out: NominalPoint[] = [];
  const stride = Math.max(1, Math.floor(trail.length / maxPoints));
  for (let i = 0; i < trail.length; i += stride) {
    const p = trail[i];
    out.push([Math.round(p.t), Math.round(p.r.x), Math.round(p.r.y)]);
  }
  const last = trail[trail.length - 1];
  out.push([Math.round(last.t), Math.round(last.r.x), Math.round(last.r.y)]);
  return out;
}

export function writeNominalPath(params: MissionParams): number {
  const s = fly(params);
  const path = sampleNominalPath(s);
  writeFileSync(NOMINAL_PATH_FILE, `${JSON.stringify(path)}\n`);
  return path.length;
}
