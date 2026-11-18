import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { base64ByteLength } from './format';
import { inferUploadFileType, resolveMimeType } from './fileTypes';
import type { UploadFileType } from './constants';
import { generateGenericFileName } from './fileName';
import { stripLocationFromBase64 } from '../../privacy/sanitizeBase64';

export type PickedUploadFile = {
  /** Original name; only uploaded when the user opts in. */
  fileName: string;
  /** Generic random name that is uploaded by default. */
  genericFileName: string;
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

/** GPS / location metadata must never be published; failure blocks the file. */
function removeLocation(base64: string): { base64: string; sizeBytes: number } {
  const result = stripLocationFromBase64(base64);
  return { base64: result.base64, sizeBytes: result.sizeBytes };
}

function buildPickedUploadFile(
  fileName: string,
  mimeType: string,
  base64: string,
  previewUri: string,
): PickedUploadFile {
  const fileType = inferUploadFileType(mimeType, fileName);
  const cleaned = removeLocation(base64);
  return {
    fileName,
    genericFileName: generateGenericFileName(fileName),
    mimeType,
    base64: cleaned.base64,
    sizeBytes: cleaned.sizeBytes,
    fileType,
    previewUri,
  };
}

/**
 * Gallery images: original bytes, no re-encode or format conversion; only location metadata is removed.
 */
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

  if (mimeType.includes('gif')) {
    if (!isGifBase64(rawBase64)) return null;
  }

  return buildPickedUploadFile(fileName, mimeType, rawBase64, uri);
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

  const cleaned = removeLocation(base64);
  const fileType = inferUploadFileType(mimeType, fileName);

  return {
    fileName,
    genericFileName: generateGenericFileName(fileName),
    mimeType,
    base64: cleaned.base64,
    sizeBytes: cleaned.sizeBytes,
    fileType,
    previewUri: asset.uri,
  };
}
