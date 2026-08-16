import { concat, getBytes, hexlify, dataSlice } from "ethers";
import { MessageType, CryptoScheme, OAMPMessage } from "./types";

const MAGIC = new Uint8Array([0x4f, 0x41, 0x4d, 0x50]); // "OAMP"
const VERSION = 1;

export const BLACK_HOLE = "0x0000000000000000000000000000000000000000";

export function serializeMessage(
  type: MessageType,
  crypto: CryptoScheme,
  nonce: Uint8Array,
  payload: Uint8Array
): string {
  const header = new Uint8Array([VERSION, type, crypto]);
  const packet = concat([MAGIC, header, nonce, payload]);
  return hexlify(packet);
}

export function deserializeMessage(
  data: string,
  sender: string,
  recipient: string
): OAMPMessage | null {
  try {
    const bytes = getBytes(data);

    // Check magic
    if (bytes.length < 4) return null;
    for (let i = 0; i < 4; i++) {
      if (bytes[i] !== MAGIC[i]) return null;
    }

    // Check version
    const version = bytes[4];
    if (version !== VERSION) return null;

    const type = bytes[5] as MessageType;
    const crypto = bytes[6] as CryptoScheme;

    // Assuming 12 bytes for NONCE (AES-GCM standard)
    const nonce = bytes.slice(7, 19);
    const payload = bytes.slice(19);

    return {
      type,
      crypto,
      nonce,
      payload,
      sender,
      recipient
    };
  } catch (e) {
    return null;
  }
}
