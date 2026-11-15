import { R_EARTH, R_MOON } from '../../sim/constants';
import { formatDuration, formatNumber } from '../../sim/format';
import { distance, length, sub } from '../../sim/math/vec3';
import { SimState, ephemerisOf } from '../../sim/state';
import { skinTemperature } from '../../sim/thermal';
import { FULL_TANKS, TANK, TankName } from '../../sim/vehicle';
import { useT } from '../i18n';

/** Tanque "activo": el de la etapa que empuja ahora o que empujará después. */
function activeTank(s: SimState): TankName {
  const v = s.vehicle;
  if (!v.srbSeparated && s.t < 126) return 'SRB';
  if (!v.coreSeparated) return 'CORE';
  if (!v.icpsSeparated) return 'ICPS';
  if (!v.cmSeparated) return 'ESM';
  return 'CM';
}

/** Datos de vuelo sobre el mapa: velocidad, temperatura, propelente, distancias y tiempo. */
export function MapHud({ s }: { s: SimState }): JSX.Element {
  const t = useT();
  const eph = ephemerisOf(s);
  const earth = eph.earth(s.t);
  const speed = length(sub(s.ship.v, earth.v));
  const dEarth = Math.max(0, distance(s.ship.r, earth.r) - R_EARTH);
  const dMoon = Math.max(0, distance(s.ship.r, eph.moon(s.t).r) - R_MOON);
  const tank = activeTank(s);
  const idx = TANK[tank];
  const frac = s.propulsion.prop[idx] / FULL_TANKS[idx];
  const temp = skinTemperature(s);
  const cell = (label: string, value: string, unit: string, cls = 'hud-v'): JSX.Element => (
    <div className="hud-cell">
      <span className="hud-l">{label}</span>
      <span className={cls}>
        {value} <small>{unit}</small>
      </span>
    </div>
  );
  return (
    <div className="map-hud">
      {cell(t('hud.elapsed'), s.t < 0 ? `T−${formatDuration(-s.t)}` : formatDuration(s.t), '')}
      {cell(t('hud.speed'), formatNumber(speed, 3), 'km/s')}
      {cell(t('hud.distEarth'), formatNumber(dEarth, 0), 'km')}
      {cell(t('hud.distMoon'), formatNumber(dMoon, 0), 'km')}
      {cell(t('hud.temp'), formatNumber(temp.kelvin - 273.15, 0), '°C', temp.aerodynamic ? 'hud-v warn' : 'hud-v')}
      <div className="hud-cell">
        <span className="hud-l">
          {t('hud.fuel')} · {t(`hud.stage.${tank}`)}
        </span>
        <span className="hud-v">
          {formatNumber(frac * 100, 0)} <small>%</small>
          <i className="hud-bar">
            <i style={{ width: `${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%` }} />
          </i>
        </span>
      </div>
    </div>
  );
}
