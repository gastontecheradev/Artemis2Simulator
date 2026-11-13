import { reset } from '../sim/commands';
import { formatDuration, formatMet, formatNumber } from '../sim/format';
import { MISSION_PARAMS } from '../sim/mission/params';
import { OutcomeKind, SimState } from '../sim/state';
import { act } from './store';

const TITLE: Readonly<Record<OutcomeKind, string>> = {
  success: 'AMERIZAJE',
  'entry-shallow': 'ENTRADA FUERA DEL CORREDOR',
  'entry-steep': 'ENTRADA FUERA DEL CORREDOR',
  'entry-no-sep': 'ENTRADA SIN SEPARACIÓN',
  'reentry-early': 'REENTRADA PREMATURA',
  'moon-impact': 'IMPACTO LUNAR',
  lost: 'ÓRBITA PERDIDA',
};

/** Pantalla de fin de misión (E15 o cualquiera de los finales que decide la física). */
export function EndScreen({ s, onCredits }: { s: SimState; onCredits: () => void }): JSX.Element | null {
  const o = s.outcome;
  if (!o) return null;
  const ok = o.kind === 'success';
  const r = s.record;
  return (
    <div className="end-screen">
      <div className={ok ? 'end-card ok' : 'end-card fail'}>
        <span className="end-kicker">{ok ? 'E15 · FIN DE LA MISIÓN' : 'FIN DE LA MISIÓN'}</span>
        <h1>{TITLE[o.kind]}</h1>
        <p>{o.text}</p>
        {ok && (
          // La foto del amerizaje la elige Gastón en images.nasa.gov (ver ASSETS.md, pendientes).
          <div className="end-photo">FOTO DEL AMERIZAJE PENDIENTE · VER ASSETS.md</div>
        )}
        <dl className="end-stats">
          <dt>MET FINAL</dt>
          <dd>{formatMet(o.t)}</dd>
          <dt>DURACIÓN DESDE E3</dt>
          <dd>{formatDuration(o.t - s.params.insertion.met)}</dd>
          <dt>SOBREVUELO LUNAR</dt>
          <dd>{r.perilune ? `${formatNumber(r.perilune.altitude, 0)} km` : 'NO REALIZADO'}</dd>
          <dt>ÁNGULO EN EI</dt>
          <dd>{r.ei ? `${formatNumber(r.ei.fpaDeg, 2)}°` : '---'}</dd>
          <dt>VELOCIDAD EN EI</dt>
          <dd>{r.ei ? `${formatNumber(r.ei.speed, 2)} km/s` : '---'}</dd>
          <dt>ΔV DE ORION USADO</dt>
          <dd>{formatNumber(s.propulsion.orionDvUsed * 1000, 1)} m/s</dd>
        </dl>
        {ok && <p className="end-note">El descenso con paracaídas y el amerizaje no se simulan: la física termina en la interfaz de entrada.</p>}
        <div className="end-actions">
          <button className="tb-btn on" onClick={() => act(() => reset(MISSION_PARAMS))}>
            REINICIAR MISIÓN
          </button>
          <button className="tb-btn" onClick={onCredits}>
            CRÉDITOS
          </button>
        </div>
      </div>
    </div>
  );
}
