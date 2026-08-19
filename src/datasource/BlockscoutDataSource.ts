import { BaseDataSource } from './BaseDataSource';
import { FetchMode, DataSourceResult, OutgoingTx, OutgoingTxResult } from './types';
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

    const txs = data.items || [];
    const next_page_params = data.next_page_params || null;

    const items = txs
      .filter((tx: any) => {
        const hasInput = tx.raw_input && tx.raw_input !== '0x';
        if (!hasInput) return false;

        const from = tx.from?.hash?.toLowerCase();
        const to = tx.to?.hash?.toLowerCase();

        if (mode === 'self') {
          return from === cleanAddress && to === cleanAddress;
        } else if (mode === 'square') {
          return to === cleanAddress;
        } else if (mode === 'sent') {
          return from === cleanAddress;
        } else {
          return to === cleanAddress;
        }
      })
      .map((tx: any) => {
        const lastActive = tx.timestamp
          ? this.formatTimestamp(Math.floor(new Date(tx.timestamp).getTime() / 1000))
          : 'Unknown';

        let displayAddr = 'Unknown';
        let displayName = 'Message';

        if (mode === 'self') {
          displayAddr = cleanAddress;
          displayName = 'Self Message';
        } else if (mode === 'square' || mode === 'inbox') {
          displayAddr = tx.from?.hash || 'Unknown';
          displayName = `From: ${this.shortenAddress(displayAddr)}`;
        } else {
          displayAddr = tx.to?.hash || 'Unknown';
          displayName = `To: ${this.shortenAddress(displayAddr)}`;
        }

        return {
          id: tx.hash,
          name: displayName,
          address: displayAddr,
          from: tx.from?.hash,
          to: tx.to?.hash,
          description: '',
          balance: `${(parseInt(tx.value || '0') / 1e18).toFixed(4)} ETH`,
          txCount: 1,
          lastActive: lastActive,
          rawInput: tx.raw_input,
        };
      });

    return { items, next_page_params };
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
    const txs = data.items || [];

    const items: OutgoingTx[] = [];
    for (const tx of txs) {
      const hash = tx.hash;
      if (!hash) continue;
      const from = tx.from?.hash?.toLowerCase();
      if (from && from !== cleanAddress) continue;
      items.push({ hash, from: tx.from?.hash });
    }

    return { items, next_page_params: data.next_page_params || null };
  }
}
