import * as XLSX from 'xlsx';
import { formToPayload, parseBudgetToNumber } from '@/lib/pleitoForm';
import { stripOsSePrefix } from '@/lib/formatOsSePasta';
import { PLEITO_HISTORY_MARKER } from '@/lib/pleitoOsExport';

export type OsImportRow = {
  line: number;
  divSe: string;
  serviceDescription: string;
  creationMonth: string;
  creationYear: string;
  folderNumber: string;
  lot: string;
  location: string;
  unit: string;
  budgetStatus: string;
  executionStatus: string;
  startDate: string;
  endDate: string;
  budgetAmount1: number;
  budgetAmount2: number;
  budgetAmount3: number;
  budgetAmount4: number;
  engineer: string;
  supervisor: string;
  pv: string;
  ipi: string;
};

export type PleitoImportRow = {
  line: number;
  divSe: string;
  billingRequest: number;
};

export type FaturamentoImportRow = {
  line: number;
  divSe: string;
  issueDate: string;
  invoiceNumber: string;
  grossValue: number;
  netValue: number;
};

export type OsImportSkipped = { sheet: string; line: number; reasons: string[]; preview: string };

export type OsImportParseResult = {
  osRows: OsImportRow[];
  pleitoRows: PleitoImportRow[];
  faturamentoRows: FaturamentoImportRow[];
  skipped: OsImportSkipped[];
};

const OS_HEADERS = [
  'OS / SE',
  'Descrição do serviço',
  'Mês criação',
  'Ano criação',
  'Nº pasta',
  'Lote',
  'Local',
  'Unidade',
  'Status orçamento',
  'Status execução',
  'Data início',
  'Data término',
  'Orçamento R01',
  'Orçamento R02',
  'Orçamento R03',
  'Orçamento R04',
  'Engenheiro',
  'Encarregado',
  'RVI',
  'RVF',
] as const;

const PLEITO_HEADERS = ['OS / SE', 'Valor pleiteado'] as const;

const FATURAMENTO_HEADERS = [
  'OS / SE',
  'Data de emissão',
  'Número da NF',
  'Valor bruto',
  'Valor líquido',
] as const;

function cell(row: Record<string, unknown>, ...keys: string[]): string {
  const normalizeKey = (k: string) =>
    k
      .trim()
      .toLowerCase()
      .replace(/\s*\*\s*$/g, '')
      .replace(/\s+/g, ' ');
  for (const key of keys) {
    const want = normalizeKey(key);
    const found = Object.keys(row).find((k) => normalizeKey(k) === want);
    if (found == null) continue;
    const v = row[found];
    if (v == null) continue;
    return String(v).trim();
  }
  return '';
}

function parseMoney(raw: string): number {
  return parseBudgetToNumber(raw || null);
}

function normalizeMonth(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const n = parseInt(t.replace(/\D/g, ''), 10);
  if (String(n) === t.replace(/\D/g, '') && n >= 1 && n <= 12) {
    return String(n).padStart(2, '0');
  }
  // Fev_25 / Març_25 na coluna de mês
  const fromLabel = parseMonthYearLabel(t);
  if (fromLabel) return String(fromLabel.month).padStart(2, '0');
  if (n >= 1 && n <= 12 && t.replace(/\D/g, '').length <= 2) {
    return String(n).padStart(2, '0');
  }
  return '';
}

/** Extrai mês/ano de rótulos tipo Fev_25, Març_25, 31-mar-25. */
function parseMonthYearLabel(raw: string): { month: number; year: number } | null {
  const iso = parseImportDate(raw);
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

function excelSerialToIso(n: number): string | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const utc = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTH_ALIASES: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  fev: 2,
  fever: 2,
  fevereiro: 2,
  feb: 2,
  mar: 3,
  marc: 3,
  março: 3,
  marco: 3,
  march: 3,
  abr: 4,
  abril: 4,
  apr: 4,
  april: 4,
  mai: 5,
  maio: 5,
  may: 5,
  jun: 6,
  junho: 6,
  june: 6,
  jul: 7,
  julho: 7,
  july: 7,
  ago: 8,
  agosto: 8,
  aug: 8,
  august: 8,
  set: 9,
  setembro: 9,
  sep: 9,
  sept: 9,
  september: 9,
  out: 10,
  outubro: 10,
  oct: 10,
  october: 10,
  nov: 11,
  novembro: 11,
  november: 11,
  dez: 12,
  dezembro: 12,
  dec: 12,
  december: 12,
};

