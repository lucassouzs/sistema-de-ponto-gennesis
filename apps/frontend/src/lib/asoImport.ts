import * as XLSX from 'xlsx';

export const ASO_IMPORT_COLUMNS = [
  {
    name: 'Matrícula',
    required: true,
    hint: 'Preferencial para localizar o funcionário (alternativa: CPF ou nome)',
  },
  { name: 'CPF', required: false, hint: 'Usado se a matrícula estiver em branco' },
  { name: 'Funcionário', required: false, hint: 'Nome completo — só se matrícula/CPF faltarem' },
  {
    name: 'Tipo de ASO',
    required: true,
    hint: 'Ex.: Admissional, Periódico, Demissional…',
  },
  { name: 'Data do Exame', required: true, hint: 'DD/MM/AAAA' },
  {
    name: 'Resultado',
    required: true,
    hint: 'Apto | Apto com restrição | Inapto',
  },
  { name: 'Médico Responsável', required: true },
  { name: 'CRM', required: true },
  { name: 'Clínica', required: true },
  {
    name: 'Valor',
    required: false,
    hint: 'R$ opcional (ex.: 150 ou 150,00). Se vazio, usa o preço padrão do tipo',
  },
  { name: 'Observações', required: false },
] as const;

export const ASO_IMPORT_TEMPLATE_HEADERS = ASO_IMPORT_COLUMNS.map((c) => c.name);

export const ASO_IMPORT_TEMPLATE_EXAMPLE = [
  '268764',
  '028.953.185-30',
  'Thais Silva',
  'Admissional',
  '05/08/2026',
  'Apto',
  'Dr. Davi Souza',
  '12345-DF',
  'Clínica Exemplo',
  '150,00',
  '',
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
  const normalized = new Map(Object.entries(row).map(([k, v]) => [normalizeHeaderKey(k), v]));
  for (const key of keys) {
    const val = normalized.get(normalizeHeaderKey(key));
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  // Excel epoch (Windows): 1899-12-30
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseDateToIso(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }

  if (typeof raw === 'number') {
    return excelSerialToIso(raw);
  }

  const text = String(raw).trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  const br = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (br) {
    const day = br[1].padStart(2, '0');
    const month = br[2].padStart(2, '0');
    const year = br[3];
    return `${year}-${month}-${day}`;
  }

  const asNum = Number(text);
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 80000) {
    return excelSerialToIso(asNum);
  }

  return null;
}

function pickDateValue(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const iso = parseDateToIso(row[key]);
      if (iso) return iso;
    }
  }
  const normalized = new Map(Object.entries(row).map(([k, v]) => [normalizeHeaderKey(k), v]));
  for (const key of keys) {
    const val = normalized.get(normalizeHeaderKey(key));
    const iso = parseDateToIso(val);
    if (iso) return iso;
  }
  return null;
}

function parseMoneyValue(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Number(raw.toFixed(2));
  }
  const text = String(raw)
    .trim()
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '');
  if (!text || text === '-' || text === '—') return null;
  const normalized =
    text.includes(',') && text.includes('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.includes(',')
        ? text.replace(',', '.')
        : text;
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(2));
}

