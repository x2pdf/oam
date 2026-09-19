const aspectRatioByUri = new Map<string, number>();

export function getCachedImageAspectRatio(uri: string | undefined | null): number | null {
  if (!uri) {
    return null;
  }
  return aspectRatioByUri.get(uri) ?? null;
}

/** Remember ratio for one or more equivalent URIs (http + cached file://). */
export function rememberImageAspectRatio(ratio: number, ...uris: Array<string | undefined | null>): void {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return;
  }
  for (const uri of uris) {
    if (uri) {
      aspectRatioByUri.set(uri, ratio);
    }
  }
}

export function pickCachedAspectRatio(candidates: string[]): number | null {
  for (const uri of candidates) {
    const cached = getCachedImageAspectRatio(uri);
    if (cached != null) {
      return cached;
    }
  }
  return null;
}
