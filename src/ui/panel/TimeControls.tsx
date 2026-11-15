import { setWarp, togglePlay } from '../../sim/commands';
import { WARP_LEVELS } from '../../sim/constants';
import { SimState } from '../../sim/state';
import { useT } from '../i18n';
import { act, showIntro } from '../store';

/** Controles de tiempo: play/pausa, velocidad de simulación y reinicio. */
export function TimeControls({ s }: { s: SimState }): JSX.Element {
  const t = useT();
  return (
    <section className="time-controls" data-tour="time">
      <span className="tc-title">{t('tc.title')}</span>
      <button
        className={s.clock.running ? 'tc-play on' : 'tc-play'}
        data-press="play"
        onClick={() => act(togglePlay)}
        disabled={!!s.outcome}
        title={s.clock.running ? t('tc.pauseTitle') : t('tc.playTitle')}
      >
        {s.clock.running ? t('tc.pause') : t('tc.play')}
      </button>
      <div className="tc-warp">
        {WARP_LEVELS.map((w) => (
          <button key={w} className={s.clock.warp === w ? 'tc-btn on' : 'tc-btn'} data-press={`warp-${w}`} onClick={() => act((x) => setWarp(x, w))}>
            ×{w}
          </button>
        ))}
      </div>
      <button className="tc-btn tc-reset" onClick={showIntro} title={t('tc.resetTitle')}>
        {t('tc.reset')}
      </button>
    </section>
  );
}
