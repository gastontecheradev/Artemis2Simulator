import { useState } from 'react';
import { formatMet } from '../../sim/format';
import { SimState } from '../../sim/state';
import { PAGES, PageId, SoftAction } from './pages';

const MENU: readonly PageId[] = ['TRAJ', 'PFD', 'PROCS', 'PROP', 'COMM', 'TL'];
const TOP_KEYS = 6;
const SIDE_KEYS = 5;

/** Bezel key. Without an action it is decorative: not a button and does not react to the mouse. */
function Key({ action, label, press }: { action?: () => void; label?: string; press?: string }): JSX.Element {
  return action ? (
    <button className="softkey" onClick={action} aria-label={label} title={label} data-press={press} />
  ) : (
    <span className="softkey inert" />
  );
}

function SideKeys({ actions, side }: { actions: readonly SoftAction[]; side: 'L' | 'R' }): JSX.Element {
  return (
    <div className="du-keygroup">
      {Array.from({ length: SIDE_KEYS }, (_, i) => {
        const a = actions.find((x) => x.side === side && x.slot === i && !x.disabled);
        return <Key key={i} action={a?.run} label={a?.label.replace('\n', ' ')} press={a?.press} />;
      })}
    </div>
  );
}

/** On-screen labels of the actions, aligned with the side keys. */
function ActionLabels({ actions, side }: { actions: readonly SoftAction[]; side: 'L' | 'R' }): JSX.Element {
  return (
    <div className={`du-actions ${side === 'L' ? 'left' : 'right'}`}>
      {Array.from({ length: SIDE_KEYS }, (_, i) => {
        const a = actions.find((x) => x.side === side && x.slot === i);
        if (!a) return <span key={i} className="du-action empty" />;
        const cls = `du-action${a.lit ? ' lit' : ''}${a.disabled ? ' disabled' : ''}${a.tone === 'command' ? ' command' : ''}`;
        return (
          <span key={i} className={cls}>
            {a.label}
          </span>
        );
      })}
    </div>
  );
}

function Half({ s, page }: { s: SimState; page: PageId }): JSX.Element {
  const def = PAGES[page];
  const actions = def.actions(s);
  const hasLeft = actions.some((a) => a.side === 'L');
  const hasRight = actions.some((a) => a.side === 'R');
  return (
    <div className={`du-half${hasLeft ? ' with-left' : ''}${hasRight ? ' with-right' : ''}`}>
      {hasLeft && <ActionLabels actions={actions} side="L" />}
      <div className="du-body">
        <def.Body s={s} />
      </div>
      {hasRight && <ActionLabels actions={actions} side="R" />}
    </div>
  );
}

function Menu({ active, where }: { active: PageId; where: 'top' | 'bottom' }): JSX.Element {
  return (
    <div className={`du-menu ${where}`}>
      {Array.from({ length: TOP_KEYS }, (_, i) => {
        const id = MENU[i];
        return (
          <span key={i} className={id === active ? 'du-tab on' : 'du-tab'}>
            {id ? PAGES[id].menu : ''}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Display Unit: screen with bezel and soft keys (reference: Orion's cockpit displays). The screen is
 * split into an upper and a lower half, each with one page. The top keys
 * choose the upper page, the bottom ones the lower page, and the side ones run the
 * actions of each page.
 */
export function DisplayUnit({ s, initial }: { s: SimState; initial: [PageId, PageId] }): JSX.Element {
  const [upper, setUpper] = useState<PageId>(initial[0]);
  const [lower, setLower] = useState<PageId>(initial[1]);
  const upperActions = PAGES[upper].actions(s);
  const lowerActions = PAGES[lower].actions(s);

  const pageKeys = (set: (p: PageId) => void): JSX.Element[] =>
    Array.from({ length: TOP_KEYS }, (_, i) => {
      const id = MENU[i];
      return <Key key={i} action={id ? () => set(id) : undefined} label={id ? PAGES[id].title : undefined} />;
    });

  return (
    <section className="du" data-tour="du">
      <div className="du-keys top">{pageKeys(setUpper)}</div>
      <div className="du-keys left">
        <SideKeys actions={upperActions} side="L" />
        <SideKeys actions={lowerActions} side="L" />
      </div>
      <div className="du-screen">
        <Menu active={upper} where="top" />
        <Half s={s} page={upper} />
        <div className="du-titlebar">
          <span className="t-upper">{PAGES[upper].title}</span>
          <span className="t-clock">M {formatMet(s.t)}</span>
          <span className="t-lower">{PAGES[lower].title}</span>
        </div>
        <Half s={s} page={lower} />
        <Menu active={lower} where="bottom" />
      </div>
      <div className="du-keys right">
        <SideKeys actions={upperActions} side="R" />
        <SideKeys actions={lowerActions} side="R" />
      </div>
      <div className="du-keys bottom">{pageKeys(setLower)}</div>
    </section>
  );
}
