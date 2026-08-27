import * as XLSX from 'xlsx';

export const CONTROLE_PAGAMENTO_ART_IMPORT_COLUMNS = [
  { name: 'UF', required: false },
  { name: 'EMPRESA', required: false },
  { name: 'CONTRATANTE', required: false },
  { name: 'CNPJ/CPF', required: false },
  { name: 'CONTRATO', required: false },
  { name: 'OBSERVAÇÕES', required: false },
  { name: 'VIGÊNCIA - INICIO', required: false },
  { name: 'VIGÊNCIA - TERMINO', required: false },
  { name: 'RENOVAÇÃO', required: false },
  { name: 'ART', required: false },
  { name: 'VALOR', required: false },
  { name: 'PROFISSIONAL', required: false },
  { name: 'VENC DO BOLETO', required: false },
  { name: 'STATUS', required: false, hint: 'PAGO / VENCIDA / EM_ABERTA' },
  { name: 'PAGO', required: false, hint: 'SIM / NAO' },
  { name: 'SOLICITA EM', required: false },
  { name: 'PAGO EM', required: false },
  { name: 'FLUIG', required: false },
] as const;

export const CONTROLE_PAGAMENTO_ART_IMPORT_TEMPLATE_HEADERS = [
  'UF',
  'EMPRESA',
  'CONTRATANTE',
  'CNPJ/CPF',
  'CONTRATO',
  'OBSERVAÇÕES',
  'VIGÊNCIA - INICIO',
  'VIGÊNCIA - TERMINO',
  'RENOVAÇÃO',
  'ART',
  'VALOR',
  'PROFISSIONAL',
  'VENC DO BOLETO',
  'STATUS',
  'PAGO',
  'SOLICITA EM',
  'PAGO EM',
  'FLUIG',
];

export const CONTROLE_PAGAMENTO_ART_IMPORT_TEMPLATE_EXAMPLE = [
  'DF',
  'GENNESIS',
  'Cliente Exemplo',
  '00.000.000/0001-00',
  'CTR-001/2026',
  '',
  '01/01/2026',
  '31/12/2026',
  '01/01/2027',
  'ART-123456',
  '450,00',
  'João da Silva',
  '15/03/2026',
  'EM_ABERTA',
  'NAO',
  '10/02/2026',
  '',
  '',
];

function normalizeHeaderKey(header: string): string {
  return String(header || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Placeholders comuns na planilha que não são dados reais. */
function isPlaceholderValue(value: string): boolean {
  const n = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    !n ||
    n === '-' ||
    n === '—' ||
    n === 'n/a' ||
    n === 'na' ||
    n === 'null' ||
    n === 'undefined' ||
    n === 'nao tem' ||
    n === 'não tem' ||
    n === 'sem fluig' ||
    n === 'sem valor' ||
    n === 'vazio'
  );
}

function cleanText(value: string): string {
  const trimmed = value.trim();
  if (isPlaceholderValue(trimmed)) return '';
  return trimmed;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const dd = String(value.getDate()).padStart(2, '0');
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${value.getFullYear()}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return cleanText(String(value));
}

function cellToDateString(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const dd = String(value.getDate()).padStart(2, '0');
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${value.getFullYear()}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y > 1900 && parsed.y < 2100) {
      const dd = String(parsed.d).padStart(2, '0');
      const mm = String(parsed.m).padStart(2, '0');
      return `${dd}/${mm}/${parsed.y}`;
    }
    return '';
  }
  const raw = cleanText(String(value));
  if (!raw) return '';
  // Só aceita data BR explícita; texto livre (ex.: "INCLUSÃO DE RT") não vira data
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw;
  return '';
}

type ColumnMap = {
  uf?: number;
  empresa?: number;
  contratante?: number;
  cnpjCpf?: number;
  contrato?: number;
  observacoes?: number;
  vigenciaInicio?: number;
  vigenciaTermino?: number;
  renovacao?: number;
  art?: number;
  valor?: number;
  profissional?: number;
  vencDoBoleto?: number;
  status?: number;
  pago?: number;
  solicitaEm?: number;
  pagoEm?: number;
  fluig?: number;
};

function mapHeaderRow(cells: unknown[]): ColumnMap | null {
  const map: ColumnMap = {};
  cells.forEach((cell, idx) => {
    const key = normalizeHeaderKey(cellToString(cell));
    if (!key) return;
    if (key === 'uf' || key === 'estado') map.uf = idx;
    else if (key === 'empresa') map.empresa = idx;
    else if (key === 'contratante') map.contratante = idx;
    else if (
      key === 'cnpj/cpf' ||
      key === 'cpf/cnpj' ||
      key === 'cpf' ||
      key === 'cnpj' ||
      key.includes('cnpj') ||
      key.includes('cpf')
    ) {
      map.cnpjCpf = idx;
    } else if (key === 'contrato') map.contrato = idx;
    else if (key.includes('observac')) map.observacoes = idx;
    else if (key.includes('vigencia') && key.includes('inicio')) map.vigenciaInicio = idx;
    else if (
      (key.includes('vigencia') && (key.includes('termino') || key.includes('fim'))) ||
      key === 'vigencia - termino'
    ) {
      map.vigenciaTermino = idx;
    } else if (key.includes('renovac')) map.renovacao = idx;
    else if (key === 'art' || key.includes('protocolo')) map.art = idx;
    else if (key === 'valor') map.valor = idx;
    else if (key === 'profissional' || key === 'nome') map.profissional = idx;
    else if (key.includes('venc') && key.includes('boleto')) map.vencDoBoleto = idx;
    else if (key === 'status') map.status = idx;
    else if (key.includes('solicita')) map.solicitaEm = idx;
    else if (key === 'pago em' || key === 'data pagamento' || key === 'data de pagamento') {
      map.pagoEm = idx;
    } else if (key === 'pago' || key === 'pago?') map.pago = idx;
    else if (key === 'fluig') map.fluig = idx;
  });

  if (
    map.profissional === undefined &&
    map.empresa === undefined &&
    map.art === undefined &&
    map.contrato === undefined &&
    map.valor === undefined &&
    map.status === undefined
  ) {
    return null;
  }
  return map;
}

