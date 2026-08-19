import { IImagePickerAdapter } from '../ImagePickerAdapter';
import { IImageRendererAdapter } from '../ImageRendererAdapter';
import { pickImageFromLibrary } from '../pickImageShared';
import { AndroidPlatformImage } from './PlatformImage';

export const AndroidImagePickerAdapter: IImagePickerAdapter = {
  pickImage: pickImageFromLibrary,
};

export const AndroidImageRendererAdapter: IImageRendererAdapter = {
  Image: AndroidPlatformImage,
};
