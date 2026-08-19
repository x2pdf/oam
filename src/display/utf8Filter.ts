import { toUtf8String } from 'ethers';

/**
 * Strict UTF-8 decode. Invalid sequences or empty output → miss (null).
 */
export function tryDecodeUtf8(bytes: Uint8Array): string | null {
  if (!bytes.length) return null;

  try {
    if (typeof TextDecoder !== 'undefined') {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return text.length > 0 ? text : null;
    }
  } catch {
    // fatal TextDecoder unsupported or invalid UTF-8 — try ethers next
  }

  try {
    const text = toUtf8String(bytes);
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
