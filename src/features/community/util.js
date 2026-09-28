// Formatting and media helpers shared across Community.

export function timeAgo(date) {
  if (!date) return '';
  const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d`;
  return new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Full phrase for sentences: "just now", "5 min ago", "3 hours ago", "on 3 Sep".
export function ago(date) {
  if (!date) return '';
  const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 45) return 'just now';
  const n = (v, unit) => `${v} ${unit}${v === 1 ? '' : 's'} ago`;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return n(Math.round(s / 3600), 'hour');
  if (s < 7 * 86400) return n(Math.round(s / 86400), 'day');
  return `on ${new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

// A trading day ("2026-09-25") as people say it: "Fri 25 Sep".
export function tradingDay(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function clock(date) {
  return new Date(date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(date) {
  const d = new Date(date);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export const price = (v, decimals = 4) => (v == null ? '–' : Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
export const signedPct = (v) => (v == null ? '–' : `${v > 0 ? '+' : ''}${v}%`);

// Resize to at most maxSide and re-encode as WebP (JPEG fallback) so uploads
// stay small; returns { dataUrl, width, height }. square: centre-crop first
// (profile photos).
export async function compressImage(file, { maxSide = 1600, quality = 0.82, square = false } = {}) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const src = square
    ? { x: (bitmap.width - side) / 2, y: (bitmap.height - side) / 2, w: side, h: side }
    : { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
  const scale = Math.min(1, maxSide / Math.max(src.w, src.h));
  const width = Math.round(src.w * scale);
  const height = Math.round(src.h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, src.x, src.y, src.w, src.h, 0, 0, width, height);
  let dataUrl = canvas.toDataURL('image/webp', quality);
  if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { dataUrl, width, height };
}

export const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

export const supportsVoice = () => typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia;

export const REACTIONS = ['👍', '❤️', '🔥', '😂', '🤔', '📈', '📉', '👏', '💪'];
