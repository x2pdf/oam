import { IImagePickerAdapter } from '../ImagePickerAdapter';
import { IImageRendererAdapter } from '../ImageRendererAdapter';
import { pickImageFromFiles, pickImageFromLibrary } from '../pickImageShared';
import { MacPlatformImage } from './PlatformImage';

export const MacImagePickerAdapter: IImagePickerAdapter = {
  pickImage: pickImageFromLibrary,
  pickImageFromFiles,
};

export const MacImageRendererAdapter: IImageRendererAdapter = {
  Image: MacPlatformImage,
};
