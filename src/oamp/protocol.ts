import { concat, getBytes, hexlify, zeroPadValue, toBeArray } from "ethers";
import { MessageType, CryptoScheme, OAMPMessage, EncryptionContext } from "./types";

const MAGIC = new Uint8Array([0x4f, 0x41, 0x4d, 0x50]); // "OAMP"
const VERSION = 1;

export const BLACK_HOLE = "0x0000000000000000000000000000000000000000";

function toBeArray8(value: bigint | number): Uint8Array {
  return getBytes(zeroPadValue(toBeArray(value), 8));
}

/**
 * Returns the 64-byte OAMP AAD (Additional Authenticated Data) for a message.
 * Binds the ciphertext to its transaction context to prevent replay attacks.
 *
 * AAD Structure (64 Bytes):
 * | Offset | Length | Name     | Description                          |
 * |--------|--------|----------|--------------------------------------|
 * | 0      | 4      | MAGIC    | "OAMP" (0x4f414d50)                  |
 * | 4      | 1      | VERSION  | Current version (1)                  |
 * | 5      | 1      | TYPE     | MessageType (0=BCAST, 1=PERS, 2=P2P) |
 * | 6      | 1      | CRYPTO   | CryptoScheme (0=NONE, 1=AES_GCM)     |
 * | 7      | 1      | RESERVED | Alignment padding (0x00)             |
 * | 8      | 8      | chainId  | Big-Endian uint64                    |
 * | 16     | 8      | txNonce  | Big-Endian uint64                    |
 * | 24     | 20     | sender   | Ethereum Address (20 bytes)          |
 * | 44     | 20     | recipient| Ethereum Address (20 bytes)          |
 */
export function getMessageHeader(
  type: MessageType,
  crypto: CryptoScheme,
  context?: EncryptionContext
): Uint8Array {
  const header = getBytes(concat([MAGIC, new Uint8Array([VERSION, type, crypto, 0x00])]));
  if (!context) {
    return header;
  }

  return concat([
    header,
    toBeArray8(context.chainId),
    toBeArray8(context.txNonce),
    getBytes(context.sender),
    getBytes(context.recipient),
  ]);
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
  recipient: string,
  chainId?: bigint,
  txNonce?: number
): OAMPMessage | null {
  try {
    const bytes = getBytes(data);

    // Magic (4) + version + type + crypto + reserved (4) + nonce (12)
    if (bytes.length < 20) return null;
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
    // In V1 original it was slice(7, 19) because header was 7 bytes.
    // Now we added 1 reserved byte to make header 8 bytes for alignment.
    // So nonce starts at 8.
    const nonce = bytes.slice(8, 20);
    const payload = bytes.slice(20);

    return {
      type: type as MessageType,
      crypto: crypto as CryptoScheme,
      nonce,
      payload,
      sender,
      recipient,
      chainId,
      txNonce
    };
  } catch (e) {
    return null;
  }
}
