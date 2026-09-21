import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { getImageRendererAdapter, peekCachedRemoteImageUri } from '../adapter';
import { PlatformImageProps } from '../adapter/ImageRendererAdapter';
import { useImageAspectRatio } from '../hooks/useImageAspectRatio';
import { isHttpUrl } from '../utils/attachment';
import { isDesktopOs } from '../theme/layout';
import {
  pickCachedAspectRatio,
  rememberImageAspectRatio,
} from '../utils/imageAspectRatioCache';
import { CachedRemoteImage } from './CachedRemoteImage';

const LIST_GUTTER = 16;

const PlatformImage = getImageRendererAdapter().Image;

/** Placeholder ratio while Image.getSize is pending or failed. */
const LOADING_ASPECT_RATIO = 4 / 3;
export const MAX_IMAGE_HEIGHT_RATIO = 0.6;

export type ContentCardImageProps = {
  uri: string;
  mimeType?: string;
  onPress?: () => void;
  onPressWithUri?: (resolvedUri: string) => void;
  onLongPress?: () => void;
  onError?: () => void;
  /** 变化时即使上次失败也会重新拉取远程图 */
  reloadToken?: number;
};

function estimateContentWidth(screenWidth: number, screenHeight: number): number {
  const centered = isDesktopOs() && screenWidth > screenHeight;
  return centered ? screenWidth * 0.5 : screenWidth - LIST_GUTTER * 2;
}

export function computeContentCardImageLayout(
  layoutWidth: number,
  aspectRatio: number | null,
  screenHeight: number,
  screenWidth: number,
): {
  containerStyle: { width: '100%'; aspectRatio?: number; height?: number };
  resizeMode: NonNullable<PlatformImageProps['resizeMode']>;
} {
  const ratio = aspectRatio ?? LOADING_ASPECT_RATIO;
  const maxHeight = screenHeight * MAX_IMAGE_HEIGHT_RATIO;
  const widthForLayout =
    layoutWidth > 0 ? layoutWidth : estimateContentWidth(screenWidth, screenHeight);
  const naturalHeight = widthForLayout / ratio;

  if (aspectRatio != null && naturalHeight > maxHeight) {
    return {
      containerStyle: { width: '100%', height: maxHeight },
      resizeMode: 'cover',
    };
  }

  return {
    containerStyle: { width: '100%', aspectRatio: ratio },
    resizeMode: 'contain',
  };
}

export const ContentCardImage: React.FC<ContentCardImageProps> = ({
  uri,
  mimeType,
  onPress,
  onPressWithUri,
  onLongPress,
  onError,
  reloadToken,
}) => {
  const theme = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [resolvedUri, setResolvedUri] = useState<string | null>(() =>
    isHttpUrl(uri) ? peekCachedRemoteImageUri(uri) : null,
  );

  const aspectCandidates = useMemo(() => {
    const list = [uri];
    if (resolvedUri && resolvedUri !== uri) {
      list.push(resolvedUri);
    }
    return list;
  }, [uri, resolvedUri]);

  const [loadedAspectRatio, setLoadedAspectRatio] = useState<number | null>(() =>
    pickCachedAspectRatio([uri]),
  );

  useEffect(() => {
    setResolvedUri(isHttpUrl(uri) ? peekCachedRemoteImageUri(uri) : null);
  }, [uri]);

  useEffect(() => {
    const cached = pickCachedAspectRatio(aspectCandidates);
    if (cached != null) {
      setLoadedAspectRatio(cached);
    }
  }, [aspectCandidates]);

  useEffect(() => {
    setLoadedAspectRatio(pickCachedAspectRatio([uri]));
  }, [uri]);

  const hookAspectRatio = useImageAspectRatio(aspectCandidates);
  const aspectRatio = loadedAspectRatio ?? hookAspectRatio;

  const handleLoadDimensions = useCallback(
    (size: { width: number; height: number }) => {
      if (size.width <= 0 || size.height <= 0) {
        return;
      }
      const ratio = size.width / size.height;
      rememberImageAspectRatio(ratio, uri, resolvedUri ?? undefined);
      setLoadedAspectRatio(ratio);
    },
    [uri, resolvedUri],
  );

  const handleDisplayUri = useCallback(
    (localUri: string) => {
      setResolvedUri(localUri);
      const cached = pickCachedAspectRatio([uri, localUri]);
      if (cached != null) {
        setLoadedAspectRatio(cached);
      }
    },
    [uri],
  );

  const [layoutWidth, setLayoutWidth] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    if (w > 0) {
      setLayoutWidth(w);
    }
  }, []);

  const { containerStyle, resizeMode } = useMemo(
    () =>
      computeContentCardImageLayout(layoutWidth, aspectRatio, screenHeight, screenWidth),
    [layoutWidth, aspectRatio, screenHeight, screenWidth],
  );

  const backgroundColor = theme.dark ? '#262626' : '#F5F5F5';
  const imageStyle = useMemo(
    () => [styles.image, containerStyle, { backgroundColor }],
    [containerStyle, backgroundColor],
  );

  const inner = isHttpUrl(uri) ? (
    <CachedRemoteImage
      uri={uri}
      mimeType={mimeType}
      style={imageStyle}
      containerStyle={containerStyle}
      resizeMode={resizeMode}
      onPressWithUri={onPressWithUri}
      onPress={onPress}
      onLongPress={onLongPress}
      onError={onError}
      onDisplayUri={handleDisplayUri}
      onLoadDimensions={handleLoadDimensions}
      reloadToken={reloadToken}
    />
  ) : (
    <PlatformImage
      uri={uri}
      mimeType={mimeType}
      style={imageStyle}
      resizeMode={resizeMode}
      onPress={onPress}
      onLongPress={onLongPress}
      onError={onError}
      onLoadDimensions={handleLoadDimensions}
    />
  );

  return (
    <View style={styles.outer} onLayout={onLayout}>
      <View style={[styles.clip, { backgroundColor }]}>{inner}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    alignSelf: 'stretch',
    marginVertical: 8,
  },
  clip: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
  },
});
