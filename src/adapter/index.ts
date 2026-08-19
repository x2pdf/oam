import { Platform } from 'react-native';
import { IImagePickerAdapter } from './ImagePickerAdapter';
import { IImageRendererAdapter } from './ImageRendererAdapter';
import { AndroidImagePickerAdapter, AndroidImageRendererAdapter } from './android';
import { IosImagePickerAdapter, IosImageRendererAdapter } from './ios';
import { MacImagePickerAdapter, MacImageRendererAdapter } from './mac';
import { WindowsImagePickerAdapter, WindowsImageRendererAdapter } from './windows';

export function getImagePickerAdapter(): IImagePickerAdapter {
  if (Platform.OS === 'android') {
    return AndroidImagePickerAdapter;
  } else if (Platform.OS === 'ios') {
    return IosImagePickerAdapter;
  } else if (Platform.OS === 'macos') {
    return MacImagePickerAdapter;
  } else if (Platform.OS === 'windows') {
    return WindowsImagePickerAdapter;
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
  }

  return AndroidImageRendererAdapter;
}
