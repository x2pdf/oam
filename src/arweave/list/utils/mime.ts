export const ARWEAVE_GATEWAY = 'https://arweave.net/';

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/avif',
  'image/jxl',
]);

export function arweaveHref(txId: string): string {
  return `${ARWEAVE_GATEWAY}${txId}`;
}

export function isImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime.toLowerCase());
}

export function shouldDownload(mime: string): boolean {
  const m = mime.toLowerCase();
  return m === 'application/pdf' || m === 'application/zip' || m === 'application/octet-stream';
}

export function mimeToBadgeLabel(mime: string): string {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m === 'application/pdf') return 'pdf';
  if (m === 'application/zip') return 'zip';
  return 'file';
}

export function mimeToIcon(mime: string): string {
  const m = mime.toLowerCase();
  if (m.startsWith('video/')) return 'play-circle-outline';
  if (m === 'application/pdf') return 'file-pdf-box';
  if (m === 'application/zip') return 'folder-zip-outline';
  return 'file-outline';
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}
