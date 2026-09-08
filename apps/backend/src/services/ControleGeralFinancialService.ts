import {
  fetchBaseGastosSummary
} from './BaseGastosSheetsService';
import {
  fetchControleNfsTotalsSummary,
  fetchNfsLotFaturamento,
  toNfsTotalsComputeOptions,
  type ControleNfsCardsDateFilter
} from './ControleNfsSheetsService';import { buildControleGeralFinancialRows } from './controleGeralFinancialRowsBuilder';

export type ControleGeralFinancialRow = {
  rowKey: string;
  tabKey: string;
  label: string;
  lotKey?: string;
  isLotRow: boolean;
  gastosAcumulado: number;
  gastosAnual: number;
  faturamentoAcumulado: number;
  faturamentoAnual: number;
  resultadoAcumulado: number;
  resultadoAnual: number;
};

export type ControleGeralFinancialSummary = {
  rows: ControleGeralFinancialRow[];
  filterYear: number | null;
  availableYears: number[];
  fetchedAt: string;
};

function buildNfsDateFilter(year: number): ControleNfsCardsDateFilter {
  return {
    emissaoDateFrom: `${year}-01-01`,
    emissaoDateTo: `${year}-12-31`
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchControleGeralFinancialSummary(
  filterYear?: number,
  forceRefresh = false
): Promise<ControleGeralFinancialSummary> {
  const yearValid = filterYear != null && Number.isFinite(filterYear);
  const nfsFilters = yearValid ? { dateFilter: buildNfsDateFilter(filterYear!) } : undefined;

  const gastosSummary = await fetchBaseGastosSummary(
    yearValid ? filterYear : undefined,
    forceRefresh
  );

  await delay(300);

  const nfsSummary = await fetchControleNfsTotalsSummary(forceRefresh, nfsFilters);
  const nfsLotFaturamento =
    nfsSummary.faturamentoByLot ?? (await fetchNfsLotFaturamento(toNfsTotalsComputeOptions(nfsFilters)));

  const rows = buildControleGeralFinancialRows(
    nfsSummary,
    gastosSummary,
    nfsLotFaturamento,
    filterYear
  );

  const availableYears = Array.from(
    new Set([...gastosSummary.availableYears, ...(nfsSummary.filterOptions?.yearsEmissao ?? [])])
  ).sort((a, b) => b - a);

  return {
    rows,
    filterYear: yearValid ? filterYear! : null,
    availableYears,
    fetchedAt: new Date().toISOString()
  };
}

export { buildControleGeralFinancialRows };
