import { formatMet } from '../../../sim/format';
import { nextEvent, timelineStatus } from '../../../sim/mission/timeline';
import { SimState } from '../../../sim/state';

const WHO = { AUTO: 'AUTO', CREW: 'CREW', NONE: '' } as const;

/**
 * Mission.Tl: los 15 eventos de la misión (numeración de 1.png) con su estado y su MET
 * real, predicho o planificado. El próximo evento va resaltado en magenta.
 */
export function Timeline({ s }: { s: SimState }): JSX.Element {
  const rows = timelineStatus(s);
  const next = nextEvent(s);
  return (
    <div className="page tl">
      <div className="tl-list">
        {rows.map((r) => (
          <div key={r.id} className={`tl-row${r.done ? ' done' : ''}${next?.id === r.id ? ' next' : ''}`}>
            <span className="tick">{r.done ? '✓' : ''}</span>
            <span className="tl-n">{r.n}</span>
            <span className="tl-name">{r.short}</span>
            <span className="tl-who">{WHO[r.responsible]}</span>
            <span className={r.predicted ? 'tl-t pred' : 'tl-t'}>
              {r.time === null ? '---/--:--:--' : formatMet(r.time)}
              {r.predicted ? ' P' : r.done ? '  ' : ' N'}
            </span>
          </div>
        ))}
      </div>
      <div className="tl-foot">
        <span>✓ REAL</span>
        <span>P PREDICHO</span>
        <span>N NOMINAL</span>
      </div>
    </div>
  );
}
