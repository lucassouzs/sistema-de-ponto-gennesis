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

  const from = periodFrom
    ? parseGastosPeriodYmd(periodFrom)
    : parseGastosPeriodYmd('1900-01-01');
  const to = periodTo ? parseGastosPeriodYmd(periodTo) : parseGastosPeriodYmd('2100-12-31');
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

function yearMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function buildTetoOrcamentarioLookup(
  entries: readonly ControleGeralTetoOrcamentarioEntry[]
): Map<string, ControleGeralTetoOrcamentarioEntry[]> {
  const map = new Map<string, ControleGeralTetoOrcamentarioEntry[]>();
  for (const entry of entries) {
    const key = getGastosContractAggregateKey(entry.contractName) || entry.contractKey;
    const list = map.get(key) ?? [];
    list.push(entry);
    map.set(key, list);
  }
  return map;
}

/**
 * Soma o teto do contrato no período filtrado.
 * Sem filtro de período: soma todos os meses cadastrados.
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

  const yearMonths = listYearMonthsInGastosPeriod(periodFrom, periodTo);
  if (!yearMonths) {
    return entries.reduce((sum, entry) => sum + (Number.isFinite(entry.amount) ? entry.amount : 0), 0);
  }

  const allowed = new Set(yearMonths.map((ym) => yearMonthKey(ym.year, ym.month)));
  return entries.reduce((sum, entry) => {
    if (!allowed.has(yearMonthKey(entry.year, entry.month))) return sum;
    return sum + (Number.isFinite(entry.amount) ? entry.amount : 0);
  }, 0);
}
