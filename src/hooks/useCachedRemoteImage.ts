import { useCallback, useEffect, useState } from 'react';
import {
  invalidateRemoteImageCache,
  peekCachedRemoteImageUri,
  resolveRemoteImageUri,
} from '../adapter/remoteImageLoader';
import { isHttpUrl } from '../utils/attachment';

function isLocalImageUri(uri: string): boolean {
  return uri.startsWith('data:') || uri.startsWith('file:') || uri.startsWith('blob:');
}

export function useCachedRemoteImage(
  uri: string | null | undefined,
  mimeHint?: string,
  reloadToken?: number,
) {
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // reloadToken / retry() both bump this counter; when > 0 we skip the in-memory
  // peek and force a fresh download so stale caches are revalidated.
  const [forceToken, setForceToken] = useState(0);

  const load = useCallback(async (source: string, hint?: string, force = false) => {
    if (!isLocalImageUri(source) && !isHttpUrl(source)) {
      setDisplayUri(null);
      setLoading(false);
      setFailed(true);
      return;
    }

    if (!isHttpUrl(source)) {
      setDisplayUri(source);
      setLoading(false);
      setFailed(false);
      return;
    }

    if (!force) {
      const peeked = peekCachedRemoteImageUri(source);
      if (peeked) {
        setDisplayUri(peeked);
        setLoading(false);
        setFailed(false);
        return;
      }
    }

    setLoading(true);
    setFailed(false);

    try {
      const resolved = await resolveRemoteImageUri(source, hint);
      setDisplayUri(resolved);
      setFailed(false);
    } catch (e) {
      console.error('[useCachedRemoteImage] load failed', source, e);
      setDisplayUri(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const retry = useCallback(() => {
    if (!uri) return;
    setForceToken((n) => n + 1);
  }, [uri]);

  useEffect(() => {
    if (reloadToken !== undefined) {
      setForceToken((n) => n + 1);
    }
  }, [reloadToken]);

  useEffect(() => {
    if (!uri) {
      setDisplayUri(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    load(uri, mimeHint, forceToken > 0);
  }, [load, mimeHint, uri, forceToken]);

  return { displayUri, loading, failed, retry, invalidate: () => invalidateRemoteImageCache(uri ?? '') };
}
