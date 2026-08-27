import * as XLSX from 'xlsx';

export const RESPONSAVEL_TECNICO_IMPORT_COLUMNS = [
  { name: 'CREA', required: false, hint: 'Ex.: CREA-DF (pode vir em bloco)' },
  { name: 'UF', required: false, hint: 'Opcional se vier em CREA-XX ou no registro' },
  { name: 'EMPRESA', required: false },
  { name: 'PROFISSIONAL', required: true },
  { name: 'CPF', required: false },
  { name: 'REGISTRO', required: false },
  { name: 'DATA DE INÍCIO', required: false, hint: 'dd/mm/aaaa' },
  { name: 'TÍTULO', required: false },
  { name: 'ART/CARGO OU FUNÇÃO', required: false },
  { name: 'PROTOCOLO', required: false },
  { name: 'BAIXA EM', required: false, hint: 'dd/mm/aaaa' },
  { name: 'ANUIDADE', required: false, hint: 'PAGO / PENDENTE / VENCIDO' },
  { name: 'STATUS', required: false, hint: 'ATIVO / BAIXADA' },
] as const;

export const RESPONSAVEL_TECNICO_IMPORT_TEMPLATE_HEADERS = [
  'CREA',
  'EMPRESA',
  'PROFISSIONAL',
  'CPF',
  'REGISTRO',
  'DATA DE INÍCIO',
  'TÍTULO',
  'ART/CARGO OU FUNÇÃO',
  'PROTOCOLO',
  'BAIXA EM',
  'ANUIDADE',
  'STATUS',
];

export const RESPONSAVEL_TECNICO_IMPORT_TEMPLATE_EXAMPLE = [
  'CREA-DF',
  'GENNESIS',
  'João da Silva',
  '000.000.000-00',
  '123456/D-DF',
  '01/01/2024',
  'Engenheiro Civil',
  'ART 12345 / Responsável Técnico',
  'PROT-001',
  '',
  'PAGO',
  'ATIVO',
];

const UF_SIGLAS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

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
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y > 1900) {
      const dd = String(parsed.d).padStart(2, '0');
      const mm = String(parsed.m).padStart(2, '0');
      return `${dd}/${mm}/${parsed.y}`;
    }
    return String(value);
  }
  return String(value).trim();
}

function excelSerialToDateString(value: unknown): string {
  return cellToString(value);
}

function extractUf(value: string): string {
  const raw = value.trim().toUpperCase();
  if (!raw) return '';
  if (UF_SIGLAS.has(raw)) return raw;

  const creaMatch = raw.match(/CREA[\s\-–—_/]*([A-Z]{2})\b/);
  if (creaMatch && UF_SIGLAS.has(creaMatch[1])) return creaMatch[1];

  const registroMatch = raw.match(/(?:\/D-|\/|-|–)([A-Z]{2})\s*$/);
  if (registroMatch && UF_SIGLAS.has(registroMatch[1])) return registroMatch[1];

  const trailing = raw.match(/\b([A-Z]{2})\s*$/);
  if (trailing && UF_SIGLAS.has(trailing[1])) return trailing[1];

  return '';
}

function isCreaSectionLabel(value: string): boolean {
  return /^CREA[\s\-–—_/]*[A-Z]{2}$/i.test(value.trim());
}

type ColumnMap = {
  crea?: number;
  uf?: number;
  empresa?: number;
  profissional?: number;
  cpf?: number;
  registro?: number;
  dataInicio?: number;
  titulo?: number;
  artCargoFuncao?: number;
  protocolo?: number;
  baixaEm?: number;
  anuidade?: number;
  status?: number;
};

function mapHeaderRow(cells: unknown[]): ColumnMap | null {
  const map: ColumnMap = {};
  cells.forEach((cell, idx) => {
    const key = normalizeHeaderKey(cellToString(cell));
    if (!key) return;
    if (key === 'crea') map.crea = idx;
    else if (key === 'uf' || key === 'estado') map.uf = idx;
    else if (key === 'empresa') map.empresa = idx;
    else if (key === 'profissional' || key === 'nome') map.profissional = idx;
    else if (key === 'cpf') map.cpf = idx;
    else if (key === 'registro') map.registro = idx;
    else if (key === 'data de inicio' || key === 'data inicio') map.dataInicio = idx;
    else if (key === 'titulo') map.titulo = idx;
    else if (
      key === 'art/cargo ou funcao' ||
      key === 'art cargo ou funcao' ||
      key.startsWith('art/')
    ) {
      map.artCargoFuncao = idx;
    } else if (key === 'protocolo') map.protocolo = idx;
    else if (key === 'baixa em' || key === 'baixa') map.baixaEm = idx;
    else if (key.startsWith('anuidade')) map.anuidade = idx;
    else if (key === 'status') map.status = idx;
  });

  if (map.profissional === undefined) return null;
  return map;
}

function getCell(row: unknown[], index: number | undefined): string {
  if (index === undefined) return '';
  return cellToString(row[index]);
}

export type ResponsavelTecnicoImportRow = {
  crea: string;
  uf: string;
  empresa?: string;
  profissional: string;
  cpf?: string;
  registro?: string;
  dataInicio?: string;
  titulo?: string;
  artCargoFuncao?: string;
  protocolo?: string;
  baixaEm?: string;
  anuidade2026?: string;
  status?: string;
};

type ImportRowResult = {
  responsavel: ResponsavelTecnicoImportRow | null;
  skipReasons: string[];
  preview: string;
};

