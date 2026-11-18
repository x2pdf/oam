const assert = require('node:assert/strict');
const test = require('node:test');
const loadTypeScript = require('./helpers/load-typescript.cjs');

const strip = loadTypeScript('src/privacy/stripLocation.ts');
const sanitize = loadTypeScript('src/privacy/sanitizeBase64.ts', {
  imports: { './stripLocation': strip },
  globals: { atob, btoa, Uint8Array },
});
const fileName = loadTypeScript('src/arweave/upload/fileName.ts');

const JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDkKKKK8U/TD//Z';
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGM8ISfHgA0wYRUdtBIA0MoBFD5jqJkAAAAASUVORK5CYII=';

const b64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const cat = (...parts) => new Uint8Array(Buffer.concat(parts.map((p) => Buffer.from(p))));
const be32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const be16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const text = (s) => Buffer.from(s, 'latin1');
const has = (bytes, s) => Buffer.from(bytes).includes(Buffer.from(s, 'latin1'));

// ---- TIFF with GPS, owner name, artist and orientation ----
function buildTiff() {
  const le = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const le32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  const entry = (tag, type, count, value) => Buffer.concat([le(tag), le(type), le32(count), value]);
  const ifdSize = (n) => 2 + n * 12 + 4;
  const ifd0Off = 8;
  const exifOff = ifd0Off + ifdSize(5);
  const gpsOff = exifOff + ifdSize(1);
  let dataOff = gpsOff + ifdSize(4);
  const data = [];
  const outOfLine = (buf) => { const off = dataOff; data.push(buf); dataOff += buf.length; return le32(off); };
  const make = outOfLine(text('Apple Inc.\0'));
  const artist = outOfLine(text('Zhang San\0'));
  const owner = outOfLine(text('Zhang San\0'));
  const lat = outOfLine(Buffer.alloc(24, 7));
  const lon = outOfLine(Buffer.alloc(24, 9));
  const pad2 = (n) => Buffer.concat([le(n), Buffer.alloc(2)]);
  const ifd0 = Buffer.concat([
    le(5),
    entry(0x010f, 2, 11, make),
    entry(0x0112, 3, 1, pad2(6)),
    entry(0x013b, 2, 10, artist),
    entry(0x8769, 4, 1, le32(exifOff)),
    entry(0x8825, 4, 1, le32(gpsOff)),
    le32(0),
  ]);
  const exif = Buffer.concat([le(1), entry(0xa430, 2, 10, owner), le32(0)]);
  const gps = Buffer.concat([
    le(4),
    entry(1, 2, 2, text('N\0\0\0')),
    entry(2, 5, 3, lat),
    entry(3, 2, 2, text('E\0\0\0')),
    entry(4, 5, 3, lon),
    le32(0),
  ]);
  const header = Buffer.concat([text('II'), le(42), le32(ifd0Off)]);
  return new Uint8Array(Buffer.concat([header, ifd0, exif, gps, ...data]));
}

function readIfd0(tiff) {
  const b = Buffer.from(tiff);
  const out = {};
  const n = b.readUInt16LE(b.readUInt32LE(4));
  const start = b.readUInt32LE(4) + 2;
  for (let i = 0; i < n; i++) out[b.readUInt16LE(start + i * 12)] = b.readUInt16LE(start + i * 12 + 8);
  return out;
}

function jpegWithMetadata() {
  const base = b64(JPEG_B64);
  const exifPayload = cat(text('Exif\0\0'), buildTiff());
  const xmpPayload = cat(text('http://ns.adobe.com/xap/1.0/\0'), text('<x:xmpmeta exif:GPSLatitude="39,54N"/>'));
  const seg = (marker, payload) => cat([0xff, marker], be16(payload.length + 2), payload);
  const iptc = cat(text('Photoshop 3.0\0'), text('Beijing'));
  return cat(base.subarray(0, 2), seg(0xe1, exifPayload), seg(0xe1, xmpPayload), seg(0xed, iptc), seg(0xfe, text('home')), base.subarray(2));
}

