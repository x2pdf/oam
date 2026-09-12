import { useCallback, useEffect, useState } from 'react';
import { peekCachedRemoteImageUri, resolveRemoteImageUri } from '../adapter/remoteImageLoader';
import { isHttpUrl } from '../utils/attachment';

function isLocalImageUri(uri: string): boolean {
  return uri.startsWith('data:') || uri.startsWith('file:') || uri.startsWith('blob:');
}

export function useCachedRemoteImage(uri: string | null | undefined, mimeHint?: string) {
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (source: string, hint?: string) => {
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

    const peeked = peekCachedRemoteImageUri(source);
    if (peeked) {
      setDisplayUri(peeked);
      setLoading(false);
      setFailed(false);
      return;
    }

    setLoading(true);
    setFailed(false);

    try {
      const resolved = await resolveRemoteImageUri(source, hint);
      setDisplayUri(resolved);
      setFailed(false);
    } catch {
      setDisplayUri(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const retry = useCallback(() => {
    if (uri) {
      load(uri, mimeHint);
    }
  }, [load, mimeHint, uri]);

  useEffect(() => {
    if (!uri) {
      setDisplayUri(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    load(uri, mimeHint);
  }, [load, mimeHint, uri]);

  return { displayUri, loading, failed, retry };
}
