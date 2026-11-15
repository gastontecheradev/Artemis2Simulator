/**
 * Vuela la misión nominal con los parámetros actuales y guarda el trazo muestreado en
 * src/sim/mission/nominal-path.json (el plan que el mapa dibuja tenue desde el inicio).
 * `npm run tune` también lo escribe al terminar.
 *
 * Uso: npm run path
 */
import { MISSION_PARAMS } from '../src/sim/mission/params';
import { writeNominalPath } from './lib/nominal-path';

const n = writeNominalPath(MISSION_PARAMS);
console.log(`nominal-path.json actualizado: ${n} puntos.`);
