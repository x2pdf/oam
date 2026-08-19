import { IDataSource, FetchMode, DataSourceResult, OutgoingTxResult } from './types';
import { BlockscoutDataSource } from './BlockscoutDataSource';
import { RoutescanDataSource } from './RoutescanDataSource';
import { EtherscanDataSource } from './EtherscanDataSource';
import { API_CONFIG, MAX_DATA_SOURCE_CYCLES } from '../constants';

export class DataSourceManager {
  private static instance: DataSourceManager;
  private sources: IDataSource[] = [];
  /** 本会话内已失败的源，后续请求跳过，避免每个页签都再等一轮 Blockscout。 */
  private skipped = new Set<string>();

  private constructor() {
    this.sources.push(new BlockscoutDataSource());
    this.sources.push(new RoutescanDataSource());
    this.sources.push(new EtherscanDataSource());
  }

  public static getInstance(): DataSourceManager {
    if (!DataSourceManager.instance) {
      DataSourceManager.instance = new DataSourceManager();
    }
    return DataSourceManager.instance;
  }

  /**
   * 顺序：Blockscout → Routescan → Etherscan（无 Key 则跳过 Etherscan）。
   */
  private getOrderedSources(): IDataSource[] {
    return [...this.sources]
      .filter((source) => {
        if (this.skipped.has(source.name)) return false;
        if (source instanceof EtherscanDataSource && !API_CONFIG.ETHERSCAN_API_KEY) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.weight - a.weight);
  }

  /**
   * 按 weight 从高到低依次查询；只有抛错才换下一个源。
   * 某源成功（含空列表）即视为最终结果。
   * 若一轮内全部失败，最多再循环所有源 MAX_DATA_SOURCE_CYCLES 次，以便短暂故障恢复后自动重试。
   */
  private async queryByWeight<T>(run: (source: IDataSource) => Promise<T>): Promise<T> {
    const sources = this.getOrderedSources();
    if (sources.length === 0) {
      throw new Error('No data sources available');
    }

    let lastError: unknown = null;

    for (let cycle = 1; cycle <= MAX_DATA_SOURCE_CYCLES; cycle++) {
      const isLastCycle = cycle === MAX_DATA_SOURCE_CYCLES;

      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        const next = sources[i + 1];
        try {
          console.log(
            `Attempting to fetch from source: ${source.name} (cycle ${cycle}/${MAX_DATA_SOURCE_CYCLES})`,
          );
          return await run(source);
        } catch (err) {
          if (isLastCycle) {
            this.skipped.add(source.name);
          }
          const reason = err instanceof Error ? err.message : String(err);
          if (next) {
            console.log(`Source ${source.name} failed (${reason}), trying next source: ${next.name}`);
          } else if (!isLastCycle) {
            console.log(
              `All sources failed in cycle ${cycle}/${MAX_DATA_SOURCE_CYCLES}, retrying...`,
            );
          } else {
            console.log(`Source ${source.name} failed (${reason}), no more sources.`);
          }
          lastError = err;
        }
      }
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
