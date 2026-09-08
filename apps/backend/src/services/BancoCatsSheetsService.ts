import {
  deleteBancoCatsManual,
  getCanonicalBancoCatsHeaders,
  listBancoCatsManuais,
  snapshotToCells,
} from './bancoCatsManualStore';
import {
  appendGoogleSheetRow,
  googleSheetsWriteConfigError,
  isGoogleSheetsWriteConfigured,
} from './googleSheetsWrite';

const DEFAULT_SPREADSHEET_ID = '1n_AhQ9DEGmguyVTfdA41Sm2j5qXmS0Huz4IV0KlBNPE';
const DEFAULT_SHEET_NAME = 'Serviços';
const CACHE_TTL_MS = 30_000;

export type BancoCatsSheetData = {
  spreadsheetId: string;
  sheetName: string;
  headers: string[];
  rows: string[][];
  rowKeys: string[];
  /** rowKeys criados manualmente no sistema (não vêm da planilha). */
  manualRowKeys: string[];
  rowCount: number;
  filterOptions: {
    empresas: string[];
    unidades: string[];
    fontes: string[];
  };
  fetchedAt: string;
};

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

type SheetCacheEntry = {
  expiresAt: number;
  data: BancoCatsSheetData;
};

let sheetCache: SheetCacheEntry | null = null;

export function spreadsheetId(): string {
  return (process.env.BANCO_CATS_SPREADSHEET_ID ?? DEFAULT_SPREADSHEET_ID).trim();
}

export function sheetName(): string {
  return (process.env.BANCO_CATS_SHEET_NAME ?? DEFAULT_SHEET_NAME).trim() || DEFAULT_SHEET_NAME;
}

export { isGoogleSheetsWriteConfigured, googleSheetsWriteConfigError };

export async function appendBancoCatsRow(values: string[]): Promise<'service_account' | 'webhook'> {
  if (!isGoogleSheetsWriteConfigured()) {
    throw new Error(googleSheetsWriteConfigError());
  }

  const writeSource = await appendGoogleSheetRow({
    spreadsheetId: spreadsheetId(),
    sheetName: sheetName(),
    values,
  });

  invalidateBancoCatsSheetCache();
  return writeSource;
}

/**
 * Envia serviços que ainda estão só no banco local para a planilha
 * e remove do banco para evitar duplicidade.
 */
export async function flushPendingBancoCatsManuaisToSheet(): Promise<number> {
  if (!isGoogleSheetsWriteConfigured()) return 0;

  const id = spreadsheetId();
  const manuais = await listBancoCatsManuais(id);
  if (manuais.length === 0) return 0;

  let headers = getCanonicalBancoCatsHeaders();
  try {
    const sheet = await fetchBancoCatsSheet(true);
    if (sheet.headers.length > 0) headers = sheet.headers;
  } catch {
    // mantém headers canônicos
  }

  let flushed = 0;
  for (const manual of manuais) {
    const values = snapshotToCells(headers, manual.rowSnapshot);
    if (values.every((cell) => !cell.trim())) continue;
    await appendGoogleSheetRow({
      spreadsheetId: id,
      sheetName: sheetName(),
      values,
    });
    await deleteBancoCatsManual({ spreadsheetId: id, rowKey: manual.rowKey });
    flushed += 1;
  }

  invalidateBancoCatsSheetCache();
  return flushed;
}

function parseGvizPayload(raw: string): GvizResponse {
  const match = raw.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\)\s*;?\s*$/);
  if (!match) {
    throw new Error('Resposta inválida da planilha Google.');
  }
  return JSON.parse(match[1]) as GvizResponse;
}

function formatNumberBr(value: number): string {
  return value.toLocaleString('pt-BR', {
    maximumFractionDigits: 6,
  });
}

function isBlankOrDash(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  return !t || t === '-' || t === '—' || t === '–' || t === '−';
}

function formatCell(cell: GvizCell | undefined): string {
  if (!cell) return '';
  const formatted = cell.f?.trim() ?? '';
  const value = cell.v;

  // QUANT. e números: o GViz às vezes manda `f` vazio/`-` e o valor real em `v`.
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (isBlankOrDash(formatted)) return formatNumberBr(value);
    return formatted;
  }

  if (!isBlankOrDash(formatted)) return formatted;
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const asText = String(value).trim();
  return isBlankOrDash(asText) ? '' : asText;
}

function normalizeHeader(label: string | null | undefined, index: number): string {
  const text = (label ?? '').trim();
  return text || `Coluna ${index + 1}`;
}

function normalizeHeaderKey(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalizedCandidates = candidates.map(normalizeHeaderKey);

  const exact = headers.findIndex((header) =>
    normalizedCandidates.includes(normalizeHeaderKey(header))
  );
  if (exact >= 0) return exact;

  return headers.findIndex((header) => {
    const key = normalizeHeaderKey(header);
    return normalizedCandidates.some((candidate) => {
      if (!key.includes(candidate)) return false;
      if (candidate === 'fonte' && key !== 'fonte') return false;
      return true;
    });
  });
}

function collectUniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}

