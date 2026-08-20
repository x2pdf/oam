import { IImagePickerAdapter } from '../ImagePickerAdapter';
import { IImageRendererAdapter } from '../ImageRendererAdapter';
import { pickImageFromFiles, pickImageFromLibrary } from '../pickImageShared';
import { WindowsPlatformImage } from './PlatformImage';

export const WindowsImagePickerAdapter: IImagePickerAdapter = {
  pickImage: pickImageFromLibrary,
  pickImageFromFiles,
};

export const WindowsImageRendererAdapter: IImageRendererAdapter = {
  Image: WindowsPlatformImage,
};
