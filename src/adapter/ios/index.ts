import { IImagePickerAdapter } from '../ImagePickerAdapter';
import { IImageRendererAdapter } from '../ImageRendererAdapter';
import { pickImageFromLibrary } from '../pickImageShared';
import { IosPlatformImage } from './PlatformImage';

export const IosImagePickerAdapter: IImagePickerAdapter = {
  pickImage: pickImageFromLibrary,
};

export const IosImageRendererAdapter: IImageRendererAdapter = {
  Image: IosPlatformImage,
};
