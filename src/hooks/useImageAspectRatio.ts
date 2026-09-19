import { useEffect, useState } from 'react';
import { Image } from 'react-native';

/**
 * Returns width/height from Image.getSize, or null while unknown / on failure.
 */
export function useImageAspectRatio(uri: string | undefined | null): number | null {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!uri) {
      setAspectRatio(null);
      return;
    }

    let cancelled = false;
    setAspectRatio(null);

    Image.getSize(
      uri,
      (width, height) => {
        if (cancelled || width <= 0 || height <= 0) {
          return;
        }
        setAspectRatio(width / height);
      },
      () => {
        if (!cancelled) {
          setAspectRatio(null);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [uri]);

  return aspectRatio;
}
