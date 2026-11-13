/**
 * Calibra el estado inicial (E3) y los encendidos en órbita terrestre contra los
 * tiempos de docs/reference/3.png. Actualiza src/sim/mission/params.json.
 *
 * Uso: npm run calibrate
 * Después conviene correr `npm run tune`, que reajusta el TLI con la órbita nueva.
 */
import { R_EARTH } from '../src/sim/constants';
import { formatMet } from '../src/sim/format';
import { MISSION_PARAMS } from '../src/sim/mission/params';
import { calibrate, fly, saveParams, withBurn } from './lib/calibration';

const params = calibrate(MISSION_PARAMS, (m) => console.log(m));
saveParams(params);

// Resumen de la órbita resultante (sin TLI).
const s = fly(withBurn(params, 'E9', { prograde: 0 }), params.burns.E9.met + 10);
console.log('\nÁpsides hasta el TLI:');
for (const a of s.record.apsides) {
  console.log(`  ${formatMet(a.t)}  ${a.type === 'apoapsis' ? 'apogeo ' : 'perigeo'}  ${(a.radius - R_EARTH).toFixed(1)} km`);
}
console.log('\nparams.json actualizado.');
