import { expandCandidateUrls } from '../adapter/remoteImageLoader';
import { DATA_SOURCE_REQUEST_TIMEOUT_MS } from '../constants';
import { fetchImageWithTimeout, fetchWithTimeout } from '../datasource/fetchWithTimeout';
import { isHttpUrl } from './attachment';

function parseContentLength(response: Response): number | null {
  const cl = response.headers.get('content-length');
  if (cl) {
    const n = parseInt(cl, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const cr = response.headers.get('content-range');
  if (cr) {
    const match = /\/(\d+)\s*$/.exec(cr);
    if (match) {
      const total = parseInt(match[1], 10);
      if (Number.isFinite(total) && total >= 0) return total;
    }
  }
  return null;
}

/** Best-effort remote size via HEAD or a single-byte Range GET (Arweave gateway fallback). */
export async function probeRemoteContentLength(href: string): Promise<number | null> {
  if (!isHttpUrl(href)) return null;

  const urls = [...new Set(expandCandidateUrls(href))];
  for (const url of urls) {
    try {
      const head = await fetchWithTimeout(url, { method: 'HEAD' }, DATA_SOURCE_REQUEST_TIMEOUT_MS);
      if (head.ok) {
        const len = parseContentLength(head);
        if (len != null) return len;
      }

      const ranged = await fetchImageWithTimeout(url, DATA_SOURCE_REQUEST_TIMEOUT_MS, {
        Range: 'bytes=0-0',
      });
      if (ranged.ok || ranged.status === 206) {
        const len = parseContentLength(ranged);
        if (len != null) return len;
      }
    } catch {
      // try next gateway / URL
    }
  }
  return null;
}
