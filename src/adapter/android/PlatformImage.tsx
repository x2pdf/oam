import React from 'react';
import { Pressable } from 'react-native';
import { Image as ExpoImage, ImageContentFit } from 'expo-image';
import { PlatformImageProps } from '../ImageRendererAdapter';
import { RnPlatformImage } from '../RnPlatformImage';
import { isGifUri } from '../imageUri';

function toContentFit(resizeMode: PlatformImageProps['resizeMode']): ImageContentFit {
  if (resizeMode === 'cover') {
    return 'cover';
  }
  if (resizeMode === 'stretch') {
    return 'fill';
  }
  return 'contain';
}

export const AndroidPlatformImage: React.FC<PlatformImageProps> = (props) => {
  const { uri, style, resizeMode = 'contain', mimeType, onLongPress } = props;

  const inner = isGifUri(uri, mimeType) ? (
    <ExpoImage
      source={{ uri }}
      style={style}
      contentFit={toContentFit(resizeMode)}
      autoplay
    />
  ) : (
    <RnPlatformImage {...props} />
  );

  if (!onLongPress) {
    return inner;
  }

  return (
    <Pressable onLongPress={onLongPress} delayLongPress={400}>
      {inner}
    </Pressable>
  );
};
