import { chooseLanguage } from './store';

/** Primer menú: idioma de la interfaz y de la simulación. El inglés es el predeterminado. */
export function LanguageScreen(): JSX.Element {
  return (
    <div className="modal intro">
      <div className="modal-card intro-card lang-card">
        <h2>ARTEMIS II SIMULATOR</h2>
        <h3>LANGUAGE · IDIOMA</h3>
        <div className="lang-buttons">
          <button className="guide-btn lang-btn" onClick={() => chooseLanguage('en')}>
            <span className="guide-n">EN</span>
            ENGLISH
          </button>
          <button className="guide-btn lang-btn" onClick={() => chooseLanguage('es')}>
            <span className="guide-n">ES</span>
            ESPAÑOL
          </button>
        </div>
        <p className="dim intro-foot">
          EN: Educational project, not affiliated with or endorsed by NASA. Figures come from a simplified physics model: they are illustrative, not official mission data.
        </p>
        <p className="dim intro-foot">
          ES: Proyecto educativo, no afiliado ni avalado por NASA. Las cifras salen de un modelo físico simplificado: son ilustrativas, no datos oficiales de la misión.
        </p>
      </div>
    </div>
  );
}
