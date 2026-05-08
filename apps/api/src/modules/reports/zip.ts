// Minimal store-only ZIP writer. PKWARE APPNOTE 6.3, method = 0 (no
// compression). Avoids pulling in a dependency for a small, well-bounded
// use case (accreditation pack: a few hundred KB of CSV).

export interface ZipEntry {
  name: string;
  bytes: Buffer;
}

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function dosTime(d: Date): { time: number; date: number } {
  const time =
    ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date =
    (((d.getFullYear() - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0xf) << 5) |
    (d.getDate() & 0x1f);
  return { time, date };
}

export function buildStoreZip(entries: ZipEntry[]): Buffer {
  const now = new Date();
  const { time, date } = dosTime(now);

  const localChunks: Buffer[] = [];
  const central: Array<{
    offset: number;
    nameBytes: Buffer;
    size: number;
    crc: number;
  }> = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.bytes);
    const size = e.bytes.length;

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);

    localChunks.push(local, e.bytes);

    central.push({ offset, nameBytes, size, crc });
    offset += local.length + e.bytes.length;
  }

  const localBuf = Buffer.concat(localChunks);

  const centralChunks: Buffer[] = [];
  for (const c of central) {
    const ch = Buffer.alloc(46 + c.nameBytes.length);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(c.crc, 16);
    ch.writeUInt32LE(c.size, 20);
    ch.writeUInt32LE(c.size, 24);
    ch.writeUInt16LE(c.nameBytes.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(c.offset, 42);
    c.nameBytes.copy(ch, 46);
    centralChunks.push(ch);
  }
  const centralBuf = Buffer.concat(centralChunks);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localBuf, centralBuf, eocd]);
}

// Read-back helper used by tests + by /reports/accreditation-pack/:id
// when reviewers need to peek into the pack without an external tool.
// Returns entries in central-directory order. Throws on malformed input.
export function readStoreZip(buf: Buffer): ZipEntry[] {
  // Locate the End of Central Directory record by scanning back from
  // the end of the buffer for the EOCD signature.
  let eocdAt = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdAt = i;
      break;
    }
  }
  if (eocdAt < 0) throw new Error('ZIP: end-of-central-directory not found');

  const centralCount = buf.readUInt16LE(eocdAt + 10);
  const centralSize = buf.readUInt32LE(eocdAt + 12);
  const centralOffset = buf.readUInt32LE(eocdAt + 16);

  const out: ZipEntry[] = [];
  let p = centralOffset;
  for (let i = 0; i < centralCount; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error('ZIP: central directory header signature mismatch');
    }
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');

    if (method !== 0) throw new Error(`ZIP: unsupported method ${method} for ${name}`);
    if (compSize !== uncompSize) throw new Error('ZIP: stored entry sizes disagree');

    // Read the local file header to find where the data starts.
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('ZIP: local header signature mismatch');
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const bytes = buf.slice(dataStart, dataStart + uncompSize);

    out.push({ name, bytes });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (p - centralOffset !== centralSize) {
    // Not strictly an error for tools, but we wrote the bytes, so this
    // catches drift between the writer and reader.
    throw new Error('ZIP: central-directory size mismatch');
  }
  return out;
}
