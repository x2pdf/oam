import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ImagePickerResult } from './ImagePickerAdapter';
import { isGifBase64 } from './imageUri';

async function compressStillImage(
  uri: string,
  type: 'image/jpeg' | 'image/png'
): Promise<{ uri: string; base64: string } | null> {
  const format =
    type === 'image/png'
      ? ImageManipulator.SaveFormat.PNG
      : ImageManipulator.SaveFormat.JPEG;
  const compressed = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 0.8,
    format,
    base64: true,
  });
  if (!compressed.base64) {
    return null;
  }
  return { uri: compressed.uri, base64: compressed.base64 };
}

/**
 * Shared picker for all platforms.
 * GIF: no `quality` in the picker (iOS would otherwise convert GIF → JPEG).
 * jpeg/png: recompress at 0.8 after pick.
 */
export async function pickImageFromLibrary(): Promise<ImagePickerResult | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    base64: true,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const uri = asset.uri;
  const fileName = asset.fileName || uri.split('/').pop();
  const mimeType = (asset.mimeType || 'image/jpeg').toLowerCase();

  if (!['image/jpeg', 'image/jpg', 'image/png', 'image/gif'].includes(mimeType)) {
    return null;
  }

  const rawBase64 = asset.base64 || '';
  if (!rawBase64) {
    return null;
  }

  let type: 'image/png' | 'image/jpeg' | 'image/gif' = 'image/jpeg';
  if (mimeType.includes('png')) {
    type = 'image/png';
  } else if (mimeType.includes('gif')) {
    type = 'image/gif';
  }

  if (type === 'image/gif') {
    if (!isGifBase64(rawBase64)) {
      return null;
    }
    return {
      base64: rawBase64,
      uri: asset.uri,
      name: fileName,
      type,
    };
  }

  try {
    const compressed = await compressStillImage(asset.uri, type);
    if (compressed) {
      return {
        base64: compressed.base64,
        uri: compressed.uri,
        name: fileName,
        type,
      };
    }
  } catch {
    // Fall through to uncompressed original.
  }

  return {
    base64: rawBase64,
    uri: asset.uri,
    name: fileName,
    type,
  };
}
