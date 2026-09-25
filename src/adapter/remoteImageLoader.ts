import { Platform } from 'react-native';
import {
  ARWEAVE_GATEWAYS,
  REMOTE_IMAGE_RETRY_PER_URL,
  REMOTE_IMAGE_TIMEOUT_MS,
} from '../constants';
import { fetchImageWithTimeout } from '../datasource/fetchWithTimeout';
import { extractArweaveIdFromUri, isHttpUrl } from '../utils/attachment';
import {
  clearCacheMap,
  peekCachedImagePath,
  removeCacheMap,
  upsertCacheMap,
} from './cacheMapService';
import {
  clearRemoteImageStore,
  countRemoteImageStore,
  deleteLocalFilesByPlaceholder,
  findLocalFileByPlaceholder,
  localFileExists,
  writeLocalFile,
} from './remoteImageStore';

const inFlight = new Map<string, Promise<string>>();

export function expandCandidateUrls(url: string): string[] {
  const arId = extractArweaveIdFromUri(url);
  if (arId) {
    return ARWEAVE_GATEWAYS.map((gateway) => {
      const base = gateway.endsWith('/') ? gateway : `${gateway}/`;
      return `${base}${arId}`;
    });
  }
  return Array.from({ length: REMOTE_IMAGE_RETRY_PER_URL }, () => url);
}

function resolveImageMeta(
  mimeHint: string | undefined,
  url: string,
): { mime: string; ext: string } {
  const lower = (mimeHint || '').toLowerCase().split(';')[0].trim();
  if (lower.includes('png')) return { mime: 'image/png', ext: 'png' };
  if (lower.includes('gif')) return { mime: 'image/gif', ext: 'gif' };
  if (lower.includes('webp')) return { mime: 'image/webp', ext: 'webp' };
  if (lower.includes('heic')) return { mime: 'image/heic', ext: 'heic' };
  if (lower.includes('avif')) return { mime: 'image/avif', ext: 'avif' };
  if (lower.includes('jxl')) return { mime: 'image/jxl', ext: 'jxl' };
  if (lower.includes('jpeg') || lower.includes('jpg')) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  const path = url.toLowerCase().split('?')[0];
  if (path.endsWith('.png')) return { mime: 'image/png', ext: 'png' };
  if (path.endsWith('.gif')) return { mime: 'image/gif', ext: 'gif' };
  if (path.endsWith('.webp')) return { mime: 'image/webp', ext: 'webp' };
  if (path.endsWith('.heic')) return { mime: 'image/heic', ext: 'heic' };
  if (path.endsWith('.avif')) return { mime: 'image/avif', ext: 'avif' };
  if (path.endsWith('.jxl')) return { mime: 'image/jxl', ext: 'jxl' };
  return { mime: 'image/jpeg', ext: 'jpg' };
}

function isLikelyImageResponse(mime: string, url: string): boolean {
  if (mime.startsWith('image/')) {
    return true;
  }
  const path = url.toLowerCase().split('?')[0];
  return /\.(jpe?g|png|gif|webp|heic|avif|jxl)$/i.test(path);
}

function sniffImageMeta(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { mime: 'image/gif', ext: 'gif' };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

function mimeHintIsImage(mimeHint?: string): boolean {
  return !!mimeHint && mimeHint.toLowerCase().startsWith('image/');
}

async function fetchImageBytes(
  url: string,
  mimeHint?: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const response = await fetchImageWithTimeout(url, REMOTE_IMAGE_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }

  const contentMime = (response.headers.get('content-type') || '').split(';')[0].trim();
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (isLikelyImageResponse(contentMime, url)) {
    const meta = resolveImageMeta(contentMime || mimeHint, url);
    return { bytes, mime: meta.mime };
  }

  const sniffed = sniffImageMeta(bytes);
  if (sniffed) {
    return { bytes, mime: sniffed.mime };
  }

  if (mimeHintIsImage(mimeHint) || extractArweaveIdFromUri(url)) {
    const meta = resolveImageMeta(mimeHint, url);
    return { bytes, mime: meta.mime };
  }

  throw new Error('Response is not an image');
}

async function downloadRemoteImage(placeholder: string, mimeHint?: string): Promise<string> {
  const candidates = expandCandidateUrls(placeholder);
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const { bytes, mime } = await fetchImageBytes(candidate, mimeHint);
      const sniffed = sniffImageMeta(bytes);
      const meta = sniffed ?? resolveImageMeta(mime, candidate);
      const local = await writeLocalFile(placeholder, bytes, meta.ext);
      await upsertCacheMap(placeholder, local);
      return local;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('Failed to load remote image');
}

/**
 * Web：直接返回 https，不写本地文件。
 * Native：hintPath / 词干文件优先，没有才下载到文档目录。
 */
export async function resolveRemoteImageUri(
  uri: string,
  mimeHint?: string,
  hintPath?: string,
): Promise<string> {
  if (!uri) {
    throw new Error('Empty URI');
  }
  if (uri.startsWith('data:') || uri.startsWith('file:') || uri.startsWith('blob:')) {
    return uri;
  }
  if (!isHttpUrl(uri)) {
    throw new Error('Unsupported image URI');
  }

  if (Platform.OS === 'web') {
    const candidates = expandCandidateUrls(uri);
    return candidates[0] ?? uri;
  }

  if (hintPath && (await localFileExists(hintPath))) {
    await upsertCacheMap(uri, hintPath);
    return hintPath;
  }

  const peeked = peekCachedImagePath(uri);
  if (peeked && peeked !== hintPath && (await localFileExists(peeked))) {
    await upsertCacheMap(uri, peeked);
    return peeked;
  }

  const existing = await findLocalFileByPlaceholder(uri);
  if (existing) {
    await upsertCacheMap(uri, existing);
    return existing;
  }

  const inflight = inFlight.get(uri);
  if (inflight) {
    return inflight;
  }

  const promise = downloadRemoteImage(uri, mimeHint).finally(() => {
    inFlight.delete(uri);
  });
  inFlight.set(uri, promise);
  return promise;
}

/** 删除该占位对应的本地文件并取消进行中的下载，用于解码失败后强制重试。 */
export async function invalidateRemoteImageCache(uri: string): Promise<void> {
  if (!uri || !isHttpUrl(uri)) return;
  inFlight.delete(uri);
  await removeCacheMap(uri);
  await deleteLocalFilesByPlaceholder(uri);
}

export async function getRemoteImageCacheCount(): Promise<number> {
  return countRemoteImageStore();
}

export async function clearRemoteImageCache(): Promise<void> {
  inFlight.clear();
  await clearCacheMap();
  await clearRemoteImageStore();
}
