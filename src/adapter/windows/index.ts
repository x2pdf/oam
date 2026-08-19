import { IImagePickerAdapter } from '../ImagePickerAdapter';
import { IImageRendererAdapter } from '../ImageRendererAdapter';
import { pickImageFromLibrary } from '../pickImageShared';
import { WindowsPlatformImage } from './PlatformImage';

export const WindowsImagePickerAdapter: IImagePickerAdapter = {
  pickImage: pickImageFromLibrary,
};

export const WindowsImageRendererAdapter: IImageRendererAdapter = {
  Image: WindowsPlatformImage,
};
