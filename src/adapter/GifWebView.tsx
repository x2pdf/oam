import React, { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { PlatformImageProps } from './ImageRendererAdapter';
import { isSafeGifDataUrl, isSafeLocalGifFileUri } from './imageUri';

function objectFitFor(resizeMode: PlatformImageProps['resizeMode']): string {
  if (resizeMode === 'cover') {
    return 'cover';
  }
  if (resizeMode === 'stretch') {
    return 'fill';
  }
  return 'contain';
}

function buildSafeGifHtml(
  uri: string,
  resizeMode: PlatformImageProps['resizeMode']
): string | null {
  if (!isSafeGifDataUrl(uri) && !isSafeLocalGifFileUri(uri)) {
    return null;
  }
  const objectFit = objectFitFor(resizeMode);
  const src = uri.replace(/&/g, '&amp;');
  return (
    '<!DOCTYPE html><html><head>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>' +
    '<style>html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden;}' +
    `img{width:100%;height:100%;object-fit:${objectFit};display:block;}</style>` +
    `</head><body><img src="${src}"/></body></html>`
  );
}

export const GifWebView: React.FC<PlatformImageProps> = ({
  uri,
  style,
  resizeMode = 'contain',
}) => {
  const html = useMemo(() => buildSafeGifHtml(uri, resizeMode), [uri, resizeMode]);

  if (!html) {
    return <View style={style} />;
  }

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      style={style}
      scrollEnabled={false}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      androidLayerType="hardware"
      allowFileAccess
      allowFileAccessFromFileURLs
      allowingReadAccessToURL={uri.startsWith('file:') ? uri : undefined}
    />
  );
};
