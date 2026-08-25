import { IDataSource, FetchMode, DataSourceResult, OutgoingTxResult } from './types';
import { BlockscoutDataSource } from './BlockscoutDataSource';
import { RoutescanDataSource } from './RoutescanDataSource';
import { EtherscanDataSource } from './EtherscanDataSource';
import { MAX_DATA_SOURCE_CYCLES } from '../constants';
import { agentLog } from './debugAgentLog';

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
   * 判断数据源是否应该被跳过
   */
  private isSourceDisabled(source: IDataSource): boolean {
    if (this.skipped.has(source.name)) return true;
    // 如果需要 API Key 但未提供，则跳过
    if (source.requiresApiKey && !source.apiKey) return true;
    return false;
  }

  /**
   * 有 API Key 的数据源组（已填写 Key 才算），组内按 weight 降序。
   */
  private getSourcesWithApiKey(): IDataSource[] {
    return [...this.sources]
      .filter((source) => {
        if (this.isSourceDisabled(source)) return false;
        return !!source.apiKey;
      })
      .sort((a, b) => this.getWeight(b) - this.getWeight(a));
  }

  /**
   * 无 API Key 的数据源组（不支持 Key 或 Key 未填写），组内按 weight 降序。
   */
  private getSourcesWithoutApiKey(): IDataSource[] {
    return [...this.sources]
      .filter((source) => {
        if (this.isSourceDisabled(source)) return false;
        return !source.apiKey;
      })
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
   * 两组优先级：有 API Key 组优先请求，全部失败后 fallback 到无 API Key 组。
   * 每组内部保持按 weight 排序 + 多轮重试的 fallback 逻辑。
   */
  private async queryByWeight<T>(
    run: (source: IDataSource) => Promise<T>,
    label: string,
  ): Promise<T> {
    const keyedSources = this.getSourcesWithApiKey();
    const freeSources = this.getSourcesWithoutApiKey();
    const queryId = ++this.querySeq;
    queryInflight += 1;
    // #region agent log
    agentLog(
      'DataSourceManager.ts:queryByWeight:entry',
      'queryByWeight start (two-tier)',
      {
        queryId,
        label,
        inflight: queryInflight,
        keyedSources: keyedSources.map((s) => s.name),
        freeSources: freeSources.map((s) => s.name),
        skipped: Array.from(this.skipped),
      },
      'B',
    );
    // #endregion
    try {
      if (keyedSources.length === 0 && freeSources.length === 0) {
        throw new Error('No data sources available');
      }

      // 优先使用有 API Key 的数据源组
      if (keyedSources.length > 0) {
        try {
          return await this.trySourceList(keyedSources, run, `${label}:keyed`, queryId);
        } catch (keyedError) {
          // API Key 组全部失败，fallback 到无 API Key 组
          if (freeSources.length === 0) {
            throw keyedError;
          }
          console.log(
            `All keyed sources failed, falling back to free sources. Reason: ${
              keyedError instanceof Error ? keyedError.message : String(keyedError)
            }`,
          );
        }
      }

      // Fallback: 无 API Key 的数据源组
      return await this.trySourceList(freeSources, run, `${label}:free`, queryId);
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
