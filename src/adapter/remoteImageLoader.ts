import { Platform } from 'react-native';
import {
  REMOTE_IMAGE_HEDGE_DELAY_MS,
  REMOTE_IMAGE_MAX_CONCURRENT_REQUESTS,
  REMOTE_IMAGE_MAX_PARALLEL_PER_IMAGE,
  REMOTE_IMAGE_RETRY_PER_URL,
  REMOTE_IMAGE_TIMEOUT_MS,
  REMOTE_IMAGE_TOTAL_DEADLINE_MS,
} from '../constants';
import { markArweaveGatewayOk, orderedArweaveGateways } from '../arweave/gateway';
import { fetchImageWithTimeout } from '../datasource/fetchWithTimeout';
import { extractArweaveIdFromUri, isHttpUrl } from '../utils/attachment';
import { imgCount, imgLog, shortRef } from '../utils/imageCacheLog';
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
/** Bumped on every clear so downloads started earlier never write files back. */
let clearGeneration = 0;

/** 全局请求槽位：所有图片、所有网关共享。 */
let activeRequests = 0;
const slotWaiters: (() => void)[] = [];

function hasFreeRequestSlot(): boolean {
  return activeRequests < REMOTE_IMAGE_MAX_CONCURRENT_REQUESTS;
}

async function withRequestSlot<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  if (!hasFreeRequestSlot()) {
    await new Promise<void>((resolve) => slotWaiters.push(resolve));
  } else {
    activeRequests += 1;
  }
  try {
    if (signal.aborted) {
      throw new Error('Request aborted');
    }
    return await run();
  } finally {
    const next = slotWaiters.shift();
    if (next) {
      next(); // 槽位直接移交，activeRequests 不变
    } else {
      activeRequests -= 1;
    }
  }
}

export function expandCandidateUrls(url: string): string[] {
  const arId = extractArweaveIdFromUri(url);
  if (arId) {
    return orderedArweaveGateways().map((gateway) => `${gateway}${arId}`);
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
  mimeHint: string | undefined,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const response = await fetchImageWithTimeout(url, REMOTE_IMAGE_TIMEOUT_MS, undefined, signal);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }

  const contentMime = (response.headers.get('content-type') || '').split(';')[0].trim();
  // 网页/接口响应（如 instagram 帖子链接返回 HTML）不能当图片存，否则每次渲染失败都会删了重下。
  if (/^(text\/|application\/(json|xml|xhtml|javascript))/i.test(contentMime)) {
    throw new Error(`Response is not an image (${contentMime})`);
  }
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

type FetchedImage = { candidate: string; bytes: Uint8Array; mime: string };

/**
 * 依次启动候选地址：上一个失败立即换下一个；上一个超过 HEDGE_DELAY 仍未完成，
 * 则并发再起一个（最多 maxParallel 个同时进行）。第一个成功的胜出，其余全部中止。
 */
function fetchFromCandidates(
  candidates: string[],
  mimeHint: string | undefined,
  maxParallel: number,
): Promise<FetchedImage> {
  return new Promise((resolve, reject) => {
    const controllers = new Set<AbortController>();
    let next = 0;
    let running = 0;
    let settled = false;
    let lastError: Error | null = null;
    let hedgeTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (error: Error | null, result?: FetchedImage) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (hedgeTimer) clearTimeout(hedgeTimer);
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      if (error) reject(error);
      else resolve(result!);
    };

    const deadline = setTimeout(() => {
      finish(
        new Error(
          `Gave up after ${REMOTE_IMAGE_TOTAL_DEADLINE_MS}ms` +
            (lastError ? ` (last: ${lastError.message})` : ''),
        ),
      );
    }, REMOTE_IMAGE_TOTAL_DEADLINE_MS);

    const scheduleHedge = () => {
      if (hedgeTimer) clearTimeout(hedgeTimer);
      hedgeTimer = null;
      if (settled || next >= candidates.length || running >= maxParallel) return;
      hedgeTimer = setTimeout(() => {
        hedgeTimer = null;
        if (!hasFreeRequestSlot()) {
          // 备用请求不排队：槽位留给其他图片的首个请求，稍后再看。
          imgLog('download.hedgeDeferred', { next: shortRef(candidates[next]), running });
          scheduleHedge();
          return;
        }
        imgLog('download.hedge', { start: shortRef(candidates[next]), running });
        launch();
      }, REMOTE_IMAGE_HEDGE_DELAY_MS);
    };

    const launch = () => {
      if (settled || next >= candidates.length) return;
      const candidate = candidates[next++];
      const controller = new AbortController();
      controllers.add(controller);
      running += 1;
      const queuedAt = Date.now();
      withRequestSlot(controller.signal, () => {
        imgCount('netRequest');
        const waitedMs = Date.now() - queuedAt;
        imgLog(
          'download.request',
          waitedMs > 50 ? `${shortRef(candidate)} (queued ${waitedMs}ms)` : shortRef(candidate),
        );
        return fetchImageBytes(candidate, mimeHint, controller.signal);
      })
        .then(({ bytes, mime }) => finish(null, { candidate, bytes, mime }))
        .catch((error) => {
          controllers.delete(controller);
          running -= 1;
          if (settled) return;
          lastError = error instanceof Error ? error : new Error(String(error));
          imgLog('download.attemptFailed', { from: shortRef(candidate), error: lastError.message });
          if (next < candidates.length) {
            launch();
          } else if (running === 0) {
            finish(lastError);
          }
        });
      scheduleHedge();
    };

    launch();
  });
}

