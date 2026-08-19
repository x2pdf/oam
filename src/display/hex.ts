/**
 * Parse hex calldata into bytes. Returns null for non-string, odd length, or invalid hex.
 */
export function parseHexToBytes(hex: string | undefined): Uint8Array | null {
  if (typeof hex !== 'string' || !hex || hex === '0x' || hex === '0X') return null;
  const clean = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (!clean || clean.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(clean)) return null;

  try {
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
    }
    return bytes;
  } catch {
    return null;
  }
}

export function normalizeHex(hex: string | undefined): string {
  if (typeof hex !== 'string' || !hex) return '';
  if (hex.startsWith('0x') || hex.startsWith('0X')) return '0x' + hex.slice(2);
  return '0x' + hex;
}
