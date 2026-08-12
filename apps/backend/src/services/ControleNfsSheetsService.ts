import {
  lotCellMatchesValues,
  NFS_TAB_LOT_BREAKDOWN,
  tabHasLotBreakdown,
  type LotBreakdownColumn,
  type LotBreakdownTabConfig
} from '../lib/controleGeralLotBreakdown';
import { NFS_TAB_GASTOS_COST_CENTERS } from '../lib/controleGeralGastosMapping';
import { normalizeGastosOperacionaisContractName } from '../lib/gastosOperacionaisContractAliases';
import { isExcludedNotaForTab } from '../lib/controleNfsExcludedNotes';

export type ControleNfsSheetTab = {
  key: string;
  label: string;
  sheetName: string;
};

export type ControleNfsSheetData = {
  tab: ControleNfsSheetTab;
  spreadsheetId: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
  fetchedAt: string;
};

export type ControleNfsValorBrutoSummary = {
  total: number;
  tabCount: number;
  tabsWithData: number;
  fetchedAt: string;
};

export type ControleNfsTotalsSummary = {
  valorBruto: number;
  valorBrutoNaoPago: number;
  valorRecebido: number;
  valorLiquido: number;
  totalImpostos: number;
  contaVinculada: number;
  tabCount: number;
  tabsWithValorBruto: number;
  tabsWithValorBrutoNaoPago: number;
  tabsWithValorRecebido: number;
  tabsWithValorLiquido: number;
  tabsWithImpostos: number;
  tabsWithContaVinculada: number;
  byTab: ControleNfsTabTotals[];
  faturamentoByLot?: ControleNfsLotFaturamento[];
  filterOptions?: ControleNfsFilterOptions;
  fetchedAt: string;
};

export type ControleNfsTabTotals = {
  tabKey: string;
  label: string;
  valorBruto: number;
  valorBrutoNaoPago: number;
  valorRecebido: number;
  valorLiquido: number;
  totalImpostos: number;
  contaVinculada: number;
  /** False quando a aba não tem a coluna Conta Vinculada. */
  hasContaVinculadaColumn: boolean;
};

export type ControleNfsCardsDateFilter = {
  emissaoDateFrom?: string;
  emissaoDateTo?: string;
  recebimentoDateFrom?: string;
  recebimentoDateTo?: string;
};

type ControleNfsCardsDateBasis = 'emissao' | 'recebimento';

export type ApuracaoMonthYearFilter = {
  months?: number[];
  years?: number[];
};

export type EmissaoApuracaoFilter = ApuracaoMonthYearFilter;
export type RecebimentoApuracaoFilter = ApuracaoMonthYearFilter;

/** Períodos independentes: emissão → bruto/líquido; recebimento → recebido. */
export type ControleNfsIndependentPeriodFilter = {
  emissaoDateFrom?: string;
  emissaoDateTo?: string;
  recebimentoDateFrom?: string;
  recebimentoDateTo?: string;
};

export type NfsTotalsComputeOptions = {
  dateFilter?: ControleNfsCardsDateFilter;
  /**
   * Quando definido, aplica intervalos de forma independente:
   * emissão → bruto/líquido; recebimento → recebido.
   * Não usa o AND de `dateFilter` (emissão ∩ recebimento).
   */
  independentPeriodFilter?: ControleNfsIndependentPeriodFilter;
  emissaoApuracaoFilter?: EmissaoApuracaoFilter;
  recebimentoApuracaoFilter?: RecebimentoApuracaoFilter;
};

export type ControleNfsTotalsFilters = {
  tabKeys?: string[];
  dateFilter?: ControleNfsCardsDateFilter;
  independentPeriodFilter?: ControleNfsIndependentPeriodFilter;
  emissaoApuracaoFilter?: EmissaoApuracaoFilter;
  recebimentoApuracaoFilter?: RecebimentoApuracaoFilter;
};

export type ControleNfsFilterOptions = {
  yearsEmissao: number[];
  yearsRecebimento: number[];
};

const IMPOSTO_COLUMN_KEYS = ['irrf', 'iss', 'inss', 'csll', 'pis', 'cofins'] as const;

const CONTROLE_NFS_EXCLUDED_COLUMN_KEYS = new Set([
  'mes recebimento',
  'ano recebimento',
  'mes emissao',
  'ano emissao'
]);

const DEFAULT_SPREADSHEET_ID = '1CDe_Sh58Z3gIGcHishuWrrPC58iIdXRUFXld3rdYpZ0';

export const CONTROLE_NFS_SHEET_TABS: ControleNfsSheetTab[] = [
  { key: 'bbgo', label: 'BBGO', sheetName: 'BBGO' },
  { key: 'codevasf', label: 'CODEVASF', sheetName: 'CODEVASF' },
  {
    key: 'capitania-fluvial',
    label: 'CAPITANIA FLUVIAL',
    sheetName: 'CAPITANIA FLUVIAL'
  },
  { key: 'confea', label: 'CONFEA', sheetName: 'CONFEA' },
  { key: 'mapa', label: 'MAPA', sheetName: 'MAPA' },
  { key: 'fhe-df', label: 'FHE DF', sheetName: 'FHE DF' },
  { key: 'hfa', label: 'HFA', sheetName: 'HFA' },
  { key: 'itamaraty', label: 'ITAMARATY', sheetName: 'ITAMARATY' },
  { key: 'jfgo', label: 'JFGO', sheetName: 'JFGO' },
  {
    key: 'ministerio-da-cultura',
    label: 'MINISTERIO DA CULTURA',
    sheetName: 'MINISTÉRIO DA CULTURA'
  },
  { key: 'pgr', label: 'PGR', sheetName: 'PGR' },
  { key: 'sedes', label: 'SEDES', sheetName: 'SEDES' },
  {
    key: 'seinfra-aparecida',
    label: 'SEINFRA - APARECIDA',
    sheetName: 'SEINFRA - APARECIDA'
  },
  { key: 'senac-df', label: 'SENAC DF', sheetName: 'SENAC DF' },
  { key: 'ses', label: 'SES', sheetName: 'SES' },
  { key: 'stm', label: 'STM', sheetName: 'STM' },
  {
    key: 'tjgo-manutencao',
    label: 'TJGO MANUTENÇÃO',
    sheetName: 'TJGO MANUTENÇÃO'
  },
  { key: 'tjgo-retrofit', label: 'TJGO RETROFIT', sheetName: 'TJGO RETROFIT' },
  { key: 'ufg', label: 'UFG', sheetName: 'UFG' }
];

type GvizCell = { v?: string | number | boolean | null; f?: string | null } | null;
type GvizRow = { c?: GvizCell[] | null };
type GvizTable = {
  cols?: Array<{ label?: string | null; id?: string | null }>;
  rows?: GvizRow[];
};
type GvizResponse = {
  status?: string;
  table?: GvizTable;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
type SheetCacheEntry = {
  expiresAt: number;
  data: ControleNfsSheetData;
  processedHeaders: string[];
  processedRows: string[][];
};
const sheetCache = new Map<string, SheetCacheEntry>();
let totalsSummaryCache: { expiresAt: number; data: ControleNfsTotalsSummary } | null = null;
/** Invalida caches em memória após mudanças no cálculo (ex.: Conta Vinculada / aba MAPA). */
const NFS_TOTALS_CACHE_VERSION = 7;
let loadedNfsTotalsCacheVersion = 0;

function invalidateStaleNfsTotalsCache(): void {
  if (loadedNfsTotalsCacheVersion === NFS_TOTALS_CACHE_VERSION) return;
  loadedNfsTotalsCacheVersion = NFS_TOTALS_CACHE_VERSION;
  totalsSummaryCache = null;
}

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

function formatCell(cell: GvizCell | undefined): string {
  if (!cell) return '';
  const formatted = cell.f?.trim();
  if (formatted) return formatted;
  const value = cell.v;
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value).trim();
}

