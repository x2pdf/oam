import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { parseDataUrl } from './imageUri';

/**
 * Save a data-URI image to a temporary file and open the system share sheet
 * so the user can save it to the photo gallery or another destination.
 *
 * Supports PNG, JPEG, and GIF data URIs.
 *
 * @returns true on success, false if cancelled or failed.
 */
export async function saveImageToAlbum(dataUri: string): Promise<boolean> {
  const parsed = parseDataUrl(dataUri);
  if (!parsed) {
    throw new Error('Unsupported image format');
  }

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('Cache directory is not available');
  }

  const folder = `${cacheDir}oam-saved/`;
  const folderInfo = await FileSystem.getInfoAsync(folder);
  if (!folderInfo.exists) {
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  }

  const timestamp = Date.now();
  const filename = `oam_${timestamp}.${parsed.ext}`;
  const path = `${folder}${filename}`;

  await FileSystem.writeAsStringAsync(path, parsed.base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this platform');
  }

  await Sharing.shareAsync(path, {
    mimeType: parsed.mime,
    dialogTitle: 'Save Image',
    UTI: parsed.mime === 'image/gif' ? 'com.compuserve.gif' : undefined,
  });

  // Clean up the temp file after sharing
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // ignore cleanup errors
  }

  return true;
}
