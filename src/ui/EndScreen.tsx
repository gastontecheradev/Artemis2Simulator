import { formatMet } from '../sim/format';
import { SimState } from '../sim/state';
import { useT } from './i18n';
import { showIntro } from './store';

/**
 * End-of-mission banner, styled like one of the panel's Display Units (after Orion's cockpit): metallic
 * bezel, black screen, title bar and an annunciator lit green if
 * it ended successfully (E15) or red for any of the other endings decided by the
 * physics. It sits over the views without darkening them, so the trajectory stays visible.
 */
export function EndScreen({ s, onCredits }: { s: SimState; onCredits: () => void }): JSX.Element | null {
  const t = useT();
  const o = s.outcome;
  if (!o) return null;
  const ok = o.kind === 'success';
  return (
    <div className="end-banner-wrap">
      <div className={ok ? 'end-banner ok' : 'end-banner fail'} role="status">
        <div className="end-banner-screen">
          <div className="end-banner-title">
            <span>{t('end.page')}</span>
            <span className="end-banner-met">M {formatMet(o.t)}</span>
          </div>
          <div className="end-banner-body">
            <div className="end-annunciator">{ok ? t('end.success') : t('end.failure')}</div>
            <span className="end-banner-kind">{t(`end.t.${o.kind}`)}</span>
            <p>{o.text}</p>
            <p className="end-banner-note">{t('end.note')}</p>
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
        <i className="screw tl" />
        <i className="screw tr" />
        <i className="screw bl" />
        <i className="screw br" />
      </div>
    </div>
  );
}
