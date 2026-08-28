import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const EOCD = 0x06054b50;
const CDH = 0x02014b50;
const LFH = 0x04034b50;

type ZipEntryMeta = {
  name: string;
  method: number;
  compSize: number;
  localOffset: number;
};

function readRange(zipPath: string, start: number, length: number): Buffer {
  const fd = fs.openSync(zipPath, 'r');
  try {
    const buf = Buffer.alloc(length);
    const read = fs.readSync(fd, buf, 0, length, start);
    if (read < length) return buf.subarray(0, read);
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

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

function safeOutputPath(outDir: string, entryName: string): string | null {
  const normalized = entryName.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.endsWith('/')) return null;
  if (normalized.startsWith('__MACOSX/') || normalized.split('/').pop()?.startsWith('.')) {
    return null;
  }
  if (normalized.includes('..')) return null;
  const outPath = path.join(outDir, ...normalized.split('/'));
  const resolved = path.resolve(outPath);
  const root = path.resolve(outDir);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return outPath;
}

function parseCentralDirectory(zipPath: string, fileSize: number): ZipEntryMeta[] {
  const tailSize = Math.min(fileSize, 65557);
  const tail = readRange(zipPath, fileSize - tailSize, tailSize);
  const eocdRel = findEocdOffset(tail);
  if (eocdRel < 0) {
    throw new Error('Arquivo ZIP inválido ou corrompido.');
  }

  const eocd = tail.subarray(eocdRel);
  const cdOffset = eocd.readUInt32LE(16);
  const cdSize = eocd.readUInt32LE(12);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error('ZIP64 não é suportado. Compacte os arquivos em um ZIP padrão.');
  }

  const cdBuffer = readRange(zipPath, cdOffset, cdSize);
  const entries: ZipEntryMeta[] = [];
  let pos = 0;

  while (pos + 46 <= cdBuffer.length) {
    if (cdBuffer.readUInt32LE(pos) !== CDH) break;
    const flags = cdBuffer.readUInt16LE(pos + 8);
    const method = cdBuffer.readUInt16LE(pos + 10);
    const compSize = cdBuffer.readUInt32LE(pos + 20);
    const nameLen = cdBuffer.readUInt16LE(pos + 28);
    const extraLen = cdBuffer.readUInt16LE(pos + 30);
    const commentLen = cdBuffer.readUInt16LE(pos + 32);
    const localOffset = cdBuffer.readUInt32LE(pos + 42);
    const nameRaw = cdBuffer.subarray(pos + 46, pos + 46 + nameLen);
    const name = decodeZipName(nameRaw, (flags & 0x800) !== 0);
    pos += 46 + nameLen + extraLen + commentLen;

    const normalized = name.replace(/\\/g, '/');
    if (!normalized || normalized.endsWith('/')) continue;
    if (normalized.startsWith('__MACOSX/') || normalized.split('/').pop()?.startsWith('.')) {
      continue;
    }

    entries.push({ name: normalized, method, compSize, localOffset });
  }

  return entries;
}

function extractEntry(zipPath: string, outPath: string, meta: ZipEntryMeta): void {
  const lfh = readRange(zipPath, meta.localOffset, 30);
  if (lfh.readUInt32LE(0) !== LFH) {
    throw new Error(`Entrada ZIP inválida: ${meta.name}`);
  }
  const lNameLen = lfh.readUInt16LE(26);
  const lExtraLen = lfh.readUInt16LE(28);
  const dataStart = meta.localOffset + 30 + lNameLen + lExtraLen;
  const compressed = readRange(zipPath, dataStart, meta.compSize);

  let data: Buffer;
  if (meta.method === 0) data = compressed;
  else if (meta.method === 8) data = zlib.inflateRawSync(compressed);
  else throw new Error(`Método ZIP não suportado (${meta.method}) em ${meta.name}`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, data);
}

/**
 * Extrai ZIP lendo só os trechos necessários do disco (sem carregar o arquivo inteiro na RAM).
 */
export function extractZipFromDisk(zipPath: string, outDir: string): number {
  const stat = fs.statSync(zipPath);
  if (!stat.isFile() || stat.size < 22) {
    throw new Error('Arquivo ZIP inválido ou vazio.');
  }

  const entries = parseCentralDirectory(zipPath, stat.size);
  if (!entries.length) {
    throw new Error('O ZIP não contém arquivos para extrair.');
  }

  let extracted = 0;
  for (const meta of entries) {
    const outPath = safeOutputPath(outDir, meta.name);
    if (!outPath) continue;
    extractEntry(zipPath, outPath, meta);
    extracted += 1;
  }

  if (extracted === 0) {
    throw new Error('Nenhum arquivo válido encontrado dentro do ZIP.');
  }

  return extracted;
}
