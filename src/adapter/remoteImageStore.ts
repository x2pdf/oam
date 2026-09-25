import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { isHttpUrl, isImageMime } from '../utils/attachment';

export const REMOTE_IMAGE_FOLDER = 'oam-remote-images/';
const STEM_MAX_LEN = 200;
const FORBIDDEN_CHARS = /[\\/:*?"<>|\u0000-\u001F\u007F]/g;

let cachedRoot: string | null = null;
let cachedNames: string[] | null = null;

export function nameFilter(placeholder: string): string {
  return placeholder.replace(FORBIDDEN_CHARS, '');
}

function shortFingerprint(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8);
}

/** Filename stem for a placeholder. Lookup still uses the original placeholder. */
export function stemFor(placeholder: string): string {
  const fingerprint = nameFilter(shortFingerprint(placeholder));
  const filtered = nameFilter(placeholder);
  if (!filtered) {
    return nameFilter(fingerprint);
  }
  if (filtered.length <= STEM_MAX_LEN) {
    return nameFilter(filtered);
  }
  const keep = Math.max(0, STEM_MAX_LEN - fingerprint.length);
  const truncated = nameFilter(filtered.slice(0, keep));
  return nameFilter(`${truncated}${fingerprint}`);
}

export function toFileUri(path: string): string {
  if (path.startsWith('file:')) {
    return path;
  }
  return `file://${path.replace(/\\/g, '/')}`;
}

function invalidateNameCache(): void {
  cachedNames = null;
}

function rememberFileName(name: string): void {
  if (!cachedNames) {
    return;
  }
  if (!cachedNames.includes(name)) {
    cachedNames = [...cachedNames, name];
  }
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

export async function getRemoteImageRoot(): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('Remote image store is not used on web');
  }
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error('Document directory is not available');
  }

  const folder = `${root}${REMOTE_IMAGE_FOLDER}`;
  if (cachedRoot !== folder) {
    cachedRoot = folder;
    cachedNames = null;
  }

  const folderInfo = await FileSystem.getInfoAsync(folder);
  if (!folderInfo.exists) {
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
    cachedNames = [];
  }
  return folder;
}

async function listRemoteImageNames(): Promise<string[]> {
  if (cachedNames) {
    return cachedNames;
  }
  const folder = await getRemoteImageRoot();
  const folderInfo = await FileSystem.getInfoAsync(folder);
  if (!folderInfo.exists) {
    cachedNames = [];
    return cachedNames;
  }
  cachedNames = await FileSystem.readDirectoryAsync(folder);
  return cachedNames;
}

function matchNameForStem(names: string[], stem: string): string | undefined {
  const prefix = `${stem}.`;
  return names.find((name) => name.startsWith(prefix));
}

/** Sync peek from the in-memory directory listing. Cold cache returns null. */
export function peekLocalFileByPlaceholder(placeholder: string): string | null {
  if (!placeholder || !cachedRoot || !cachedNames) {
    return null;
  }
  const found = matchNameForStem(cachedNames, stemFor(placeholder));
  if (!found) {
    return null;
  }
  return toFileUri(`${cachedRoot}${found}`);
}

export async function localFileExists(path: string): Promise<boolean> {
  if (!path) {
    return false;
  }
  try {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists === true && info.isDirectory !== true;
  } catch {
    return false;
  }
}

export async function findLocalFileByPlaceholder(placeholder: string): Promise<string | null> {
  if (!placeholder || Platform.OS === 'web') {
    return null;
  }
  try {
    const folder = await getRemoteImageRoot();
    const names = await listRemoteImageNames();
    const found = matchNameForStem(names, stemFor(placeholder));
    if (!found) {
      return null;
    }
    const path = `${folder}${found}`;
    if (!(await localFileExists(path))) {
      invalidateNameCache();
      return null;
    }
    return toFileUri(path);
  } catch {
    return null;
  }
}

export async function writeLocalFile(
  placeholder: string,
  bytes: Uint8Array,
  ext: string,
): Promise<string> {
  const folder = await getRemoteImageRoot();
  const stem = stemFor(placeholder);
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const fileName = `${stem}.${safeExt}`;
  const names = await listRemoteImageNames();
  for (const name of names) {
    if (name.startsWith(`${stem}.`) && name !== fileName) {
      await FileSystem.deleteAsync(`${folder}${name}`, { idempotent: true });
    }
  }
  const path = `${folder}${fileName}`;
  await FileSystem.writeAsStringAsync(path, uint8ToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (cachedNames) {
    cachedNames = cachedNames.filter((name) => !name.startsWith(`${stem}.`) || name === fileName);
  }
  rememberFileName(fileName);
  return toFileUri(path);
}

export async function deleteLocalFilesByPlaceholder(placeholder: string): Promise<void> {
  if (!placeholder || Platform.OS === 'web') {
    return;
  }
  try {
    const folder = await getRemoteImageRoot();
    const names = await listRemoteImageNames();
    const stem = stemFor(placeholder);
    for (const name of names) {
      if (name.startsWith(`${stem}.`)) {
        await FileSystem.deleteAsync(`${folder}${name}`, { idempotent: true });
      }
    }
    if (cachedNames) {
      cachedNames = cachedNames.filter((name) => !name.startsWith(`${stem}.`));
    }
  } catch {
    invalidateNameCache();
  }
}

export async function countRemoteImageStore(): Promise<number> {
  if (Platform.OS === 'web') {
    return 0;
  }
  try {
    const names = await listRemoteImageNames();
    return names.length;
  } catch {
    return 0;
  }
}

export async function clearRemoteImageStore(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  try {
    const folder = await getRemoteImageRoot();
    const info = await FileSystem.getInfoAsync(folder);
    if (info.exists) {
      await FileSystem.deleteAsync(folder, { idempotent: true });
    }
  } finally {
    cachedRoot = null;
    cachedNames = null;
  }
}

type PlaceholderSource = {
  type?: string;
  data?: string;
  href?: string;
  mime?: string;
};

export function collectImagePlaceholders(
  items: readonly PlaceholderSource[] | undefined | null,
): string[] {
  if (!items || items.length === 0) {
    return [];
  }
  const out: string[] = [];
  for (const item of items) {
    if (item.type === 'image' && item.data && isHttpUrl(item.data)) {
      out.push(item.data);
      continue;
    }
    if (
      item.type === 'link' &&
      item.href &&
      isHttpUrl(item.href) &&
      item.mime &&
      isImageMime(item.mime)
    ) {
      out.push(item.href);
    }
  }
  return out;
}
