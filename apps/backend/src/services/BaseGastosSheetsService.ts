import {
  NFS_TAB_LOT_BREAKDOWN,
  tabHasLotBreakdown
} from '../lib/controleGeralLotBreakdown';
import {
  buildGastosLookupKeys,
  normalizeCostCenterKey
} from '../lib/controleGeralGastosMapping';
import { CONTROLE_NFS_SHEET_TABS } from './ControleNfsSheetsService';

const BASE_GASTOS_SHEET_NAME = 'QUERY BASE DE GASTOS';
const DEFAULT_SPREADSHEET_ID = '1CDe_Sh58Z3gIGcHishuWrrPC58iIdXRUFXld3rdYpZ0';
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Coluna A — mês de apuração */
const COL_MONTH = 0;
/** Coluna B — ano de apuração */
const COL_YEAR = 1;
/** Coluna C — contrato / centro de custo */
const COL_CONTRACT = 2;
/** Coluna D — total do mês */
const COL_TOTAL = 3;

type GvizCell = { v?: string | number | boolean | null; f?: string | null } | null;
type GvizRow = { c?: GvizCell[] | null };
type GvizTable = { rows?: GvizRow[] };
type GvizResponse = { status?: string; table?: GvizTable };

export type BaseGastosByTabSummary = {
  tabKey: string;
  label: string;
  gastosAcumulado: number;
  gastosAnual: number;
};

export type BaseGastosByLotSummary = {
  tabKey: string;
  lotKey: string;
  label: string;
  gastosAcumulado: number;
  gastosAnual: number;
};

export type BaseGastosByCostCenterSummary = {
  contract: string;
  gastosAcumulado: number;
};

/** Somatório por contrato (aba QUERY BASE DE GASTOS — 4 colunas). */
export type QueryBaseGastosByContractSummary = {
  contract: string;
  mesesApuracao: number;
  anoMin: number;
  anoMax: number;
  totalAcumulado: number;
};

export type BaseGastosSummary = {
  byTab: BaseGastosByTabSummary[];
  byLot: BaseGastosByLotSummary[];
  byCostCenter: BaseGastosByCostCenterSummary[];
  byQueryContract: QueryBaseGastosByContractSummary[];
  availableYears: number[];
  fetchedAt: string;
};

type ParsedGastosRow = {
  month: number;
  year: number;
  contract: string;
  total: number;
};

/** Bump ao mudar aba/colunas para invalidar cache em memória do servidor. */
const CACHE_KEY = 'query-base-de-gastos-v3-signed-sum';

type CacheEntry = {
  key: string;
  expiresAt: number;
  rows: ParsedGastosRow[];
  availableYears: number[];
};
let cache: CacheEntry | null = null;

function spreadsheetId(): string {
  return (process.env.CONTROLE_NFS_SPREADSHEET_ID ?? DEFAULT_SPREADSHEET_ID).trim();
}

function parseGvizPayload(raw: string): GvizResponse {
  const match = raw.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\)\s*;?\s*$/);
  if (!match) {
    throw new Error('Resposta inválida da planilha Google.');
  }
  return JSON.parse(match[1]) as GvizResponse;
}

