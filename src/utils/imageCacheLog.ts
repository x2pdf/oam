/**
 * 远程图片缓存诊断日志。统一前缀 `[img-cache]`，在 Xcode 控制台 / Metro 里按此过滤。
 * 关闭：把 IMAGE_CACHE_LOG_ENABLED 改为 false。
 *
 * 除逐条事件外，还会在活动停止 SUMMARY_DELAY_MS 后输出一次累计统计，
 * 方便对比两次部署后启动时：多少张命中本地、多少张走了网络下载。
 */
export const IMAGE_CACHE_LOG_ENABLED = true;

const TAG = '[img-cache]';
const SUMMARY_DELAY_MS = 4000;
const sessionStart = Date.now();

type Counter =
  | 'hitHint'
  | 'hitPeek'
  | 'hitDisk'
  | 'hitInflight'
  | 'staleHint'
  | 'staleMapPath'
  | 'downloadStart'
  | 'downloadOk'
  | 'downloadFail'
  | 'netRequest'
  | 'invalidate'
  | 'renderError'
  | 'hydrateMem'
  | 'hydrateDisk'
  | 'hydrateMiss';

const counters: Record<Counter, number> = {
  hitHint: 0,
  hitPeek: 0,
  hitDisk: 0,
  hitInflight: 0,
  staleHint: 0,
  staleMapPath: 0,
  downloadStart: 0,
  downloadOk: 0,
  downloadFail: 0,
  netRequest: 0,
  invalidate: 0,
  renderError: 0,
  hydrateMem: 0,
  hydrateDisk: 0,
  hydrateMiss: 0,
};
const downloadedUris = new Set<string>();
let summaryTimer: ReturnType<typeof setTimeout> | null = null;

function elapsed(): string {
  return `+${((Date.now() - sessionStart) / 1000).toFixed(1)}s`;
}

/** 截短 URL / 路径，保留头尾以便辨认。 */
export function shortRef(value: string | null | undefined, max = 96): string {
  if (!value) {
    return String(value);
  }
  if (value.length <= max) {
    return value;
  }
  const head = Math.floor(max / 2) - 2;
  return `${value.slice(0, head)}…${value.slice(value.length - (max - head - 1))}`;
}

function scheduleSummary(): void {
  if (summaryTimer) {
    clearTimeout(summaryTimer);
  }
  summaryTimer = setTimeout(() => {
    summaryTimer = null;
    imgLog('summary', {
      ...counters,
      distinctDownloaded: downloadedUris.size,
    });
  }, SUMMARY_DELAY_MS);
}

export function imgLog(event: string, detail?: Record<string, unknown> | string): void {
  if (!IMAGE_CACHE_LOG_ENABLED) {
    return;
  }
  if (detail === undefined) {
    console.log(`${TAG} ${elapsed()} ${event}`);
  } else if (typeof detail === 'string') {
    console.log(`${TAG} ${elapsed()} ${event} ${detail}`);
  } else {
    console.log(`${TAG} ${elapsed()} ${event} ${JSON.stringify(detail)}`);
  }
}

export function imgCount(counter: Counter, uri?: string): void {
  if (!IMAGE_CACHE_LOG_ENABLED) {
    return;
  }
  counters[counter] += 1;
  if (counter === 'downloadOk' && uri) {
    downloadedUris.add(uri);
  }
  scheduleSummary();
}

/** 从 file:// 路径中取出 iOS 应用容器前缀（含 UUID），用于发现重装后容器路径变化。 */
export function containerPrefixOf(path: string): string | null {
  const match = /^(?:file:\/\/)?(.*?\/Containers\/Data\/Application\/[0-9A-Fa-f-]+\/)/.exec(path);
  if (match) {
    return match[1];
  }
  const docs = /^(?:file:\/\/)?(.*?\/Documents\/)/.exec(path);
  return docs ? docs[1] : null;
}