function resolveMonthToken(token: string): number | null {
  const t = token
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (!t) return null;
  if (MONTH_ALIASES[t] != null) return MONTH_ALIASES[t]!;
  // prefix match (ex.: "març" → marc)
  for (const [k, v] of Object.entries(MONTH_ALIASES)) {
    if (t.startsWith(k) || k.startsWith(t)) return v;
  }
  return null;
}

function expandTwoDigitYear(y: number): number {
  if (y >= 100) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Aceita ISO, BR (dd/mm/aaaa), serial Excel, "31-mar-25", "Fev_25", "Març_25", "Abr_25".
 * Formatos só mês/ano (Fev_25) usam o último dia do mês.
 */
export function parseImportDate(raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return toIso(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }
  if (typeof raw === 'number') {
    return excelSerialToIso(raw) || '';
  }
  const s = String(raw).trim();
  if (!s) return '';
  if (/^\d+(\.\d+)?$/.test(s)) {
    const iso = excelSerialToIso(Number(s));
    if (iso) return iso;
  }
  const br = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (br) {
    const d = Number(br[1]);
    const m = Number(br[2]);
    const y = expandTwoDigitYear(Number(br[3]));
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return toIso(y, m, d);
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // 31-mar-25 / 31/mar/2025 / 31 mar 25
  const dayMonYear = s.match(/^(\d{1,2})[\s./_-]+([A-Za-zçÇãÃéÉôÔ.]+)[\s./_-]+(\d{2,4})$/);
  if (dayMonYear) {
    const day = Number(dayMonYear[1]);
    const month = resolveMonthToken(dayMonYear[2]);
    const year = expandTwoDigitYear(Number(dayMonYear[3]));
    if (month && day >= 1 && day <= 31) return toIso(year, month, day);
  }

  // Fev_25 / Març_25 / Abr-25 / fevereiro/2025
  const monYear = s.match(/^([A-Za-zçÇãÃéÉôÔ.]+)[\s._/-]+(\d{2,4})$/);
  if (monYear) {
    const month = resolveMonthToken(monYear[1]);
    const year = expandTwoDigitYear(Number(monYear[2]));
    if (month) {
      const day = lastDayOfMonth(year, month);
      return toIso(year, month, day);
    }
  }

  return '';
}

function normalizeDivSe(raw: string): string {
  const stripped = stripOsSePrefix(raw);
  return stripped || raw.trim();
}

export function normalizeOsKey(divSe: string | null | undefined): string {
  return normalizeDivSe(divSe || '').toLowerCase();
}

function sheetToObjects(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const sheetName =
    wb.SheetNames.find((n) => n.trim().toLowerCase() === name.toLowerCase()) ||
    wb.SheetNames.find((n) => n.trim().toLowerCase().includes(name.toLowerCase()));
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
}

function rowPreview(row: Record<string, unknown>): string {
  const vals = Object.values(row)
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .slice(0, 3);
  return vals.join(' · ') || '(vazio)';
}

export function downloadOsPleitoBillingTemplate(): void {
  const wb = XLSX.utils.book_new();

  // Obrigatórios vêm preenchidos de exemplo; opcionais ficam em branco.
  const osExample = [
    [...OS_HEADERS],
    [
      'AD-725',
      'Adequação elétrica — exemplo',
      '08',
      '2026',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '10000,00',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
  ];
  const pleitoExample = [[...PLEITO_HEADERS], ['AD-725', '5000,00']];
  const fatExample = [
    [...FATURAMENTO_HEADERS],
    ['AD-725', '15/08/2026', 'NF-12345', '5000,00', ''],
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(osExample), 'OS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pleitoExample), 'Pleito');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fatExample), 'Faturamento');
  XLSX.writeFile(wb, 'modelo-importacao-os-pleito-faturamento.xlsx');
}

export async function parseOsPleitoBillingWorkbook(file: File): Promise<OsImportParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const skipped: OsImportSkipped[] = [];
  const osRows: OsImportRow[] = [];
  const pleitoRows: PleitoImportRow[] = [];
  const faturamentoRows: FaturamentoImportRow[] = [];

  const osRaw = sheetToObjects(wb, 'OS');
  osRaw.forEach((row, idx) => {
    const line = idx + 2;
    const reasons: string[] = [];
    const divSe = normalizeDivSe(cell(row, 'OS / SE', 'OS/SE', 'OS', 'divSe'));
    const serviceDescription = cell(row, 'Descrição do serviço', 'Descricao do serviço', 'Descrição');
    const mesRaw = cell(row, 'Mês criação', 'Mes criação', 'Mês', 'Mes');
    let creationMonth = normalizeMonth(mesRaw);
    let creationYear = cell(row, 'Ano criação', 'Ano').replace(/\D/g, '');
    // Planilhas reais: "Fev_25" no mês e ano vazio
    if ((!creationMonth || !creationYear || creationYear.length !== 4) && mesRaw) {
      const my = parseMonthYearLabel(mesRaw);
      if (my) {
        if (!creationMonth) creationMonth = String(my.month).padStart(2, '0');
        if (!creationYear || creationYear.length !== 4) creationYear = String(my.year);
      }
    }
    // Ano com 2 dígitos
    if (creationYear.length === 2) {
      creationYear = String(expandTwoDigitYear(Number(creationYear)));
    }
    const budgetAmount1 = parseMoney(cell(row, 'Orçamento R01', 'Orcamento R01', 'Orçamento'));
    const budgetAmount2 = parseMoney(cell(row, 'Orçamento R02', 'Orcamento R02'));
    const budgetAmount3 = parseMoney(cell(row, 'Orçamento R03', 'Orcamento R03'));
    const budgetAmount4 = parseMoney(cell(row, 'Orçamento R04', 'Orcamento R04'));
    const hasAnyBudget =
      budgetAmount1 > 0 || budgetAmount2 > 0 || budgetAmount3 > 0 || budgetAmount4 > 0;

    const empty =
      !divSe && !serviceDescription && !creationMonth && !creationYear && !hasAnyBudget;
    if (empty) return;

    if (!divSe) reasons.push('Informe OS / SE');
    if (!serviceDescription) reasons.push('Informe a descrição do serviço');
    if (!creationMonth) reasons.push('Informe o mês de criação (01–12)');
    if (!creationYear || creationYear.length !== 4) reasons.push('Informe o ano de criação (AAAA)');
    if (!hasAnyBudget) reasons.push('Informe ao menos um orçamento (R01–R04)');

    if (reasons.length) {
      skipped.push({ sheet: 'OS', line, reasons, preview: rowPreview(row) });
      return;
    }

    const startRaw = row['Data início'] ?? row['Data inicio'] ?? cell(row, 'Data início', 'Data inicio');
    const endRaw = row['Data término'] ?? row['Data termino'] ?? cell(row, 'Data término', 'Data termino');

    osRows.push({
      line,
      divSe,
      serviceDescription,
      creationMonth,
      creationYear,
      folderNumber: cell(row, 'Nº pasta', 'N pasta', 'Pasta'),
      lot: cell(row, 'Lote'),
      location: cell(row, 'Local'),
      unit: cell(row, 'Unidade'),
      budgetStatus: cell(row, 'Status orçamento', 'Status orcamento'),
      executionStatus: cell(row, 'Status execução', 'Status execucao'),
      startDate: parseImportDate(startRaw),
      endDate: parseImportDate(endRaw),
      budgetAmount1,
      budgetAmount2,
      budgetAmount3,
      budgetAmount4,
      engineer: cell(row, 'Engenheiro'),
      supervisor: cell(row, 'Encarregado'),
      pv: cell(row, 'RVI'),
      ipi: cell(row, 'RVF'),
    });
  });

  const pleitoRaw = sheetToObjects(wb, 'Pleito');
  pleitoRaw.forEach((row, idx) => {
    const line = idx + 2;
    const divSe = normalizeDivSe(cell(row, 'OS / SE', 'OS/SE', 'OS', 'divSe'));
    const billingRequest = parseMoney(cell(row, 'Valor pleiteado', 'Valor'));
    if (!divSe && billingRequest <= 0) return;
    const reasons: string[] = [];
    if (!divSe) reasons.push('Informe OS / SE');
    if (billingRequest <= 0) reasons.push('Informe o valor pleiteado');
    if (reasons.length) {
      skipped.push({ sheet: 'Pleito', line, reasons, preview: rowPreview(row) });
      return;
    }
    pleitoRows.push({ line, divSe, billingRequest });
  });

  const fatRaw = sheetToObjects(wb, 'Faturamento');
  fatRaw.forEach((row, idx) => {
    const line = idx + 2;
    const divSe = normalizeDivSe(cell(row, 'OS / SE', 'OS/SE', 'OS', 'divSe'));
    const issueRaw =
      row['Data de emissão'] ??
      row['Data de emissao'] ??
      cell(row, 'Data de emissão', 'Data de emissao', 'Data emissão');
    const issueDate = parseImportDate(issueRaw);
    const invoiceNumber = cell(row, 'Número da NF', 'Numero da NF', 'Número', 'Numero', 'NF');
    const grossValue = parseMoney(cell(row, 'Valor bruto', 'Bruto'));
    const netRaw = cell(row, 'Valor líquido', 'Valor liquido', 'Líquido');
    const netValue = netRaw ? parseMoney(netRaw) : grossValue;
    if (!divSe && !issueDate && !invoiceNumber && grossValue <= 0) return;
    const reasons: string[] = [];
    if (!divSe) reasons.push('Informe OS / SE');
    if (!issueDate) reasons.push('Informe a data de emissão');
    if (!invoiceNumber) reasons.push('Informe o número da NF');
    if (grossValue <= 0) reasons.push('Informe o valor bruto');
    if (reasons.length) {
      skipped.push({ sheet: 'Faturamento', line, reasons, preview: rowPreview(row) });
      return;
    }
    faturamentoRows.push({
      line,
      divSe,
      issueDate,
      invoiceNumber,
      grossValue,
      netValue: netValue > 0 ? netValue : grossValue,
    });
  });

  return { osRows, pleitoRows, faturamentoRows, skipped };
}

export function osImportRowToPayload(row: OsImportRow, contractId: string) {
  const money = (n: number) =>
    n > 0 ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  const form: Record<string, string> = {
    creationMonth: row.creationMonth,
    creationYear: row.creationYear,
    startDate: row.startDate,
    endDate: row.endDate,
    budgetStatus: row.budgetStatus,
    budgetStatusCustom: '',
    folderNumber: row.folderNumber,
    lot: row.lot,
    divSe: /^(OS|SE)\s/i.test(row.divSe) ? row.divSe : `OS ${row.divSe}`,
    location: row.location,
    unit: row.unit,
    serviceDescription: row.serviceDescription,
    executionStatus: row.executionStatus,
    billingStatus: '',
    accumulatedBilled: '',
    billingRequest: '',
    budgetAmount1: money(row.budgetAmount1),
    budgetAmount2: money(row.budgetAmount2),
    budgetAmount3: money(row.budgetAmount3),
    budgetAmount4: money(row.budgetAmount4),
    pv: row.pv,
    ipi: row.ipi,
    reportsBilling: '',
    engineer: row.engineer,
    supervisor: row.supervisor,
  };
  return formToPayload(form, contractId);
}

export function buildGerarPleitoPayload(
  source: {
    serviceOrderId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    budgetStatus?: string | null;
    folderNumber?: string | null;
    lot?: string | null;
    divSe?: string | null;
    location?: string | null;
    unit?: string | null;
    serviceDescription: string;
    budget?: string | null;
    executionStatus?: string | null;
    budgetAmount1?: number | null;
    budgetAmount2?: number | null;
    budgetAmount3?: number | null;
    budgetAmount4?: number | null;
    pv?: string | null;
    ipi?: string | null;
    engineer?: string | null;
    supervisor?: string | null;
  },
  billingRequest: number
) {
  const now = new Date();
  return {
    serviceOrderId: source.serviceOrderId,
    creationMonth: String(now.getMonth() + 1).padStart(2, '0'),
    creationYear: now.getFullYear(),
    startDate: source.startDate,
    endDate: source.endDate,
    budgetStatus: source.budgetStatus,
    folderNumber: source.folderNumber,
    lot: source.lot,
    divSe: source.divSe,
    location: source.location,
    unit: source.unit,
    serviceDescription: source.serviceDescription,
    budget: source.budget,
    executionStatus: source.executionStatus,
    billingStatus: 'nao-pago',
    billingRequest: billingRequest.toFixed(2),
    invoiceNumber: null,
    budgetAmount1: source.budgetAmount1,
    budgetAmount2: source.budgetAmount2,
    budgetAmount3: source.budgetAmount3,
    budgetAmount4: source.budgetAmount4,
    pv: source.pv,
    ipi: source.ipi,
    reportsBilling: PLEITO_HISTORY_MARKER,
    engineer: source.engineer,
    supervisor: source.supervisor,
  };
}
