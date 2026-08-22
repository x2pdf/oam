import React from 'react';
import { Pressable } from 'react-native';
import { PlatformImageProps } from '../ImageRendererAdapter';
import { GifWebView } from '../GifWebView';
import { RnPlatformImage } from '../RnPlatformImage';
import { isGifUri } from '../imageUri';

export const MacPlatformImage: React.FC<PlatformImageProps> = ({ onLongPress, ...rest }) => {
  const inner = isGifUri(rest.uri, rest.mimeType) ? (
    <GifWebView {...rest} />
  ) : (
    <RnPlatformImage {...rest} />
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
