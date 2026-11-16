import { FC } from 'react';
import { SimState } from '../../../sim/state';
import { CommSum } from './CommSum';
import { FlightTraj } from './FlightTraj';
import { Pfd } from './Pfd';
import { Procs, procsActions } from './Procs';
import { PropSys } from './PropSys';
import { Timeline } from './Timeline';

export type PageId = 'TRAJ' | 'PFD' | 'PROCS' | 'PROP' | 'COMM' | 'TL';

/** Action of a Display Unit side key. */
export interface SoftAction {
  readonly side: 'L' | 'R';
  /** Key position, from top (0) to bottom (4). */
  readonly slot: number;
  readonly label: string;
  readonly run: () => void;
  readonly lit?: boolean;
  readonly disabled?: boolean;
  readonly tone?: 'command';
  /** `data-press` value of the key: the tutorial points at it with the hand. */
  readonly press?: string;
}

export interface PageDef {
  /** Title in System.Page format, as in 9.png. */
  readonly title: string;
  /** Short menu label. */
  readonly menu: string;
  readonly Body: FC<{ s: SimState }>;
  readonly actions: (s: SimState) => SoftAction[];
}

const none = (): SoftAction[] => [];

export const PAGES: Readonly<Record<PageId, PageDef>> = {
  TRAJ: { title: 'Flight.Traj', menu: 'TRAJ', Body: FlightTraj, actions: none },
  PFD: { title: 'Flight.PFD', menu: 'PFD', Body: Pfd, actions: none },
  PROCS: { title: 'Procs', menu: 'PROCS', Body: Procs, actions: procsActions },
  PROP: { title: 'Prop.Sys', menu: 'PROP', Body: PropSys, actions: none },
  COMM: { title: 'Comm.Sum', menu: 'COMM', Body: CommSum, actions: none },
  TL: { title: 'Mission.Tl', menu: 'TL', Body: Timeline, actions: none },
};
