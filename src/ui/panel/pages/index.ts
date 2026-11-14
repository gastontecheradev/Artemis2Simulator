import { FC } from 'react';
import { SimState } from '../../../sim/state';
import { CommSum } from './CommSum';
import { FlightTraj } from './FlightTraj';
import { Pfd } from './Pfd';
import { Procs, procsActions } from './Procs';
import { PropSys } from './PropSys';
import { Timeline } from './Timeline';

export type PageId = 'TRAJ' | 'PFD' | 'PROCS' | 'PROP' | 'COMM' | 'TL';

/** Acción de una tecla lateral del Display Unit. */
export interface SoftAction {
  readonly side: 'L' | 'R';
  /** Posición de la tecla, de arriba (0) a abajo (4). */
  readonly slot: number;
  readonly label: string;
  readonly run: () => void;
  readonly lit?: boolean;
  readonly disabled?: boolean;
  readonly tone?: 'command';
}

export interface PageDef {
  /** Título con formato Sistema.Página, como en 9.png. */
  readonly title: string;
  /** Etiqueta corta del menú. */
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
