import {
  Wallet,
  formatEther,
  TransactionRequest,
} from "ethers";
import { MessageType, CryptoScheme, OAMPMessage, DecryptedMessage, EncryptionContext } from "./types";
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

export interface FeeOption {
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
  level?: "slow" | "normal" | "fast" | "custom";
}

export interface FeeSuggestions {
  slow: FeeOption;
  normal: FeeOption;
  fast: FeeOption;
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

/**
 * Compute intrinsic gas for a data-only transaction (no EVM execution).
 * Takes the max of the standard formula (EIP-2028) and the EIP-7623 floor,
 * then adds a 10 % safety margin.  Unused gas is refunded by the protocol.
 */
function intrinsicGas(txData: string): bigint {
  const hex = txData.startsWith("0x") ? txData.slice(2) : txData;
  let zero = 0n, nonZero = 0n;
  for (let i = 0; i < hex.length; i += 2) {
    if (hex.slice(i, i + 2) === "00") zero++; else nonZero++;
  }
  const tokens = zero + nonZero * 4n;
  const standard = 21000n + tokens * 4n;   // EIP-2028
  const floor    = 21000n + tokens * 10n;  // EIP-7623
  const base = standard > floor ? standard : floor;
  return (base * 110n) / 100n;             // 10 % margin
}

async function estimateFeeEth(
  fromAddress: string,
  tx: TransactionRequest,
  feeOption?: FeeOption
): Promise<string> {
  return withRpcFallback(async (provider) => {
    let gasLimit: bigint;
    let gasEstimateFailed = false;

    try {
      gasLimit = await provider.estimateGas({
        ...tx,
        from: fromAddress,
      });
    } catch (estErr: any) {
      console.warn(
        'estimateGas failed, falling back to manual calculation:',
        estErr?.shortMessage || estErr?.message,
      );
      gasEstimateFailed = true;
      gasLimit = intrinsicGas(String(tx.data || '0x'));
    }

    let gasPrice: bigint | null = null;
    if (feeOption) {
      gasPrice = feeOption.maxFeePerGas ?? feeOption.gasPrice ?? null;
    }

    if (!gasPrice) {
      let feeData;
      try {
        feeData = await provider.getFeeData();
      } catch (feeErr) {
        if (gasEstimateFailed) {
          throw new Error('Gas estimation and fee data fetch both failed');
        }
        throw feeErr;
      }
      gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
    }

    if (!gasPrice) {
      if (gasEstimateFailed) {
        throw new Error('Gas estimation and gas price fetch both failed');
      }
      throw new Error("Unable to fetch gas price");
    }

    const feeWei = gasLimit * gasPrice;
    return formatEther(feeWei);
  }, { noFatal: true });
}

export async function getFeeSuggestions(): Promise<FeeSuggestions> {
  return withRpcFallback(async (provider) => {
    const feeData = await provider.getFeeData();
    const baseGasPrice = feeData.gasPrice ?? 0n;
    const maxFee = feeData.maxFeePerGas ?? baseGasPrice;
    const maxPriority = feeData.maxPriorityFeePerGas ?? 0n;

    // A simple heuristic for suggestions
    return {
      slow: {
        maxFeePerGas: (maxFee * 90n) / 100n,
        maxPriorityFeePerGas: (maxPriority * 90n) / 100n,
        level: "slow",
      },
      normal: {
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: maxPriority,
        level: "normal",
      },
      fast: {
        maxFeePerGas: (maxFee * 120n) / 100n,
        maxPriorityFeePerGas: (maxPriority * 150n) / 100n,
        level: "fast",
      },
    };
  }, { noFatal: true });
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
  options?: { encrypt?: boolean; recipientPublicKey?: string; feeOption?: FeeOption }
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
  }, options?.feeOption);
  return { feeEth, built };
}

export class OAMPClient {
  private wallet: Wallet;

  constructor(privateKey: string, _rpcUrl?: string) {
    this.wallet = new Wallet(privateKey);
  }

  private async getPendingNonce(): Promise<number> {
    return withRpcFallback(
      (provider) => provider.getTransactionCount(this.wallet.address, "pending"),
      { noFatal: true },
    );
  }

