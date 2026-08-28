import React from 'react';
import { PlatformImageProps } from '../ImageRendererAdapter';
import { GifWebView } from '../GifWebView';
import { RnPlatformImage } from '../RnPlatformImage';
import { isGifUri } from '../imageUri';
import { wrapImagePress } from '../wrapImagePress';

export const MacPlatformImage: React.FC<PlatformImageProps> = ({
  onPress,
  onLongPress,
  ...rest
}) => {
  const inner = isGifUri(rest.uri, rest.mimeType) ? (
    <GifWebView {...rest} />
  ) : (
    <RnPlatformImage {...rest} />
  );

  return wrapImagePress(inner, { onPress, onLongPress });
};
