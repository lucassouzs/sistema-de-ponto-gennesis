import type { GastosOperacionaisRow } from './ControleGeralGastosOperacionaisPanel';
import {
  getGastosContractAggregateKey,
  inferContractLocalityFromHints,
  isContractExcludedFromPresentation,
  listContractsForLocalities,
  normalizeContractOrderKey,
  normalizeGastosOperacionaisContractName,
  resolveCanonicalGastosContractName,
  resolveVisibleLocalityItems,
  sortContractNamesByCustomOrder,
  sortContractsByCustomOrder,
  GASTOS_OPERACIONAIS_LOCALITIES
} from './gastosOperacionaisContractOrder';
import {
  contractMatchesLocalitiesWithOverrides,
  getEffectiveContractLocality,
  isContractInVisibleLocalities,
  type GastosOperacionaisLocalityOverrideMap
} from './gastosOperacionaisLocalityOverrides';
import {
  shouldShowInGastosNaturezaModal
} from './gastosOperacionaisNaturezaModal';
import {
  normalizeGastosOperacionaisNaturezaKey,
  resolveGastosOperacionaisDfcEntry,
  gastosNaturezaTotalContribution,
  isGastosOperacionaisPositiveCreditNatureza
} from './gastosOperacionaisAllowedNaturezas';

export { gastosNaturezaTotalContribution, isGastosOperacionaisPositiveCreditNatureza };

export type QueryGastosDetailRow = {
  dateISO?: string;
  month: number;
  year: number;
  contract: string;
  total: number;
  polo?: string | null;
};

export type QueryGastosNaturezaDetailRow = {
  dateISO?: string;
  month: number;
  year: number;
  contract: string;
  natureza: string;
  total: number;
};

export type GastosNaturezaAggRow = {
  natureza: string;
  total: number;
  dfcLeafBlockId?: string;
};

export function getGastosNaturezaAggRowKey(row: Pick<GastosNaturezaAggRow, 'natureza'>): string {
  const dfcEntry = resolveGastosOperacionaisDfcEntry(row.natureza);
  return dfcEntry
    ? `${dfcEntry.leafBlockId}:${normalizeGastosOperacionaisNaturezaKey(dfcEntry.canonicalLabel)}`
    : normalizeGastosOperacionaisNaturezaKey(row.natureza) || '—';
}

export type GastosNaturezaModalGroup = {
  leafBlockId: string;
  leafLabel: string;
  rows: GastosNaturezaAggRow[];
  subtotal: number;
};

export type GastosNaturezaModalDfcBranch = {
  branchKey: string;
  label: string;
  leafGroups: GastosNaturezaModalGroup[];
  subtotal: number;
};

export type GastosNaturezaModalDfcTree = {
  rootKey: string;
  rootLabel: string;
  rootSubtotal: number;
  branches: GastosNaturezaModalDfcBranch[];
};

export type GastosOperacionaisFilters = {
  localities: string[];
  polos: string[];
  /** YYYY-MM-DD (fuso local). Vazio = sem limite inferior. */
  periodFrom: string;
  /** YYYY-MM-DD (fuso local). Vazio = sem limite superior. */
  periodTo: string;
  contracts: string[];
};

export const EMPTY_GASTOS_OPERACIONAIS_FILTERS: GastosOperacionaisFilters = {
  localities: [],
  polos: [],
  periodFrom: '',
  periodTo: '',
  contracts: []
};

