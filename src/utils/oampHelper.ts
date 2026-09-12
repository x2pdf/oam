import { hexlify, toUtf8String } from 'ethers';
import { deserializeMessage } from '../oamp/protocol';
import { payloadDecode, payloadEncode, ContentItem } from '../mypayload';
import { CryptoScheme } from '../oamp/types';
import { InputDataItem } from '../types';

/**
 * Checks if the hex string is an OAMP message.
 * OAMP magic bytes: 0x4f414d50 ("OAMP")
 */
export function isOAMP(hex: string | undefined): boolean {
  if (typeof hex !== 'string' || !hex || hex === '0x') return false;
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  // "OAMP" in hex is 4f414d50
  return cleanHex.toLowerCase().startsWith('4f414d50');
}

/**
 * Parses OAMP content from raw hex input.
 * Handles unencrypted messages (CryptoScheme.NONE).
 * `sender` / `recipient` are required so TYPE routing invariants can be checked.
 * Returns null if parsing fails, message is encrypted, or not OAMP.
 */
export function parseOAMPContent(hex: string | undefined, sender: string, recipient: string): ContentItem[] | null {
  if (!isOAMP(hex)) return null;

  try {
    const msg = deserializeMessage(hex!, sender, recipient);
    if (!msg) return null;

    // If it's unencrypted, we can decode the payload directly
    if (msg.crypto === CryptoScheme.NONE) {
      const items = payloadDecode(msg.payload);
      return items.length > 0 ? items : null;
    }

    // Encrypted messages are handled by the display pipeline (decrypt / OAMP_ENCRYPTED).
    return null;
  } catch (e) {
    console.warn('Failed to parse OAMP content:', e);
    return null;
  }
}

/**
 * Extract OAMP payload for the detail-page carrier view (UTF-8 when possible).
 * Encrypted-but-decrypted items use re-encoded profile HTML from oampItems.
 */
export function getOampPayloadUtf8(item: InputDataItem): string | null {
  const hex = item.rawInput || item.description;
  if (!isOAMP(hex)) return null;

  const sender = item.from || item.address || '';
  const recipient = item.to || '';
  const chainId = item.chainId != null ? BigInt(item.chainId) : undefined;
  const msg = deserializeMessage(hex!, sender, recipient, chainId, item.txNonce);
  if (!msg) return null;

  if (msg.crypto === CryptoScheme.AES_256_GCM) {
    if (Array.isArray(item.oampItems) && item.oampItems.length > 0) {
      return toUtf8String(payloadEncode(item.oampItems));
    }
    return hexlify(msg.payload);
  }

  try {
    return toUtf8String(msg.payload);
  } catch {
    return hexlify(msg.payload);
  }
}
