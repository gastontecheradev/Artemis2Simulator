/**
 * Extrae la paleta de las imágenes de referencia (sin inventar hex).
 * Para cada color se define una región de una imagen (en fracciones del ancho/alto)
 * y un criterio; se toma la mediana de los píxeles que mejor cumplen el criterio.
 * El resultado reemplaza el bloque marcado en src/ui/theme.css.
 *
 * Uso: npm run palette
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

type Rgb = [number, number, number];
type Criterion = 'median' | 'bright' | 'dark' | 'green' | 'red' | 'blue' | 'yellow' | 'magenta' | 'orange';

interface Swatch {
  name: string;
  image: string;
  /** x0, y0, x1, y1 en fracciones de la imagen. */
  box: [number, number, number, number];
  pick: Criterion;
  /** Fracción de píxeles que mejor cumplen el criterio (por defecto 0,1). El texto fino necesita menos. */
  top?: number;
  note: string;
}

const SWATCHES: Swatch[] = [
  // Panel físico (9.png)
  { name: 'panel', image: '9.png', box: [0.005, 0.2, 0.03, 0.27], pick: 'median', note: 'metal del panel' },
  { name: 'bezel', image: '9.png', box: [0.205, 0.105, 0.232, 0.125], pick: 'median', note: 'marco del display' },
  { name: 'key', image: '9.png', box: [0.203, 0.193, 0.218, 0.208], pick: 'bright', note: 'tecla de función' },
  { name: 'switch-plate', image: '9.png', box: [0.012, 0.6, 0.02, 0.64], pick: 'dark', note: 'placa de interruptores' },
  { name: 'title-bar', image: '9.png', box: [0.4, 0.434, 0.49, 0.448], pick: 'green', note: 'barra de título de página' },
  { name: 'hazard', image: '9.png', box: [0.595, 0.705, 0.642, 0.735], pick: 'yellow', note: 'franjas de la guarda' },
  // Pantalla (10.png)
  { name: 'screen', image: '10.png', box: [0.55, 0.3, 0.8, 0.5], pick: 'median', note: 'fondo de pantalla' },
  { name: 'value', image: '10.png', box: [0.5, 0.115, 0.6, 0.165], pick: 'green', top: 0.02, note: 'valores actuales' },
  { name: 'label', image: '10.png', box: [0.43, 0.24, 0.475, 0.5], pick: 'bright', top: 0.02, note: 'etiquetas y escalas (cinta de velocidad)' },
  { name: 'caution', image: '10.png', box: [0.41, 0.27, 0.428, 0.55], pick: 'yellow', note: 'precaución' },
  { name: 'warning', image: '10.png', box: [0.078, 0.56, 0.094, 0.77], pick: 'red', note: 'límites y alarmas' },
  { name: 'command', image: '10.png', box: [0.29, 0.755, 0.33, 0.8], pick: 'magenta', top: 0.02, note: 'objetivos y valores comandados' },
  // Trazo por fase (1.png)
  { name: 'trail-out', image: '1.png', box: [0.08, 0.48, 0.3, 0.56], pick: 'green', note: 'órbita e ida' },
  { name: 'trail-return', image: '1.png', box: [0.548, 0.6, 0.572, 0.64], pick: 'blue', top: 0.3, note: 'regreso (marcador 12)' },
  { name: 'trail-prox', image: '1.png', box: [0.13, 0.4, 0.16, 0.45], pick: 'orange', note: 'operaciones de proximidad' },
  // Cuerpos sin textura (1.png), hasta que haya texturas de NASA elegidas
  { name: 'body-earth', image: '1.png', box: [0.12, 0.25, 0.2, 0.4], pick: 'blue', top: 0.3, note: 'océano de la Tierra' },
  { name: 'body-moon', image: '1.png', box: [0.705, 0.56, 0.74, 0.61], pick: 'median', note: 'superficie de la Luna' },
  // Modelo 3D de Orion (4.png)
  { name: 'ship-hull', image: '4.png', box: [0.6, 0.38, 0.65, 0.43], pick: 'bright', top: 0.1, note: 'casco blanco' },
  { name: 'ship-dark', image: '4.png', box: [0.665, 0.755, 0.69, 0.785], pick: 'dark', top: 0.3, note: 'tobera y escudo' },
  { name: 'ship-solar', image: '4.png', box: [0.72, 0.55, 0.82, 0.67], pick: 'blue', top: 0.1, note: 'celdas de los paneles solares' },
  { name: 'ship-core', image: '3.png', box: [0.3, 0.3, 0.42, 0.45], pick: 'orange', top: 0.05, note: 'etapa central del cohete' },
  // Trazo por red (2.png)
  { name: 'net-nsn', image: '2.png', box: [0.123, 0.585, 0.17, 0.655], pick: 'green', note: 'Near Space Network' },
  { name: 'net-dsn', image: '2.png', box: [0.43, 0.585, 0.478, 0.655], pick: 'red', note: 'Deep Space Network' },
];

const score: Record<Exclude<Criterion, 'median'>, (p: Rgb) => number> = {
  bright: ([r, g, b]) => r + g + b,
  dark: ([r, g, b]) => -(r + g + b),
  green: ([r, g, b]) => g - Math.max(r, b),
  red: ([r, g, b]) => r - Math.max(g, b),
  blue: ([r, g, b]) => b - Math.max(r, g),
  yellow: ([r, g, b]) => Math.min(r, g) - b,
  magenta: ([r, g, b]) => Math.min(r, b) - g,
  orange: ([r, g, b]) => r - b - Math.abs(g - (r + b) / 2),
};

const median = (values: number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function sample(s: Swatch): Promise<Rgb> {
  const file = fileURLToPath(new URL(`../docs/reference/${s.image}`, import.meta.url));
  const img = sharp(file).removeAlpha();
  const meta = await img.metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const left = Math.round(s.box[0] * W);
  const top = Math.round(s.box[1] * H);
  const width = Math.max(1, Math.round((s.box[2] - s.box[0]) * W));
  const height = Math.max(1, Math.round((s.box[3] - s.box[1]) * H));
  const { data } = await img.extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
  let pixels: Rgb[] = [];
  for (let i = 0; i + 2 < data.length; i += 3) pixels.push([data[i], data[i + 1], data[i + 2]]);
  if (s.pick !== 'median') {
    const f = score[s.pick];
    pixels.sort((a, b) => f(b) - f(a));
    pixels = pixels.slice(0, Math.max(1, Math.floor(pixels.length * (s.top ?? 0.1))));
  }
  return [median(pixels.map((p) => p[0])), median(pixels.map((p) => p[1])), median(pixels.map((p) => p[2]))];
}

const hex = (c: Rgb): string => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

const lines: string[] = [];
for (const s of SWATCHES) {
  const c = await sample(s);
  lines.push(`  --c-${s.name}: ${hex(c)}; /* ${s.note} · ${s.image} */`);
  console.log(`${s.name.padEnd(14)} ${hex(c)}  ${s.image}  ${s.note}`);
}

const themePath = fileURLToPath(new URL('../src/ui/theme.css', import.meta.url));
const START = '/* palette:start (generado por scripts/extract-palette.ts, no editar a mano) */';
const END = '/* palette:end */';
const css = readFileSync(themePath, 'utf8');
const a = css.indexOf(START);
const b = css.indexOf(END);
if (a < 0 || b < 0) throw new Error('theme.css no tiene los marcadores de paleta');
writeFileSync(themePath, `${css.slice(0, a)}${START}\n:root {\n${lines.join('\n')}\n}\n${css.slice(b)}`);
console.log('\nsrc/ui/theme.css actualizado.');
