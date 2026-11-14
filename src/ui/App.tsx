import { useEffect, useRef, useState } from 'react';
import { ackAlarms, setRhc, setThc, setWarp, togglePlay } from '../sim/commands';
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
import { act, setCamera, setTour, useIntro, useSim, useTour } from './store';
import { Tour } from './tutorial/Tour';

/** Anchos mínimos del panel para mostrar dos o tres Display Units (la cabina real tiene tres). */
const TWO_DU_MIN_WIDTH = 860;
const THREE_DU_MIN_WIDTH = 1280;

/** Atajos de teclado. Todos pasan por los mismos comandos que los controles del panel. */
function useKeyboard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const typing = (e: KeyboardEvent): boolean => {
      const target = e.target as HTMLElement | null;
      return e.ctrlKey || e.metaKey || e.altKey || !!(target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    };
    // Flechas: controladores manuales, activos mientras la tecla está apretada.
    const hold = (e: KeyboardEvent, on: boolean): boolean => {
      if (e.key === 'ArrowLeft') act((s) => setRhc(s, on ? 1 : 0));
      else if (e.key === 'ArrowRight') act((s) => setRhc(s, on ? -1 : 0));
      else if (e.key === 'ArrowUp') act((s) => setThc(s, on ? 1 : 0));
      else if (e.key === 'ArrowDown') act((s) => setThc(s, on ? -1 : 0));
      else return false;
      e.preventDefault();
      return true;
    };
    const onDown = (e: KeyboardEvent): void => {
      if (typing(e)) return;
      if (hold(e, true) || e.repeat) return;
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
      else if (/^[1-5]$/.test(e.key)) setCamera('2d', CAMERA_MODES[Number(e.key) - 1].id);
    };
    const onUp = (e: KeyboardEvent): void => {
      if (!typing(e)) hold(e, false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [enabled]);
}

export function App(): JSX.Element {
  const s = useSim();
  const intro = useIntro();
  const tour = useTour();
  const panelRef = useRef<HTMLElement>(null);
  const [units, setUnits] = useState(1);
  const [credits, setCredits] = useState(false);
  useKeyboard(!intro && !credits);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setUnits(el.clientWidth >= THREE_DU_MIN_WIDTH ? 3 : el.clientWidth >= TWO_DU_MIN_WIDTH ? 2 : 1),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app">
      <aside className="panel" ref={panelRef}>
        <StatusBar s={s} />
        <div className="du-row">
          <DisplayUnit s={s} initial={['TRAJ', 'PROCS']} />
          {units >= 2 && <DisplayUnit s={s} initial={['PFD', 'PROP']} />}
          {units >= 3 && <DisplayUnit s={s} initial={['TL', 'COMM']} />}
        </div>
        <SwitchPanel s={s} />
        <div className="bottom-row">
          <TimeControls s={s} />
          <EventLog s={s} />
        </div>
      </aside>
      <main className="view">
        <TrajectoryView onCredits={() => setCredits(true)} onTutorial={() => setTour(0)} />
        {s.outcome && !intro && <EndScreen s={s} onCredits={() => setCredits(true)} />}
      </main>
      {intro && <StartScreen onCredits={() => setCredits(true)} />}
      {tour !== null && !intro && <Tour s={s} index={tour} />}
      {credits && <Credits onClose={() => setCredits(false)} />}
    </div>
  );
}
