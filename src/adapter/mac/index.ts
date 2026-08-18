import * as ImagePicker from 'expo-image-picker';
import { IImagePickerAdapter, ImagePickerResult } from '../ImagePickerAdapter';

// For macOS, if using Expo/React Native, it might use web-based picker or native bridge
export const MacImagePickerAdapter: IImagePickerAdapter = {
  async pickImage(): Promise<ImagePickerResult | null> {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const uri = asset.uri;
      const fileName = asset.fileName || uri.split('/').pop();
      const mimeType = asset.mimeType || 'image/jpeg';

      if (!['image/jpeg', 'image/jpg', 'image/png', 'image/gif'].includes(mimeType.toLowerCase())) {
        return null;
      }

      let type: 'image/png' | 'image/jpeg' | 'image/gif' = 'image/jpeg';
      if (mimeType.includes('png')) {
        type = 'image/png';
      } else if (mimeType.includes('gif')) {
        type = 'image/gif';
      }

      return {
        base64: asset.base64 || '',
        uri: asset.uri,
        name: fileName,
        type: type,
      };
    }
    return null;
  }
};
