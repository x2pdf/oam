import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  expandCandidateUrls,
  invalidateRemoteImageCache,
  resolveRemoteImageUri,
} from '../adapter/remoteImageLoader';
import { peekCachedImagePath } from '../adapter/cacheMapService';
import { isHttpUrl, isLocalImageUri } from '../utils/attachment';

function computeInitialDisplayUri(
  uri: string | null | undefined,
  hintPath?: string,
): string | null {
  if (!uri) {
    return null;
  }
  if (isLocalImageUri(uri)) {
    return uri;
  }
  if (!isHttpUrl(uri)) {
    return null;
  }
  const mapped = hintPath || peekCachedImagePath(uri);
  if (mapped) {
    return mapped;
  }
  if (Platform.OS === 'web') {
    return expandCandidateUrls(uri)[0] ?? uri;
  }
  return null;
}

export function useCachedRemoteImage(
  uri: string | null | undefined,
  options?: {
    mimeHint?: string;
    reloadToken?: number;
    cacheMap?: Record<string, string>;
    onCacheMapped?: (placeholder: string, path: string) => void;
  },
) {
  const mimeHint = options?.mimeHint;
  const reloadToken = options?.reloadToken;
  const hintPath = uri
    ? peekCachedImagePath(uri) || options?.cacheMap?.[uri]
    : undefined;
  const onCacheMapped = options?.onCacheMapped;

  const [displayUri, setDisplayUri] = useState<string | null>(() =>
    computeInitialDisplayUri(uri, hintPath),
  );
  const [loading, setLoading] = useState(() => {
    const initial = computeInitialDisplayUri(uri, hintPath);
    return !initial && !!uri && isHttpUrl(uri) && Platform.OS !== 'web';
  });
  const [failed, setFailed] = useState(false);
  const [forceToken, setForceToken] = useState(0);
  const reloadTokenRef = useRef(reloadToken);
  const onCacheMappedRef = useRef(onCacheMapped);
  onCacheMappedRef.current = onCacheMapped;

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

    const resolvedHint = force ? undefined : (hint ?? peekCachedImagePath(source));
    const alreadyShowing = !!resolvedHint;
    if (!alreadyShowing) {
      setLoading(true);
    }
    setFailed(false);

    try {
      const resolved = await resolveRemoteImageUri(source, mimeHint, resolvedHint);
      setDisplayUri(resolved);
      setFailed(false);
      if (resolved && resolved !== source && isLocalImageUri(resolved)) {
        onCacheMappedRef.current?.(source, resolved);
      }
    } catch (e) {
      console.error('[useCachedRemoteImage] load failed', source, e);
      if (!alreadyShowing) {
        setDisplayUri(null);
        setFailed(true);
      }
    } finally {
      setLoading(false);
    }
  }, [mimeHint]);

  const retry = useCallback(() => {
    if (!uri) return;
    setForceToken((n) => n + 1);
  }, [uri]);

  useEffect(() => {
    if (reloadToken === undefined) {
      return;
    }
    if (reloadTokenRef.current === reloadToken) {
      return;
    }
    reloadTokenRef.current = reloadToken;
    setForceToken((n) => n + 1);
  }, [reloadToken]);

  useEffect(() => {
    if (!uri) {
      setDisplayUri(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const initial = computeInitialDisplayUri(uri, hintPath);
    if (initial && forceToken === 0) {
      setDisplayUri(initial);
      setLoading(false);
      setFailed(false);
    } else if (!initial && forceToken === 0) {
      setDisplayUri(null);
    }
    load(uri, hintPath, forceToken > 0);
  }, [load, uri, hintPath, forceToken]);

  return {
    displayUri,
    loading,
    failed,
    retry,
    invalidate: () => invalidateRemoteImageCache(uri ?? ''),
  };
}
