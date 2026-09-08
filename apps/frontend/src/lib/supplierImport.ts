import * as XLSX from 'xlsx';

export const SUPPLIER_CATEGORIES = ['Pessoa Física', 'Pessoa Jurídica'] as const;

export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];

export function normalizeSupplierCategory(value?: string | null): SupplierCategory | null {
  const normalized = (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (['pessoa fisica', 'pf', 'fisica'].includes(normalized)) return 'Pessoa Física';
  if (['pessoa juridica', 'pj', 'juridica'].includes(normalized)) return 'Pessoa Jurídica';
  return null;
}

export const SUPPLIER_IMPORT_COLUMNS = [
  { name: 'Cliente/Fornecedor', required: false },
  { name: 'Nome Fantasia/Social', required: false },
  { name: 'Nome', required: true },
  { name: 'CPF/CNPJ', required: false },
  { name: 'Inscrição Estadual', required: false },
  { name: 'Inscrição Municipal', required: false },
  { name: 'Ativo', required: false, hint: 'Sim / Não' },
  { name: 'Categoria', required: false, hint: 'Pessoa Física ou Pessoa Jurídica' },
  { name: 'Rua', required: false },
  { name: 'Número', required: false },
  { name: 'Bairro', required: false },
  { name: 'Cidade', required: false },
  { name: 'Complemento', required: false },
  { name: 'Caixa Postal', required: false },
  { name: 'Estado', required: false, hint: 'UF' },
  { name: 'CEP', required: false },
  { name: 'Telefone', required: false },
  { name: 'Fax', required: false },
  { name: 'Celular', required: false },
  { name: 'E-mail', required: false },
  { name: 'Contato', required: false },
  { name: 'Banco', required: false },
  { name: 'Agência', required: false },
  { name: 'Conta', required: false },
  { name: 'Dígito da conta', required: false },
  { name: 'Tipo de chave PIX', required: false, hint: 'ALEATÓRIA, CELULAR, CNPJ, CPF, E-MAIL' },
  { name: 'Chave PIX', required: false }
] as const;

export const SUPPLIER_IMPORT_TEMPLATE_HEADERS = [
  'Cliente/Fornecedor',
  'Nome Fantasia/Social',
  'Nome',
  'CPF/CNPJ',
  'Inscrição Estadual',
  'Inscrição Municipal',
  'Ativo',
  'Categoria',
  'Rua',
  'Número',
  'Bairro',
  'Cidade',
  'Complemento',
  'Caixa Postal',
  'Estado',
  'CEP',
  'Telefone',
  'Fax',
  'Celular',
  'E-mail',
  'Contato',
  'Banco',
  'Agência',
  'Conta',
  'Dígito da conta',
  'Tipo de chave PIX',
  'Chave PIX'
];

export const SUPPLIER_IMPORT_TEMPLATE_EXAMPLE = [
  'Fornecedor',
  'ABC Materiais',
  'ABC Materiais Ltda',
  '12.345.678/0001-90',
  '123456789',
  '987654321',
  'Sim',
  'Pessoa Jurídica',
  'Rua das Flores',
  '100',
  'Centro',
  'Brasília',
  'Sala 2',
  '',
  'DF',
  '70000-000',
  '(61) 3333-4444',
  '',
  '(61) 99999-8888',
  'contato@abc.com.br',
  'João Silva',
  '341',
  '1234',
  '56789',
  '0',
  'E-MAIL',
  'contato@abc.com.br'
];

function normalizeHeaderKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function pickRowValue(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  const normalized = new Map(
    Object.entries(row).map(([k, v]) => [normalizeHeaderKey(k), v])
  );
  for (const key of keys) {
    const val = normalized.get(normalizeHeaderKey(key));
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function parseActive(raw: string): boolean | undefined {
  if (!raw) return undefined;
  const normalized = raw.toLowerCase();
  if (['sim', 's', 'true', '1', 'ativo', 'yes'].includes(normalized)) return true;
  if (['nao', 'não', 'n', 'false', '0', 'inativo', 'no'].includes(normalized)) return false;
  return undefined;
}

type ImportRowResult = {
  supplier: Record<string, unknown> | null;
  skipReasons: string[];
  preview: string;
};

function analyzeImportRow(row: Record<string, unknown>, lineNumber: number): ImportRowResult {
  const partyType = pickRowValue(row, 'Cliente/Fornecedor', 'Cliente Fornecedor', 'partyType');
  const tradeName = pickRowValue(
    row,
    'Nome Fantasia/Social',
    'Nome Fantasia',
    'Nome Social',
    'tradeName'
  );
  const name = pickRowValue(row, 'Nome', 'Razão Social', 'Razao Social', 'name');
  const cnpj = pickRowValue(row, 'CPF/CNPJ', 'CPF', 'CNPJ', 'cnpj');
  const stateRegistration = pickRowValue(
    row,
    'Inscrição Estadual',
    'Inscricao Estadual',
    'IE',
    'stateRegistration'
  );
  const municipalRegistration = pickRowValue(
    row,
    'Inscrição Municipal',
    'Inscricao Municipal',
    'IM',
    'municipalRegistration'
  );
  const ativoRaw = pickRowValue(row, 'Ativo', 'isActive');
  const categoryRaw = pickRowValue(row, 'Categoria', 'category');
  const category = normalizeSupplierCategory(categoryRaw);
  const street = pickRowValue(row, 'Rua', 'street');
  const streetNumber = pickRowValue(row, 'Número', 'Numero', 'streetNumber', 'number');
  const neighborhood = pickRowValue(row, 'Bairro', 'neighborhood');
  const city = pickRowValue(row, 'Cidade', 'city');
  const complement = pickRowValue(row, 'Complemento', 'complement');
  const poBox = pickRowValue(row, 'Caixa Postal', 'Caixa postal', 'poBox');
  const state = pickRowValue(row, 'Estado', 'UF', 'state');
  const zipCode = pickRowValue(row, 'CEP', 'zipCode');
  const phone = pickRowValue(row, 'Telefone', 'phone');
  const fax = pickRowValue(row, 'Fax', 'fax');
  const mobile = pickRowValue(row, 'Celular', 'mobile');
  const email = pickRowValue(row, 'E-mail', 'Email', 'email');
  const contactName = pickRowValue(row, 'Contato', 'contactName');
  const bank = pickRowValue(row, 'Banco', 'bank');
  const agency = pickRowValue(row, 'Agência', 'Agencia', 'agency');
  const account = pickRowValue(row, 'Conta', 'account');
  const accountDigit = pickRowValue(
    row,
    'Dígito da conta',
    'Digito da conta',
    'Dígito',
    'accountDigit'
  );
  const pixKeyType = pickRowValue(
    row,
    'Tipo de chave PIX',
    'Tipo chave PIX',
    'pixKeyType'
  );
  const pixKey = pickRowValue(row, 'Chave PIX', 'Chave pix', 'pixKey');

  const skipReasons: string[] = [];
  if (!name) skipReasons.push('Nome em branco');
  if (categoryRaw && !category) {
    skipReasons.push(`Categoria inválida: "${categoryRaw}" (use Pessoa Física ou Pessoa Jurídica)`);
  }

  const preview = name || tradeName || cnpj || `Linha ${lineNumber}`;

  if (skipReasons.length > 0) {
    return { supplier: null, skipReasons, preview };
  }

  const supplier: Record<string, unknown> = {
    partyType: partyType || undefined,
    tradeName: tradeName || undefined,
    name,
    cnpj: cnpj || undefined,
    stateRegistration: stateRegistration || undefined,
    municipalRegistration: municipalRegistration || undefined,
    category: category || undefined,
    street: street || undefined,
    streetNumber: streetNumber || undefined,
    neighborhood: neighborhood || undefined,
    city: city || undefined,
    complement: complement || undefined,
    poBox: poBox || undefined,
    state: state || undefined,
    zipCode: zipCode || undefined,
    phone: phone || undefined,
    fax: fax || undefined,
    mobile: mobile || undefined,
    email: email || undefined,
    contactName: contactName || undefined,
    bank: bank || undefined,
    agency: agency || undefined,
    account: account || undefined,
    accountDigit: accountDigit || undefined,
    pixKeyType: pixKeyType || undefined,
    pixKey: pixKey || undefined
  };

  const isActive = parseActive(ativoRaw);
  if (isActive !== undefined) {
    supplier.isActive = isActive;
  }

  return { supplier, skipReasons: [], preview };
}

export type SupplierImportParseReport = {
  suppliers: Record<string, unknown>[];
  skipped: Array<{ line: number; reasons: string[]; preview: string }>;
  totalRows: number;
};

function buildImportParseReport(rows: Record<string, unknown>[]): SupplierImportParseReport {
  const suppliers: Record<string, unknown>[] = [];
  const skipped: SupplierImportParseReport['skipped'] = [];

  rows.forEach((row, index) => {
    const lineNumber = index + 2;
    const result = analyzeImportRow(row, lineNumber);
    if (result.supplier) {
      suppliers.push(result.supplier);
    } else {
      skipped.push({
        line: lineNumber,
        reasons: result.skipReasons,
        preview: result.preview
      });
    }
  });

  return { suppliers, skipped, totalRows: rows.length };
}

function parseCsvSuppliers(text: string): SupplierImportParseReport {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { suppliers: [], skipped: [], totalRows: 0 };

  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const headers = lines[0].split(delimiter).map((h) => h.trim());

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    rows.push(row);
  }

  return buildImportParseReport(rows);
}

export async function parseSuppliersFromFile(file: File): Promise<SupplierImportParseReport> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (ext === 'xlsx' || ext === 'xls') {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { suppliers: [], skipped: [], totalRows: 0 };
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: null
    });
    return buildImportParseReport(rows);
  }

  if (ext === 'csv') {
    return parseCsvSuppliers(await file.text());
  }

  if (ext === 'json') {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) {
      throw new Error('O JSON deve ser um array de fornecedores');
    }
    return buildImportParseReport(parsed);
  }

  throw new Error('Formato não suportado. Use planilha Excel (.xlsx, .xls), CSV ou JSON.');
}

export function downloadSupplierImportTemplate(): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    SUPPLIER_IMPORT_TEMPLATE_HEADERS,
    SUPPLIER_IMPORT_TEMPLATE_EXAMPLE
  ]);
  ws['!cols'] = SUPPLIER_IMPORT_TEMPLATE_HEADERS.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Fornecedores');
  XLSX.writeFile(wb, 'modelo-importacao-fornecedores.xlsx');
}
