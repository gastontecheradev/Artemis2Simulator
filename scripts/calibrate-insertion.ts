/**
 * Calibrates the ascent and the Earth-orbit burns against the published data
 * (altitudes and velocity at the end of the ascent, E4 and E5 instants).
 * Updates src/sim/mission/params.json without touching the TLI or the lunar phase.
 *
 * Usage: npm run calibrate
 * Afterwards it is worth running `npm run tune`, which re-tunes the TLI with the new orbit.
 */
import { R_EARTH } from '../src/sim/constants';
import { formatMet } from '../src/sim/format';
import { MISSION_PARAMS } from '../src/sim/mission/params';
import { calibrate, fly, saveParams, withBurn } from './lib/calibration';

// Several passes: the E5 duration that centers the burn depends on its own Δv.
let params = MISSION_PARAMS;
for (let i = 0; i < 3; i++) params = calibrate(params, (m) => console.log(m));
saveParams(params);

// Summary of the resulting orbit (without TLI).
const s = fly(withBurn(params, 'E9', { prograde: 0 }), params.burns.E9.met + 600);
console.log('\nÁpsides hasta el TLI:');
for (const a of s.record.apsides) {
  console.log(`  ${formatMet(a.t)}  ${a.type === 'apoapsis' ? 'apogeo ' : 'perigeo'}  ${(a.radius - R_EARTH).toFixed(1)} km`);
}
console.log(`\nPropelente del ICPS restante: ${s.propulsion.prop[2].toFixed(0)} kg`);
console.log('params.json actualizado.');
