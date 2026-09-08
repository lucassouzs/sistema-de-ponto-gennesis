import * as XLSX from 'xlsx';

export const VEHICLE_IMPORT_COLUMNS = [
  {
    name: 'Marca',
    required: false,
    hint: 'Opcional — se vier errada/abreviada (VW, GM…), o sistema corrige pela FIPE'
  },
  {
    name: 'Modelo',
    required: true,
    hint: 'Pode vir junto com a marca (ex.: VW Gol). O sistema separa e padroniza'
  },
  { name: 'Placa', required: true, hint: 'Pode vir bagunçada — o sistema tenta corrigir (O/0, espaços…). Duplicadas são ignoradas' },
  { name: 'Polo', required: false, hint: 'DF ou GO (aceita Brasília/Goiás)' },
  {
    name: 'Contrato',
    required: false,
    hint: 'Casa com centro de custo / contrato cadastrado e corrige grafia parecida'
  },
  { name: 'Responsável', required: false },
  { name: 'Frota/Particular', required: false, hint: 'Frota ou Particular' },
  { name: 'Ativo', required: false, hint: 'Sim / Não' },
] as const;

export const VEHICLE_IMPORT_TEMPLATE_HEADERS = VEHICLE_IMPORT_COLUMNS.map((c) => c.name);

export const VEHICLE_IMPORT_TEMPLATE_EXAMPLE = [
  'Volkswagen',
  'Gol 1.0',
  'ABC1D23',
  'Brasília',
  'Contrato XYZ',
  'João Silva',
  'Frota',
  'Sim',
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
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['sim', 's', 'true', '1', 'ativo', 'yes'].includes(normalized)) return true;
  if (['nao', 'n', 'false', '0', 'inativo', 'no'].includes(normalized)) return false;
  return undefined;
}

type ImportRowResult = {
  vehicle: Record<string, unknown> | null;
  skipReasons: string[];
  preview: string;
};

function analyzeImportRow(row: Record<string, unknown>, lineNumber: number): ImportRowResult {
  let marcaVeic = pickRowValue(row, 'Marca', 'marcaVeic', 'Fabricante');
  let modeloVeic = pickRowValue(
    row,
    'Modelo',
    'modeloVeic',
    'Veículo',
    'Veiculo',
    'Descrição',
    'Descricao',
    'Carro'
  );
  const placaVeic = pickRowValue(row, 'Placa', 'placaVeic');
  const polo = pickRowValue(row, 'Polo', 'polo');
  const contrato = pickRowValue(row, 'Contrato', 'Projeto', 'contrato', 'Centro de Custo', 'Centro de custo');
  const responsavel = pickRowValue(row, 'Responsável', 'Responsavel', 'responsavel');
  const frotaPartic = pickRowValue(row, 'Frota/Particular', 'Frota Particular', 'frotaPartic', 'frota_partic');
  const ativoRaw = pickRowValue(row, 'Ativo', 'isActive');

  // Se marca veio vazia e o modelo começa com a marca (ex.: "Fiat Strada"), deixa o backend separar.
  // Se só existe "Veículo" e "Modelo" está vazio, já mapeamos acima.

  // Planilha com marca+modelo numa célula de Marca e modelo vazio
  if (marcaVeic && !modeloVeic) {
    modeloVeic = marcaVeic;
    marcaVeic = '';
  }

  const skipReasons: string[] = [];
  if (!modeloVeic) skipReasons.push('Modelo em branco');
  if (!placaVeic) skipReasons.push('Placa em branco');

  const preview = placaVeic || modeloVeic || `Linha ${lineNumber}`;

  if (skipReasons.length > 0) {
    return { vehicle: null, skipReasons, preview };
  }

  const vehicle: Record<string, unknown> = {
    marcaVeic: marcaVeic || undefined,
    modeloVeic,
    placaVeic,
    polo: polo || undefined,
    contrato: contrato || undefined,
    responsavel: responsavel || undefined,
    frotaPartic: frotaPartic || undefined,
  };

  const isActive = parseActive(ativoRaw);
  if (isActive !== undefined) vehicle.isActive = isActive;

  return { vehicle, skipReasons: [], preview };
}

export type VehicleImportParseReport = {
  vehicles: Record<string, unknown>[];
  skipped: Array<{ line: number; reasons: string[]; preview: string }>;
  totalRows: number;
};

function buildImportParseReport(rows: Record<string, unknown>[]): VehicleImportParseReport {
  const vehicles: Record<string, unknown>[] = [];
  const skipped: VehicleImportParseReport['skipped'] = [];

  rows.forEach((row, index) => {
    const lineNumber = index + 2;
    const result = analyzeImportRow(row, lineNumber);
    if (result.vehicle) {
      vehicles.push(result.vehicle);
    } else {
      skipped.push({
        line: lineNumber,
        reasons: result.skipReasons,
        preview: result.preview,
      });
    }
  });

  return { vehicles, skipped, totalRows: rows.length };
}

function parseCsvVehicles(text: string): VehicleImportParseReport {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { vehicles: [], skipped: [], totalRows: 0 };

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

export async function parseVehiclesFromFile(file: File): Promise<VehicleImportParseReport> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (ext === 'xlsx' || ext === 'xls') {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { vehicles: [], skipped: [], totalRows: 0 };
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null });
    return buildImportParseReport(rows);
  }

  if (ext === 'csv') return parseCsvVehicles(await file.text());

  if (ext === 'json') {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error('O JSON deve ser um array de veículos');
    return buildImportParseReport(parsed);
  }

  throw new Error('Formato não suportado. Use planilha Excel (.xlsx, .xls), CSV ou JSON.');
}

export function downloadVehicleImportTemplate(): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    VEHICLE_IMPORT_TEMPLATE_HEADERS,
    VEHICLE_IMPORT_TEMPLATE_EXAMPLE,
  ]);
  ws['!cols'] = VEHICLE_IMPORT_TEMPLATE_HEADERS.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Veículos');
  XLSX.writeFile(wb, 'modelo-importacao-veiculos.xlsx');
}
