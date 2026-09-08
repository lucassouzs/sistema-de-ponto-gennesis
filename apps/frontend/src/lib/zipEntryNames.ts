/** Lista nomes de arquivos dentro de um ZIP (sem extrair o conteúdo). */
export async function listZipEntryNames(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const eocd = findEocd(view);
  if (eocd < 0) throw new Error('ZIP inválido. Envie um arquivo .zip padrão.');

  const cdOffset = view.getUint32(eocd + 16, true);
  const cdSize = view.getUint32(eocd + 12, true);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error('ZIP64 não é suportado. Compacte os arquivos em um ZIP padrão.');
  }

  const names: string[] = [];
  let pos = cdOffset;
  const end = Math.min(bytes.length, cdOffset + cdSize);
  const dec = new TextDecoder('utf-8');

  while (pos + 46 <= end) {
    if (view.getUint32(pos, true) !== 0x02014b50) break;
    const flags = view.getUint16(pos + 8, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const raw = bytes.subarray(pos + 46, pos + 46 + nameLen);
    let name = dec.decode(raw);
    if ((flags & 0x800) === 0 && name.includes('\uFFFD')) {
      name = latin1Decode(raw);
    }
    const normalized = name.replace(/\\/g, '/');
    if (normalized && !normalized.endsWith('/') && !normalized.startsWith('__MACOSX/')) {
      const base = normalized.split('/').pop() || '';
      if (base && !base.startsWith('.')) names.push(normalized);
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

function findEocd(view: DataView): number {
  const len = view.byteLength;
  const maxScan = Math.min(len, 65535 + 22);
  for (let i = len - 22; i >= len - maxScan && i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

function latin1Decode(raw: Uint8Array): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) out += String.fromCharCode(raw[i]!);
  return out;
}

export function isZipFile(file: File): boolean {
  return (
    file.type.includes('zip') ||
    /\.zip$/i.test(file.name) ||
    file.type === 'application/x-zip-compressed'
  );
}

export function basenamePath(pathLike: string): string {
  return pathLike.replace(/\\/g, '/').split('/').filter(Boolean).pop() || pathLike;
}

export function normalizeMatchKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function fileMatchesRecord(
  fileName: string,
  sourcePath?: string | null,
  externalId?: string | null,
): boolean {
  const entry = normalizeMatchKey(basenamePath(fileName));
  const source = sourcePath ? normalizeMatchKey(basenamePath(sourcePath)) : '';
  if (source && (entry === source || entry.replace(/\.[a-z0-9]+$/, '') === source.replace(/\.[a-z0-9]+$/, ''))) {
    return true;
  }
  const id = normalizeMatchKey(externalId || '');
  if (id && entry.includes(id)) return true;
  return false;
}
