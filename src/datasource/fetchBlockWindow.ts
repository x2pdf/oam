import {
  FOLLOWING_BLOCK_FETCH_CONCURRENCY,
  FOLLOWING_BLOCK_FETCH_TIMEOUT_MS,
  FOLLOWING_RPC_BATCH_SIZE,
} from '../constants';
import { ChainTransaction, parseRpcBlock } from './ChainTransaction';
import { fetchWithTimeout } from './fetchWithTimeout';
import { withRpcFallback } from '../rpc/rpcClient';

function toBlockHex(n: number): string {
  return `0x${n.toString(16)}`;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runWorker = async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  };
  const poolSize = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: poolSize }, () => runWorker()));
  return results;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

type JsonRpcResponse = {
  id?: number;
  result?: unknown;
  error?: { message?: string };
};

async function rpcPost(url: string, body: unknown): Promise<unknown> {
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    },
    FOLLOWING_BLOCK_FETCH_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new Error(`RPC ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function parseBlockResult(result: unknown, blockNumber: number): ChainTransaction[] {
  if (!result || typeof result !== 'object') {
    throw new Error(`Empty block ${blockNumber}`);
  }
  return parseRpcBlock(result as Record<string, unknown>);
}

async function fetchOneBlock(url: string, blockNumber: number): Promise<ChainTransaction[]> {
  const data = (await rpcPost(url, {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBlockByNumber',
    params: [toBlockHex(blockNumber), true],
  })) as JsonRpcResponse;
  if (data.error) {
    throw new Error(data.error.message || `RPC error for block ${blockNumber}`);
  }
  return parseBlockResult(data.result, blockNumber);
}

async function fetchBlockBatch(url: string, blockNumbers: number[]): Promise<ChainTransaction[]> {
  if (blockNumbers.length === 1) {
    return fetchOneBlock(url, blockNumbers[0]);
  }
  const payload = blockNumbers.map((n, i) => ({
    jsonrpc: '2.0',
    id: i + 1,
    method: 'eth_getBlockByNumber',
    params: [toBlockHex(n), true],
  }));
  const data = await rpcPost(url, payload);
  if (!Array.isArray(data)) {
    throw new Error('RPC batch not supported');
  }
  const byId = new Map<number, JsonRpcResponse>();
  for (const item of data as JsonRpcResponse[]) {
    if (typeof item?.id === 'number') byId.set(item.id, item);
  }
  const collected: ChainTransaction[] = [];
  for (let i = 0; i < blockNumbers.length; i++) {
    const row = byId.get(i + 1);
    if (!row) throw new Error(`Missing batch result for block ${blockNumbers[i]}`);
    if (row.error) {
      throw new Error(row.error.message || `RPC error for block ${blockNumbers[i]}`);
    }
    collected.push(...parseBlockResult(row.result, blockNumbers[i]));
  }
  return collected;
}

async function fetchChunk(url: string, blockNumbers: number[]): Promise<ChainTransaction[]> {
  try {
    return await fetchBlockBatch(url, blockNumbers);
  } catch {
    const nested = await mapPool(blockNumbers, Math.min(4, blockNumbers.length), (n) =>
      fetchOneBlock(url, n),
    );
    return nested.flat();
  }
}

export async function fetchLatestBlockNumberViaRpc(): Promise<number> {
  return withRpcFallback(
    async (provider) => provider.getBlockNumber(),
    { noFatal: true, isValueOk: (n) => Number.isFinite(n) && n > 0 },
  );
}

/**
 * 拉取 [startBlock, endBlock] 闭区间内每个区块的完整交易列表（未筛选）。
 */
export async function fetchBlockWindowTransactions(
  startBlock: number,
  endBlock: number,
): Promise<ChainTransaction[]> {
  if (endBlock < startBlock) return [];
  const numbers: number[] = [];
  for (let n = startBlock; n <= endBlock; n++) numbers.push(n);
  const batches = chunk(numbers, FOLLOWING_RPC_BATCH_SIZE);

  const nested = await mapPool(batches, FOLLOWING_BLOCK_FETCH_CONCURRENCY, async (batch) => {
    return withRpcFallback(
      async (_provider, rpcUrl) => fetchChunk(rpcUrl, batch),
      { noFatal: true, cycles: 2 },
    );
  });
  return nested.flat();
}
