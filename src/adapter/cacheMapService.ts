import { Platform } from 'react-native';
import { withDb, withDbWrite } from '../storage/database';
import { findLocalFileByPlaceholder, peekLocalFileByPlaceholder } from './remoteImageStore';

const memory = new Map<string, string>();
let loaded = false;

function usePersistentMap(): boolean {
  return Platform.OS !== 'web';
}

export function peekCacheMap(placeholder: string): string | null {
  if (!placeholder) {
    return null;
  }
  return memory.get(placeholder) ?? null;
}

/** 内存表优先，其次目录词干 peek。 */
export function peekCachedImagePath(placeholder: string): string | null {
  return peekCacheMap(placeholder) ?? peekLocalFileByPlaceholder(placeholder);
}

export async function loadCacheMap(): Promise<void> {
  if (!usePersistentMap()) {
    memory.clear();
    loaded = true;
    return;
  }

  const rows = await withDb((db) =>
    db.getAllAsync<{ placeholder: string; localPath: string }>(
      'SELECT placeholder, localPath FROM image_cache_map',
    ),
  );
  memory.clear();
  for (const row of rows) {
    if (row.placeholder && row.localPath) {
      memory.set(row.placeholder, row.localPath);
    }
  }
  loaded = true;
}

export async function upsertCacheMap(placeholder: string, localPath: string): Promise<void> {
  if (!placeholder || !localPath) {
    return;
  }
  memory.set(placeholder, localPath);
  if (!usePersistentMap()) {
    return;
  }
  await withDbWrite((db) =>
    db.runAsync(
      `INSERT INTO image_cache_map (placeholder, localPath) VALUES (?, ?)
       ON CONFLICT(placeholder) DO UPDATE SET localPath = excluded.localPath`,
      [placeholder, localPath],
    ),
  );
}

export async function removeCacheMap(placeholder: string): Promise<void> {
  if (!placeholder) {
    return;
  }
  memory.delete(placeholder);
  if (!usePersistentMap()) {
    return;
  }
  await withDbWrite((db) =>
    db.runAsync('DELETE FROM image_cache_map WHERE placeholder = ?', [placeholder]),
  );
}

export async function clearCacheMap(): Promise<void> {
  memory.clear();
  if (!usePersistentMap()) {
    return;
  }
  await withDbWrite((db) => db.runAsync('DELETE FROM image_cache_map'));
}

export function isCacheMapLoaded(): boolean {
  return loaded;
}

export async function hydrateCacheMap(
  placeholders: readonly string[],
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (Platform.OS === 'web' || placeholders.length === 0) {
    return map;
  }
  const unique = [...new Set(placeholders.filter(Boolean))];
  for (const placeholder of unique) {
    const fromMem = peekCacheMap(placeholder);
    if (fromMem) {
      map[placeholder] = fromMem;
      continue;
    }
    const onDisk = await findLocalFileByPlaceholder(placeholder);
    if (onDisk) {
      map[placeholder] = onDisk;
      await upsertCacheMap(placeholder, onDisk);
    }
  }
  return map;
}
