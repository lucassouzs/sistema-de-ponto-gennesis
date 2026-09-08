import { extractEstadoFromAnaliseJson } from './licitacaoEstado';

/** Remove sufixo "(Item N)" do título — o item não deve aparecer na análise manual. */
export function stripItemFromTitulo(titulo: string): string {
  return titulo.replace(/\s*\(Item\s+[^)]+\)\s*$/i, '').trim();
}

export function buildLicitacaoTituloExibicao(input: {
  titulo: string;
  estado?: string | null;
  valorEstimado?: string | null;
  analiseJson?: unknown;
}): string {
  const base = stripItemFromTitulo(input.titulo);
  const parts: string[] = [];
  const estado =
    input.estado?.trim().toUpperCase() ||
    extractEstadoFromAnaliseJson(input.analiseJson) ||
    '';
  const valor = input.valorEstimado?.trim();
  if (estado) parts.push(estado);
  if (valor) parts.push(valor);
  if (parts.length === 0) return base;
  return `${base} — ${parts.join(' - ')}`;
}
