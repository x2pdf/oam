import { useCallback, useEffect, useRef, useState } from 'react';
import { InputDataItem } from '../types';
import { ChainTransaction } from './ChainTransaction';
import { cacheService } from './cacheService';
import { mapToInputDataItem } from './transactionMapper';
import { applyDisplayPipeline } from '../display';
import { OAMPClient } from '../oamp/client';
import { DEFAULT_RPC_NODE } from '../config/rpcConfig';
import { getUnlockedWallet } from '../wallet/session';
import { shortenAddress } from '../utils/address';
import { withRpcFallback } from '../rpc/rpcClient';
import { normalizeTxRef } from '../mypayload';

export type RefResult =
  | { state: 'ok'; item: InputDataItem }
  | { state: 'missing' }
  | { state: 'error' }
  | { state: 'unreadable'; reason: 'encrypted' | 'not-oam' };

export type RefViewState = { state: 'loading' } | RefResult;

/** 负缓存时长：链上查不到的引用，10 分钟内不再自动重查（手动重试可绕过）。 */
export const REF_MISSING_TTL_MS = 10 * 60 * 1000;
/** 网络错误只在内存里短暂记住，避免列表滚动时反复请求。 */
const ERROR_TTL_MS = 30 * 1000;
const MEMORY_LIMIT = 300;
const MAX_CONCURRENT_FETCH = 3;

const memory = new Map<string, RefResult>();
const errorMarks = new Map<string, number>();
const inflight = new Map<string, Promise<RefResult>>();

let activeFetches = 0;
const waiters: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeFetches >= MAX_CONCURRENT_FETCH) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  activeFetches++;
  try {
    return await fn();
  } finally {
    activeFetches--;
    waiters.shift()?.();
  }
}

function remember(hash: string, result: RefResult): void {
  // 加密结果依赖当前钱包解锁状态，不做内存记忆。
  if (result.state === 'unreadable' && result.reason === 'encrypted') return;
  // 负缓存的时效由数据库里的 checkedAt 控制，内存不能让 missing 永久生效。
  if (result.state === 'missing') return;
  memory.delete(hash);
  memory.set(hash, result);
  if (memory.size > MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
}

function formatTimestamp(): string {
  return '';
}

async function fetchFromRpc(hash: string): Promise<ChainTransaction | null | 'error'> {
  let nulls = 0;
  let errors = 0;
  try {
    const tx = await withRpcFallback(
      async (provider) => {
        try {
          const found = await provider.getTransaction(hash);
          if (!found) nulls++;
          return found;
        } catch (e) {
          errors++;
          throw e;
        }
      },
      { cycles: 1, isValueOk: (v) => v != null && v.hash?.toLowerCase() === hash },
    );
    if (!tx) return null;
    return new ChainTransaction({
      hash,
      from: tx.from ?? '',
      to: tx.to ?? '',
      input: tx.data ?? '',
      value: tx.value != null ? tx.value.toString() : '0',
      timestamp: 0,
      blockNumber: tx.blockNumber != null ? String(tx.blockNumber) : undefined,
      gas: tx.gasLimit != null ? tx.gasLimit.toString() : undefined,
      gasPrice: tx.gasPrice != null ? tx.gasPrice.toString() : undefined,
      nonce: String(tx.nonce),
      isError: false,
    });
  } catch {
    // 只有“有节点明确答复查不到、且没有任何网络错误”才认定为不存在。
    return nulls > 0 && errors === 0 ? null : 'error';
  }
}

async function buildResult(tx: ChainTransaction): Promise<RefResult> {
  const wallet = getUnlockedWallet();
  const client = wallet ? new OAMPClient(wallet.privateKey, DEFAULT_RPC_NODE) : null;
  const base = mapToInputDataItem(tx, 'all', '', formatTimestamp, shortenAddress);
  const [item] = await applyDisplayPipeline([base], { userAddress: wallet?.address, client });
  if (!item) return { state: 'unreadable', reason: 'not-oam' };
  if (item.contentKind === 'OAMP_ENCRYPTED') return { state: 'unreadable', reason: 'encrypted' };
  // OAMP / UTF-8 / RAW 都交给引用卡片展示；无可读文本时卡片退化为显示交易 ID。
  return { state: 'ok', item };
}

async function doResolve(hash: string, force: boolean): Promise<RefResult> {
  const local = await cacheService.getTransactionByHash(hash);
  if (local) return buildResult(local);

  if (!force) {
    const status = await cacheService.getRefStatus(hash);
    if (status?.status === 'missing' && Date.now() - status.checkedAt < REF_MISSING_TTL_MS) {
      return { state: 'missing' };
    }
    const errAt = errorMarks.get(hash);
    if (errAt && Date.now() - errAt < ERROR_TTL_MS) return { state: 'error' };
  }

  const fetched = await withSlot(() => fetchFromRpc(hash));
  if (fetched === 'error') {
    errorMarks.set(hash, Date.now());
    return { state: 'error' };
  }
  errorMarks.delete(hash);
  if (!fetched) {
    await cacheService.markRefMissing(hash);
    return { state: 'missing' };
  }
  await cacheService.saveReferencedTransaction(fetched);
  return buildResult(fetched);
}

/** 解析被引用的交易：内存 → 本地库 → RPC，并发去重。 */
export function resolveRef(rawHash: string, opts: { force?: boolean } = {}): Promise<RefResult> {
  const hash = normalizeTxRef(rawHash);
  if (!hash) return Promise.resolve({ state: 'missing' });
  const force = !!opts.force;

  if (!force) {
    const cached = memory.get(hash);
    if (cached) return Promise.resolve(cached);
  }
  const running = inflight.get(hash);
  if (running) return running;

  const promise = doResolve(hash, force)
    .catch((e): RefResult => {
      console.warn('resolveRef failed:', hash, e);
      errorMarks.set(hash, Date.now());
      return { state: 'error' };
    })
    .then((result) => {
      if (result.state !== 'error') remember(hash, result);
      else memory.delete(hash);
      return result;
    })
    .finally(() => {
      inflight.delete(hash);
    });
  inflight.set(hash, promise);
  return promise;
}

export function peekRef(rawHash: string): RefResult | null {
  const hash = normalizeTxRef(rawHash);
  return hash ? memory.get(hash) ?? null : null;
}

/** 渲染期懒加载被引用交易；retry() 绕过负缓存强制重查。 */
export function useReferencedTx(rawHash: string): { view: RefViewState; retry: () => void } {
  const hash = normalizeTxRef(rawHash);
  const [view, setView] = useState<RefViewState>(() =>
    hash ? memory.get(hash) ?? { state: 'loading' } : { state: 'missing' },
  );
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hash) {
      setView({ state: 'missing' });
      return;
    }
    const cached = memory.get(hash);
    if (cached) {
      setView(cached);
      return;
    }
    setView({ state: 'loading' });
    let cancelled = false;
    resolveRef(hash).then((r) => {
      if (!cancelled && alive.current) setView(r);
    });
    return () => {
      cancelled = true;
    };
  }, [hash]);

  const retry = useCallback(() => {
    if (!hash) return;
    setView({ state: 'loading' });
    resolveRef(hash, { force: true }).then((r) => {
      if (alive.current) setView(r);
    });
  }, [hash]);

  return { view, retry };
}
