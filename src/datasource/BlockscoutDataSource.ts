import { BaseDataSource } from './BaseDataSource';
import { parseBlockscoutTxList } from './ChainTransaction';
import { FetchMode, DataSourceResult, OutgoingTxResult } from './types';
import { mapTransactionsToMessages, mapTransactionsToOutgoing } from './transactionMapper';
import { DATA_SOURCE_WEIGHTS } from '../constants';
import { agentLog } from './debugAgentLog';

export class BlockscoutDataSource extends BaseDataSource {
  name = 'Blockscout';
  weight = DATA_SOURCE_WEIGHTS.BLOCKSCOUT;

  async fetchMessages(address: string, mode: FetchMode, params: any = null): Promise<DataSourceResult> {
    const cleanAddress = address.trim().toLowerCase();
    let baseUrl = `https://eth.blockscout.com/api/v2/addresses/${cleanAddress}/transactions`;

    if (params) {
      const query = new URLSearchParams(params).toString();
      baseUrl += `?${query}`;
    }

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
      response = await fetch(baseUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        },
      });
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
    const query = new URLSearchParams({ filter: 'from' });
    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([key, value]) => {
        if (value != null && key !== 'filter') {
          query.set(key, String(value));
        }
      });
    }

    const url = `https://eth.blockscout.com/api/v2/addresses/${cleanAddress}/transactions?${query.toString()}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      },
    });
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
