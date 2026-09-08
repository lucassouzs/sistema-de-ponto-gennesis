function normalizeHeaderKey(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function extractEstadoFromRowSnapshot(
  snapshot: Record<string, string> | null | undefined
): string {
  if (!snapshot || typeof snapshot !== 'object') return '';

  for (const [key, value] of Object.entries(snapshot)) {
    const normalizedKey = normalizeHeaderKey(key);
    if (normalizedKey !== 'estado' && normalizedKey !== 'uf') continue;
    const uf = value?.trim().toUpperCase() ?? '';
    if (/^[A-Z]{2}$/.test(uf)) return uf;
  }

  return '';
}

export function extractEstadoFromAnaliseJson(analiseJson: unknown): string {
  if (!analiseJson || typeof analiseJson !== 'object' || Array.isArray(analiseJson)) {
    return '';
  }

  const origem = (analiseJson as {
    origemRegiao?: {
      estado?: string;
      rowSnapshot?: Record<string, string>;
    };
  }).origemRegiao;

  if (!origem) return '';

  const direct = origem.estado?.trim().toUpperCase() ?? '';
  if (/^[A-Z]{2}$/.test(direct)) return direct;

  return extractEstadoFromRowSnapshot(origem.rowSnapshot);
}
