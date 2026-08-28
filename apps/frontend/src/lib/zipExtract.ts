/** Extrai arquivos de um ZIP no navegador (STORE / DEFLATE). */

const EOCD = 0x06054b50;
const CDH = 0x02014b50;
const LFH = 0x04034b50;

type ZipEntryMeta = {
  name: string;
  method: number;
  compSize: number;
  localOffset: number;
};

function findEocd(view: DataView): number {
  const len = view.byteLength;
  const maxScan = Math.min(len, 65535 + 22);
  for (let i = len - 22; i >= len - maxScan && i >= 0; i -= 1) {
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

function parseCentralDirectory(bytes: Uint8Array, view: DataView): ZipEntryMeta[] {
  const eocd = findEocd(view);
  if (eocd < 0) throw new Error('ZIP inválido. Envie um arquivo .zip padrão.');

  const cdOffset = view.getUint32(eocd + 16, true);
  const cdSize = view.getUint32(eocd + 12, true);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error('ZIP64 não é suportado. Compacte os arquivos em um ZIP padrão.');
  }

  const entries: ZipEntryMeta[] = [];
  let pos = cdOffset;
  const end = Math.min(bytes.length, cdOffset + cdSize);

  while (pos + 46 <= end) {
    if (view.getUint32(pos, true) !== CDH) break;
    const flags = view.getUint16(pos + 8, true);
    const method = view.getUint16(pos + 10, true);
    const compSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const nameRaw = bytes.subarray(pos + 46, pos + 46 + nameLen);
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

async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Seu navegador não suporta extração de ZIP. Use Chrome ou Edge atualizado.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  void writer.write(toArrayBuffer(compressed));
  void writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
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

/** Extrai entradas de um ZIP para objetos File (para envio em lotes ao servidor). */
export async function extractZipToFiles(zipFile: File): Promise<File[]> {
  const buf = await zipFile.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const metas = parseCentralDirectory(bytes, view);
  if (!metas.length) {
    throw new Error('O ZIP não contém arquivos válidos.');
  }

  const out: File[] = [];
  for (const meta of metas) {
    if (meta.localOffset + 30 > bytes.length) continue;
    if (view.getUint32(meta.localOffset, true) !== LFH) continue;
    const lNameLen = view.getUint16(meta.localOffset + 26, true);
    const lExtraLen = view.getUint16(meta.localOffset + 28, true);
    const dataStart = meta.localOffset + 30 + lNameLen + lExtraLen;
    const dataEnd = dataStart + meta.compSize;
    if (dataEnd > bytes.length) continue;

    const compressed = bytes.subarray(dataStart, dataEnd);
    let data: Uint8Array;
    if (meta.method === 0) data = compressed;
    else if (meta.method === 8) data = await inflateRaw(compressed);
    else continue;

    const fileName = basenamePath(meta.name);
    out.push(
      new File([toArrayBuffer(data)], fileName, {
        type: mimeFromName(fileName),
        lastModified: zipFile.lastModified,
      }),
    );
  }

  if (!out.length) {
    throw new Error(
      'Não foi possível ler os arquivos do ZIP. Se for um backup dividido em partes (-001, -002…), junte tudo em um ZIP único antes de enviar.',
    );
  }

  return out;
}
