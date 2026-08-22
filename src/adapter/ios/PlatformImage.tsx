import React from 'react';
import { Pressable } from 'react-native';
import { PlatformImageProps } from '../ImageRendererAdapter';
import { RnPlatformImage } from '../RnPlatformImage';

export const IosPlatformImage: React.FC<PlatformImageProps> = ({ onLongPress, ...rest }) => {
  if (!onLongPress) {
    return <RnPlatformImage {...rest} />;
  }
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={400}>
      <RnPlatformImage {...rest} />
    </Pressable>
  );
};
