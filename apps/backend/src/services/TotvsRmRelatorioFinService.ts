import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import axios, { AxiosError } from 'axios';
import https from 'https';
import { isNaturezaExcludedFromContractPaidTotal, shouldCountInGastosOperacionaisTotal } from '../constants/contractPaidNaturezaExclusions';
import {
  getGastosOperacionaisNaturezaAggKey,
  normalizeGastosOperacionaisNaturezaKey
} from '../constants/gastosOperacionaisDfcBlocks';
import { gastosNaturezaTotalContribution } from '../constants/gastosOperacionaisAllowedNaturezas';
import {
  gastosContractLookupKey,
  normalizeGastosOperacionaisContractName
} from '../lib/gastosOperacionaisContractAliases';

function normPathRel(p: string): string {
  return p.replace(/\/$/, '').trim();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Data em cell RM: texto ISO / dd/MM/yyyy ou serial Excel (~25569 dias desde 1899-12-30). */
export function parseTotvsRowDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = v;
    if (n > 25_000 && n < 600_000) {
      const ms = (n - 25569) * 86400 * 1000;
      const d = new Date(ms);
      if (
        !Number.isNaN(d.getTime()) &&
        d.getUTCFullYear() >= 1980 &&
        d.getUTCFullYear() < 2100
      ) {
        return d;
      }
    }
  }
  const s = String(v).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]);
    const day = Number(iso[3]);
    const h = Number(iso[4] ?? 12);
    const mi = Number(iso[5] ?? 0);
    const sec = Number(iso[6] ?? 0);
    const d = new Date(y, mo - 1, day, h, mi, sec);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
  if (br) {
    const d = Number(br[1]);
    const mo = Number(br[2]);
    const y = Number(br[3]);
    const dt = new Date(y, mo - 1, d, 12, 0, 0);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}

function isoDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Solicitações no contrato: agrupar por mês usando somente data de pagamento. */
function scorePaymentDateColumn(key: string): number {
  const u = normHeaderKey(key);
  const c = u.replace(/\s/g, '');
  if (c.includes('DATAPAGAMENTO') || (u.includes('DATA') && u.includes('PAG'))) return 36;
  return 0;
}

function scoreDateColumn(key: string): number {
  const u = normHeaderKey(key);
  const c = u.replace(/\s/g, '');
  if (c.includes('DATAPAGAMENTO') || (u.includes('DATA') && u.includes('PAG'))) return 36;
  if (u.includes('DATA') && u.includes('LIQUID')) return 32;
  if (u.includes('DATA') && u.includes('LANC')) return 28;
  if (u.includes('DATA') && u.includes('VEN')) return 22;
  if (u.includes('DATA') && u.includes('EMISS')) return 20;
  if (u === 'DATA' || /^DATA\s/.test(u)) return 16;
  if (u.includes('DT ') || u.startsWith('DT_') || u.startsWith('DH_')) return 14;
  if (u.includes('DATA') || u.includes('DT ')) return 8;
  return 0;
}

function norm(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Valores de célula de CC no RM podem vir com NBSP; alinha com norm(). */
function normCcCell(s: string): string {
  return norm(s.replace(/[\u00A0\u2000-\u200B\uFEFF]/g, ' '));
}

/** Normaliza acentos para comparar nomes de colunas vindos do RM (ex.: DESCRIÇÃO). */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** NBSP e espaços unicode → espaço; acentos removidos; caixa e espaços colapsados (headers RM). */
function normHeaderKey(s: string): string {
  return stripAccents(s.replace(/[\u00A0\u2000-\u200B\uFEFF]/g, ' '))
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const SCHEMA_SCAN_ROWS = Math.min(
  5000,
  Math.max(50, Number(process.env.TOTVS_RM_SCHEMA_SCAN_ROWS) || 2000)
);

/** União ordenada das chaves presentes nas primeiras linhas (RM pode omitir chaves null no JSON). */
function allColumnKeys(rows: Record<string, unknown>[], maxRows: number): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const n = Math.min(rows.length, Math.max(1, maxRows));
  for (let i = 0; i < n; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    for (const k of Object.keys(row)) {
      if (seen.has(k)) continue;
      seen.add(k);
      order.push(k);
    }
  }
  return order;
}

function rowKeysFromSample(rows: Record<string, unknown>[], exclude?: Set<string>): string[] {
  return allColumnKeys(rows, SCHEMA_SCAN_ROWS).filter((k) => !exclude?.has(k));
}

function rowsFromColumnsValues(o: Record<string, unknown>): Record<string, unknown>[] | null {
  const colsRaw = o.columns ?? o.Columns ?? o.COLUNAS ?? o.colunas;
  const valsRaw = o.values ?? o.Values ?? o.VALORES ?? o.dados ?? o.Dados;
  if (!Array.isArray(colsRaw) || !Array.isArray(valsRaw)) return null;
  if (!colsRaw.length) return [];
  const names = colsRaw.map((c) => String(c));
  const out: Record<string, unknown>[] = [];
  for (const row of valsRaw) {
    if (!Array.isArray(row)) continue;
    const rec: Record<string, unknown> = {};
    for (let i = 0; i < names.length; i++) rec[names[i]] = row[i];
    out.push(rec);
  }
  return out;
}

function parseMoneyBr(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const cleaned = s.replace(/[^\d,.-]/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    const decSep = lastComma > lastDot ? ',' : '.';
    const thouSep = decSep === ',' ? '.' : ',';
    const n = parseFloat(cleaned.replace(new RegExp(`\\${thouSep}`, 'g'), '').replace(decSep, '.'));
    return Number.isFinite(n) ? n : 0;
  }
  if (cleaned.includes(',')) {
    const n = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  const n = parseFloat(cleaned.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function normalizeTotvsRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    if (payload.length === 0) return [];
    if (typeof payload[0] === 'object' && payload[0] !== null && !Array.isArray(payload[0])) {
      return payload as Record<string, unknown>[];
    }
  }
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const key of ['data', 'Data', 'rows', 'Rows', 'result', 'Result']) {
      const arr = o[key];
      if (Array.isArray(arr) && arr.length && typeof arr[0] === 'object' && arr[0] !== null) {
        return arr as Record<string, unknown>[];
      }
    }
    const fromCv = rowsFromColumnsValues(o);
    if (fromCv !== null && fromCv.length) return fromCv;
  }
  return [];
}

function scoreCcColumn(key: string): number {
  const u = normHeaderKey(key);
  const compact = u.replace(/\s/g, '');
  let s = 0;
  if (compact === 'CODCENTRODECUSTO' || u === 'COD CENTRO DE CUSTO') s += 24;
  if (u === 'CODCCUSTO' || u === 'CODIGOCCUSTO') s += 20;
  if (u.includes('CCUSTO') && u.includes('COD')) s += 14;
  if (u.includes('CENTRO') && u.includes('CUSTO') && u.includes('COD')) s += 16;
  if (u.includes('CENTRO') && u.includes('CUSTO')) s += 12;
  if (u.includes('CCUSTO')) s += 10;
  if (u.includes('CUSTO') && u.includes('COD')) s += 8;
  if (u === 'CC' || u === 'CODCC') s += 5;
  return s;
}

/** Preferência por colunas de nome/descrição do CC (ex.: CENTRO DE CUSTO = GCCUSTO.NOME). */
function scoreCcNameColumn(key: string): number {
  const u = normHeaderKey(key);
  const compact = u.replace(/\s/g, '');
  if (u === 'CENTRO DE CUSTO' || compact === 'CENTRODECUSTO') return 32;
  if (u.includes('NOME') && (u.includes('CCUSTO') || u.includes('CENTRO') || u.includes('CUSTO'))) {
    return 28;
  }
  if (u.includes('CENTRO') && u.includes('CUSTO') && !u.includes('COD') && !u.includes('CODIGO')) {
    return 26;
  }
  if (ccColumnIsLikelyNumericCodeHeader(key)) return 0;
  if (u.includes('CCUSTO') && (u.includes('COD') || u.includes('CODIGO'))) return 0;
  return 0;
}

function looksLikeHierarchicalCcCode(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (/^\d{1,4}(\.\d{2,})+$/.test(t)) return true;
  if (/^\d{1,2}$/.test(t)) return true;
  return false;
}

function pickCcNameColumn(
  rows: Record<string, unknown>[],
  excludeKeys?: Set<string>
): string | null {
  const envOverride =
    process.env.TOTVS_RM_CC_NAME_COLUMN?.trim() ||
    process.env.TOTVS_RM_GASTOS_CC_NAME_COLUMN?.trim() ||
    undefined;
  return pickColumn(rows, scoreCcNameColumn, envOverride, excludeKeys);
}

function resolveCcDisplayLabelFromRow(
  row: Record<string, unknown>,
  nameCol: string | null,
  codeCol: string | null
): string {
  const preferredCols = [nameCol, codeCol].filter(Boolean) as string[];
  const seen = new Set<string>();

  for (const col of preferredCols) {
    if (seen.has(col)) continue;
    seen.add(col);
    const value = String(row[col] ?? '').trim();
    if (value && !looksLikeHierarchicalCcCode(value)) return value;
  }

  for (const [key, raw] of Object.entries(row)) {
    const header = normHeaderKey(key);
    if (!header.includes('CENTRO') || !header.includes('CUSTO')) continue;
    if (header.includes('COD') || header.includes('CODIGO')) continue;
    const value = String(raw ?? '').trim();
    if (value && !looksLikeHierarchicalCcCode(value)) return value;
  }

  for (const col of preferredCols) {
    const value = String(row[col] ?? '').trim();
    if (value) return value;
  }

  return '';
}

