import { reset, setWarp, togglePlay } from '../../sim/commands';
import { WARP_LEVELS } from '../../sim/constants';
import { MISSION_PARAMS } from '../../sim/mission/params';
import { SimState } from '../../sim/state';
import { act } from '../store';

/** Controles de tiempo: play/pausa, velocidad de simulación y reinicio. */
export function TimeControls({ s }: { s: SimState }): JSX.Element {
  return (
    <section className="time-controls">
      <span className="tc-title">TIEMPO</span>
      <button className={s.clock.running ? 'tc-play on' : 'tc-play'} onClick={() => act(togglePlay)} disabled={!!s.outcome} title={s.clock.running ? 'Pausa' : 'Play'}>
        {s.clock.running ? '❚❚ PAUSA' : '▶ PLAY'}
      </button>
      <div className="tc-warp">
        {WARP_LEVELS.map((w) => (
          <button key={w} className={s.clock.warp === w ? 'tc-btn on' : 'tc-btn'} onClick={() => act((x) => setWarp(x, w))}>
            ×{w}
          </button>
        ))}
      </div>
      <button className="tc-btn tc-reset" onClick={() => act(() => reset(MISSION_PARAMS))} title="Volver a E3">
        REINICIAR
      </button>
    </section>
  );
}
