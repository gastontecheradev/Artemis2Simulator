import { useState } from 'react';
import { FLYBY_ALTITUDE_TARGET } from '../sim/constants';
import { formatDuration, formatNumber } from '../sim/format';
import { MISSION_PARAMS } from '../sim/mission/params';
import { useT } from './i18n';
import { setIntro, startMission } from './store';

/** Pantalla de inicio: qué es, cómo se vuela y cómo empezar. */
export function StartScreen({ onCredits }: { onCredits: () => void }): JSX.Element {
  const t = useT();
  const [autoCrew, setAutoCrew] = useState(false);
  const n = MISSION_PARAMS.nominal;
  return (
    <div className="modal intro">
      <div className="modal-card intro-card">
        <h2>ARTEMIS II SIMULATOR</h2>
        <p>{t('start.intro')}</p>
        <dl className="end-stats">
          <dt>{t('start.flyby')}</dt>
          <dd>{formatNumber(FLYBY_ALTITUDE_TARGET)} km</dd>
          <dt>{t('start.duration')}</dt>
          <dd>{formatDuration(n.eiMet)}</dd>
        </dl>
        <h3>{t('start.how')}</h3>
        <ol className="intro-steps">
          <li>{t('start.step1')}</li>
          <li>{t('start.step2')}</li>
          <li>{t('start.step3')}</li>
        </ol>
        <label className="intro-check">
          <input type="checkbox" checked={autoCrew} onChange={(e) => setAutoCrew(e.target.checked)} />
          {t('start.demo')}
        </label>
        <div className="end-actions">
          <button className="tb-btn on" onClick={() => startMission({ autoCrew, tutorial: false })}>
            {t('start.go')}
          </button>
          <button className="tb-btn" onClick={() => startMission({ autoCrew: false, tutorial: true })}>
            {t('start.tutorial')}
          </button>
          <button className="tb-btn" onClick={() => setIntro('guides')}>
            {t('start.guides')}
          </button>
          <button className="tb-btn" onClick={onCredits}>
            {t('start.credits')}
          </button>
        </div>
        <p className="dim intro-foot">{t('start.foot')}</p>
      </div>
    </div>
  );
}
