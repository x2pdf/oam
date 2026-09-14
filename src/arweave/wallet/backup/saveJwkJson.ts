import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export type SaveJwkStatus = 'saved' | 'cancelled';

async function writeTempJwk(jwkJson: string, filename: string): Promise<string> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('Cache directory is not available');
  }
  const folder = `${cacheDir}oam-ar-jwk/`;
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
  return shareJwkFile(uri, filename);
}
