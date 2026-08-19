import { BaseDataSource } from './BaseDataSource';
import { parseBlockscoutTxList } from './ChainTransaction';
import { FetchMode, DataSourceResult, OutgoingTxResult } from './types';
import { mapTransactionsToMessages, mapTransactionsToOutgoing } from './transactionMapper';
import { DATA_SOURCE_WEIGHTS } from '../constants';

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

    const response = await fetch(baseUrl);
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

    const response = await fetch(url);
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
