import { useLocale, useT } from '../i18n';
import { GuideId, setGuide, setIntro, useGuide } from '../store';
import { guideContent } from './content';

export const GUIDE_IDS: readonly GuideId[] = ['objective', 'stages', 'budget', 'power', 'ship', 'docs'];

/** Guide viewer (modal). Opened from the start menu or from the GUIDES button. */
export function GuideViewer(): JSX.Element | null {
  const id = useGuide();
  const locale = useLocale();
  const t = useT();
  if (!id) return null;
  const g = guideContent(id, locale);
  const i = GUIDE_IDS.indexOf(id);
  return (
    <div className="modal guide" onClick={() => setGuide(null)}>
      <div className="modal-card guide-card" onClick={(e) => e.stopPropagation()}>
        <span className="end-kicker">{t('gd.title')}</span>
        <h2>{g.title}</h2>
        {g.sections.map((sec) => (
          <section key={sec.title} className="guide-section">
            <h3>{sec.title}</h3>
            {sec.paragraphs?.map((p) => <p key={p}>{p}</p>)}
            {sec.bullets && (
              <ul>
                {sec.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            {sec.table && (
              <table className="guide-table">
                <thead>
                  <tr>
                    {sec.table.head.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.table.rows.map((r, k) => (
                    <tr key={k}>
                      {r.map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {sec.links && (
              <ul className="guide-links">
                {sec.links.map((k) => (
                  <li key={k.url}>
                    <a href={k.url} target="_blank" rel="noreferrer">
                      {k.label} ↗
                    </a>
                    <span className="dim">{k.desc}</span>
                  </li>
                ))}
              </ul>
            )}
            {sec.note && <p className="dim">{sec.note}</p>}
          </section>
        ))}
        <div className="end-actions">
          <button className="tb-btn" disabled={i <= 0} onClick={() => setGuide(GUIDE_IDS[i - 1])}>
            ◄ {t(`gd.${GUIDE_IDS[Math.max(0, i - 1)]}`)}
          </button>
          <button className="tb-btn" disabled={i >= GUIDE_IDS.length - 1} onClick={() => setGuide(GUIDE_IDS[i + 1])}>
            {t(`gd.${GUIDE_IDS[Math.min(GUIDE_IDS.length - 1, i + 1)]}`)} ►
          </button>
          <button className="tb-btn on" onClick={() => setGuide(null)}>
            {t('gd.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Second start menu: pick a guide or continue to the start screen. */
export function GuidesMenu(): JSX.Element {
  const t = useT();
  return (
    <div className="modal intro">
      <div className="modal-card intro-card">
        <span className="end-kicker">ARTEMIS II</span>
        <h2>{t('gd.title')}</h2>
        <p>{t('gd.intro')}</p>
        <div className="guide-menu">
          {GUIDE_IDS.map((id, i) => (
            <button key={id} className="guide-btn" onClick={() => setGuide(id)}>
              <span className="guide-n">{i + 1}</span>
              {t(`gd.${id}`)}
            </button>
          ))}
        </div>
        <div className="end-actions">
          <button className="tb-btn on" onClick={() => setIntro('start')}>
            {t('gd.continue')} ►
          </button>
          <button className="tb-btn" onClick={() => setIntro('lang')}>
            ◄ {t('gd.back')}
          </button>
        </div>
      </div>
    </div>
  );
}