function scoreValueColumn(key: string): number {
  const u = normHeaderKey(key);
  const compact = u.replace(/\s/g, '');
  let s = 0;
  if (u.includes('VALOR') && u.includes('ORIGI')) s += 22;
  if (compact === 'VALORORIGI' || u === 'VALOR ORIGI') s += 22;
  if (u.includes('VALOR') && u.includes('PAGO')) s += 20;
  if (u.includes('VLRLIQUIDO') || u === 'VL_LIQUIDO') s += 18;
  if (u.includes('TOTAL') && u.includes('PAGO')) s += 16;
  if (u === 'VALOR' || u === 'VALORLAN' || u === 'VALORORIGINAL') s += 8;
  if (u.includes('VALOR')) s += 6;
  if (u.includes('PAGO') || u.includes('LIQUIDO')) s += 5;
  if (u.includes('TOTAL')) s += 4;
  if (u.includes('VL')) s += 3;
  return s;
}

function scorePoloColumn(key: string): number {
  const u = normHeaderKey(key);
  const compact = u.replace(/\s/g, '');
  if (u === 'POLO' || compact === 'POLO') return 40;
  if (u.includes('POLO') && !u.includes('EMPRESA')) return 35;
  if (u === 'UF' || compact === 'UF') return 32;
  if (u.includes('FILIAL') && (u.includes('COD') || u.includes('SIGLA'))) return 28;
  if (u.includes('ESTADO') && u.includes('SIGLA')) return 24;
  return 0;
}

function scoreNaturezaCodeColumn(key: string): number {
  const u = normHeaderKey(key);
  const compact = u.replace(/\s/g, '');
  if (compact === 'CODIGONATUREZA' || (u.includes('CODIGO') && u.includes('NATUREZA'))) return 30;
  if (u.includes('CODNAT') || u.includes('COD_NATUREZ') || u.includes('CODNATUREZA')) return 20;
  return 0;
}

function looksLikeHierarchicalNatureCode(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  return /^\d+(\.\d+)+$/.test(t);
}

function resolveNatureLabelFromRow(
  row: Record<string, unknown>,
  nameCol: string | null,
  codeCol: string | null
): string {
  const preferredCols = [nameCol, codeCol].filter(Boolean) as string[];
  const seen = new Set<string>();

  for (const col of preferredCols) {
    if (seen.has(col)) continue;
    seen.add(col);
    const value = String(row[col] ?? '').trim();
    if (!value) continue;
    if (col === nameCol || !looksLikeHierarchicalNatureCode(value)) return value;
  }

  for (const [key, raw] of Object.entries(row)) {
    const header = normHeaderKey(key);
    if (!header.includes('NATUREZA')) continue;
    if (header.includes('COD') || header.includes('CODIGO')) continue;
    const value = String(raw ?? '').trim();
    if (value && !looksLikeHierarchicalNatureCode(value)) return value;
  }

  for (const col of preferredCols) {
    const value = String(row[col] ?? '').trim();
    if (value) return value;
  }

  return '—';
}

function scoreNaturezaColumn(key: string): number {
  const u = normHeaderKey(key);
  const compact = u.replace(/\s/g, '');
  let s = 0;
  // Aliases comuns no RELATORIOFIN / consultas de caixa (RM)
  if (compact === 'NATUREZAFINANCEIRA' || u === 'NATUREZA FINANCEIRA') s += 32;
  if (u.includes('NATUREZA') && u.includes('FINANCEIRA')) s += 30;
  if (compact === 'CODIGONATUREZA' || (u.includes('CODIGO') && u.includes('NATUREZA'))) s += 28;
  if (u.includes('NATUREZA') && (u.includes('DESCR') || u.includes('DESC'))) s += 22;
  if (u === 'NATUREZA' || u === 'NATURAZA') s += 18;
  if (u.includes('NATUREZA')) s += 14;
  if (u.includes('CODNAT') || u.includes('COD_NATUREZ') || u.includes('CODNATUREZA')) s += 12;
  if (u.includes('NOMENAT') || u.includes('DESCNAT')) s += 10;
  if (u.includes('PLANO') && u.includes('CONT')) s += 6;
  return s;
}

