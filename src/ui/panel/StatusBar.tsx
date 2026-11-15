import { ackAlarms, selectProcedure } from '../../sim/commands';
import { formatDuration, formatMet } from '../../sim/format';
import { phaseLabel } from '../../sim/mission/phases';
import { nextEvent } from '../../sim/mission/timeline';
import { ProcedureId, SimState } from '../../sim/state';
import { useT } from '../i18n';
import { act } from '../store';

/** Procedimiento que atiende cada alarma, si hay uno. */
function procedureFor(alarmId: string, s: SimState): ProcedureId | null {
  if (alarmId.startsWith('missed:')) return alarmId.slice(7) as ProcedureId;
  if (alarmId === 'cm-sep') return 'SEP_CM';
  if (alarmId === 'corridor') return s.phase === 'TRANSITO_IDA' ? 'E10' : 'E12';
  if (alarmId === 'no-return' || alarmId === 'reentry' || alarmId === 'moon-impact') return 'MAN';
  return null;
}

/** Día de vuelo (FD01 el día del lanzamiento), como en el cronograma de NASA. */
const flightDay = (t: number): number => Math.max(1, Math.floor(t / 86400) + 1);

/** Barra de estado: MET, fase, COMM, velocidad de simulación, próximo evento y Master Alarm. */
export function StatusBar({ s }: { s: SimState }): JSX.Element {
  const t = useT();
  const comm = s.comms.los ? 'LOS' : s.comms.network;
  const pending = s.alarms.filter((a) => !a.acked);
  const level = pending.some((a) => a.level === 'WARNING') ? 'warning' : pending.length > 0 ? 'caution' : 'off';
  const run = s.outcome ? t('st.run.end') : s.clock.running ? t('st.run.run') : t('st.run.pause');
  const next = nextEvent(s);
  return (
    <header className="status" data-tour="status">
      <div className="status-row">
        <div className="st-cell">
          <span className="st-label">MET · {t('st.fd')}{String(flightDay(s.t)).padStart(2, '0')}</span>
          <span className="st-value">{formatMet(s.t)}</span>
        </div>
        <div className="st-cell">
          <span className="st-label">{t('st.phase')}</span>
          <span className="st-value">{phaseLabel(s.phase)}</span>
        </div>
        <div className="st-cell">
          <span className="st-label">COMM</span>
          <span className={`st-value comm-${comm.toLowerCase()}`}>{comm}</span>
        </div>
        <div className="st-cell">
          <span className="st-label">SIM</span>
          <span className={s.clock.running ? 'st-value' : 'st-value dim'}>
            ×{s.clock.warp} {run}
          </span>
        </div>
        {next && (
          <div className="st-cell">
            <span className="st-label">
              {t('st.next')} · {next.id} {next.short}
            </span>
            <span className="st-value cmd">T−{formatDuration(next.t - s.t)}</span>
          </div>
        )}
        <button className={`master-alarm ${level}`} onClick={() => act(ackAlarms)} title={t('st.masterAlarm')} aria-label="Master Alarm">
          <span className="ma-warning">WARNING</span>
          <span className="ma-caution">CAUTION</span>
        </button>
      </div>
      {s.alarms.length > 0 && (
        <div className="annunciator">
          {s.alarms.map((a) => {
            const cls = `ann ${a.level.toLowerCase()}${a.acked ? ' acked' : ''}`;
            const proc = procedureFor(a.id, s);
            // Como en la cabina real, la alarma lleva al procedimiento que la atiende.
            return proc ? (
              <button key={a.id} className={`${cls} link`} title={t('st.openProc')} onClick={() => act((x) => selectProcedure(x, proc))}>
                {a.text} ▸
              </button>
            ) : (
              <span key={a.id} className={cls}>
                {a.text}
              </span>
            );
          })}
        </div>
      )}
    </header>
  );
}
