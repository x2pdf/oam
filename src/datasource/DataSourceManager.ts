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
   * Fetch from all sources and aggregate.
   * Note: For simplicity in pagination, we might just use the primary source's pagination
   * or a more complex strategy. Here we'll combine items and return the first available next_page_params.
   */
  async fetchAll(address: string, mode: FetchMode, params: any = null): Promise<DataSourceResult> {
    const results = await Promise.all(
      this.sources.map(source =>
        source.fetchMessages(address, mode, params).catch(err => {
          console.warn(`Source ${source.name} failed:`, err);
          return { items: [], next_page_params: null };
        })
      )
    );

    // Aggregate items
    const allItems: InputDataItem[] = [];
    results.forEach(res => {
      allItems.push(...res.items);
    });

    // Deduplicate by transaction hash (id in our case has source prefix, so maybe just keep all or use original hash)
    // For now, let's just return them. In a real app we'd deduplicate by tx hash.

    // Sort by timestamp (lastActive) descending
    allItems.sort((a, b) => {
        return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
    });

    // Use the primary source's next_page_params for simplicity in this implementation
    // Ideally we'd need a more robust pagination strategy for multiple sources.
    const nextPageParams = results[0]?.next_page_params;

    return {
      items: allItems,
      next_page_params: nextPageParams
    };
  }
}

export const dataSourceManager = DataSourceManager.getInstance();
