import {
  Wallet,
  JsonRpcProvider,
  toUtf8Bytes,
  toUtf8String,
  dataSlice
} from "ethers";
import { MessageType, CryptoScheme, OAMPMessage, DecryptedMessage } from "./types";
import { serializeMessage, deserializeMessage, BLACK_HOLE } from "./protocol";
import {
  derivePersonalKey,
  deriveSharedSecret,
  encrypt,
  decrypt,
  generateNonce
} from "./crypto";

export class OAMPClient {
  private wallet: Wallet;
  private provider: JsonRpcProvider;

  constructor(privateKey: string, rpcUrl: string) {
    this.provider = new JsonRpcProvider(rpcUrl);
    this.wallet = new Wallet(privateKey, this.provider);
  }

  /**
   * Send a public broadcast message (A -> BLACK_HOLE)
   */
  async sendBroadcast(text: string): Promise<string> {
    const payload = toUtf8Bytes(text);
    const nonce = generateNonce();

    // Broadcast is usually unencrypted, but we follow the envelope
    const data = serializeMessage(
      MessageType.BROADCAST,
      CryptoScheme.NONE,
      nonce,
      payload
    );

    const tx = await this.wallet.sendTransaction({
      to: BLACK_HOLE,
      data: data
    });

    return tx.hash;
  }

  /**
   * Send an encrypted personal note (A -> A)
   */
  async sendPersonalNote(text: string): Promise<string> {
    const key = await derivePersonalKey(this.wallet);
    const nonce = generateNonce();
    const payload = toUtf8Bytes(text);

    const ciphertext = await encrypt(key, payload, nonce);

    const data = serializeMessage(
      MessageType.PERSONAL,
      CryptoScheme.AES_256_GCM,
      nonce,
      ciphertext
    );

    const tx = await this.wallet.sendTransaction({
      to: this.wallet.address,
      data: data
    });

    return tx.hash;
  }

  /**
   * Send an end-to-end encrypted message (A -> B)
   */
  async sendP2PMessage(recipientAddress: string, recipientPublicKey: string, text: string): Promise<string> {
    const sharedKey = deriveSharedSecret(this.wallet.privateKey, recipientPublicKey);
    const nonce = generateNonce();
    const payload = toUtf8Bytes(text);

    const ciphertext = await encrypt(sharedKey, payload, nonce);

    const data = serializeMessage(
      MessageType.P2P,
      CryptoScheme.AES_256_GCM,
      nonce,
      ciphertext
    );

    const tx = await this.wallet.sendTransaction({
      to: recipientAddress,
      data: data
    });

    return tx.hash;
  }

  /**
   * Decrypt a message if possible
   * @param msg The deserialized OAMP message
   * @param senderPublicKey Required for P2P messages to derive the shared secret
   */
  async decryptMessage(msg: OAMPMessage, senderPublicKey?: string): Promise<DecryptedMessage | null> {
    try {
      let decryptedPayload: Uint8Array;

      if (msg.crypto === CryptoScheme.NONE) {
        decryptedPayload = msg.payload;
      } else if (msg.type === MessageType.PERSONAL) {
        const key = await derivePersonalKey(this.wallet);
        decryptedPayload = await decrypt(key, msg.payload, msg.nonce);
      } else if (msg.type === MessageType.P2P) {
        if (!senderPublicKey) {
          throw new Error("P2P decryption requires senderPublicKey.");
        }
        const sharedKey = deriveSharedSecret(this.wallet.privateKey, senderPublicKey);
        decryptedPayload = await decrypt(sharedKey, msg.payload, msg.nonce);
      } else {
        return null;
      }

      return {
        text: toUtf8String(decryptedPayload),
        type: msg.type,
        sender: msg.sender,
        recipient: msg.recipient
      };
    } catch (e) {
      console.error("Decryption failed", e);
      return null;
    }
  }

  /**
   * Helper to parse a transaction input data
   */
  parseTransaction(input: string, from: string, to: string): OAMPMessage | null {
    return deserializeMessage(input, from, to);
  }
}
