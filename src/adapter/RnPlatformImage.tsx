import React from 'react';
import { Image } from 'react-native';
import { PlatformImageProps } from './ImageRendererAdapter';

export const RnPlatformImage: React.FC<PlatformImageProps> = ({
  uri,
  style,
  resizeMode = 'contain',
}) => {
  return <Image source={{ uri }} style={style} resizeMode={resizeMode} />;
};
