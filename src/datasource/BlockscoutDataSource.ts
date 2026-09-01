import { BaseDataSource } from './BaseDataSource';
import { parseBlockscoutTxList } from './ChainTransaction';
import { FetchMode, DataSourceResult, OutgoingTxResult } from './types';
import { mapTransactionsToMessages, mapTransactionsToOutgoing } from './transactionMapper';
import { DATA_SOURCE_PAGE_SIZE, DATA_SOURCE_WEIGHTS } from '../constants';
import { getBlockRangeParams, parseLatestBlockNumber } from './blockRange';
import { agentLog } from './debugAgentLog';
import { fetchWithTimeout } from './fetchWithTimeout';
import {
  fetchEtherscanStyleBlockRange,
  fetchJson,
  getPageOffset,
  toRangeMessageResult,
} from './etherscanStyle';

function blockscoutQuery(
  extra: Record<string, unknown> | null | undefined = null,
  pageSize: number = DATA_SOURCE_PAGE_SIZE,
): string {
  const query = extra && typeof extra === 'object' ? new URLSearchParams(
    Object.entries(extra).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value != null && key !== 'filter' && key !== 'items_count' && key !== 'offset' && key !== 'page') {
        acc[key] = String(value);
      }
      return acc;
    }, {}),
  ) : new URLSearchParams();
  // Prefer explicit items_count from caller (e.g. black-hole page size), else default.
  const count =
    extra && extra.items_count != null ? Number(extra.items_count) : pageSize;
  query.set('items_count', String(Number.isFinite(count) && count > 0 ? count : pageSize));
  return query.toString();
}

export class BlockscoutDataSource extends BaseDataSource {
  name = 'Blockscout';

  get weight() {
    return DATA_SOURCE_WEIGHTS.BLOCKSCOUT;
  }

  private buildTxlistUrl(address: string, params: any, defaultOffset: string): string {
    const { page, offset } = getPageOffset(params, defaultOffset);
    const urlParams = new URLSearchParams({
      module: 'account',
      action: 'txlist',
      address,
      startblock: params?.startblock != null ? String(params.startblock) : '0',
      endblock: params?.endblock != null ? String(params.endblock) : '99999999',
      sort: 'desc',
      page,
      offset,
    });
    return `https://eth.blockscout.com/api?${urlParams.toString()}`;
  }

  async fetchLatestBlockNumber(): Promise<number> {
    const data = await fetchJson('https://eth.blockscout.com/api/v2/stats', this.name);
    return parseLatestBlockNumber(data.total_blocks);
  }

  async fetchMessages(address: string, mode: FetchMode, params: any = null): Promise<DataSourceResult> {
    const cleanAddress = address.trim().toLowerCase();
    const range = getBlockRangeParams(params);
    if (range) {
      const txs = await fetchEtherscanStyleBlockRange(
        (page, offset) => this.buildTxlistUrl(
          cleanAddress,
          { ...params, page, offset, startblock: range.start, endblock: range.end },
          offset,
        ),
        this.name,
        range.pageSize,
      );
      return toRangeMessageResult(
        txs,
        cleanAddress,
        mode,
        range.start,
        range.end,
        (ts) => this.formatTimestamp(ts),
        (addr) => this.shortenAddress(addr),
      );
    }
    const pageSize = Number(params?.items_count ?? params?.offset ?? DATA_SOURCE_PAGE_SIZE);
    const query = blockscoutQuery(params, Number.isFinite(pageSize) && pageSize > 0 ? pageSize : DATA_SOURCE_PAGE_SIZE);
    const baseUrl = `https://eth.blockscout.com/api/v2/addresses/${cleanAddress}/transactions?${query}`;

    // #region agent log
    const fetchStartedAt = Date.now();
    agentLog(
      'BlockscoutDataSource.ts:fetchMessages:before',
      'Blockscout fetch start',
      { urlHost: 'eth.blockscout.com', hasParams: !!params },
      'A',
    );
    // #endregion
    let response: Response;
    try {
      response = await fetchWithTimeout(baseUrl);
      // #region agent log
      agentLog(
        'BlockscoutDataSource.ts:fetchMessages:after',
        'Blockscout fetch returned',
        { ok: response.ok, status: response.status, durationMs: Date.now() - fetchStartedAt },
        'A',
      );
      // #endregion
    } catch (err) {
      // #region agent log
      agentLog(
        'BlockscoutDataSource.ts:fetchMessages:throw',
        'Blockscout fetch threw',
        {
          durationMs: Date.now() - fetchStartedAt,
          reason: err instanceof Error ? err.message : String(err),
        },
        'D',
      );
      // #endregion
      throw err;
    }
    if (!response.ok) {
      throw new Error(`Blockscout API error: ${response.statusText}`);
    }
    const data = await response.json();

    const txs = parseBlockscoutTxList(data.items || []);
    const items = mapTransactionsToMessages(
      txs,
      cleanAddress,
      mode,
      (ts) => this.formatTimestamp(ts),
      (addr) => this.shortenAddress(addr),
    );

    return {
      items,
      rawTransactions: txs,
      next_page_params: data.next_page_params || null
    };
  }

  async fetchOutgoingTransactions(address: string, params: any = null): Promise<OutgoingTxResult> {
    const cleanAddress = address.trim().toLowerCase();
    const query = new URLSearchParams(blockscoutQuery(params));
    query.set('filter', 'from');
    const url = `https://eth.blockscout.com/api/v2/addresses/${cleanAddress}/transactions?${query.toString()}`;

    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`Blockscout API error: ${response.statusText}`);
    }
    const data = await response.json();
    const txs = parseBlockscoutTxList(data.items || []);

    return {
      items: mapTransactionsToOutgoing(txs, cleanAddress),
      next_page_params: data.next_page_params || null,
    };
  }
}
