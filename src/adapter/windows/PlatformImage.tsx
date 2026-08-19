import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { PlatformImageProps } from '../ImageRendererAdapter';
import { GifWebView } from '../GifWebView';
import { RnPlatformImage } from '../RnPlatformImage';
import { hashBase64, isGifUri, parseDataUrl } from '../imageUri';

async function materializeUri(uri: string): Promise<string> {
  if (!uri.startsWith('data:')) {
    return uri;
  }

  const parsed = parseDataUrl(uri);
  if (!parsed) {
    return uri;
  }

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    return uri;
  }

  const folder = `${cacheDir}oam-images/`;
  const folderInfo = await FileSystem.getInfoAsync(folder);
  if (!folderInfo.exists) {
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  }

  const path = `${folder}${hashBase64(parsed.base64)}.${parsed.ext}`;
  const fileInfo = await FileSystem.getInfoAsync(path);
  if (!fileInfo.exists) {
    await FileSystem.writeAsStringAsync(path, parsed.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  if (path.startsWith('file:')) {
    return path;
  }
  return `file://${path.replace(/\\/g, '/')}`;
}

export const WindowsPlatformImage: React.FC<PlatformImageProps> = (props) => {
  const { uri, style, mimeType } = props;
  const gif = isGifUri(uri, mimeType);
  const [localUri, setLocalUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    materializeUri(uri)
      .then((resolved) => {
        if (!cancelled) {
          setLocalUri(resolved);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLocalUri(uri);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!localUri) {
    return <View style={style} />;
  }

  if (gif) {
    return <GifWebView {...props} uri={localUri} />;
  }

  return <RnPlatformImage {...props} uri={localUri} />;
};
