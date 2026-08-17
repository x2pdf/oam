import { IDataSource, FetchMode, DataSourceResult } from './types';
import { BlockscoutDataSource } from './BlockscoutDataSource';
import { EtherscanDataSource } from './EtherscanDataSource';
import { InputDataItem } from '../types';

export class DataSourceManager {
  private static instance: DataSourceManager;
  private sources: IDataSource[] = [];

  private constructor() {
    // Register sources
    this.sources.push(new BlockscoutDataSource());
    this.sources.push(new EtherscanDataSource());

    // Sort by weight descending
    this.sources.sort((a, b) => b.weight - a.weight);
  }

  public static getInstance(): DataSourceManager {
    if (!DataSourceManager.instance) {
      DataSourceManager.instance = new DataSourceManager();
    }
    return DataSourceManager.instance;
  }

  /**
   * Fetch from sources one by one according to weight.
   * If the primary source succeeds, return immediately.
   * Fallback to the next source if the previous one fails.
   */
  async fetchAll(address: string, mode: FetchMode, params: any = null): Promise<DataSourceResult> {
    let lastError = null;

    for (const source of this.sources) {
      try {
        console.log(`Attempting to fetch from source: ${source.name}`);
        const result = await source.fetchMessages(address, mode, params);

        // If we got items or even an empty list (successful request),
        // we consider this source's response as the final word.
        return result;
      } catch (err) {
        console.warn(`Source ${source.name} failed, trying next source if available.`, err);
        lastError = err;
        // Continue to next source
      }
    }

    // If we reached here, all sources failed
    throw lastError || new Error('All data sources failed to fetch data');
  }
}

export const dataSourceManager = DataSourceManager.getInstance();
