import { IDataSource, FetchMode, DataSourceResult, OutgoingTxResult } from './types';
import { BlockscoutDataSource } from './BlockscoutDataSource';
import { RoutescanDataSource } from './RoutescanDataSource';
import { EtherscanDataSource } from './EtherscanDataSource';
import { API_CONFIG, MAX_DATA_SOURCE_CYCLES } from '../constants';
import { agentLog } from './debugAgentLog';

// #region agent log
let queryInflight = 0;
// #endregion

export class DataSourceManager {
  private static instance: DataSourceManager;
  private sources: IDataSource[] = [];
  /** 本会话内已失败的源，后续请求跳过，避免每个页签都再等一轮 Blockscout。 */
  private skipped = new Set<string>();
  private querySeq = 0;

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
   * 顺序：Routescan → Blockscout → Etherscan（无 Key 则跳过 Etherscan）。
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
  private async queryByWeight<T>(
    run: (source: IDataSource) => Promise<T>,
    label: string,
  ): Promise<T> {
    const sources = this.getOrderedSources();
    const queryId = ++this.querySeq;
    queryInflight += 1;
    // #region agent log
    agentLog(
      'DataSourceManager.ts:queryByWeight:entry',
      'queryByWeight start',
      {
        queryId,
        label,
        inflight: queryInflight,
        sourceNames: sources.map((s) => s.name),
        sourceCount: sources.length,
        skipped: Array.from(this.skipped),
        hasEtherscanKey: !!API_CONFIG.ETHERSCAN_API_KEY,
      },
      'B',
    );
    // #endregion
    try {
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
            const startedAt = Date.now();
            // #region agent log
            agentLog(
              'DataSourceManager.ts:queryByWeight:attempt',
              'attempt source',
              {
                queryId,
                label,
                source: source.name,
                index: i,
                cycle,
                next: next?.name ?? null,
                inflight: queryInflight,
              },
              'C',
            );
            const hangTimer = setTimeout(() => {
              agentLog(
                'DataSourceManager.ts:queryByWeight:hang',
                'source still pending after 8s',
                {
                  queryId,
                  label,
                  source: source.name,
                  cycle,
                  waitedMs: Date.now() - startedAt,
                },
                'A',
              );
            }, 8000);
            // #endregion
            try {
              const result = await run(source);
              // #region agent log
              clearTimeout(hangTimer);
              agentLog(
                'DataSourceManager.ts:queryByWeight:success',
                'source succeeded',
                {
                  queryId,
                  label,
                  source: source.name,
                  cycle,
                  durationMs: Date.now() - startedAt,
                },
                'E',
              );
              // #endregion
              return result;
            } finally {
              clearTimeout(hangTimer);
            }
          } catch (err) {
            // #region agent log
            agentLog(
              'DataSourceManager.ts:queryByWeight:catch',
              'source failed, failover',
              {
                queryId,
                label,
                source: source.name,
                cycle,
                next: next?.name ?? null,
                isLastCycle,
                reason: err instanceof Error ? err.message : String(err),
              },
              'D',
            );
            // #endregion
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
    } finally {
      queryInflight -= 1;
      // #region agent log
      agentLog(
        'DataSourceManager.ts:queryByWeight:exit',
        'queryByWeight exit',
        { queryId, label, inflight: queryInflight },
        'B',
      );
      // #endregion
    }
  }

  async fetchAll(address: string, mode: FetchMode, params: any = null): Promise<DataSourceResult> {
    return this.queryByWeight(
      (source) => source.fetchMessages(address, mode, params),
      `fetchAll:${mode}`,
    );
  }

  async fetchOutgoingTransactions(address: string, params: any = null): Promise<OutgoingTxResult> {
    return this.queryByWeight(
      (source) => source.fetchOutgoingTransactions(address, params),
      'fetchOutgoing',
    );
  }
}

export const dataSourceManager = DataSourceManager.getInstance();
