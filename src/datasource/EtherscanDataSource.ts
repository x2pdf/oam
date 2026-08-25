import { BaseDataSource } from './BaseDataSource';
import { FetchMode, DataSourceResult, OutgoingTxResult } from './types';
import { DATA_SOURCE_WEIGHTS, API_CONFIG, DATA_SOURCE_PAGE_SIZE } from '../constants';
import {
  fetchEtherscanStyleTxList,
  getPageOffset,
  toMessageResult,
  toOutgoingResult,
} from './etherscanStyle';

export class EtherscanDataSource extends BaseDataSource {
  name = 'Etherscan';
  requiresApiKey = true;

  get weight() {
    return DATA_SOURCE_WEIGHTS.ETHERSCAN;
  }

  get apiKey() {
    return API_CONFIG.ETHERSCAN_API_KEY;
  }

  private buildUrl(address: string, params: any, defaultOffset: string): string {
    if (!this.apiKey) {
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
      apikey: this.apiKey,
    });
    return `${API_CONFIG.ETHERSCAN_BASE_URL}?${urlParams.toString()}`;
  }

  async fetchMessages(address: string, mode: FetchMode, params: any = null): Promise<DataSourceResult> {
    const cleanAddress = address.trim().toLowerCase();
    const pageSize = String(params?.offset ?? params?.items_count ?? DATA_SOURCE_PAGE_SIZE);
    const txs = await fetchEtherscanStyleTxList(
      this.buildUrl(cleanAddress, params, pageSize),
      this.name,
    );
    return toMessageResult(
      txs,
      cleanAddress,
      mode,
      params,
      pageSize,
      (ts) => this.formatTimestamp(ts),
      (addr) => this.shortenAddress(addr),
    );
  }

  async fetchOutgoingTransactions(address: string, params: any = null): Promise<OutgoingTxResult> {
    const cleanAddress = address.trim().toLowerCase();
    const pageSize = String(DATA_SOURCE_PAGE_SIZE);
    const txs = await fetchEtherscanStyleTxList(
      this.buildUrl(cleanAddress, params, pageSize),
      this.name,
    );
    return toOutgoingResult(txs, cleanAddress, params, pageSize);
  }
}
