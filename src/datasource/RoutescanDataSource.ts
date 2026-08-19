import { BaseDataSource } from './BaseDataSource';
import { FetchMode, DataSourceResult, OutgoingTxResult } from './types';
import { DATA_SOURCE_WEIGHTS, API_CONFIG } from '../constants';
import {
  fetchEtherscanStyleTxList,
  getPageOffset,
  toMessageResult,
  toOutgoingResult,
} from './etherscanStyle';

export class RoutescanDataSource extends BaseDataSource {
  name = 'Routescan';
  weight = DATA_SOURCE_WEIGHTS.ROUTESCAN;

  private buildUrl(address: string, params: any, defaultOffset: string): string {
    const { page, offset } = getPageOffset(params, defaultOffset);
    const urlParams = new URLSearchParams({
      module: 'account',
      action: 'txlist',
      address,
      startblock: '0',
      endblock: '99999999',
      sort: 'desc',
      page,
      offset,
    });
    return `${API_CONFIG.ROUTESCAN_ETHERSCAN_BASE_URL}?${urlParams.toString()}`;
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
