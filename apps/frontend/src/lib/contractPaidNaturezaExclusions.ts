/**
 * Naturezas que entram no "Total Pago" do contrato e na linha Gastos (RM / TOTVS).
 * Todas as naturezas do RM entram, exceto movimentações financeiras (blocklist abaixo).
 * Comparação normalizada (maiúsculas, sem acentos).
 */
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeNaturezaLabel(natureza: string): string {
  return stripDiacritics(String(natureza ?? ''))
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/** Blocklist — naturezas que NÃO entram no total pago / gastos do contrato. */
const EXCLUDED_FROM_CONTRACT_PAID_TOTAL = [
  'RECEITA - MANUTENCAO',
  'TRANSFERENCIA - ENTRADA',
  'EMPRESTIMO ENTRE PROJETOS - SAIDA - SV',
  'EMPRESTIMO ENTRE PROJETOS - ENTRADA',
  'TRANSFERENCIA - SAIDA - SV',
  'EMPRESTIMO BANCARIO - SAIDA - SV',
  'EMPRESTIMO BANCARIO - ENTRADA',
  'EMPRESTIMO DE SOCIOS - ENTRADA',
  'EMPRESTIMO DE SOCIOS - SAIDA - SV',
  'REPASSE AO ADM - SAIDA - SV',
  'REPASSES A DEMANDAS DA DIRETORIA - SV',
  'REEMBOLSO ENTRE CONTRATOS - ENTRADA',
  'DISTRIBUICAO DE LUCROS - SV',
  'DEVOLUCAO PAGAMENTO INDEVIDO',
  'REEMBOLSO ENTRE CONTRATOS - SAIDA - SV',
  'PAGAMENTO INDEVIDO - SV',
  'PRO-LABORE',
  'CONSIGNADOS DE COLABORADORES - SV',
  'REPASSE AO ADM - ENTRADA',
  'RENDIMENTOS DE APLICACOES FINANCEIRAS'
] as const;

const EXCLUDED_NORMALIZED = new Set(
  EXCLUDED_FROM_CONTRACT_PAID_TOTAL.map((n) => normalizeNaturezaLabel(n))
);

export function isNaturezaExcludedFromContractPaidTotal(natureza: string): boolean {
  const key = normalizeNaturezaLabel(natureza);
  if (!key || key === '—' || key === '-') return false;
  return EXCLUDED_NORMALIZED.has(key);
}

export function isNaturezaIncludedInContractPaidTotal(natureza: string): boolean {
  const key = normalizeNaturezaLabel(natureza);
  if (!key || key === '—' || key === '-') return false;
  return !isNaturezaExcludedFromContractPaidTotal(natureza);
}

export function sumPaidByNaturezaRows(
  rows: { natureza: string; total: number; count?: number }[],
  options?: { excludeDefaultNaturezas?: boolean }
): { total: number; count: number; excludedTotal: number; excludedCount: number } {
  const exclude = options?.excludeDefaultNaturezas !== false;
  let total = 0;
  let count = 0;
  let excludedTotal = 0;
  let excludedCount = 0;
  for (const r of rows) {
    const skip = exclude && isNaturezaExcludedFromContractPaidTotal(r.natureza);
    if (skip) {
      excludedTotal += r.total;
      excludedCount += r.count ?? 0;
    } else {
      total += r.total;
      count += r.count ?? 0;
    }
  }
  return { total, count, excludedTotal, excludedCount };
}

export function sumPaidFluigSolicitations(
  rows: { natureza: string; valor: number }[],
  options?: { excludeDefaultNaturezas?: boolean }
): { total: number; count: number; excludedTotal: number; excludedCount: number } {
  const exclude = options?.excludeDefaultNaturezas !== false;
  let total = 0;
  let count = 0;
  let excludedTotal = 0;
  let excludedCount = 0;
  for (const r of rows) {
    const skip = exclude && isNaturezaExcludedFromContractPaidTotal(r.natureza);
    if (skip) {
      excludedTotal += r.valor;
      excludedCount += 1;
    } else {
      total += r.valor;
      count += 1;
    }
  }
  return { total, count, excludedTotal, excludedCount };
}

/** Modal: naturezas operacionais (todas exceto blocklist). */
export function filterNaturezaRowsForPaidModalDisplay<T extends { natureza: string }>(
  rows: T[]
): T[] {
  return rows.filter((r) => isNaturezaIncludedInContractPaidTotal(r.natureza));
}
