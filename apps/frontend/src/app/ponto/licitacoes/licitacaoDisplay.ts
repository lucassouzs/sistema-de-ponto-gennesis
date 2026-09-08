/** Remove sufixo "(Item N)" — na análise manual usamos a coluna Estado, não o item. */
function stripItemFromTitulo(titulo: string): string {
  return titulo.replace(/\s*\(Item\s+[^)]+\)\s*$/i, '').trim();
}

function normalizeHeaderKey(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function estadoFromSnapshot(snapshot: Record<string, string> | null | undefined): string {
  if (!snapshot) return '';
  for (const [key, value] of Object.entries(snapshot)) {
    const k = normalizeHeaderKey(key);
    if (k !== 'estado' && k !== 'uf') continue;
    const uf = value?.trim().toUpperCase() ?? '';
    if (/^[A-Z]{2}$/.test(uf)) return uf;
  }
  return '';
}

export type LicitacaoTituloDisplaySource = {
  titulo: string;
  estado?: string | null;
  valorEstimado?: string | null;
  analiseJson?: {
    origemRegiao?: {
      estado?: string | null;
      rowSnapshot?: Record<string, string> | null;
    } | null;
  } | null;
};

export function extractEstadoFromLicitacao(lic: LicitacaoTituloDisplaySource): string {
  const direct = lic.estado?.trim().toUpperCase() ?? '';
  if (/^[A-Z]{2}$/.test(direct)) return direct;

  const fromOrigem = lic.analiseJson?.origemRegiao?.estado?.trim().toUpperCase() ?? '';
  if (/^[A-Z]{2}$/.test(fromOrigem)) return fromOrigem;

  return estadoFromSnapshot(lic.analiseJson?.origemRegiao?.rowSnapshot);
}

/** Título com coluna ESTADO e valor estimado: `{órgão} — GO - R$ ...` */
export function buildLicitacaoTituloDisplay(lic: LicitacaoTituloDisplaySource): string {
  const base = stripItemFromTitulo(lic.titulo);
  const parts: string[] = [];
  const estado = extractEstadoFromLicitacao(lic);
  const valor = lic.valorEstimado?.trim();
  if (estado) parts.push(estado);
  if (valor) parts.push(valor);
  if (parts.length === 0) return base;
  return `${base} — ${parts.join(' - ')}`;
}