export function parseGastosPeriodYmd(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function getGastosRowMonthBounds(
  row: Pick<QueryGastosDetailRow, 'month' | 'year'>
): { start: Date; end: Date } {
  const start = new Date(row.year, row.month - 1, 1, 12, 0, 0, 0);
  const end = new Date(row.year, row.month, 0, 12, 0, 0, 0);
  return { start, end };
}

/** Inclui linhas mensais cujo mês civil intersecta o intervalo (dados agregados por mês). */
export function rowIntersectsGastosPeriod(
  row: Pick<QueryGastosDetailRow, 'month' | 'year'>,
  periodFrom: string,
  periodTo: string
): boolean {
  if (!periodFrom && !periodTo) return true;

  const from = periodFrom ? parseGastosPeriodYmd(periodFrom) : null;
  const to = periodTo ? parseGastosPeriodYmd(periodTo) : null;
  if ((periodFrom && !from) || (periodTo && !to)) return true;

  const { start: monthStart, end: monthEnd } = getGastosRowMonthBounds(row);
  const rangeStart = from ?? monthStart;
  const rangeEnd = to ?? monthEnd;
  if (rangeStart > rangeEnd) return false;

  return monthStart <= rangeEnd && monthEnd >= rangeStart;
}

/** Filtra lançamentos pela data de pagamento exata quando `dateISO` está disponível. */
export function rowPaymentDateIntersectsGastosPeriod(
  row: Pick<QueryGastosDetailRow | QueryGastosNaturezaDetailRow, 'dateISO' | 'month' | 'year'>,
  periodFrom: string,
  periodTo: string
): boolean {
  if (row.dateISO) {
    if (!periodFrom && !periodTo) return true;
    const paymentDate = parseGastosPeriodYmd(row.dateISO);
    if (!paymentDate) return false;
    const from = periodFrom ? parseGastosPeriodYmd(periodFrom) : null;
    const to = periodTo ? parseGastosPeriodYmd(periodTo) : null;
    if ((periodFrom && !from) || (periodTo && !to)) return true;
    const rangeStart = from ?? paymentDate;
    const rangeEnd = to ?? paymentDate;
    if (rangeStart > rangeEnd) return false;
    return paymentDate >= rangeStart && paymentDate <= rangeEnd;
  }
  return rowIntersectsGastosPeriod(row, periodFrom, periodTo);
}

/** Deriva meses/anos para a API de faturamento (mesma lógica do filtro multi mês/ano). */
export function deriveEmissaoMonthYearFromPeriod(
  periodFrom: string,
  periodTo: string
): { months: number[]; years: number[] } {
  if (!periodFrom && !periodTo) return { months: [], years: [] };

  const from = periodFrom
    ? parseGastosPeriodYmd(periodFrom)
    : parseGastosPeriodYmd('1900-01-01');
  const to = periodTo ? parseGastosPeriodYmd(periodTo) : parseGastosPeriodYmd('2100-12-31');
  if (!from || !to || from > to) return { months: [], years: [] };

  const months = new Set<number>();
  const years = new Set<number>();
  let cursor = new Date(from.getFullYear(), from.getMonth(), 1, 12, 0, 0, 0);
  const endMarker = new Date(to.getFullYear(), to.getMonth(), 1, 12, 0, 0, 0);

  while (cursor <= endMarker) {
    months.add(cursor.getMonth() + 1);
    years.add(cursor.getFullYear());
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12, 0, 0, 0);
  }

  return {
    months: Array.from(months).sort((a, b) => a - b),
    years: Array.from(years).sort((a, b) => a - b)
  };
}

export function formatGastosPeriodFilterLabel(periodFrom: string, periodTo: string): string | null {
  if (!periodFrom && !periodTo) return null;

  const format = (ymd: string) => {
    const date = parseGastosPeriodYmd(ymd);
    return date ? date.toLocaleDateString('pt-BR') : ymd;
  };

  if (periodFrom && periodTo) return `${format(periodFrom)} – ${format(periodTo)}`;
  if (periodFrom) return `A partir de ${format(periodFrom)}`;
  return `Até ${format(periodTo)}`;
}

export function getSingleCalendarMonthFromPeriod(
  periodFrom: string,
  periodTo: string
): { month: number; year: number } | null {
  if (!periodFrom && !periodTo) return null;

  const from = periodFrom ? parseGastosPeriodYmd(periodFrom) : null;
  const to = periodTo ? parseGastosPeriodYmd(periodTo) : null;
  const start = from ?? to;
  const end = to ?? from;
  if (!start || !end) return null;
  if (start.getFullYear() !== end.getFullYear() || start.getMonth() !== end.getMonth()) {
    return null;
  }

  return { month: start.getMonth() + 1, year: start.getFullYear() };
}

export function getSingleYearFromPeriod(periodFrom: string, periodTo: string): number | null {
  if (!periodFrom && !periodTo) return null;

  const from = periodFrom ? parseGastosPeriodYmd(periodFrom) : null;
  const to = periodTo ? parseGastosPeriodYmd(periodTo) : null;
  const startYear = (from ?? to)?.getFullYear();
  const endYear = (to ?? from)?.getFullYear();
  if (startYear == null || endYear == null || startYear !== endYear) return null;

  return startYear;
}

