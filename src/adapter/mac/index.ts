import { IImagePickerAdapter } from '../ImagePickerAdapter';
import { IImageRendererAdapter } from '../ImageRendererAdapter';
import { pickImageFromLibrary } from '../pickImageShared';
import { MacPlatformImage } from './PlatformImage';

export const MacImagePickerAdapter: IImagePickerAdapter = {
  pickImage: pickImageFromLibrary,
};

export const MacImageRendererAdapter: IImageRendererAdapter = {
  Image: MacPlatformImage,
};
