import { Platform } from 'react-native';
import { IImagePickerAdapter } from './ImagePickerAdapter';
import { AndroidImagePickerAdapter } from './android';
import { IosImagePickerAdapter } from './ios';
import { MacImagePickerAdapter } from './mac';
import { WindowsImagePickerAdapter } from './windows';

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

  // Default to Android one as it uses standard expo-image-picker
  return AndroidImagePickerAdapter;
}
