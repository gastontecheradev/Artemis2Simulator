import { formatDuration, formatMet, formatNumber } from '../sim/format';
import { SimState } from '../sim/state';
import { useT } from './i18n';
import { showIntro } from './store';

/** Pantalla de fin de misión (E15 o cualquiera de los finales que decide la física). */
export function EndScreen({ s, onCredits }: { s: SimState; onCredits: () => void }): JSX.Element | null {
  const t = useT();
  const o = s.outcome;
  if (!o) return null;
  const ok = o.kind === 'success';
  const r = s.record;
  return (
    <div className="end-screen">
      <div className={ok ? 'end-card ok' : 'end-card fail'}>
        <span className="end-kicker">{ok ? t('end.ok') : t('end.fail')}</span>
        <h1>{t(`end.t.${o.kind}`)}</h1>
        <p>{o.text}</p>
        {ok && (
          // La foto del amerizaje la elige Gastón en images.nasa.gov (está anotada como pendiente en ASSETS.md).
          <div className="end-photo">{t('end.photo')}</div>
        )}
        <dl className="end-stats">
          <dt>{t('end.met')}</dt>
          <dd>{formatMet(o.t)}</dd>
          <dt>{t('end.duration')}</dt>
          <dd>{formatDuration(o.t)}</dd>
          <dt>{t('end.flyby')}</dt>
          <dd>{r.perilune ? `${formatNumber(r.perilune.altitude, 0)} km` : t('end.notDone')}</dd>
          <dt>{t('end.eiAngle')}</dt>
          <dd>{r.ei ? `${formatNumber(r.ei.fpaDeg, 2)}°` : '---'}</dd>
          <dt>{t('end.eiSpeed')}</dt>
          <dd>{r.ei ? `${formatNumber(r.ei.speed, 2)} km/s` : '---'}</dd>
          <dt>{t('end.dv')}</dt>
          <dd>{formatNumber(s.propulsion.orionDvUsed * 1000, 1)} m/s</dd>
        </dl>
        {ok && <p className="end-note">{t('end.note')}</p>}
        <div className="end-actions">
          <button className="tb-btn on" onClick={showIntro}>
            {t('end.restart')}
          </button>
          <button className="tb-btn" onClick={onCredits}>
            {t('vw.credits')}
          </button>
        </div>
      </div>
    </div>
  );
}
