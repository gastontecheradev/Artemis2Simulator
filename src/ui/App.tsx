import { useEffect, useRef, useState } from 'react';
import { Credits } from './Credits';
import { EndScreen } from './EndScreen';
import { TrajectoryView } from './TrajectoryView';
import { DisplayUnit } from './panel/DisplayUnit';
import { EventLog } from './panel/EventLog';
import { StatusBar } from './panel/StatusBar';
import { SwitchPanel } from './panel/SwitchPanel';
import { TimeControls } from './panel/TimeControls';
import { useSim } from './store';

/** Ancho mínimo del panel para mostrar dos Display Units lado a lado (como en 11.png). */
const TWO_DU_MIN_WIDTH = 900;

export function App(): JSX.Element {
  const s = useSim();
  const panelRef = useRef<HTMLElement>(null);
  const [twoUnits, setTwoUnits] = useState(false);
  const [credits, setCredits] = useState(false);

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
          {twoUnits && <DisplayUnit s={s} initial={['PROP', 'COMM']} />}
        </div>
        <SwitchPanel s={s} />
        <div className="bottom-row">
          <TimeControls s={s} />
          <EventLog s={s} />
        </div>
      </aside>
      <main className="view">
        <TrajectoryView onCredits={() => setCredits(true)} />
        {s.outcome && <EndScreen s={s} onCredits={() => setCredits(true)} />}
      </main>
      {credits && <Credits onClose={() => setCredits(false)} />}
    </div>
  );
}
