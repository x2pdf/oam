import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  ARWEAVE_GATEWAYS,
  REMOTE_IMAGE_RETRY_PER_URL,
  REMOTE_IMAGE_TIMEOUT_MS,
} from '../constants';
import { fetchWithTimeout } from '../datasource/fetchWithTimeout';
import { ContentItem } from '../mypayload';
import { extractArweaveIdFromUri, isHttpUrl, isImageMime } from '../utils/attachment';

const CACHE_FOLDER = 'oam-remote-images/';
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'avif', 'jxl'] as const;

const inFlight = new Map<string, Promise<string>>();
const webBlobCache = new Map<string, string>();

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16);
}

function cacheKeyFor(url: string): string {
  const arId = extractArweaveIdFromUri(url);
  return arId ?? hashString(url);
}

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

function uint8ToBase64(bytes: Uint8Array): string {
  const chunk = 0x2000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  if (typeof btoa !== 'function') {
    throw new Error('Base64 encoding is not available');
  }
  return btoa(binary);
}

function toFileUri(path: string): string {
  if (path.startsWith('file:')) {
    return path;
  }
  return `file://${path.replace(/\\/g, '/')}`;
}

async function ensureRemoteCacheFolder(): Promise<string> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('Cache directory is not available');
  }

  const folder = `${cacheDir}${CACHE_FOLDER}`;
  const folderInfo = await FileSystem.getInfoAsync(folder);
  if (!folderInfo.exists) {
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  }
  return folder;
}

async function findCachedFile(cacheKey: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return webBlobCache.get(cacheKey) ?? null;
  }

  const folder = await ensureRemoteCacheFolder();
  for (const ext of IMAGE_EXTENSIONS) {
    const path = `${folder}${cacheKey}.${ext}`;
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      return toFileUri(path);
    }
  }
  return null;
}

async function writeCache(
  cacheKey: string,
  bytes: Uint8Array,
  meta: { mime: string; ext: string },
): Promise<string> {
  if (Platform.OS === 'web') {
    const blob = new Blob([new Uint8Array(bytes)], { type: meta.mime });
    const objectUrl = URL.createObjectURL(blob);
    webBlobCache.set(cacheKey, objectUrl);
    return objectUrl;
  }

  const folder = await ensureRemoteCacheFolder();
  const path = `${folder}${cacheKey}.${meta.ext}`;
  await FileSystem.writeAsStringAsync(path, uint8ToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return toFileUri(path);
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
  const response = await fetchWithTimeout(
    url,
    { headers: { Accept: 'image/*,*/*' } },
    REMOTE_IMAGE_TIMEOUT_MS,
  );
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

async function downloadRemoteImage(url: string, mimeHint?: string): Promise<string> {
  const cacheKey = cacheKeyFor(url);
  const cached = await findCachedFile(cacheKey);
  if (cached) {
    return cached;
  }

  const candidates = expandCandidateUrls(url);
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const { bytes, mime } = await fetchImageBytes(candidate, mimeHint);
      const meta = resolveImageMeta(mime, candidate);
      return await writeCache(cacheKey, bytes, meta);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('Failed to load remote image');
}

/** 同步读取已缓存的远程图 URI（Web blob 缓存）；未命中返回 null。 */
export function peekCachedRemoteImageUri(uri: string): string | null {
  if (!uri || !isHttpUrl(uri)) {
    return null;
  }
  if (Platform.OS !== 'web') {
    return null;
  }
  return webBlobCache.get(cacheKeyFor(uri)) ?? null;
}

export async function resolveRemoteImageUri(uri: string, mimeHint?: string): Promise<string> {
  if (!uri) {
    throw new Error('Empty URI');
  }
  if (uri.startsWith('data:') || uri.startsWith('file:') || uri.startsWith('blob:')) {
    return uri;
  }
  if (!isHttpUrl(uri)) {
    throw new Error('Unsupported image URI');
  }

  const cacheKey = cacheKeyFor(uri);
  const cached = await findCachedFile(cacheKey);
  if (cached) {
    return cached;
  }

  const existing = inFlight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = downloadRemoteImage(uri, mimeHint).finally(() => {
    inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, promise);
  return promise;
}

/** 后台预取 OAMP 内容中的远程图片链接，成功后会写入本地/内存缓存。 */
export function prefetchRemoteImagesFromItems(items: ContentItem[]): void {
  for (const item of items) {
    if (item.type === 'link' && isImageMime(item.mime) && isHttpUrl(item.href)) {
      resolveRemoteImageUri(item.href, item.mime).catch(() => {});
      continue;
    }
    if (item.type === 'image' && isHttpUrl(item.data)) {
      resolveRemoteImageUri(item.data).catch(() => {});
    }
  }
}

export function revokeRemoteImageUri(uri: string): void {
  if (!uri.startsWith('blob:')) {
    return;
  }
  URL.revokeObjectURL(uri);
  for (const [key, cachedUri] of webBlobCache.entries()) {
    if (cachedUri === uri) {
      webBlobCache.delete(key);
      break;
    }
  }
}
