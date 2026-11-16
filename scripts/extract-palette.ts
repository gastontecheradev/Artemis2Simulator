/**
 * Extracts the palette from the reference images (without inventing hex values).
 * For each color a region of an image is defined (in fractions of width/height)
 * and a criterion; the median of the pixels that best meet the criterion is taken.
 * The result replaces the marked block in src/ui/theme.css.
 *
 * Usage: npm run palette
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

type Rgb = [number, number, number];
type Criterion = 'median' | 'bright' | 'dark' | 'green' | 'red' | 'blue' | 'yellow' | 'magenta' | 'orange';

interface Swatch {
  name: string;
  image: string;
  /** x0, y0, x1, y1 in fractions of the image. */
  box: [number, number, number, number];
  pick: Criterion;
  /** Fraction of pixels that best meet the criterion (default 0.1). Thin text needs less. */
  top?: number;
  note: string;
}

const SWATCHES: Swatch[] = [
  // Physical panel (9.png)
  { name: 'panel', image: '9.png', box: [0.005, 0.2, 0.03, 0.27], pick: 'median', note: 'panel metal' },
  { name: 'bezel', image: '9.png', box: [0.205, 0.105, 0.232, 0.125], pick: 'median', note: 'display frame' },
  { name: 'key', image: '9.png', box: [0.203, 0.193, 0.218, 0.208], pick: 'bright', note: 'function key' },
  { name: 'switch-plate', image: '9.png', box: [0.012, 0.6, 0.02, 0.64], pick: 'dark', note: 'switch plate' },
  { name: 'title-bar', image: '9.png', box: [0.4, 0.434, 0.49, 0.448], pick: 'green', note: 'page title bar' },
  { name: 'hazard', image: '9.png', box: [0.595, 0.705, 0.642, 0.735], pick: 'yellow', note: 'guard stripes' },
  // Screen (10.png)
  { name: 'screen', image: '10.png', box: [0.55, 0.3, 0.8, 0.5], pick: 'median', note: 'screen background' },
  { name: 'value', image: '10.png', box: [0.5, 0.115, 0.6, 0.165], pick: 'green', top: 0.02, note: 'current values' },
  { name: 'label', image: '10.png', box: [0.43, 0.24, 0.475, 0.5], pick: 'bright', top: 0.02, note: 'labels and scales (speed tape)' },
  { name: 'caution', image: '10.png', box: [0.41, 0.27, 0.428, 0.55], pick: 'yellow', note: 'caution' },
  { name: 'warning', image: '10.png', box: [0.078, 0.56, 0.094, 0.77], pick: 'red', note: 'limits and alarms' },
  { name: 'command', image: '10.png', box: [0.29, 0.755, 0.33, 0.8], pick: 'magenta', top: 0.02, note: 'targets and commanded values' },
  // Trail by phase (1.png)
  { name: 'trail-out', image: '1.png', box: [0.08, 0.48, 0.3, 0.56], pick: 'green', note: 'orbit and outbound' },
  { name: 'trail-return', image: '1.png', box: [0.548, 0.6, 0.572, 0.64], pick: 'blue', top: 0.3, note: 'return (marker 12)' },
  { name: 'trail-prox', image: '1.png', box: [0.13, 0.4, 0.16, 0.45], pick: 'orange', note: 'proximity operations' },
  // Untextured bodies (1.png), until NASA textures are chosen
  { name: 'body-earth', image: '1.png', box: [0.12, 0.25, 0.2, 0.4], pick: 'blue', top: 0.3, note: "Earth's ocean" },
  { name: 'body-moon', image: '1.png', box: [0.705, 0.56, 0.74, 0.61], pick: 'median', note: "Moon's surface" },
  // Orion 3D model (4.png)
  { name: 'ship-hull', image: '4.png', box: [0.6, 0.38, 0.65, 0.43], pick: 'bright', top: 0.1, note: 'white hull' },
  { name: 'ship-dark', image: '4.png', box: [0.665, 0.755, 0.69, 0.785], pick: 'dark', top: 0.3, note: 'nozzle and heat shield' },
  { name: 'ship-solar', image: '4.png', box: [0.72, 0.55, 0.82, 0.67], pick: 'blue', top: 0.1, note: 'solar array cells' },
  { name: 'ship-core', image: '3.png', box: [0.3, 0.3, 0.42, 0.45], pick: 'orange', top: 0.05, note: 'rocket core stage' },
  // Trail by network (2.png)
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
const START = '/* palette:start (generated by scripts/extract-palette.ts, do not edit by hand) */';
const END = '/* palette:end */';
const css = readFileSync(themePath, 'utf8');
const a = css.indexOf(START);
const b = css.indexOf(END);
if (a < 0 || b < 0) throw new Error('theme.css no tiene los marcadores de paleta');
writeFileSync(themePath, `${css.slice(0, a)}${START}\n:root {\n${lines.join('\n')}\n}\n${css.slice(b)}`);
console.log('\nsrc/ui/theme.css actualizado.');
