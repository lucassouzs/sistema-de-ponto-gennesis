/**
 * Espelha apps/frontend/src/lib/contractPaidNaturezaExclusions.ts
 */

import { isGastosOperacionaisAllowedNatureza } from './gastosOperacionaisAllowedNaturezas';

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeNaturezaLabel(natureza: string): string {
  return stripDiacritics(String(natureza ?? ''))
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

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

/** Total da listagem de Gastos Operacionais: somente naturezas da whitelist. */
export function shouldCountInGastosOperacionaisTotal(natureza: string): boolean {
  return isGastosOperacionaisAllowedNatureza(natureza);
}
