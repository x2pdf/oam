import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { getImageRendererAdapter } from '../adapter';
import { PlatformImageProps } from '../adapter/ImageRendererAdapter';
import { useImageAspectRatio } from '../hooks/useImageAspectRatio';
import { isHttpUrl } from '../utils/attachment';
import { isDesktopOs } from '../theme/layout';
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
}) => {
  const theme = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const aspectRatio = useImageAspectRatio(uri);
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
    () => [styles.image, { backgroundColor }],
    [backgroundColor],
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
    />
  );

  return (
    <View style={styles.outer} onLayout={onLayout}>
      <View style={[styles.clip, containerStyle, { backgroundColor }]}>{inner}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    marginVertical: 8,
  },
  clip: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
