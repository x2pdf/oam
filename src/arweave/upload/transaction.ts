import {
  ARWEAVE_POST_TIMEOUT_MS,
  ARWEAVE_READ_TIMEOUT_MS,
  PRIMARY_ARWEAVE_GATEWAY,
} from '../../config/arweaveGatewayConfig';
import {
  getArweaveClient,
  markArweaveGatewayOk,
  orderedArweaveGateways,
  withArweaveGateways,
} from '../gateway';
import type { ArweaveJwk } from '../wallet/jwk';

/** Offline helpers only (winston ↔ AR); network calls go through withArweaveGateways. */
const arweaveUnits = getArweaveClient(PRIMARY_ARWEAVE_GATEWAY);

const readOptions = { timeoutMs: ARWEAVE_READ_TIMEOUT_MS };

export type UploadTag = { name: string; value: string };

/** Derive every confirmation value from the same fee and balance responses. */
export async function getUploadQuote(address: string, dataSize: number) {
  const [balanceWinston, feeWinston] = await Promise.all([
    getUploadWalletBalanceWinston(address),
    estimateUploadFeeWinston(dataSize),
  ]);
  return {
    balanceAr: arweaveUnits.ar.winstonToAr(balanceWinston),
    feeAr: arweaveUnits.ar.winstonToAr(feeWinston),
    feeWinston,
    insufficientBalance: isUploadBalanceInsufficient(balanceWinston, feeWinston),
  };
}

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

export const UPLOAD_FEE_TOO_HIGH_ERROR = 'UPLOAD_FEE_TOO_HIGH';

/**
 * The reward is baked into the signed transaction and comes from whichever gateway
 * answers first, a different request than the quote the user was shown. A gateway
 * could inflate it up to the wallet balance, so signing is refused above this bound:
 * the quote plus 50% (price drifts a little between the two requests).
 */
export function maxAcceptableUploadReward(quotedFeeWinston: string): string {
  return ((BigInt(quotedFeeWinston) * 3n) / 2n).toString();
}

export function isUploadFeeTooHighError(error: unknown): boolean {
  return error instanceof Error && error.name === UPLOAD_FEE_TOO_HIGH_ERROR;
}

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

function isChunkEndpoint(endpoint: string): boolean {
  return endpoint.replace(/^\//, '').split('?')[0] === 'chunk';
}

type ChunkAwareApi = {
  post: (endpoint: string, body?: unknown, config?: unknown) => Promise<{ status: number; statusText?: string; data?: unknown }>;
};

const patchedChunkApis = new WeakSet<object>();

/**
 * arweave-js advances a chunk only on HTTP 200. A gateway that already stored it
 * often answers 202 or 208, and the uploader then retries that same chunk for
 * 40s at a time. The node has the data, but `transactions.post` never resolves,
 * so the success dialog never opens. POST /tx already treats any 2xx as accepted.
 */
export function treatAcceptedChunksAsUploaded(client: { api: { post: Function } }): void {
  const api = client.api as ChunkAwareApi;
  if (patchedChunkApis.has(api)) return;
  const original = api.post.bind(api);
  api.post = async (endpoint, body, config) => {
    const response = await original(endpoint, body, config);
    if (isChunkEndpoint(endpoint) && isSuccessStatus(response.status) && response.status !== 200) {
      return { status: 200, statusText: response.statusText, data: response.data };
    }
    return response;
  };
  patchedChunkApis.add(api);
}

/** One attempt stays bounded; arweave-js has no abort, so a timed-out post keeps running. */
function boundAttempt<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function postToGateway(gateway: string, transaction: object): Promise<void> {
  const client = getArweaveClient(gateway);
  treatAcceptedChunksAsUploaded(client);
  const response = await client.transactions.post(transaction);
  if (!isSuccessStatus(response.status)) {
    throw new Error(`Upload failed with status ${response.status}`);
  }
}

/**
 * Fail over when a gateway errors or goes quiet, same as the other Arweave calls.
 * A quiet attempt is not cancelled. If it later comes back accepted, that still
 * counts: the dialog follows the node, and the 120s bound still switches gateways.
 */
async function postSignedUpload(transaction: object): Promise<void> {
  let successGateway: string | null = null;
  let resolveSuccess: () => void = () => {};
  const success = new Promise<void>((resolve) => {
    resolveSuccess = resolve;
  });
  let lastError: unknown;

  for (const gateway of orderedArweaveGateways()) {
    if (successGateway) break;
    const attempt = postToGateway(gateway, transaction).then(() => {
      if (!successGateway) successGateway = gateway;
      resolveSuccess();
    });
    void attempt.catch((error: unknown) => {
      lastError = error;
    });
    try {
      await boundAttempt(Promise.race([attempt, success]), ARWEAVE_POST_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
    }
    if (successGateway) break;
  }

  await Promise.resolve();
  if (successGateway) {
    markArweaveGatewayOk(successGateway);
    return;
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Upload failed'));
}

export async function postUploadTransaction(
  jwk: ArweaveJwk,
  data: Uint8Array,
  tags: UploadTag[],
  maxRewardWinston: string,
): Promise<string> {
  // Anchor + price come from whichever gateway answers first; the signed tx is valid on any of them.
  const transaction = await withArweaveGateways(async (gateway) => {
    const tx = await getArweaveClient(gateway).createTransaction({ data }, jwk);
    for (const tag of tags) {
      tx.addTag(tag.name, tag.value);
    }
    return tx;
  }, readOptions);
  if (BigInt(transaction.reward) > BigInt(maxRewardWinston)) {
    const err = new Error(`Gateway reward ${transaction.reward} exceeds the quoted fee bound ${maxRewardWinston}`);
    err.name = UPLOAD_FEE_TOO_HIGH_ERROR;
    throw err;
  }
  await arweaveUnits.transactions.sign(transaction, jwk);

  // Re-posting the same signed tx to another gateway is idempotent (2xx = already received).
  await postSignedUpload(transaction);
  return transaction.id;
}
