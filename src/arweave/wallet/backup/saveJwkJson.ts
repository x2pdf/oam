import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export type SaveJwkStatus = 'saved' | 'cancelled';

const TEMP_JWK_FOLDER = 'oam-ar-jwk/';
/** Android hands the file to the target app asynchronously; give it time to read it. */
const ANDROID_TEMP_JWK_TTL_MS = 60_000;

/** Remove temp JWK exports left in the cache directory by the share-sheet fallback. */
export async function clearTempJwkFiles(): Promise<void> {
  const cacheDir = FileSystem.cacheDirectory;
  if (Platform.OS === 'web' || !cacheDir) {
    return;
  }
  await FileSystem.deleteAsync(`${cacheDir}${TEMP_JWK_FOLDER}`, { idempotent: true });
}

async function writeTempJwk(jwkJson: string, filename: string): Promise<string> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('Cache directory is not available');
  }
  const folder = `${cacheDir}${TEMP_JWK_FOLDER}`;
  const info = await FileSystem.getInfoAsync(folder);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  }
  const path = `${folder}${filename}`;
  await FileSystem.writeAsStringAsync(path, jwkJson);
  return path;
}

async function shareJwkFile(uri: string, filename: string): Promise<SaveJwkStatus> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this platform');
  }
  try {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: filename,
      UTI: 'public.json',
    });
    return 'saved';
  } catch {
    return 'cancelled';
  }
}

async function saveAndroidSaf(jwkJson: string, filename: string): Promise<SaveJwkStatus> {
  const { StorageAccessFramework } = FileSystem;
  const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) {
    return 'cancelled';
  }
  const dest = await StorageAccessFramework.createFileAsync(
    permissions.directoryUri,
    filename,
    'application/json',
  );
  await FileSystem.writeAsStringAsync(dest, jwkJson);
  return 'saved';
}

export async function saveJwkJson(jwkJson: string, filename: string): Promise<SaveJwkStatus> {
  if (Platform.OS === 'android') {
    try {
      const status = await saveAndroidSaf(jwkJson, filename);
      if (status === 'saved') return status;
    } catch (e) {
      console.warn('Android SAF save failed, falling back to share sheet', e);
    }
  }

  const uri = await writeTempJwk(jwkJson, filename);
  try {
    return await shareJwkFile(uri, filename);
  } finally {
    // The plaintext copy must not stay in the cache after the share sheet is done.
    // Anything missed here is also swept at app start (see App.tsx) and by "clear cache".
    if (Platform.OS === 'android') {
      setTimeout(() => { clearTempJwkFiles().catch(() => {}); }, ANDROID_TEMP_JWK_TTL_MS);
    } else {
      clearTempJwkFiles().catch(() => {});
    }
  }
}
