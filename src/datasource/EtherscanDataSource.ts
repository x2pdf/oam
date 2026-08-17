import { BaseDataSource } from './BaseDataSource';
import { FetchMode, DataSourceResult } from './types';
import { DATA_SOURCE_WEIGHTS, API_CONFIG } from '../constants';

export class EtherscanDataSource extends BaseDataSource {
  name = 'Etherscan';
  weight = DATA_SOURCE_WEIGHTS.ETHERSCAN;

  async fetchMessages(address: string, mode: FetchMode, params: any = null): Promise<DataSourceResult> {
    if (!API_CONFIG.ETHERSCAN_API_KEY) {
      throw new Error('MISSING_ETHERSCAN_API_KEY');
    }
    const cleanAddress = address.trim().toLowerCase();

    // Etherscan API parameters
    // https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=...
    const urlParams = new URLSearchParams({
      chainid: '1',
      module: 'account',
      action: 'txlist',
      address: cleanAddress,
      startblock: '0',
      endblock: '99999999',
      sort: 'desc',
      apikey: API_CONFIG.ETHERSCAN_API_KEY,
    });

    // Handle pagination if etherscan provides it (usually page and offset)
    if (params) {
       if (params.page) urlParams.append('page', params.page);
       if (params.offset) urlParams.append('offset', params.offset);
    } else {
        urlParams.append('page', '1');
        urlParams.append('offset', '20'); // Default page size
    }

    const url = `${API_CONFIG.ETHERSCAN_BASE_URL}?${urlParams.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Etherscan API error: ${response.statusText}`);
      }
      const data = await response.json();

      if (data.status !== '1' && data.message !== 'No transactions found') {
        throw new Error(`Etherscan API error: ${data.result || data.message}`);
      }

      const txs = data.result || [];

      // Etherscan doesn't return a "next page params" like Blockscout in a single field,
      // we usually need to increment the page number.
      const currentPage = parseInt(urlParams.get('page') || '1');
      const next_page_params = txs.length === 20 ? { page: (currentPage + 1).toString(), offset: '20' } : null;

      const items = txs
        .filter((tx: any) => {
          const hasInput = tx.input && tx.input !== '0x';
          if (!hasInput) return false;

          const from = tx.from?.toLowerCase();
          const to = tx.to?.toLowerCase();

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
          const decoded = this.decodeHex(tx.input);
          const lastActive = this.formatTimestamp(parseInt(tx.timeStamp));

          let displayAddr = 'Unknown';
          let displayName = 'Message';

          if (mode === 'self') {
            displayAddr = cleanAddress;
            displayName = 'Self Message';
          } else if (mode === 'square' || mode === 'inbox') {
            displayAddr = tx.from || 'Unknown';
            displayName = `From: ${this.shortenAddress(displayAddr)}`;
          } else {
            displayAddr = tx.to || 'Unknown';
            displayName = `To: ${this.shortenAddress(displayAddr)}`;
          }

          return {
            id: tx.hash,
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
      console.error('EtherscanDataSource error:', error);
      throw error;
    }
  }
}
