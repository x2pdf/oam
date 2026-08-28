import React from 'react';
import { Image as ExpoImage, ImageContentFit } from 'expo-image';
import { PlatformImageProps } from '../ImageRendererAdapter';
import { RnPlatformImage } from '../RnPlatformImage';
import { isGifUri } from '../imageUri';
import { wrapImagePress } from '../wrapImagePress';

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
  const { uri, style, resizeMode = 'contain', mimeType, onPress, onLongPress } = props;

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

  return wrapImagePress(inner, { onPress, onLongPress });
};
