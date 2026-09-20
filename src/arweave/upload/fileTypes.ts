import { UploadFileType, UPLOAD_FILE_TYPE_TO_MIME } from './constants';

function inferMimeFromName(name?: string | null): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.jxl')) return 'image/jxl';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.zip')) return 'application/zip';
  return undefined;
}

export function inferUploadFileType(
  mimeType: string,
  fileName?: string,
): UploadFileType {
  const mime = mimeType.toLowerCase();
  const entries = Object.entries(UPLOAD_FILE_TYPE_TO_MIME) as [UploadFileType, string][];
  for (const [type, value] of entries) {
    if (value === mime) return type;
  }
  if (fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpeg';
    if (lower.endsWith('.png')) return 'png';
    if (lower.endsWith('.gif')) return 'gif';
    if (lower.endsWith('.heic')) return 'heic';
    if (lower.endsWith('.avif')) return 'avif';
    if (lower.endsWith('.jxl')) return 'jxl';
    if (lower.endsWith('.mp4')) return 'mp4';
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.zip')) return 'zip';
  }
  return 'other';
}

export function resolveMimeType(
  mimeType?: string | null,
  fileName?: string | null,
): string {
  const resolved = (mimeType || inferMimeFromName(fileName) || 'application/octet-stream').toLowerCase();
  if (resolved === 'image/jpg') {
    return 'image/jpeg';
  }
  return resolved;
}

/** Decode only enough base64 to cover file-header magic bytes. */
function decodeBase64Prefix(base64: string, maxBytes: number): Uint8Array {
  const charsNeeded = Math.ceil(maxBytes / 3) * 4 + 4;
  try {
    const binary = atob(base64.slice(0, charsNeeded));
    const length = Math.min(binary.length, maxBytes);
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return new Uint8Array(0);
  }
}

/**
 * Detect image type from magic bytes (JPEG / PNG / GIF).
 * Returns null when the header is unrecognized.
 */
export function sniffUploadFileType(bytes: Uint8Array): UploadFileType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'gif';
  }
  return null;
}

/**
 * Resolve the file's actual type: prefer magic-byte sniff, else picker inference.
 */
export function resolveActualUploadFileType(file: {
  base64: string;
  fileType: UploadFileType;
}): UploadFileType {
  const sniffed = sniffUploadFileType(decodeBase64Prefix(file.base64, 16));
  return sniffed ?? file.fileType;
}
