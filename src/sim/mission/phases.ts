import { tr } from '../i18n';

/** Mission phases. The transitions are triggered by the physics (see advance.ts). */
export type Phase =
  | 'ASCENSO' // E1 → E3: powered flight of the rocket
  | 'INSERCION' // E3 → E4: insertion orbit with a low perigee
  | 'ORBITA_BAJA' // E4 → E5
  | 'ORBITA_ALTA' // E5 → E9: ~23.5 h checkout
  | 'TRANSITO_IDA' // E9 → lunar sphere of influence
  | 'SOBREVUELO' // inside the lunar sphere of influence
  | 'REGRESO' // exit from the sphere of influence → EI
  | 'ENTRADA'; // E14: end of the physics

/** Short label of each phase in the current language. */
export const phaseLabel = (p: Phase): string => tr(`phase.${p}`);

const ORDER: readonly Phase[] = [
  'ASCENSO',
  'INSERCION',
  'ORBITA_BAJA',
  'ORBITA_ALTA',
  'TRANSITO_IDA',
  'SOBREVUELO',
  'REGRESO',
  'ENTRADA',
];

export const phaseIndex = (p: Phase): number => ORDER.indexOf(p);
/** true if the TLI has already happened. */
export const isPostTli = (p: Phase): boolean => phaseIndex(p) >= phaseIndex('TRANSITO_IDA');
