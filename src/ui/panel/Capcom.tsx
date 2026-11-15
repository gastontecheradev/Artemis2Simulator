import { useEffect, useMemo, useRef } from 'react';
import { capcomFeed } from '../../sim/capcom';
import { formatMet } from '../../sim/format';
import { SimState } from '../../sim/state';
import { useT } from '../i18n';

/**
 * Ventana de control de misión: lo que Houston le va diciendo a la tripulación. Los
 * mensajes se derivan del estado (ver sim/capcom.ts); durante la pérdida de señal la
 * ventana queda muda.
 */
export function Capcom({ s }: { s: SimState }): JSX.Element {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // Se recalcula cuando cambia algo que puede sumar mensajes: el log, las alarmas o el tiempo (a pasos de 10 s).
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
