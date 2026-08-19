/**
 * GIF89a / GIF87a both start with "GIF8", whose Base64 prefix is "R0lGOD".
 */
const GIF_BASE64_PREFIX = 'R0lGOD';
const DATA_GIF_RE = /^data:image\/gif;base64,[A-Za-z0-9+/]+={0,2}$/i;
const DATA_IMAGE_RE =
  /^data:(image\/(?:jpeg|jpg|png|gif));base64,([A-Za-z0-9+/]+={0,2})$/i;

export function isGifUri(uri: string, mimeType?: string): boolean {
  if (mimeType?.toLowerCase().includes('gif')) {
    return true;
  }
  if (!uri) {
    return false;
  }
  const lower = uri.toLowerCase();
  if (lower.startsWith('data:image/gif')) {
    return true;
  }
  const path = lower.split('?')[0];
  return path.endsWith('.gif');
}

export function isGifBase64(rawBase64: string): boolean {
  if (!rawBase64) {
    return false;
  }
  const cleaned = rawBase64.replace(/\s/g, '');
  const payload = cleaned.toLowerCase().startsWith('data:image/gif;base64,')
    ? cleaned.slice('data:image/gif;base64,'.length)
    : cleaned;
  return payload.startsWith(GIF_BASE64_PREFIX);
}

export function isSafeGifDataUrl(uri: string): boolean {
  return DATA_GIF_RE.test(uri);
}

export function isSafeLocalGifFileUri(uri: string): boolean {
  if (!uri.startsWith('file:')) {
    return false;
  }
  // Allow spaces and non-ASCII (Windows user dirs) but reject HTML breakers.
  if (/[<>"'\\]/.test(uri)) {
    return false;
  }
  const path = uri.toLowerCase().split('?')[0];
  return path.endsWith('.gif');
}

export function parseDataUrl(
  uri: string
): { mime: string; base64: string; ext: string } | null {
  const match = DATA_IMAGE_RE.exec(uri);
  if (!match) {
    return null;
  }
  const mime = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const ext = mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : 'jpg';
  return { mime, base64: match[2], ext };
}

export function hashBase64(base64: string): string {
  const sample =
    `${base64.length}:` +
    base64.slice(0, 64) +
    ':' +
    base64.slice(Math.max(0, base64.length - 64));
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    hash = (hash << 5) - hash + sample.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16);
}
