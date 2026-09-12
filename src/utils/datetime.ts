import { TFunction } from 'i18next';
import { InputDataItem } from '../types';

export function formatDisplayDateTime(timestamp: number, weekdayLabel: string): string {
  if (timestamp <= 0) return '';
  const date = new Date(timestamp * 1000);
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const D = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s} ${weekdayLabel}`;
}

export function getDisplayTime(item: InputDataItem, t: TFunction): string {
  if (item.timestamp > 0) {
    const weekdayShort = t('datetime.weekdayShort', { returnObjects: true }) as string[];
    const weekday = weekdayShort[new Date(item.timestamp * 1000).getDay()];
    const formatted = formatDisplayDateTime(item.timestamp, weekday);
    if (formatted) return formatted;
  }
  return item.lastActive;
}
