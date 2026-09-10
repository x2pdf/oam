import { InputDataItem } from '../types';
import { dataSourceManager } from '../datasource/DataSourceManager';
import { applyDisplayPipeline, markAllRaw } from '../display';
import { OAMPClient } from '../oamp/client';
import { DEFAULT_RPC_NODE } from '../config/rpcConfig';
import { getUnlockedWallet } from '../wallet/session';

export const EXPORT_PAGE_SIZE = 20;
/** 每秒最多 3 次请求：两次 fetchAll 间隔至少 334ms */
export const EXPORT_MIN_INTERVAL_MS = 334;

export class ExportAbortedError extends Error {
  constructor() {
    super('Export aborted');
    this.name = 'ExportAbortedError';
  }
}

export interface FetchExportProgress {
  count: number;
  page: number;
}

export interface FetchExportOptions {
  address: string;
  startTs: number;
  endTs: number;
  decrypt: boolean;
  userAddress?: string;
  isAborted: () => boolean;
  onProgress: (info: FetchExportProgress) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwIfAborted(isAborted: () => boolean): void {
  if (isAborted()) throw new ExportAbortedError();
}

async function processItems(
  items: InputDataItem[],
  userAddress: string | undefined,
  decrypt: boolean,
): Promise<InputDataItem[]> {
  try {
    let client: OAMPClient | null = null;
    if (decrypt) {
      const wallet = getUnlockedWallet();
      if (wallet) {
        client = new OAMPClient(wallet.privateKey, DEFAULT_RPC_NODE);
      }
    }
    return await applyDisplayPipeline(items, { userAddress, client });
  } catch (e) {
    console.warn('Export pipeline failed', e);
    return markAllRaw(items);
  }
}

/**
 * 按首页消息 Tab 的 'all' 模式串行翻页拉取（从新到旧），不写入 DataRepository / 首页缓存。
 * 新于结束时间的跳过；落在区间内的收录；有效 timestamp 早于开始时间则停止翻页。
 */
export async function fetchExportMessages(opts: FetchExportOptions): Promise<InputDataItem[]> {
  const { address, startTs, endTs, decrypt, userAddress, isAborted, onProgress } = opts;
  const collected: InputDataItem[] = [];
  let pageParams: Record<string, unknown> | null = {
    offset: EXPORT_PAGE_SIZE,
    items_count: EXPORT_PAGE_SIZE,
  };
  let page = 0;
  let lastRequestAt = 0;
  let reachedStart = false;

  dataSourceManager.clearSkipped();
  onProgress({ count: 0, page: 0 });

  while (pageParams && !reachedStart) {
    throwIfAborted(isAborted);

    const wait = lastRequestAt + EXPORT_MIN_INTERVAL_MS - Date.now();
    if (lastRequestAt > 0 && wait > 0) {
      await sleep(wait);
      throwIfAborted(isAborted);
    }

    lastRequestAt = Date.now();
    const result = await dataSourceManager.fetchAll(address, 'all', pageParams);
    throwIfAborted(isAborted);

    page += 1;
    const processed = await processItems(result.items, userAddress, decrypt);
    throwIfAborted(isAborted);

    for (const item of processed) {
      const ts = item.timestamp || 0;
      if (ts <= 0) continue;
      if (ts > endTs) continue;
      if (ts < startTs) {
        reachedStart = true;
        break;
      }
      collected.push(item);
    }

    onProgress({ count: collected.length, page });

    if (reachedStart) break;

    const next = result.next_page_params;
    pageParams = next
      ? { offset: EXPORT_PAGE_SIZE, items_count: EXPORT_PAGE_SIZE, ...next }
      : null;
  }

  return collected;
}
