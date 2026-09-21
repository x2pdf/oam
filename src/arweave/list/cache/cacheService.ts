import {
  ARWEAVE_CACHE_DEFAULT_LIMIT,
  ARWEAVE_CACHE_DEFAULT_MAX_AGE_MS,
  ARWEAVE_CACHE_SETTING_ENABLED,
  ARWEAVE_CACHE_SETTING_LIMIT,
  ARWEAVE_CACHE_SETTING_MAX_AGE_MS,
} from './constants';
import {
  clearAllArweaveCache,
  withArweaveCacheDb,
  withArweaveCacheDbWrite,
} from './database';
import { ArweaveListItem } from '../types';

export interface ArweaveCacheStats {
  uploadCount: number;
  ownerCount: number;
}

export class ArweaveListCacheService {
  private static instance: ArweaveListCacheService;

  private constructor() {}

  public static getInstance(): ArweaveListCacheService {
    if (!ArweaveListCacheService.instance) {
      ArweaveListCacheService.instance = new ArweaveListCacheService();
    }
    return ArweaveListCacheService.instance;
  }

  public async isEnabled(): Promise<boolean> {
    return withArweaveCacheDb(async (db) => {
      const result = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM arweave_cache_settings WHERE key = ?',
        [ARWEAVE_CACHE_SETTING_ENABLED],
      );
      return result?.value === '1';
    });
  }

  public async getDefaultLimit(): Promise<number> {
    return withArweaveCacheDb(async (db) => {
      const result = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM arweave_cache_settings WHERE key = ?',
        [ARWEAVE_CACHE_SETTING_LIMIT],
      );
      const parsed = parseInt(result?.value ?? String(ARWEAVE_CACHE_DEFAULT_LIMIT), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : ARWEAVE_CACHE_DEFAULT_LIMIT;
    });
  }

  public async getMaxAgeMs(): Promise<number> {
    return withArweaveCacheDb(async (db) => {
      const result = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM arweave_cache_settings WHERE key = ?',
        [ARWEAVE_CACHE_SETTING_MAX_AGE_MS],
      );
      const parsed = parseInt(result?.value ?? String(ARWEAVE_CACHE_DEFAULT_MAX_AGE_MS), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : ARWEAVE_CACHE_DEFAULT_MAX_AGE_MS;
    });
  }

  public async saveItems(ownerAddress: string, items: ArweaveListItem[]): Promise<void> {
    if (!(await this.isEnabled()) || items.length === 0) return;

    const now = Date.now();
    await withArweaveCacheDbWrite(async (db) => {
      for (const item of items) {
        await db.runAsync(
          `INSERT OR REPLACE INTO arweave_uploads (
            id, ownerAddress, timestamp, itemJson, cachedAt
          ) VALUES (?, ?, ?, ?, ?)`,
          [item.id, ownerAddress, item.timestamp, JSON.stringify(item), now],
        );
      }
    });

    await this.enforceMaxAge(ownerAddress);
    await this.enforceLimit(ownerAddress);
  }

  public async getItems(
    ownerAddress: string,
    limit: number,
    offset: number = 0,
  ): Promise<ArweaveListItem[]> {
    if (!(await this.isEnabled())) return [];

    const rows = await withArweaveCacheDb(async (db) =>
      db.getAllAsync<{ itemJson: string }>(
        `SELECT itemJson FROM arweave_uploads
         WHERE ownerAddress = ?
         ORDER BY CASE WHEN timestamp <= 0 THEN 1 ELSE 0 END DESC, timestamp DESC
         LIMIT ? OFFSET ?`,
        [ownerAddress, limit, offset],
      ),
    );

    const items: ArweaveListItem[] = [];
    for (const row of rows) {
      try {
        items.push(JSON.parse(row.itemJson) as ArweaveListItem);
      } catch {
        // Skip corrupted rows.
      }
    }
    return items;
  }

  public async getItemCount(ownerAddress: string): Promise<number> {
    if (!(await this.isEnabled())) return 0;

    const result = await withArweaveCacheDb(async (db) =>
      db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM arweave_uploads WHERE ownerAddress = ?',
        [ownerAddress],
      ),
    );
    return result?.count ?? 0;
  }

  public async hasMore(ownerAddress: string, loadedCount: number): Promise<boolean> {
    const total = await this.getItemCount(ownerAddress);
    return loadedCount < total;
  }

  public async clearCache(): Promise<void> {
    await clearAllArweaveCache();
  }

  public async getStats(): Promise<ArweaveCacheStats> {
    return withArweaveCacheDb(async (db) => {
      const uploadCount = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM arweave_uploads',
      );
      const ownerCount = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(DISTINCT ownerAddress) as count FROM arweave_uploads',
      );
      return {
        uploadCount: uploadCount?.count ?? 0,
        ownerCount: ownerCount?.count ?? 0,
      };
    });
  }

  private async enforceLimit(ownerAddress: string): Promise<void> {
    const limit = await this.getDefaultLimit();
    await withArweaveCacheDbWrite(async (db) => {
      await db.runAsync(
        `DELETE FROM arweave_uploads
         WHERE ownerAddress = ? AND id NOT IN (
           SELECT id FROM arweave_uploads
           WHERE ownerAddress = ?
           ORDER BY CASE WHEN timestamp <= 0 THEN 1 ELSE 0 END DESC, timestamp DESC
           LIMIT ?
         )`,
        [ownerAddress, ownerAddress, limit],
      );
    });
  }

  private async enforceMaxAge(ownerAddress: string): Promise<void> {
    const maxAgeMs = await this.getMaxAgeMs();
    const cutoff = Date.now() - maxAgeMs;
    await withArweaveCacheDbWrite(async (db) => {
      await db.runAsync(
        'DELETE FROM arweave_uploads WHERE ownerAddress = ? AND cachedAt < ?',
        [ownerAddress, cutoff],
      );
    });
  }
}

export const arweaveListCacheService = ArweaveListCacheService.getInstance();
