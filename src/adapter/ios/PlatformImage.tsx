import React from 'react';
import { PlatformImageProps } from '../ImageRendererAdapter';
import { RnPlatformImage } from '../RnPlatformImage';
import { wrapImagePress } from '../wrapImagePress';

export const IosPlatformImage: React.FC<PlatformImageProps> = ({
  onPress,
  onLongPress,
  ...rest
}) => {
  return wrapImagePress(<RnPlatformImage {...rest} />, { onPress, onLongPress });
};