function analyzeMappedRow(
  row: unknown[],
  columns: ColumnMap,
  lineNumber: number,
  lastCreaSection: { crea: string; uf: string },
): ImportRowResult & { nextCreaSection: { crea: string; uf: string } } {
  const creaRaw = getCell(row, columns.crea);
  const ufRaw = getCell(row, columns.uf);
  const empresa = getCell(row, columns.empresa);
  const profissional = getCell(row, columns.profissional);
  const cpf = getCell(row, columns.cpf);
  const registro = getCell(row, columns.registro);
  const dataInicio =
    columns.dataInicio !== undefined
      ? excelSerialToDateString(row[columns.dataInicio])
      : '';
  const titulo = getCell(row, columns.titulo);
  const artCargoFuncao = getCell(row, columns.artCargoFuncao);
  const protocolo = getCell(row, columns.protocolo);
  const baixaEm =
    columns.baixaEm !== undefined ? excelSerialToDateString(row[columns.baixaEm]) : '';
  const anuidade2026 = getCell(row, columns.anuidade);
  const status = getCell(row, columns.status);

  let nextCreaSection = lastCreaSection;
  if (creaRaw && isCreaSectionLabel(creaRaw)) {
    const ufFromCrea = extractUf(creaRaw);
    nextCreaSection = {
      crea: ufFromCrea || creaRaw,
      uf: ufFromCrea,
    };
  }

  // Linha que é SÓ um rótulo de seção "CREA-XX" (sem nenhum outro dado):
  // atualiza a seção e não vira registro. Todo o resto é importado.
  const hasOtherData = Boolean(
    empresa ||
      cpf ||
      registro ||
      dataInicio ||
      titulo ||
      artCargoFuncao ||
      protocolo ||
      baixaEm ||
      anuidade2026 ||
      status,
  );
  if (!profissional && creaRaw && isCreaSectionLabel(creaRaw) && !hasOtherData) {
    return {
      responsavel: null,
      skipReasons: ['seção CREA'],
      preview: `Linha ${lineNumber}: seção ${creaRaw}`,
      nextCreaSection,
    };
  }

  const uf =
    extractUf(ufRaw) ||
    extractUf(creaRaw) ||
    extractUf(registro) ||
    nextCreaSection.uf ||
    '';

  const crea =
    (creaRaw && !isCreaSectionLabel(creaRaw) ? creaRaw : '') ||
    nextCreaSection.crea ||
    uf;

  const preview = `Linha ${lineNumber}: ${profissional || '(sem nome)'} / CREA ${crea || uf || '-'}`;

  // Importa mesmo sem profissional ou sem CREA/UF (traz a linha do mesmo jeito).
  const creaFinal = (extractUf(crea) || crea || uf).toUpperCase();
  const ufFinal = (uf || extractUf(creaFinal) || creaFinal).toUpperCase().slice(0, 2);

  return {
    responsavel: {
      crea: creaFinal ? (creaFinal.slice(0, 2) === ufFinal ? ufFinal : creaFinal) : '',
      uf: ufFinal || creaFinal.slice(0, 2),
      empresa: empresa || undefined,
      profissional: profissional || 'Não informado',
      cpf: cpf || undefined,
      registro: registro || undefined,
      dataInicio: dataInicio || undefined,
      titulo: titulo || undefined,
      artCargoFuncao: artCargoFuncao || undefined,
      protocolo: protocolo || undefined,
      baixaEm: baixaEm || undefined,
      anuidade2026: anuidade2026 || undefined,
      status: status || undefined,
    },
    skipReasons: [],
    preview,
    nextCreaSection,
  };
}

export function downloadResponsavelTecnicoImportTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    RESPONSAVEL_TECNICO_IMPORT_TEMPLATE_HEADERS,
    RESPONSAVEL_TECNICO_IMPORT_TEMPLATE_EXAMPLE,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Responsaveis');
  XLSX.writeFile(wb, 'modelo-responsaveis-tecnicos.xlsx');
}

export type ResponsavelTecnicoExportRow = {
  crea?: string | null;
  empresa?: string | null;
  profissional?: string | null;
  cpf?: string | null;
  registro?: string | null;
  dataInicio?: string | null;
  titulo?: string | null;
  artCargoFuncao?: string | null;
  protocolo?: string | null;
  baixaEm?: string | null;
  anuidade2026?: string | null;
  status?: string | null;
};

export async function parseResponsaveisFromFile(file: File): Promise<{
  responsaveis: ResponsavelTecnicoImportRow[];
  skipped: { line: number; reasons: string[]; preview: string }[];
}> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Planilha sem abas');
  }
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
      'Não encontrei a linha de cabeçalho (precisa ter a coluna PROFISSIONAL).',
    );
  }

  const responsaveis: ResponsavelTecnicoImportRow[] = [];
  const skipped: { line: number; reasons: string[]; preview: string }[] = [];
  let lastCreaSection = { crea: '', uf: '' };

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    // Importa todas as linhas após o cabeçalho, inclusive vazias
    const line = i + 1;
    const result = analyzeMappedRow(row, columns, line, lastCreaSection);
    lastCreaSection = result.nextCreaSection;

    if (result.responsavel) {
      responsaveis.push(result.responsavel);
    }
    // Linhas de seção "CREA-XX" não são erros nem registros: apenas mudam a seção.
  }

  return { responsaveis, skipped };
}
