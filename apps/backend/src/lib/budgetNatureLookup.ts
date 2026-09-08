import { prisma } from './prisma';

export function normalizeBudgetNatureCode(code: string): string {
  return String(code ?? '').trim();
}

/** Mapa código RM (ex.: 3.03.01.03) → nome no cadastro. */
export async function loadBudgetNatureNameByCode(): Promise<Map<string, string>> {
  const rows = await prisma.budgetNature.findMany({
    where: { isActive: true, code: { not: null } },
    select: { code: true, name: true },
  });

  const map = new Map<string, string>();
  for (const row of rows) {
    const code = normalizeBudgetNatureCode(row.code ?? '');
    const name = (row.name ?? '').trim();
    if (!code || !name) continue;
    map.set(code, name);
    const upper = code.toUpperCase();
    if (!map.has(upper)) map.set(upper, name);
  }
  return map;
}

export function resolveBudgetNatureName(
  codNatFinanceira: string,
  lookup: Map<string, string>
): string {
  const code = normalizeBudgetNatureCode(codNatFinanceira);
  if (!code) return '';
  return lookup.get(code) ?? lookup.get(code.toUpperCase()) ?? '';
}
