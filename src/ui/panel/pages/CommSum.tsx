import { losClearance } from '../../../sim/comms';
import { NSN_MAX_ALTITUDE, R_EARTH } from '../../../sim/constants';
import { formatNumber } from '../../../sim/format';
import { SimState, ephemerisOf } from '../../../sim/state';
import { useT } from '../../i18n';

/** Comm.Sum: red activa, estado del enlace, distancia y retardo de señal. */
export function CommSum({ s }: { s: SimState }): JSX.Element {
  const t = useT();
  const c = s.comms;
  const eph = ephemerisOf(s);
  const clearance = losClearance(s.ship.r, eph.earth(s.t).r, eph.moon(s.t).r);
  const alt = c.distance - R_EARTH;
  // La pérdida de señal afecta el enlace con Tierra, no los instrumentos de a bordo.
  return (
    <div className="page comm">
      <div className="comm-top">
        <div className={`net-box ${c.network === 'NSN' ? 'nsn' : 'dsn'}${c.los ? ' down' : ''}`}>
          <span className="net-name">{c.network}</span>
          <span className="net-full">{c.network === 'NSN' ? 'NEAR SPACE NETWORK' : 'DEEP SPACE NETWORK'}</span>
        </div>
        <div className={`link-box ${c.los ? 'los' : 'aos'}`}>
          <span className="lbl">{t('pg.link')}</span>
          <span className="link-state">{c.los ? 'LOS' : 'AOS'}</span>
        </div>
      </div>
      <div className="rows">
        <div className="row">
          <span className="lbl">{t('pg.distEarth')}</span>
          <span className="val">{formatNumber(c.distance, 0)}</span>
          <span className="unit">km</span>
        </div>
        <div className="row">
          <span className="lbl">{t('pg.oneWay')}</span>
          <span className="val">{formatNumber(c.delay, 3)}</span>
          <span className="unit">s</span>
        </div>
        <div className="row">
          <span className="lbl">{t('pg.roundTrip')}</span>
          <span className="val">{formatNumber(2 * c.delay, 3)}</span>
          <span className="unit">s</span>
        </div>
        <div className="row">
          <span className="lbl">{t('pg.nsnLimit')}</span>
          <span className={alt < NSN_MAX_ALTITUDE ? 'val' : 'val dim'}>{formatNumber(NSN_MAX_ALTITUDE, 0)}</span>
          <span className="unit">km</span>
        </div>
        <div className="row">
          <span className="lbl">{t('pg.moonMargin')}</span>
          <span className={clearance < 0 ? 'warn' : 'val'}>{formatNumber(clearance, 0)}</span>
          <span className="unit">km</span>
        </div>
      </div>
    </div>
  );
}
