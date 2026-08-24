import { concat, getBytes, hexlify } from "ethers";
import { MessageType, CryptoScheme, OAMPMessage } from "./types";

const MAGIC = new Uint8Array([0x4f, 0x41, 0x4d, 0x50]); // "OAMP"
const VERSION = 1;

export const BLACK_HOLE = "0x0000000000000000000000000000000000000000";

/**
 * Returns the 7-byte OAMP header for a message.
 * Used as AAD (Additional Authenticated Data) for AES-GCM.
 */
export function getMessageHeader(type: MessageType, crypto: CryptoScheme): Uint8Array {
  return getBytes(concat([MAGIC, new Uint8Array([VERSION, type, crypto])]));
}

/**
 * Valid (TYPE, CRYPTO) combination matrix.
 * Any combination not listed here is rejected during deserialization.
 *
 * | TYPE \ CRYPTO  | NONE (0) | AES_256_GCM (1) |
 * |----------------|----------|------------------|
 * | BROADCAST  (0) |   ✓      |       ✗          |
 * | PERSONAL   (1) |   ✗      |       ✓          |
 * | P2P        (2) |   ✓      |       ✓          |
 */
const VALID_COMBINATIONS = new Set<number>([
  (MessageType.BROADCAST << 8) | CryptoScheme.NONE,        // 0x0000 — public broadcast
  (MessageType.PERSONAL  << 8) | CryptoScheme.AES_256_GCM, // 0x0101 — encrypted personal note
  (MessageType.P2P       << 8) | CryptoScheme.NONE,        // 0x0200 — unencrypted P2P
  (MessageType.P2P       << 8) | CryptoScheme.AES_256_GCM, // 0x0201 — E2E encrypted P2P
]);

function isValidCombination(type: number, crypto: number): boolean {
  return VALID_COMBINATIONS.has((type << 8) | crypto);
}

export function serializeMessage(
  type: MessageType,
  crypto: CryptoScheme,
  nonce: Uint8Array,
  payload: Uint8Array
): string {
  if (!isValidCombination(type, crypto)) {
    throw new Error(`Invalid (TYPE, CRYPTO) combination: type=${type}, crypto=${crypto}`);
  }
  const header = getMessageHeader(type, crypto);
  const packet = concat([header, nonce, payload]);
  return hexlify(packet);
}

export function deserializeMessage(
  data: string,
  sender: string,
  recipient: string
): OAMPMessage | null {
  try {
    const bytes = getBytes(data);

    // Magic (4) + version + type + crypto (3) + nonce (12)
    if (bytes.length < 19) return null;
    for (let i = 0; i < 4; i++) {
      if (bytes[i] !== MAGIC[i]) return null;
    }

    const version = bytes[4];
    if (version !== VERSION) return null;

    const type = bytes[5];
    const crypto = bytes[6];

    // Validate enum ranges
    if (!(type in MessageType)) return null;
    if (!(crypto in CryptoScheme)) return null;

    // Validate (TYPE, CRYPTO) combination — reject semantically meaningless pairs
    if (!isValidCombination(type, crypto)) return null;

    // Assuming 12 bytes for NONCE (AES-GCM standard)
    const nonce = bytes.slice(7, 19);
    const payload = bytes.slice(19);

    return {
      type: type as MessageType,
      crypto: crypto as CryptoScheme,
      nonce,
      payload,
      sender,
      recipient
    };
  } catch (e) {
    return null;
  }
}
