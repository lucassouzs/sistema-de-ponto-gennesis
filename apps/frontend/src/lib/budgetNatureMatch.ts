import { normalizeNaturezaLabel } from '@/lib/contractPaidNaturezaExclusions';

export type BudgetNatureMatchTarget = {
  id?: string;
  code?: string | null;
  name: string;
};

/**
 * Naturezas de categoria física de material (além de INSUMOS* / MATERIAL*).
 * Alinhado ao resumo "Gastos com Materiais" e ao bloco DFC Material Aplicado.
 */
const MATERIAL_CADASTRO_EXTRA_NATUREZAS = new Set(
  [
    'LOUCAS E METAIS',
    'SINALIZACAO',
    'COBERTURA/CALHA',
    'MARMORE/GRANITO',
    'ESQUADRIAS (EXCETO FERRO)',
    'PAVIMENTACAO',
    'PRESTACAO DE SERVICOS TERCEIRIZADOS'
  ].map((n) => normalizeNaturezaLabel(n))
);

/** Naturezas adequadas ao cadastro de Materiais e Serviços (insumos / materiais). */
export function isMaterialCadastroBudgetNature(name: string): boolean {
  const key = normalizeNaturezaLabel(name).replace(/ - SV$/i, '').trim();
  if (!key) return false;
  if (key.startsWith('INSUMOS')) return true;
  if (key.startsWith('MATERIAL')) return true;
  return MATERIAL_CADASTRO_EXTRA_NATUREZAS.has(key);
}

/** Filtro por um ou mais códigos de natureza (OR). Sem seleção = todas. */
export function extratoMatchesAnyNatureCodes(
  rmCodNatFinanceira: string,
  selectedNatureCodes: string[]
): boolean {
  if (!selectedNatureCodes.length) return true;
  const itemCode = normalizeBudgetNatureCode(rmCodNatFinanceira);
  if (!itemCode) return false;
  const itemUpper = itemCode.toUpperCase();
  return selectedNatureCodes.some((sel) => {
    const s = normalizeBudgetNatureCode(sel);
    return s === itemCode || s.toUpperCase() === itemUpper;
  });
}

export function normalizeBudgetNatureCode(code: string): string {
  return String(code ?? '').trim();
}

export function findBudgetNatureForRmCode(
  rmCodNat: string,
  budgetNatures: BudgetNatureMatchTarget[]
): BudgetNatureMatchTarget | null {
  const code = normalizeBudgetNatureCode(rmCodNat);
  if (!code) return null;
  const upper = code.toUpperCase();
  for (const bn of budgetNatures) {
    const bc = normalizeBudgetNatureCode(bn.code ?? '');
    if (!bc) continue;
    if (bc === code || bc.toUpperCase() === upper) return bn;
  }
  return null;
}

/** Nome da natureza no cadastro; se não achar, mantém o código RM. */
export function displayNaturezaFinanceiraLabel(
  rmCodNatFinanceira: string,
  budgetNatures: BudgetNatureMatchTarget[],
  resolvedName?: string
): string {
  const fromApi = (resolvedName ?? '').trim();
  if (fromApi) return fromApi;
  const bn = findBudgetNatureForRmCode(rmCodNatFinanceira, budgetNatures);
  if (bn?.name?.trim()) return bn.name.trim();
  return rmCodNatFinanceira?.trim() || '—';
}
