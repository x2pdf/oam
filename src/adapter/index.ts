import { Platform } from 'react-native';
import { IImagePickerAdapter } from './ImagePickerAdapter';
import { IImageRendererAdapter } from './ImageRendererAdapter';
import { AndroidImagePickerAdapter, AndroidImageRendererAdapter } from './android';
import { IosImagePickerAdapter, IosImageRendererAdapter } from './ios';
import { MacImagePickerAdapter, MacImageRendererAdapter } from './mac';
import { WindowsImagePickerAdapter, WindowsImageRendererAdapter } from './windows';

export { saveImageToAlbum } from './saveImage';
export { openUrl } from './openUrl';
export {
  resolveRemoteImageUri,
  expandCandidateUrls,
  clearRemoteImageCache,
  getRemoteImageCacheCount,
} from './remoteImageLoader';
export { peekCachedImagePath, hydrateCacheMap } from './cacheMapService';
export {
  collectImagePlaceholders,
  peekLocalFileByPlaceholder,
  clearRemoteImageStore,
  countRemoteImageStore,
} from './remoteImageStore';

export function getImagePickerAdapter(): IImagePickerAdapter {
  if (Platform.OS === 'android') {
    return AndroidImagePickerAdapter;
  } else if (Platform.OS === 'ios') {
    return IosImagePickerAdapter;
  } else if (Platform.OS === 'macos') {
    return MacImagePickerAdapter;
  } else if (Platform.OS === 'windows') {
    return WindowsImagePickerAdapter;
  } else if (Platform.OS === 'web') {
    return AndroidImagePickerAdapter;
  }

  return AndroidImagePickerAdapter;
}

export function getImageRendererAdapter(): IImageRendererAdapter {
  if (Platform.OS === 'android') {
    return AndroidImageRendererAdapter;
  } else if (Platform.OS === 'ios') {
    return IosImageRendererAdapter;
  } else if (Platform.OS === 'macos') {
    return MacImageRendererAdapter;
  } else if (Platform.OS === 'windows') {
    return WindowsImageRendererAdapter;
  } else if (Platform.OS === 'web') {
    return AndroidImageRendererAdapter;
  }

  return AndroidImageRendererAdapter;
}