test('JPEG: GPS, XMP, IPTC and comments are removed in place; image data and orientation stay', () => {
  const input = jpegWithMetadata();
  assert.equal(strip.hasLocationMetadata(input), true);
  const result = strip.stripLocationMetadata(input);
  assert.equal(result.format, 'jpeg');
  assert.equal(result.changed, true);
  assert.equal(result.bytes.length, input.length);
  assert.equal(strip.hasLocationMetadata(result.bytes), false);
  for (const needle of ['GPSLatitude', 'Beijing', 'home', 'Zhang']) assert.equal(has(result.bytes, needle), false, needle);
  const tiffStart = Buffer.from(result.bytes).indexOf(text('Exif\0\0')) + 6;
  const ifd0 = readIfd0(result.bytes.subarray(tiffStart));
  assert.equal(ifd0[0x0112], 6);
  assert.equal(ifd0[0x8825], undefined);
  assert.equal(has(result.bytes, 'Apple Inc.'), true);
  const imageTail = Buffer.from(JPEG_B64, 'base64').subarray(2);
  assert.ok(Buffer.from(result.bytes).subarray(-imageTail.length).equals(imageTail));
});

test('JPEG: the input array is never modified', () => {
  const input = jpegWithMetadata();
  const copy = input.slice();
  strip.stripLocationMetadata(input);
  assert.deepEqual(input, copy);
});

test('JPEG: truncated file is refused instead of uploaded', () => {
  const input = jpegWithMetadata();
  assert.throws(() => strip.stripLocationMetadata(input.subarray(0, input.length - 40)), { name: 'LocationStripError' });
});

test('JPEG: corrupt EXIF block is wiped completely', () => {
  const base = b64(JPEG_B64);
  const payload = cat(text('Exif\0\0'), text('II'), [42, 0, 0xff, 0xff, 0, 0], text('GPS garbage'));
  const input = cat(base.subarray(0, 2), [0xff, 0xe1], be16(payload.length + 2), payload, base.subarray(2));
  const result = strip.stripLocationMetadata(input);
  assert.equal(has(result.bytes, 'GPS garbage'), false);
  assert.equal(strip.hasLocationMetadata(result.bytes), false);
});

test('JPEG without metadata is unchanged', () => {
  const result = strip.stripLocationMetadata(b64(JPEG_B64));
  assert.equal(result.changed, false);
});

// ---- PNG ----
function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const pngChunk = (type, data) => cat(be32(data.length), text(type), data, be32(crc32(cat(text(type), data))));

test('PNG: eXIf loses GPS, XMP text chunk is dropped, pixels are identical', () => {
  const base = Buffer.from(PNG_B64, 'base64');
  const ihdrEnd = 8 + 12 + 13;
  const input = cat(
    base.subarray(0, ihdrEnd),
    pngChunk('eXIf', buildTiff()),
    pngChunk('iTXt', cat(text('XML:com.adobe.xmp\0\0\0\0\0'), text('exif:GPSLatitude'))),
    pngChunk('tEXt', text('Comment\0hello')),
    base.subarray(ihdrEnd),
  );
  assert.equal(strip.hasLocationMetadata(input), true);
  const result = strip.stripLocationMetadata(input);
  assert.equal(result.format, 'png');
  assert.equal(strip.hasLocationMetadata(result.bytes), false);
  assert.equal(has(result.bytes, 'GPSLatitude'), false);
  assert.equal(has(result.bytes, 'Zhang'), false);
  assert.equal(has(result.bytes, 'hello'), true);
  assert.equal(has(result.bytes, 'eXIf'), true);
  assert.equal(has(result.bytes, 'IDAT'), true);
});

// ---- HEIC / AVIF ----
const box = (type, payload) => cat(be32(8 + payload.length), text(type), payload);
const fullBox = (type, version, payload) => box(type, cat([version, 0, 0, 0], payload));
const infe = (id, type, extra = '') => fullBox('infe', 2, cat(be16(id), be16(0), text(type), text(extra)));