function pickColumn(
  rows: Record<string, unknown>[],
  scorer: (k: string) => number,
  envOverride: string | undefined,
  excludeKeys?: Set<string>
): string | null {
  if (!rows.length) return null;
  const keys = rowKeysFromSample(rows, excludeKeys);
  const ex = (envOverride || '').trim();
  if (ex) {
    const exact = keys.find((k) => k === ex);
    if (exact) return exact;
    const exNorm = normHeaderKey(ex);
    const ci = keys.find((k) => normHeaderKey(k) === exNorm || k.toUpperCase() === ex.toUpperCase());
    if (ci) return ci;
  }
  const ranked = keys
    .map((k) => ({ k, score: scorer(k) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.k ?? null;
}

/** Natureza: aliases com espaço (ex.: "NATUREZA FINANCEIRA") + fallback por regex. */
function pickNaturezaColumn(
  rows: Record<string, unknown>[],
  excludeKeys: Set<string>
): string | null {
  const picked = pickColumn(rows, scoreNaturezaColumn, process.env.TOTVS_RM_NATUREZA_COLUMN, excludeKeys);
  if (picked) return picked;
  const keys = rowKeysFromSample(rows, excludeKeys);
  if (!keys.length) return null;
  const reNf = /\bnatureza\b.*\bfinanceira\b|\bfinanceira\b.*\bnatureza\b/i;
  const reCn = /\bcodigo\b.*\bnatureza\b|\bnatureza\b.*\bcodigo\b/i;
  const byDesc = keys.find((k) => reNf.test(stripAccents(k)));
  if (byDesc) return byDesc;
  const byCod = keys.find((k) => reCn.test(stripAccents(k)));
  return byCod || null;
}

/**
 * Após um trecho igual ao código de CC na célula, não pode vir dígito nem '.'
 * (evita que "102.01.01.01" case como filho de "102.01.01.01.034" via p.includes(c)).
 */
function codeFragmentBoundaryOk(before: string | undefined, after: string | undefined): boolean {
  const continuesCode = (ch: string | undefined) => ch !== undefined && ch !== '' && /[0-9.]/.test(ch);
  return !continuesCode(before) && !continuesCode(after);
}

const NAME_SUBSTR_MIN_LEN = Math.max(
  4,
  Math.min(20, Number(process.env.TOTVS_RM_CC_NAME_SUBSTR_MIN_LEN) || 7)
);

/**
 * Compara célula do RM com o CC do contrato (sem p.includes(c), que misturava CC pai/filho).
 * Se a coluna detectada for de código (ex.: COD CENTRO DE CUSTO), usa só o código do contrato.
 */
function ccColumnIsLikelyNumericCodeHeader(ccCol: string | null): boolean {
  if (!ccCol) return false;
  const u = normHeaderKey(ccCol);
  const compact = u.replace(/\s/g, '');
  if (compact === 'CODCENTRODECUSTO' || u === 'COD CENTRO DE CUSTO') return true;
  if (u === 'CODCCUSTO' || u === 'CODIGO CCUSTO' || u === 'CODIGOCCUSTO') return true;
  return (u.includes('COD') || u.includes('CODIGO')) && (u.includes('CCUSTO') || u.includes('CENTRO'));
}

function cellMatchesCostCenterCodeOnly(raw: unknown, code: string): boolean {
  const c = normCcCell(String(raw ?? ''));
  const nc = normCcCell(code).trim();
  if (!c || !nc) return false;
  if (c === nc) return true;
  if (nc.length < 3) return false;
  let from = 0;
  while ((from = c.indexOf(nc, from)) !== -1) {
    const before = from > 0 ? c[from - 1] : undefined;
    const after = from + nc.length < c.length ? c[from + nc.length] : undefined;
    if (codeFragmentBoundaryOk(before, after)) return true;
    from += 1;
  }
  if (c.startsWith(`${nc} `) || c.startsWith(`${nc}-`) || c.startsWith(`${nc}/`)) return true;
  return false;
}

function cellMatchesCostCenter(raw: unknown, code: string, name: string): boolean {
  const c = normCcCell(String(raw ?? ''));
  if (!c) return false;
  const nc = normCcCell(code).trim();
  const nn = normCcCell(name).trim();

  if (nc && c === nc) return true;
  if (nn && c === nn) return true;

  if (nc.length >= 3) {
    let from = 0;
    while ((from = c.indexOf(nc, from)) !== -1) {
      const before = from > 0 ? c[from - 1] : undefined;
      const after = from + nc.length < c.length ? c[from + nc.length] : undefined;
      if (codeFragmentBoundaryOk(before, after)) return true;
      from += 1;
    }
    if (c.startsWith(`${nc} `) || c.startsWith(`${nc}-`) || c.startsWith(`${nc}/`)) return true;
  }

  if (nn.length >= NAME_SUBSTR_MIN_LEN) {
    const delim = (ch: string | undefined) =>
      ch === undefined || ch === '' || /[\s\-/|,;]/.test(ch) || ch === '\u2013' || ch === '\u2014';
    let from = 0;
    while ((from = c.indexOf(nn, from)) !== -1) {
      const before = from > 0 ? c[from - 1] : undefined;
      const after = from + nn.length < c.length ? c[from + nn.length] : undefined;
      if (delim(before) && delim(after)) return true;
      from += 1;
    }
  }

  return false;
}

function cellMatchesCostCenterForRow(
  raw: unknown,
  code: string,
  name: string,
  ccHeader: string | null
): boolean {
  const forceCode =
    String(process.env.TOTVS_RM_CC_MATCH_CODE_ONLY || '')
      .trim()
      .toLowerCase() === '1' ||
    String(process.env.TOTVS_RM_CC_MATCH_CODE_ONLY || '')
      .trim()
      .toLowerCase() === 'true' ||
    String(process.env.TOTVS_RM_CC_MATCH_CODE_ONLY || '')
      .trim()
      .toLowerCase() === 'yes';
  const nc = normCcCell(code).trim();
  if (forceCode || (ccColumnIsLikelyNumericCodeHeader(ccHeader) && nc.length >= 3)) {
    return cellMatchesCostCenterCodeOnly(raw, code);
  }
  return cellMatchesCostCenter(raw, code, name);
}

function scoreStatusColumn(key: string): number {
  const u = normHeaderKey(key);
  if (u === 'STATUS') return 24;
  if (u.includes('STATUS')) return 16;
  return 0;
}

/** Valores de STATUS permitidos na soma (ex.: PAGAMENTO), separados por vírgula; vazio = sem filtro. */
function parseStatusIncludeNormSet(): Set<string> | null {
  const raw = String(process.env.TOTVS_RM_STATUS_INCLUDE || '').trim();
  if (!raw) return null;
  const set = new Set<string>();
  for (const part of raw.split(/[,;]/)) {
    const p = norm(part);
    if (p) set.add(p);
  }
  return set.size ? set : null;
}

function scoreHistoricoColumn(key: string): number {
  const u = normHeaderKey(key);
  const c = u.replace(/\s/g, '');
  if (u === 'HISTORICO' || c === 'HISTORICO') return 100;
  if (u.includes('HISTORICO')) return 80;
  if (u.includes('COMPLEMENTO')) return 78;
  if (u.includes('OBSERV')) return 72;
  if (u.includes('DESCRICAO') || u.includes('DESCRIÇÃO')) return 68;
  if (u.includes('TITULO') && u.includes('SOLICIT')) return 70;
  if (u.includes('MEMO') || u.includes('TEXTO')) return 55;
  return 0;
}

function scoreDocumentoColumn(key: string): number {
  const u = normHeaderKey(key).replace(/\s/g, '');
  if (u === 'NUMERODOCUMENTO' || u === 'NUMDOCUMENTO') return 90;
  if (u.includes('NUMERO') && u.includes('DOCUMENTO')) return 85;
  if (u.includes('DOCUMENTO') && !u.includes('TIPO')) return 50;
  return 0;
}

function scoreFornecedorColumn(key: string): number {
  const u = normHeaderKey(key);
  if (u.includes('FORNECEDOR') && u.includes('NOME')) return 70;
  if (u.includes('FORNECEDOR')) return 60;
  if (u.includes('RAZAO SOCIAL') || u.includes('RAZÃO SOCIAL')) return 50;
  return 0;
}

function scoreSolicitacaoIdColumn(key: string): number {
  const u = normHeaderKey(key).replace(/\s/g, '');
  if (u === 'IDMOV') return 100;
  if (u.includes('NUMPROCES') || u.includes('NUMEROPROCESSO')) return 90;
  if (u.includes('NUMEROPEDIDO')) return 40;
  return 0;
}

function parseGastosPeriodYmd(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Filtra lançamentos individuais pela data de pagamento exata (não pelo mês civil). */
function paymentDateIntersectsGastosPeriod(
  paymentDate: Date,
  periodFrom: string,
  periodTo: string
): boolean {
  if (!periodFrom && !periodTo) return true;
  const from = periodFrom ? parseGastosPeriodYmd(periodFrom) : null;
  const to = periodTo ? parseGastosPeriodYmd(periodTo) : null;
  if ((periodFrom && !from) || (periodTo && !to)) return true;

  const day = new Date(
    paymentDate.getFullYear(),
    paymentDate.getMonth(),
    paymentDate.getDate(),
    12,
    0,
    0,
    0
  );
  const rangeStart = from ?? day;
  const rangeEnd = to ?? day;
  if (rangeStart > rangeEnd) return false;
  return day >= rangeStart && day <= rangeEnd;
}

function gastosContractsMatch(a: string, b: string): boolean {
  return gastosContractLookupKey(a) === gastosContractLookupKey(b);
}

function pickRowFieldValue(row: Record<string, unknown>, ...candidates: string[]): string {
  for (const candidate of candidates) {
    const direct = row[candidate];
    if (direct != null) {
      const value = String(direct).trim();
      if (value) return value;
    }
    const candidateNorm = normHeaderKey(candidate);
    for (const [key, raw] of Object.entries(row)) {
      if (normHeaderKey(key) !== candidateNorm) continue;
      const value = String(raw ?? '').trim();
      if (value) return value;
    }
  }
  return '';
}

function truncateSolicitacaoTitulo(text: string): string {
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function looksLikeSolicitacaoMetaValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^\d+([.,]\d+)?$/.test(trimmed)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) return true;
  return false;
}

function resolveTextoSolicitacaoFromRow(
  row: Record<string, unknown>,
  excludeCols: ReadonlySet<string>
): string {
  const preferred = pickRowFieldValue(
    row,
    'HISTORICO',
    'HISTÓRICO',
    'COMPLEMENTO',
    'OBSERVACAO',
    'OBSERVAÇÃO',
    'DESCRICAO',
    'DESCRIÇÃO',
    'MEMO',
    'TEXTO'
  );
  if (preferred) return preferred;

  let bestScore = 0;
  let bestValue = '';
  for (const [key, raw] of Object.entries(row)) {
    if (excludeCols.has(key)) continue;
    const value = String(raw ?? '').trim();
    if (!value || looksLikeSolicitacaoMetaValue(value)) continue;
    const score = Math.max(scoreHistoricoColumn(key), scoreDocumentoColumn(key), scoreFornecedorColumn(key));
    if (score > bestScore) {
      bestScore = score;
      bestValue = value;
    }
  }
  return bestValue;
}

function buildSolicitacaoTitulo(
  row: Record<string, unknown>,
  cols: {
    histCol: string | null;
    idCol: string | null;
    fornecedorCol: string | null;
    docCol: string | null;
    excludeCols: ReadonlySet<string>;
    natureza?: string;
  }
): string {
  const histFromCol = cols.histCol ? String(row[cols.histCol] ?? '').trim() : '';
  const hist =
    histFromCol ||
    resolveTextoSolicitacaoFromRow(
      row,
      new Set([...cols.excludeCols, cols.histCol, cols.idCol, cols.fornecedorCol, cols.docCol].filter(Boolean) as string[])
    );
  if (hist) return truncateSolicitacaoTitulo(hist);

  const fornecedor =
    (cols.fornecedorCol ? String(row[cols.fornecedorCol] ?? '').trim() : '') ||
    pickRowFieldValue(
      row,
      'FORNECEDOR',
      'CODIGO-NOME DO FORNECEDOR',
      'NOME DO FORNECEDOR',
      'RAZAO SOCIAL',
      'RAZÃO SOCIAL'
    );
  const doc =
    (cols.docCol ? String(row[cols.docCol] ?? '').trim() : '') ||
    pickRowFieldValue(row, 'NUMERODOCUMENTO', 'NUMERO DOCUMENTO', 'NÚMERODOCUMENTO', 'DOCUMENTO');
  if (fornecedor && doc) return truncateSolicitacaoTitulo(`${fornecedor} · Doc. ${doc}`);
  if (fornecedor) return truncateSolicitacaoTitulo(fornecedor);
  if (doc) return truncateSolicitacaoTitulo(`Doc. ${doc}`);

  const id =
    (cols.idCol ? String(row[cols.idCol] ?? '').trim() : '') ||
    pickRowFieldValue(row, 'IDMOV', 'NUMPROCES', 'NUMEROPROCESSO', 'NUMEROPEDIDO', 'IDXCX');
  if (id) return `Mov. ${id}`;

  const natureza = (cols.natureza ?? '').trim();
  if (natureza && natureza !== '—') return truncateSolicitacaoTitulo(natureza);

  return 'Solicitação';
}

function buildSolicitacaoDetalhes(
  row: Record<string, unknown>,
  columns: string[],
  priorityCols: readonly (string | null)[]
): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (key: string | null) => {
    if (!key) return;
    const raw = row[key];
    if (raw == null) return;
    const value = String(raw).trim();
    if (!value || out[key]) return;
    out[key] = value;
  };

  for (const key of priorityCols) add(key);
  for (const key of columns) {
    if (Object.keys(out).length >= 24) break;
    if (priorityCols.includes(key)) continue;
    add(key);
  }
  return out;
}

export interface GastosOperacionaisNaturezaSolicitacaoLancamentoRow {
  linhaId: string;
  valor: number;
  dataISO: string | null;
  detalhes: Record<string, string>;
}

export interface GastosOperacionaisNaturezaSolicitacaoRow {
  linhaId: string;
  natureza: string;
  valor: number;
  dataISO: string | null;
  dataISOFim?: string | null;
  titulo: string;
  detalhes: Record<string, string>;
  quantidadeLancamentos?: number;
  lancamentosAgrupados?: GastosOperacionaisNaturezaSolicitacaoLancamentoRow[];
}

function normalizeSolicitacaoGroupKey(titulo: string): string {
  return titulo.trim().toUpperCase().replace(/\s+/g, ' ');
}

function aggregateGastosNaturezaSolicitacoesByTitulo(
  rows: GastosOperacionaisNaturezaSolicitacaoRow[]
): GastosOperacionaisNaturezaSolicitacaoRow[] {
  const groups = new Map<string, GastosOperacionaisNaturezaSolicitacaoRow[]>();

  for (const row of rows) {
    const key = `${row.natureza}::${normalizeSolicitacaoGroupKey(row.titulo)}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const aggregated: GastosOperacionaisNaturezaSolicitacaoRow[] = [];

  for (const items of groups.values()) {
    if (items.length === 1) {
      aggregated.push(items[0]);
      continue;
    }

    const titulo = items[0].titulo;
    const natureza = items[0].natureza;
    const valor = items.reduce((sum, item) => sum + item.valor, 0);
    const dates = items
      .map((item) => item.dataISO)
      .filter((date): date is string => Boolean(date))
      .sort();
    const dataISO = dates.length ? dates[dates.length - 1] : null;
    const dataISOFim = dates.length > 1 ? dates[0] : null;
    const lancamentosAgrupados = [...items]
      .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
      .map((item) => ({
        linhaId: item.linhaId,
        valor: item.valor,
        dataISO: item.dataISO,
        detalhes: item.detalhes
      }));

    aggregated.push({
      linhaId: `agg:${normalizeSolicitacaoGroupKey(`${natureza}::${titulo}`)}`,
      natureza,
      valor,
      dataISO,
      dataISOFim,
      titulo,
      quantidadeLancamentos: items.length,
      lancamentosAgrupados,
      detalhes: {
        ...items[0].detalhes,
        'Lançamentos agrupados': String(items.length)
      }
    });
  }

  return aggregated;
}

export interface TotvsRelatorioFinNaturezaRow {
  natureza: string;
  total: number;
  count: number;
}

export interface TotvsRmPaidLineDetail {
  valor: number;
  natureza: string;
  dataISO: string | null;
}

export interface TotvsRmPaidByCalendarMonth {
  year: number;
  month: number;
  total: number;
  count: number;
  lines: TotvsRmPaidLineDetail[];
}

export interface TotvsRmPaidUndatedBucket {
  total: number;
  count: number;
  lines: TotvsRmPaidLineDetail[];
}

export interface TotvsRelatorioFinSumResult {
  total: number;
  matchedRowCount: number;
  totalRowCount: number;
  ccColumn: string | null;
  valueColumn: string | null;
  naturezaColumn: string | null;
  totalsByNatureza: TotvsRelatorioFinNaturezaRow[];
  /** Amostra dos valores da coluna de CC nas linhas que entraram na soma (conferência do filtro). */
  sampleCcValuesMatched: string[];
  /** Datas via coluna detectada (ou TOTVS_RM_DATE_COLUMN); sem data → paidUndated. */
  dateColumn: string | null;
  paidByCalendarMonth: TotvsRmPaidByCalendarMonth[];
  paidUndated: TotvsRmPaidUndatedBucket | null;
  /**
   * Soma mensal para a linha «Solicitações» no contrato: filtra só pelo CC do contrato + data + valor,
   * sem excluir por natureza operacional (diferente do Total Pago).
   * Opcionalmente usa TOTVS_RM_SOLICITACOES_PATH (outra consulta SQL no RM).
   */
  solicitacoesByCalendarMonth: TotvsRmPaidByCalendarMonth[];
  solicitacoesUndated: TotvsRmPaidUndatedBucket | null;
  solicitacoesMatchedRowCount: number;
  solicitacoesDateColumn: string | null;
  solicitacoesValueColumn: string | null;
  solicitacoesCcColumn: string | null;
}

export type TotvsRmSumOptions = {
  /** Não monta arrays `lines` (resposta mais leve e rápida para contratos). */
  omitLines?: boolean;
  /** Datasets já carregados (evita nova consulta HTTP ao RM). */
  rows?: Record<string, unknown>[];
  solicitationRows?: Record<string, unknown>[];
};

export type TotvsRmSumForCodesResult = {
  result: TotvsRelatorioFinSumResult;
  lookupCodeUsed: string;
};

export class TotvsRmRelatorioFinService {
  private relatorioRowsCache: { rows: Record<string, unknown>[]; at: number } | null = null;
  private pathRowsCache = new Map<string, { rows: Record<string, unknown>[]; at: number }>();

  isConfigured(): boolean {
    const base = (process.env.TOTVS_RM_BASE_URL || '').trim();
    const bearer = (process.env.TOTVS_RM_BEARER_TOKEN || '').trim();
    const user = (process.env.TOTVS_RM_USER || process.env.TOTVS_RM_USERNAME || '').trim();
    const pass = (process.env.TOTVS_RM_PASSWORD || '').trim();
    return !!base && (!!bearer || (!!user && !!pass));
  }

  private defaultRelatorioPath(): string {
    return (
      (process.env.TOTVS_RM_RELATORIOFIN_PATH || '').trim() ||
      '/api/framework/v1/consultaSQLServer/RealizaConsulta/RELATORIOFIN/0/F'
    );
  }

  private buildUrlFromPath(pathRel: string): string {
    const base = (process.env.TOTVS_RM_BASE_URL || '').replace(/\/$/, '');
    const p = pathRel.startsWith('/') ? pathRel : `/${pathRel}`;
    return `${base}${p}`;
  }

  private authHeader(): string {
    const user = (process.env.TOTVS_RM_USER || process.env.TOTVS_RM_USERNAME || '').trim();
    const pass = (process.env.TOTVS_RM_PASSWORD || '').trim();
    if (!user || !pass) return '';
    return `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
  }

  private rmCacheTtlMs(): number {
    const n = Number(process.env.TOTVS_RM_CACHE_TTL_MS);
    if (Number.isFinite(n) && n >= 0) return n;
    return 10 * 60 * 1000;
  }

  private cacheFresh(entry: { at: number } | null | undefined): entry is { at: number } {
    return !!entry && Date.now() - entry.at < this.rmCacheTtlMs();
  }

  /** Cache em memória do RELATORIOFIN — vários contratos reutilizam a mesma carga. */
  private async getRelatorioRowsCached(): Promise<Record<string, unknown>[]> {
    if (this.cacheFresh(this.relatorioRowsCache)) return this.relatorioRowsCache!.rows;
    const rows = await this.fetchRelatorioRows();
    this.relatorioRowsCache = { rows, at: Date.now() };
    return rows;
  }

  private async getRowsForPathCached(pathRel: string): Promise<Record<string, unknown>[]> {
    const key = normPathRel(pathRel);
    const hit = this.pathRowsCache.get(key);
    if (this.cacheFresh(hit)) return hit!.rows;
    const rows = await this.fetchRowsForPath(pathRel);
    this.pathRowsCache.set(key, { rows, at: Date.now() });
    return rows;
  }

  async fetchRowsForPath(pathRel: string): Promise<Record<string, unknown>[]> {
    const url = this.buildUrlFromPath(pathRel);
    const bearer = (process.env.TOTVS_RM_BEARER_TOKEN || '').trim();
    const rejectUnauthorized =
      String(process.env.TOTVS_RM_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';
    const httpsAgent = new https.Agent({ rejectUnauthorized });
    const timeout = Number(process.env.TOTVS_RM_TIMEOUT_MS) || 120000;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
    if (bearer) {
      headers.Authorization = `Bearer ${bearer}`;
    } else {
      const basic = this.authHeader();
      if (!basic) {
        throw new Error('TOTVS_RM: configure TOTVS_RM_BEARER_TOKEN ou TOTVS_RM_USER + TOTVS_RM_PASSWORD');
      }
      headers.Authorization = basic;
    }

    const res = await axios.get<unknown>(url, {
      headers,
      timeout,
      httpsAgent,
      validateStatus: () => true
    });

    if (res.status < 200 || res.status >= 300) {
      const msg = typeof res.data === 'string' ? res.data.slice(0, 500) : JSON.stringify(res.data).slice(0, 500);
      throw new Error(`RM consulta HTTP ${res.status}: ${msg}`);
    }

    return normalizeTotvsRows(res.data);
  }

  async fetchRelatorioRows(): Promise<Record<string, unknown>[]> {
    return this.fetchRowsForPath(this.defaultRelatorioPath());
  }

  defaultProdutosAtivosPath(): string {
    return (
      (process.env.TOTVS_RM_PRODUTOSATIVOS_PATH || '').trim() ||
      '/api/framework/v1/consultaSQLServer/RealizaConsulta/PRODUTOSATIVOS/1/T'
    );
  }

  private produtosAtivosFallbackPaths(): string[] {
    const custom = (process.env.TOTVS_RM_PRODUTOSATIVOS_PATH || '').trim();
    if (custom) return [custom];
    return [
      '/api/framework/v1/consultaSQLServer/RealizaConsulta/PRODUTOSATIVOS/1/T',
      '/api/framework/v1/consultaSQLServer/RealizaConsulta/PRODUTOSATIVOS/1/G',
      '/api/framework/v1/consultaSQLServer/RealizaConsulta/PRODUTOSATIVOS/0/F',
    ];
  }

  async fetchProdutosAtivosRows(): Promise<Record<string, unknown>[]> {
    const paths = this.produtosAtivosFallbackPaths();
    let lastError: Error | null = null;

    for (const pathRel of paths) {
      try {
        const rows = await this.fetchRowsForPath(pathRel);
        this.pathRowsCache.set(normPathRel(pathRel), { rows, at: Date.now() });
        return rows;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const retryable =
          lastError.message.includes('HTTP 401') ||
          lastError.message.includes('HTTP 403') ||
          lastError.message.includes('HTTP 404');
        if (!retryable) throw lastError;
      }
    }

    throw lastError ?? new Error('Falha ao buscar PRODUTOSATIVOS no TOTVS RM');
  }

  private static readonly EXTRATO_CAIXA_DEFAULT_CONSULTA = 'EXTRATOCX2026';

  /** Ano configurado para o extrato (env ou extraído do path EXTRATOCX{ano}). */
  getExtratoCaixaConfiguredYears(): number[] {
    const paths = this.extratoCaixaPaths();
    const fromPaths = paths
      .map((p) => TotvsRmRelatorioFinService.yearFromExtratoCaixaPath(p))
      .filter((y): y is number => y != null);
    if (fromPaths.length > 0) {
      return [...new Set(fromPaths)].sort((a, b) => b - a);
    }
    return this.parseExtratoCaixaYearsEnv();
  }

  private static yearFromExtratoCaixaPath(path: string): number | null {
    const match = path.match(/EXTRATOCX(\d{4})/i);
    if (!match) return null;
    const year = Number(match[1]);
    return year >= 1980 && year <= 2100 ? year : null;
  }

  private extratoCaixaPathForConsulta(consulta: string): string {
    const slug = consulta.replace(/^\/+|\/+$/g, '');
    return `/api/framework/v1/consultaSQLServer/RealizaConsulta/${slug}/1/G`;
  }

  private parseExtratoCaixaYearsEnv(): number[] {
    const years = (process.env.TOTVS_RM_EXTRATO_CAIXA_YEARS || '2026')
      .split(/[,;\s]+/)
      .map((y) => Number(y.trim()))
      .filter((y) => Number.isFinite(y) && y >= 1980 && y <= 2100);
    return [...new Set(years)].sort((a, b) => b - a);
  }

  /** Caminho RM do extrato de caixa (padrão: EXTRATOCX2026). */
  private extratoCaixaPaths(): string[] {
    const pathsEnv = (process.env.TOTVS_RM_EXTRATO_CAIXA_PATHS || '').trim();
    if (pathsEnv) {
      return pathsEnv
        .split(/[,;\n]+/)
        .map((p) => p.trim())
        .filter(Boolean);
    }

    const singlePath = (process.env.TOTVS_RM_EXTRATO_CAIXA_PATH || '').trim();
    if (singlePath) return [singlePath];

    const years = (process.env.TOTVS_RM_EXTRATO_CAIXA_YEARS || '2026')
      .split(/[,;\s]+/)
      .map((y) => y.trim())
      .filter(Boolean);

    if (years.length > 0) {
      return years.map((year) =>
        this.extratoCaixaPathForConsulta(`EXTRATOCX${year}`)
      );
    }

    return [
      this.extratoCaixaPathForConsulta(TotvsRmRelatorioFinService.EXTRATO_CAIXA_DEFAULT_CONSULTA),
    ];
  }

  async fetchExtratoCaixaRows(): Promise<{
    rows: Record<string, unknown>[];
    configuredYears: number[];
    pathFailures: Array<{ path: string; error: string }>;
  }> {
    const paths = this.extratoCaixaPaths();
    const configuredYears = this.getExtratoCaixaConfiguredYears();
    const results = await Promise.allSettled(paths.map((p) => this.fetchRowsForPath(p)));
    const rows: Record<string, unknown>[] = [];
    const pathFailures: Array<{ path: string; error: string }> = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const path = paths[i];
      if (result.status === 'fulfilled') {
        rows.push(...result.value);
        continue;
      }
      const msg =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      pathFailures.push({ path, error: msg });
      console.warn(`[TOTVS RM EXTRATO CAIXA] Falha em ${path}: ${msg}`);
    }

    if (!rows.length && pathFailures.length) {
      throw new Error(pathFailures.map((f) => `${f.path}: ${f.error}`).join(' | '));
    }

    return { rows, configuredYears, pathFailures };
  }

  /**
   * Uma carga do RM + tentativa de vários códigos de CC (ex.: 102… e 02…) só em memória.
   */
  async sumForCostCenterCodesAsync(
    codes: string[],
    name: string,
    options?: Pick<TotvsRmSumOptions, 'omitLines'>
  ): Promise<TotvsRmSumForCodesResult> {
    const unique = [...new Set(codes.map((c) => String(c ?? '').trim()).filter(Boolean))];
    const list = unique.length ? unique : [''];

    const rows = await this.getRelatorioRowsCached();
    const solicitationRows = await this.resolveSolicitationRows(rows);

    const sumOpts: TotvsRmSumOptions = {
      omitLines: options?.omitLines ?? true,
      rows,
      solicitationRows
    };

    let best = await this.sumForCostCenterAsync(list[0], name, sumOpts);
    let used = list[0];

    for (let i = 1; i < list.length; i++) {
      if (best.matchedRowCount > 0) break;
      const attempt = await this.sumForCostCenterAsync(list[i], name, sumOpts);
      const better =
        attempt.matchedRowCount > best.matchedRowCount ||
        (attempt.matchedRowCount > 0 &&
          attempt.matchedRowCount === best.matchedRowCount &&
          attempt.total > best.total);
      if (better) {
        best = attempt;
        used = list[i];
      }
    }

    return { result: best, lookupCodeUsed: used };
  }

  private async resolveSolicitationRows(
    relatorioRows: Record<string, unknown>[]
  ): Promise<Record<string, unknown>[]> {
    const solPathRaw = (process.env.TOTVS_RM_SOLICITACOES_PATH || '').trim();
    const defaultPath = this.defaultRelatorioPath();
    if (!solPathRaw || normPathRel(solPathRaw) === normPathRel(defaultPath)) {
      return relatorioRows;
    }
    try {
      const alt = await this.getRowsForPathCached(solPathRaw);
      return alt.length ? alt : relatorioRows;
    } catch (e) {
      console.warn(
        '[TOTVS RM SOLICITACOES] Falha ao buscar TOTVS_RM_SOLICITACOES_PATH; usando RELATORIOFIN.',
        e instanceof Error ? e.message : e
      );
      return relatorioRows;
    }
  }

  async sumForCostCenterAsync(
    code: string,
    name: string,
    options?: TotvsRmSumOptions
  ): Promise<TotvsRelatorioFinSumResult> {
    const omitLines = options?.omitLines ?? false;
    const rows = options?.rows ?? (await this.getRelatorioRowsCached());
    if (!rows.length) {
      return {
        total: 0,
        matchedRowCount: 0,
        totalRowCount: 0,
        ccColumn: null,
        valueColumn: null,
        naturezaColumn: null,
        totalsByNatureza: [],
        sampleCcValuesMatched: [],
        dateColumn: null,
        paidByCalendarMonth: [],
        paidUndated: null,
        solicitacoesByCalendarMonth: [],
        solicitacoesUndated: null,
        solicitacoesMatchedRowCount: 0,
        solicitacoesDateColumn: null,
        solicitacoesValueColumn: null,
        solicitacoesCcColumn: null
      };
    }

    const ccCol = pickColumn(rows, scoreCcColumn, process.env.TOTVS_RM_CC_COLUMN);
    const ccExclude = ccCol ? new Set<string>([ccCol]) : undefined;
    const valCol = pickColumn(rows, scoreValueColumn, process.env.TOTVS_RM_VALUE_COLUMN, ccExclude);
    const natCol = pickNaturezaColumn(rows, new Set([ccCol, valCol].filter(Boolean) as string[]));

    const statusAllowed = parseStatusIncludeNormSet();
    const excludeForStatus = new Set([ccCol, valCol, natCol].filter(Boolean) as string[]);
    const statusCol =
      statusAllowed && statusAllowed.size > 0
        ? pickColumn(rows, scoreStatusColumn, process.env.TOTVS_RM_STATUS_COLUMN, excludeForStatus)
        : null;
    if (statusAllowed && statusAllowed.size > 0 && !statusCol) {
      console.warn(
        '[TOTVS RM RELATORIOFIN] TOTVS_RM_STATUS_INCLUDE definido, mas coluna STATUS não detectada. Defina TOTVS_RM_STATUS_COLUMN. Somando sem filtro de STATUS.'
      );
    }

    if (!valCol) {
      throw new Error(
        'RELATORIOFIN: não foi possível detectar coluna de valor. Defina TOTVS_RM_VALUE_COLUMN com o nome exato da coluna.'
      );
    }

    const LINE_CAP = Math.min(
      500,
      Math.max(
        20,
        Number(
          String(process.env.TOTVS_RM_PAID_LINES_CAP_PER_MONTH || '')
            .trim()
            .replace(',', '.')
        ) || 200
      )
    );

    const dateExcludeKeys = new Set<string>(
      [ccCol, valCol, natCol, statusCol].filter(Boolean) as string[]
    );
    const dateCol = pickColumn(rows, scoreDateColumn, process.env.TOTVS_RM_DATE_COLUMN, dateExcludeKeys);

    let matchedRowCount = 0;
    let total = 0;
    const naturezaMap = new Map<string, { total: number; count: number }>();
    const sampleCc = new Set<string>();

    type MonthAgg = { total: number; count: number; lines: TotvsRmPaidLineDetail[] };
    const byYm = new Map<string, MonthAgg>();
    let undatedAgg: MonthAgg = { total: 0, count: 0, lines: [] };

    const pushLimited = (bucket: MonthAgg, line: TotvsRmPaidLineDetail) => {
      if (omitLines) return;
      if (bucket.lines.length < LINE_CAP) bucket.lines.push(line);
    };

    const accumulateIncluded = (row: Record<string, unknown>) => {
      const nkRaw = natCol ? String(row[natCol] ?? '').trim() : '';
      const natLabel = nkRaw === '' ? '—' : nkRaw;
      if (isNaturezaExcludedFromContractPaidTotal(natLabel)) return;

      matchedRowCount += 1;
      const v = parseMoneyBr(row[valCol]);
      total += v;
      if (ccCol) {
        const rawCc = String(row[ccCol] ?? '').trim();
        if (rawCc && sampleCc.size < 24) sampleCc.add(rawCc);
      }
      if (natCol) {
        const cur = naturezaMap.get(natLabel) ?? { total: 0, count: 0 };
        cur.total += v;
        cur.count += 1;
        naturezaMap.set(natLabel, cur);
      }

      const parsed = dateCol ? parseTotvsRowDate(row[dateCol]) : null;
      const line: TotvsRmPaidLineDetail = {
        valor: v,
        natureza: natLabel,
        dataISO: parsed && !Number.isNaN(parsed.getTime()) ? isoDateOnly(parsed) : null
      };

      if (parsed && !Number.isNaN(parsed.getTime())) {
        const ym = `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}`;
        const b = byYm.get(ym) ?? { total: 0, count: 0, lines: [] };
        b.total += v;
        b.count += 1;
        pushLimited(b, line);
        byYm.set(ym, b);
      } else {
        undatedAgg.total += v;
        undatedAgg.count += 1;
        pushLimited(undatedAgg, { valor: v, natureza: natLabel, dataISO: null });
      }
    };

    if (ccCol) {
      for (const row of rows) {
        const cell = row[ccCol];
        if (!cellMatchesCostCenterForRow(cell, code, name, ccCol)) continue;
        if (statusCol && statusAllowed && !statusAllowed.has(norm(String(row[statusCol] ?? '')))) continue;
        accumulateIncluded(row);
      }
    } else {
      const multi = String(process.env.TOTVS_RM_MATCH_ALL_ROWS || '')
        .trim()
        .toLowerCase();
      if (multi === '1' || multi === 'true' || multi === 'yes') {
        for (const row of rows) {
          accumulateIncluded(row);
        }
      } else {
        throw new Error(
          'RELATORIOFIN: não foi possível detectar coluna de centro de custo. Defina TOTVS_RM_CC_COLUMN (ex.: CODCCUSTO ou NOME).'
        );
      }
    }

    // --- Solicitações (contrato): CC + data + valor ---
    const solicitationRows =
      options?.solicitationRows ?? (await this.resolveSolicitationRows(rows));

    const solCcCol = pickColumn(
      solicitationRows,
      scoreCcColumn,
      process.env.TOTVS_RM_SOLICITACOES_CC_COLUMN || process.env.TOTVS_RM_CC_COLUMN
    );
    const solValExclude = solCcCol ? new Set<string>([solCcCol]) : undefined;
    const solValCol = pickColumn(
      solicitationRows,
      scoreValueColumn,
      process.env.TOTVS_RM_SOLICITACOES_VALUE_COLUMN || process.env.TOTVS_RM_VALUE_COLUMN,
      solValExclude
    );
    const solNatCol = pickNaturezaColumn(
      solicitationRows,
      new Set([solCcCol, solValCol].filter(Boolean) as string[])
    );

    const solUseStatus = ['1', 'true', 'yes'].includes(
      String(process.env.TOTVS_RM_SOLICITACOES_USE_STATUS_FILTER || '').trim().toLowerCase()
    );
    const solStatusAllowed = solUseStatus ? parseStatusIncludeNormSet() : null;
    const solExcludeForStatus = new Set([solCcCol, solValCol, solNatCol].filter(Boolean) as string[]);
    const solStatusCol =
      solStatusAllowed && solStatusAllowed.size > 0
        ? pickColumn(
            solicitationRows,
            scoreStatusColumn,
            process.env.TOTVS_RM_SOLICITACOES_STATUS_COLUMN || process.env.TOTVS_RM_STATUS_COLUMN,
            solExcludeForStatus
          )
        : null;

    const solDateExcludeKeys = new Set<string>(
      [solCcCol, solValCol, solNatCol, solStatusCol].filter(Boolean) as string[]
    );
    const solDateEnv =
      process.env.TOTVS_RM_SOLICITACOES_DATE_COLUMN || process.env.TOTVS_RM_DATE_COLUMN;
    let solDateCol = pickColumn(
      solicitationRows,
      scorePaymentDateColumn,
      solDateEnv,
      solDateExcludeKeys
    );
    if (!solDateCol && !solDateEnv?.trim()) {
      solDateCol = pickColumn(
        solicitationRows,
        scoreDateColumn,
        undefined,
        solDateExcludeKeys
      );
      if (solDateCol) {
        console.warn(
          '[TOTVS RM SOLICITACOES] Coluna de data de pagamento não detectada; usando coluna genérica:',
          solDateCol
        );
      }
    }

    let solicitacoesMatchedRowCount = 0;
    const solByYm = new Map<string, MonthAgg>();
    let solUndatedAgg: MonthAgg = { total: 0, count: 0, lines: [] };

    const accumulateSolicitacao = (row: Record<string, unknown>) => {
      if (!solValCol) return;
      const nkRaw = solNatCol ? String(row[solNatCol] ?? '').trim() : '';
      const natLabel = nkRaw === '' ? '—' : nkRaw;
      if (isNaturezaExcludedFromContractPaidTotal(natLabel)) return;

      solicitacoesMatchedRowCount += 1;
      const v = parseMoneyBr(row[solValCol]);
      const parsed = solDateCol ? parseTotvsRowDate(row[solDateCol]) : null;
      const line: TotvsRmPaidLineDetail = {
        valor: v,
        natureza: natLabel,
        dataISO: parsed && !Number.isNaN(parsed.getTime()) ? isoDateOnly(parsed) : null
      };
      if (parsed && !Number.isNaN(parsed.getTime())) {
        const ym = `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}`;
        const b = solByYm.get(ym) ?? { total: 0, count: 0, lines: [] };
        b.total += v;
        b.count += 1;
        pushLimited(b, line);
        solByYm.set(ym, b);
      } else {
        solUndatedAgg.total += v;
        solUndatedAgg.count += 1;
        pushLimited(solUndatedAgg, { valor: v, natureza: natLabel, dataISO: null });
      }
    };

    if (solCcCol && solValCol) {
      for (const row of solicitationRows) {
        const cell = row[solCcCol];
        if (!cellMatchesCostCenterForRow(cell, code, name, solCcCol)) continue;
        if (
          solStatusCol &&
          solStatusAllowed &&
          solStatusAllowed.size > 0 &&
          !solStatusAllowed.has(norm(String(row[solStatusCol] ?? '')))
        ) {
          continue;
        }
        accumulateSolicitacao(row);
      }
    } else if (!solCcCol && solValCol) {
      const multi = String(process.env.TOTVS_RM_MATCH_ALL_ROWS || '')
        .trim()
        .toLowerCase();
      if (multi === '1' || multi === 'true' || multi === 'yes') {
        for (const row of solicitationRows) {
          accumulateSolicitacao(row);
        }
      } else if ((process.env.TOTVS_RM_SOLICITACOES_PATH || '').trim()) {
        console.warn(
          '[TOTVS RM SOLICITACOES] Dataset de solicitações sem coluna de centro de custo detectada. Defina TOTVS_RM_SOLICITACOES_CC_COLUMN ou TOTVS_RM_CC_COLUMN.'
        );
      }
    }

    const solicitacoesByCalendarMonth = [...solByYm.entries()]
      .map(([ym, b]) => {
        const parts = ym.split('-');
        const yearN = Number(parts[0]);
        const monthN = Number(parts[1]);
        return { year: yearN, month: monthN, total: b.total, count: b.count, lines: b.lines };
      })
      .filter((x) => Number.isFinite(x.year) && Number.isFinite(x.month))
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

    const solicitacoesUndated =
      solUndatedAgg.count > 0
        ? { total: solUndatedAgg.total, count: solUndatedAgg.count, lines: solUndatedAgg.lines }
        : null;

    const totalsByNatureza = [...naturezaMap.entries()]
      .map(([natureza, agg]) => ({ natureza, total: agg.total, count: agg.count }))
      .sort((a, b) => b.total - a.total);

    const paidByCalendarMonth = [...byYm.entries()]
      .map(([ym, b]) => {
        const parts = ym.split('-');
        const year = Number(parts[0]);
        const month = Number(parts[1]);
        return { year, month, total: b.total, count: b.count, lines: b.lines };
      })
      .filter((x) => Number.isFinite(x.year) && Number.isFinite(x.month))
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

    const paidUndated =
      undatedAgg.count > 0
        ? { total: undatedAgg.total, count: undatedAgg.count, lines: undatedAgg.lines }
        : null;

    return {
      total,
      matchedRowCount,
      totalRowCount: rows.length,
      ccColumn: ccCol,
      valueColumn: valCol,
      naturezaColumn: natCol,
      totalsByNatureza,
      sampleCcValuesMatched: [...sampleCc].slice(0, 15),
      dateColumn: dateCol,
      paidByCalendarMonth,
      paidUndated,
      solicitacoesByCalendarMonth,
      solicitacoesUndated,
      solicitacoesMatchedRowCount,
      solicitacoesDateColumn: solDateCol,
      solicitacoesValueColumn: solValCol,
      solicitacoesCcColumn: solCcCol
    };
  }

  formatAxiosError(err: unknown): string {
    const ax = err as AxiosError<{ message?: string }>;
    if (ax?.response?.status) {
      const body =
        typeof ax.response.data === 'string'
          ? ax.response.data
          : ax.response.data?.message || JSON.stringify(ax.response.data);
      return `Erro RM (${ax.response.status}): ${String(body).slice(0, 400)}`;
    }
    if (ax?.message) return ax.message;
    return String(err);
  }

  /**
   * Gastos operacionais: todos os centros de custo do RELATORIOFIN (ou solicitações),
   * agrupados por CC + mês/ano — sem depender de contratos cadastrados.
   */
  async listGastosOperacionaisDetailRows(): Promise<{
    detailRows: Array<{
      contract: string;
      dateISO: string;
      month: number;
      year: number;
      total: number;
      polo: string | null;
    }>;
    naturezaDetailRows: Array<{
      contract: string;
      dateISO: string;
      month: number;
      year: number;
      natureza: string;
      total: number;
    }>;
    totvsNaturezaCatalog: Array<{
      label: string;
      /** Soma líquida com sinal do TOTVS (positivo = crédito/entrada, negativo = débito/saída). */
      total: number;
      totalAbs: number;
      isConfigured: boolean;
      byContract: Array<{ contract: string; total: number }>;
    }>;
    ccColumn: string | null;
    valueColumn: string | null;
    dateColumn: string | null;
    poloColumn: string | null;
    totalRowCount: number;
    costCenterCount: number;
  }> {
    const rows = await this.getRelatorioRowsCached();
    if (!rows.length) {
      return {
        detailRows: [],
        naturezaDetailRows: [],
        totvsNaturezaCatalog: [],
        ccColumn: null,
        valueColumn: null,
        dateColumn: null,
        poloColumn: null,
        totalRowCount: 0,
        costCenterCount: 0
      };
    }

    const solicitationRows = await this.resolveSolicitationRows(rows);

    const solCcNameCol = pickCcNameColumn(solicitationRows);
    const solCcCodeCol = pickColumn(
      solicitationRows,
      scoreCcColumn,
      process.env.TOTVS_RM_CC_CODE_COLUMN ||
        process.env.TOTVS_RM_SOLICITACOES_CC_COLUMN ||
        process.env.TOTVS_RM_CC_COLUMN,
      solCcNameCol ? new Set([solCcNameCol]) : undefined
    );
    const solCcCol = solCcNameCol ?? solCcCodeCol;

    const solCcExclude = new Set(
      [solCcNameCol, solCcCodeCol].filter(Boolean) as string[]
    );
    const solValCol = pickColumn(
      solicitationRows,
      scoreValueColumn,
      process.env.TOTVS_RM_SOLICITACOES_VALUE_COLUMN || process.env.TOTVS_RM_VALUE_COLUMN,
      solCcExclude.size ? solCcExclude : undefined
    );
    const solNatCol = pickNaturezaColumn(
      solicitationRows,
      new Set([...solCcExclude, solValCol].filter(Boolean) as string[])
    );
    const solNatCodeExclude = new Set(
      [...solCcExclude, solValCol, solNatCol].filter(Boolean) as string[]
    );
    const solNatCodeCol = pickColumn(
      solicitationRows,
      scoreNaturezaCodeColumn,
      process.env.TOTVS_RM_NATUREZA_CODE_COLUMN,
      solNatCodeExclude
    );

    const solUseStatus = ['1', 'true', 'yes'].includes(
      String(process.env.TOTVS_RM_SOLICITACOES_USE_STATUS_FILTER || '').trim().toLowerCase()
    );
    const solStatusAllowed = solUseStatus ? parseStatusIncludeNormSet() : null;
    const solExcludeForStatus = new Set(
      [...solCcExclude, solValCol, solNatCol].filter(Boolean) as string[]
    );
    const solStatusCol =
      solStatusAllowed && solStatusAllowed.size > 0
        ? pickColumn(
            solicitationRows,
            scoreStatusColumn,
            process.env.TOTVS_RM_SOLICITACOES_STATUS_COLUMN || process.env.TOTVS_RM_STATUS_COLUMN,
            solExcludeForStatus
          )
        : null;

    const solDateExcludeKeys = new Set<string>(
      [...solCcExclude, solValCol, solNatCol, solStatusCol].filter(Boolean) as string[]
    );
    const solDateEnv =
      process.env.TOTVS_RM_SOLICITACOES_DATE_COLUMN || process.env.TOTVS_RM_DATE_COLUMN;
    let solDateCol = pickColumn(
      solicitationRows,
      scorePaymentDateColumn,
      solDateEnv,
      solDateExcludeKeys
    );
    if (!solDateCol && !solDateEnv?.trim()) {
      solDateCol = pickColumn(solicitationRows, scoreDateColumn, undefined, solDateExcludeKeys);
    }

    const solPoloExclude = new Set(
      [...solCcExclude, solValCol, solNatCol, solStatusCol, solDateCol].filter(Boolean) as string[]
    );
    const solPoloCol = pickColumn(
      solicitationRows,
      scorePoloColumn,
      process.env.TOTVS_RM_POLO_COLUMN,
      solPoloExclude
    );

    if (!solCcCol || !solValCol) {
      throw new Error(
        'RELATORIOFIN: não foi possível detectar colunas de centro de custo e valor. Defina TOTVS_RM_CC_NAME_COLUMN (ou CENTRO DE CUSTO) e TOTVS_RM_VALUE_COLUMN.'
      );
    }

    const byCcDate = new Map<string, Map<string, number>>();
    const byCcDateNat = new Map<string, Map<string, Map<string, number>>>();
    const totvsNaturezaTotals = new Map<
      string,
      {
        label: string;
        total: number;
        totalAbs: number;
        isConfigured: boolean;
        byContract: Map<string, number>;
      }
    >();
    const poloByCc = new Map<string, string>();
    const costCenters = new Set<string>();

    for (const row of solicitationRows) {
      if (
        solStatusCol &&
        solStatusAllowed &&
        solStatusAllowed.size > 0 &&
        !solStatusAllowed.has(norm(String(row[solStatusCol] ?? '')))
      ) {
        continue;
      }

      const nkRaw = resolveNatureLabelFromRow(row, solNatCol, solNatCodeCol);
      const natLabel = nkRaw === '' ? '—' : nkRaw;

      const cc = resolveCcDisplayLabelFromRow(row, solCcNameCol, solCcCodeCol);
      if (!cc) continue;

      if (solPoloCol && !poloByCc.has(cc)) {
        const poloRaw = String(row[solPoloCol] ?? '').trim();
        if (poloRaw) poloByCc.set(cc, poloRaw);
      }

      const parsed = solDateCol ? parseTotvsRowDate(row[solDateCol]) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) continue;

      const dataISO = isoDateOnly(parsed);

      const v = parseMoneyBr(row[solValCol]);
      if (v === 0) continue;

      if (natLabel !== '—') {
        const natKey = normalizeGastosOperacionaisNaturezaKey(natLabel);
        if (natKey) {
          const existingNat = totvsNaturezaTotals.get(natKey) ?? {
            label: natLabel,
            total: 0,
            totalAbs: 0,
            isConfigured: false,
            byContract: new Map<string, number>()
          };
          existingNat.total += v;
          existingNat.totalAbs += Math.abs(v);
          existingNat.byContract.set(cc, (existingNat.byContract.get(cc) ?? 0) + v);
          existingNat.isConfigured =
            existingNat.isConfigured || shouldCountInGastosOperacionaisTotal(natLabel);
          totvsNaturezaTotals.set(natKey, existingNat);
        }
      }

      costCenters.add(cc);
      if (shouldCountInGastosOperacionaisTotal(natLabel)) {
        const ccBucket = byCcDate.get(cc) ?? new Map<string, number>();
        ccBucket.set(
          dataISO,
          (ccBucket.get(dataISO) ?? 0) + gastosNaturezaTotalContribution(natLabel, v)
        );
        byCcDate.set(cc, ccBucket);
      }

      const ccNatBucket = byCcDateNat.get(cc) ?? new Map<string, Map<string, number>>();
      const dateNatBucket = ccNatBucket.get(dataISO) ?? new Map<string, number>();
      dateNatBucket.set(natLabel, (dateNatBucket.get(natLabel) ?? 0) + v);
      ccNatBucket.set(dataISO, dateNatBucket);
      byCcDateNat.set(cc, ccNatBucket);
    }

    const detailRows: Array<{
      contract: string;
      dateISO: string;
      month: number;
      year: number;
      total: number;
      polo: string | null;
    }> = [];
    for (const [contract, dateMap] of byCcDate) {
      const polo = poloByCc.get(contract) ?? null;
      for (const [dateISO, total] of dateMap) {
        const parsed = parseGastosPeriodYmd(dateISO);
        if (!parsed || total === 0) continue;
        detailRows.push({
          contract,
          dateISO,
          month: parsed.getMonth() + 1,
          year: parsed.getFullYear(),
          total,
          polo
        });
      }
    }

    const naturezaDetailRows: Array<{
      contract: string;
      dateISO: string;
      month: number;
      year: number;
      natureza: string;
      total: number;
    }> = [];
    for (const [contract, dateNatMap] of byCcDateNat) {
      for (const [dateISO, natMap] of dateNatMap) {
        const parsed = parseGastosPeriodYmd(dateISO);
        if (!parsed) continue;
        const month = parsed.getMonth() + 1;
        const year = parsed.getFullYear();
        for (const [natureza, total] of natMap) {
          if (total === 0) continue;
          if (!shouldCountInGastosOperacionaisTotal(natureza)) continue;
          naturezaDetailRows.push({ contract, dateISO, month, year, natureza, total });
        }
      }
    }

    detailRows.sort((a, b) => {
      const byContract = a.contract.localeCompare(b.contract, 'pt-BR');
      if (byContract !== 0) return byContract;
      return a.dateISO.localeCompare(b.dateISO);
    });

    naturezaDetailRows.sort((a, b) => {
      const byContract = a.contract.localeCompare(b.contract, 'pt-BR');
      if (byContract !== 0) return byContract;
      if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
      return a.natureza.localeCompare(b.natureza, 'pt-BR');
    });

    const totvsNaturezaCatalog = Array.from(totvsNaturezaTotals.values())
      .map((row) => ({
        label: row.label,
        total: row.total,
        totalAbs: row.totalAbs,
        isConfigured: row.isConfigured,
        byContract: Array.from(row.byContract.entries())
          .map(([contract, total]) => ({ contract, total }))
          .filter((entry) => entry.total !== 0)
          .sort((a, b) => a.contract.localeCompare(b.contract, 'pt-BR'))
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

    return {
      detailRows,
      naturezaDetailRows,
      totvsNaturezaCatalog,
      ccColumn: solCcNameCol ?? solCcCodeCol,
      valueColumn: solValCol,
      dateColumn: solDateCol,
      poloColumn: solPoloCol,
      totalRowCount: solicitationRows.length,
      costCenterCount: costCenters.size
    };
  }

  /**
   * Solicitações individuais do RM para uma natureza agregada no modal de Gastos Operacionais.
   */
  async listGastosOperacionaisNaturezaSolicitacoes(input: {
    contract: string;
    canonicalNatureza: string;
    periodFrom: string;
    periodTo: string;
  }): Promise<GastosOperacionaisNaturezaSolicitacaoRow[]> {
    const contract = normalizeGastosOperacionaisContractName(input.contract.trim());
    const targetAggKey = getGastosOperacionaisNaturezaAggKey(input.canonicalNatureza.trim());
    if (!contract || !targetAggKey || targetAggKey === '—') return [];

    const rows = await this.getRelatorioRowsCached();
    if (!rows.length) return [];

    const solicitationRows = await this.resolveSolicitationRows(rows);
    if (!solicitationRows.length) return [];

    const solCcNameCol = pickCcNameColumn(solicitationRows);
    const solCcCodeCol = pickColumn(
      solicitationRows,
      scoreCcColumn,
      process.env.TOTVS_RM_CC_CODE_COLUMN ||
        process.env.TOTVS_RM_SOLICITACOES_CC_COLUMN ||
        process.env.TOTVS_RM_CC_COLUMN,
      solCcNameCol ? new Set([solCcNameCol]) : undefined
    );
    const solCcCol = solCcNameCol ?? solCcCodeCol;
    const solCcExclude = new Set(
      [solCcNameCol, solCcCodeCol].filter(Boolean) as string[]
    );
    const solValCol = pickColumn(
      solicitationRows,
      scoreValueColumn,
      process.env.TOTVS_RM_SOLICITACOES_VALUE_COLUMN || process.env.TOTVS_RM_VALUE_COLUMN,
      solCcExclude.size ? solCcExclude : undefined
    );
    const solNatCol = pickNaturezaColumn(
      solicitationRows,
      new Set([...solCcExclude, solValCol].filter(Boolean) as string[])
    );
    const solNatCodeExclude = new Set(
      [...solCcExclude, solValCol, solNatCol].filter(Boolean) as string[]
    );
    const solNatCodeCol = pickColumn(
      solicitationRows,
      scoreNaturezaCodeColumn,
      process.env.TOTVS_RM_NATUREZA_CODE_COLUMN,
      solNatCodeExclude
    );

    const solUseStatus = ['1', 'true', 'yes'].includes(
      String(process.env.TOTVS_RM_SOLICITACOES_USE_STATUS_FILTER || '').trim().toLowerCase()
    );
    const solStatusAllowed = solUseStatus ? parseStatusIncludeNormSet() : null;
    const solExcludeForStatus = new Set(
      [...solCcExclude, solValCol, solNatCol].filter(Boolean) as string[]
    );
    const solStatusCol =
      solStatusAllowed && solStatusAllowed.size > 0
        ? pickColumn(
            solicitationRows,
            scoreStatusColumn,
            process.env.TOTVS_RM_SOLICITACOES_STATUS_COLUMN || process.env.TOTVS_RM_STATUS_COLUMN,
            solExcludeForStatus
          )
        : null;

    const solDateExcludeKeys = new Set<string>(
      [...solCcExclude, solValCol, solNatCol, solStatusCol].filter(Boolean) as string[]
    );
    const solDateEnv =
      process.env.TOTVS_RM_SOLICITACOES_DATE_COLUMN || process.env.TOTVS_RM_DATE_COLUMN;
    let solDateCol = pickColumn(
      solicitationRows,
      scorePaymentDateColumn,
      solDateEnv,
      solDateExcludeKeys
    );
    if (!solDateCol && !solDateEnv?.trim()) {
      solDateCol = pickColumn(solicitationRows, scoreDateColumn, undefined, solDateExcludeKeys);
    }

    const solMetaExclude = new Set(
      [...solCcExclude, solValCol, solNatCol, solStatusCol, solDateCol, solNatCodeCol].filter(
        Boolean
      ) as string[]
    );
    const solHistCol = pickColumn(
      solicitationRows,
      scoreHistoricoColumn,
      process.env.TOTVS_RM_SOLICITACOES_HISTORICO_COLUMN,
      solMetaExclude
    );
    const solIdCol = pickColumn(
      solicitationRows,
      scoreSolicitacaoIdColumn,
      process.env.TOTVS_RM_SOLICITACOES_ID_COLUMN,
      new Set([...solMetaExclude, solHistCol].filter(Boolean) as string[])
    );
    const solFornecedorCol = pickColumn(
      solicitationRows,
      scoreFornecedorColumn,
      process.env.TOTVS_RM_SOLICITACOES_FORNECEDOR_COLUMN,
      new Set([...solMetaExclude, solHistCol, solIdCol].filter(Boolean) as string[])
    );
    const solDocCol = pickColumn(
      solicitationRows,
      scoreDocumentoColumn,
      process.env.TOTVS_RM_SOLICITACOES_DOCUMENTO_COLUMN,
      new Set([...solMetaExclude, solHistCol, solIdCol, solFornecedorCol].filter(Boolean) as string[])
    );

    if (!solCcCol || !solValCol) return [];

    const allColumns = allColumnKeys(solicitationRows, SCHEMA_SCAN_ROWS);
    const priorityCols = [
      solHistCol,
      solIdCol,
      solFornecedorCol,
      solDocCol,
      solNatCol,
      solNatCodeCol,
      solValCol,
      solDateCol,
      solStatusCol,
      solCcNameCol,
      solCcCodeCol
    ];

    const solicitacoes: GastosOperacionaisNaturezaSolicitacaoRow[] = [];
    let lineIndex = 0;

    for (const row of solicitationRows) {
      if (
        solStatusCol &&
        solStatusAllowed &&
        solStatusAllowed.size > 0 &&
        !solStatusAllowed.has(norm(String(row[solStatusCol] ?? '')))
      ) {
        continue;
      }

      const cc = resolveCcDisplayLabelFromRow(row, solCcNameCol, solCcCodeCol);
      if (!cc || !gastosContractsMatch(cc, contract)) continue;

      const nkRaw = resolveNatureLabelFromRow(row, solNatCol, solNatCodeCol);
      const natLabel = nkRaw === '' ? '—' : nkRaw;
      if (!shouldCountInGastosOperacionaisTotal(natLabel)) continue;
      if (getGastosOperacionaisNaturezaAggKey(natLabel) !== targetAggKey) continue;

      const parsed = solDateCol ? parseTotvsRowDate(row[solDateCol]) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) continue;

      if (!paymentDateIntersectsGastosPeriod(parsed, input.periodFrom, input.periodTo)) continue;

      const v = parseMoneyBr(row[solValCol]);
      if (v === 0) continue;

      lineIndex += 1;
      const dataISO = isoDateOnly(parsed);
      solicitacoes.push({
        linhaId: `${gastosContractLookupKey(contract)}:${targetAggKey}:${lineIndex}:${dataISO}:${v}`,
        natureza: natLabel,
        valor: v,
        dataISO,
        titulo: buildSolicitacaoTitulo(row, {
          histCol: solHistCol,
          idCol: solIdCol,
          fornecedorCol: solFornecedorCol,
          docCol: solDocCol,
          excludeCols: solMetaExclude,
          natureza: natLabel
        }),
        detalhes: buildSolicitacaoDetalhes(row, allColumns, priorityCols)
      });
    }

    const agrupadas = aggregateGastosNaturezaSolicitacoesByTitulo(solicitacoes);

    agrupadas.sort((a, b) => {
      const byValor = Math.abs(b.valor) - Math.abs(a.valor);
      if (byValor !== 0) return byValor;
      const ta = a.dataISO ? new Date(`${a.dataISO}T12:00:00`).getTime() : 0;
      const tb = b.dataISO ? new Date(`${b.dataISO}T12:00:00`).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return a.titulo.localeCompare(b.titulo, 'pt-BR');
    });

    return agrupadas;
  }
}

let singleton: TotvsRmRelatorioFinService | null = null;

export function getTotvsRmRelatorioFinService(): TotvsRmRelatorioFinService {
  if (!singleton) singleton = new TotvsRmRelatorioFinService();
  return singleton;
}