async function downloadRemoteImage(placeholder: string, mimeHint?: string): Promise<string> {
  const candidates = expandCandidateUrls(placeholder);
  // 非 Arweave 图的候选是同一 URL 的重试，不并发。
  const maxParallel = extractArweaveIdFromUri(placeholder)
    ? REMOTE_IMAGE_MAX_PARALLEL_PER_IMAGE
    : 1;
  const generation = clearGeneration;

  imgCount('downloadStart');
  imgLog('download.start', {
    placeholder: shortRef(placeholder),
    candidates: candidates.length,
    maxParallel,
  });
  const startedAt = Date.now();

  try {
    const { candidate, bytes, mime } = await fetchFromCandidates(candidates, mimeHint, maxParallel);
    const sniffed = sniffImageMeta(bytes);
    const meta = sniffed ?? resolveImageMeta(mime, candidate);
    if (generation !== clearGeneration) {
      throw new Error('Image cache cleared during download');
    }
    const local = await writeLocalFile(placeholder, bytes, meta.ext);
    if (generation !== clearGeneration) {
      await deleteLocalFilesByPlaceholder(placeholder);
      throw new Error('Image cache cleared during download');
    }
    await upsertCacheMap(placeholder, local);
    markArweaveGatewayOk(candidate);
    imgCount('downloadOk', placeholder);
    imgLog('download.ok', {
      placeholder: shortRef(placeholder),
      from: shortRef(candidate),
      kb: Math.round(bytes.length / 1024),
      ms: Date.now() - startedAt,
      savedTo: shortRef(local, 140),
    });
    return local;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    imgCount('downloadFail');
    imgLog('download.fail', {
      placeholder: shortRef(placeholder),
      ms: Date.now() - startedAt,
      error: err.message,
    });
    throw err;
  }
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

  if (hintPath) {
    if (await localFileExists(hintPath)) {
      imgCount('hitHint');
      await upsertCacheMap(uri, hintPath);
      return hintPath;
    }
    imgCount('staleHint');
    imgLog('resolve.staleHint', { uri: shortRef(uri), hintPath: shortRef(hintPath, 140) });
  }

  const peeked = peekCachedImagePath(uri);
  if (peeked && peeked !== hintPath) {
    if (await localFileExists(peeked)) {
      imgCount('hitPeek');
      await upsertCacheMap(uri, peeked);
      return peeked;
    }
    imgCount('staleMapPath');
    imgLog('resolve.stalePeek', { uri: shortRef(uri), peeked: shortRef(peeked, 140) });
  }

  const existing = await findLocalFileByPlaceholder(uri);
  if (existing) {
    imgCount('hitDisk');
    imgLog('resolve.hitDiskByStem', {
      uri: shortRef(uri),
      path: shortRef(existing, 140),
      replacedStale: !!(hintPath || peeked),
    });
    await upsertCacheMap(uri, existing);
    return existing;
  }

  const inflight = inFlight.get(uri);
  if (inflight) {
    imgCount('hitInflight');
    return inflight;
  }

  imgLog('resolve.miss -> download', { uri: shortRef(uri), hadHint: !!hintPath });
  const promise = downloadRemoteImage(uri, mimeHint).finally(() => {
    inFlight.delete(uri);
  });
  inFlight.set(uri, promise);
  return promise;
}

/** 删除该占位对应的本地文件并取消进行中的下载，用于解码失败后强制重试。 */
export async function invalidateRemoteImageCache(uri: string, reason = 'unknown'): Promise<void> {
  if (!uri || !isHttpUrl(uri)) return;
  imgCount('invalidate');
  imgLog('invalidate (delete local file + map row)', { uri: shortRef(uri), reason });
  inFlight.delete(uri);
  await removeCacheMap(uri);
  await deleteLocalFilesByPlaceholder(uri);
}

export async function getRemoteImageCacheCount(): Promise<number> {
  return countRemoteImageStore();
}

export async function clearRemoteImageCache(): Promise<void> {
  imgLog('clearRemoteImageCache (user cleared all image cache)');
  clearGeneration += 1;
  inFlight.clear();
  await clearCacheMap();
  await clearRemoteImageStore();
}
