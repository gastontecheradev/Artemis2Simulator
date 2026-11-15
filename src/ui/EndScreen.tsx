import { SimState } from '../sim/state';
import { useT } from './i18n';
import { showIntro } from './store';

/**
 * Cartel de fin de misión: verde si terminó con éxito (E15), rojo con cualquiera de los
 * otros finales que decide la física. Va sobre las vistas sin taparlas, así se sigue
 * viendo la trayectoria completa.
 */
export function EndScreen({ s, onCredits }: { s: SimState; onCredits: () => void }): JSX.Element | null {
  const t = useT();
  const o = s.outcome;
  if (!o) return null;
  const ok = o.kind === 'success';
  return (
    <div className="end-banner-wrap">
      <div className={ok ? 'end-banner ok' : 'end-banner fail'} role="status">
        <h1>{ok ? t('end.success') : t('end.failure')}</h1>
        <span className="end-banner-kind">{t(`end.t.${o.kind}`)}</span>
        <p>{o.text}</p>
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
