/**
 * Flies the nominal mission with the current parameters and saves the sampled trail to
 * src/sim/mission/nominal-path.json (the plan the map draws faintly from the start).
 * `npm run tune` also writes it when it finishes.
 *
 * Usage: npm run path
 */
import { MISSION_PARAMS } from '../src/sim/mission/params';
import { writeNominalPath } from './lib/nominal-path';

const n = writeNominalPath(MISSION_PARAMS);
console.log(`nominal-path.json actualizado: ${n} puntos.`);
