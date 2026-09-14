import { TFunction } from 'i18next';

function formatDisplayDateTime(timestampMs: number, weekdayLabel: string): string {
  if (timestampMs <= 0) return '';
  const date = new Date(timestampMs);
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const D = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s} ${weekdayLabel}`;
}

export function getArListDisplayTime(timestampMs: number, t: TFunction): string {
  if (timestampMs <= 0) return '';
  const weekdayShort = t('datetime.weekdayShort', { returnObjects: true }) as string[];
  const weekday = weekdayShort[new Date(timestampMs).getDay()];
  return formatDisplayDateTime(timestampMs, weekday);
}
