import { chooseLanguage } from './store';

/** Primer menú: idioma de la interfaz y de la simulación. El inglés es el predeterminado. */
export function LanguageScreen(): JSX.Element {
  return (
    <div className="modal intro">
      <div className="modal-card intro-card lang-card">
        <span className="end-kicker">ARTEMIS II</span>
        <h2>LANGUAGE · IDIOMA</h2>
        <div className="lang-buttons">
          <button className="guide-btn lang-btn on" onClick={() => chooseLanguage('en')} autoFocus>
            <span className="guide-n">EN</span>
            ENGLISH
            <small>Default</small>
          </button>
          <button className="guide-btn lang-btn" onClick={() => chooseLanguage('es')}>
            <span className="guide-n">ES</span>
            ESPAÑOL
            <small>Rioplatense</small>
          </button>
        </div>
        <p className="dim intro-foot">Educational project, not affiliated with or endorsed by NASA · Proyecto educativo, no afiliado ni avalado por NASA.</p>
      </div>
    </div>
  );
}
