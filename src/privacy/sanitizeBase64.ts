import { stripLocationMetadata, detectMediaFormat, LocationStripError } from './stripLocation';

export { LocationStripError };

const CHUNK = 0x8000;

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Removes location metadata from a base64 file. Throws LocationStripError when
 * the file cannot be cleaned and verified; callers must then refuse the file.
 */
export function stripLocationFromBase64(base64: string): { base64: string; sizeBytes: number; changed: boolean } {
  let head: Uint8Array;
  try {
    head = base64ToBytes(base64.slice(0, 96));
  } catch {
    throw new LocationStripError('invalid base64');
  }
  if (detectMediaFormat(head) === 'other') {
    return { base64, sizeBytes: Math.floor((base64.replace(/=+$/, '').length * 3) / 4), changed: false };
  }
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(base64);
  } catch {
    throw new LocationStripError('invalid base64');
  }
  const result = stripLocationMetadata(bytes);
  if (!result.changed) return { base64, sizeBytes: bytes.length, changed: false };
  return { base64: bytesToBase64(result.bytes), sizeBytes: result.bytes.length, changed: true };
}
