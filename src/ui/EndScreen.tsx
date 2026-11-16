import { formatMet } from '../sim/format';
import { SimState } from '../sim/state';
import { useT } from './i18n';
import { showIntro } from './store';

/**
 * Cartel de fin de misión, con el estilo de una Display Unit del panel (9.png): bisel
 * metálico, pantalla negra, barra de título y un anunciador iluminado en verde si
 * terminó con éxito (E15) o en rojo con cualquiera de los otros finales que decide la
 * física. Va sobre las vistas sin oscurecerlas, así se sigue viendo la trayectoria.
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
