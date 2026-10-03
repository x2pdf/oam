import { clearRemoteImageCache, getRemoteImageCacheCount } from '../adapter/remoteImageLoader';
import { compactDatabase } from '../storage/database';
import { arweaveListCacheService } from './list/cache/cacheService';
import { clearTempJwkFiles } from './wallet/backup/saveJwkJson';

/** Cached image files plus cached Arweave upload-list rows. */
export async function getArweaveLocalCacheCount(): Promise<number> {
  const [images, stats] = await Promise.all([
    getRemoteImageCacheCount().catch(() => 0),
    arweaveListCacheService.getStats().catch(() => ({ uploadCount: 0 })),
  ]);
  return images + stats.uploadCount;
}

/**
 * Physically remove all Arweave-related local cache:
 * - image files in the document directory (folder is recreated empty)
 * - image_cache_map rows, with the main DB vacuumed so the deleted rows leave the file
 * - the Arweave list cache database file (recreated with schema + default settings)
 * - temp JWK exports in the cache directory
 * Every step runs even if an earlier one fails; the first error is rethrown at the end.
 */
export async function clearArweaveLocalCache(): Promise<void> {
  let firstError: unknown = null;
  const run = async (label: string, step: () => Promise<void>) => {
    try {
      await step();
    } catch (error) {
      console.warn(`[arweave-cache] ${label} failed:`, error);
      firstError ??= error;
    }
  };

  await run('images', async () => {
    await clearRemoteImageCache();
    await compactDatabase();
  });
  await run('upload list', () => arweaveListCacheService.clearCache());
  await run('temp jwk', clearTempJwkFiles);

  if (firstError) {
    throw firstError;
  }
}
