export interface ImagePickerResult {
  base64: string;
  uri: string;
  name?: string;
  type: 'image/jpeg' | 'image/png' | 'image/gif';
}

export interface IImagePickerAdapter {
  pickImage(): Promise<ImagePickerResult | null>;
}