function processGvizTable(table: GvizTable): { headers: string[]; rows: string[][] } {
  const rawHeaders = (table.cols ?? []).map((col, index) => normalizeHeader(col.label, index));
  const meaningfulIndexes: number[] = [];

  for (let i = 0; i < rawHeaders.length; i++) {
    const key = normalizeHeaderKey(rawHeaders[i] ?? '');
    if (!key || /^coluna \d+$/.test(key)) continue;
    meaningfulIndexes.push(i);
  }

  // Fallback: se os rótulos vierem vazios, usa as primeiras colunas com dados.
  if (meaningfulIndexes.length === 0) {
    const maxCols = Math.max(
      rawHeaders.length,
      ...(table.rows ?? []).map((row) => row.c?.length ?? 0)
    );
    for (let i = 0; i < maxCols; i++) meaningfulIndexes.push(i);
  }

  const headers = meaningfulIndexes.map((index) => rawHeaders[index] ?? `Coluna ${index + 1}`);
  const rows: string[][] = [];

  for (const row of table.rows ?? []) {
    const cells = meaningfulIndexes.map((index) => formatCell(row.c?.[index]));
    if (cells.every((cell) => !cell.trim())) continue;
    rows.push(cells);
  }

  return { headers, rows };
}

function buildFilterOptions(headers: string[], rows: string[][]) {
  const empresaIdx = findColumnIndex(headers, ['empresa']);
  const undIdx = findColumnIndex(headers, ['und', 'unidade']);
  const fonteIdx = findColumnIndex(headers, ['fonte']);

  const empresas = collectUniqueSorted(
    rows.map((row) => (empresaIdx >= 0 ? row[empresaIdx] ?? '' : '').trim()).filter(Boolean)
  );
  const unidades = collectUniqueSorted(
    rows.map((row) => (undIdx >= 0 ? row[undIdx] ?? '' : '').trim()).filter(Boolean)
  );
  const fontes = collectUniqueSorted(
    rows.map((row) => (fonteIdx >= 0 ? row[fonteIdx] ?? '' : '').trim()).filter(Boolean)
  );

  return { empresas, unidades, fontes };
}

async function mergeManualRows(data: BancoCatsSheetData): Promise<BancoCatsSheetData> {
  const manuais = await listBancoCatsManuais(data.spreadsheetId);
  if (manuais.length === 0) {
    return {
      ...data,
      rowKeys: data.rowKeys.length ? data.rowKeys : data.rows.map((_, index) => `sheet:${index}`),
      manualRowKeys: data.manualRowKeys ?? [],
    };
  }

  const headers =
    data.headers.length > 0 ? data.headers : getCanonicalBancoCatsHeaders();
  const manualRows = manuais.map((manual) => snapshotToCells(headers, manual.rowSnapshot));
  const manualRowKeys = manuais.map((manual) => manual.rowKey);
  const sheetRowKeys =
    data.rowKeys.length === data.rows.length
      ? data.rowKeys
      : data.rows.map((_, index) => `sheet:${index}`);

  const rows = [...manualRows, ...data.rows];
  const rowKeys = [...manualRowKeys, ...sheetRowKeys];

  return {
    ...data,
    headers,
    rows,
    rowKeys,
    manualRowKeys,
    rowCount: rows.length,
    filterOptions: buildFilterOptions(headers, rows),
  };
}

export function invalidateBancoCatsSheetCache(): void {
  sheetCache = null;
}

export async function fetchBancoCatsSheet(forceRefresh = false): Promise<BancoCatsSheetData> {
  if (forceRefresh) {
    sheetCache = null;
  }

  if (sheetCache && sheetCache.expiresAt > Date.now()) {
    // Manuais podem mudar sem invalidar o cache da planilha Google; sempre reanexa.
    return mergeManualRows({
      ...sheetCache.data,
      manualRowKeys: [],
      rowKeys: sheetCache.data.rows.map((_, index) => `sheet:${index}`),
    });
  }

  const id = spreadsheetId();
  const name = sheetName();
  const sheetParam = encodeURIComponent(name);
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${sheetParam}&_=${Date.now()}`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json,text/plain,*/*' },
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar a planilha de CATs (${response.status}).`);
  }

  const raw = await response.text();
  const payload = parseGvizPayload(raw);

  if (payload.status !== 'ok' || !payload.table) {
    throw new Error('Planilha de CATs retornou dados inválidos.');
  }

  const { headers, rows } = processGvizTable(payload.table);
  const baseData: BancoCatsSheetData = {
    spreadsheetId: id,
    sheetName: name,
    headers: headers.length > 0 ? headers : getCanonicalBancoCatsHeaders(),
    rows,
    rowKeys: rows.map((_, index) => `sheet:${index}`),
    manualRowKeys: [],
    rowCount: rows.length,
    filterOptions: buildFilterOptions(headers, rows),
    fetchedAt: new Date().toISOString(),
  };

  sheetCache = {
    data: {
      ...baseData,
      // Cache só a parte da planilha (sem manuais).
      manualRowKeys: [],
      filterOptions: buildFilterOptions(baseData.headers, rows),
    },
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return mergeManualRows(baseData);
}
