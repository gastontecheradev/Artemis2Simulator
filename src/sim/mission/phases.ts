/** Fases de la misión. Las transiciones las dispara la física (ver advance.ts). */
export type Phase =
  | 'ASCENSO' // E1 → E3: vuelo propulsado del cohete
  | 'INSERCION' // E3 → E4: órbita de inserción con perigeo bajo
  | 'ORBITA_BAJA' // E4 → E5
  | 'ORBITA_ALTA' // E5 → E9: chequeo de ~23,5 h
  | 'TRANSITO_IDA' // E9 → esfera de influencia lunar
  | 'SOBREVUELO' // dentro de la esfera de influencia lunar
  | 'REGRESO' // salida de la esfera de influencia → EI
  | 'ENTRADA'; // E14: fin de la física

export const PHASE_LABEL: Readonly<Record<Phase, string>> = {
  ASCENSO: 'ASCENSO',
  INSERCION: 'INSERCIÓN',
  ORBITA_BAJA: 'ÓRB BAJA',
  ORBITA_ALTA: 'ÓRB ALTA',
  TRANSITO_IDA: 'TRÁNSITO',
  SOBREVUELO: 'SOBREVUELO',
  REGRESO: 'REGRESO',
  ENTRADA: 'ENTRADA',
};

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
/** true si ya ocurrió el TLI. */
export const isPostTli = (p: Phase): boolean => phaseIndex(p) >= phaseIndex('TRANSITO_IDA');
