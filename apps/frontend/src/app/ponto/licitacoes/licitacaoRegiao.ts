export function extractRegiaoKeyFromAnaliseJson(analiseJson: unknown): string {
  if (!analiseJson || typeof analiseJson !== 'object' || Array.isArray(analiseJson)) {
    return '';
  }

  const origem = (analiseJson as {
    origemRegiao?: { regiaoKey?: string };
  }).origemRegiao;

  return origem?.regiaoKey?.trim().toLowerCase() ?? '';
}

export function extractRegiaoKeyFromLicitacao(lic: {
  regiaoKey?: string | null;
  analiseJson?: unknown;
}): string {
  const direct = lic.regiaoKey?.trim().toLowerCase() ?? '';
  if (direct) return direct;
  return extractRegiaoKeyFromAnaliseJson(lic.analiseJson);
}
