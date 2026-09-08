/** Evita o mesmo arquivo entrar duas vezes (ex.: colar disparado em dois handlers). */
export function dedupeFiles(files: File[]): File[] {
  const seen = new Set<string>();
  const out: File[] = [];
  for (const f of files) {
    const key = `${f.size}|${f.type}|${f.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/** Extrai arquivos (ex.: print, imagem copiada) do clipboard no composer do chat. */
export function getFilesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];

  const out: File[] = [];

  if (data.items?.length) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) out.push(normalizeClipboardFile(file));
    }
  } else if (data.files?.length) {
    for (const file of Array.from(data.files)) {
      out.push(normalizeClipboardFile(file));
    }
  }

  return dedupeFiles(out);
}

export function partitionComposerFiles(files: File[]): { images: File[]; others: File[] } {
  const images: File[] = [];
  const others: File[] = [];
  for (const f of files) {
    if (f.type.startsWith('image/')) images.push(f);
    else others.push(f);
  }
  return { images, others };
}

export function revokeObjectPreviewUrls(urls: string[]): void {
  for (const u of urls) {
    if (u.startsWith('blob:')) URL.revokeObjectURL(u);
  }
}

function normalizeClipboardFile(file: File): File {
  if (file.name?.trim()) return file;
  const ext = file.type?.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
  const base = file.type.startsWith('image/')
    ? 'imagem'
    : file.type.startsWith('audio/')
      ? 'audio'
      : 'arquivo';
  return new File([file], `${base}-${Date.now()}.${ext}`, { type: file.type || 'application/octet-stream' });
}
