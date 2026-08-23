import {
  FetchRequest,
  JsonRpcProvider,
  Network,
  Transaction,
} from "ethers";
import {
  BROADCAST_EXTRA_NODES,
  ETHEREUM_CHAIN_ID,
  MAX_RPC_CYCLES,
  RPC_NODES,
  RPC_REQUEST_TIMEOUT_MS,
} from "../config/rpcConfig";

const MAINNET = Network.from(ETHEREUM_CHAIN_ID);

export class AllRpcFailedError extends Error {
  override name = "AllRpcFailedError";

  constructor(message = "All RPC nodes failed") {
    super(message);
  }
}

export function createProvider(rpcUrl: string): JsonRpcProvider {
  const req = new FetchRequest(rpcUrl);
  req.timeout = RPC_REQUEST_TIMEOUT_MS;
  return new JsonRpcProvider(req, MAINNET, { staticNetwork: true });
}

function errorText(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { shortMessage?: string; message?: string };
    return String(e.shortMessage || e.message || err);
  }
  return String(err);
}

function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code?: string }).code || "");
  }
  return "";
}

function isAlreadyKnown(err: unknown): boolean {
  const msg = errorText(err).toLowerCase();
  return (
    msg.includes("already known") ||
    msg.includes("already in the mempool") ||
    msg.includes("already in mempool") ||
    msg.includes("already imported") ||
    msg.includes("known transaction")
  );
}

function isNonceTooLow(err: unknown): boolean {
  const code = errorCode(err);
  if (code === "NONCE_EXPIRED") return true;
  const msg = errorText(err).toLowerCase();
  return msg.includes("nonce too low") || msg.includes("nonce has already been used");
}

function isRateLimited(err: unknown): boolean {
  const msg = errorText(err).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("rate limit") ||
    msg.includes("throttled") ||
    msg.includes("throttling")
  );
}

function isFatalRpcError(err: unknown): boolean {
  // Rate-limit (429) is transient — let the caller decide whether to retry.
  // Read paths should use { noFatal: true }; broadcast already special-cases it.
  const code = errorCode(err);
  if (
    code === "INSUFFICIENT_FUNDS" ||
    code === "NONCE_EXPIRED" ||
    code === "REPLACEMENT_UNDERPRICED" ||
    code === "CALL_EXCEPTION" ||
    code === "UNPREDICTABLE_GAS_LIMIT"
  ) {
    return true;
  }
  const msg = errorText(err).toLowerCase();
  return (
    msg.includes("insufficient funds") ||
    msg.includes("replacement transaction underpriced") ||
    msg.includes("transaction underpriced") ||
    msg.includes("intrinsic gas too low") ||
    msg.includes("nonce too low")
  );
}

export type RpcFallbackOptions<T> = {
  /** If set, a resolved value that fails this check is treated as a node failure. */
  isValueOk?: (value: T) => boolean;
  /** Override MAX_RPC_CYCLES for this call. */
  cycles?: number;
  /** When true, skip fatal-error detection and retry every node. Useful for read-only contract calls. */
  noFatal?: boolean;
};

/**
 * Run a read against RPC nodes sequentially. Fatal tx/account errors are not retried.
 */
export async function withRpcFallback<T>(
  run: (provider: JsonRpcProvider, rpcUrl: string) => Promise<T>,
  options?: RpcFallbackOptions<T>
): Promise<T> {
  if (RPC_NODES.length === 0) {
    throw new AllRpcFailedError();
  }

  let lastError: unknown = null;
  const cycles = options?.cycles ?? MAX_RPC_CYCLES;

  for (let cycle = 1; cycle <= cycles; cycle++) {
    for (const url of RPC_NODES) {
      try {
        const provider = createProvider(url);
        const value = await run(provider, url);
        if (options?.isValueOk && !options.isValueOk(value)) {
          lastError = new Error(`Unusable RPC result from ${url}`);
          console.warn(`RPC ${url} returned an unusable result, trying next`);
          continue;
        }
        return value;
      } catch (err) {
        if (!options?.noFatal && isFatalRpcError(err)) {
          throw err;
        }
        lastError = err;
        const reason = errorText(err);
        console.warn(`RPC ${url} failed (cycle ${cycle}/${cycles}): ${reason}`);
      }
    }
  }

  throw lastError instanceof AllRpcFailedError
    ? lastError
    : new AllRpcFailedError(errorText(lastError) || "All RPC nodes failed");
}

async function probeTransaction(hash: string, startIndex: number): Promise<boolean> {
  const count = Math.min(3, RPC_NODES.length);
  for (let k = 0; k < count; k++) {
    const url = RPC_NODES[(startIndex + k) % RPC_NODES.length];
    try {
      const provider = createProvider(url);
      const tx = await provider.getTransaction(hash);
      if (tx) return true;
    } catch (err) {
      console.warn(`probe ${hash} via ${url} failed:`, errorText(err));
    }
  }
  return false;
}

async function broadcastToNode(
  url: string,
  signedTx: string,
  hash: string,
  nodeIndex: number,
  probeOnFailure: boolean
): Promise<"accepted" | "retry"> {
  const provider = createProvider(url);
  try {
    await provider.broadcastTransaction(signedTx);
    return "accepted";
  } catch (err) {
    if (isAlreadyKnown(err)) {
      return "accepted";
    }

    if (probeOnFailure) {
      const found = await probeTransaction(hash, nodeIndex);
      if (found) return "accepted";
    }

    if (isNonceTooLow(err)) {
      throw err;
    }
    // Rate-limit (429) during broadcast: don't treat as fatal — the node may
    // have accepted the tx before rate-limiting the response.  Fall through to
    // "retry" so the caller can try the next node or probe for inclusion.
    if (!isRateLimited(err) && isFatalRpcError(err)) {
      throw err;
    }

    console.warn(`broadcast to ${url} failed: ${errorText(err)}`);
    return "retry";
  }
}

/**
 * Broadcast one already-signed raw tx. Same payload is sent to extra nodes after the first accept.
 */
export async function broadcastRawTx(signedTx: string): Promise<string> {
  const parsed = Transaction.from(signedTx);
  const hash = parsed.hash;
  if (!hash) {
    throw new Error("Signed transaction has no hash");
  }

  let acceptedIndex = -1;

  for (let cycle = 1; cycle <= MAX_RPC_CYCLES && acceptedIndex < 0; cycle++) {
    for (let i = 0; i < RPC_NODES.length; i++) {
      try {
        const result = await broadcastToNode(RPC_NODES[i], signedTx, hash, i, true);
        if (result === "accepted") {
          acceptedIndex = i;
          break;
        }
      } catch (err) {
        // Fatal errors (insufficient funds, nonce too low, etc.) bubble up.
        throw err;
      }
    }
  }

  if (acceptedIndex < 0) {
    throw new AllRpcFailedError();
  }

  const extra = Math.min(BROADCAST_EXTRA_NODES, Math.max(0, RPC_NODES.length - 1));
  for (let k = 1; k <= extra; k++) {
    const idx = (acceptedIndex + k) % RPC_NODES.length;
    if (idx === acceptedIndex) break;
    try {
      await broadcastToNode(RPC_NODES[idx], signedTx, hash, idx, false);
    } catch (err) {
      console.warn(`extra broadcast to ${RPC_NODES[idx]} ignored:`, errorText(err));
    }
  }

  return hash;
}
