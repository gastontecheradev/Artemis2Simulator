import { useEffect, useRef, useState } from 'react';
import { ackAlarms, setWarp, togglePlay } from '../sim/commands';
import { WARP_LEVELS } from '../sim/constants';
import { Credits } from './Credits';
import { EndScreen } from './EndScreen';
import { StartScreen } from './StartScreen';
import { CAMERA_MODES, TrajectoryView } from './TrajectoryView';
import { DisplayUnit } from './panel/DisplayUnit';
import { EventLog } from './panel/EventLog';
import { StatusBar } from './panel/StatusBar';
import { SwitchPanel } from './panel/SwitchPanel';
import { TimeControls } from './panel/TimeControls';
import { act, setViewSettings, useIntro, useSim } from './store';

/** Ancho mínimo del panel para mostrar dos Display Units lado a lado (como en 11.png). */
const TWO_DU_MIN_WIDTH = 900;

/** Atajos de teclado. Todos pasan por los mismos comandos que los controles del panel. */
function useKeyboard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const step = (dir: 1 | -1): void =>
        act((s) => {
          const i = WARP_LEVELS.indexOf(s.clock.warp as (typeof WARP_LEVELS)[number]);
          return setWarp(s, WARP_LEVELS[Math.max(0, Math.min(WARP_LEVELS.length - 1, i + dir))]);
        });
      if (e.code === 'Space') {
        // Evita que el espacio vuelva a accionar el último botón enfocado.
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        act(togglePlay);
      } else if (e.key === '+' || e.key === '=' || e.key === '.') step(1);
      else if (e.key === '-' || e.key === ',') step(-1);
      else if (e.key === 'a' || e.key === 'A') act(ackAlarms);
      else if (/^[1-5]$/.test(e.key)) setViewSettings({ cameraMode: CAMERA_MODES[Number(e.key) - 1].id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

export function App(): JSX.Element {
  const s = useSim();
  const intro = useIntro();
  const panelRef = useRef<HTMLElement>(null);
  const [twoUnits, setTwoUnits] = useState(false);
  const [credits, setCredits] = useState(false);
  useKeyboard(!intro && !credits);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setTwoUnits(el.clientWidth >= TWO_DU_MIN_WIDTH));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app">
      <aside className="panel" ref={panelRef}>
        <StatusBar s={s} />
        <div className="du-row">
          <DisplayUnit s={s} initial={['TRAJ', 'PROCS']} />
          {twoUnits && <DisplayUnit s={s} initial={['TL', 'PROP']} />}
        </div>
        <SwitchPanel s={s} />
        <div className="bottom-row">
          <TimeControls s={s} />
          <EventLog s={s} />
        </div>
      </aside>
      <main className="view">
        <TrajectoryView onCredits={() => setCredits(true)} />
        {s.outcome && !intro && <EndScreen s={s} onCredits={() => setCredits(true)} />}
      </main>
      {intro && <StartScreen onCredits={() => setCredits(true)} />}
      {credits && <Credits onClose={() => setCredits(false)} />}
    </div>
  );
}
