import { concat, getBytes, hexlify, zeroPadValue, toBeArray, getAddress } from "ethers";
import { MessageType, CryptoScheme, OAMPMessage, EncryptionContext } from "./types";

const MAGIC = new Uint8Array([0x4f, 0x41, 0x4d, 0x50]); // "OAMP"
const VERSION = 1;
const RESERVED_V1 = 0x00;
const HEADER_LENGTH = 8;
const NONCE_LENGTH = 12;
const MIN_ENVELOPE_LENGTH = HEADER_LENGTH + NONCE_LENGTH; // 20
const AES_GCM_TAG_BYTES = 16;

export const BLACK_HOLE = "0x0000000000000000000000000000000000000000";

function toBeArray8(value: bigint | number): Uint8Array {
  return getBytes(zeroPadValue(toBeArray(value), 8));
}

function canonicalAddress(addr: string): string | null {
  try {
    return getAddress(addr);
  } catch {
    return null;
  }
}

/**
 * TYPE is a claim about routing; tx.from / tx.to are authoritative.
 * Mismatched labels are rejected at deserialize.
 *
 * | TYPE + CRYPTO        | Routing invariant                          |
 * |----------------------|--------------------------------------------|
 * | BROADCAST + NONE     | recipient == 0x0                           |
 * | PERSONAL + AES-GCM   | sender == recipient                        |
 * | P2P + *              | recipient != 0x0 (A→A plaintext is P2P)    |
 */
function isValidRouting(type: number, sender: string, recipient: string): boolean {
  const to = canonicalAddress(recipient);
  if (to == null) return false;

  const zero = getAddress(BLACK_HOLE);

  if (type === MessageType.BROADCAST) {
    return to === zero;
  }
  if (type === MessageType.PERSONAL) {
    const from = canonicalAddress(sender);
    return from != null && from === to;
  }
  if (type === MessageType.P2P) {
    return to !== zero;
  }
  return false;
}

/**
 * Envelope header (8 bytes) or 64-byte AES-GCM AAD.
 *
 * Without `context`: wire header only.
 * With `context`: v1 AAD (header || chainId || txNonce || sender || recipient).
 * Header-only AAD is not part of v1.
 *
 * AAD Structure (64 Bytes):
 * | Offset | Length | Name      | Description                          |
 * |--------|--------|-----------|--------------------------------------|
 * | 0      | 4      | MAGIC     | "OAMP" (0x4f414d50)                  |
 * | 4      | 1      | VERSION   | Current version (1)                  |
 * | 5      | 1      | TYPE      | MessageType (0=BCAST, 1=PERS, 2=P2P) |
 * | 6      | 1      | CRYPTO    | CryptoScheme (0=NONE, 1=AES_GCM)     |
 * | 7      | 1      | RESERVED  | v1 MUST be 0x00                      |
 * | 8      | 8      | chainId   | Big-Endian uint64                    |
 * | 16     | 8      | txNonce   | Big-Endian uint64                    |
 * | 24     | 20     | sender    | Ethereum address (20 raw bytes)      |
 * | 44     | 20     | recipient | Ethereum address (20 raw bytes)      |
 */
export function getMessageHeader(
  type: MessageType,
  crypto: CryptoScheme,
  context?: EncryptionContext
): Uint8Array {
  const header = getBytes(concat([MAGIC, new Uint8Array([VERSION, type, crypto, RESERVED_V1])]));
  if (!context) {
    return header;
  }

  // ethers v6 concat() returns a hex string, not Uint8Array. WebCrypto AAD
  // must be a BufferSource; callers historically trusted this return type.
  return getBytes(concat([
    header,
    toBeArray8(context.chainId),
    toBeArray8(context.txNonce),
    getBytes(context.sender),
    getBytes(context.recipient),
  ]));
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
  if (nonce.length !== NONCE_LENGTH) {
    throw new Error(`NONCE must be ${NONCE_LENGTH} bytes, got ${nonce.length}`);
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

    if (bytes.length < MIN_ENVELOPE_LENGTH) return null;
    for (let i = 0; i < 4; i++) {
      if (bytes[i] !== MAGIC[i]) return null;
    }

    const version = bytes[4];
    // Unknown versions MUST be discarded; do not interpret the rest of the envelope.
    if (version !== VERSION) return null;

    // v1 RESERVED MUST be 0x00. Using this byte requires a VERSION bump.
    if (bytes[7] !== RESERVED_V1) return null;

    const type = bytes[5];
    const crypto = bytes[6];

    if (!(type in MessageType)) return null;
    if (!(crypto in CryptoScheme)) return null;

    if (!isValidCombination(type, crypto)) return null;

    if (!isValidRouting(type, sender, recipient)) return null;

    const nonce = bytes.slice(HEADER_LENGTH, MIN_ENVELOPE_LENGTH);
    const payload = bytes.slice(MIN_ENVELOPE_LENGTH);

    if (crypto === CryptoScheme.AES_256_GCM && payload.length < AES_GCM_TAG_BYTES) {
      return null;
    }

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
