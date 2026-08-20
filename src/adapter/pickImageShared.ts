import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { ImagePickerResult } from './ImagePickerAdapter';
import { isGifBase64 } from './imageUri';

type PickedImageInput = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  rawBase64?: string | null;
};

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

function inferMimeFromName(name?: string | null): string | undefined {
  if (!name) {
    return undefined;
  }
  const lower = name.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.gif')) {
    return 'image/gif';
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  return undefined;
}

function toRawBase64(value: string): string {
  const cleaned = value.replace(/\s/g, '');
  const comma = cleaned.indexOf(',');
  if (cleaned.toLowerCase().startsWith('data:') && comma !== -1) {
    return cleaned.slice(comma + 1);
  }
  return cleaned;
}

async function readBase64FromUri(uri: string): Promise<string> {
  if (uri.startsWith('data:')) {
    return toRawBase64(uri);
  }
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * Shared post-processing for gallery and file picks.
 * GIF: keep original bytes (iOS would otherwise convert GIF → JPEG).
 * jpeg/png: recompress at 0.8 after pick.
 */
export async function finalizePickedImage(
  input: PickedImageInput
): Promise<ImagePickerResult | null> {
  const uri = input.uri;
  const fileName = input.fileName || uri.split('/').pop();
  const mimeType = (
    input.mimeType ||
    inferMimeFromName(fileName) ||
    'image/jpeg'
  ).toLowerCase();

  if (!['image/jpeg', 'image/jpg', 'image/png', 'image/gif'].includes(mimeType)) {
    return null;
  }

  let rawBase64 = input.rawBase64 ? toRawBase64(input.rawBase64) : '';
  if (!rawBase64) {
    try {
      rawBase64 = toRawBase64(await readBase64FromUri(uri));
    } catch {
      return null;
    }
  }
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
      uri,
      name: fileName,
      type,
    };
  }

  try {
    const compressed = await compressStillImage(uri, type);
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
    uri,
    name: fileName,
    type,
  };
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
  return finalizePickedImage({
    uri: asset.uri,
    mimeType: asset.mimeType,
    fileName: asset.fileName,
    rawBase64: asset.base64,
  });
}

export async function pickImageFromFiles(): Promise<ImagePickerResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/jpeg', 'image/png', 'image/gif'],
    copyToCacheDirectory: true,
    multiple: false,
    base64: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  return finalizePickedImage({
    uri: asset.uri,
    mimeType: asset.mimeType,
    fileName: asset.name,
    rawBase64: asset.base64,
  });
}
