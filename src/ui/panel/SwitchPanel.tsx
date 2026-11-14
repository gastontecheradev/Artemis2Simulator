import { fireCmSeparation, fireEngine, fireIcpsSeparation, setDapMode, setRhc, setSwitch, setThc } from '../../sim/commands';
import { DapMode, SimState, SwitchName } from '../../sim/state';
import { act } from '../store';

type Led = 'off' | 'armed' | 'active' | 'done';

/** Palanca vista de frente, como los interruptores de los paneles F1–F4 de 9.png. */
function Lever({ up }: { up: boolean }): JSX.Element {
  return (
    <svg className="lever" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="17" className="lever-base" />
      <circle cx="20" cy="20" r="11" className="lever-ring" />
      <path d={up ? 'M16 20 L17.5 7 H22.5 L24 20 Z' : 'M16 20 L17.5 33 H22.5 L24 20 Z'} className="lever-stem" />
      <circle cx="20" cy={up ? 8 : 32} r="5.5" className="lever-knob" />
    </svg>
  );
}

interface GuardedProps {
  label: string;
  armed: boolean;
  led: Led;
  /** Texto bajo el LED: estado real del sistema. */
  state: string;
  disabled?: boolean;
  onArm: (armed: boolean) => void;
  onFire: () => void;
}

/**
 * Interruptor crítico con guarda de franjas amarillas y negras. Flujo de dos pasos:
 * levantar la guarda (ARM) y después accionar (FIRE). Bajar la guarda desarma.
 */
function GuardedSwitch({ label, armed, led, state, disabled, onArm, onFire }: GuardedProps): JSX.Element {
  return (
    <div className={`sw guarded${armed ? ' armed' : ''}${disabled ? ' disabled' : ''}`}>
      <span className="sw-label">
        {label}
        <i className={`led ${led}`} />
      </span>
      <div className="guard-frame">
        <button className="guard" disabled={disabled} onClick={() => onArm(!armed)} title={armed ? 'Bajar la guarda (desarmar)' : 'Levantar la guarda (armar)'}>
          {armed ? 'GUARDA ▲' : 'GUARDA ▼'}
        </button>
        <button className="fire" disabled={disabled || !armed} onClick={onFire} title="Accionar">
          <Lever up={false} />
        </button>
      </div>
      <span className="sw-state">{state}</span>
    </div>
  );
}

function Toggle({ label, on, onChange, labels }: { label: string; on: boolean; onChange: (v: boolean) => void; labels: [string, string] }): JSX.Element {
  return (
    <div className="sw plain">
      <span className="sw-label">
        {label}
        <i className={`led ${on ? 'active' : 'off'}`} />
      </span>
      <button className="toggle" onClick={() => onChange(!on)} aria-pressed={on} title={label}>
        <Lever up={on} />
      </button>
      <span className="sw-state">{on ? labels[0] : labels[1]}</span>
    </div>
  );
}

function Plate({ id, title, children }: { id: string; title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="plate">
      <span className="plate-id">{id}</span>
      <span className="plate-title">{title}</span>
      <div className="plate-switches">{children}</div>
      <i className="screw tl" />
      <i className="screw tr" />
      <i className="screw bl" />
      <i className="screw br" />
    </div>
  );
}

const DAP_MODES: readonly DapMode[] = ['AUTO', 'INRTL', 'MAN'];
const DAP_HELP: Readonly<Record<DapMode, string>> = {
  AUTO: 'El guiado orienta la nave',
  INRTL: 'Mantiene la actitud inercial actual',
  MAN: 'La tripulación rota la nave con el RHC',
};

/** Botón que actúa mientras se mantiene apretado: así funcionan los controladores manuales. */
function HoldButton({ label, title, disabled, onHold }: { label: string; title: string; disabled: boolean; onHold: (on: boolean) => void }): JSX.Element {
  return (
    <button
      className="pb hold"
      title={title}
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onLostPointerCapture={() => onHold(false)}
    >
      {label}
    </button>
  );
}

