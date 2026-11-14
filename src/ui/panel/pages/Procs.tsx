import {
  adjustDv,
  computeCorrection,
  confirmDv,
  cycleProcedure,
  jumpStep,
  skipStep,
  toggleAdvanced,
  toggleManualSystem,
} from '../../../sim/commands';
import { formatDuration, formatMet, formatNumber } from '../../../sim/format';
import { activeManeuverId, currentStepIndex, procedureView } from '../../../sim/mission/procedures';
import { ManeuverStatus, SimState } from '../../../sim/state';
import { act } from '../../store';
import type { SoftAction } from './index';

const STATUS_LABEL: Readonly<Record<ManeuverStatus, string>> = {
  pending: 'PENDIENTE',
  committed: 'COMPROMETIDO',
  burning: 'MOTOR ENCENDIDO',
  done: 'EJECUTADO',
  missed: 'VENTANA PERDIDA',
};

/** Teclas laterales de Procs: selección de procedimiento, pasos y Δv planeado. */
export function procsActions(s: SimState): SoftAction[] {
  const id = activeManeuverId(s);
  const m = id ? s.maneuvers[id] : null;
  const editable = !!m && s.proc.advanced && m.status === 'pending';
  const actions: SoftAction[] = [
    { side: 'L', slot: 0, label: 'PROC\n▲', run: () => act((x) => cycleProcedure(x, -1)) },
    { side: 'L', slot: 1, label: 'PROC\n▼', run: () => act((x) => cycleProcedure(x, 1)) },
    { side: 'L', slot: 2, label: 'ADV', run: () => act(toggleAdvanced), lit: s.proc.advanced },
    { side: 'R', slot: 0, label: 'SKIP', run: () => act(skipStep) },
    { side: 'R', slot: 1, label: 'JUMP\nSTEP', run: () => act(jumpStep) },
  ];
  if (m) {
    actions.push(
      { side: 'L', slot: 3, label: 'ΔV +1', run: () => act((x) => adjustDv(x, 0.001)), disabled: !editable, tone: 'command' },
      { side: 'L', slot: 4, label: 'ΔV −1', run: () => act((x) => adjustDv(x, -0.001)), disabled: !editable, tone: 'command' },
      { side: 'R', slot: 4, label: 'CONF\nΔV', run: () => act(confirmDv), disabled: m.confirmed || m.status === 'done', lit: m.confirmed, tone: 'command' },
    );
    if (id === 'E10' || id === 'E12') {
      actions.push({ side: 'R', slot: 3, label: 'CALC', run: () => act(computeCorrection), lit: m.computed });
    }
    if (id === 'MAN') {
      actions.push({ side: 'R', slot: 3, label: `SYS\n${m.system}`, run: () => act(toggleManualSystem) });
    }
  }
  return actions;
}

/** Procs: visor de procedimientos (inspirado en 11.png). Es la interfaz de comandos. */
export function Procs({ s }: { s: SimState }): JSX.Element {
  const view = procedureView(s, s.proc.activeId);
  const current = currentStepIndex(s, view);
  const id = activeManeuverId(s);
  const m = id ? s.maneuvers[id] : null;
  const toTig = m && m.tig !== null ? m.tig - s.t : null;
  return (
    <div className="page procs">
      <div className="proc-head">
        <span className="proc-code">{view.code}</span>
        <span className="proc-title">
          {view.title}
          {view.optional ? ' (OPCIONAL)' : ''}
        </span>
      </div>
      <ol className="proc-steps">
        {view.steps.map((step, i) => {
          const skipped = !step.done && s.proc.skipped.includes(`${view.id}:${i}`);
          const cls = `step${i === current ? ' current' : ''}${step.done ? ' done' : ''}${skipped ? ' skipped' : ''}`;
          return (
            <li key={i} className={cls}>
              <span className="tick">{step.done ? '✓' : skipped ? '–' : ''}</span>
              <span className="n">{i + 1}</span>
              <span className="txt">{step.text}</span>
              <span className="kind">{step.kind}</span>
            </li>
          );
        })}
      </ol>
      {m && (
        <div className="proc-foot">
          <span>
            <span className="lbl">ΔV </span>
            <span className="cmd">
              {formatNumber(m.dv[m.axis] * 1000, 1)} m/s {m.axis === 'radial' ? 'RAD' : 'PRO'}
            </span>
          </span>
          <span>
            <span className="lbl">SYS </span>
            <span className="val">{m.system}</span>
          </span>
          {m.tig !== null && toTig !== null && (
            <span>
              <span className="lbl">TIG </span>
              <span className="val">{formatMet(m.tig)}</span>
              <span className={toTig >= 0 ? 'val' : 'warn'}>
                {' '}
                T{toTig >= 0 ? '−' : '+'}
                {formatDuration(Math.abs(toTig))}
              </span>
            </span>
          )}
          <span className={m.status === 'missed' ? 'alarm' : m.status === 'committed' || m.status === 'burning' ? 'cmd' : 'val'}>{STATUS_LABEL[m.status]}</span>
          {s.proc.advanced && <span className="cmd">ADV</span>}
        </div>
      )}
    </div>
  );
}
