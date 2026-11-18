/**
 * Removes location (GPS) metadata from media files before they are published.
 *
 * Everything is done on raw bytes and keeps the original container format:
 *  - JPEG / HEIC / AVIF / JXL / MP4 are patched in place (file size and every
 *    offset stay identical), so no re-encoding and no offset rewriting.
 *  - PNG is rebuilt chunk by chunk (it has no offsets).
 * After stripping, the result is verified again; any failure throws
 * LocationStripError so the caller can block the upload.
 */

export type MediaFormat = 'jpeg' | 'png' | 'heif' | 'jxl' | 'mp4' | 'other';

export class LocationStripError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocationStripError';
  }
}

type Range = [number, number];

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_INTEROP_IFD = 0xa005;
const TAG_SUB_IFDS = 0x014a;
const TAG_THUMB_OFFSET = 0x0201;
const TAG_THUMB_LENGTH = 0x0202;

// Free-text / identifying EXIF fields that are cleared together with GPS.
const PERSONAL_TAGS = new Set([
  0x010e, // ImageDescription
  0x013b, // Artist
  0x8298, // Copyright
  0x9286, // UserComment
  0xa430, // CameraOwnerName
  0xa431, // BodySerialNumber
  0xa435, // LensSerialNumber
]);

const TIFF_TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

const GPS_NEEDLES = ['GPSLatitude', 'GPSLongitude', 'exif:GPS'];

function fail(message: string): never {
  throw new LocationStripError(message);
}

function ascii(buf: Uint8Array, start: number, len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += String.fromCharCode(buf[start + i]);
  return out;
}

function writeAscii(buf: Uint8Array, start: number, text: string): void {
  for (let i = 0; i < text.length; i++) buf[start + i] = text.charCodeAt(i);
}