/** Panel de interruptores y controladores. Todos accionan comandos reales de la simulación. */
export function SwitchPanel({ s }: { s: SimState }): JSX.Element {
  const sw = s.switches;
  const set = (name: SwitchName) => (value: boolean) => act((x) => setSwitch(x, name, value));
  const over = !!s.outcome;
  const engine = (system: 'MAIN' | 'AUX'): { led: Led; state: string } => {
    const armed = system === 'MAIN' ? sw.mainArm : sw.auxArm;
    const committed = Object.values(s.maneuvers).some((m) => m.system === system && m.status === 'committed');
    if (s.vehicle.cmSeparated) return { led: 'off', state: 'SEPARADO' };
    if (s.burn?.system === system) return { led: 'active', state: 'ENCENDIDO' };
    if (committed) return { led: 'active', state: 'EN TIG' };
    return armed ? { led: 'armed', state: 'ARMADO' } : { led: 'off', state: 'SEGURO' };
  };
  const canTranslate = s.vehicle.icpsSeparated && !s.vehicle.cmSeparated;
  const main = engine('MAIN');
  const aux = engine('AUX');
  return (
    <section className="switch-panel" data-tour="switches">
      <Plate id="F1" title="PROPULSIÓN">
        <GuardedSwitch label="MAIN ENG" armed={sw.mainArm} led={main.led} state={main.state} disabled={over || s.vehicle.cmSeparated} onArm={set('mainArm')} onFire={() => act((x) => fireEngine(x, 'MAIN'))} />
        <GuardedSwitch label="AUX THR" armed={sw.auxArm} led={aux.led} state={aux.state} disabled={over || s.vehicle.cmSeparated} onArm={set('auxArm')} onFire={() => act((x) => fireEngine(x, 'AUX'))} />
      </Plate>
      <Plate id="F2" title="SEPARACIÓN">
        <GuardedSwitch
          label="ICPS SEP"
          armed={sw.icpsSepArm}
          led={s.vehicle.icpsSeparated ? 'done' : sw.icpsSepArm ? 'armed' : 'off'}
          state={s.vehicle.icpsSeparated ? 'SEPARADO' : sw.icpsSepArm ? 'ARMADO' : 'ACOPLADO'}
          disabled={over || s.vehicle.icpsSeparated}
          onArm={set('icpsSepArm')}
          onFire={() => act(fireIcpsSeparation)}
        />
        <GuardedSwitch
          label="CM/SM SEP"
          armed={sw.cmSepArm}
          led={s.vehicle.cmSeparated ? 'done' : sw.cmSepArm ? 'armed' : 'off'}
          state={s.vehicle.cmSeparated ? 'SEPARADO' : sw.cmSepArm ? 'ARMADO' : 'ACOPLADO'}
          disabled={over || s.vehicle.cmSeparated}
          onArm={set('cmSepArm')}
          onFire={() => act(fireCmSeparation)}
        />
      </Plate>
      <Plate id="F3" title="OPERACIÓN">
        <Toggle label="CREW AUTO" on={sw.autoCrew} onChange={set('autoCrew')} labels={['AUTO', 'MANUAL']} />
        <Toggle label="AUTO PAUSA" on={sw.autoPause} onChange={set('autoPause')} labels={['ON', 'OFF']} />
      </Plate>
      <Plate id="F4" title="CONTROL DE VUELO">
        <div className="fc" data-tour="flight-controls">
          <div className="fc-block">
            <span className="sw-label">DAP</span>
            <div className="fc-row">
              {DAP_MODES.map((m) => (
                <button key={m} className={s.attitude.mode === m ? 'pb on' : 'pb'} disabled={over} onClick={() => act((x) => setDapMode(x, m))} title={DAP_HELP[m]}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="fc-block">
            <span className="sw-label">
              RHC CABECEO
              <i className={`led ${s.attitude.rhc !== 0 ? 'active' : 'off'}`} />
            </span>
            <div className="fc-row">
              <HoldButton label="◄" title="Rotar en sentido antihorario (necesita DAP en MAN)" disabled={over || s.attitude.mode !== 'MAN'} onHold={(on) => act((x) => setRhc(x, on ? 1 : 0))} />
              <HoldButton label="►" title="Rotar en sentido horario (necesita DAP en MAN)" disabled={over || s.attitude.mode !== 'MAN'} onHold={(on) => act((x) => setRhc(x, on ? -1 : 0))} />
            </div>
          </div>
          <div className="fc-block">
            <span className="sw-label">
              THC EJE X
              <i className={`led ${s.thc !== 0 ? 'active' : 'off'}`} />
            </span>
            <div className="fc-row">
              <HoldButton label="−X" title="Traslación hacia atrás con el RCS" disabled={over || !canTranslate} onHold={(on) => act((x) => setThc(x, on ? -1 : 0))} />
              <HoldButton label="+X" title="Traslación hacia adelante con el RCS" disabled={over || !canTranslate} onHold={(on) => act((x) => setThc(x, on ? 1 : 0))} />
            </div>
          </div>
        </div>
      </Plate>
    </section>
  );
}
