import React from 'react';
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
  const { uri, style, resizeMode = 'contain', mimeType } = props;

  if (!isGifUri(uri, mimeType)) {
    return <RnPlatformImage {...props} />;
  }

  return (
    <ExpoImage
      source={{ uri }}
      style={style}
      contentFit={toContentFit(resizeMode)}
      autoplay
    />
  );
};
