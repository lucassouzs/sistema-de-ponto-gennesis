import { parseGastosPeriodYmd } from './buildQueryGastosRows';
import { getGastosContractAggregateKey } from './gastosOperacionaisContractOrder';

export type ControleGeralTetoOrcamentarioEntry = {
  id: string;
  contractKey: string;
  contractName: string;
  year: number;
  month: number;
  amount: number;
};

export type YearMonthRef = { year: number; month: number };

/** Lista os pares ano/mês cobertos pelo filtro de período (null = sem filtro). */
export function listYearMonthsInGastosPeriod(
  periodFrom: string,
  periodTo: string
): YearMonthRef[] | null {
  if (!periodFrom && !periodTo) return null;

  const now = new Date();
  const fallbackFrom = new Date(2020, 0, 1, 12, 0, 0, 0);
  const fallbackTo = new Date(now.getFullYear() + 1, 11, 31, 12, 0, 0, 0);

  const from = periodFrom ? parseGastosPeriodYmd(periodFrom) : fallbackFrom;
  const to = periodTo ? parseGastosPeriodYmd(periodTo) : fallbackTo;
  if (!from || !to || from > to) return null;

  const out: YearMonthRef[] = [];
  let cursor = new Date(from.getFullYear(), from.getMonth(), 1, 12, 0, 0, 0);
  const endMarker = new Date(to.getFullYear(), to.getMonth(), 1, 12, 0, 0, 0);

  while (cursor <= endMarker) {
    out.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12, 0, 0, 0);
  }

  return out;
}

export function buildTetoOrcamentarioLookup(
  entries: readonly ControleGeralTetoOrcamentarioEntry[]
): Map<string, ControleGeralTetoOrcamentarioEntry[]> {
  const map = new Map<string, ControleGeralTetoOrcamentarioEntry[]>();
  for (const entry of entries) {
    const keys = new Set<string>();
    const fromName = getGastosContractAggregateKey(entry.contractName);
    if (fromName) keys.add(fromName);
    if (entry.contractKey?.trim()) keys.add(entry.contractKey.trim());
    for (const key of Array.from(keys)) {
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
  }
  return map;
}

/**
 * Labels de associação do contrato (prioridade: centro de custo, depois nome).
 * O teto no Controle Geral usa a mesma chave normalizada dos gastos/CC.
 */
export function tetoLabelsForSystemContract(contract: {
  name?: string | null;
  costCenter?: { name?: string | null; code?: string | null } | null;
}): string[] {
  return [contract.costCenter?.name, contract.costCenter?.code, contract.name].filter(
    (label): label is string => Boolean(label?.trim())
  );
}

/** Primeiro conjunto de entries que casar com algum label (evita somar chaves distintas). */
export function collectTetoEntriesForLabels(
  labels: readonly string[],
  lookup: Map<string, ControleGeralTetoOrcamentarioEntry[]>
): ControleGeralTetoOrcamentarioEntry[] {
  for (const label of labels) {
    const key = getGastosContractAggregateKey(label);
    if (!key) continue;
    const list = lookup.get(key);
    if (list && list.length > 0) return list;
  }
  return [];
}

/** Valores mensais do teto (índice 0 = jan) para o ano; null = sem cadastro. */
export function resolveMonthlyTetoOrcamentarioForLabels(
  labels: readonly string[],
  lookup: Map<string, ControleGeralTetoOrcamentarioEntry[]>,
  year: number
): (number | null)[] {
  const entries = collectTetoEntriesForLabels(labels, lookup);
  const byMonth = new Map<number, number>();
  for (const entry of entries) {
    if (entry.year !== year) continue;
    const amount = Number.isFinite(entry.amount) ? entry.amount : 0;
    byMonth.set(entry.month, (byMonth.get(entry.month) ?? 0) + amount);
  }
  return Array.from({ length: 12 }, (_, i) =>
    byMonth.has(i + 1) ? (byMonth.get(i + 1) as number) : null
  );
}

/** Soma anual do teto por ano (0 se não houver cadastro). */
export function resolveYearlyTetoOrcamentarioForLabels(
  labels: readonly string[],
  lookup: Map<string, ControleGeralTetoOrcamentarioEntry[]>,
  years: readonly number[]
): Record<number, number> {
  const entries = collectTetoEntriesForLabels(labels, lookup);
  const out: Record<number, number> = {};
  for (const y of years) out[y] = 0;
  for (const entry of entries) {
    if (!(entry.year in out)) continue;
    out[entry.year] += Number.isFinite(entry.amount) ? entry.amount : 0;
  }
  return out;
}

/**
 * Soma o teto do contrato no período filtrado.
 * Sem filtro de período: retorna 0 (UI exibe hífen — teto só faz sentido com apuração).
 */
export function resolveContractTetoOrcamentario(
  contract: string,
  lookup: Map<string, ControleGeralTetoOrcamentarioEntry[]>,
  periodFrom: string,
  periodTo: string
): number {
  const key = getGastosContractAggregateKey(contract);
  const entries = lookup.get(key) ?? [];
  if (entries.length === 0) return 0;

  // Sem período: não soma o histórico inteiro — a coluna fica com hífen.
  if (!periodFrom && !periodTo) return 0;

  const from = periodFrom ? parseGastosPeriodYmd(periodFrom) : null;
  const to = periodTo ? parseGastosPeriodYmd(periodTo) : null;
  if ((periodFrom && !from) || (periodTo && !to)) return 0;

  return entries.reduce((sum, entry) => {
    const monthStart = new Date(entry.year, entry.month - 1, 1, 12, 0, 0, 0);
    const monthEnd = new Date(entry.year, entry.month, 0, 12, 0, 0, 0);
    if (from && monthEnd < from) return sum;
    if (to && monthStart > to) return sum;
    return sum + (Number.isFinite(entry.amount) ? entry.amount : 0);
  }, 0);
}