  private async sendBuilt(built: BuiltTxRequest, nonce?: number, feeOption?: FeeOption): Promise<string> {
    // Pre-estimate gas with fallback so populateTransaction skips its internal
    // estimateGas (which can fail, e.g. when broadcasting to the zero-address).
    // Fallback uses EIP-7623 intrinsic gas calculation.
    const gasLimit = await withRpcFallback(async (provider) => {
      try {
        return await provider.estimateGas({
          to: built.to,
          data: built.data,
          from: this.wallet.address,
        });
      } catch (err: any) {
        console.warn(
          'sendBuilt: estimateGas failed, using manual fallback:',
          err?.shortMessage || err?.message,
        );
        return intrinsicGas(String(built.data || '0x'));
      }
    }, { noFatal: true });

    const populated = await withRpcFallback(async (provider) => {
      const connected = this.wallet.connect(provider);
      return connected.populateTransaction({
        to: built.to,
        data: built.data,
        gasLimit,
        ...(nonce !== undefined ? { nonce } : {}),
        ...feeOption,
      });
    }, { noFatal: true });
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

    const network = await withRpcFallback((provider) => provider.getNetwork(), { noFatal: true });
    const context: EncryptionContext = {
      chainId: network.chainId,
      sender: this.wallet.address,
      recipient: this.wallet.address,
      txNonce: txCount
    };

    const aad = getMessageHeader(MessageType.PERSONAL, CryptoScheme.AES_256_GCM, context);
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

    const network = await withRpcFallback((provider) => provider.getNetwork(), { noFatal: true });
    const context: EncryptionContext = {
      chainId: network.chainId,
      sender: this.wallet.address,
      recipient: recipientAddress,
      txNonce: txCount
    };

    const aad = getMessageHeader(MessageType.P2P, CryptoScheme.AES_256_GCM, context);
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
  async sendBroadcast(content: string | ContentItem[], feeOption?: FeeOption): Promise<string> {
    const built = await this.buildBroadcastTx(content);
    return this.sendBuilt(built, undefined, feeOption);
  }

  /**
   * Send an encrypted personal note (A -> A)
   */
  async sendPersonalNote(content: string | ContentItem[], feeOption?: FeeOption): Promise<string> {
    const txCount = await this.getPendingNonce();
    const built = await this.buildPersonalNoteTxFromNonce(content, txCount);
    return this.sendBuilt(built, txCount, feeOption);
  }

  /**
   * Send an end-to-end encrypted message (A -> B)
   */
  async sendP2PMessage(
    recipientAddress: string,
    recipientPublicKey: string,
    content: string | ContentItem[],
    feeOption?: FeeOption
  ): Promise<string> {
    const txCount = await this.getPendingNonce();
    const built = await this.buildP2PMessageTxFromNonce(
      recipientAddress,
      recipientPublicKey,
      content,
      txCount
    );
    return this.sendBuilt(built, txCount, feeOption);
  }

  /**
   * Send an unencrypted message to a specific address (A -> B)
   */
  async sendUnencryptedMessage(
    recipientAddress: string,
    content: string | ContentItem[],
    feeOption?: FeeOption
  ): Promise<string> {
    const built = await this.buildUnencryptedMessageTx(recipientAddress, content);
    return this.sendBuilt(built, undefined, feeOption);
  }

  /**
   * Decrypt a message if possible
   * @param msg The deserialized OAMP message
   * @param senderPublicKey Required for P2P messages to derive the shared secret
   */
  async decryptMessage(msg: OAMPMessage, senderPublicKey?: string): Promise<DecryptedMessage | null> {
    try {
      let decryptedPayload: Uint8Array;

      let aad: Uint8Array;
      if (msg.crypto !== CryptoScheme.NONE && msg.chainId !== undefined && msg.txNonce !== undefined) {
        const context: EncryptionContext = {
          chainId: msg.chainId,
          sender: msg.sender,
          recipient: msg.recipient,
          txNonce: msg.txNonce
        };
        aad = getMessageHeader(msg.type, msg.crypto, context);
      } else {
        aad = getMessageHeader(msg.type, msg.crypto);
      }

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
  parseTransaction(
    input: string,
    from: string,
    to: string,
    chainId?: bigint,
    txNonce?: number
  ): OAMPMessage | null {
    return deserializeMessage(input, from, to, chainId, txNonce);
  }
}
