import Arweave from 'arweave/web';
import {
  ARWEAVE_GATEWAYS,
  ARWEAVE_MAX_GATEWAY_ATTEMPTS,
} from '../config/arweaveGatewayConfig';

/** Last gateway that answered successfully; tried first next time (in-memory, per app run). */
let preferredGateway: string | null = null;

/** Gateways in attempt order: last-good first, then config order, capped at `maxAttempts`. */
export function orderedArweaveGateways(maxAttempts: number = ARWEAVE_MAX_GATEWAY_ATTEMPTS): string[] {
  const list: string[] = [...ARWEAVE_GATEWAYS];
  if (preferredGateway) {
    const idx = list.indexOf(preferredGateway);
    if (idx > 0) {
      list.splice(idx, 1);
      list.unshift(preferredGateway);
    }
  }
  return list.slice(0, maxAttempts);
}

/** Accepts a gateway base or any URL under it (e.g. a download candidate). */
export function markArweaveGatewayOk(urlOrBase: string): void {
  const match = ARWEAVE_GATEWAYS.find((gateway) => urlOrBase.startsWith(gateway));
  if (match) {
    preferredGateway = match;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Run `op` against each gateway serially until one succeeds.
 * `timeoutMs` bounds one attempt for ops that cannot abort themselves (arweave-js has no abort).
 */
export async function withArweaveGateways<T>(
  op: (gateway: string) => Promise<T>,
  options: { timeoutMs?: number; maxAttempts?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (const gateway of orderedArweaveGateways(options.maxAttempts)) {
    try {
      const pending = op(gateway);
      const result = await (options.timeoutMs ? withTimeout(pending, options.timeoutMs) : pending);
      markArweaveGatewayOk(gateway);
      return result;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'No Arweave gateway available'));
}

const clients = new Map<string, Arweave>();

/** arweave-js client bound to one gateway (React Native: web build, WebCrypto). */
export function getArweaveClient(gateway: string): Arweave {
  let client = clients.get(gateway);
  if (!client) {
    const url = new URL(gateway);
    client = Arweave.init({
      host: url.hostname,
      port: url.port ? Number(url.port) : 443,
      protocol: url.protocol.replace(':', ''),
    });
    clients.set(gateway, client);
  }
  return client;
}
