export const ARWEAVE_GATEWAY = 'https://arweave.net/';

export const ATTACHMENT_FILE_TYPES = [
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

export type AttachmentFileType = (typeof ATTACHMENT_FILE_TYPES)[number];

export const ATTACHMENT_SOURCES = ['arweave-id', 'arweave-uri', 'uri'] as const;

export type AttachmentSource = (typeof ATTACHMENT_SOURCES)[number];

export const FILE_TYPE_TO_MIME: Record<AttachmentFileType, string> = {
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

const AR_TXID_RE = /^[A-Za-z0-9_-]{43}$/;

export function isImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime.toLowerCase());
}

export function isVideoMime(mime: string): boolean {
  return mime.toLowerCase() === 'video/mp4';
}

export function shouldDownload(mime: string): boolean {
  const m = mime.toLowerCase();
  return m === 'application/pdf' || m === 'application/zip' || m === 'application/octet-stream';
}

export function linkKind(mime: string): 'image' | 'video' | undefined {
  if (isImageMime(mime)) return 'image';
  if (isVideoMime(mime)) return 'video';
  return undefined;
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function normalizeArweaveId(raw: string): string | null {
  let id = raw.trim();
  if (id.toLowerCase().startsWith('ar://')) {
    id = id.slice(5);
  }
  if (!AR_TXID_RE.test(id)) return null;
  return id;
}

export function extractArweaveIdFromUri(uri: string): string | undefined {
  try {
    const parsed = new URL(uri.trim());
    const parts = parsed.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && AR_TXID_RE.test(last)) return last;
  } catch {
    // ignore invalid URL
  }
  return undefined;
}

export function arweaveHref(txid: string): string {
  return `${ARWEAVE_GATEWAY}${txid}`;
}

export type ResolveAttachmentError = 'empty' | 'invalid-id' | 'invalid-url';

export type ResolveAttachmentResult =
  | { ok: true; href: string; arId?: string }
  | { ok: false; error: ResolveAttachmentError };

export function resolveAttachmentHref(
  source: AttachmentSource,
  input: string,
): ResolveAttachmentResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'empty' };

  if (source === 'arweave-id') {
    const id = normalizeArweaveId(trimmed);
    if (!id) return { ok: false, error: 'invalid-id' };
    return { ok: true, href: arweaveHref(id), arId: id };
  }

  if (!isHttpUrl(trimmed)) return { ok: false, error: 'invalid-url' };

  const arId = source === 'arweave-uri' ? extractArweaveIdFromUri(trimmed) : undefined;
  return { ok: true, href: trimmed, arId };
}

export function defaultLabelI18nKey(fileType: AttachmentFileType): string {
  if (fileType === 'mp4') return 'send.attachmentDefaultVideo';
  if (fileType === 'pdf') return 'send.attachmentDefaultPdf';
  if (fileType === 'zip') return 'send.attachmentDefaultZip';
  if (fileType === 'other') return 'send.attachmentDefaultFile';
  return 'send.attachmentDefaultImage';
}
