const pad = (n: number, w: number): string => String(n).padStart(w, '0');

/** MET en formato DDD/HH:MM:SS (como el reloj de 9.png, pero con tiempo de misión). */
export function formatMet(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${pad(d, 3)}/${pad(h, 2)}:${pad(m, 2)}:${pad(s % 60, 2)}`;
}

/** Duración corta: 1d 02:03:04 o 02:03:04. */
export function formatDuration(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const hms = `${pad(h, 2)}:${pad(m, 2)}:${pad(s % 60, 2)}`;
  return d > 0 ? `${d}d ${hms}` : hms;
}

/** Número con separador de miles "." y decimales "," (estilo español). */
export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '---';
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '-' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}

/** Δv en m/s con signo. */
export const formatDvMs = (kms: number): string => {
  const ms = kms * 1000;
  return `${ms >= 0 ? '+' : '-'}${formatNumber(Math.abs(ms), 1)}`;
};