function parseNumericCell(cell: GvizCell | undefined): number | null {
  if (!cell) return null;
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return cell.v;

  const text = (cell.f ?? (cell.v != null ? String(cell.v) : '')).trim();
  if (!text || text === '-') return null;

  const normalized = text.replace(/[R$\s]/g, '').trim();
  if (!normalized || normalized === '-') return null;

  const parsed = normalized.includes(',')
    ? parseFloat(normalized.replace(/\./g, '').replace(',', '.'))
    : parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntegerCell(cell: GvizCell | undefined): number | null {
  const numeric = parseNumericCell(cell);
  if (numeric == null) return null;
  const rounded = Math.round(numeric);
  return Number.isFinite(rounded) ? rounded : null;
}

function isHeaderRow(contract: string): boolean {
  const key = normalizeCostCenterKey(contract);
  return !key || key === 'contrato' || key.includes('dia do mes') || key.includes('mes de apuracao');
}

function parseGastosRows(table: GvizTable): ParsedGastosRow[] {
  const parsed: ParsedGastosRow[] = [];

  for (const row of table.rows ?? []) {
    const cells = row.c ?? [];
    const contract = String(cells[COL_CONTRACT]?.v ?? cells[COL_CONTRACT]?.f ?? '').trim();
    if (!contract || isHeaderRow(contract)) continue;

    const month = parseIntegerCell(cells[COL_MONTH]);
    const year = parseIntegerCell(cells[COL_YEAR]);
    const total = parseNumericCell(cells[COL_TOTAL]);
    if (month == null || year == null || total == null || total === 0) continue;
    if (month < 1 || month > 12 || year < 1900 || year > 2100) continue;

    parsed.push({
      month,
      year,
      contract,
      total
    });
  }

  return parsed;
}

async function fetchSheetWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json,text/plain,*/*' }
    });

    if (response.ok) {
      return response;
    }

    lastError = new Error(`Falha ao consultar a aba QUERY BASE DE GASTOS (${response.status}).`);

    if (response.status === 429 && attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 800));
      continue;
    }

    throw lastError;
  }

  throw lastError ?? new Error('Falha ao consultar a aba QUERY BASE DE GASTOS.');
}

async function fetchParsedRows(forceRefresh = false): Promise<{
  rows: ParsedGastosRow[];
  availableYears: number[];
}> {
  if (!forceRefresh && cache && cache.key === CACHE_KEY && cache.expiresAt > Date.now()) {
    return { rows: cache.rows, availableYears: cache.availableYears };
  }

  const sheetParam = encodeURIComponent(BASE_GASTOS_SHEET_NAME);
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId()}/gviz/tq?tqx=out:json&sheet=${sheetParam}`;
  const response = await fetchSheetWithRetry(url);

  const raw = await response.text();
  const payload = parseGvizPayload(raw);
  if (payload.status !== 'ok' || !payload.table) {
    throw new Error('A aba QUERY BASE DE GASTOS retornou dados inválidos.');
  }

  const rows = parseGastosRows(payload.table);
  const availableYears = Array.from(new Set(rows.map((row) => row.year))).sort((a, b) => b - a);

  cache = { key: CACHE_KEY, rows, availableYears, expiresAt: Date.now() + CACHE_TTL_MS };
  return { rows, availableYears };
}

function sumGastosForTab(
  rows: ParsedGastosRow[],
  tabKey: string,
  filterYear?: number
): { acumulado: number; anual: number } {
  if (tabHasLotBreakdown(tabKey)) {
    return { acumulado: 0, anual: 0 };
  }

  const lookup = buildGastosLookupKeys();
  let acumulado = 0;
  let anual = 0;

  for (const row of rows) {
    const mappedTab = lookup.get(normalizeCostCenterKey(row.contract));
    if (mappedTab !== tabKey) continue;

    acumulado += row.total;
    if (filterYear != null && row.year === filterYear) {
      anual += row.total;
    }
  }

  return { acumulado, anual };
}

function sumGastosForLotCostCenters(
  rows: ParsedGastosRow[],
  costCenters: readonly string[],
  filterYear?: number
): { acumulado: number; anual: number } {
  const allowed = new Set(costCenters.map((center) => normalizeCostCenterKey(center)));
  let acumulado = 0;
  let anual = 0;

  for (const row of rows) {
    if (!allowed.has(normalizeCostCenterKey(row.contract))) continue;

    acumulado += row.total;
    if (filterYear != null && row.year === filterYear) {
      anual += row.total;
    }
  }

  return { acumulado, anual };
}

function buildGastosByCostCenter(rows: ParsedGastosRow[]): BaseGastosByCostCenterSummary[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    totals.set(row.contract, (totals.get(row.contract) ?? 0) + row.total);
  }

  return Array.from(totals.entries())
    .map(([contract, gastosAcumulado]) => ({ contract, gastosAcumulado }))
    .sort((a, b) => b.gastosAcumulado - a.gastosAcumulado);
}

function buildQueryByContract(rows: ParsedGastosRow[]): QueryBaseGastosByContractSummary[] {
  const aggregates = new Map<
    string,
    { totalAcumulado: number; months: Set<string>; years: Set<number> }
  >();

  for (const row of rows) {
    const current = aggregates.get(row.contract) ?? {
      totalAcumulado: 0,
      months: new Set<string>(),
      years: new Set<number>()
    };
    current.totalAcumulado += row.total;
    current.months.add(`${row.year}-${row.month}`);
    current.years.add(row.year);
    aggregates.set(row.contract, current);
  }

  return Array.from(aggregates.entries())
    .map(([contract, data]) => {
      const years = Array.from(data.years).sort((a, b) => a - b);
      return {
        contract,
        mesesApuracao: data.months.size,
        anoMin: years[0] ?? 0,
        anoMax: years[years.length - 1] ?? 0,
        totalAcumulado: data.totalAcumulado
      };
    })
    .sort((a, b) => b.totalAcumulado - a.totalAcumulado);
}

export async function fetchBaseGastosSummary(
  filterYear?: number,
  forceRefresh = false
): Promise<BaseGastosSummary> {
  const { rows, availableYears } = await fetchParsedRows(forceRefresh);

  const byTab = CONTROLE_NFS_SHEET_TABS.map((tab) => {
    const totals = sumGastosForTab(rows, tab.key, filterYear);
    return {
      tabKey: tab.key,
      label: tab.label,
      gastosAcumulado: totals.acumulado,
      gastosAnual: filterYear != null ? totals.anual : totals.acumulado
    };
  });

  const byLot = NFS_TAB_LOT_BREAKDOWN.flatMap((config) =>
    config.lots.map((lot) => {
      const totals = sumGastosForLotCostCenters(rows, lot.gastosCostCenters, filterYear);
      return {
        tabKey: config.tabKey,
        lotKey: lot.lotKey,
        label: lot.label,
        gastosAcumulado: totals.acumulado,
        gastosAnual: filterYear != null ? totals.anual : totals.acumulado
      };
    })
  );

  return {
    byTab,
    byLot,
    byCostCenter: buildGastosByCostCenter(rows),
    byQueryContract: buildQueryByContract(rows),
    availableYears,
    fetchedAt: new Date().toISOString()
  };
}

export function clearBaseGastosCache(): void {
  cache = null;
}

/** Linhas agregadas por contrato — compatível com respostas antigas (só byCostCenter). */
export function resolveQueryContractRows(
  summary: Pick<BaseGastosSummary, 'byQueryContract' | 'byCostCenter'>
): QueryBaseGastosByContractSummary[] {
  if (summary.byQueryContract?.length) {
    return summary.byQueryContract;
  }

  return (summary.byCostCenter ?? []).map((item) => ({
    contract: item.contract,
    mesesApuracao: 0,
    anoMin: 0,
    anoMax: 0,
    totalAcumulado: item.gastosAcumulado
  }));
}
