import React from 'react';
import { PlatformImageProps } from '../ImageRendererAdapter';
import { RnPlatformImage } from '../RnPlatformImage';

export const IosPlatformImage: React.FC<PlatformImageProps> = (props) => {
  return <RnPlatformImage {...props} />;
};
