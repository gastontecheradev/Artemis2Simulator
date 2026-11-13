/**
 * Convierte los originales de NASA de assets-src/ a versiones livianas en
 * public/assets/nasa/. Es idempotente: se puede volver a correr sin duplicar nada.
 *
 * - earth-* y moon-*: texturas equirectangulares → 2048×1024 (2D) y 4096×2048 (3D),
 *   en WebP con fallback JPG.
 * - El resto: fotos → 1200 px de ancho, WebP y JPG.
 *
 * El nombre base de salida es el del original, que tiene que coincidir con su fila
 * en ASSETS.md.
 *
 * Uso: npm run images
 */
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SRC = fileURLToPath(new URL('../assets-src/', import.meta.url));
const OUT = fileURLToPath(new URL('../public/assets/nasa/', import.meta.url));
const INPUT = new Set(['.tif', '.tiff', '.png', '.jpg', '.jpeg', '.webp']);

if (!existsSync(SRC)) {
  console.log('No existe assets-src/: no hay originales para procesar.');
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });

const isFresh = (out: string, src: string): boolean => existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs;

async function emit(src: string, name: string, width: number, height?: number): Promise<void> {
  for (const format of ['webp', 'jpg'] as const) {
    const out = join(OUT, `${name}.${format}`);
    if (isFresh(out, src)) {
      console.log(`  = ${name}.${format} (al día)`);
      continue;
    }
    const img = sharp(src, { limitInputPixels: false }).resize(width, height, { fit: height ? 'fill' : 'inside', withoutEnlargement: true });
    await (format === 'webp' ? img.webp({ quality: 82 }) : img.jpeg({ quality: 84, mozjpeg: true })).toFile(out);
    console.log(`  + ${name}.${format}`);
  }
}

const files = readdirSync(SRC).filter((f) => INPUT.has(extname(f).toLowerCase()));
if (files.length === 0) console.log('assets-src/ está vacío.');
for (const file of files) {
  const src = join(SRC, file);
  const base = basename(file, extname(file));
  console.log(file);
  if (/^(earth|moon)-/.test(base)) {
    await emit(src, `${base}-2k`, 2048, 1024);
    await emit(src, `${base}-4k`, 4096, 2048);
  } else {
    await emit(src, base, 1200);
  }
}
