// Image checks done on the raw bytes, without decoding pixels:
// - dimensions, so a small file can't claim a huge canvas (decompression bomb)
// - metadata removal, so photos don't leak GPS location, device serials or
//   editing history (EXIF, XMP, IPTC, text chunks).
// Anything that can't be parsed is rejected rather than stored as-is.

export const MAX_SIDE = 12000;
export const MAX_PIXELS = 50_000_000;

class Bad extends Error {}

function jpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Bad();
  const out = [buf.subarray(0, 2)];
  let width = null;
  let height = null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Bad();
    let marker = buf[i + 1];
    // Fill bytes.
    while (marker === 0xff) {
      i += 1;
      marker = buf[i + 1];
    }
    if (marker === 0xd9) {
      out.push(buf.subarray(i, i + 2));
      break;
    }
    // Standalone markers without a length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) throw new Bad();
    const seg = buf.subarray(i, i + 2 + len);
    // SOFn (except DHT, JPG, DAC) carries the size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      height = buf.readUInt16BE(i + 5);
      width = buf.readUInt16BE(i + 7);
    }
    // Drop APP1..APP15 (EXIF, XMP, IPTC, ...) and comments; keep APP0 (JFIF) and APP2 (ICC colour).
    const drop = (marker >= 0xe1 && marker <= 0xef && marker !== 0xe2) || marker === 0xfe;
    if (!drop) out.push(seg);
    i += 2 + len;
    if (marker === 0xda) {
      // Start of scan: the rest is image data.
      out.push(buf.subarray(i));
      break;
    }
  }
  if (!width || !height) throw new Bad();
  return { width, height, bytes: Buffer.concat(out) };
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function png(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Bad();
  const out = [PNG_SIG];
  let i = 8;
  let width = null;
  let height = null;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) throw new Bad();
    if (type === 'IHDR') {
      width = buf.readUInt32BE(i + 8);
      height = buf.readUInt32BE(i + 12);
    }
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  if (!width || !height) throw new Bad();
  return { width, height, bytes: Buffer.concat(out) };
}

function webp(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') throw new Bad();
  const chunks = [];
  let i = 12;
  let width = null;
  let height = null;
  while (i + 8 <= buf.length) {
    const type = buf.toString('latin1', i, i + 4);
    const len = buf.readUInt32LE(i + 4);
    const end = i + 8 + len + (len % 2);
    if (i + 8 + len > buf.length) throw new Bad();
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === 'VP8X' && len >= 10) {
      width = 1 + data.readUIntLE(4, 3);
      height = 1 + data.readUIntLE(7, 3);
    } else if (type === 'VP8 ' && !width && len >= 10) {
      width = data.readUInt16LE(6) & 0x3fff;
      height = data.readUInt16LE(8) & 0x3fff;
    } else if (type === 'VP8L' && !width && len >= 5) {
      const b = data.readUInt32LE(1);
      width = (b & 0x3fff) + 1;
      height = ((b >> 14) & 0x3fff) + 1;
    }
    if (type !== 'EXIF' && type !== 'XMP ') {
      let chunk = buf.subarray(i, Math.min(end, buf.length));
      if (type === 'VP8X') {
        // Clear the EXIF (0x08) and XMP (0x04) flags now that those chunks are gone.
        chunk = Buffer.from(chunk);
        chunk[8] &= ~0x0c;
      }
      chunks.push(chunk);
    }
    i = end;
  }
  if (!width || !height) throw new Bad();
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'latin1');
  return { width, height, bytes: Buffer.concat([header, body]) };
}

function gif(buf) {
  if (buf.toString('latin1', 0, 4) !== 'GIF8') throw new Bad();
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), bytes: buf };
}

const PARSERS = { 'image/jpeg': jpeg, 'image/png': png, 'image/webp': webp, 'image/gif': gif };

// Returns { width, height, bytes } with metadata removed, or { error }.
export function cleanImage(buf, mime) {
  const parse = PARSERS[mime];
  if (!parse) return { error: 'Only PNG, JPEG, WebP or GIF images are supported.' };
  let r;
  try {
    r = parse(buf);
  } catch {
    return { error: 'That image looks damaged. Try saving it again, or take a new screenshot.' };
  }
  if (r.width > MAX_SIDE || r.height > MAX_SIDE || r.width * r.height > MAX_PIXELS) return { error: 'That image is too large. Try a smaller one.' };
  return r;
}