function pickMoneyValue(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const parsed = parseMoneyValue(row[key]);
      if (parsed !== null) return parsed;
    }
  }
  const normalized = new Map(Object.entries(row).map(([k, v]) => [normalizeHeaderKey(k), v]));
  for (const key of keys) {
    const val = normalized.get(normalizeHeaderKey(key));
    const parsed = parseMoneyValue(val);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseResultado(raw: string): 'APTO' | 'APTO_COM_RESTRICAO' | 'INAPTO' | null {
  if (!raw) return null;
  const n = raw
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

  if (n === 'APTO') return 'APTO';
  if (
    n === 'APTO COM RESTRICAO' ||
    n === 'APTO_COM_RESTRICAO' ||
    n === 'APTO C/ RESTRICAO' ||
    n === 'APTO COM RESTRICOES'
  ) {
    return 'APTO_COM_RESTRICAO';
  }
  if (n === 'INAPTO') return 'INAPTO';
  return null;
}

export type AsoImportItem = {
  matricula?: string;
  cpf?: string;
  funcionarioNome?: string;
  tipoAsoNome: string;
  dataExame: string;
  resultado: 'APTO' | 'APTO_COM_RESTRICAO' | 'INAPTO';
  medicoResponsavel: string;
  crmMedico: string;
  clinica: string;
  valor?: number;
  observacoes?: string;
};

type ImportRowResult = {
  item: AsoImportItem | null;
  skipReasons: string[];
  preview: string;
};

export type AsoImportParseReport = {
  items: AsoImportItem[];
  skipped: Array<{ line: number; reasons: string[]; preview: string }>;
  totalRows: number;
};

function analyzeImportRow(row: Record<string, unknown>, lineNumber: number): ImportRowResult {
  const matricula = pickRowValue(row, 'Matrícula', 'Matricula', 'employeeId');
  const cpf = pickRowValue(row, 'CPF', 'cpf');
  const funcionarioNome = pickRowValue(row, 'Funcionário', 'Funcionario', 'Nome', 'name');
  const tipoAsoNome = pickRowValue(row, 'Tipo de ASO', 'Tipo ASO', 'Tipo', 'tipoAso');
  const dataExame = pickDateValue(row, 'Data do Exame', 'Data Exame', 'dataExame');
  const resultadoRaw = pickRowValue(row, 'Resultado', 'resultado');
  const medicoResponsavel = pickRowValue(
    row,
    'Médico Responsável',
    'Medico Responsavel',
    'Médico',
    'Medico'
  );
  const crmMedico = pickRowValue(row, 'CRM', 'crmMedico', 'CRM Médico');
  const clinica = pickRowValue(row, 'Clínica', 'Clinica', 'clinica');
  const valor = pickMoneyValue(row, 'Valor', 'Preço', 'Preco', 'valor', 'preco');
  const observacoes = pickRowValue(row, 'Observações', 'Observacoes', 'observacoes');

  const resultado = parseResultado(resultadoRaw);
  const skipReasons: string[] = [];

  if (!matricula && !cpf && !funcionarioNome) {
    skipReasons.push('Informe Matrícula, CPF ou Funcionário');
  }
  if (!tipoAsoNome) skipReasons.push('Tipo de ASO em branco');
  if (!dataExame) skipReasons.push('Data do Exame inválida ou em branco');
  if (!resultado) skipReasons.push('Resultado inválido (use Apto, Apto com restrição ou Inapto)');
  if (!medicoResponsavel) skipReasons.push('Médico Responsável em branco');
  if (!crmMedico) skipReasons.push('CRM em branco');
  if (!clinica) skipReasons.push('Clínica em branco');

  const preview =
    funcionarioNome || matricula || cpf || tipoAsoNome || `Linha ${lineNumber}`;

  if (skipReasons.length > 0 || !resultado || !dataExame) {
    return { item: null, skipReasons, preview };
  }

  const item: AsoImportItem = {
    tipoAsoNome,
    dataExame,
    resultado,
    medicoResponsavel,
    crmMedico,
    clinica,
  };
  if (matricula) item.matricula = matricula;
  if (cpf) item.cpf = cpf;
  if (funcionarioNome) item.funcionarioNome = funcionarioNome;
  if (valor !== null) item.valor = valor;
  if (observacoes) item.observacoes = observacoes;

  return { item, skipReasons: [], preview };
}

function buildImportParseReport(rows: Record<string, unknown>[]): AsoImportParseReport {
  const items: AsoImportItem[] = [];
  const skipped: AsoImportParseReport['skipped'] = [];

  rows.forEach((row, index) => {
    const lineNumber = index + 2;
    const result = analyzeImportRow(row, lineNumber);
    if (result.item) {
      items.push(result.item);
    } else {
      skipped.push({
        line: lineNumber,
        reasons: result.skipReasons,
        preview: result.preview,
      });
    }
  });

  return { items, skipped, totalRows: rows.length };
}

function parseCsvAsos(text: string): AsoImportParseReport {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { items: [], skipped: [], totalRows: 0 };

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

export async function parseAsosFromFile(file: File): Promise<AsoImportParseReport> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (ext === 'xlsx' || ext === 'xls') {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { items: [], skipped: [], totalRows: 0 };
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null });
    return buildImportParseReport(rows);
  }

  if (ext === 'csv') return parseCsvAsos(await file.text());

  if (ext === 'json') {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error('O JSON deve ser um array de registros ASO');
    return buildImportParseReport(parsed);
  }

  throw new Error('Formato não suportado. Use planilha Excel (.xlsx, .xls), CSV ou JSON.');
}

export function downloadAsoImportTemplate(): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([ASO_IMPORT_TEMPLATE_HEADERS, ASO_IMPORT_TEMPLATE_EXAMPLE]);
  ws['!cols'] = ASO_IMPORT_TEMPLATE_HEADERS.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, 'ASOs');
  XLSX.writeFile(wb, 'modelo-importacao-aso.xlsx');
}
