import Arweave from 'arweave/web';
import type { ArweaveJwk } from '../wallet/jwk';

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
});

export type UploadTag = { name: string; value: string };

export async function estimateUploadFeeAr(dataSize: number): Promise<string> {
  const priceWinston = await arweave.transactions.getPrice(dataSize);
  return arweave.ar.winstonToAr(priceWinston);
}

export async function estimateUploadFeeWinston(dataSize: number): Promise<string> {
  return arweave.transactions.getPrice(dataSize);
}

export async function getUploadWalletBalanceAr(address: string): Promise<string> {
  const balanceWinston = await arweave.wallets.getBalance(address);
  return arweave.ar.winstonToAr(balanceWinston);
}

export async function getUploadWalletBalanceWinston(address: string): Promise<string> {
  return arweave.wallets.getBalance(address);
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
  const transaction = await arweave.createTransaction({ data }, jwk);
  for (const tag of tags) {
    transaction.addTag(tag.name, tag.value);
  }
  await arweave.transactions.sign(transaction, jwk);
  const response = await arweave.transactions.post(transaction);
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`Upload failed with status ${response.status}`);
  }
  return transaction.id;
}
