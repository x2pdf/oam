import { BaseDataSource } from './BaseDataSource';
import { FetchMode, DataSourceResult } from './types';
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

    try {
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
          const decoded = this.decodeHex(tx.raw_input);
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
            id: `bs-${tx.hash.slice(0, 10)}`,
            name: displayName,
            address: displayAddr,
            description: decoded,
            balance: `${(parseInt(tx.value || '0') / 1e18).toFixed(4)} ETH`,
            txCount: 1,
            lastActive: lastActive,
          };
        })
        .filter((item: any) => item.description.trim().length > 0);

      return { items, next_page_params };
    } catch (error) {
      console.error('BlockscoutDataSource error:', error);
      throw error;
    }
  }
}
