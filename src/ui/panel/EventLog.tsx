import { useEffect, useRef } from 'react';
import { formatMet } from '../../sim/format';
import { SimState } from '../../sim/state';

/** Log de eventos con timestamp en MET. Sigue al último evento salvo que se haya subido a mano. */
export function EventLog({ s }: { s: SimState }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const count = s.log.length;

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [count]);

  return (
    <section className="event-log">
      <span className="log-title">LOG DE EVENTOS</span>
      <div
        className="log-list"
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {s.log.map((l, i) => (
          <div key={i} className={`log-line ${l.level.toLowerCase()}`}>
            <span className="log-t">{formatMet(l.t)}</span>
            <span className="log-x">{l.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
