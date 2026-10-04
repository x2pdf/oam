import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { withDb, withDbWrite } from '../storage/database';
import {
  findLocalFileByPlaceholder,
  peekLocalFileByPlaceholder,
  REMOTE_IMAGE_FOLDER,
} from './remoteImageStore';

const memory = new Map<string, string>();
let loaded = false;

function usePersistentMap(): boolean {
  return Platform.OS !== 'web';
}

const FOLDER_SEGMENT = `/${REMOTE_IMAGE_FOLDER}`;

/**
 * 库里只存缓存目录下的文件名：iOS 每次重装（含 Xcode 部署）应用容器 UUID 会变，
 * 存绝对路径会让所有记录指向旧容器。不在缓存目录下的路径原样保存。
 */
function toStoredPath(localPath: string): string {
  const idx = localPath.lastIndexOf(FOLDER_SEGMENT);
  return idx >= 0 ? localPath.slice(idx + FOLDER_SEGMENT.length) : localPath;
}

/** 文件名（或旧版存下的绝对路径）→ 当前容器下的 file:// 路径。 */
function toRuntimePath(stored: string): string {
  const root = FileSystem.documentDirectory;
  if (!root) {
    return stored;
  }
  if (!stored.includes('/')) {
    return `${root}${REMOTE_IMAGE_FOLDER}${stored}`;
  }
  const idx = stored.lastIndexOf(FOLDER_SEGMENT);
  if (idx >= 0) {
    return `${root}${REMOTE_IMAGE_FOLDER}${stored.slice(idx + FOLDER_SEGMENT.length)}`;
  }
  return stored;
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
  const legacy: { placeholder: string; stored: string }[] = [];
  for (const row of rows) {
    if (row.placeholder && row.localPath) {
      memory.set(row.placeholder, toRuntimePath(row.localPath));
      const stored = toStoredPath(row.localPath);
      if (stored !== row.localPath) {
        legacy.push({ placeholder: row.placeholder, stored });
      }
    }
  }
  loaded = true;
  if (legacy.length > 0) {
    // 旧版存的是绝对路径，改写为文件名。
    await withDbWrite(async (db) => {
      for (const { placeholder, stored } of legacy) {
        await db.runAsync('UPDATE image_cache_map SET localPath = ? WHERE placeholder = ?', [
          stored,
          placeholder,
        ]);
      }
    }).catch(() => {});
  }
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
      [placeholder, toStoredPath(localPath)],
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
