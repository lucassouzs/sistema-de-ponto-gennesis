import * as XLSX from 'xlsx';

export type ConsorcioKey = 'bsb' | 'hub';

export type ReceitaStatus =
  | 'MOBILIZAÇÃO'
  | 'RECEBIDO'
  | 'PENDENTE'
  | 'PENDENTE PARCIAL'
  | 'CANCELADA';

export type ReceitaRow = {
  id: string;
  consorcio: ConsorcioKey;
  mes: string;
  nf: string;
  faturamento: number | null;
  recebimentoLiquido: number | null;
  status: ReceitaStatus;
  statusData?: string;
};

export type RepasseRow = {
  id: string;
  consorcio: ConsorcioKey;
  fornecedor: string;
  parcela: string;
  dataEmissao: string;
  boleto: string;
  data: string;
  valorOriginal: number;
  oc: string;
  valorFinal: number;
  pagamento: string;
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) {
    return value.toLocaleDateString('pt-BR');
  }
  return String(value).trim();
}

function parseCurrency(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw || raw === '-' || raw === '—') return null;
  const cleaned = raw
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseExcelDate(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString('pt-BR');
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const dd = String(parsed.d).padStart(2, '0');
      const mm = String(parsed.m).padStart(2, '0');
      const yyyy = parsed.y;
      return `${dd}/${mm}/${yyyy}`;
    }
  }
  return cellText(value);
}

function parseStatus(raw: unknown): { status: ReceitaStatus; statusData?: string } {
  const text = cellText(raw);
  const norm = normalizeText(text);
  if (norm.includes('CANCELAD')) {
    return { status: 'CANCELADA' };
  }
  if (norm.includes('PENDENTE PARCIAL')) {
    return { status: 'PENDENTE PARCIAL' };
  }
  if (norm.includes('PENDENTE')) {
    return { status: 'PENDENTE' };
  }
  if (norm.includes('MOBILIZACAO') || norm.includes('MOBILIZAÇÃO')) {
    return { status: 'MOBILIZAÇÃO' };
  }
  if (norm.includes('RECEBIDO')) {
    const match = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    return { status: 'RECEBIDO', statusData: match?.[1] };
  }
  return { status: 'RECEBIDO' };
}

function findSheetName(workbook: XLSX.WorkBook, candidates: string[]): string | null {
  const names = workbook.SheetNames;
  for (const candidate of candidates) {
    const target = normalizeText(candidate);
    const exact = names.find((n) => normalizeText(n) === target);
    if (exact) return exact;
  }
  for (const candidate of candidates) {
    const target = normalizeText(candidate);
    const partial = names.find((n) => normalizeText(n).includes(target));
    if (partial) return partial;
  }
  return null;
}

function sheetToMatrix(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];
}

function findHeaderRowIndex(matrix: unknown[][], requiredTokens: string[]): number {
  const required = requiredTokens.map(normalizeText);
  for (let i = 0; i < matrix.length; i += 1) {
    const rowNorm = (matrix[i] ?? []).map(normalizeText).join(' | ');
    if (required.every((token) => rowNorm.includes(token))) {
      return i;
    }
  }
  return -1;
}

function mapHeaderIndexes(headerRow: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const key = normalizeText(cell);
    if (!key) return;
    map[key] = idx;
  });
  return map;
}

function pickIndex(map: Record<string, number>, aliases: string[]): number {
  for (const alias of aliases) {
    const key = normalizeText(alias);
    if (map[key] != null) return map[key];
    const found = Object.entries(map).find(([k]) => k.includes(key) || key.includes(k));
    if (found) return found[1];
  }
  return -1;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const MES_ABREV: Record<string, number> = {
  JAN: 1,
  FEV: 2,
  MAR: 3,
  ABR: 4,
  MAI: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SET: 9,
  OUT: 10,
  NOV: 11,
  DEZ: 12,
};

const MES_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

export type MesAnoParts = {
  mesNumero: number;
  mesLabel: string;
  ano: number;
  /** Chave estável YYYY-MM */
  key: string;
  /** Persistência sem dia: MM/YYYY */
  storage: string;
};

function buildMesAnoParts(mesNumero: number, ano: number): MesAnoParts | null {
  if (!Number.isFinite(mesNumero) || mesNumero < 1 || mesNumero > 12) return null;
  if (!Number.isFinite(ano) || ano < 1900) return null;
  return {
    mesNumero,
    mesLabel: MES_LABELS[mesNumero - 1],
    ano,
    key: `${ano}-${String(mesNumero).padStart(2, '0')}`,
    storage: `${String(mesNumero).padStart(2, '0')}/${ano}`,
  };
}

/** Extrai mês e ano de textos como jan/25, 01/2025 ou 01/04/2025 (ignora o dia). */
export function parseMesAno(mesRaw: string): MesAnoParts | null {
  const raw = cellText(mesRaw);
  if (!raw) return null;
  const norm = normalizeText(raw).replace(/\./g, '');

  const dmy = norm.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    return buildMesAnoParts(Number(dmy[2]), year);
  }

  const named = norm.match(/^([A-Z]{3})[A-Z]*[/\-](\d{2,4})$/);
  if (named) {
    let year = Number(named[2]);
    if (year < 100) year += 2000;
    return buildMesAnoParts(MES_ABREV[named[1]] ?? 0, year);
  }

  const my = norm.match(/^(\d{1,2})[/\-](\d{2,4})$/);
  if (my) {
    let year = Number(my[2]);
    if (year < 100) year += 2000;
    return buildMesAnoParts(Number(my[1]), year);
  }

  return null;
}

