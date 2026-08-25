import { BaseDataSource } from './BaseDataSource';
import { parseBlockscoutTxList } from './ChainTransaction';
import { FetchMode, DataSourceResult, OutgoingTxResult } from './types';
import { mapTransactionsToMessages, mapTransactionsToOutgoing } from './transactionMapper';
import { DATA_SOURCE_PAGE_SIZE, DATA_SOURCE_WEIGHTS } from '../constants';
import { agentLog } from './debugAgentLog';
import { fetchWithTimeout } from './fetchWithTimeout';

function blockscoutQuery(extra: Record<string, unknown> | null | undefined = null): string {
  const query = extra && typeof extra === 'object' ? new URLSearchParams(
    Object.entries(extra).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value != null && key !== 'filter') acc[key] = String(value);
      return acc;
    }, {}),
  ) : new URLSearchParams();
  query.set('items_count', String(DATA_SOURCE_PAGE_SIZE));
  return query.toString();
}

export class BlockscoutDataSource extends BaseDataSource {
  name = 'Blockscout';

  get weight() {
    return DATA_SOURCE_WEIGHTS.BLOCKSCOUT;
  }

  async fetchMessages(address: string, mode: FetchMode, params: any = null): Promise<DataSourceResult> {
    const cleanAddress = address.trim().toLowerCase();
    const query = blockscoutQuery(params);
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

    return { items, next_page_params: data.next_page_params || null };
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