function gastosContractsMatch(a: string, b: string): boolean {
  return (
    normalizeContractOrderKey(normalizeGastosOperacionaisContractName(a)) ===
    normalizeContractOrderKey(normalizeGastosOperacionaisContractName(b))
  );
}

export function aggregateGastosNaturezaForContract(
  naturezaDetailRows: readonly QueryGastosNaturezaDetailRow[],
  contract: string,
  periodFrom: string,
  periodTo: string
): GastosNaturezaAggRow[] {
  const filtered = naturezaDetailRows.filter((row) => gastosContractsMatch(row.contract, contract));
  return aggregateGastosNaturezaRows(filtered, periodFrom, periodTo);
}

export function aggregateGastosNaturezaRows(
  naturezaDetailRows: readonly QueryGastosNaturezaDetailRow[],
  periodFrom: string,
  periodTo: string
): GastosNaturezaAggRow[] {
  const map = new Map<string, GastosNaturezaAggRow>();

  for (const row of naturezaDetailRows) {
    if (!rowPaymentDateIntersectsGastosPeriod(row, periodFrom, periodTo)) continue;
    if (!shouldShowInGastosNaturezaModal(row.natureza)) continue;

    const dfcEntry = resolveGastosOperacionaisDfcEntry(row.natureza);
    const key = dfcEntry
      ? `${dfcEntry.leafBlockId}:${normalizeGastosOperacionaisNaturezaKey(dfcEntry.canonicalLabel)}`
      : normalizeGastosOperacionaisNaturezaKey(row.natureza) || '—';
    const contribution = gastosNaturezaTotalContribution(row.natureza, row.total);
    const current = map.get(key);
    if (current) {
      current.total += contribution;
    } else {
      map.set(key, {
        natureza: dfcEntry?.canonicalLabel ?? row.natureza,
        total: contribution,
        dfcLeafBlockId: dfcEntry?.leafBlockId
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

export function groupGastosNaturezaModalRows(rows: readonly GastosNaturezaAggRow[]): {
  dfcTrees: GastosNaturezaModalDfcTree[];
  ungrouped: GastosNaturezaAggRow[];
} {
  const groups = new Map<string, GastosNaturezaModalGroup>();
  const ungrouped: GastosNaturezaAggRow[] = [];
  const groupParentPaths = new Map<string, string[]>();

  for (const row of rows) {
    if (!row.dfcLeafBlockId) {
      ungrouped.push(row);
      continue;
    }
    const dfcEntry = resolveGastosOperacionaisDfcEntry(row.natureza);
    const pathLabels = dfcEntry?.pathLabels ? [...dfcEntry.pathLabels] : [row.dfcLeafBlockId];
    const parentPathLabels = pathLabels.slice(0, -1);
    const leafLabel = pathLabels[pathLabels.length - 1] ?? row.dfcLeafBlockId;

    const current = groups.get(row.dfcLeafBlockId);
    if (current) {
      current.rows.push(row);
      current.subtotal += row.total;
    } else {
      groups.set(row.dfcLeafBlockId, {
        leafBlockId: row.dfcLeafBlockId,
        leafLabel,
        rows: [row],
        subtotal: row.total
      });
      groupParentPaths.set(row.dfcLeafBlockId, parentPathLabels);
    }
  }

  const sortedGroups = Array.from(groups.values())
    .map((group) => {
      group.rows.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
      return group;
    })
    .sort((a, b) => a.leafLabel.localeCompare(b.leafLabel, 'pt-BR', { numeric: true }));

  if (sortedGroups.length === 0) {
    return {
      dfcTrees: [],
      ungrouped: ungrouped.sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    };
  }

  const rootMap = new Map<
    string,
    { rootLabel: string; branchMap: Map<string, GastosNaturezaModalDfcBranch> }
  >();

  for (const group of sortedGroups) {
    const parentPathLabels = groupParentPaths.get(group.leafBlockId) ?? [];
    const rootLabel = parentPathLabels[0] ?? '—';
    const rootKey = rootLabel;
    const branchLabel = parentPathLabels[parentPathLabels.length - 1] ?? group.leafBlockId;
    const branchKey = parentPathLabels.slice(1).join('\0') || branchLabel;

    let root = rootMap.get(rootKey);
    if (!root) {
      root = { rootLabel, branchMap: new Map() };
      rootMap.set(rootKey, root);
    }

    const currentBranch = root.branchMap.get(branchKey);
    if (currentBranch) {
      currentBranch.leafGroups.push(group);
      currentBranch.subtotal += group.subtotal;
    } else {
      root.branchMap.set(branchKey, {
        branchKey,
        label: branchLabel,
        leafGroups: [group],
        subtotal: group.subtotal
      });
    }
  }

  const dfcTrees = Array.from(rootMap.entries())
    .map(([rootKey, root]) => {
      const branches = Array.from(root.branchMap.values()).sort((a, b) =>
        a.label.localeCompare(b.label, 'pt-BR', { numeric: true })
      );
      return {
        rootKey,
        rootLabel: root.rootLabel,
        rootSubtotal: branches.reduce((sum, branch) => sum + branch.subtotal, 0),
        branches
      };
    })
    .sort((a, b) => a.rootLabel.localeCompare(b.rootLabel, 'pt-BR', { numeric: true }));

  return {
    dfcTrees,
    ungrouped: ungrouped.sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
  };
}

type QueryContractPayload = {
  contract: string;
  mesesApuracao?: number;
  anoMin?: number;
  anoMax?: number;
  totalAcumulado?: number;
  gastosAcumulado?: number;
};

type GastosApiPayload = {
  queryContractRows?: QueryContractPayload[];
  byQueryContract?: QueryContractPayload[];
  byCostCenter?: Array<{ contract: string; gastosAcumulado: number }>;
  rows?: QueryContractPayload[];
  fetchedAt?: string;
};

function parseSheetCurrency(value: string): number {
  const text = (value ?? '').trim();
  if (!text || text === '-') return 0;

  const normalized = text.replace(/[R$\s]/g, '');
  const parsed = normalized.includes(',')
    ? Number.parseFloat(normalized.replace(/\./g, '').replace(',', '.'))
    : Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function isHeaderContract(contract: string): boolean {
  const key = contract.trim().toLowerCase();
  return !key || key === 'contrato' || key.includes('mes de apuracao');
}

/**
 * A QUERY BASE DE GASTOS (planilha) vale até 31/12/2024.
 * A partir de 01/01/2025 a coluna Gastos usa a mesma fonte do módulo
 * Gastos Operacionais (TOTVS RM).
 */
export const LEGACY_GASTOS_SHEET_LAST_YEAR = 2024;
export const LEGACY_GASTOS_SHEET_LAST_MONTH = 12;
export const TOTVS_GASTOS_FIRST_YEAR = 2025;
export const TOTVS_GASTOS_FIRST_DATE_ISO = '2025-01-01';

/** Linhas da planilha legado com apuração após 31/12/2024 são ignoradas. */
export function isLegacyGastosSheetPeriod(month: number, year: number): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month)) return false;
  if (year < LEGACY_GASTOS_SHEET_LAST_YEAR) return true;
  if (year > LEGACY_GASTOS_SHEET_LAST_YEAR) return false;
  return month <= LEGACY_GASTOS_SHEET_LAST_MONTH;
}

/** Linhas TOTVS (Gastos Operacionais) entram na coluna Gastos a partir de 01/01/2025. */
export function isTotvsGastosPeriod(
  row: Pick<QueryGastosDetailRow, 'dateISO' | 'month' | 'year'>
): boolean {
  if (row.dateISO) {
    return row.dateISO >= TOTVS_GASTOS_FIRST_DATE_ISO;
  }
  if (!Number.isFinite(row.year) || !Number.isFinite(row.month)) return false;
  return !isLegacyGastosSheetPeriod(row.month, row.year);
}

/** Filtra linhas TOTVS para o período a partir de 01/01/2025. */
export function filterTotvsGastosDetailRowsForControleGeral<
  T extends Pick<QueryGastosDetailRow, 'dateISO' | 'month' | 'year'>
>(rows: readonly T[]): T[] {
  return rows.filter((row) => isTotvsGastosPeriod(row));
}

/** Une planilha legado (≤2024) com TOTVS (≥2025) na coluna Gastos. */
export function mergeControleGeralGastosDetailRows(
  legacySheetRows: readonly QueryGastosDetailRow[],
  totvsRows: readonly QueryGastosDetailRow[]
): QueryGastosDetailRow[] {
  const totvsFrom2025 = filterTotvsGastosDetailRowsForControleGeral(totvsRows).map((row) => ({
    ...row,
    contract: resolveCanonicalGastosContractName(row.contract)
  }));

  return [
    ...legacySheetRows.map((row) => ({
      ...row,
      contract: resolveCanonicalGastosContractName(row.contract)
    })),
    ...totvsFrom2025
  ];
}

export function buildGastosDetailRowsFromSheetRows(rows: string[][]): QueryGastosDetailRow[] {
  const parsed: QueryGastosDetailRow[] = [];

  for (const row of rows) {
    const contract = resolveCanonicalGastosContractName((row[2] ?? '').trim());
    if (!contract || isHeaderContract(contract) || isContractExcludedFromPresentation(contract)) {
      continue;
    }

    const month = Number.parseInt((row[0] ?? '').trim(), 10);
    const year = Number.parseInt((row[1] ?? '').trim(), 10);
    const total = parseSheetCurrency(row[3] ?? '');
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    if (!Number.isFinite(year) || year < 1900 || year > 2100) continue;
    if (!isLegacyGastosSheetPeriod(month, year)) continue;
    if (total === 0) continue;

    parsed.push({ month, year, contract, total });
  }

  return parsed;
}

function resolveDetailRowPolo(row: QueryGastosDetailRow): string {
  return (row.polo ?? '').trim() || '—';
}

function buildPoloByContractMap(detailRows: QueryGastosDetailRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of detailRows) {
    if (!map.has(row.contract)) {
      map.set(row.contract, resolveDetailRowPolo(row));
    }
  }
  return map;
}

export type GastosOperacionaisFilterOptions = {
  years: number[];
  contracts: string[];
};

export type GastosOperacionaisPoloFilterOptions = GastosOperacionaisFilterOptions & {
  polos: string[];
};

export function getGastosPoloFilterOptions(
  detailRows: QueryGastosDetailRow[],
  filters?: Pick<GastosOperacionaisFilters, 'polos'>
): GastosOperacionaisPoloFilterOptions {
  const poloByContract = buildPoloByContractMap(detailRows);
  const polos = Array.from(new Set(poloByContract.values())).sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  );
  const years = Array.from(new Set(detailRows.map((row) => row.year))).sort((a, b) => b - a);
  const allContracts = Array.from(new Set(detailRows.map((row) => row.contract)));
  const contracts = sortContractNamesByCustomOrder(
    allContracts.filter((contract) => {
      if (!filters?.polos?.length) return true;
      return filters.polos.includes(poloByContract.get(contract) ?? '—');
    })
  );

  return { polos, years, contracts };
}

export function getGastosFilterOptions(
  detailRows: QueryGastosDetailRow[],
  filters?: Pick<GastosOperacionaisFilters, 'localities'>,
  localityOverrides: GastosOperacionaisLocalityOverrideMap = {},
  visibleLocalities?: readonly string[]
): GastosOperacionaisFilterOptions {
  const years = Array.from(new Set(detailRows.map((row) => row.year))).sort((a, b) => b - a);
  const allContracts = Array.from(new Set(detailRows.map((row) => row.contract)));
  const contracts = sortContractNamesByCustomOrder(
    allContracts.filter((contract) => {
      if (!isContractInVisibleLocalities(contract, visibleLocalities, localityOverrides)) {
        return false;
      }
      if (!filters?.localities?.length) return true;
      return contractMatchesLocalitiesWithOverrides(contract, filters.localities, localityOverrides);
    })
  );

  return { years, contracts };
}

export function filterGastosDetailRowsByPolo(
  detailRows: QueryGastosDetailRow[],
  filters: GastosOperacionaisFilters
): QueryGastosDetailRow[] {
  return detailRows.filter((row) => {
    if (filters.polos.length && !filters.polos.includes(resolveDetailRowPolo(row))) {
      return false;
    }
    if (!rowPaymentDateIntersectsGastosPeriod(row, filters.periodFrom, filters.periodTo)) return false;
    if (filters.contracts.length && !filters.contracts.includes(row.contract)) return false;
    return true;
  });
}

export function filterGastosDetailRows(
  detailRows: QueryGastosDetailRow[],
  filters: GastosOperacionaisFilters,
  localityOverrides: GastosOperacionaisLocalityOverrideMap = {},
  visibleLocalities?: readonly string[],
  extraContracts?: readonly string[]
): QueryGastosDetailRow[] {
  const extraKeys = new Set(
    (extraContracts ?? [])
      .map((name) => getGastosContractAggregateKey(name))
      .filter((key) => key.length > 0)
  );

  return detailRows.filter((row) => {
    const isExtra = extraKeys.has(getGastosContractAggregateKey(row.contract));
    if (
      !isExtra &&
      !isContractInVisibleLocalities(row.contract, visibleLocalities, localityOverrides)
    ) {
      return false;
    }
    if (
      !isExtra &&
      filters.localities.length &&
      !contractMatchesLocalitiesWithOverrides(row.contract, filters.localities, localityOverrides)
    ) {
      return false;
    }
    if (!rowPaymentDateIntersectsGastosPeriod(row, filters.periodFrom, filters.periodTo)) return false;
    if (filters.contracts.length && !filters.contracts.includes(row.contract)) return false;
    return true;
  });
}

/** Mantém apenas linhas cujo contrato casa com a allowlist (chave canônica). */
export function filterRowsByAllowedContracts<T extends { contract: string }>(
  rows: readonly T[],
  allowedContracts: readonly string[] | undefined
): T[] {
  if (!allowedContracts?.length) return rows.slice();
  const allowedKeys = new Set(
    allowedContracts
      .map((name) => getGastosContractAggregateKey(name))
      .filter((key) => key.length > 0)
  );
  if (allowedKeys.size === 0) return rows.slice();
  return rows.filter((row) => allowedKeys.has(getGastosContractAggregateKey(row.contract)));
}

export function aggregateGastosDetailRows(detailRows: QueryGastosDetailRow[]): GastosOperacionaisRow[] {
  const aggregates = new Map<
    string,
    {
      contract: string;
      totalAcumulado: number;
      months: Set<string>;
      years: Set<number>;
      polo: string | null;
    }
  >();

  for (const row of detailRows) {
    const contract = resolveCanonicalGastosContractName(row.contract);
    const key = getGastosContractAggregateKey(contract);
    const current = aggregates.get(key) ?? {
      contract,
      totalAcumulado: 0,
      months: new Set<string>(),
      years: new Set<number>(),
      polo: row.polo?.trim() || null
    };
    current.totalAcumulado += row.total;
    current.months.add(`${row.year}-${row.month}`);
    current.years.add(row.year);
    if (!current.polo && row.polo?.trim()) {
      current.polo = row.polo.trim();
    }
    aggregates.set(key, current);
  }

  const result = Array.from(aggregates.values())
    .map((data) => {
      const years = Array.from(data.years).sort((a, b) => a - b);
      return {
        rowKey: data.contract,
        contract: data.contract,
        mesesApuracao: data.months.size,
        anoMin: years[0] ?? 0,
        anoMax: years[years.length - 1] ?? 0,
        totalAcumulado: data.totalAcumulado,
        polo: data.polo
      };
    })
    .filter((row) => row.totalAcumulado !== 0);

  return sortContractsByCustomOrder(result);
}

/**
 * Garante que contratos do catálogo (ex.: DF/GO - ADM LOCAL) apareçam na tabela
 * mesmo sem linhas na planilha de gastos — necessário para restaurar ocultos.
 * Também inclui contratos cadastrados no banco e chaves ocultas salvas localmente.
 */
export type GastosMergeDatabaseContract = {
  name: string;
  costCenter?: { code?: string; name?: string } | null;
};

function mergeContractNameIntoRows(
  byKey: Map<string, GastosOperacionaisRow>,
  contract: string
): void {
  const canonical = normalizeGastosOperacionaisContractName(contract);
  const key = normalizeContractOrderKey(canonical);
  if (byKey.has(key)) return;

  byKey.set(key, {
    rowKey: canonical,
    contract: canonical,
    mesesApuracao: 0,
    anoMin: 0,
    anoMax: 0,
    totalAcumulado: 0
  });
}

function shouldMergeContractForVisibleLocalities(
  contract: string,
  visibleLocalities: readonly string[] | undefined,
  localityOverrides: GastosOperacionaisLocalityOverrideMap,
  costCenter?: { code?: string; name?: string } | null
): boolean {
  if (!visibleLocalities?.length) return true;

  const key = normalizeContractOrderKey(contract);
  const effective = getEffectiveContractLocality(contract, localityOverrides);
  if (effective !== 'OUTROS') {
    return visibleLocalities.includes(effective);
  }

  const inferred = inferContractLocalityFromHints(contract, costCenter);
  if (inferred) {
    return visibleLocalities.includes(inferred);
  }

  // Sem localidade conhecida: mantém na lista para poder atribuir depois.
  return true;
}

export function mergeCatalogContractsIntoGastosRows(
  rows: GastosOperacionaisRow[],
  visibleLocalities?: readonly string[],
  options?: {
    databaseContracts?: readonly GastosMergeDatabaseContract[];
    spreadsheetContracts?: readonly string[];
    excludedContractKeys?: readonly string[];
    resolveExcludedLabel?: (key: string) => string | undefined;
    localityOverrides?: GastosOperacionaisLocalityOverrideMap;
    localitiesCatalog?: ReadonlyArray<{ key: string; label: string }>;
    /** Quando definido, só esses contratos entram no merge (ignora catálogo completo). */
    allowedContracts?: readonly string[];
    /** Contratos adicionais sempre mesclados (ex.: MAPA no Controle Geral). */
    extraContracts?: readonly string[];
  }
): GastosOperacionaisRow[] {
  const byKey = new Map<string, GastosOperacionaisRow>();
  for (const row of rows) {
    byKey.set(normalizeContractOrderKey(row.contract), row);
  }

  const localityOverrides = options?.localityOverrides ?? {};
  const namesToMerge = new Set<string>();

  if (options?.allowedContracts?.length) {
    for (const contract of options.allowedContracts) {
      const name = contract?.trim();
      if (name) namesToMerge.add(name);
    }
  } else {
    for (const contract of listContractsForLocalities(
      visibleLocalities,
      options?.localitiesCatalog
    )) {
      namesToMerge.add(contract);
    }

    for (const entry of options?.databaseContracts ?? []) {
      const name = entry.name?.trim();
      if (!name) continue;
      if (!shouldMergeContractForVisibleLocalities(name, visibleLocalities, localityOverrides, entry.costCenter)) {
        continue;
      }
      namesToMerge.add(name);
    }

    for (const contract of options?.spreadsheetContracts ?? []) {
      const name = contract?.trim();
      if (!name) continue;
      if (!shouldMergeContractForVisibleLocalities(name, visibleLocalities, localityOverrides)) {
        continue;
      }
      namesToMerge.add(name);
    }

    for (const excludedKey of options?.excludedContractKeys ?? []) {
      const label = options?.resolveExcludedLabel?.(excludedKey)?.trim() || excludedKey.trim();
      if (label) namesToMerge.add(label);
    }

    for (const contract of options?.extraContracts ?? []) {
      const name = contract?.trim();
      if (name) namesToMerge.add(name);
    }
  }

  for (const contract of Array.from(namesToMerge)) {
    mergeContractNameIntoRows(byKey, contract);
  }

  const merged = sortContractsByCustomOrder(Array.from(byKey.values()));
  return options?.allowedContracts?.length
    ? filterRowsByAllowedContracts(merged, options.allowedContracts)
    : merged;
}

export function buildGastosRowsFromSheetRows(rows: string[][]): GastosOperacionaisRow[] {
  return aggregateGastosDetailRows(buildGastosDetailRowsFromSheetRows(rows));
}

export type GastosLocalityGroup = {
  localityKey: string;
  localityLabel: string;
  rows: GastosOperacionaisRow[];
  subtotal: number;
};

export function groupGastosRowsByLocality(
  rows: GastosOperacionaisRow[],
  localityOverrides: GastosOperacionaisLocalityOverrideMap = {},
  visibleLocalities?: readonly string[],
  localitiesCatalog?: ReadonlyArray<{ key: string; label: string }>
): GastosLocalityGroup[] {
  const buckets = new Map<string, GastosOperacionaisRow[]>();

  for (const row of rows) {
    const locality = getEffectiveContractLocality(row.contract, localityOverrides);
    const current = buckets.get(locality) ?? [];
    current.push(row);
    buckets.set(locality, current);
  }

  const groups: GastosLocalityGroup[] = [];

  for (const locality of resolveVisibleLocalityItems(visibleLocalities, localitiesCatalog)) {
    const groupRows = buckets.get(locality.key);
    if (!groupRows?.length) continue;

    groups.push({
      localityKey: locality.key,
      localityLabel: locality.label,
      rows: sortContractsByCustomOrder(groupRows),
      subtotal: Math.abs(groupRows.reduce((sum, row) => sum + row.totalAcumulado, 0))
    });
    buckets.delete(locality.key);
  }

  const outros = buckets.get('OUTROS');
  if (outros?.length) {
    groups.push({
      localityKey: 'OUTROS',
      localityLabel: 'Sem localidade',
      rows: sortContractsByCustomOrder(outros),
      subtotal: Math.abs(outros.reduce((sum, row) => sum + row.totalAcumulado, 0))
    });
    buckets.delete('OUTROS');
  }

  // Contratos extras fora das localidades padrão (ex.: MAPA / Nordeste no Controle Geral).
  for (const locality of GASTOS_OPERACIONAIS_LOCALITIES) {
    const groupRows = buckets.get(locality.key);
    if (!groupRows?.length) continue;
    groups.push({
      localityKey: locality.key,
      localityLabel: locality.label,
      rows: sortContractsByCustomOrder(groupRows),
      subtotal: Math.abs(groupRows.reduce((sum, row) => sum + row.totalAcumulado, 0))
    });
    buckets.delete(locality.key);
  }

  const leftoverOutros = buckets.get('OUTROS');
  if (leftoverOutros?.length) {
    groups.push({
      localityKey: 'OUTROS',
      localityLabel: 'Outros',
      rows: sortContractsByCustomOrder(leftoverOutros),
      subtotal: Math.abs(leftoverOutros.reduce((sum, row) => sum + row.totalAcumulado, 0))
    });
  }

  return groups;
}

export type GastosPoloGroup = {
  poloKey: string;
  poloLabel: string;
  rows: GastosOperacionaisRow[];
  subtotal: number;
};

export function groupGastosRowsByPolo(rows: GastosOperacionaisRow[]): GastosPoloGroup[] {
  const buckets = new Map<string, GastosOperacionaisRow[]>();

  for (const row of rows) {
    const key = (row.polo ?? '').trim() || '—';
    const current = buckets.get(key) ?? [];
    current.push(row);
    buckets.set(key, current);
  }

  return Array.from(buckets.entries())
    .map(([poloKey, groupRows]) => ({
      poloKey,
      poloLabel: poloKey === '—' ? 'Sem polo' : poloKey,
      rows: sortContractsByCustomOrder(groupRows),
      subtotal: Math.abs(groupRows.reduce((sum, row) => sum + row.totalAcumulado, 0))
    }))
    .sort((a, b) => a.poloLabel.localeCompare(b.poloLabel, 'pt-BR'));
}

export function buildGastosRowsFromApiPayload(payload?: GastosApiPayload): GastosOperacionaisRow[] {
  if (!payload) return [];

  const source: QueryContractPayload[] = payload.queryContractRows?.length
    ? payload.queryContractRows
    : payload.byQueryContract?.length
      ? payload.byQueryContract
      : payload.rows?.length
        ? payload.rows
        : (payload.byCostCenter ?? []).map((item) => ({
            contract: item.contract,
            totalAcumulado: item.gastosAcumulado
          }));

  return sortContractsByCustomOrder(
    source
      .map((item) => ({
        rowKey: normalizeGastosOperacionaisContractName(item.contract),
        contract: normalizeGastosOperacionaisContractName(item.contract),
        mesesApuracao: item.mesesApuracao ?? 0,
        anoMin: item.anoMin ?? 0,
        anoMax: item.anoMax ?? 0,
        totalAcumulado: item.totalAcumulado ?? item.gastosAcumulado ?? 0
      }))
      .filter(
        (row) => row.totalAcumulado !== 0 && !isContractExcludedFromPresentation(row.contract)
      )
  );
}
