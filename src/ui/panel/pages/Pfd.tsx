import { commandedDirection, powerInputOf, runningEngines } from '../../../sim/advance';
import { airVelocity } from '../../../sim/atmosphere';
import { ATTITUDE_TOLERANCE, R_EARTH } from '../../../sim/constants';
import { formatNumber } from '../../../sim/format';
import { angleBetween, cross, dot, length, normalize, sub } from '../../../sim/math/vec3';
import { forces } from '../../../sim/power';
import { SimState, ephemerisOf } from '../../../sim/state';
import { ENGINES, G0, totalMass } from '../../../sim/vehicle';

const DEG = 180 / Math.PI;
const Z = { x: 0, y: 0, z: 1 };

/**
 * Indicador de actitud. La simulación es plana, así que la esfera solo cabecea: muestra
 * el ángulo del eje de la nave sobre el horizonte local. El rombo magenta es la actitud
 * que comanda el guiado y el círculo verde, la dirección de la velocidad (prograde).
 */
function AttitudeBall({ pitch, command, prograde }: { pitch: number; command: number; prograde: number }): JSX.Element {
  const R = 44;
  // Paso de la escala: grados por unidad de dibujo.
  const y = (deg: number): number => ((deg - pitch) * R) / 60;
  const ticks = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180];
  const wrap = (d: number): number => ((((d - pitch + 180) % 360) + 360) % 360) - 180 + pitch;
  return (
    <svg className="adi" viewBox="-60 -56 120 112">
      <clipPath id="adi-clip">
        <circle r={R} />
      </clipPath>
      <g clipPath="url(#adi-clip)">
        <rect x={-R} y={-R * 4} width={R * 2} height={R * 8} className="adi-ground" />
        {/* Cielo: la media vuelta que va del horizonte hacia arriba (se repite por si la nave da la vuelta). */}
        {[-1, 0, 1].map((k) => (
          <rect key={k} x={-R} y={-y(180 + 360 * k)} width={R * 2} height={3 * R} className="adi-sky" />
        ))}
        {ticks.map((t) => {
          const d = wrap(t);
          return (
            <g key={t} transform={`translate(0 ${-y(d)})`}>
              <path d={t === 0 ? `M ${-R} 0 H ${R}` : 'M -14 0 H 14'} className="adi-line" />
              {t !== 0 && (
                <text x="18" y="2.5" className="adi-num">
                  {Math.abs(t) > 90 ? 180 - Math.abs(t) : Math.abs(t)}
                </text>
              )}
            </g>
          );
        })}
        <circle cx="0" cy={-y(wrap(prograde))} r="3.2" className="adi-prograde" />
        <path d="M 0 -4 L 4 0 L 0 4 L -4 0 Z" transform={`translate(0 ${-y(wrap(command))})`} className="adi-command" />
      </g>
      <circle r={R} className="adi-rim" />
      {/* Símbolo fijo de la nave. */}
      <path d="M -22 0 H -8 L -4 5 L 0 0 L 4 5 L 8 0 H 22" className="adi-ship" />
    </svg>
  );
}

function Readout({ label, value, unit, cls = 'val' }: { label: string; value: string; unit?: string; cls?: string }): JSX.Element {
  return (
    <div className="row">
      <span className="lbl">{label}</span>
      <span className={cls}>{value}</span>
      <span className="unit">{unit ?? ''}</span>
    </div>
  );
}

/**
 * Flight.PFD: actitud, piloto automático y fuerzas sobre la nave (inspirada en la
 * pantalla de vuelo principal de la cabina). Todo sale del estado simulado.
 */
export function Pfd({ s }: { s: SimState }): JSX.Element {
  const eph = ephemerisOf(s);
  const earth = eph.earth(s.t);
  const up = normalize(sub(s.ship.r, earth.r));
  const east = normalize(cross(Z, up));
  // Ángulo sobre el horizonte local, medido en el plano orbital (−180° a 180°).
  const elevation = (d: { x: number; y: number; z: number }): number => Math.atan2(dot(d, up), dot(d, east)) * DEG;
  const vRel = sub(s.ship.v, earth.v);
  const cmd = commandedDirection(s);
  const error = angleBetween(s.attitude.dir, cmd);
  const input = powerInputOf(s);
  const f = input ? forces(input, s.t, s.ship.r, s.ship.v, s.propulsion.prop) : null;
  const engines = runningEngines(s);
  const vAir = length(sub(s.ship.v, airVelocity(s.ship.r, earth)));
  const altitude = length(sub(s.ship.r, earth.r)) - R_EARTH;
  const burn = s.burn;
  // Δv entregado hasta ahora por el encendido en curso (ecuación del cohete).
  const delivered = burn
    ? ((G0 * ENGINES[burn.system === 'ICPS' ? 'RL10' : burn.system].ispVac) / 1000) *
      Math.log(burn.massStart / totalMass(s.vehicle, s.propulsion.prop))
    : 0;
  return (
    <div className="page pfd">
      <AttitudeBall pitch={elevation(s.attitude.dir)} command={elevation(cmd)} prograde={elevation(vRel)} />
      <div className="rows">
        <Readout label="DAP" value={s.attitude.mode} cls={s.attitude.mode === 'AUTO' ? 'val' : 'warn'} />
        <Readout label="CABECEO" value={formatNumber(elevation(s.attitude.dir), 1)} unit="°" />
        <Readout label="ERROR ACT" value={formatNumber(error * DEG, 1)} unit="°" cls={error < ATTITUDE_TOLERANCE ? 'val' : 'warn'} />
        <Readout label="ACEL" value={formatNumber(f ? f.thrustAccel / G0 : 0, 2)} unit="g" />
        <Readout label="EMPUJE" value={formatNumber(f ? f.thrust / 1000 : 0, 0)} unit="kN" />
        <Readout label="MASA" value={formatNumber(totalMass(s.vehicle, s.propulsion.prop) / 1000, 1)} unit="t" />
        {altitude < 200 && <Readout label="PRES DIN Q" value={formatNumber(f ? f.q / 1000 : 0, 1)} unit="kPa" />}
        {altitude < 200 && <Readout label="V REL TIERRA" value={formatNumber(vAir, 3)} unit="km/s" />}
        <Readout label="MOTORES" value={engines.length > 0 ? engines.join(' ') : 'APAGADOS'} cls={engines.length > 0 ? 'cmd' : 'val dim'} />
        {burn && <Readout label="ΔV ENTREGADO" value={formatNumber(delivered * 1000, 1)} unit="m/s" cls="cmd" />}
        {burn && <Readout label="CORTE EN" value={formatNumber(Math.max(0, burn.tEnd - s.t), 0)} unit="s" cls="cmd" />}
      </div>
    </div>
  );
}
