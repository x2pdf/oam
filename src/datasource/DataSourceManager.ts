import { IDataSource, FetchMode, DataSourceResult, OutgoingTxResult } from './types';
import { BlockscoutDataSource } from './BlockscoutDataSource';
import { RoutescanDataSource } from './RoutescanDataSource';
import { EtherscanDataSource } from './EtherscanDataSource';
import { MAX_DATA_SOURCE_CYCLES } from '../constants';
import { agentLog } from './debugAgentLog';
import { isBlackHoleAddress } from '../utils/address';

// #region agent log
let queryInflight = 0;
// #endregion

export class DataSourceManager {
  private static instance: DataSourceManager;
  private sources: IDataSource[] = [];
  /** 允许外部覆盖默认权重的映射表 (name -> weight) */
  private customWeights: Record<string, number> = {};
  /** 本会话内已失败的源，后续请求跳过，避免每个页签都再等一轮 Blockscout。 */
  private skipped = new Set<string>();
  private querySeq = 0;

  private constructor() {
    this.sources.push(new BlockscoutDataSource());
    this.sources.push(new RoutescanDataSource());
    this.sources.push(new EtherscanDataSource());
  }

  public getSources(): IDataSource[] {
    return [...this.sources];
  }

  /**
   * 清除本会话中已跳过（因为连续失败）的源。
   * 当用户手动刷新或网络状态变更重试时调用。
   */
  public clearSkipped() {
    this.skipped.clear();
  }

  public static getInstance(): DataSourceManager {
    if (!DataSourceManager.instance) {
      DataSourceManager.instance = new DataSourceManager();
    }
    return DataSourceManager.instance;
  }

  /**
   * 更新全局权重配置
   */
  public updateWeights(weights: Record<string, number>) {
    this.customWeights = { ...weights };
  }

  /**
   * 获取数据源的最终权重（如果有自定义则使用自定义，否则使用默认值）
   */
  private getWeight(source: IDataSource): number {
    return this.customWeights[source.name] ?? source.weight;
  }

  /**
   * 按权重降序排列的可用数据源（本会话内已 skipped 的除外）。
   */
  private getOrderedSources(): IDataSource[] {
    return [...this.sources]
      .filter((source) => !this.skipped.has(source.name))
      .sort((a, b) => this.getWeight(b) - this.getWeight(a));
  }

  /**
   * 对给定数据源列表按 weight 从高到低依次查询；只有抛错才换下一个源。
   * 某源成功（含空列表）即视为最终结果。
   * 若一轮内全部失败，最多再循环所有源 MAX_DATA_SOURCE_CYCLES 次，以便短暂故障恢复后自动重试。
   * 最后一轮失败后将该源加入 skipped 集合。
   */
  private async trySourceList<T>(
    sources: IDataSource[],
    run: (source: IDataSource) => Promise<T>,
    label: string,
    queryId: number,
  ): Promise<T> {
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
            'DataSourceManager.ts:trySourceList:attempt',
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
              'DataSourceManager.ts:trySourceList:hang',
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
              'DataSourceManager.ts:trySourceList:success',
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
            'DataSourceManager.ts:trySourceList:catch',
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
  }

  /**
   * 按 weight 降序依次请求；失败则 failover 到下一源，并保留多轮重试逻辑。
   */
  private async queryByWeight<T>(
    run: (source: IDataSource) => Promise<T>,
    label: string,
  ): Promise<T> {
    const orderedSources = this.getOrderedSources();
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
        orderedSources: orderedSources.map((s) => s.name),
        skipped: Array.from(this.skipped),
      },
      'B',
    );
    // #endregion
    try {
      return await this.trySourceList(orderedSources, run, label, queryId);
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
    if (!address) throw new Error('Address is required');
    // Black hole: empty terminal page (no items and no next) is treated as soft failure so
    // another explorer can be tried. Empty-but-has-next is returned for caller continue-logic.
    const failoverOnEmptyTerminal = isBlackHoleAddress(address);

    return this.queryByWeight(async (source) => {
      const result = await source.fetchMessages(address, mode, params);
      if (
        failoverOnEmptyTerminal &&
        result.items.length === 0 &&
        !result.next_page_params
      ) {
        throw new Error(`${source.name} returned empty for black-hole address`);
      }
      return result;
    }, `fetchAll:${mode}`);
  }

  async fetchLatestBlockNumber(): Promise<number> {
    return this.queryByWeight(
      (source) => source.fetchLatestBlockNumber(),
      'latestBlock',
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
