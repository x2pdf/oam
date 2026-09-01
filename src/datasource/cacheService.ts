import { withDb, withDbWrite, clearAllCache } from '../storage/database';
import { ChainTransaction } from './ChainTransaction';
import { dataSourceManager } from './DataSourceManager';

export interface CacheConfig {
  address: string;
  limitCount: number;
  isEnabled: boolean;
}

export interface CacheStats {
  transactionCount: number;
  addressCount: number;
  dbSizeApprox?: string;
}

export class CacheService {
  private static instance: CacheService;

  private constructor() {}

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Check if global cache is enabled
   */
  public async isGlobalCacheEnabled(): Promise<boolean> {
    return withDb(async (db) => {
      const result = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM global_settings WHERE key = ?',
        ['cache_enabled']
      );
      return result?.value === '1';
    });
  }

  public async setGlobalCacheEnabled(enabled: boolean): Promise<void> {
    await withDbWrite(async (db) => {
      await db.runAsync(
        'INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)',
        ['cache_enabled', enabled ? '1' : '0']
      );
    });
  }

  /**
   * Get default limit for new addresses
   */
  public async getDefaultLimit(): Promise<number> {
    return withDb(async (db) => {
      const result = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM global_settings WHERE key = ?',
        ['default_limit']
      );
      return parseInt(result?.value ?? '100', 10);
    });
  }

  public async setDefaultLimit(limit: number): Promise<void> {
    const addresses = await withDbWrite(async (db) => {
      await db.runAsync(
        'INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)',
        ['default_limit', limit.toString()]
      );
      return db.getAllAsync<{ address: string }>(
        'SELECT DISTINCT address FROM address_tx_map'
      );
    });
    for (const row of addresses) {
      await this.enforceLimit(row.address);
    }
  }

  /**
   * Save transactions to cache for a specific address.
   * Only caches transactions with input data.
   */
  public async saveTransactions(address: string, txs: ChainTransaction[]): Promise<void> {
    if (!(await this.isGlobalCacheEnabled())) return;

    const addrLower = address.toLowerCase();
    const txsWithInput = txs.filter((tx) => tx.hasInput);
    if (txsWithInput.length === 0) return;

    await withDbWrite(async (db) => {
      for (const tx of txsWithInput) {
        await db.runAsync(
          `INSERT OR IGNORE INTO transactions (
            hash, fromAddress, toAddress, input, value, timestamp,
            blockNumber, gas, gasPrice, gasUsed, nonce,
            transactionIndex, isError, methodId, contractAddress
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tx.hash, tx.from, tx.to, tx.input, tx.value, tx.timestamp,
            tx.blockNumber ?? null, tx.gas ?? null, tx.gasPrice ?? null,
            tx.gasUsed ?? null, tx.nonce ?? null, tx.transactionIndex ?? null,
            tx.isError ? 1 : 0, tx.methodId ?? null, tx.contractAddress ?? null,
          ]
        );

        await db.runAsync(
          'INSERT OR IGNORE INTO address_tx_map (address, txHash) VALUES (?, ?)',
          [addrLower, tx.hash]
        );
      }
    });

    await this.enforceLimit(addrLower);
  }

  /**
   * Enforce the cache limit for an address
   */
  private async enforceLimit(address: string): Promise<void> {
    const limit = await withDb(async (db) => {
      const limitResult = await db.getFirstAsync<{ limitCount: number }>(
        'SELECT limitCount FROM cache_configs WHERE address = ?',
        [address]
      );
      return limitResult?.limitCount ?? null;
    });

    const effectiveLimit = limit ?? (await this.getDefaultLimit());

    await withDbWrite(async (db) => {
      await db.runAsync(
        `DELETE FROM address_tx_map
         WHERE address = ? AND txHash NOT IN (
           SELECT m.txHash FROM address_tx_map m
           JOIN transactions t ON m.txHash = t.hash
           WHERE m.address = ?
           ORDER BY t.timestamp DESC
           LIMIT ?
         )`,
        [address, address, effectiveLimit]
      );
    });
  }

  /**
   * Get cached transactions for a list of addresses
   */
  public async getTransactions(
    addresses: string[],
    limit: number = 20,
    offset: number = 0
  ): Promise<ChainTransaction[]> {
    if (!(await this.isGlobalCacheEnabled())) return [];
    if (addresses.length === 0) return [];

    const lowerAddresses = addresses.map((a) => a.toLowerCase());
    const placeholders = lowerAddresses.map(() => '?').join(',');

    const rows = await withDb(async (db) =>
      db.getAllAsync<any>(
        `SELECT DISTINCT t.* FROM transactions t
         JOIN address_tx_map m ON t.hash = m.txHash
         WHERE m.address IN (${placeholders})
         ORDER BY t.timestamp DESC
         LIMIT ? OFFSET ?`,
        [...lowerAddresses, limit, offset]
      )
    );

    return rows.map(
      (row) =>
        new ChainTransaction({
          hash: row.hash,
          from: row.fromAddress,
          to: row.toAddress,
          input: row.input,
          value: row.value,
          timestamp: row.timestamp,
          blockNumber: row.blockNumber,
          gas: row.gas,
          gasPrice: row.gasPrice,
          gasUsed: row.gasUsed,
          nonce: row.nonce,
          transactionIndex: row.transactionIndex,
          isError: row.isError === 1,
          methodId: row.methodId,
          contractAddress: row.contractAddress,
        })
    );
  }

  /**
   * Delete orphaned transactions (not associated with any address)
   */
  public async vacuumOrphans(): Promise<void> {
    await withDbWrite(async (db) => {
      await db.runAsync(`
        DELETE FROM transactions
        WHERE hash NOT IN (SELECT DISTINCT txHash FROM address_tx_map)
      `);
    });
  }

  /**
   * Clear all cached data
   */
  public async clearCache(): Promise<void> {
    await clearAllCache();
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<CacheStats> {
    return withDb(async (db) => {
      const txCount = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM transactions'
      );
      const addrCount = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(DISTINCT address) as count FROM address_tx_map'
      );

      return {
        transactionCount: txCount?.count ?? 0,
        addressCount: addrCount?.count ?? 0,
      };
    });
  }

  /**
   * Background refresh for a set of addresses
   */
  public async refreshCache(
    addresses: string[],
    onProgress?: (index: number, total: number, currentAddress: string) => void
  ): Promise<void> {
    if (!(await this.isGlobalCacheEnabled())) return;

    const limit = await this.getDefaultLimit();
    const total = addresses.length;

    for (let i = 0; i < total; i++) {
      const address = addresses[i];
      if (onProgress) onProgress(i, total, address);

      try {
        let fetchedCount = 0;
        let nextParams: any = null;

        while (fetchedCount < limit) {
          const result = await dataSourceManager.fetchAll(address, 'all', nextParams);
          if (result.rawTransactions && result.rawTransactions.length > 0) {
            await this.saveTransactions(address, result.rawTransactions);
            fetchedCount += result.rawTransactions.length;
            nextParams = result.next_page_params;
          } else {
            break;
          }
          if (!nextParams) break;
        }
      } catch (e) {
        console.warn(`Failed to refresh cache for ${address}:`, e);
      }

      if (i < total - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }
}

export const cacheService = CacheService.getInstance();
