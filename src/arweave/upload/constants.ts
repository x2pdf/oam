export const UPLOAD_FILE_TYPES = [
  'jpeg',
  'png',
  'gif',
  'heic',
  'avif',
  'jxl',
  'mp4',
  'pdf',
  'zip',
  'other',
] as const;

export type UploadFileType = (typeof UPLOAD_FILE_TYPES)[number];

export const UPLOAD_FILE_TYPE_TO_MIME: Record<UploadFileType, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  heic: 'image/heic',
  avif: 'image/avif',
  jxl: 'image/jxl',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  zip: 'application/zip',
  other: 'application/octet-stream',
};

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/heic',
  'image/avif',
  'image/jxl',
]);

export function isUploadImageMime(mime: string): boolean {
  const normalized = mime.toLowerCase();
  if (normalized === 'image/jpg') {
    return true;
  }
  return IMAGE_MIMES.has(normalized);
}
