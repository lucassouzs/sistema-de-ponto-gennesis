export function extractRegiaoKeyFromAnaliseJson(analiseJson: unknown): string {
  if (!analiseJson || typeof analiseJson !== 'object' || Array.isArray(analiseJson)) {
    return '';
  }

  const origem = (analiseJson as {
    origemRegiao?: { regiaoKey?: string };
  }).origemRegiao;

  return origem?.regiaoKey?.trim().toLowerCase() ?? '';
}

export function extractRegiaoLabelFromAnaliseJson(analiseJson: unknown): string {
  if (!analiseJson || typeof analiseJson !== 'object' || Array.isArray(analiseJson)) {
    return '';
  }

  const origem = (analiseJson as {
    origemRegiao?: { regiaoLabel?: string };
  }).origemRegiao;

  return origem?.regiaoLabel?.trim() ?? '';
}
