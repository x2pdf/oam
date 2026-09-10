import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { GeneratePdfResult } from '../export/pdfTypes';

export type SavePdfStatus = 'saved' | 'cancelled' | 'printed';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

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

async function saveTauriBytes(bytes: Uint8Array, filename: string): Promise<SavePdfStatus> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeFile } = await import('@tauri-apps/plugin-fs');
  const path = await save({
    defaultPath: filename,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!path) return 'cancelled';
  await writeFile(path, bytes);
  return 'saved';
}

async function downloadWebBytes(bytes: Uint8Array, filename: string): Promise<SavePdfStatus> {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const picker = (window as unknown as {
    showSaveFilePicker?: (opts: {
      suggestedName: string;
      types: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;
  }).showSaveFilePicker;

  if (typeof picker === 'function') {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return 'saved';
}

async function fileUriToBytes(uri: string): Promise<Uint8Array> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function savePdf(
  source: GeneratePdfResult,
  filename: string,
): Promise<SavePdfStatus> {
  if (source.kind === 'printed') {
    return 'printed';
  }

  if (Platform.OS === 'web') {
    const bytes =
      source.kind === 'bytes' ? source.bytes : await fileUriToBytes(source.uri);
    if (isTauri()) {
      return saveTauriBytes(bytes, filename);
    }
    return downloadWebBytes(bytes, filename);
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
