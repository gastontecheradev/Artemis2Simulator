import { fireCmSeparation, fireEngine, fireIcpsSeparation, setDapMode, setRhc, setSwitch, setThc } from '../../sim/commands';
import { DapMode, SimState, SwitchName } from '../../sim/state';
import { T, useT } from '../i18n';
import { act } from '../store';

type Led = 'off' | 'armed' | 'active' | 'done';

/** Toggle seen from the front, like the switches on Orion's F1–F4 panels. */
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
  t: T;
  label: string;
  /** `data-press` prefix of the guard and the toggle (the tutorial points at them). */
  press: string;
  armed: boolean;
  led: Led;
  /** Text under the LED: actual status of the system. */
  state: string;
  disabled?: boolean;
  onArm: (armed: boolean) => void;
  onFire: () => void;
}

/**
 * Critical switch with a yellow-and-black striped guard. Two-step flow:
 * raise the guard (ARM) and then actuate (FIRE). Lowering the guard disarms.
 */
function GuardedSwitch({ t, label, press, armed, led, state, disabled, onArm, onFire }: GuardedProps): JSX.Element {
  return (
    <div className={`sw guarded${armed ? ' armed' : ''}${disabled ? ' disabled' : ''}`}>
      <span className="sw-label">
        {label}
        <i className={`led ${led}`} />
      </span>
      <div className="guard-frame">
        <button className="guard" data-press={`${press}-guard`} disabled={disabled} onClick={() => onArm(!armed)} title={armed ? t('sw.lower') : t('sw.lift')}>
          {armed ? t('sw.guardUp') : t('sw.guardDown')}
        </button>
        <button className="fire" data-press={`${press}-lever`} disabled={disabled || !armed} onClick={onFire} title={t('sw.actuate')}>
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

/** Button that acts while held down: that is how the hand controllers work. */
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

/** Switch and controller panel. All of them trigger real simulation commands. */
export function SwitchPanel({ s }: { s: SimState }): JSX.Element {
  const t = useT();
  const sw = s.switches;
  const set = (name: SwitchName) => (value: boolean) => act((x) => setSwitch(x, name, value));
  const over = !!s.outcome;
  const engine = (system: 'MAIN' | 'AUX'): { led: Led; state: string } => {
    const armed = system === 'MAIN' ? sw.mainArm : sw.auxArm;
    const committed = Object.values(s.maneuvers).some((m) => m.system === system && m.status === 'committed');
    if (s.vehicle.cmSeparated) return { led: 'off', state: t('sw.separated') };
    if (s.burn?.system === system) return { led: 'active', state: t('sw.firing') };
    if (committed) return { led: 'active', state: t('sw.atTig') };
    return armed ? { led: 'armed', state: t('sw.armed') } : { led: 'off', state: t('sw.safe') };
  };
  const canTranslate = s.vehicle.icpsSeparated;
  const main = engine('MAIN');
  const aux = engine('AUX');
  const sepState = (done: boolean, armed: boolean): string => (done ? t('sw.separated') : armed ? t('sw.armed') : t('sw.attached'));
  return (
    <section className="switch-panel" data-tour="switches">
      <Plate id="F1" title={t('sw.F1')}>
        <GuardedSwitch t={t} label="MAIN ENG" press="main" armed={sw.mainArm} led={main.led} state={main.state} disabled={over || s.vehicle.cmSeparated} onArm={set('mainArm')} onFire={() => act((x) => fireEngine(x, 'MAIN'))} />
        <GuardedSwitch t={t} label="AUX THR" press="aux" armed={sw.auxArm} led={aux.led} state={aux.state} disabled={over || s.vehicle.cmSeparated} onArm={set('auxArm')} onFire={() => act((x) => fireEngine(x, 'AUX'))} />
      </Plate>
      <Plate id="F2" title={t('sw.F2')}>
        <GuardedSwitch
          t={t}
          label="ICPS SEP"
          press="icps"
          armed={sw.icpsSepArm}
          led={s.vehicle.icpsSeparated ? 'done' : sw.icpsSepArm ? 'armed' : 'off'}
          state={sepState(s.vehicle.icpsSeparated, sw.icpsSepArm)}
          disabled={over || s.vehicle.icpsSeparated}
          onArm={set('icpsSepArm')}
          onFire={() => act(fireIcpsSeparation)}
        />
        <GuardedSwitch
          t={t}
          label="CM/SM SEP"
          press="cm"
          armed={sw.cmSepArm}
          led={s.vehicle.cmSeparated ? 'done' : sw.cmSepArm ? 'armed' : 'off'}
          state={sepState(s.vehicle.cmSeparated, sw.cmSepArm)}
          disabled={over || s.vehicle.cmSeparated}
          onArm={set('cmSepArm')}
          onFire={() => act(fireCmSeparation)}
        />
      </Plate>
      <Plate id="F3" title={t('sw.F3')}>
        <Toggle label={t('sw.crewAuto')} on={sw.autoCrew} onChange={set('autoCrew')} labels={[t('sw.auto'), t('sw.manual')]} />
        <Toggle label={t('sw.autoPause')} on={sw.autoPause} onChange={set('autoPause')} labels={[t('sw.on'), t('sw.off')]} />
      </Plate>
      <Plate id="F4" title={t('sw.F4')}>
        <div className="fc" data-tour="flight-controls">
          <div className="fc-block">
            <span className="sw-label">DAP</span>
            <div className="fc-row">
              {DAP_MODES.map((m) => (
                <button key={m} className={s.attitude.mode === m ? 'pb on' : 'pb'} disabled={over} onClick={() => act((x) => setDapMode(x, m))} title={t(`sw.dap.${m}`)}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="fc-block">
            <span className="sw-label">
              {t('sw.rhc')}
              <i className={`led ${s.attitude.rhc !== 0 ? 'active' : 'off'}`} />
            </span>
            <div className="fc-row">
              <HoldButton label="◄" title={t('sw.rhcCcw')} disabled={over || s.attitude.mode !== 'MAN'} onHold={(on) => act((x) => setRhc(x, on ? 1 : 0))} />
              <HoldButton label="►" title={t('sw.rhcCw')} disabled={over || s.attitude.mode !== 'MAN'} onHold={(on) => act((x) => setRhc(x, on ? -1 : 0))} />
            </div>
          </div>
          <div className="fc-block">
            <span className="sw-label">
              {t('sw.thc')}
              <i className={`led ${s.thc !== 0 ? 'active' : 'off'}`} />
            </span>
            <div className="fc-row">
              <HoldButton label="−X" title={t('sw.thcBack')} disabled={over || !canTranslate} onHold={(on) => act((x) => setThc(x, on ? -1 : 0))} />
              <HoldButton label="+X" title={t('sw.thcFwd')} disabled={over || !canTranslate} onHold={(on) => act((x) => setThc(x, on ? 1 : 0))} />
            </div>
          </div>
        </div>
      </Plate>
    </section>
  );
}