function normalizeHeader(label: string | null | undefined, index: number): string {
  const text = (label ?? '').trim();
  return text || `Coluna ${index + 1}`;
}

function isBlankCell(value: string): boolean {
  const text = value.trim();
  return !text || text === '-' || text === 'R$ -' || text === '—';
}

function normalizeHeaderKey(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function findNotaFiscalColumnIndex(headers: string[]): number {
  const exactNf = headers.findIndex((header) => normalizeHeaderKey(header) === 'nf');
  if (exactNf >= 0) return exactNf;

  return headers.findIndex((header) => normalizeHeaderKey(header).includes('nota fiscal'));
}

function findValorBrutoColumnIndex(headers: string[]): number {
  return headers.findIndex((header) => normalizeHeaderKey(header).includes('valor bruto'));
}

function findValorRecebidoColumnIndex(headers: string[]): number {
  // Preferir cabeçalho exato "RECEBIDO" (coluna V da planilha), não confundir com datas.
  const exact = headers.findIndex((header) => normalizeHeaderKey(header) === 'recebido');
  if (exact >= 0) return exact;
  return headers.findIndex((header) => normalizeHeaderKey(header) === 'valor recebido');
}

function findValorLiquidoColumnIndex(headers: string[]): number {
  return headers.findIndex((header) => {
    const key = normalizeHeaderKey(header);
    return key === 'liquido' || key === 'valor liquido';
  });
}

function findContaVinculadaColumnIndex(headers: string[], rows?: string[][]): number {
  const candidates = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => {
      const key = normalizeHeaderKey(header);
      return key === 'conta vinculada' || key.includes('conta vinculada') || key.includes('contavinculada');
    });

  if (candidates.length === 0) return -1;
  if (candidates.length === 1 || !rows?.length) return candidates[0].index;

  // Há abas com duas colunas "CONTA VINCULADA" (número + texto auxiliar).
  // Preferir a que tiver mais valores monetários preenchidos.
  let bestIndex = candidates[0].index;
  let bestScore = -1;
  for (const { index } of candidates) {
    let score = 0;
    for (const row of rows) {
      if (parseCurrencyCell(row[index] ?? '') != null) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function parseCurrencyCell(value: string): number | null {
  const text = value.trim();
  if (!text || text === '-' || text === 'R$ -' || text === 'R$-' || text === '—') return null;

  // Células formatadas (R$ 1.234,56) ou número puro do gviz (1234.56 / 1234,56).
  const withCurrency = /^R\$\s*([\d.,-]+)/i.exec(text);
  const normalized = (withCurrency ? withCurrency[1] : text).replace(/[R$\s]/g, '').trim();
  if (!normalized || normalized === '-') return null;
  if (!/^-?[\d.,]+$/.test(normalized)) return null;

  const parsed = normalized.includes(',')
    ? parseFloat(normalized.replace(/\./g, '').replace(',', '.'))
    : parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function sumCurrencyColumn(headers: string[], rows: string[][], colIndex: number): number {
  if (colIndex < 0) return 0;

  let total = 0;
  for (const row of rows) {
    const parsed = parseCurrencyCell(row[colIndex] ?? '');
    if (parsed != null) total += parsed;
  }
  return total;
}

function findStatusFinanceiroColumnIndex(headers: string[]): number {
  return headers.findIndex((header) => normalizeHeaderKey(header).includes('status financeiro'));
}

function isStatusNaoPago(status: string): boolean {
  const normalized = normalizeHeaderKey(status);
  if (!normalized) return false;
  return normalized.includes('nao pago');
}

function isStatusCancelado(status: string): boolean {
  const normalized = normalizeHeaderKey(status);
  if (!normalized) return false;
  return normalized.includes('cancelado');
}

function shouldIncludeRowInNfsMetricSum(
  row: string[],
  headers: string[],
  tabKey?: string
): boolean {
  const statusColIndex = findStatusFinanceiroColumnIndex(headers);
  if (statusColIndex >= 0 && isStatusCancelado(row[statusColIndex] ?? '')) {
    return false;
  }

  const notaColIndex = findNotaFiscalColumnIndex(headers);
  if (notaColIndex >= 0 && isExcludedNotaForTab(tabKey, row[notaColIndex] ?? '')) {
    return false;
  }

  return true;
}

function sumCurrencyColumnForRows(
  headers: string[],
  rows: string[][],
  colIndex: number,
  rowFilter?: (row: string[], headers: string[]) => boolean,
  tabKey?: string
): number {
  if (colIndex < 0) return 0;

  let total = 0;
  for (const row of rows) {
    if (!shouldIncludeRowInNfsMetricSum(row, headers, tabKey)) continue;
    if (rowFilter && !rowFilter(row, headers)) continue;
    const parsed = parseCurrencyCell(row[colIndex] ?? '');
    if (parsed != null) total += parsed;
  }
  return total;
}

function sumValorBrutoColumnForRows(
  headers: string[],
  rows: string[][],
  rowFilter?: (row: string[], headers: string[]) => boolean,
  tabKey?: string
): number {
  return sumCurrencyColumnForRows(
    headers,
    rows,
    findValorBrutoColumnIndex(headers),
    rowFilter,
    tabKey
  );
}

function sumValorBrutoColumn(headers: string[], rows: string[][], tabKey?: string): number {
  return sumValorBrutoColumnForRows(headers, rows, undefined, tabKey);
}

function sumValorBrutoNaoPagoColumn(headers: string[], rows: string[][], tabKey?: string): number {
  const statusColIndex = findStatusFinanceiroColumnIndex(headers);
  if (statusColIndex < 0) return 0;

  return sumValorBrutoColumnForRows(
    headers,
    rows,
    (row) => isStatusNaoPago(row[statusColIndex] ?? ''),
    tabKey
  );
}

function sumValorRecebidoColumn(headers: string[], rows: string[][], tabKey?: string): number {
  return sumCurrencyColumnForRows(
    headers,
    rows,
    findValorRecebidoColumnIndex(headers),
    undefined,
    tabKey
  );
}

function sumValorLiquidoColumn(headers: string[], rows: string[][], tabKey?: string): number {
  return sumCurrencyColumnForRows(
    headers,
    rows,
    findValorLiquidoColumnIndex(headers),
    undefined,
    tabKey
  );
}

function sumImpostosColumns(headers: string[], rows: string[][]): number {
  let total = 0;
  for (const taxKey of IMPOSTO_COLUMN_KEYS) {
    const colIndex = headers.findIndex((header) => normalizeHeaderKey(header) === taxKey);
    if (colIndex >= 0) {
      total += sumCurrencyColumn(headers, rows, colIndex);
    }
  }
  return total;
}

function sumContaVinculadaColumn(headers: string[], rows: string[][], tabKey?: string): number {
  return sumCurrencyColumnForRows(
    headers,
    rows,
    findContaVinculadaColumnIndex(headers, rows),
    undefined,
    tabKey
  );
}

function hasNotaFiscalPreenchida(row: string[], notaFiscalColIndex: number): boolean {
  if (notaFiscalColIndex < 0) return true;
  return !isBlankCell(row[notaFiscalColIndex] ?? '');
}

function isValidControleNfsRow(row: string[], headers: string[]): boolean {
  if (isEmptyRow(row)) return false;

  const notaFiscalColIndex = findNotaFiscalColumnIndex(headers);
  const valorBrutoColIndex = findValorBrutoColumnIndex(headers);
  const hasNf = hasNotaFiscalPreenchida(row, notaFiscalColIndex);
  const hasBruto =
    valorBrutoColIndex >= 0 && !isBlankCell(row[valorBrutoColIndex] ?? '');

  if (notaFiscalColIndex >= 0 || valorBrutoColIndex >= 0) {
    return hasNf || hasBruto;
  }

  return true;
}

function trimEmptyColumns(headers: string[], rows: string[][]): {
  headers: string[];
  rows: string[][];
} {
  if (headers.length === 0) return { headers, rows };

  const keepIndices = headers
    .map((_, index) => index)
    .filter((index) => rows.some((row) => !isBlankCell(row[index] ?? '')));

  if (keepIndices.length === headers.length) {
    return { headers, rows };
  }

  return {
    headers: keepIndices.map((index) => headers[index]),
    rows: rows.map((row) => keepIndices.map((index) => row[index] ?? ''))
  };
}

function isExcludedControleNfsColumn(header: string): boolean {
  return CONTROLE_NFS_EXCLUDED_COLUMN_KEYS.has(normalizeHeaderKey(header));
}

function removeExcludedColumns(headers: string[], rows: string[][]): {
  headers: string[];
  rows: string[][];
} {
  const keepIndices = headers
    .map((_, index) => index)
    .filter((index) => !isExcludedControleNfsColumn(headers[index] ?? ''));

  if (keepIndices.length === headers.length) {
    return { headers, rows };
  }

  return {
    headers: keepIndices.map((index) => headers[index]),
    rows: rows.map((row) => keepIndices.map((index) => row[index] ?? ''))
  };
}

function isEmptyRow(cells: string[]): boolean {
  return cells.every(isBlankCell);
}

function isSkippableRow(cells: string[]): boolean {
  if (isEmptyRow(cells)) return true;

  const first = cells[0]?.trim() ?? '';
  const tabLabels = new Set(CONTROLE_NFS_SHEET_TABS.map((tab) => tab.label));
  if (tabLabels.has(first)) {
    const rest = cells.slice(1);
    if (rest.every((value) => isBlankCell(value))) {
      return true;
    }
  }

  return false;
}

function buildRows(table: GvizTable): { headers: string[]; rows: string[][] } {
  const processed = getProcessedSheetRows(table);
  return removeExcludedColumns(processed.headers, processed.rows);
}

function getProcessedSheetRows(table: GvizTable): { headers: string[]; rows: string[][] } {
  const rawHeaders = (table.cols ?? []).map((col, index) => normalizeHeader(col.label, index));
  const parsedRows = (table.rows ?? []).map((row) =>
    (row.c ?? []).map((cell) => formatCell(cell ?? undefined))
  );

  const width = Math.max(rawHeaders.length, ...parsedRows.map((row) => row.length), 0);
  const headers = Array.from({ length: width }, (_, index) => rawHeaders[index] ?? `Coluna ${index + 1}`);
  const normalizedRows = parsedRows
    .map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''))
    .filter((row) => !isSkippableRow(row));

  const { headers: trimmedHeaders, rows: trimmedRows } = trimEmptyColumns(headers, normalizedRows);

  return {
    headers: trimmedHeaders,
    rows: trimmedRows
      .filter((row) => !isEmptyRow(row))
      .filter((row) => isValidControleNfsRow(row, trimmedHeaders))
  };
}

function findHeaderColumnIndex(headers: string[], ...keys: string[]): number {
  const normalizedKeys = new Set(keys.map((key) => normalizeHeaderKey(key)));
  return headers.findIndex((header) => normalizedKeys.has(normalizeHeaderKey(header)));
}

function findMesAnoColumnIndices(
  headers: string[],
  dateBasis: ControleNfsCardsDateBasis
): { mesIndex: number; anoIndex: number } {
  const mesKey = dateBasis === 'emissao' ? 'mes emissao' : 'mes recebimento';
  const anoKey = dateBasis === 'emissao' ? 'ano emissao' : 'ano recebimento';

  let mesIndex = findHeaderColumnIndex(headers, mesKey);
  let anoIndex = findHeaderColumnIndex(headers, anoKey);

  if (mesIndex < 0 || anoIndex < 0) {
    for (let index = 0; index < headers.length; index += 1) {
      const key = normalizeHeaderKey(headers[index] ?? '');
      if (dateBasis === 'emissao') {
        if (mesIndex < 0 && key.includes('mes') && key.includes('emissao')) mesIndex = index;
        if (anoIndex < 0 && key.includes('ano') && key.includes('emissao')) anoIndex = index;
      } else {
        if (mesIndex < 0 && key.includes('mes') && key.includes('recebimento')) mesIndex = index;
        if (anoIndex < 0 && key.includes('ano') && key.includes('recebimento')) anoIndex = index;
      }
    }
  }

  return { mesIndex, anoIndex };
}

function findFullDateColumnIndex(headers: string[], dateBasis: ControleNfsCardsDateBasis): number {
  if (dateBasis === 'emissao') {
    const exact = headers.findIndex((header) => normalizeHeaderKey(header) === 'emissao');
    if (exact >= 0) return exact;

    return headers.findIndex((header) => {
      const key = normalizeHeaderKey(header);
      return key.includes('emissao') && !key.includes('mes') && !key.includes('ano');
    });
  }

  const exact = headers.findIndex((header) => normalizeHeaderKey(header) === 'recebimento');
  if (exact >= 0) return exact;

  const previsao = headers.findIndex((header) => {
    const key = normalizeHeaderKey(header);
    return key.includes('recebimento') && key.includes('previsao');
  });
  if (previsao >= 0) return previsao;

  return headers.findIndex((header) => {
    const key = normalizeHeaderKey(header);
    return key.includes('recebimento') && !key.includes('mes') && !key.includes('ano');
  });
}

function parseIntegerCell(value: string): number | null {
  const text = value.trim();
  if (!text || text === '-') return null;
  const parsed = parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMonthCell(value: string): number | null {
  const parsed = parseIntegerCell(value);
  if (parsed != null && parsed >= 1 && parsed <= 12) return parsed;

  const fromDate = parseBrazilianDateCell(value);
  return fromDate ? fromDate.getMonth() + 1 : null;
}

function parseYearCell(value: string): number | null {
  const parsed = parseIntegerCell(value);
  if (parsed != null && parsed >= 1900 && parsed <= 2100) return parsed;

  const fromDate = parseBrazilianDateCell(value);
  return fromDate ? fromDate.getFullYear() : null;
}

function extractRowMonthYear(
  row: string[],
  headers: string[],
  dateBasis: ControleNfsCardsDateBasis
): { month: number | null; year: number | null } {
  // Para emissão/recebimento, a coluna de data completa é a fonte confiável.
  // MÊS/ANO na planilha podem vir corrompidos (ex.: 1909 em vez de 2026).
  if (dateBasis === 'emissao' || dateBasis === 'recebimento') {
    const dateIndex = findFullDateColumnIndex(headers, dateBasis);
    const parsedDate = dateIndex >= 0 ? parseBrazilianDateCell(row[dateIndex] ?? '') : null;
    if (parsedDate) {
      return {
        month: parsedDate.getMonth() + 1,
        year: parsedDate.getFullYear()
      };
    }
  }

  const { mesIndex, anoIndex } = findMesAnoColumnIndices(headers, dateBasis);
  let month = mesIndex >= 0 ? parseMonthCell(row[mesIndex] ?? '') : null;
  let year = anoIndex >= 0 ? parseYearCell(row[anoIndex] ?? '') : null;

  if (month == null || year == null) {
    const dateIndex = findFullDateColumnIndex(headers, dateBasis);
    const parsedDate = dateIndex >= 0 ? parseBrazilianDateCell(row[dateIndex] ?? '') : null;
    if (parsedDate) {
      if (month == null) month = parsedDate.getMonth() + 1;
      if (year == null) year = parsedDate.getFullYear();
    }
  }

  return { month, year };
}

function parseBrazilianDateCell(value: string): Date | null {
  const text = value.trim();
  if (!text || text === '-') return null;

  const gvizDateMatch = text.match(/^Date\((\d+),(\d+),(\d+)\)$/);
  if (gvizDateMatch) {
    const year = parseInt(gvizDateMatch[1], 10);
    const monthIndex = parseInt(gvizDateMatch[2], 10);
    const day = parseInt(gvizDateMatch[3], 10);
    const date = new Date(year, monthIndex, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === monthIndex &&
      date.getDate() === day
    ) {
      return date;
    }
    return null;
  }

  const brMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10);
    const year = parseInt(brMatch[3], 10);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
    return null;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
  }

  return null;
}

function parseIsoDateOnly(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  return parseBrazilianDateCell(value.trim()) ?? parseBrazilianDateCell(value.split('T')[0] ?? '');
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function monthYearIntersectsPeriodRange(
  month: number,
  year: number,
  dateFrom?: string,
  dateTo?: string
): boolean {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const from = parseIsoDateOnly(dateFrom);
  const to = parseIsoDateOnly(dateTo);
  const rangeStart = from ? startOfDay(from) : monthStart;
  const rangeEnd = to ? startOfDay(to) : monthEnd;
  if (rangeStart.getTime() > rangeEnd.getTime()) return false;
  return monthStart.getTime() <= rangeEnd.getTime() && monthEnd.getTime() >= rangeStart.getTime();
}

function rowMatchesPeriodRange(
  row: string[],
  headers: string[],
  dateBasis: 'emissao' | 'recebimento',
  dateFrom?: string,
  dateTo?: string
): boolean {
  const hasRangeFilter = Boolean(dateFrom?.trim() || dateTo?.trim());
  if (!hasRangeFilter) return true;

  const dateIndex = findFullDateColumnIndex(headers, dateBasis);
  const parsedDate = dateIndex >= 0 ? parseBrazilianDateCell(row[dateIndex] ?? '') : null;
  if (parsedDate) {
    const from = parseIsoDateOnly(dateFrom);
    const to = parseIsoDateOnly(dateTo);
    const value = startOfDay(parsedDate).getTime();

    if (from && value < startOfDay(from).getTime()) return false;
    if (to && value > startOfDay(to).getTime()) return false;
    return true;
  }

  // Sem data completa: usa mês/ano de apuração (mesma lógica do filtro de gastos).
  const { month, year } = extractRowMonthYear(row, headers, dateBasis);
  if (month == null || year == null) return false;
  return monthYearIntersectsPeriodRange(month, year, dateFrom, dateTo);
}

function filterRowsByPeriodRange(
  headers: string[],
  rows: string[][],
  dateBasis: ControleNfsCardsDateBasis,
  dateFrom?: string,
  dateTo?: string
): string[][] {
  if (!dateFrom?.trim() && !dateTo?.trim()) return rows;
  return rows.filter((row) => rowMatchesPeriodRange(row, headers, dateBasis, dateFrom, dateTo));
}

function hasIndependentPeriodFilter(filter?: ControleNfsIndependentPeriodFilter): boolean {
  return Boolean(
    filter?.emissaoDateFrom?.trim() ||
      filter?.emissaoDateTo?.trim() ||
      filter?.recebimentoDateFrom?.trim() ||
      filter?.recebimentoDateTo?.trim()
  );
}

function rowMatchesDateFilter(
  row: string[],
  headers: string[],
  dateFilter: ControleNfsCardsDateFilter
): boolean {
  return (
    rowMatchesPeriodRange(
      row,
      headers,
      'emissao',
      dateFilter.emissaoDateFrom,
      dateFilter.emissaoDateTo
    ) &&
    rowMatchesPeriodRange(
      row,
      headers,
      'recebimento',
      dateFilter.recebimentoDateFrom,
      dateFilter.recebimentoDateTo
    )
  );
}

function filterRowsByDate(
  headers: string[],
  rows: string[][],
  dateFilter?: ControleNfsCardsDateFilter
): string[][] {
  if (!dateFilter) return rows;
  return rows.filter((row) => rowMatchesDateFilter(row, headers, dateFilter));
}

function hasApuracaoMonthYearFilter(filter?: ApuracaoMonthYearFilter): boolean {
  return Boolean(filter?.months?.length || filter?.years?.length);
}

function rowMatchesApuracaoMonthYearFilter(
  row: string[],
  headers: string[],
  dateBasis: ControleNfsCardsDateBasis,
  filter: ApuracaoMonthYearFilter
): boolean {
  const { month, year } = extractRowMonthYear(row, headers, dateBasis);
  if (filter.months?.length && (month == null || !filter.months.includes(month))) {
    return false;
  }
  if (filter.years?.length && (year == null || !filter.years.includes(year))) {
    return false;
  }
  return true;
}

function filterRowsByApuracaoMonthYear(
  headers: string[],
  rows: string[][],
  dateBasis: ControleNfsCardsDateBasis,
  filter?: ApuracaoMonthYearFilter
): string[][] {
  if (!hasApuracaoMonthYearFilter(filter)) return rows;
  return rows.filter((row) => rowMatchesApuracaoMonthYearFilter(row, headers, dateBasis, filter!));
}

function filterRowsByEmissaoApuracao(
  headers: string[],
  rows: string[][],
  filter?: EmissaoApuracaoFilter
): string[][] {
  return filterRowsByApuracaoMonthYear(headers, rows, 'emissao', filter);
}

function filterRowsByRecebimentoApuracao(
  headers: string[],
  rows: string[][],
  filter?: RecebimentoApuracaoFilter
): string[][] {
  return filterRowsByApuracaoMonthYear(headers, rows, 'recebimento', filter);
}

export function toNfsTotalsComputeOptions(
  filters?: ControleNfsTotalsFilters
): NfsTotalsComputeOptions | undefined {
  if (
    !filters?.dateFilter &&
    !hasIndependentPeriodFilter(filters?.independentPeriodFilter) &&
    !hasApuracaoMonthYearFilter(filters?.emissaoApuracaoFilter) &&
    !hasApuracaoMonthYearFilter(filters?.recebimentoApuracaoFilter)
  ) {
    return undefined;
  }
  return {
    dateFilter: filters?.dateFilter,
    independentPeriodFilter: filters?.independentPeriodFilter,
    emissaoApuracaoFilter: filters?.emissaoApuracaoFilter,
    recebimentoApuracaoFilter: filters?.recebimentoApuracaoFilter
  };
}

function resolveRowsForBrutoAndRecebido(
  headers: string[],
  rows: string[][],
  computeOptions?: NfsTotalsComputeOptions
): { rowsForBrutoLiquido: string[][]; rowsForRecebido: string[][] } {
  const independent = computeOptions?.independentPeriodFilter;
  if (hasIndependentPeriodFilter(independent)) {
    const emissaoFrom = independent?.emissaoDateFrom?.trim() || undefined;
    const emissaoTo = independent?.emissaoDateTo?.trim() || undefined;
    const recebimentoFrom = independent?.recebimentoDateFrom?.trim() || undefined;
    const recebimentoTo = independent?.recebimentoDateTo?.trim() || undefined;
    const hasEmissao = Boolean(emissaoFrom || emissaoTo);
    const hasRecebimento = Boolean(recebimentoFrom || recebimentoTo);

    // Bruto/líquido: coluna por data de emissão.
    // Se só houver período de recebimento, usa esse intervalo na data de emissão.
    const rowsForBrutoLiquido = filterRowsByEmissaoApuracao(
      headers,
      filterRowsByPeriodRange(
        headers,
        rows,
        'emissao',
        hasEmissao ? emissaoFrom : recebimentoFrom,
        hasEmissao ? emissaoTo : recebimentoTo
      ),
      computeOptions?.emissaoApuracaoFilter
    );

    // Recebido: soma a coluna RECEBIDO.
    // - Com período de recebimento → filtra pela data de recebimento.
    // - Só com período de emissão → filtra pela data de emissão (mesmo conjunto de NFs),
    //   e soma o valor da coluna RECEBIDO dessas linhas (não usa a data de recebimento).
    const recebidoDateBasis: ControleNfsCardsDateBasis = hasRecebimento
      ? 'recebimento'
      : 'emissao';
    const recebidoFrom = hasRecebimento ? recebimentoFrom : emissaoFrom;
    const recebidoTo = hasRecebimento ? recebimentoTo : emissaoTo;
    const rowsForRecebido = filterRowsByRecebimentoApuracao(
      headers,
      filterRowsByPeriodRange(
        headers,
        rows,
        recebidoDateBasis,
        recebidoFrom,
        recebidoTo
      ),
      computeOptions?.recebimentoApuracaoFilter
    );
    return { rowsForBrutoLiquido, rowsForRecebido };
  }

  const rowsAfterDateFilter = filterRowsByDate(headers, rows, computeOptions?.dateFilter);
  return {
    rowsForBrutoLiquido: filterRowsByEmissaoApuracao(
      headers,
      rowsAfterDateFilter,
      computeOptions?.emissaoApuracaoFilter
    ),
    rowsForRecebido: filterRowsByRecebimentoApuracao(
      headers,
      rowsAfterDateFilter,
      computeOptions?.recebimentoApuracaoFilter
    )
  };
}

function computeTabTotalsFromProcessed(
  headers: string[],
  rows: string[][],
  computeOptions?: NfsTotalsComputeOptions,
  tabKey?: string
): Omit<ControleNfsTabTotals, 'tabKey' | 'label'> {
  const { rowsForBrutoLiquido, rowsForRecebido } = resolveRowsForBrutoAndRecebido(
    headers,
    rows,
    computeOptions
  );

  return {
    valorBruto: sumValorBrutoColumn(headers, rowsForBrutoLiquido, tabKey),
    valorBrutoNaoPago: sumValorBrutoNaoPagoColumn(headers, rowsForBrutoLiquido, tabKey),
    valorRecebido: sumValorRecebidoColumn(headers, rowsForRecebido, tabKey),
    valorLiquido: sumValorLiquidoColumn(headers, rowsForBrutoLiquido, tabKey),
    totalImpostos: sumImpostosColumns(headers, rowsForBrutoLiquido),
    // Conta vinculada: saldo acumulado da planilha — não responde a filtros de data/apuração.
    contaVinculada: sumContaVinculadaColumn(headers, rows, tabKey),
    hasContaVinculadaColumn: findContaVinculadaColumnIndex(headers, rows) >= 0
  };
}

function collectFilterOptions(
  processedSheets: Array<{ headers: string[]; rows: string[][] }>
): ControleNfsFilterOptions {
  const yearsEmissao = new Set<number>();
  const yearsRecebimento = new Set<number>();

  for (const { headers, rows } of processedSheets) {
    for (const row of rows) {
      const emissao = extractRowMonthYear(row, headers, 'emissao');
      const recebimento = extractRowMonthYear(row, headers, 'recebimento');
      if (emissao.year != null) yearsEmissao.add(emissao.year);
      if (recebimento.year != null) yearsRecebimento.add(recebimento.year);
    }
  }

  const sortDesc = (values: Set<number>) =>
    Array.from(values).sort((a, b) => b - a);

  return {
    yearsEmissao: sortDesc(yearsEmissao),
    yearsRecebimento: sortDesc(yearsRecebimento)
  };
}

function buildTotalsSummary(
  tabTotals: ControleNfsTabTotals[],
  filterOptions?: ControleNfsFilterOptions,
  faturamentoByLot?: ControleNfsLotFaturamento[]
): ControleNfsTotalsSummary {
  return {
    valorBruto: tabTotals.reduce((sum, item) => sum + item.valorBruto, 0),
    valorBrutoNaoPago: tabTotals.reduce((sum, item) => sum + item.valorBrutoNaoPago, 0),
    valorRecebido: tabTotals.reduce((sum, item) => sum + item.valorRecebido, 0),
    valorLiquido: tabTotals.reduce((sum, item) => sum + item.valorLiquido, 0),
    totalImpostos: tabTotals.reduce((sum, item) => sum + item.totalImpostos, 0),
    contaVinculada: tabTotals.reduce((sum, item) => sum + item.contaVinculada, 0),
    tabCount: tabTotals.length,
    tabsWithValorBruto: tabTotals.filter((item) => item.valorBruto > 0).length,
    tabsWithValorBrutoNaoPago: tabTotals.filter((item) => item.valorBrutoNaoPago > 0).length,
    tabsWithValorRecebido: tabTotals.filter((item) => item.valorRecebido > 0).length,
    tabsWithValorLiquido: tabTotals.filter((item) => item.valorLiquido > 0).length,
    tabsWithImpostos: tabTotals.filter((item) => item.totalImpostos > 0).length,
    tabsWithContaVinculada: tabTotals.filter((item) => item.contaVinculada > 0).length,
    byTab: tabTotals,
    faturamentoByLot,
    filterOptions,
    fetchedAt: new Date().toISOString()
  };
}

function hasActiveTotalsFilters(filters?: ControleNfsTotalsFilters): boolean {
  if (!filters) return false;

  const tabKeys = filters.tabKeys?.filter(Boolean) ?? [];
  const allTabsSelected =
    tabKeys.length === 0 || tabKeys.length >= CONTROLE_NFS_SHEET_TABS.length;

  const dateFilter = filters.dateFilter;
  const hasDateFilter = Boolean(
    dateFilter &&
      (dateFilter.emissaoDateFrom?.trim() ||
        dateFilter.emissaoDateTo?.trim() ||
        dateFilter.recebimentoDateFrom?.trim() ||
        dateFilter.recebimentoDateTo?.trim())
  );

  return (
    !allTabsSelected ||
    hasDateFilter ||
    hasIndependentPeriodFilter(filters.independentPeriodFilter) ||
    hasApuracaoMonthYearFilter(filters.emissaoApuracaoFilter) ||
    hasApuracaoMonthYearFilter(filters.recebimentoApuracaoFilter)
  );
}

function resolveTabsForTotals(tabKeys?: string[]): ControleNfsSheetTab[] {
  const normalized = (tabKeys ?? []).map((key) => key.trim()).filter(Boolean);
  if (normalized.length === 0) return CONTROLE_NFS_SHEET_TABS;

  const allowed = new Set(normalized);
  return CONTROLE_NFS_SHEET_TABS.filter((tab) => allowed.has(tab.key));
}

export function listControleNfsTabs(): ControleNfsSheetTab[] {
  return CONTROLE_NFS_SHEET_TABS;
}

export function findControleNfsTab(tabKey: string): ControleNfsSheetTab | undefined {
  const normalized = tabKey.trim().toLowerCase();
  return CONTROLE_NFS_SHEET_TABS.find((tab) => tab.key === normalized);
}

function slugifyTabKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveTabForFetch(tabKey: string, sheetNameOverride?: string): ControleNfsSheetTab {
  const sheetName = sheetNameOverride?.trim();
  if (sheetName) {
    const fromSheetName = CONTROLE_NFS_SHEET_TABS.find((tab) => tab.sheetName === sheetName);
    if (fromSheetName) return fromSheetName;

    const normalizedKey = tabKey.trim().toLowerCase();
    return {
      key: normalizedKey || slugifyTabKey(sheetName),
      label: sheetName,
      sheetName
    };
  }

  const fromKey = findControleNfsTab(tabKey);
  if (fromKey) return fromKey;

  throw new Error('Aba da planilha não encontrada.');
}

export async function fetchControleNfsSheetByName(
  sheetName: string,
  forceRefresh = false
): Promise<ControleNfsSheetData> {
  const trimmed = sheetName.trim();
  if (!trimmed) {
    throw new Error('Nome da aba da planilha é obrigatório.');
  }
  return fetchControleNfsSheet(slugifyTabKey(trimmed), trimmed, forceRefresh);
}

export async function fetchControleNfsSheet(
  tabKey: string,
  sheetNameOverride?: string,
  forceRefresh = false
): Promise<ControleNfsSheetData> {
  const tab = resolveTabForFetch(tabKey, sheetNameOverride);

  const cacheKey = `${spreadsheetId()}:${tab.sheetName}`;
  if (forceRefresh) {
    sheetCache.delete(cacheKey);
  }
  const cached = sheetCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const sheetParam = encodeURIComponent(tab.sheetName);
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId()}/gviz/tq?tqx=out:json&sheet=${sheetParam}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json,text/plain,*/*' }
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar a planilha (${response.status}).`);
  }

  const raw = await response.text();
  const payload = parseGvizPayload(raw);

  if (payload.status !== 'ok' || !payload.table) {
    throw new Error('Planilha retornou dados inválidos.');
  }

  const processed = getProcessedSheetRows(payload.table);
  const { headers, rows } = removeExcludedColumns(processed.headers, processed.rows);
  const data: ControleNfsSheetData = {
    tab,
    spreadsheetId: spreadsheetId(),
    headers,
    rows,
    rowCount: rows.length,
    fetchedAt: new Date().toISOString()
  };

  sheetCache.set(cacheKey, {
    data,
    processedHeaders: processed.headers,
    processedRows: processed.rows,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
  return data;
}

async function getProcessedSheetForTab(tab: ControleNfsSheetTab): Promise<{
  headers: string[];
  rows: string[][];
}> {
  await fetchControleNfsSheet(tab.key, tab.sheetName);
  const cacheKey = `${spreadsheetId()}:${tab.sheetName}`;
  const cached = sheetCache.get(cacheKey);
  if (!cached) {
    return { headers: [], rows: [] };
  }
  return {
    headers: cached.processedHeaders,
    rows: cached.processedRows
  };
}

/** Carrega todas as abas NFS uma vez (reusa cache em memória). */
export async function loadProcessedNfsSheetsByTabKey(
  forceRefresh = false
): Promise<Map<string, { headers: string[]; rows: string[][] }>> {
  if (forceRefresh) {
    sheetCache.clear();
  }

  const processedSheets = await Promise.all(
    CONTROLE_NFS_SHEET_TABS.map(async (tab) => {
      try {
        return await getProcessedSheetForTab(tab);
      } catch (firstError) {
        // Retry único: carga paralela de muitas abas pode falhar por rate-limit do Google.
        try {
          await new Promise((resolve) => setTimeout(resolve, 400 + Math.floor(Math.random() * 600)));
          return await getProcessedSheetForTab(tab);
        } catch (retryError) {
          console.warn(
            `[controle-nfs] Falha ao carregar aba "${tab.sheetName}" (${tab.key}):`,
            retryError instanceof Error ? retryError.message : retryError,
            '| 1ª tentativa:',
            firstError instanceof Error ? firstError.message : firstError
          );
          return { headers: [] as string[], rows: [] as string[][] };
        }
      }
    })
  );

  return new Map(
    CONTROLE_NFS_SHEET_TABS.map((tab, index) => [tab.key, processedSheets[index]])
  );
}

function parseOptionalDateParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseControleNfsTotalsFilters(query: {
  tabKeys?: unknown;
  emissaoDateFrom?: unknown;
  emissaoDateTo?: unknown;
  recebimentoDateFrom?: unknown;
  recebimentoDateTo?: unknown;
  dateBasis?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
}): ControleNfsTotalsFilters | undefined {
  const tabKeys =
    typeof query.tabKeys === 'string'
      ? query.tabKeys
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : [];

  const legacyFrom = parseOptionalDateParam(query.dateFrom);
  const legacyTo = parseOptionalDateParam(query.dateTo);
  const legacyBasis = query.dateBasis === 'recebimento' ? 'recebimento' : 'emissao';

  const dateFilter: ControleNfsCardsDateFilter = {
    emissaoDateFrom:
      parseOptionalDateParam(query.emissaoDateFrom) ??
      (legacyBasis === 'emissao' ? legacyFrom : undefined),
    emissaoDateTo:
      parseOptionalDateParam(query.emissaoDateTo) ??
      (legacyBasis === 'emissao' ? legacyTo : undefined),
    recebimentoDateFrom:
      parseOptionalDateParam(query.recebimentoDateFrom) ??
      (legacyBasis === 'recebimento' ? legacyFrom : undefined),
    recebimentoDateTo:
      parseOptionalDateParam(query.recebimentoDateTo) ??
      (legacyBasis === 'recebimento' ? legacyTo : undefined)
  };

  const filters: ControleNfsTotalsFilters = {
    tabKeys: tabKeys.length > 0 ? tabKeys : undefined,
    dateFilter
  };

  return hasActiveTotalsFilters(filters) ? filters : undefined;
}

export async function fetchControleNfsTotalsSummary(
  forceRefresh = false,
  filters?: ControleNfsTotalsFilters,
  preloadedByTabKey?: Map<string, { headers: string[]; rows: string[][] }>
): Promise<ControleNfsTotalsSummary> {
  invalidateStaleNfsTotalsCache();
  if (forceRefresh && !preloadedByTabKey) {
    totalsSummaryCache = null;
    sheetCache.clear();
  } else if (forceRefresh) {
    totalsSummaryCache = null;
  }

  const useFilters = hasActiveTotalsFilters(filters);

  if (
    !preloadedByTabKey &&
    !useFilters &&
    !forceRefresh &&
    totalsSummaryCache &&
    totalsSummaryCache.expiresAt > Date.now() &&
    totalsSummaryCache.data.faturamentoByLot != null &&
    // Cache anterior à coluna Conta Vinculada não serve — força recomputo.
    totalsSummaryCache.data.faturamentoByLot.every(
      (lot) => typeof lot.hasContaVinculadaColumn === 'boolean'
    ) &&
    totalsSummaryCache.data.byTab.every(
      (tab) => typeof tab.hasContaVinculadaColumn === 'boolean'
    )
  ) {
    return totalsSummaryCache.data;
  }

  const tabsToCompute = resolveTabsForTotals(filters?.tabKeys);
  const processedByTabKey =
    preloadedByTabKey ?? (await loadProcessedNfsSheetsByTabKey(false));

  const processedSheets = CONTROLE_NFS_SHEET_TABS.map(
    (tab) => processedByTabKey.get(tab.key) ?? { headers: [], rows: [] }
  );

  const filterOptions = collectFilterOptions(processedSheets);

  const computeOptions = toNfsTotalsComputeOptions(filters);
  const faturamentoByLot = computeAllLotFaturamento(processedByTabKey, computeOptions);

  const tabTotals = tabsToCompute.map((tab) => {
    const processed = processedByTabKey.get(tab.key) ?? { headers: [], rows: [] };
    try {
      const totals = computeTabTotalsFromProcessed(
        processed.headers,
        processed.rows,
        computeOptions,
        tab.key
      );
      return {
        tabKey: tab.key,
        label: tab.label,
        ...totals
      };
    } catch {
      return {
        tabKey: tab.key,
        label: tab.label,
        valorBruto: 0,
        valorBrutoNaoPago: 0,
        valorRecebido: 0,
        valorLiquido: 0,
        totalImpostos: 0,
        contaVinculada: 0,
        hasContaVinculadaColumn: false
      };
    }
  });

  const data = buildTotalsSummary(tabTotals, filterOptions, faturamentoByLot);

  if (!useFilters) {
    totalsSummaryCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  }

  return data;
}

export async function fetchControleNfsValorBrutoTotal(
  forceRefresh = false
): Promise<ControleNfsValorBrutoSummary> {
  const totals = await fetchControleNfsTotalsSummary(forceRefresh);
  return {
    total: totals.valorBruto,
    tabCount: totals.tabCount,
    tabsWithData: totals.tabsWithValorBruto,
    fetchedAt: totals.fetchedAt
  };
}

export type ControleNfsLotFaturamento = {
  tabKey: string;
  lotKey: string;
  label: string;
  valorBruto: number;
  valorLiquido: number;
  valorRecebido: number;
  contaVinculada: number;
  hasContaVinculadaColumn: boolean;
};

function findLotBreakdownColumnIndex(headers: string[], lotColumn: LotBreakdownColumn): number {
  if (lotColumn === 'servico') {
    const exact = headers.findIndex((header) => normalizeHeaderKey(header) === 'servico');
    if (exact >= 0) return exact;
    return headers.findIndex((header) => normalizeHeaderKey(header).includes('servico'));
  }
  if (lotColumn === 'contrato') {
    const exact = headers.findIndex((header) => normalizeHeaderKey(header) === 'contrato');
    if (exact >= 0) return exact;
    return headers.findIndex((header) => {
      const key = normalizeHeaderKey(header);
      return key.includes('contrato') || key.includes('centro de custo') || key === 'centro custo';
    });
  }
  if (lotColumn === 'lotes') {
    const exact = headers.findIndex((header) => normalizeHeaderKey(header) === 'lotes');
    if (exact >= 0) return exact;
    return headers.findIndex((header) => normalizeHeaderKey(header).includes('lotes'));
  }
  const exact = headers.findIndex((header) => normalizeHeaderKey(header) === 'lote');
  if (exact >= 0) return exact;
  return headers.findIndex((header) => normalizeHeaderKey(header).includes('lote'));
}

function computeLotFaturamentoForTab(
  config: LotBreakdownTabConfig,
  headers: string[],
  rows: string[][],
  computeOptions?: NfsTotalsComputeOptions
): ControleNfsLotFaturamento[] {
  const lotColIndex = findLotBreakdownColumnIndex(headers, config.lotColumn);
  const { rowsForBrutoLiquido, rowsForRecebido } = resolveRowsForBrutoAndRecebido(
    headers,
    rows,
    computeOptions
  );

  const brutoIdx = findValorBrutoColumnIndex(headers);
  const liquidoIdx = findValorLiquidoColumnIndex(headers);
  const recebidoIdx = findValorRecebidoColumnIndex(headers);
  const contaVinculadaIdx = findContaVinculadaColumnIndex(headers, rows);
  const hasContaVinculadaColumn = contaVinculadaIdx >= 0;

  return config.lots.map((lot) => {
    const rowFilter = (row: string[]) =>
      lotColIndex < 0
        ? false
        : lotCellMatchesValues(row[lotColIndex] ?? '', lot.nfsMatchValues);

    return {
      tabKey: config.tabKey,
      lotKey: lot.lotKey,
      label: lot.label,
      valorBruto: sumCurrencyColumnForRows(
        headers,
        rowsForBrutoLiquido,
        brutoIdx,
        rowFilter,
        config.tabKey
      ),
      valorLiquido: sumCurrencyColumnForRows(
        headers,
        rowsForBrutoLiquido,
        liquidoIdx,
        rowFilter,
        config.tabKey
      ),
      valorRecebido: sumCurrencyColumnForRows(
        headers,
        rowsForRecebido,
        recebidoIdx,
        rowFilter,
        config.tabKey
      ),
      // Conta vinculada: saldo acumulado da planilha — não responde a filtros de data/apuração.
      contaVinculada: hasContaVinculadaColumn
        ? sumCurrencyColumnForRows(
            headers,
            rows,
            contaVinculadaIdx,
            rowFilter,
            config.tabKey
          )
        : 0,
      hasContaVinculadaColumn
    };
  });
}

function computeAllLotFaturamento(
  processedByTabKey: Map<string, { headers: string[]; rows: string[][] }>,
  computeOptions?: NfsTotalsComputeOptions
): ControleNfsLotFaturamento[] {
  const results: ControleNfsLotFaturamento[] = [];

  for (const config of NFS_TAB_LOT_BREAKDOWN) {
    const processed = processedByTabKey.get(config.tabKey);
    if (!processed || processed.headers.length === 0) {
      for (const lot of config.lots) {
        results.push({
          tabKey: config.tabKey,
          lotKey: lot.lotKey,
          label: lot.label,
          valorBruto: 0,
          valorLiquido: 0,
          valorRecebido: 0,
          contaVinculada: 0,
          hasContaVinculadaColumn: false
        });
      }
      continue;
    }

    results.push(
      ...computeLotFaturamentoForTab(config, processed.headers, processed.rows, computeOptions)
    );
  }

  return results;
}

function parseIntListParam(value: unknown): number[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

export function parseEmissaoApuracaoFilters(query: {
  months?: unknown;
  years?: unknown;
}): EmissaoApuracaoFilter | undefined {
  const months = parseIntListParam(query.months).filter((month) => month >= 1 && month <= 12);
  const years = parseIntListParam(query.years).filter((year) => year >= 1900 && year <= 2100);
  if (!months.length && !years.length) return undefined;
  return {
    months: months.length ? months : undefined,
    years: years.length ? years : undefined
  };
}

/** Períodos de emissão/recebimento (YYYY-MM-DD) para Controle Geral / Contratos Sócios. */
export function parseIndependentPeriodFilter(query: {
  periodFrom?: unknown;
  periodTo?: unknown;
  emissaoDateFrom?: unknown;
  emissaoDateTo?: unknown;
  recebimentoDateFrom?: unknown;
  recebimentoDateTo?: unknown;
}): ControleNfsIndependentPeriodFilter | undefined {
  const legacyFrom = parseOptionalDateParam(query.periodFrom);
  const legacyTo = parseOptionalDateParam(query.periodTo);
  const emissaoDateFrom =
    parseOptionalDateParam(query.emissaoDateFrom) ?? legacyFrom;
  const emissaoDateTo = parseOptionalDateParam(query.emissaoDateTo) ?? legacyTo;
  const recebimentoDateFrom =
    parseOptionalDateParam(query.recebimentoDateFrom) ?? legacyFrom;
  const recebimentoDateTo =
    parseOptionalDateParam(query.recebimentoDateTo) ?? legacyTo;

  const filter: ControleNfsIndependentPeriodFilter = {
    emissaoDateFrom,
    emissaoDateTo,
    recebimentoDateFrom,
    recebimentoDateTo
  };
  return hasIndependentPeriodFilter(filter) ? filter : undefined;
}

export async function fetchNfsLotFaturamento(
  computeOptions?: NfsTotalsComputeOptions,
  preloadedByTabKey?: Map<string, { headers: string[]; rows: string[][] }>
): Promise<ControleNfsLotFaturamento[]> {
  if (preloadedByTabKey) {
    return computeAllLotFaturamento(preloadedByTabKey, computeOptions);
  }

  const processedByTabKey = new Map<string, { headers: string[]; rows: string[][] }>();

  for (const config of NFS_TAB_LOT_BREAKDOWN) {
    const tab = CONTROLE_NFS_SHEET_TABS.find((item) => item.key === config.tabKey);
    if (!tab) continue;

    await fetchControleNfsSheet(tab.key, tab.sheetName);
    const processed = await getProcessedSheetForTab(tab);
    processedByTabKey.set(config.tabKey, processed);
  }

  return computeAllLotFaturamento(processedByTabKey, computeOptions);
}

export type RecebidoMensalByGastosContractEntry = {
  contract: string;
  month: number;
  year: number;
  recebido: number;
};

function extractRecebimentoMonthYearForMetric(
  row: string[],
  headers: string[]
): { month: number | null; year: number | null } {
  const recebimento = extractRowMonthYear(row, headers, 'recebimento');
  if (recebimento.month != null && recebimento.year != null) {
    return recebimento;
  }
  return extractRowMonthYear(row, headers, 'emissao');
}

function sumRecebidoByMonthForRows(
  headers: string[],
  rows: string[][],
  rowFilter: (row: string[]) => boolean,
  tabKey?: string,
  recebimentoApuracaoFilter?: RecebimentoApuracaoFilter,
  independentPeriodFilter?: ControleNfsIndependentPeriodFilter
): Map<string, number> {
  const recebidoIdx = findValorRecebidoColumnIndex(headers);
  const map = new Map<string, number>();

  for (const row of rows) {
    if (!shouldIncludeRowInNfsMetricSum(row, headers, tabKey)) continue;
    if (!rowFilter(row)) continue;

    const emissaoFrom = independentPeriodFilter?.emissaoDateFrom?.trim() || undefined;
    const emissaoTo = independentPeriodFilter?.emissaoDateTo?.trim() || undefined;
    const recebimentoFrom = independentPeriodFilter?.recebimentoDateFrom?.trim() || undefined;
    const recebimentoTo = independentPeriodFilter?.recebimentoDateTo?.trim() || undefined;
    const hasRecebimento = Boolean(recebimentoFrom || recebimentoTo);
    const dateBasis: ControleNfsCardsDateBasis = hasRecebimento ? 'recebimento' : 'emissao';
    const dateFrom = hasRecebimento ? recebimentoFrom : emissaoFrom;
    const dateTo = hasRecebimento ? recebimentoTo : emissaoTo;

    if (
      (dateFrom || dateTo) &&
      !rowMatchesPeriodRange(row, headers, dateBasis, dateFrom, dateTo)
    ) {
      continue;
    }

    const { month, year } = extractRecebimentoMonthYearForMetric(row, headers);
    if (month == null || year == null) continue;

    if (
      recebimentoApuracaoFilter?.months?.length &&
      !recebimentoApuracaoFilter.months.includes(month)
    ) {
      continue;
    }
    if (
      recebimentoApuracaoFilter?.years?.length &&
      !recebimentoApuracaoFilter.years.includes(year)
    ) {
      continue;
    }

    const parsed = parseCurrencyCell(row[recebidoIdx] ?? '');
    if (parsed == null || parsed === 0) continue;

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    map.set(monthKey, (map.get(monthKey) ?? 0) + parsed);
  }

  return map;
}

export function buildRecebidoMensalByGastosContract(
  processedByTabKey: Map<string, { headers: string[]; rows: string[][] }>,
  recebimentoApuracaoFilter?: RecebimentoApuracaoFilter,
  independentPeriodFilter?: ControleNfsIndependentPeriodFilter
): RecebidoMensalByGastosContractEntry[] {
  const aggregate = new Map<string, RecebidoMensalByGastosContractEntry>();

  const addMonthMap = (contract: string, monthMap: Map<string, number>) => {
    const canonical = normalizeGastosOperacionaisContractName(contract);
    for (const [monthKey, recebido] of monthMap.entries()) {
      const [yearStr, monthStr] = monthKey.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      if (!Number.isFinite(year) || !Number.isFinite(month)) continue;

      const entryKey = `${canonical}:${monthKey}`;
      const existing = aggregate.get(entryKey);
      if (existing) {
        existing.recebido += recebido;
      } else {
        aggregate.set(entryKey, { contract: canonical, year, month, recebido });
      }
    }
  };

  for (const config of NFS_TAB_LOT_BREAKDOWN) {
    const processed = processedByTabKey.get(config.tabKey);
    if (!processed || processed.headers.length === 0) continue;

    const lotColIndex = findLotBreakdownColumnIndex(processed.headers, config.lotColumn);
    for (const lot of config.lots) {
      const rowFilter = (row: string[]) =>
        lotColIndex >= 0 && lotCellMatchesValues(row[lotColIndex] ?? '', lot.nfsMatchValues);
      const monthMap = sumRecebidoByMonthForRows(
        processed.headers,
        processed.rows,
        rowFilter,
        config.tabKey,
        recebimentoApuracaoFilter,
        independentPeriodFilter
      );
      for (const contract of lot.gastosCostCenters) {
        addMonthMap(contract, monthMap);
      }
    }
  }

  for (const tab of CONTROLE_NFS_SHEET_TABS) {
    if (tabHasLotBreakdown(tab.key)) continue;

    const processed = processedByTabKey.get(tab.key);
    if (!processed || processed.headers.length === 0) continue;

    const centers = NFS_TAB_GASTOS_COST_CENTERS[tab.key] ?? [];
    if (!centers.length) continue;

    const monthMap = sumRecebidoByMonthForRows(
      processed.headers,
      processed.rows,
      () => true,
      tab.key,
      recebimentoApuracaoFilter,
      independentPeriodFilter
    );
    for (const contract of centers) {
      addMonthMap(contract, monthMap);
    }
  }

  return Array.from(aggregate.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.contract.localeCompare(b.contract, 'pt-BR');
  });
}

export async function fetchRecebidoMensalByGastosContract(
  forceRefresh = false,
  recebimentoApuracaoFilter?: RecebimentoApuracaoFilter,
  preloadedByTabKey?: Map<string, { headers: string[]; rows: string[][] }>,
  independentPeriodFilter?: ControleNfsIndependentPeriodFilter
): Promise<{
  entries: RecebidoMensalByGastosContractEntry[];
  fetchedAt: string;
}> {
  const processedByTabKey =
    preloadedByTabKey ?? (await loadProcessedNfsSheetsByTabKey(forceRefresh));

  return {
    entries: buildRecebidoMensalByGastosContract(
      processedByTabKey,
      recebimentoApuracaoFilter,
      independentPeriodFilter
    ),
    fetchedAt: new Date().toISOString()
  };
}