function buildHeif(brand) {
  const image = Buffer.alloc(32, 0xab);
  const exifItem = cat(be32(6), text('Exif\0\0'), buildTiff());
  const xmpItem = text('<x:xmpmeta exif:GPSLatitude="1"/>');
  const build = (offsets) => {
    const iloc = fullBox('iloc', 0, cat(
      [0x44, 0x00], be16(3),
      be16(1), be16(0), be16(1), be32(offsets[0]), be32(image.length),
      be16(2), be16(0), be16(1), be32(offsets[1]), be32(exifItem.length),
      be16(3), be16(0), be16(1), be32(offsets[2]), be32(xmpItem.length),
    ));
    const iinf = fullBox('iinf', 0, cat(be16(3), infe(1, 'hvc1', '\0'), infe(2, 'Exif', '\0'), infe(3, 'mime', '\0application/rdf+xml\0')));
    const meta = fullBox('meta', 0, cat(iinf, iloc));
    const ftyp = box('ftyp', cat(text(brand), be32(0), text(brand)));
    return { ftyp, meta };
  };
  const probe = build([0, 0, 0]);
  const mdatStart = probe.ftyp.length + probe.meta.length + 8;
  const offsets = [mdatStart, mdatStart + image.length, mdatStart + image.length + exifItem.length];
  const real = build(offsets);
  return { file: cat(real.ftyp, real.meta, box('mdat', cat(image, exifItem, xmpItem))), image };
}

for (const brand of ['heic', 'avif']) {
  test(`${brand.toUpperCase()}: Exif GPS and XMP items are cleaned without touching the image`, () => {
    const { file, image } = buildHeif(brand);
    assert.equal(strip.detectMediaFormat(file), 'heif');
    assert.equal(strip.hasLocationMetadata(file), true);
    const result = strip.stripLocationMetadata(file);
    assert.equal(result.bytes.length, file.length);
    assert.equal(strip.hasLocationMetadata(result.bytes), false);
    assert.equal(has(result.bytes, 'GPSLatitude'), false);
    assert.equal(has(result.bytes, 'Zhang'), false);
    assert.equal(has(result.bytes, 'hvc1'), true);
    assert.equal(Buffer.from(result.bytes).includes(Buffer.from(image)), true);
    const tiffStart = Buffer.from(result.bytes).indexOf(Buffer.from([0x49, 0x49, 42, 0]));
    assert.equal(readIfd0(result.bytes.subarray(tiffStart))[0x0112], 6);
  });
}

// ---- JXL ----
test('JXL container: Exif GPS cleared, xml box and compressed metadata boxes disabled', () => {
  const sig = new Uint8Array([0, 0, 0, 12, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]);
  const file = cat(
    sig,
    box('ftyp', cat(text('jxl '), be32(0), text('jxl '))),
    box('Exif', cat(be32(0), buildTiff())),
    box('xml ', text('<x exif:GPSLatitude="1"/>')),
    box('brob', cat(text('xml '), Buffer.alloc(20, 5))),
    box('jxlc', Buffer.alloc(40, 3)),
  );
  assert.equal(strip.detectMediaFormat(file), 'jxl');
  assert.equal(strip.hasLocationMetadata(file), true);
  const result = strip.stripLocationMetadata(file);
  assert.equal(result.bytes.length, file.length);
  assert.equal(strip.hasLocationMetadata(result.bytes), false);
  assert.equal(has(result.bytes, 'jxlc'), true);
});

test('JXL bare codestream has nothing to strip', () => {
  const file = new Uint8Array([0xff, 0x0a, 1, 2, 3, 4]);
  assert.equal(strip.detectMediaFormat(file), 'other');
  assert.equal(strip.stripLocationMetadata(file).changed, false);
});

