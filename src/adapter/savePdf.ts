import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { GeneratePdfResult, SavePdfStatus } from '../export/pdfTypes';

export type { SavePdfStatus };

async function sharePdfFile(uri: string, filename: string): Promise<SavePdfStatus> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this platform');
  }
  try {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: filename,
      UTI: 'com.adobe.pdf',
    });
    return 'saved';
  } catch {
    return 'cancelled';
  }
}

async function saveAndroidSaf(uri: string, filename: string): Promise<SavePdfStatus> {
  const { StorageAccessFramework } = FileSystem;
  const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) {
    return 'cancelled';
  }
  const dest = await StorageAccessFramework.createFileAsync(
    permissions.directoryUri,
    filename,
    'application/pdf',
  );
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await FileSystem.writeAsStringAsync(dest, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return 'saved';
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunk = 0x2000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  if (typeof btoa !== 'function') {
    throw new Error('Base64 encoding is not available');
  }
  return btoa(binary);
}

async function writeTempPdf(bytes: Uint8Array, filename: string): Promise<string> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('Cache directory is not available');
  }
  const folder = `${cacheDir}oam-export/`;
  const info = await FileSystem.getInfoAsync(folder);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  }
  const path = `${folder}${filename}`;
  await FileSystem.writeAsStringAsync(path, uint8ToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

export async function savePdf(
  source: GeneratePdfResult,
  filename: string,
): Promise<SavePdfStatus> {
  if (source.kind === 'printed') {
    return 'printed';
  }

  const uri = source.kind === 'file' ? source.uri : await writeTempPdf(source.bytes, filename);

  if (Platform.OS === 'android') {
    try {
      const status = await saveAndroidSaf(uri, filename);
      if (status === 'saved') return status;
    } catch (e) {
      console.warn('Android SAF save failed, falling back to share sheet', e);
    }
  }

  return sharePdfFile(uri, filename);
}
