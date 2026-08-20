import { IImagePickerAdapter } from '../ImagePickerAdapter';
import { IImageRendererAdapter } from '../ImageRendererAdapter';
import { pickImageFromFiles, pickImageFromLibrary } from '../pickImageShared';
import { IosPlatformImage } from './PlatformImage';

export const IosImagePickerAdapter: IImagePickerAdapter = {
  pickImage: pickImageFromLibrary,
  pickImageFromFiles,
};

export const IosImageRendererAdapter: IImageRendererAdapter = {
  Image: IosPlatformImage,
};