export function normalizeMesStorage(mesRaw: string): string {
  return parseMesAno(mesRaw)?.storage ?? cellText(mesRaw);
}

/** Valor numérico para ordenar mês — maior = mais recente. */
export function mesSortValue(mes: string): number {
  const parts = parseMesAno(mes);
  return parts ? parts.ano * 100 + parts.mesNumero : 0;
}

/** Valor numérico para ordenar data BR (dd/mm/aaaa) — maior = mais recente. */
export function dateSortValue(dateStr: string): number {
  const m = cellText(dateStr).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return 0;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return year * 10000 + Number(m[2]) * 100 + Number(m[1]);
}

export function parseReceitasFromWorkbook(
  workbook: XLSX.WorkBook,
  consorcio: ConsorcioKey
): ReceitaRow[] {
  const sheetName = findSheetName(
    workbook,
    consorcio === 'bsb'
      ? ['CONSORCIO BSB', 'CONSÓRCIO BSB', 'BSB']
      : ['CONSORCIO HUB', 'CONSÓRCIO HUB', 'HUB']
  );
  if (!sheetName) {
    throw new Error(
      `Aba do ${consorcio === 'bsb' ? 'Consórcio BSB' : 'Consórcio HUB'} não encontrada na planilha.`
    );
  }

  const matrix = sheetToMatrix(workbook, sheetName);
  const headerIdx = findHeaderRowIndex(matrix, ['MES', 'STATUS']);
  if (headerIdx < 0) {
    throw new Error(`Cabeçalho de receitas não encontrado na aba "${sheetName}".`);
  }

  const headerMap = mapHeaderIndexes(matrix[headerIdx] ?? []);
  const mesIdx = pickIndex(headerMap, ['MES', 'MÊS']);
  const nfIdx = pickIndex(headerMap, ['NF']);
  const fatIdx = pickIndex(headerMap, ['FATURAMENTO DO MES', 'FATURAMENTO DO MÊS', 'FATURAMENTO']);
  const recIdx = pickIndex(headerMap, [
    'RECEBIMENTO LIQUIDO',
    'RECEBIMENTO LÍQUIDO',
    'RECEBIMENTO',
  ]);
  const statusIdx = pickIndex(headerMap, ['STATUS']);

  const rows: ReceitaRow[] = [];
  let lastMes = '';

  for (let i = headerIdx + 1; i < matrix.length; i += 1) {
    const row = matrix[i] ?? [];
    const mesRaw = cellText(row[mesIdx]);
    const nf = cellText(row[nfIdx]);
    const faturamento = parseCurrency(row[fatIdx]);
    const recebimentoLiquido = parseCurrency(row[recIdx]);
    const statusRaw = cellText(row[statusIdx]);

    if (!mesRaw && !nf && faturamento == null && recebimentoLiquido == null && !statusRaw) {
      continue;
    }

    const mesNorm = normalizeText(mesRaw);
    if (mesNorm === 'TOTAL' || mesNorm === 'GERAL') break;

    if (mesRaw) lastMes = mesRaw;
    if (!lastMes) continue;

    const { status, statusData } = parseStatus(statusRaw || 'RECEBIDO');
    rows.push({
      id: uid(`rec-${consorcio}`),
      consorcio,
      mes: normalizeMesStorage(lastMes),
      nf: nf || '—',
      faturamento,
      recebimentoLiquido,
      status,
      statusData,
    });
  }

  return rows.sort((a, b) => mesSortValue(b.mes) - mesSortValue(a.mes));
}

