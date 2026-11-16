import { useEffect, useMemo, useRef } from 'react';
import { capcomFeed } from '../../sim/capcom';
import { formatMet } from '../../sim/format';
import { SimState } from '../../sim/state';
import { useT } from '../i18n';

/**
 * Mission control window: what Houston keeps telling the crew. The
 * messages are derived from the state (see sim/capcom.ts); during loss of signal the
 * window goes silent.
 */
export function Capcom({ s }: { s: SimState }): JSX.Element {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // Recomputed when something that can add messages changes: the log, the alarms or the time (in 10 s steps).
  const bucket = Math.floor(s.t / 10);
  const feed = useMemo(() => capcomFeed(s), [s.log.length, s.alarms, s.markers, bucket, s.prediction]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = feed.length;

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [count]);

  return (
    <section className="event-log mcc" data-tour="mcc">
      <span className="log-title">
        {t('mcc.title')} · HOUSTON
        {s.comms.los && <span className="mcc-los"> · {t('mcc.nolink')}</span>}
      </span>
      <div
        className="log-list"
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {feed.map((m, i) => (
          <div key={i} className={`log-line mcc-${m.kind}`}>
            <span className="log-t">{formatMet(m.t)}</span>
            <span className="log-x">{m.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
