import { ackAlarms } from '../../sim/commands';
import { formatDuration, formatMet } from '../../sim/format';
import { PHASE_LABEL } from '../../sim/mission/phases';
import { nextEvent } from '../../sim/mission/timeline';
import { SimState } from '../../sim/state';
import { act } from '../store';

/** Barra de estado: MET, fase, COMM, velocidad de simulación y Master Alarm. */
export function StatusBar({ s }: { s: SimState }): JSX.Element {
  const comm = s.comms.los ? 'LOS' : s.comms.network;
  const pending = s.alarms.filter((a) => !a.acked);
  const level = pending.some((a) => a.level === 'WARNING') ? 'warning' : pending.length > 0 ? 'caution' : 'off';
  const run = s.outcome ? 'FIN' : s.clock.running ? 'RUN' : 'PAUSA';
  const next = nextEvent(s);
  return (
    <header className="status">
      <div className="status-row">
        <div className="st-cell">
          <span className="st-label">MET</span>
          <span className="st-value">{formatMet(s.t)}</span>
        </div>
        <div className="st-cell">
          <span className="st-label">FASE</span>
          <span className="st-value">{PHASE_LABEL[s.phase]}</span>
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
            <span className="st-label">PRÓX · {next.id} {next.short}</span>
            <span className="st-value cmd">T−{formatDuration(next.t - s.t)}</span>
          </div>
        )}
        <button
          className={`master-alarm ${level}`}
          onClick={() => act(ackAlarms)}
          title="Master Alarm: clic para reconocer"
          aria-label="Master Alarm"
        >
          <span className="ma-warning">WARNING</span>
          <span className="ma-caution">CAUTION</span>
        </button>
      </div>
      {s.alarms.length > 0 && (
        <div className="annunciator">
          {s.alarms.map((a) => (
            <span key={a.id} className={`ann ${a.level.toLowerCase()}${a.acked ? ' acked' : ''}`}>
              {a.text}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