export function parseRepassesFromWorkbook(
  workbook: XLSX.WorkBook,
  consorcio: ConsorcioKey
): RepasseRow[] {
  const sheetName = findSheetName(workbook, [
    'REPASSES GENNESIS',
    'REPASSES',
    'REPASSE GENNESIS',
  ]);
  if (!sheetName) {
    throw new Error('Aba "REPASSES GENNESIS" não encontrada na planilha.');
  }

  const matrix = sheetToMatrix(workbook, sheetName);
  const sectionToken = consorcio === 'bsb' ? 'BSB' : 'HUB';
  let sectionStart = -1;

  for (let i = 0; i < matrix.length; i += 1) {
    const rowText = (matrix[i] ?? []).map(normalizeText).join(' ');
    if (
      rowText.includes(sectionToken) &&
      (rowText.includes('REPASSE') || rowText.includes('REPASS'))
    ) {
      sectionStart = i;
      break;
    }
  }

  if (sectionStart < 0) {
    throw new Error(
      `Seção de repasses ${sectionToken} não encontrada na aba "${sheetName}".`
    );
  }

  let headerIdx = -1;
  for (let i = sectionStart; i < Math.min(sectionStart + 6, matrix.length); i += 1) {
    const rowText = (matrix[i] ?? []).map(normalizeText).join(' | ');
    if (
      (rowText.includes('FORNECEDOR') || rowText.includes('CODIGO')) &&
      (rowText.includes('VALOR') || rowText.includes('PARCELA') || rowText.includes('BOLETO'))
    ) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) {
    throw new Error(`Cabeçalho de repasses ${sectionToken} não encontrado.`);
  }

  const headerMap = mapHeaderIndexes(matrix[headerIdx] ?? []);
  const fornecedorIdx = pickIndex(headerMap, [
    'CODIGO-NOME DO FORNECEDOR',
    'CODIGO NOME DO FORNECEDOR',
    'FORNECEDOR',
  ]);
  const parcelaIdx = pickIndex(headerMap, ['PRF-NUMERO PARCELA', 'NUMERO PARCELA', 'PARCELA']);
  const emissaoIdx = pickIndex(headerMap, ['DATA DE EMISSAO', 'DATA DE EMISSÃO', 'DATA']);
  const boletoIdx = pickIndex(headerMap, ['BOLETO']);
  // Second "Data" column often exists after Boleto — prefer exact DATA after boleto index if duplicated
  let dataIdx = -1;
  const dataAliases = Object.entries(headerMap).filter(([k]) => k === 'DATA' || k.startsWith('DATA '));
  if (dataAliases.length > 1 && boletoIdx >= 0) {
    const afterBoleto = dataAliases
      .map(([, idx]) => idx)
      .filter((idx) => idx > boletoIdx)
      .sort((a, b) => a - b)[0];
    dataIdx = afterBoleto ?? dataAliases[0][1];
  } else {
    dataIdx = pickIndex(headerMap, ['DATA']);
    if (dataIdx === emissaoIdx) {
      // try next DATA-like column
      const next = Object.entries(headerMap).find(
        ([k, idx]) => k.includes('DATA') && idx !== emissaoIdx
      );
      if (next) dataIdx = next[1];
    }
  }
  const valorOriginalIdx = pickIndex(headerMap, ['VALOR ORIGINAL']);
  const ocIdx = pickIndex(headerMap, ['O. C.', 'O.C.', 'OC', 'D. C.', 'D.C.', 'DC']);
  const valorFinalIdx = pickIndex(headerMap, ['VALOR FINAL']);
  const pagamentoIdx = pickIndex(headerMap, ['PAGAMENTOS', 'PAGAMENTO']);

  const otherSectionToken = consorcio === 'bsb' ? 'HUB' : 'BSB';
  const rows: RepasseRow[] = [];

  for (let i = headerIdx + 1; i < matrix.length; i += 1) {
    const row = matrix[i] ?? [];
    const rowText = row.map(normalizeText).join(' ');
    if (
      rowText.includes(otherSectionToken) &&
      (rowText.includes('REPASSE') || rowText.includes('REPASS'))
    ) {
      break;
    }

    const fornecedor = cellText(row[fornecedorIdx]);
    const parcela = cellText(row[parcelaIdx]);
    const valorOriginal = parseCurrency(row[valorOriginalIdx]) ?? 0;
    const valorFinal = parseCurrency(row[valorFinalIdx]) ?? 0;
    const firstCell = normalizeText(row[0]);

    if (firstCell === 'TOTAL' || normalizeText(fornecedor) === 'TOTAL') break;
    if (!fornecedor && !parcela && valorOriginal === 0 && valorFinal === 0) continue;

    rows.push({
      id: uid(`rep-${consorcio}`),
      consorcio,
      fornecedor: fornecedor || '—',
      parcela: parcela || 'REPASSE',
      dataEmissao: parseExcelDate(row[emissaoIdx]),
      boleto: cellText(row[boletoIdx]) || 'NÃO',
      data: parseExcelDate(row[dataIdx]),
      valorOriginal,
      oc: cellText(row[ocIdx]) || '0',
      valorFinal,
      pagamento: parseExcelDate(row[pagamentoIdx]),
    });
  }

  return rows.sort((a, b) => {
    const byDate =
      dateSortValue(b.dataEmissao || b.data) - dateSortValue(a.dataEmissao || a.data);
    if (byDate !== 0) return byDate;
    return dateSortValue(b.data || b.pagamento) - dateSortValue(a.data || a.pagamento);
  });
}

export async function readWorkbookFromFile(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: 'array', cellDates: true });
}
