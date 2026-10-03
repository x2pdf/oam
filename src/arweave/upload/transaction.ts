import {
  ARWEAVE_POST_TIMEOUT_MS,
  ARWEAVE_READ_TIMEOUT_MS,
  PRIMARY_ARWEAVE_GATEWAY,
} from '../../config/arweaveGatewayConfig';
import { getArweaveClient, withArweaveGateways } from '../gateway';
import type { ArweaveJwk } from '../wallet/jwk';

/** Offline helpers only (winston ↔ AR); network calls go through withArweaveGateways. */
const arweaveUnits = getArweaveClient(PRIMARY_ARWEAVE_GATEWAY);

const readOptions = { timeoutMs: ARWEAVE_READ_TIMEOUT_MS };

export type UploadTag = { name: string; value: string };

export async function estimateUploadFeeAr(dataSize: number): Promise<string> {
  return arweaveUnits.ar.winstonToAr(await estimateUploadFeeWinston(dataSize));
}

export async function estimateUploadFeeWinston(dataSize: number): Promise<string> {
  return withArweaveGateways(
    (gateway) => getArweaveClient(gateway).transactions.getPrice(dataSize),
    readOptions,
  );
}

export async function getUploadWalletBalanceAr(address: string): Promise<string> {
  return arweaveUnits.ar.winstonToAr(await getUploadWalletBalanceWinston(address));
}

export async function getUploadWalletBalanceWinston(address: string): Promise<string> {
  return withArweaveGateways(
    (gateway) => getArweaveClient(gateway).wallets.getBalance(address),
    readOptions,
  );
}

export function uploadBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function isUploadBalanceInsufficient(balanceWinston: string, feeWinston: string): boolean {
  return BigInt(balanceWinston) < BigInt(feeWinston);
}

export async function postUploadTransaction(
  jwk: ArweaveJwk,
  data: Uint8Array,
  tags: UploadTag[],
): Promise<string> {
  // Anchor + price come from whichever gateway answers first; the signed tx is valid on any of them.
  const transaction = await withArweaveGateways(async (gateway) => {
    const tx = await getArweaveClient(gateway).createTransaction({ data }, jwk);
    for (const tag of tags) {
      tx.addTag(tag.name, tag.value);
    }
    return tx;
  }, readOptions);
  await arweaveUnits.transactions.sign(transaction, jwk);

  // Re-posting the same signed tx to another gateway is idempotent (208 = already received).
  await withArweaveGateways(
    async (gateway) => {
      const response = await getArweaveClient(gateway).transactions.post(transaction);
      if (response.status !== 200 && response.status !== 202 && response.status !== 208) {
        throw new Error(`Upload failed with status ${response.status}`);
      }
    },
    { timeoutMs: ARWEAVE_POST_TIMEOUT_MS },
  );
  return transaction.id;
}
