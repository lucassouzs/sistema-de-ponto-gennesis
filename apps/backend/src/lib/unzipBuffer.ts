import zlib from 'zlib';

const EOCD = 0x06054b50;
const CDH = 0x02014b50;
const LFH = 0x04034b50;

export type ZipFileEntry = {
  name: string;
  data: Buffer;
};

function findEocdOffset(buffer: Buffer): number {
  const maxScan = Math.min(buffer.length, 65535 + 22);
  for (let i = buffer.length - 22; i >= buffer.length - maxScan && i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) return i;
  }
  return -1;
}

function decodeZipName(raw: Buffer, utf8Flag: boolean): string {
  if (utf8Flag) return raw.toString('utf8');
  try {
    const utf8 = raw.toString('utf8');
    if (!utf8.includes('\uFFFD')) return utf8;
  } catch {
    // ignore
  }
  return raw.toString('latin1');
}

/** Extrai arquivos de um ZIP (STORE / DEFLATE). Pastas são ignoradas. */
export function unzipAll(buffer: Buffer): ZipFileEntry[] {
  if (!buffer?.length) return [];
  const eocd = findEocdOffset(buffer);
  if (eocd < 0) {
    throw new Error('Arquivo ZIP inválido ou corrompido.');
  }

  const cdOffset = buffer.readUInt32LE(eocd + 16);
  const cdSize = buffer.readUInt32LE(eocd + 12);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error('ZIP64 não é suportado. Compacte os arquivos em um ZIP padrão.');
  }

  const entries: ZipFileEntry[] = [];
  let pos = cdOffset;
  const cdEnd = Math.min(buffer.length, cdOffset + cdSize);

  while (pos + 46 <= cdEnd) {
    if (buffer.readUInt32LE(pos) !== CDH) break;
    const flags = buffer.readUInt16LE(pos + 8);
    const method = buffer.readUInt16LE(pos + 10);
    const compSize = buffer.readUInt32LE(pos + 20);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const nameRaw = buffer.subarray(pos + 46, pos + 46 + nameLen);
    const name = decodeZipName(nameRaw, (flags & 0x800) !== 0);
    pos += 46 + nameLen + extraLen + commentLen;

    const normalized = name.replace(/\\/g, '/');
    if (!normalized || normalized.endsWith('/')) continue;
    if (normalized.startsWith('__MACOSX/') || normalized.split('/').pop()?.startsWith('.')) {
      continue;
    }

    if (localOffset + 30 > buffer.length) continue;
    if (buffer.readUInt32LE(localOffset) !== LFH) continue;
    const lNameLen = buffer.readUInt16LE(localOffset + 26);
    const lExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buffer.length) continue;
    const compressed = buffer.subarray(dataStart, dataEnd);

    let data: Buffer;
    try {
      if (method === 0) data = Buffer.from(compressed);
      else if (method === 8) data = zlib.inflateRawSync(compressed);
      else continue;
    } catch {
      continue;
    }
    entries.push({ name: normalized, data });
  }

  return entries;
}

export function isZipBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}
