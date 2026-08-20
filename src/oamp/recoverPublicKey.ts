import {
  Transaction,
  SigningKey,
  computeAddress,
  getAddress,
  TransactionResponse,
  TransactionLike,
} from "ethers";
import { dataSourceManager } from "../datasource/DataSourceManager";
import { withRpcFallback } from "../rpc/rpcClient";

export type PubKeyLookupResult =
  | { ok: true; publicKey: string }
  | { ok: false; reason: "no-history" | "recover-failed" };

const MAX_TXS_TO_TRY = 8;

function recoverPublicKeyFromTx(tx: TransactionResponse): string | null {
  try {
    const isEip1559 = tx.type === 2 || tx.type === 3;
    const txLike: TransactionLike = {
      type: tx.type,
      to: tx.to,
      nonce: tx.nonce,
      gasLimit: tx.gasLimit,
      data: tx.data,
      value: tx.value,
      chainId: tx.chainId,
      signature: tx.signature,
    };

    if (isEip1559) {
      txLike.maxFeePerGas = tx.maxFeePerGas ?? undefined;
      txLike.maxPriorityFeePerGas = tx.maxPriorityFeePerGas ?? undefined;
    } else {
      txLike.gasPrice = tx.gasPrice ?? undefined;
    }

    if (tx.accessList) {
      txLike.accessList = tx.accessList;
    }

    if (tx.type === 3) {
      txLike.maxFeePerBlobGas = tx.maxFeePerBlobGas ?? undefined;
      txLike.blobVersionedHashes = tx.blobVersionedHashes ?? undefined;
    }

    const parsed = Transaction.from(txLike);
    if (!parsed.signature) return null;
    return SigningKey.recoverPublicKey(parsed.unsignedHash, parsed.signature);
  } catch (e) {
    console.warn("recoverPublicKeyFromTx failed", e);
    return null;
  }
}

/**
 * 从接收地址的历史发出交易签名还原 secp256k1 公钥。
 * 索引数据源只提供交易 hash；完整签名通过 RPC 在应用内还原。
 * 若该地址从未发送过交易（nonce = 0），链上无法还原公钥。
 */
export async function lookupRecipientPublicKey(
  address: string
): Promise<PubKeyLookupResult> {
  const checksum = getAddress(address);

  try {
    const nonce = await withRpcFallback((provider) =>
      provider.getTransactionCount(checksum)
    );
    if (nonce === 0) {
      return { ok: false, reason: "no-history" };
    }
  } catch (e) {
    console.warn("getTransactionCount failed", e);
  }

  let hashes: string[] = [];
  try {
    const result = await dataSourceManager.fetchOutgoingTransactions(checksum);
    hashes = (result.items || [])
      .map((item) => item.hash)
      .filter((hash): hash is string => !!hash);
  } catch (e) {
    console.warn("fetchOutgoingTransactions failed", e);
    return { ok: false, reason: "recover-failed" };
  }

  if (hashes.length === 0) {
    return { ok: false, reason: "no-history" };
  }

  for (const hash of hashes.slice(0, MAX_TXS_TO_TRY)) {
    try {
      const tx = await withRpcFallback(
        async (provider) => {
          const found = await provider.getTransaction(hash);
          if (!found) {
            throw new Error("transaction not found on this node");
          }
          return found;
        },
        { cycles: 1 }
      );
      const publicKey = recoverPublicKeyFromTx(tx);
      if (publicKey && computeAddress(publicKey).toLowerCase() === checksum.toLowerCase()) {
        return { ok: true, publicKey };
      }
    } catch (e) {
      console.warn("Failed to recover pubkey from tx", hash, e);
    }
  }

  return { ok: false, reason: "recover-failed" };
}

/** 规范化用户粘贴的公钥（补 0x / 未压缩 04 前缀） */
export function normalizePublicKeyInput(input: string): string {
  let hex = input.trim();
  if (!hex) {
    throw new Error("empty public key");
  }
  if (!hex.startsWith("0x") && !hex.startsWith("0X")) {
    hex = "0x" + hex;
  }
  const body = hex.slice(2);
  if (body.length === 128 && !body.toLowerCase().startsWith("04")) {
    return "0x04" + body;
  }
  return hex;
}

export function publicKeyMatchesAddress(publicKey: string, address: string): boolean {
  try {
    return computeAddress(publicKey).toLowerCase() === getAddress(address).toLowerCase();
  } catch {
    return false;
  }
}
