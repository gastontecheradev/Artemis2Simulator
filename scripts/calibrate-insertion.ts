/**
 * Calibra el ascenso y los encendidos en órbita terrestre contra los datos publicados
 * (altitudes y velocidad al final del ascenso, instantes de E4 y E5).
 * Actualiza src/sim/mission/params.json sin tocar el TLI ni la fase lunar.
 *
 * Uso: npm run calibrate
 * Después conviene correr `npm run tune`, que reajusta el TLI con la órbita nueva.
 */
import { R_EARTH } from '../src/sim/constants';
import { formatMet } from '../src/sim/format';
import { MISSION_PARAMS } from '../src/sim/mission/params';
import { calibrate, fly, saveParams, withBurn } from './lib/calibration';

// Varias pasadas: la duración de E5 que centra el encendido depende de su propio Δv.
let params = MISSION_PARAMS;
for (let i = 0; i < 3; i++) params = calibrate(params, (m) => console.log(m));
saveParams(params);

// Resumen de la órbita resultante (sin TLI).
const s = fly(withBurn(params, 'E9', { prograde: 0 }), params.burns.E9.met + 600);
console.log('\nÁpsides hasta el TLI:');
for (const a of s.record.apsides) {
  console.log(`  ${formatMet(a.t)}  ${a.type === 'apoapsis' ? 'apogeo ' : 'perigeo'}  ${(a.radius - R_EARTH).toFixed(1)} km`);
}
console.log(`\nPropelente del ICPS restante: ${s.propulsion.prop[2].toFixed(0)} kg`);
console.log('params.json actualizado.');
