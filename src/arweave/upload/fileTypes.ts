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
