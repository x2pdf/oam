import { useEffect, useMemo, useState } from 'react';
import { Image } from 'react-native';
import {
  getCachedImageAspectRatio,
  pickCachedAspectRatio,
  rememberImageAspectRatio,
} from '../utils/imageAspectRatioCache';

function normalizeCandidates(uri: string | string[] | undefined | null): string[] {
  if (!uri) {
    return [];
  }
  const list = Array.isArray(uri) ? uri : [uri];
  return list.filter((u) => typeof u === 'string' && u.length > 0);
}

/**
 * Returns width/height from cache or Image.getSize (tries each candidate URI).
 */
export function useImageAspectRatio(uri: string | string[] | undefined | null): number | null {
  const candidates = useMemo(() => normalizeCandidates(uri), [uri]);
  const candidatesKey = candidates.join('\0');
  const primaryUri = candidates[0] ?? '';

  const [aspectRatio, setAspectRatio] = useState<number | null>(() =>
    pickCachedAspectRatio(candidates),
  );

  useEffect(() => {
    setAspectRatio(pickCachedAspectRatio([primaryUri]));
  }, [primaryUri]);

  useEffect(() => {
    if (candidates.length === 0) {
      setAspectRatio(null);
      return;
    }

    const cached = pickCachedAspectRatio(candidates);
    if (cached != null) {
      setAspectRatio(cached);
      return;
    }

    let cancelled = false;
    let pending = 0;

    for (const candidate of candidates) {
      if (getCachedImageAspectRatio(candidate) != null) {
        continue;
      }
      pending += 1;
      Image.getSize(
        candidate,
        (width, height) => {
          pending -= 1;
          if (cancelled || width <= 0 || height <= 0) {
            return;
          }
          const ratio = width / height;
          rememberImageAspectRatio(ratio, ...candidates, candidate);
          setAspectRatio(ratio);
        },
        () => {
          pending -= 1;
        },
      );
    }

    return () => {
      cancelled = true;
    };
  }, [candidatesKey, candidates]);

  return aspectRatio;
}
