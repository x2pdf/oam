import React from 'react';
import { Image } from 'react-native';
import { PlatformImageProps } from './ImageRendererAdapter';

export const RnPlatformImage: React.FC<PlatformImageProps> = ({
  uri,
  style,
  resizeMode = 'contain',
  onError,
  onLoadDimensions,
}) => {
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      onError={onError}
      onLoad={(event) => {
        const { width, height } = event.nativeEvent.source;
        if (width > 0 && height > 0) {
          onLoadDimensions?.({ width, height });
        }
      }}
    />
  );
};
