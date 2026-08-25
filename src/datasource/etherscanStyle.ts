import { parseEtherscanTxList } from './ChainTransaction';
import { fetchWithTimeout } from './fetchWithTimeout';
import { FetchMode, DataSourceResult, OutgoingTxResult } from './types';
import { mapTransactionsToMessages, mapTransactionsToOutgoing } from './transactionMapper';

export function getPageOffset(params: any, defaultOffset: string) {
  return {
    page: params?.page ? String(params.page) : '1',
    offset: params?.offset ? String(params.offset) : defaultOffset,
  };
}

export async function fetchJson(url: string, sourceName: string): Promise<any> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`${sourceName} API error: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchEtherscanStyleTxList(url: string, sourceName: string): Promise<any[]> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`${sourceName} API error: ${response.statusText}`);
  }
  const data = await response.json();
  if (data.status !== '1' && data.message !== 'No transactions found') {
    throw new Error(`${sourceName} API error: ${data.result || data.message}`);
  }
  return Array.isArray(data.result) ? data.result : [];
}

export async function fetchEtherscanStyleBlockRange(
  buildUrl: (page: string, offset: string) => string,
  sourceName: string,
  pageSize: number,
  maxPages: number = 10,
): Promise<any[]> {
  const collected: any[] = [];
  const size = Math.max(1, pageSize);
  for (let page = 1; page <= maxPages; page++) {
    const txs = await fetchEtherscanStyleTxList(buildUrl(String(page), String(size)), sourceName);
    collected.push(...txs);
    if (txs.length < size) break;
  }
  return collected;
}

export function nextPageParams(txsLength: number, page: string, offset: string) {
  const pageSize = parseInt(offset, 10);
  return txsLength === pageSize ? { page: String(parseInt(page, 10) + 1), offset } : null;
}

export function toMessageResult(
  rawTxs: unknown[],
  cleanAddress: string,
  mode: FetchMode,
  params: any,
  defaultOffset: string,
  formatTimestamp: (ts: number) => string,
  shortenAddress: (addr: string) => string,
): DataSourceResult {
  const { page, offset } = getPageOffset(params, defaultOffset);
  const txs = parseEtherscanTxList(rawTxs);
  return {
    items: mapTransactionsToMessages(txs, cleanAddress, mode, formatTimestamp, shortenAddress),
    next_page_params: nextPageParams(rawTxs.length, page, offset),
  };
}

export function toRangeMessageResult(
  rawTxs: unknown[],
  cleanAddress: string,
  mode: FetchMode,
  startBlock: number,
  endBlock: number,
  formatTimestamp: (ts: number) => string,
  shortenAddress: (addr: string) => string,
): DataSourceResult {
  const txs = parseEtherscanTxList(rawTxs);
  return {
    items: mapTransactionsToMessages(txs, cleanAddress, mode, formatTimestamp, shortenAddress),
    next_page_params: null,
    blocksScanned: endBlock - startBlock + 1,
  };
}

export function toOutgoingResult(
  rawTxs: unknown[],
  cleanAddress: string,
  params: any,
  defaultOffset: string,
): OutgoingTxResult {
  const { page, offset } = getPageOffset(params, defaultOffset);
  const txs = parseEtherscanTxList(rawTxs);
  return {
    items: mapTransactionsToOutgoing(txs, cleanAddress),
    next_page_params: nextPageParams(rawTxs.length, page, offset),
  };
}
