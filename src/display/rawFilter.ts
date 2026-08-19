import { normalizeHex } from './hex';

export function toRawHex(hex: string | undefined): string {
  return normalizeHex(hex);
}
