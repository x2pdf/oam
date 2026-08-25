import { BaseDataSource } from './BaseDataSource';
import { FetchMode, DataSourceResult, OutgoingTxResult } from './types';
import { DATA_SOURCE_WEIGHTS, API_CONFIG, DATA_SOURCE_PAGE_SIZE } from '../constants';
import {
  fetchEtherscanStyleTxList,
  getPageOffset,
  toMessageResult,
  toOutgoingResult,
} from './etherscanStyle';

export class RoutescanDataSource extends BaseDataSource {
  name = 'Routescan';

  get weight() {
    return DATA_SOURCE_WEIGHTS.ROUTESCAN;
  }

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
