import { BaseDataSource } from './BaseDataSource';
import { FetchMode, DataSourceResult, OutgoingTxResult } from './types';
import { DATA_SOURCE_WEIGHTS, API_CONFIG } from '../constants';
import {
  fetchEtherscanStyleTxList,
  getPageOffset,
  toMessageResult,
  toOutgoingResult,
} from './etherscanStyle';

export class EtherscanDataSource extends BaseDataSource {
  name = 'Etherscan';
  weight = DATA_SOURCE_WEIGHTS.ETHERSCAN;

  readonly apiKey = API_CONFIG.ETHERSCAN_API_KEY;

  private buildUrl(address: string, params: any, defaultOffset: string): string {
    if (!API_CONFIG.ETHERSCAN_API_KEY) {
      throw new Error('MISSING_ETHERSCAN_API_KEY');
    }
    const { page, offset } = getPageOffset(params, defaultOffset);
    const urlParams = new URLSearchParams({
      chainid: '1',
      module: 'account',
      action: 'txlist',
      address,
      startblock: '0',
      endblock: '99999999',
      sort: 'desc',
      page,
      offset,
      apikey: API_CONFIG.ETHERSCAN_API_KEY,
    });
    return `${API_CONFIG.ETHERSCAN_BASE_URL}?${urlParams.toString()}`;
  }

  async fetchMessages(address: string, mode: FetchMode, params: any = null): Promise<DataSourceResult> {
    const cleanAddress = address.trim().toLowerCase();
    const txs = await fetchEtherscanStyleTxList(
      this.buildUrl(cleanAddress, params, '20'),
      this.name,
    );
    return toMessageResult(
      txs,
      cleanAddress,
      mode,
      params,
      '20',
      (ts) => this.formatTimestamp(ts),
      (addr) => this.shortenAddress(addr),
    );
  }

  async fetchOutgoingTransactions(address: string, params: any = null): Promise<OutgoingTxResult> {
    const cleanAddress = address.trim().toLowerCase();
    const txs = await fetchEtherscanStyleTxList(
      this.buildUrl(cleanAddress, params, '50'),
      this.name,
    );
    return toOutgoingResult(txs, cleanAddress, params, '50');
  }
}
