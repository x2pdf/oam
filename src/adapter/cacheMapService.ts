import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { withDb, withDbWrite } from '../storage/database';
import { containerPrefixOf, imgCount, imgLog, shortRef } from '../utils/imageCacheLog';
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
    }).catch((error) => imgLog('loadCacheMap.migrateFailed', String(error)));
  }
  imgLog('loadCacheMap', {
    rows: rows.length,
    inMemory: memory.size,
    migratedAbsolutePaths: legacy.length,
  });
}

/**
 * 启动诊断：对比当前文档目录、缓存文件夹实际文件与 image_cache_map 中记录的绝对路径。
 * 若映射表里的路径指向旧的应用容器（重装后 UUID 变化），这里会列出旧前缀与数量。
 */
export async function logImageCacheStartupReport(): Promise<void> {
  if (!usePersistentMap()) {
    return;
  }
  try {
    const docDir = FileSystem.documentDirectory ?? '';
    const folder = `${docDir}${REMOTE_IMAGE_FOLDER}`;
    const folderInfo = await FileSystem.getInfoAsync(folder);
    let fileNames: string[] = [];
    let totalBytes = 0;
    if (folderInfo.exists) {
      fileNames = await FileSystem.readDirectoryAsync(folder);
      for (const name of fileNames) {
        const info = await FileSystem.getInfoAsync(`${folder}${name}`);
        if (info.exists && 'size' in info && typeof info.size === 'number') {
          totalBytes += info.size;
        }
      }
    }
    imgLog('startup.dir', {
      documentDirectory: docDir,
      containerPrefix: containerPrefixOf(docDir),
      folderExists: folderInfo.exists,
      files: fileNames.length,
      totalKB: Math.round(totalBytes / 1024),
    });

    const currentPrefix = containerPrefixOf(docDir);
    const staleByPrefix: Record<string, number> = {};
    let underCurrent = 0;
    let existsCount = 0;
    let missingCount = 0;
    const missingSamples: string[] = [];
    for (const [placeholder, localPath] of memory) {
      if (localPath.startsWith(folder) || localPath.startsWith(`file://${folder}`)) {
        underCurrent += 1;
      } else {
        const prefix = containerPrefixOf(localPath) ?? '(unknown)';
        staleByPrefix[prefix] = (staleByPrefix[prefix] ?? 0) + 1;
      }
      const info = await FileSystem.getInfoAsync(localPath).catch(() => ({ exists: false }));
      if (info.exists) {
        existsCount += 1;
      } else {
        missingCount += 1;
        if (missingSamples.length < 5) {
          missingSamples.push(`${shortRef(placeholder, 60)} -> ${shortRef(localPath, 120)}`);
        }
      }
    }
    imgLog('startup.map', {
      rows: memory.size,
      pathUnderCurrentFolder: underCurrent,
      pathUnderOtherPrefix: memory.size - underCurrent,
      staleByPrefix,
      currentPrefix,
      fileExists: existsCount,
      fileMissing: missingCount,
    });
    for (const sample of missingSamples) {
      imgLog('startup.map.missingSample', sample);
    }
    const mappedNames = new Set(
      [...memory.values()].map((path) => path.slice(path.lastIndexOf('/') + 1)),
    );
    const orphanFiles = fileNames.filter((name) => !mappedNames.has(name)).length;
    imgLog('startup.orphans', { filesWithoutMapRowByName: orphanFiles });
  } catch (error) {
    imgLog('startup.report.failed', String(error));
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
      // 注意：这里不校验文件是否存在，旧容器路径也会被当作命中返回给 UI。
      map[placeholder] = fromMem;
      imgCount('hydrateMem');
      continue;
    }
    const onDisk = await findLocalFileByPlaceholder(placeholder);
    if (onDisk) {
      map[placeholder] = onDisk;
      imgCount('hydrateDisk');
      await upsertCacheMap(placeholder, onDisk);
    } else {
      imgCount('hydrateMiss');
      imgLog('hydrate.miss', shortRef(placeholder));
    }
  }
  return map;
}
