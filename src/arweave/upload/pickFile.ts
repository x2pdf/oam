import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { base64ByteLength } from './format';
import { inferUploadFileType, resolveMimeType } from './fileTypes';
import type { UploadFileType } from './constants';

export type PickedUploadFile = {
  fileName: string;
  mimeType: string;
  base64: string;
  sizeBytes: number;
  fileType: UploadFileType;
  previewUri?: string;
};

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

function isGifBase64(base64: string): boolean {
  try {
    const binary = atob(base64.slice(0, 24));
    return binary.startsWith('GIF');
  } catch {
    return false;
  }
}

async function compressStillImage(
  uri: string,
  type: 'image/jpeg' | 'image/png',
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
  if (!compressed.base64) return null;
  return { uri: compressed.uri, base64: compressed.base64 };
}

async function finalizeGalleryImage(asset: {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  base64?: string | null;
}): Promise<PickedUploadFile | null> {
  const uri = asset.uri;
  const fileName = asset.fileName || uri.split('/').pop() || 'image';
  const mimeType = resolveMimeType(asset.mimeType, fileName);

  const isStillImage = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'].includes(mimeType);
  const isHeicImage = mimeType.includes('heic') || mimeType.includes('heif');
  if (!isStillImage && !isHeicImage) {
    return null;
  }

  let rawBase64 = asset.base64 ? toRawBase64(asset.base64) : '';
  if (!rawBase64) {
    try {
      rawBase64 = toRawBase64(await readBase64FromUri(uri));
    } catch {
      return null;
    }
  }
  if (!rawBase64) return null;

  let type: 'image/png' | 'image/jpeg' | 'image/gif' = 'image/jpeg';
  if (mimeType.includes('png')) type = 'image/png';
  else if (mimeType.includes('gif')) type = 'image/gif';

  if (isHeicImage) {
    try {
      const converted = await ImageManipulator.manipulateAsync(uri, [], {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });
      if (converted.base64) {
        return {
          fileName,
          mimeType: 'image/jpeg',
          base64: converted.base64,
          sizeBytes: base64ByteLength(converted.base64),
          fileType: 'jpeg',
          previewUri: converted.uri,
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  if (type === 'image/gif') {
    if (!isGifBase64(rawBase64)) return null;
    const fileType = inferUploadFileType('image/gif', fileName);
    return {
      fileName,
      mimeType: 'image/gif',
      base64: rawBase64,
      sizeBytes: base64ByteLength(rawBase64),
      fileType,
      previewUri: uri,
    };
  }

  try {
    const compressed = await compressStillImage(uri, type);
    if (compressed) {
      const fileType = inferUploadFileType(type, fileName);
      return {
        fileName,
        mimeType: type,
        base64: compressed.base64,
        sizeBytes: base64ByteLength(compressed.base64),
        fileType,
        previewUri: compressed.uri,
      };
    }
  } catch {
    // Fall through to original bytes.
  }

  const fileType = inferUploadFileType(type, fileName);
  return {
    fileName,
    mimeType: type,
    base64: rawBase64,
    sizeBytes: base64ByteLength(rawBase64),
    fileType,
    previewUri: uri,
  };
}

export async function pickUploadFileFromGallery(): Promise<PickedUploadFile | null> {
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

  const file = await finalizeGalleryImage(result.assets[0]);
  if (!file) {
    throw new Error('Unsupported or unreadable gallery image');
  }
  return file;
}

export async function pickUploadFileFromDocuments(): Promise<PickedUploadFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
    base64: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const fileName = asset.name || asset.uri.split('/').pop() || 'file';
  const mimeType = resolveMimeType(asset.mimeType, fileName);

  let base64 = asset.base64 ? toRawBase64(asset.base64) : '';
  if (!base64) {
    try {
      base64 = toRawBase64(await readBase64FromUri(asset.uri));
    } catch {
      throw new Error('Failed to read selected file');
    }
  }
  if (!base64) {
    throw new Error('Failed to read selected file');
  }

  const sizeBytes = asset.size ?? base64ByteLength(base64);
  const fileType = inferUploadFileType(mimeType, fileName);

  return {
    fileName,
    mimeType,
    base64,
    sizeBytes,
    fileType,
    previewUri: asset.uri,
  };
}
