import { IDataSource, FetchMode, DataSourceResult, OutgoingTxResult } from './types';
import { BlockscoutDataSource } from './BlockscoutDataSource';
import { EtherscanDataSource } from './EtherscanDataSource';
import { API_CONFIG } from '../constants';

export class DataSourceManager {
  private static instance: DataSourceManager;
  private sources: IDataSource[] = [];

  private constructor() {
    this.sources.push(new BlockscoutDataSource());
    this.sources.push(new EtherscanDataSource());
  }

  public static getInstance(): DataSourceManager {
    if (!DataSourceManager.instance) {
      DataSourceManager.instance = new DataSourceManager();
    }
    return DataSourceManager.instance;
  }

  /**
   * 按 weight 从高到低。未配置 Key 时跳过 Etherscan；
   * 已配置时优先走 Etherscan，避免部分 Android 网络上 Blockscout TLS 失败。
   */
  private getOrderedSources(): IDataSource[] {
    const etherscanReady = !!API_CONFIG.ETHERSCAN_API_KEY;
    return this.sources
      .filter((source) => !(source instanceof EtherscanDataSource) || etherscanReady)
      .sort((a, b) => {
        const boost = (source: IDataSource) =>
          source instanceof EtherscanDataSource && etherscanReady ? 1000 : 0;
        return b.weight + boost(b) - (a.weight + boost(a));
      });
  }

  /**
   * 按 weight 从高到低依次查询；只有抛错才换下一个源。
   * 某源成功（含空列表）即视为最终结果。
   */
  private async queryByWeight<T>(run: (source: IDataSource) => Promise<T>): Promise<T> {
    const sources = this.getOrderedSources();
    if (sources.length === 0) {
      throw new Error('MISSING_ETHERSCAN_API_KEY');
    }

    let lastError: unknown = null;

    for (const source of sources) {
      try {
        console.log(`Attempting to fetch from source: ${source.name}`);
        return await run(source);
      } catch (err) {
        console.log(`Source ${source.name} failed, trying next source if available.`);
        lastError = err;
      }
    }

    if (!API_CONFIG.ETHERSCAN_API_KEY) {
      throw new Error('MISSING_ETHERSCAN_API_KEY');
    }

    throw lastError || new Error('All data sources failed to fetch data');
  }

  async fetchAll(address: string, mode: FetchMode, params: any = null): Promise<DataSourceResult> {
    return this.queryByWeight((source) => source.fetchMessages(address, mode, params));
  }

  async fetchOutgoingTransactions(address: string, params: any = null): Promise<OutgoingTxResult> {
    return this.queryByWeight((source) => source.fetchOutgoingTransactions(address, params));
  }
}

export const dataSourceManager = DataSourceManager.getInstance();
