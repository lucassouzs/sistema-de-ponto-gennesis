import * as XLSX from 'xlsx';

export const CONTROLE_ANUIDADE_IMPORT_COLUMNS = [
  { name: 'PAGOS PELO', required: false },
  { name: 'EMPRESA', required: false },
  { name: 'PROFISSIONAL', required: false },
  { name: 'PORQUE DO DESCONTO', required: false },
  { name: 'CREA', required: false },
  { name: 'CPF/CNPJ', required: false },
  { name: 'VALOR', required: false },
  { name: 'DATA DE VENCIMENTO', required: false },
  { name: 'DATA PARA PAGAMENTO', required: false },
  { name: 'DATA DE PAGAMENTO', required: false },
  { name: 'STATUS', required: false, hint: 'PAGO / VENCIDA / EM_ABERTA' },
  { name: 'FLUIG', required: false },
] as const;

export const CONTROLE_ANUIDADE_IMPORT_TEMPLATE_HEADERS = [
  'PAGOS PELO',
  'EMPRESA',
  'PROFISSIONAL',
  'PORQUE DO DESCONTO',
  'CREA',
  'CPF/CNPJ',
  'VALOR',
  'DATA DE VENCIMENTO',
  'DATA PARA PAGAMENTO',
  'DATA DE PAGAMENTO',
  'STATUS',
  'FLUIG',
];

export const CONTROLE_ANUIDADE_IMPORT_TEMPLATE_EXAMPLE = [
  'CREA-DF',
  'GENNESIS',
  'João da Silva',
  '',
  '12345/D-DF',
  '000.000.000-00',
  '850,00',
  '31/03/2026',
  '15/03/2026',
  '',
  'PAGO',
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

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const dd = String(value.getDate()).padStart(2, '0');
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${value.getFullYear()}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Valores monetários costumam ser < 100000 e com casas; datas serial Excel são > 20000
    // Preferimos número cru para valor; para datas usamos parse_date_code só em colunas de data.
    return String(value);
  }
  return String(value).trim();
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
  }
  return String(value).trim();
}

type ColumnMap = {
  pagosPelo?: number;
  empresa?: number;
  profissional?: number;
  porqueDesconto?: number;
  crea?: number;
  cpfCnpj?: number;
  valor?: number;
  dataVencimento?: number;
  dataParaPagamento?: number;
  dataPagamento?: number;
  status?: number;
  fluig?: number;
};

function mapHeaderRow(cells: unknown[]): ColumnMap | null {
  const map: ColumnMap = {};
  cells.forEach((cell, idx) => {
    const key = normalizeHeaderKey(cellToString(cell));
    if (!key) return;
    if (key === 'pagos pelo' || key === 'pago pelo' || key === 'pagos') map.pagosPelo = idx;
    else if (key === 'empresa') map.empresa = idx;
    else if (key === 'profissional' || key === 'nome') map.profissional = idx;
    else if (key.includes('porque') || key.includes('motivo do desconto') || key === 'porque do desconto') {
      map.porqueDesconto = idx;
    } else if (key === 'crea') map.crea = idx;
    else if (
      key === 'cpf/cnpj' ||
      key === 'cpj/cnpj' ||
      key === 'cpf' ||
      key === 'cnpj' ||
      key.includes('cpf') ||
      key.includes('cnpj') ||
      key.includes('cpj')
    ) {
      map.cpfCnpj = idx;
    } else if (key === 'valor') map.valor = idx;
    else if (key.includes('vencimento')) map.dataVencimento = idx;
    else if (key.includes('para pagamento')) map.dataParaPagamento = idx;
    else if (key === 'data de pagamento' || key === 'data pagamento') map.dataPagamento = idx;
    else if (key === 'status') map.status = idx;
    else if (key === 'fluig') map.fluig = idx;
  });

  // Cabeçalho válido se tiver ao menos uma coluna típica da planilha
  if (
    map.profissional === undefined &&
    map.empresa === undefined &&
    map.pagosPelo === undefined &&
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

export type ControleAnuidadeImportRow = {
  pagosPelo?: string;
  empresa?: string;
  profissional: string;
  porqueDesconto?: string;
  crea?: string;
  cpfCnpj?: string;
  valor?: string;
  dataVencimento?: string;
  dataParaPagamento?: string;
  dataPagamento?: string;
  status?: string;
  fluig?: string;
};

export function downloadControleAnuidadeImportTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    CONTROLE_ANUIDADE_IMPORT_TEMPLATE_HEADERS,
    CONTROLE_ANUIDADE_IMPORT_TEMPLATE_EXAMPLE,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Anuidades');
  XLSX.writeFile(wb, 'modelo-controle-anuidade.xlsx');
}

export type ControleAnuidadeExportRow = {
  pagosPelo?: string | null;
  empresa?: string | null;
  profissional?: string | null;
  porqueDesconto?: string | null;
  crea?: string | null;
  cpfCnpj?: string | null;
  valor?: string | number | null;
  dataVencimento?: string | null;
  dataParaPagamento?: string | null;
  dataPagamento?: string | null;
  status?: string | null;
  fluig?: string | null;
};

export async function parseControleAnuidadeFromFile(file: File): Promise<{
  registros: ControleAnuidadeImportRow[];
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

  let headerIndex = -1;
  let columns: ColumnMap | null = null;
  for (let i = 0; i < matrix.length; i++) {
    const mapped = mapHeaderRow(matrix[i] || []);
    if (mapped) {
      headerIndex = i;
      columns = mapped;
      break;
    }
  }

  if (headerIndex < 0 || !columns) {
    throw new Error(
      'Não encontrei a linha de cabeçalho (precisa ter colunas como PROFISSIONAL, EMPRESA, VALOR ou STATUS).',
    );
  }

  const registros: ControleAnuidadeImportRow[] = [];
  const skipped: { line: number; reasons: string[]; preview: string }[] = [];

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    const pagosPelo = getCell(row, columns.pagosPelo) || undefined;
    const empresa = getCell(row, columns.empresa) || undefined;
    let profissional = getCell(row, columns.profissional);
    const porqueDesconto = getCell(row, columns.porqueDesconto) || undefined;
    const crea = getCell(row, columns.crea) || undefined;
    const cpfCnpj = getCell(row, columns.cpfCnpj) || undefined;
    const valor = getCell(row, columns.valor) || undefined;
    const dataVencimento = getDateCell(row, columns.dataVencimento) || undefined;
    const dataParaPagamento = getDateCell(row, columns.dataParaPagamento) || undefined;
    const dataPagamento = getDateCell(row, columns.dataPagamento) || undefined;
    const status = getCell(row, columns.status) || undefined;
    const fluig = getCell(row, columns.fluig) || undefined;

    // Importa mesmo linha vazia / incompleta
    if (!profissional.trim()) {
      profissional = empresa?.trim()
        ? `Não informado (${empresa.trim()})`
        : 'Não informado';
    }

    registros.push({
      pagosPelo,
      empresa,
      profissional,
      porqueDesconto,
      crea,
      cpfCnpj,
      valor,
      dataVencimento,
      dataParaPagamento,
      dataPagamento,
      status,
      fluig,
    });
  }

  return { registros, skipped };
}