function getCell(row: unknown[], index: number | undefined): string {
  if (index === undefined) return '';
  return cellToString(row[index]);
}

function getDateCell(row: unknown[], index: number | undefined): string {
  if (index === undefined) return '';
  return cellToDateString(row[index]);
}

function rowHasUsefulData(fields: Record<string, string | undefined>): boolean {
  return Object.values(fields).some((v) => !!(v && String(v).trim()));
}

export type ControlePagamentoArtImportRow = {
  uf?: string;
  empresa?: string;
  contratante?: string;
  cnpjCpf?: string;
  contrato?: string;
  observacoes?: string;
  vigenciaInicio?: string;
  vigenciaTermino?: string;
  renovacao?: string;
  art?: string;
  valor?: string;
  profissional: string;
  vencDoBoleto?: string;
  status?: string;
  pago?: string;
  solicitaEm?: string;
  pagoEm?: string;
  fluig?: string;
};

export function downloadControlePagamentoArtImportTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    CONTROLE_PAGAMENTO_ART_IMPORT_TEMPLATE_HEADERS,
    CONTROLE_PAGAMENTO_ART_IMPORT_TEMPLATE_EXAMPLE,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ART Protocolos');
  XLSX.writeFile(wb, 'modelo-controle-pagamentos-art.xlsx');
}

export type ControlePagamentoArtExportRow = {
  uf?: string | null;
  empresa?: string | null;
  contratante?: string | null;
  cnpjCpf?: string | null;
  contrato?: string | null;
  observacoes?: string | null;
  vigenciaInicio?: string | null;
  vigenciaTermino?: string | null;
  renovacao?: string | null;
  art?: string | null;
  valor?: string | number | null;
  profissional?: string | null;
  vencDoBoleto?: string | null;
  status?: string | null;
  pago?: string | null;
  solicitaEm?: string | null;
  pagoEm?: string | null;
  fluig?: string | null;
};

export async function parseControlePagamentoArtFromFile(file: File): Promise<{
  registros: ControlePagamentoArtImportRow[];
  skipped: { line: number; reasons: string[]; preview: string }[];
}> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Planilha sem abas');

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  });

  if (!matrix.length) throw new Error('Planilha vazia');

  let headerIdx = -1;
  let columnMap: ColumnMap | null = null;
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const mapped = mapHeaderRow(matrix[i] || []);
    if (mapped) {
      headerIdx = i;
      columnMap = mapped;
      break;
    }
  }
  if (headerIdx < 0 || !columnMap) {
    throw new Error('Cabeçalho da planilha não reconhecido');
  }

  const registros: ControlePagamentoArtImportRow[] = [];
  const skipped: { line: number; reasons: string[]; preview: string }[] = [];

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    const fields = {
      uf: getCell(row, columnMap.uf),
      empresa: getCell(row, columnMap.empresa),
      contratante: getCell(row, columnMap.contratante),
      cnpjCpf: getCell(row, columnMap.cnpjCpf),
      contrato: getCell(row, columnMap.contrato),
      observacoes: getCell(row, columnMap.observacoes),
      vigenciaInicio: getDateCell(row, columnMap.vigenciaInicio),
      vigenciaTermino: getDateCell(row, columnMap.vigenciaTermino),
      renovacao: getDateCell(row, columnMap.renovacao),
      art: getCell(row, columnMap.art),
      valor: getCell(row, columnMap.valor),
      profissional: getCell(row, columnMap.profissional),
      vencDoBoleto: getDateCell(row, columnMap.vencDoBoleto),
      status: getCell(row, columnMap.status),
      pago: getCell(row, columnMap.pago),
      solicitaEm: getDateCell(row, columnMap.solicitaEm),
      pagoEm: getDateCell(row, columnMap.pagoEm),
      fluig: getCell(row, columnMap.fluig),
    };

    // Importa mesmo linha vazia / incompleta
    registros.push({
      ...fields,
      uf: cleanText(fields.uf).toUpperCase(),
      fluig: cleanText(fields.fluig),
      valor: cleanText(fields.valor),
      profissional: fields.profissional.trim() || 'Não informado',
    });
  }

  return { registros, skipped };
}
