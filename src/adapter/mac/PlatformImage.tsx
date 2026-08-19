import React from 'react';
import { PlatformImageProps } from '../ImageRendererAdapter';
import { GifWebView } from '../GifWebView';
import { RnPlatformImage } from '../RnPlatformImage';
import { isGifUri } from '../imageUri';

export const MacPlatformImage: React.FC<PlatformImageProps> = (props) => {
  if (isGifUri(props.uri, props.mimeType)) {
    return <GifWebView {...props} />;
  }
  return <RnPlatformImage {...props} />;
};
