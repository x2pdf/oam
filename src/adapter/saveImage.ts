import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { parseDataUrl } from './imageUri';
import { resolveRemoteImageUri } from './remoteImageLoader';
import { isHttpUrl } from '../utils/attachment';

/**
 * Save an image (data URI, local file, or http(s) URL) and open the system
 * share sheet so the user can save it to the photo gallery or elsewhere.
 *
 * @returns true on success, false if cancelled or failed.
 */
export async function saveImageToAlbum(uri: string): Promise<boolean> {
  const parsed = parseDataUrl(uri);
  if (parsed) {
    const folder = await ensureSaveFolder();
    const path = `${folder}oam_${Date.now()}.${parsed.ext}`;
    await FileSystem.writeAsStringAsync(path, parsed.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return shareAndCleanup(path, parsed.mime);
  }

  let localUri = uri;
  if (isHttpUrl(uri)) {
    localUri = await resolveRemoteImageUri(uri);
  }

  if (
    !localUri.startsWith('file:') &&
    !localUri.startsWith('blob:') &&
    !isHttpUrl(localUri)
  ) {
    throw new Error('Unsupported image format');
  }

  const mime = resolveImageMeta(undefined, localUri).mime;
  const isRemoteCache = localUri.includes('oam-remote-images/');
  const keepFile = isHttpUrl(uri) || localUri.startsWith('blob:') || isRemoteCache;
  if (keepFile) {
    return shareWithoutCleanup(localUri, mime);
  }

  return shareAndCleanup(localUri, mime);
}

async function ensureSaveFolder(): Promise<string> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('Cache directory is not available');
  }

  const folder = `${cacheDir}oam-saved/`;
  const folderInfo = await FileSystem.getInfoAsync(folder);
  if (!folderInfo.exists) {
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  }
  return folder;
}

async function shareWithoutCleanup(path: string, mime: string): Promise<boolean> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this platform');
  }

  await Sharing.shareAsync(path, {
    mimeType: mime,
    dialogTitle: 'Save Image',
    UTI: mime === 'image/gif' ? 'com.compuserve.gif' : undefined,
  });
  return true;
}

async function shareAndCleanup(path: string, mime: string): Promise<boolean> {
  try {
    return await shareWithoutCleanup(path, mime);
  } finally {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

function resolveImageMeta(
  mimeHint: string | undefined,
  url: string,
): { mime: string; ext: string } {
  const lower = (mimeHint || '').toLowerCase().split(';')[0].trim();
  if (lower.includes('png')) return { mime: 'image/png', ext: 'png' };
  if (lower.includes('gif')) return { mime: 'image/gif', ext: 'gif' };
  if (lower.includes('webp')) return { mime: 'image/webp', ext: 'webp' };
  if (lower.includes('jpeg') || lower.includes('jpg')) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  const path = url.toLowerCase().split('?')[0];
  if (path.endsWith('.png')) return { mime: 'image/png', ext: 'png' };
  if (path.endsWith('.gif')) return { mime: 'image/gif', ext: 'gif' };
  if (path.endsWith('.webp')) return { mime: 'image/webp', ext: 'webp' };
  return { mime: 'image/jpeg', ext: 'jpg' };
}
