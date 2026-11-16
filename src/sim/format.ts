import { getLocale } from './i18n';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

/** MET in DDD/HH:MM:SS format (like the clock in 9.png, but with mission time). Before liftoff, signed: -000/00:00:06. */
export function formatMet(t: number): string {
  const neg = t < 0;
  const s = Math.floor(Math.abs(neg ? Math.ceil(t) : t));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${neg ? '-' : ''}${pad(d, 3)}/${pad(h, 2)}:${pad(m, 2)}:${pad(s % 60, 2)}`;
}

/** Short duration: 1d 02:03:04 or 02:03:04. */
export function formatDuration(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const hms = `${pad(h, 2)}:${pad(m, 2)}:${pad(s % 60, 2)}`;
  return d > 0 ? `${d}d ${hms}` : hms;
}

/** Number with the current language's separators: "1.234,5" in Spanish, "1,234.5" in English. */
export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '---';
  const es = getLocale() === 'es';
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, es ? '.' : ',');
  return `${value < 0 ? '-' : ''}${grouped}${frac ? `${es ? ',' : '.'}${frac}` : ''}`;
}

/** Signed Δv in m/s. */
export const formatDvMs = (kms: number): string => {
  const ms = kms * 1000;
  return `${ms >= 0 ? '+' : '-'}${formatNumber(Math.abs(ms), 1)}`;
};
