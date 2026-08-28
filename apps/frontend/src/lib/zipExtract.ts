/**
 * Extrai arquivos de um ZIP no navegador (STORE / DEFLATE) lendo apenas os
 * trechos necessários via File.slice — ZIPs grandes não são carregados na RAM.
 */

const EOCD = 0x06054b50;
const CDH = 0x02014b50;
const LFH = 0x04034b50;

type ZipEntryMeta = {
  name: string;
  method: number;
  compSize: number;
  localOffset: number;
};

export type ZipExtractProgress = (done: number, total: number) => void;

async function readSlice(file: File, start: number, end: number): Promise<Uint8Array> {
  const from = Math.max(0, start);
  const to = Math.min(file.size, end);
  if (to <= from) return new Uint8Array(0);
  const buf = await file.slice(from, to).arrayBuffer();
  return new Uint8Array(buf);
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function findEocd(bytes: Uint8Array): number {
  const view = viewOf(bytes);
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === EOCD) return i;
  }
  return -1;
}

function decodeZipName(raw: Uint8Array, utf8Flag: boolean): string {
  if (utf8Flag) return new TextDecoder('utf-8').decode(raw);
  let out = '';
  for (let i = 0; i < raw.length; i += 1) out += String.fromCharCode(raw[i]!);
  return out;
}

async function parseCentralDirectory(file: File): Promise<ZipEntryMeta[]> {
  const tailSize = Math.min(file.size, 65535 + 22);
  const tail = await readSlice(file, file.size - tailSize, file.size);
  const eocdPos = findEocd(tail);
  if (eocdPos < 0) {
    throw new Error(
      'ZIP inválido ou incompleto. Se for um backup dividido em partes, junte tudo em um ZIP único.',
    );
  }

  const eocdView = viewOf(tail);
  const cdSize = eocdView.getUint32(eocdPos + 12, true);
  const cdOffset = eocdView.getUint32(eocdPos + 16, true);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error('ZIP64 não é suportado. Compacte os arquivos em um ZIP padrão.');
  }

  const cd = await readSlice(file, cdOffset, cdOffset + cdSize);
  const cdView = viewOf(cd);
  const entries: ZipEntryMeta[] = [];
  let pos = 0;

  while (pos + 46 <= cd.length) {
    if (cdView.getUint32(pos, true) !== CDH) break;
    const flags = cdView.getUint16(pos + 8, true);
    const method = cdView.getUint16(pos + 10, true);
    const compSize = cdView.getUint32(pos + 20, true);
    const nameLen = cdView.getUint16(pos + 28, true);
    const extraLen = cdView.getUint16(pos + 30, true);
    const commentLen = cdView.getUint16(pos + 32, true);
    const localOffset = cdView.getUint32(pos + 42, true);
    const nameRaw = cd.subarray(pos + 46, pos + 46 + nameLen);
    const name = decodeZipName(nameRaw, (flags & 0x800) !== 0).replace(/\\/g, '/');
    pos += 46 + nameLen + extraLen + commentLen;

    if (!name || name.endsWith('/')) continue;
    if (name.startsWith('__MACOSX/') || name.split('/').pop()?.startsWith('.')) continue;

    entries.push({ name, method, compSize, localOffset });
  }

  return entries;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function inflateRawBlob(compressed: Uint8Array): Promise<Blob> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'Seu navegador não suporta a leitura do ZIP. Use o Google Chrome ou o Edge atualizado.',
    );
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  void writer.write(toArrayBuffer(compressed));
  void writer.close();

  const reader = ds.readable.getReader();
  const chunks: BlobPart[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(toArrayBuffer(value));
  }
  return new Blob(chunks);
}

function mimeFromName(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  };
  return map[ext] || 'application/octet-stream';
}

function basenamePath(pathLike: string): string {
  return pathLike.replace(/\\/g, '/').split('/').filter(Boolean).pop() || pathLike;
}

/** Extrai as entradas de um ZIP como File, para envio em lotes pequenos ao servidor. */
export async function extractZipToFiles(
  zipFile: File,
  onProgress?: ZipExtractProgress,
): Promise<File[]> {
  const metas = await parseCentralDirectory(zipFile);
  if (!metas.length) {
    throw new Error('O ZIP não contém arquivos válidos para vincular.');
  }

  const out: File[] = [];
  for (let i = 0; i < metas.length; i += 1) {
    const meta = metas[i]!;
    onProgress?.(i, metas.length);

    const localHeader = await readSlice(zipFile, meta.localOffset, meta.localOffset + 30);
    if (localHeader.length < 30) continue;
    const lhView = viewOf(localHeader);
    if (lhView.getUint32(0, true) !== LFH) continue;

    const nameLen = lhView.getUint16(26, true);
    const extraLen = lhView.getUint16(28, true);
    const dataStart = meta.localOffset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + meta.compSize;
    if (dataEnd > zipFile.size) continue;

    const fileName = basenamePath(meta.name);
    const mimeType = mimeFromName(fileName);

    if (meta.method === 0) {
      const blob = zipFile.slice(dataStart, dataEnd);
      out.push(new File([blob], fileName, { type: mimeType }));
      continue;
    }
    if (meta.method !== 8) continue;

    const compressed = await readSlice(zipFile, dataStart, dataEnd);
    const inflated = await inflateRawBlob(compressed);
    out.push(new File([inflated], fileName, { type: mimeType }));
  }

  onProgress?.(metas.length, metas.length);

  if (!out.length) {
    throw new Error(
      'Não foi possível ler os arquivos do ZIP. Se for um backup dividido em partes (-001, -002…), junte tudo em um ZIP único antes de enviar.',
    );
  }

  return out;
}