function startsWithAscii(buf: Uint8Array, pos: number, end: number, text: string): boolean {
  if (pos + text.length > end) return false;
  for (let i = 0; i < text.length; i++) {
    if (buf[pos + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function u16be(buf: Uint8Array, pos: number): number {
  return (buf[pos] << 8) | buf[pos + 1];
}

function u32be(buf: Uint8Array, pos: number): number {
  return ((buf[pos] << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3]) >>> 0;
}

function setU32be(buf: Uint8Array, pos: number, value: number): void {
  buf[pos] = (value >>> 24) & 0xff;
  buf[pos + 1] = (value >>> 16) & 0xff;
  buf[pos + 2] = (value >>> 8) & 0xff;
  buf[pos + 3] = value & 0xff;
}

function isAllZero(buf: Uint8Array, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (buf[i] !== 0) return false;
  }
  return true;
}

function wipe(buf: Uint8Array, touched: Range[], start: number, end: number): void {
  if (start < 0 || end > buf.length || start > end) fail('metadata range out of bounds');
  buf.fill(0, start, end);
  touched.push([start, end]);
}

function indexOfBytes(buf: Uint8Array, needle: string): number {
  const first = needle.charCodeAt(0);
  const last = buf.length - needle.length;
  outer: for (let i = buf.indexOf(first); i !== -1 && i <= last; i = buf.indexOf(first, i + 1)) {
    for (let j = 1; j < needle.length; j++) {
      if (buf[i + j] !== needle.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/* TIFF / EXIF                                                         */
/* ------------------------------------------------------------------ */

type TiffReader = {
  le: boolean;
  u16: (rel: number) => number;
  u32: (rel: number) => number;
  setU16: (rel: number, value: number) => void;
};

function openTiff(buf: Uint8Array, base: number, limit: number): TiffReader | null {
  if (base < 0 || base + 8 > limit || limit > buf.length) return null;
  const le = buf[base] === 0x49 && buf[base + 1] === 0x49;
  const be = buf[base] === 0x4d && buf[base + 1] === 0x4d;
  if (!le && !be) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const reader: TiffReader = {
    le,
    u16: (rel) => view.getUint16(base + rel, le),
    u32: (rel) => view.getUint32(base + rel, le),
    setU16: (rel, value) => view.setUint16(base + rel, value, le),
  };
  if (reader.u16(2) !== 42) return null;
  return reader;
}

function entryValueSize(type: number, count: number): number {
  const unit = TIFF_TYPE_SIZE[type] ?? 1;
  return unit * count;
}

type IfdEntry = { pos: number; tag: number; type: number; count: number };

/** Walks every IFD reachable from IFD0. Throws on malformed structure. */
function walkTiff(
  buf: Uint8Array,
  base: number,
  limit: number,
  onIfd: (ifdRel: number, entries: IfdEntry[], reader: TiffReader) => void,
): TiffReader {
  const reader = openTiff(buf, base, limit);
  if (!reader) fail('invalid TIFF header');
  const queue: number[] = [reader.u32(4)];
  const visited = new Set<number>();
  while (queue.length > 0) {
    const rel = queue.shift() as number;
    if (rel === 0 || visited.has(rel)) continue;
    visited.add(rel);
    if (visited.size > 32) fail('too many IFDs');
    if (base + rel + 2 > limit) fail('IFD out of bounds');
    const count = reader.u16(rel);
    const tableEnd = base + rel + 2 + count * 12 + 4;
    if (tableEnd > limit) fail('IFD table out of bounds');
    const entries: IfdEntry[] = [];
    for (let i = 0; i < count; i++) {
      const pos = base + rel + 2 + i * 12;
      entries.push({
        pos,
        tag: reader.u16(pos - base),
        type: reader.u16(pos - base + 2),
        count: reader.u32(pos - base + 4),
      });
    }
    for (const entry of entries) {
      if (entry.tag === TAG_EXIF_IFD || entry.tag === TAG_INTEROP_IFD) {
        queue.push(reader.u32(entry.pos - base + 8));
      } else if (entry.tag === TAG_SUB_IFDS) {
        const size = entryValueSize(entry.type, entry.count);
        if (size <= 4) {
          queue.push(reader.u32(entry.pos - base + 8));
        } else {
          const arr = reader.u32(entry.pos - base + 8);
          if (base + arr + size > limit) fail('SubIFD offsets out of bounds');
          for (let i = 0; i < entry.count && i < 8; i++) queue.push(reader.u32(arr + i * 4));
        }
      }
    }
    onIfd(rel, entries, reader);
    queue.push(reader.u32(rel + 2 + count * 12));
  }
  return reader;
}

function wipeEntryValue(
  buf: Uint8Array,
  touched: Range[],
  base: number,
  limit: number,
  reader: TiffReader,
  entry: IfdEntry,
): void {
  const size = entryValueSize(entry.type, entry.count);
  if (size <= 4) {
    wipe(buf, touched, entry.pos + 8, entry.pos + 12);
    return;
  }
  const start = base + reader.u32(entry.pos - base + 8);
  if (start + size > limit) fail('EXIF value out of bounds');
  wipe(buf, touched, start, start + size);
}

function wipeGpsIfd(
  buf: Uint8Array,
  touched: Range[],
  base: number,
  limit: number,
  reader: TiffReader,
  gpsRel: number,
): void {
  if (gpsRel === 0) return;
  if (base + gpsRel + 2 > limit) fail('GPS IFD out of bounds');
  const count = reader.u16(gpsRel);
  const tableEnd = base + gpsRel + 2 + count * 12 + 4;
  if (tableEnd > limit) fail('GPS IFD out of bounds');
  for (let i = 0; i < count; i++) {
    const pos = base + gpsRel + 2 + i * 12;
    const type = reader.u16(pos - base + 2);
    const n = reader.u32(pos - base + 4);
    const size = entryValueSize(type, n);
    if (size > 4) {
      const start = base + reader.u32(pos - base + 8);
      if (start + size > limit) fail('GPS value out of bounds');
      wipe(buf, touched, start, start + size);
    }
  }
  wipe(buf, touched, base + gpsRel, tableEnd);
}

/**
 * Removes the GPS IFD (and clears name/description style fields) from a TIFF
 * structure in place. Length and all other offsets stay the same.
 */
function stripTiff(buf: Uint8Array, touched: Range[], base: number, limit: number, depth: number): void {
  const thumbs: Array<{ offset: number; length: number }> = [];
  const probe = walkTiff(buf, base, limit, () => undefined);
  const gpsPointers: IfdEntry[] = [];
  const personal: IfdEntry[] = [];
  const ifds: Array<{ rel: number; entries: IfdEntry[] }> = [];
  walkTiff(buf, base, limit, (rel, entries, reader) => {
    ifds.push({ rel, entries });
    let thumbOffset = -1;
    let thumbLength = -1;
    for (const entry of entries) {
      if (entry.tag === TAG_GPS_IFD) gpsPointers.push(entry);
      else if (PERSONAL_TAGS.has(entry.tag)) personal.push(entry);
      else if (entry.tag === TAG_THUMB_OFFSET) thumbOffset = reader.u32(entry.pos - base + 8);
      else if (entry.tag === TAG_THUMB_LENGTH) thumbLength = reader.u32(entry.pos - base + 8);
    }
    if (thumbOffset >= 0 && thumbLength > 0) thumbs.push({ offset: thumbOffset, length: thumbLength });
  });

  for (const entry of personal) wipeEntryValue(buf, touched, base, limit, probe, entry);

  for (const entry of gpsPointers) {
    wipeGpsIfd(buf, touched, base, limit, probe, probe.u32(entry.pos - base + 8));
  }

  // Drop the GPS pointer entries by shifting the rest of each table up.
  for (const { rel, entries } of ifds) {
    if (!entries.some((e) => e.tag === TAG_GPS_IFD)) continue;
    let count = probe.u16(rel);
    const tableStart = base + rel + 2;
    let i = 0;
    while (i < count) {
      const pos = tableStart + i * 12;
      if (probe.u16(pos - base) !== TAG_GPS_IFD) {
        i++;
        continue;
      }
      const tail = tableStart + count * 12 + 4;
      buf.copyWithin(pos, pos + 12, tail);
      buf.fill(0, tail - 12, tail);
      touched.push([pos, tail]);
      count--;
      probe.setU16(rel, count);
      touched.push([base + rel, base + rel + 2]);
    }
  }

  if (depth === 0) {
    for (const thumb of thumbs) {
      const start = base + thumb.offset;
      const end = start + thumb.length;
      if (start < base || end > limit) continue;
      try {
        walkJpeg(buf, start, end, 1, (seg) => neutralizeJpegSegment(buf, touched, seg, 1));
      } catch {
        wipe(buf, touched, start, end);
      }
    }
  }
}

/** Strips one EXIF block; if the block cannot be understood it is wiped entirely. */
function stripExifBlock(buf: Uint8Array, touched: Range[], tiffBase: number, limit: number, depth: number): void {
  try {
    stripTiff(buf, touched, tiffBase, limit, depth);
  } catch {
    wipe(buf, touched, tiffBase, limit);
  }
}

function tiffHasGps(buf: Uint8Array, base: number, limit: number, depth: number): boolean {
  if (limit <= base) return false;
  if (isAllZero(buf, base, limit)) return false;
  try {
    let found = false;
    const thumbs: Array<[number, number]> = [];
    walkTiff(buf, base, limit, (_rel, entries, reader) => {
      let thumbOffset = -1;
      let thumbLength = -1;
      for (const entry of entries) {
        if (entry.tag === TAG_GPS_IFD) found = true;
        else if (entry.tag === TAG_THUMB_OFFSET) thumbOffset = reader.u32(entry.pos - base + 8);
        else if (entry.tag === TAG_THUMB_LENGTH) thumbLength = reader.u32(entry.pos - base + 8);
      }
      if (thumbOffset >= 0 && thumbLength > 0) thumbs.push([base + thumbOffset, base + thumbOffset + thumbLength]);
    });
    if (found) return true;
    if (depth === 0) {
      for (const [start, end] of thumbs) {
        if (start < base || end > limit) continue;
        try {
          if (jpegHasLocation(buf, start, end, 1)) return true;
        } catch {
          if (!isAllZero(buf, start, end)) return true;
        }
      }
    }
    return false;
  } catch {
    return true;
  }
}

/* ------------------------------------------------------------------ */
/* JPEG                                                                */
/* ------------------------------------------------------------------ */

type JpegSegment = { marker: number; markerPos: number; start: number; end: number };

const XMP_HEADERS = ['http://ns.adobe.com/xap/1.0/', 'http://ns.adobe.com/xmp/extension/'];

/** Calls visit for every marker segment, including JPEGs appended after EOI (MPF / gain maps). */
function walkJpeg(
  buf: Uint8Array,
  start: number,
  end: number,
  depth: number,
  visit: (seg: JpegSegment) => void,
): void {
  if (end - start < 4 || buf[start] !== 0xff || buf[start + 1] !== 0xd8) fail('not a JPEG');
  let p = start + 2;
  for (;;) {
    if (p + 2 > end) fail('truncated JPEG');
    if (buf[p] !== 0xff) fail('bad JPEG marker');
    while (p + 1 < end && buf[p + 1] === 0xff) p++;
    const marker = buf[p + 1];
    if (marker === 0xd9) {
      const next = p + 2;
      if (depth < 4 && next + 4 <= end && buf[next] === 0xff && buf[next + 1] === 0xd8) {
        walkJpeg(buf, next, end, depth + 1, visit);
      }
      return;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      p += 2;
      continue;
    }
    if (p + 4 > end) fail('truncated JPEG');
    const len = u16be(buf, p + 2);
    const segEnd = p + 2 + len;
    if (len < 2 || segEnd > end) fail('bad JPEG segment length');
    visit({ marker, markerPos: p + 1, start: p + 4, end: segEnd });
    if (marker === 0xda) {
      let q = segEnd;
      while (q + 1 < end) {
        if (buf[q] === 0xff) {
          const n = buf[q + 1];
          if (n === 0 || (n >= 0xd0 && n <= 0xd7)) {
            q += 2;
            continue;
          }
          if (n === 0xff) {
            q++;
            continue;
          }
          break;
        }
        q++;
      }
      if (q + 1 >= end) fail('truncated JPEG scan');
      p = q;
    } else {
      p = segEnd;
    }
  }
}

function neutralizeJpegSegment(buf: Uint8Array, touched: Range[], seg: JpegSegment, depth: number): void {
  if (seg.marker === 0xe1) {
    if (startsWithAscii(buf, seg.start, seg.end, 'Exif\0\0')) {
      stripExifBlock(buf, touched, seg.start + 6, seg.end, depth);
      return;
    }
    if (XMP_HEADERS.some((h) => startsWithAscii(buf, seg.start, seg.end, h))) {
      wipe(buf, touched, seg.start, seg.end);
      buf[seg.markerPos] = 0xfe;
      touched.push([seg.markerPos, seg.markerPos + 1]);
    }
    return;
  }
  // APP13 (Photoshop / IPTC, holds city & country names) and comments.
  if (seg.marker === 0xed || seg.marker === 0xfe) {
    wipe(buf, touched, seg.start, seg.end);
    buf[seg.markerPos] = 0xfe;
    touched.push([seg.markerPos, seg.markerPos + 1]);
  }
}

function stripJpeg(buf: Uint8Array, touched: Range[]): void {
  walkJpeg(buf, 0, buf.length, 0, (seg) => neutralizeJpegSegment(buf, touched, seg, 0));
}

function jpegHasLocation(buf: Uint8Array, start: number, end: number, depth: number): boolean {
  let found = false;
  walkJpeg(buf, start, end, depth, (seg) => {
    if (found) return;
    if (seg.marker === 0xe1) {
      if (startsWithAscii(buf, seg.start, seg.end, 'Exif\0\0')) {
        if (tiffHasGps(buf, seg.start + 6, seg.end, depth)) found = true;
      } else if (XMP_HEADERS.some((h) => startsWithAscii(buf, seg.start, seg.end, h))) {
        found = true;
      }
    } else if (seg.marker === 0xed) {
      found = true;
    } else if (seg.marker === 0xfe && !isAllZero(buf, seg.start, seg.end)) {
      found = true;
    }
  });
  return found;
}

/* ------------------------------------------------------------------ */
/* PNG                                                                 */
/* ------------------------------------------------------------------ */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

type PngChunk = { type: string; start: number; dataStart: number; dataEnd: number; end: number };

let crcTable: Uint32Array | null = null;

function crc32(buf: Uint8Array, start: number, end: number): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function parsePng(buf: Uint8Array): PngChunk[] {
  if (buf.length < 8 + 12 || PNG_SIGNATURE.some((b, i) => buf[i] !== b)) fail('not a PNG');
  const chunks: PngChunk[] = [];
  let p = 8;
  for (;;) {
    if (p + 12 > buf.length) fail('truncated PNG');
    const len = u32be(buf, p);
    const end = p + 12 + len;
    if (end > buf.length) fail('truncated PNG chunk');
    const type = ascii(buf, p + 4, 4);
    chunks.push({ type, start: p, dataStart: p + 8, dataEnd: p + 8 + len, end });
    p = end;
    if (type === 'IEND') break;
  }
  if (chunks[0].type !== 'IHDR') fail('PNG without IHDR');
  return chunks;
}

function pngTextKeyword(buf: Uint8Array, chunk: PngChunk): string {
  let i = chunk.dataStart;
  while (i < chunk.dataEnd && i - chunk.dataStart < 80 && buf[i] !== 0) i++;
  return ascii(buf, chunk.dataStart, i - chunk.dataStart);
}

function isPngMetadataText(buf: Uint8Array, chunk: PngChunk): boolean {
  if (chunk.type !== 'tEXt' && chunk.type !== 'zTXt' && chunk.type !== 'iTXt') return false;
  const keyword = pngTextKeyword(buf, chunk);
  return keyword === 'XML:com.adobe.xmp' || keyword.startsWith('Raw profile type');
}

function stripPng(buf: Uint8Array): Uint8Array {
  const chunks = parsePng(buf);
  const parts: Uint8Array[] = [buf.subarray(0, 8)];
  for (const chunk of chunks) {
    if (isPngMetadataText(buf, chunk)) continue;
    if (chunk.type === 'eXIf') {
      const data = buf.slice(chunk.dataStart, chunk.dataEnd);
      try {
        stripTiff(data, [], 0, data.length, 0);
      } catch {
        continue;
      }
      const rebuilt = new Uint8Array(12 + data.length);
      setU32be(rebuilt, 0, data.length);
      writeAscii(rebuilt, 4, 'eXIf');
      rebuilt.set(data, 8);
      setU32be(rebuilt, 8 + data.length, crc32(rebuilt, 4, 8 + data.length));
      parts.push(rebuilt);
      continue;
    }
    parts.push(buf.subarray(chunk.start, chunk.end));
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function pngHasLocation(buf: Uint8Array): boolean {
  for (const chunk of parsePng(buf)) {
    if (chunk.type === 'eXIf' && tiffHasGps(buf, chunk.dataStart, chunk.dataEnd, 0)) return true;
    if (isPngMetadataText(buf, chunk)) return true;
  }
  return false;
}

function pngImageSignature(buf: Uint8Array): string {
  const chunks = parsePng(buf);
  let sum = 0;
  let length = 0;
  for (const chunk of chunks) {
    if (chunk.type === 'IHDR' || chunk.type === 'IDAT' || chunk.type === 'PLTE') {
      sum = (sum * 31 + crc32(buf, chunk.dataStart, chunk.dataEnd)) >>> 0;
      length += chunk.dataEnd - chunk.dataStart;
    }
  }
  return `${sum}:${length}`;
}

/* ------------------------------------------------------------------ */
/* ISO base media (HEIC / AVIF / JXL / MP4)                            */
/* ------------------------------------------------------------------ */

type Box = { type: string; start: number; hdr: number; end: number };

function readBoxes(buf: Uint8Array, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let p = start;
  while (p < end) {
    // QuickTime udta lists end with a 32-bit zero terminator.
    if (p + 8 > end && isAllZero(buf, p, end)) break;
    if (p + 8 > end) fail('truncated box header');
    let size = u32be(buf, p);
    const type = ascii(buf, p + 4, 4);
    let hdr = 8;
    if (size === 1) {
      if (p + 16 > end) fail('truncated box header');
      if (u32be(buf, p + 8) !== 0) fail('box too large');
      size = u32be(buf, p + 12);
      hdr = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < hdr || p + size > end) fail('bad box size');
    boxes.push({ type, start: p, hdr, end: p + size });
    p += size;
  }
  return boxes;
}

function turnIntoFree(buf: Uint8Array, touched: Range[], box: Box): void {
  wipe(buf, touched, box.start + box.hdr, box.end);
  writeAscii(buf, box.start + 4, 'free');
  touched.push([box.start + 4, box.start + 8]);
}

function readString(buf: Uint8Array, pos: number, end: number): { text: string; next: number } {
  let i = pos;
  while (i < end && buf[i] !== 0) i++;
  if (i >= end) fail('unterminated string');
  return { text: ascii(buf, pos, i - pos), next: i + 1 };
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif', 'avis']);

type HeifItem = {
  id: number;
  type: string;
  contentType: string;
  typePos: number;
  infe: Box;
  method: number;
  baseOffset: number;
  extents: Array<{ offset: number; length: number }>;
};

function readUint(buf: Uint8Array, pos: number, size: number): number {
  if (size === 0) return 0;
  if (size === 4) return u32be(buf, pos);
  if (size === 8) {
    if (u32be(buf, pos) !== 0) fail('64-bit offset too large');
    return u32be(buf, pos + 4);
  }
  fail('unsupported iloc field size');
}

function readHeifItems(buf: Uint8Array, meta: Box): { items: HeifItem[]; idat: Box | null } {
  const children = readBoxes(buf, meta.start + meta.hdr + 4, meta.end);
  const iinf = children.find((b) => b.type === 'iinf');
  const iloc = children.find((b) => b.type === 'iloc');
  const idat = children.find((b) => b.type === 'idat') ?? null;
  if (!iinf || !iloc) return { items: [], idat };

  const byId = new Map<number, HeifItem>();
  const iinfVersion = buf[iinf.start + iinf.hdr];
  const infeStart = iinf.start + iinf.hdr + 4 + (iinfVersion === 0 ? 2 : 4);
  for (const infe of readBoxes(buf, infeStart, iinf.end)) {
    if (infe.type !== 'infe') continue;
    const version = buf[infe.start + infe.hdr];
    if (version < 2) continue;
    const p = infe.start + infe.hdr + 4;
    const id = version === 2 ? u16be(buf, p) : u32be(buf, p);
    const typePos = version === 2 ? p + 4 : p + 6;
    const type = ascii(buf, typePos, 4);
    let contentType = '';
    if (type === 'mime') {
      const name = readString(buf, typePos + 4, infe.end);
      contentType = readString(buf, name.next, infe.end).text;
    }
    byId.set(id, { id, type, contentType, typePos, infe, method: 0, baseOffset: 0, extents: [] });
  }

  const ilocVersion = buf[iloc.start + iloc.hdr];
  let p = iloc.start + iloc.hdr + 4;
  const offsetSize = buf[p] >> 4;
  const lengthSize = buf[p] & 0x0f;
  const baseOffsetSize = buf[p + 1] >> 4;
  const indexSize = ilocVersion >= 1 ? buf[p + 1] & 0x0f : 0;
  p += 2;
  let itemCount: number;
  if (ilocVersion < 2) {
    itemCount = u16be(buf, p);
    p += 2;
  } else {
    itemCount = u32be(buf, p);
    p += 4;
  }
  for (let i = 0; i < itemCount; i++) {
    if (p + 4 > iloc.end) fail('truncated iloc');
    let id: number;
    if (ilocVersion < 2) {
      id = u16be(buf, p);
      p += 2;
    } else {
      id = u32be(buf, p);
      p += 4;
    }
    let method = 0;
    if (ilocVersion >= 1) {
      method = u16be(buf, p) & 0x0f;
      p += 2;
    }
    const dataRef = u16be(buf, p);
    p += 2;
    const baseOffset = readUint(buf, p, baseOffsetSize);
    p += baseOffsetSize;
    const extentCount = u16be(buf, p);
    p += 2;
    const extents: HeifItem['extents'] = [];
    for (let e = 0; e < extentCount; e++) {
      p += indexSize;
      const offset = readUint(buf, p, offsetSize);
      p += offsetSize;
      const length = readUint(buf, p, lengthSize);
      p += lengthSize;
      extents.push({ offset, length });
    }
    if (p > iloc.end) fail('truncated iloc');
    const item = byId.get(id);
    if (item && dataRef === 0) {
      item.method = method;
      item.baseOffset = baseOffset;
      item.extents = extents;
    }
  }
  return { items: [...byId.values()], idat };
}

function heifItemRange(buf: Uint8Array, item: HeifItem, idat: Box | null): Range | null {
  if (item.extents.length === 0) return null;
  if (item.extents.length !== 1) fail('fragmented metadata item');
  const extent = item.extents[0];
  let start = item.baseOffset + extent.offset;
  if (item.method === 1) {
    if (!idat) fail('missing idat');
    start += idat.start + idat.hdr;
  } else if (item.method !== 0) {
    fail('unsupported item construction method');
  }
  const end = start + extent.length;
  if (end > buf.length) fail('item out of bounds');
  return [start, end];
}

function isXmpItem(item: HeifItem): boolean {
  return item.type === 'mime' && item.contentType.toLowerCase().includes('xml');
}

function stripHeif(buf: Uint8Array, touched: Range[]): void {
  const top = readBoxes(buf, 0, buf.length);
  const meta = top.find((b) => b.type === 'meta');
  if (!meta) return;
  const { items, idat } = readHeifItems(buf, meta);
  for (const item of items) {
    if (item.type === 'Exif') {
      const range = heifItemRange(buf, item, idat);
      if (!range) continue;
      const [start, end] = range;
      if (end - start < 4) continue;
      const tiffBase = start + 4 + u32be(buf, start);
      if (tiffBase > end) wipe(buf, touched, start, end);
      else stripExifBlock(buf, touched, tiffBase, end, 0);
    } else if (isXmpItem(item)) {
      const range = heifItemRange(buf, item, idat);
      if (range) wipe(buf, touched, range[0], range[1]);
      writeAscii(buf, item.typePos, 'free');
      touched.push([item.typePos, item.typePos + 4]);
    }
  }
}

function heifHasLocation(buf: Uint8Array): boolean {
  const top = readBoxes(buf, 0, buf.length);
  const meta = top.find((b) => b.type === 'meta');
  if (!meta) return false;
  const { items, idat } = readHeifItems(buf, meta);
  for (const item of items) {
    if (item.type === 'Exif') {
      const range = heifItemRange(buf, item, idat);
      if (!range || range[1] - range[0] < 4) continue;
      const tiffBase = range[0] + 4 + u32be(buf, range[0]);
      if (tiffBase > range[1]) {
        if (!isAllZero(buf, range[0], range[1])) return true;
      } else if (tiffHasGps(buf, tiffBase, range[1], 0)) {
        return true;
      }
    } else if (isXmpItem(item)) {
      return true;
    }
  }
  return false;
}

const JXL_SIGNATURE_BOX = [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a];

function isJxlContainer(buf: Uint8Array): boolean {
  return buf.length >= 12 && JXL_SIGNATURE_BOX.every((b, i) => buf[i] === b);
}

function stripJxl(buf: Uint8Array, touched: Range[]): void {
  for (const box of readBoxes(buf, 0, buf.length)) {
    if (box.type === 'Exif') {
      const start = box.start + box.hdr;
      if (box.end - start < 4) continue;
      const tiffBase = start + 4 + u32be(buf, start);
      if (tiffBase > box.end) wipe(buf, touched, start, box.end);
      else stripExifBlock(buf, touched, tiffBase, box.end, 0);
    } else if (box.type === 'xml ') {
      turnIntoFree(buf, touched, box);
    } else if (box.type === 'brob') {
      // Brotli-compressed metadata box; the original box type is the first 4 payload bytes.
      const inner = ascii(buf, box.start + box.hdr, 4);
      if (inner === 'Exif' || inner === 'xml ') turnIntoFree(buf, touched, box);
    }
  }
}

function jxlHasLocation(buf: Uint8Array): boolean {
  for (const box of readBoxes(buf, 0, buf.length)) {
    if (box.type === 'xml ') return true;
    if (box.type === 'brob') {
      const inner = ascii(buf, box.start + box.hdr, 4);
      if (inner === 'Exif' || inner === 'xml ') return true;
    }
    if (box.type === 'Exif') {
      const start = box.start + box.hdr;
      if (box.end - start < 4) continue;
      const tiffBase = start + 4 + u32be(buf, start);
      if (tiffBase > box.end) {
        if (!isAllZero(buf, start, box.end)) return true;
      } else if (tiffHasGps(buf, tiffBase, box.end, 0)) {
        return true;
      }
    }
  }
  return false;
}

const MP4_LOCATION_BOXES = new Set(['\u00a9xyz', 'xyz ', 'loci', 'gps ', 'GPS ']);
const MP4_CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'udta']);
const XMP_UUID = [0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac];
const QUICKTIME_LOCATION_KEY = 'com.apple.quicktime.location';

function scanMp4(buf: Uint8Array, start: number, end: number, depth: number, onLocation: (box: Box) => void): void {
  if (depth > 8) fail('MP4 nesting too deep');
  for (const box of readBoxes(buf, start, end)) {
    if (MP4_LOCATION_BOXES.has(box.type)) {
      onLocation(box);
    } else if (box.type === 'uuid' && box.end - box.start - box.hdr >= 16 && XMP_UUID.every((b, i) => buf[box.start + box.hdr + i] === b)) {
      onLocation(box);
    } else if (MP4_CONTAINERS.has(box.type)) {
      scanMp4(buf, box.start + box.hdr, box.end, depth + 1, onLocation);
    } else if (box.type === 'meta') {
      const isoFullBox = box.end - box.start - box.hdr >= 4 && u32be(buf, box.start + box.hdr) === 0;
      const childStart = box.start + box.hdr + (isoFullBox ? 4 : 0);
      const children = readBoxes(buf, childStart, box.end);
      const locationKeys = new Set<number>();
      const keys = children.find((b) => b.type === 'keys');
      if (keys) {
        const count = u32be(buf, keys.start + keys.hdr + 4);
        let p = keys.start + keys.hdr + 8;
        for (let i = 1; i <= count; i++) {
          if (p + 8 > keys.end) fail('truncated keys box');
          const size = u32be(buf, p);
          if (size < 8 || p + size > keys.end) fail('bad keys entry');
          if (ascii(buf, p + 8, size - 8).startsWith(QUICKTIME_LOCATION_KEY)) locationKeys.add(i);
          p += size;
        }
      }
      for (const child of children) {
        if (child.type === 'ilst') {
          for (const item of readBoxes(buf, child.start + child.hdr, child.end)) {
            if (MP4_LOCATION_BOXES.has(item.type) || locationKeys.has(u32be(buf, item.start + 4))) {
              onLocation(item);
            }
          }
        } else if (MP4_LOCATION_BOXES.has(child.type) || MP4_CONTAINERS.has(child.type)) {
          if (MP4_LOCATION_BOXES.has(child.type)) onLocation(child);
          else scanMp4(buf, child.start + child.hdr, child.end, depth + 1, onLocation);
        }
      }
    }
  }
}

function stripMp4(buf: Uint8Array, touched: Range[]): void {
  scanMp4(buf, 0, buf.length, 0, (box) => turnIntoFree(buf, touched, box));
}

function mp4HasLocation(buf: Uint8Array): boolean {
  let found = false;
  scanMp4(buf, 0, buf.length, 0, () => {
    found = true;
  });
  return found;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function detectMediaFormat(buf: Uint8Array): MediaFormat {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && PNG_SIGNATURE.every((b, i) => buf[i] === b)) return 'png';
  if (isJxlContainer(buf)) return 'jxl';
  if (buf.length >= 12 && ascii(buf, 4, 4) === 'ftyp') {
    const major = ascii(buf, 8, 4);
    if (HEIF_BRANDS.has(major)) return 'heif';
    // Brand may be generic (e.g. mif1 is covered above); look at compatible brands too.
    const size = Math.min(u32be(buf, 0), buf.length);
    for (let p = 16; p + 4 <= size; p += 4) {
      const brand = ascii(buf, p, 4);
      if (brand === 'avif' || brand === 'avis' || brand === 'heic' || brand === 'heix') return 'heif';
    }
    return 'mp4';
  }
  return 'other';
}

function formatHasLocation(buf: Uint8Array, format: MediaFormat): boolean {
  switch (format) {
    case 'jpeg':
      return jpegHasLocation(buf, 0, buf.length, 0);
    case 'png':
      return pngHasLocation(buf);
    case 'heif':
      return heifHasLocation(buf);
    case 'jxl':
      return jxlHasLocation(buf);
    case 'mp4':
      return mp4HasLocation(buf);
    default:
      return false;
  }
}

/** True if the file still carries GPS / XMP / IPTC location data. Used for verification and tests. */
export function hasLocationMetadata(buf: Uint8Array): boolean {
  const format = detectMediaFormat(buf);
  if (format === 'other') return false;
  if (formatHasLocation(buf, format)) return true;
  return GPS_NEEDLES.some((needle) => indexOfBytes(buf, needle) !== -1);
}

function verifyInPlace(original: Uint8Array, out: Uint8Array, touched: Range[]): void {
  if (original.length !== out.length) fail('file size changed unexpectedly');
  const allowed = new Uint8Array(out.length);
  for (const [start, end] of touched) allowed.fill(1, start, end);
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== original[i] && allowed[i] === 0) fail('unexpected change outside metadata');
  }
}

export type StripResult = { bytes: Uint8Array; format: MediaFormat; changed: boolean };

/**
 * Returns a copy of `input` without location metadata. Formats that carry no
 * such metadata (PDF, ZIP, GIF, …) are returned untouched.
 */
export function stripLocationMetadata(input: Uint8Array): StripResult {
  const format = detectMediaFormat(input);
  if (format === 'other') return { bytes: input, format, changed: false };

  let out: Uint8Array;
  try {
    const touched: Range[] = [];
    if (format === 'png') {
      out = stripPng(input);
      if (pngImageSignature(out) !== pngImageSignature(input)) fail('PNG image data changed');
    } else {
      out = input.slice();
      if (format === 'jpeg') stripJpeg(out, touched);
      else if (format === 'heif') stripHeif(out, touched);
      else if (format === 'jxl') stripJxl(out, touched);
      else stripMp4(out, touched);
      verifyInPlace(input, out, touched);
    }
    if (hasLocationMetadata(out)) fail('location metadata still present after stripping');
  } catch (error) {
    if (error instanceof LocationStripError) throw error;
    throw new LocationStripError(error instanceof Error ? error.message : 'unknown error');
  }

  let changed = out.length !== input.length;
  for (let i = 0; !changed && i < out.length; i++) {
    if (out[i] !== input[i]) changed = true;
  }
  return { bytes: out, format, changed };
}