// ---- MP4 / MOV ----
test('MP4: udta location atom is removed', () => {
  const xyz = box('\u00a9xyz', text('+39.9042+116.4074/'));
  const file = cat(
    box('ftyp', cat(text('isom'), be32(0), text('isom'))),
    box('moov', cat(box('mvhd', Buffer.alloc(20)), box('udta', cat(xyz, box('\u00a9too', text('camera')))))),
    box('mdat', Buffer.alloc(64, 1)),
  );
  assert.equal(strip.hasLocationMetadata(file), true);
  const result = strip.stripLocationMetadata(file);
  assert.equal(result.bytes.length, file.length);
  assert.equal(strip.hasLocationMetadata(result.bytes), false);
  assert.equal(has(result.bytes, '+39.9042'), false);
  assert.equal(has(result.bytes, 'camera'), true);
});

test('MOV: QuickTime keys/ilst location entry is removed, others stay', () => {
  const key = (name) => box('mdta', text(name));
  const keys = fullBox('keys', 0, cat(be32(2), key('com.apple.quicktime.make'), key('com.apple.quicktime.location.ISO6709')));
  const item = (index, value) => box(String.fromCharCode(...be32(index)), box('data', cat(be32(1), be32(0), text(value))));
  const ilst = box('ilst', cat(item(1, 'Apple'), item(2, '+39.9042+116.4074/')));
  const meta = box('meta', cat(box('hdlr', Buffer.alloc(24)), keys, ilst));
  const file = cat(box('ftyp', cat(text('qt  '), be32(0), text('qt  '))), box('moov', meta), box('mdat', Buffer.alloc(16)));
  assert.equal(strip.hasLocationMetadata(file), true);
  const result = strip.stripLocationMetadata(file);
  assert.equal(strip.hasLocationMetadata(result.bytes), false);
  assert.equal(has(result.bytes, '+39.9042'), false);
  assert.equal(has(result.bytes, 'Apple'), true);
});

test('MP4 with XMP uuid box carrying GPS is cleaned', () => {
  const uuid = new Uint8Array([0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac]);
  const file = cat(
    box('ftyp', cat(text('mp42'), be32(0), text('mp42'))),
    box('uuid', cat(uuid, text('<x exif:GPSLatitude="1"/>'))),
    box('mdat', Buffer.alloc(8)),
  );
  const result = strip.stripLocationMetadata(file);
  assert.equal(has(result.bytes, 'GPSLatitude'), false);
});

// ---- other types and wrappers ----
test('types without location data pass through untouched', () => {
  const pdf = new Uint8Array(Buffer.from('%PDF-1.4\n/Author (x)\n'));
  assert.equal(strip.stripLocationMetadata(pdf).changed, false);
  const gif = new Uint8Array(Buffer.from('GIF89a......'));
  assert.equal(strip.stripLocationMetadata(gif).changed, false);
});

test('base64 wrapper returns cleaned data and the new size', () => {
  const input = jpegWithMetadata();
  const result = sanitize.stripLocationFromBase64(Buffer.from(input).toString('base64'));
  assert.equal(result.changed, true);
  assert.equal(result.sizeBytes, input.length);
  assert.equal(strip.hasLocationMetadata(new Uint8Array(Buffer.from(result.base64, 'base64'))), false);
  const pdf = Buffer.from('%PDF-1.4 hello').toString('base64');
  assert.equal(sanitize.stripLocationFromBase64(pdf).base64, pdf);
});

test('generic upload name: file-<8 lowercase letters> plus original extension only', () => {
  for (let i = 0; i < 20; i++) {
    assert.match(fileName.generateGenericFileName('张三_身份证.JPG'), /^file-[a-z]{8}\.jpg$/);
  }
  assert.match(fileName.generateGenericFileName('no-extension'), /^file-[a-z]{8}$/);
  assert.notEqual(fileName.generateGenericFileName('a.png'), fileName.generateGenericFileName('a.png'));
});
