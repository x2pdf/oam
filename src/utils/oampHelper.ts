import { deserializeMessage } from '../oamp/protocol';
import { payloadDecode, ContentItem } from '../mypayload';
import { CryptoScheme } from '../oamp/types';

/**
 * Checks if the hex string is an OAMP message.
 * OAMP magic bytes: 0x4f414d50 ("OAMP")
 */
export function isOAMP(hex: string | undefined): boolean {
  if (!hex || hex === '0x') return false;
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  // "OAMP" in hex is 4f414d50
  return cleanHex.toLowerCase().startsWith('4f414d50');
}

/**
 * Parses OAMP content from raw hex input.
 * Handles unencrypted messages (CryptoScheme.NONE).
 * Returns null if parsing fails, message is encrypted, or not OAMP.
 */
export function parseOAMPContent(hex: string | undefined, sender: string = '', recipient: string = ''): ContentItem[] | null {
  if (!isOAMP(hex)) return null;

  try {
    const msg = deserializeMessage(hex!, sender, recipient);
    if (!msg) return null;

    // If it's unencrypted, we can decode the payload directly
    if (msg.crypto === CryptoScheme.NONE) {
      return payloadDecode(msg.payload);
    }

    // For encrypted messages, we return null here.
    // They should be handled by the decryption flow (e.g. in HomeScreen's processOAMPItems)
    return null;
  } catch (e) {
    console.error('Failed to parse OAMP content:', e);
    return null;
  }
}
