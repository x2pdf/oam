import {
  Wallet,
  formatEther,
  TransactionRequest
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
import { broadcastRawTx, withRpcFallback } from "../rpc/rpcClient";

export type SendMode = "broadcast" | "personal" | "unencrypted" | "p2p";

export interface BuiltTxRequest {
  to: string;
  data: string;
  mode: SendMode;
}

/** AES-GCM auth tag; ciphertext length = plaintext + this. */
const AES_GCM_TAG_BYTES = 16;

function preparePayload(content: string | ContentItem[]): Uint8Array {
  if (typeof content === "string") {
    return payloadEncode([{ type: "text", content }]);
  }
  return payloadEncode(content);
}

function buildBroadcastTx(content: string | ContentItem[]): BuiltTxRequest {
  const payload = preparePayload(content);
  const nonce = generateNonce();
  const data = serializeMessage(
    MessageType.BROADCAST,
    CryptoScheme.NONE,
    nonce,
    payload
  );
  return { to: BLACK_HOLE, data, mode: "broadcast" };
}

function buildUnencryptedMessageTx(
  recipientAddress: string,
  content: string | ContentItem[]
): BuiltTxRequest {
  const payload = preparePayload(content);
  const nonce = generateNonce();
  const data = serializeMessage(
    MessageType.P2P,
    CryptoScheme.NONE,
    nonce,
    payload
  );
  return { to: recipientAddress, data, mode: "unencrypted" };
}

function buildPlaceholderEncryptedTx(
  type: MessageType.PERSONAL | MessageType.P2P,
  to: string,
  content: string | ContentItem[]
): BuiltTxRequest {
  const payload = preparePayload(content);
  const nonce = generateNonce();
  const dummyCiphertext = new Uint8Array(payload.length + AES_GCM_TAG_BYTES);
  const data = serializeMessage(type, CryptoScheme.AES_256_GCM, nonce, dummyCiphertext);
  return {
    to,
    data,
    mode: type === MessageType.PERSONAL ? "personal" : "p2p",
  };
}

async function estimateFeeEth(
  fromAddress: string,
  tx: TransactionRequest
): Promise<string> {
  return withRpcFallback(async (provider) => {
    const [gasLimit, feeData] = await Promise.all([
      provider.estimateGas({
        ...tx,
        from: fromAddress,
      }),
      provider.getFeeData(),
    ]);

    const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
    if (!gasPrice) {
      throw new Error("Unable to fetch gas price");
    }

    const feeWei = gasLimit * gasPrice;
    return formatEther(feeWei);
  });
}

/**
 * Estimate send fee using only the sender address. Encrypted payloads use
 * equal-length dummy ciphertext so the private key is never needed.
 */
export async function estimateSendFeeFromAddress(
  fromAddress: string,
  recipientAddress: string,
  content: string | ContentItem[],
  isSelf: boolean,
  options?: { encrypt?: boolean; recipientPublicKey?: string }
): Promise<{ feeEth: string; built: BuiltTxRequest }> {
  const target = recipientAddress.trim() || BLACK_HOLE;
  let built: BuiltTxRequest;

  if (isSelf) {
    built = buildPlaceholderEncryptedTx(MessageType.PERSONAL, fromAddress, content);
  } else if (target.toLowerCase() === BLACK_HOLE.toLowerCase()) {
    built = buildBroadcastTx(content);
  } else if (options?.encrypt && options.recipientPublicKey) {
    built = buildPlaceholderEncryptedTx(MessageType.P2P, target, content);
  } else {
    built = buildUnencryptedMessageTx(target, content);
  }

  const feeEth = await estimateFeeEth(fromAddress, {
    to: built.to,
    data: built.data,
  });
  return { feeEth, built };
}

export class OAMPClient {
  private wallet: Wallet;

  constructor(privateKey: string, _rpcUrl?: string) {
    this.wallet = new Wallet(privateKey);
  }

  private async getPendingNonce(): Promise<number> {
    return withRpcFallback((provider) =>
      provider.getTransactionCount(this.wallet.address, "pending")
    );
  }

  private async sendBuilt(built: BuiltTxRequest, nonce?: number): Promise<string> {
    const populated = await withRpcFallback(async (provider) => {
      const connected = this.wallet.connect(provider);
      return connected.populateTransaction({
        to: built.to,
        data: built.data,
        ...(nonce !== undefined ? { nonce } : {}),
      });
    });
    const signed = await this.wallet.signTransaction(populated);
    return broadcastRawTx(signed);
  }

  async buildBroadcastTx(content: string | ContentItem[]): Promise<BuiltTxRequest> {
    return buildBroadcastTx(content);
  }

  async buildPersonalNoteTx(content: string | ContentItem[]): Promise<BuiltTxRequest> {
    const txCount = await this.getPendingNonce();
    return this.buildPersonalNoteTxFromNonce(content, txCount);
  }

  private async buildPersonalNoteTxFromNonce(
    content: string | ContentItem[],
    txCount: number
  ): Promise<BuiltTxRequest> {
    const key = await derivePersonalKey(this.wallet);
    const nonce = generateDeterministicNonce(txCount, this.wallet.address);
    const payload = preparePayload(content);

    const aad = getMessageHeader(MessageType.PERSONAL, CryptoScheme.AES_256_GCM);
    const ciphertext = await encrypt(key, payload, nonce, aad);

    const data = serializeMessage(
      MessageType.PERSONAL,
      CryptoScheme.AES_256_GCM,
      nonce,
      ciphertext
    );

    return { to: this.wallet.address, data, mode: "personal" };
  }

  async buildP2PMessageTx(
    recipientAddress: string,
    recipientPublicKey: string,
    content: string | ContentItem[]
  ): Promise<BuiltTxRequest> {
    const txCount = await this.getPendingNonce();
    return this.buildP2PMessageTxFromNonce(recipientAddress, recipientPublicKey, content, txCount);
  }

  private async buildP2PMessageTxFromNonce(
    recipientAddress: string,
    recipientPublicKey: string,
    content: string | ContentItem[],
    txCount: number
  ): Promise<BuiltTxRequest> {
    const sharedKey = deriveSharedSecret(this.wallet.privateKey, recipientPublicKey);
    const nonce = generateDeterministicNonce(txCount, recipientAddress);
    const payload = preparePayload(content);

    const aad = getMessageHeader(MessageType.P2P, CryptoScheme.AES_256_GCM);
    const ciphertext = await encrypt(sharedKey, payload, nonce, aad);

    const data = serializeMessage(
      MessageType.P2P,
      CryptoScheme.AES_256_GCM,
      nonce,
      ciphertext
    );

    return { to: recipientAddress, data, mode: "p2p" };
  }

  async buildUnencryptedMessageTx(
    recipientAddress: string,
    content: string | ContentItem[]
  ): Promise<BuiltTxRequest> {
    return buildUnencryptedMessageTx(recipientAddress, content);
  }

  /**
   * Send a public broadcast message (A -> BLACK_HOLE)
   */
  async sendBroadcast(content: string | ContentItem[]): Promise<string> {
    const built = await this.buildBroadcastTx(content);
    return this.sendBuilt(built);
  }

  /**
   * Send an encrypted personal note (A -> A)
   */
  async sendPersonalNote(content: string | ContentItem[]): Promise<string> {
    const txCount = await this.getPendingNonce();
    const built = await this.buildPersonalNoteTxFromNonce(content, txCount);
    return this.sendBuilt(built, txCount);
  }

  /**
   * Send an end-to-end encrypted message (A -> B)
   */
  async sendP2PMessage(recipientAddress: string, recipientPublicKey: string, content: string | ContentItem[]): Promise<string> {
    const txCount = await this.getPendingNonce();
    const built = await this.buildP2PMessageTxFromNonce(
      recipientAddress,
      recipientPublicKey,
      content,
      txCount
    );
    return this.sendBuilt(built, txCount);
  }

  /**
   * Send an unencrypted message to a specific address (A -> B)
   */
  async sendUnencryptedMessage(recipientAddress: string, content: string | ContentItem[]): Promise<string> {
    const built = await this.buildUnencryptedMessageTx(recipientAddress, content);
    return this.sendBuilt(built);
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
      console.warn("Decryption failed", e);
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
