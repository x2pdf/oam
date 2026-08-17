import {
  Wallet,
  JsonRpcProvider,
  toUtf8Bytes,
  toUtf8String,
  dataSlice,
  Transaction
} from "ethers";
import { MessageType, CryptoScheme, OAMPMessage, DecryptedMessage } from "./types";
import { serializeMessage, deserializeMessage, getMessageHeader, BLACK_HOLE } from "./protocol";
import { ContentItem, payloadEncode, payloadDecode } from "../mypayload";
import {
  derivePersonalKey,
  deriveSharedSecret,
  encrypt,
  decrypt,
  generateDeterministicNonce,
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
   * 内部统一处理 Payload 编码
   */
  private preparePayload(content: string | ContentItem[]): Uint8Array {
    if (typeof content === "string") {
      // 如果是纯字符串，为了规范化，也包装成 ContentItem 进行编码
      return payloadEncode([{ type: "text", content }]);
    }
    return payloadEncode(content);
  }

  /**
   * Send a public broadcast message (A -> BLACK_HOLE)
   */
  async sendBroadcast(content: string | ContentItem[]): Promise<string> {
    const payload = this.preparePayload(content);
    // For broadcast, we can use a random nonce as it's unencrypted
    const nonce = generateNonce();

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
  async sendPersonalNote(content: string | ContentItem[]): Promise<string> {
    const key = await derivePersonalKey(this.wallet);
    const txCount = await this.wallet.getNonce();
    const nonce = generateDeterministicNonce(txCount, this.wallet.address);
    const payload = this.preparePayload(content);

    // Apply AAD: Header (Magic + Version + Type + Crypto)
    const aad = getMessageHeader(MessageType.PERSONAL, CryptoScheme.AES_256_GCM);
    const ciphertext = await encrypt(key, payload, nonce, aad);

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
  async sendP2PMessage(recipientAddress: string, recipientPublicKey: string, content: string | ContentItem[]): Promise<string> {
    const sharedKey = deriveSharedSecret(this.wallet.privateKey, recipientPublicKey);
    const txCount = await this.wallet.getNonce();
    const nonce = generateDeterministicNonce(txCount, recipientAddress);
    const payload = this.preparePayload(content);

    // Apply AAD: Header (Magic + Version + Type + Crypto)
    const aad = getMessageHeader(MessageType.P2P, CryptoScheme.AES_256_GCM);
    const ciphertext = await encrypt(sharedKey, payload, nonce, aad);

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
   * Send an unencrypted message to a specific address (A -> B)
   */
  async sendUnencryptedMessage(recipientAddress: string, content: string | ContentItem[]): Promise<string> {
    const payload = this.preparePayload(content);
    const nonce = generateNonce();

    const data = serializeMessage(
      MessageType.P2P,
      CryptoScheme.NONE,
      nonce,
      payload
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
      const aad = getMessageHeader(msg.type, msg.crypto);

      if (msg.crypto === CryptoScheme.NONE) {
        decryptedPayload = msg.payload;
      } else if (msg.type === MessageType.PERSONAL) {
        const key = await derivePersonalKey(this.wallet);
        decryptedPayload = await decrypt(key, msg.payload, msg.nonce, aad);
      } else if (msg.type === MessageType.P2P) {
        if (!senderPublicKey) {
          throw new Error("P2P decryption requires senderPublicKey.");
        }
        const sharedKey = deriveSharedSecret(this.wallet.privateKey, senderPublicKey);
        decryptedPayload = await decrypt(sharedKey, msg.payload, msg.nonce, aad);
      } else {
        return null;
      }

      // 使用规范化解码器还原内容
      const items = payloadDecode(decryptedPayload);

      // 为了保持向后兼容，text 字段存放第一个文本项或所有文本项的拼接
      const textSummary = items
        .filter(item => item.type === "text")
        .map(item => (item as any).content)
        .join("\n");

      return {
        text: textSummary || "[Rich Content]",
        items: items,
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
