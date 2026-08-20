import { IImagePickerAdapter } from '../ImagePickerAdapter';
import { IImageRendererAdapter } from '../ImageRendererAdapter';
import { pickImageFromFiles, pickImageFromLibrary } from '../pickImageShared';
import { AndroidPlatformImage } from './PlatformImage';

export const AndroidImagePickerAdapter: IImagePickerAdapter = {
  pickImage: pickImageFromLibrary,
  pickImageFromFiles,
};

export const AndroidImageRendererAdapter: IImageRendererAdapter = {
  Image: AndroidPlatformImage,
};
