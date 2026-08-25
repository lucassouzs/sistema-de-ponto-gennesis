import * as XLSX from 'xlsx';

/** Cidades satélites (espelho do backend) — usadas no modelo e na validação do parse. */
export const FUEL_IMPORT_CITIES = [
  // DF — 33 regiões administrativas
  { code: 'DF_AGUAS_CLARAS', stateCode: 'DF', name: 'Águas Claras' },
  { code: 'DF_ARNIQUEIRA', stateCode: 'DF', name: 'Arniqueira' },
  { code: 'DF_BRAZLANDIA', stateCode: 'DF', name: 'Brazlândia' },
  { code: 'DF_CANDANGOLANDIA', stateCode: 'DF', name: 'Candangolândia' },
  { code: 'DF_CEILANDIA', stateCode: 'DF', name: 'Ceilândia' },
  { code: 'DF_CRUZEIRO', stateCode: 'DF', name: 'Cruzeiro' },
  { code: 'DF_FERCAL', stateCode: 'DF', name: 'Fercal' },
  { code: 'DF_GAMA', stateCode: 'DF', name: 'Gama' },
  { code: 'DF_GUARA', stateCode: 'DF', name: 'Guará' },
  { code: 'DF_ITAPOA', stateCode: 'DF', name: 'Itapoã' },
  { code: 'DF_JARDIM_BOTANICO', stateCode: 'DF', name: 'Jardim Botânico' },
  { code: 'DF_LAGO_NORTE', stateCode: 'DF', name: 'Lago Norte' },
  { code: 'DF_LAGO_SUL', stateCode: 'DF', name: 'Lago Sul' },
  { code: 'DF_NUCLEO_BANDEIRANTE', stateCode: 'DF', name: 'Núcleo Bandeirante' },
  { code: 'DF_PARANOA', stateCode: 'DF', name: 'Paranoá' },
  { code: 'DF_PARK_WAY', stateCode: 'DF', name: 'Park Way' },
  { code: 'DF_PLANALTINA', stateCode: 'DF', name: 'Planaltina' },
  { code: 'DF_PLANO_PILOTO', stateCode: 'DF', name: 'Plano Piloto' },
  { code: 'DF_RECANTO_DAS_EMAS', stateCode: 'DF', name: 'Recanto das Emas' },
  { code: 'DF_RIACHO_FUNDO', stateCode: 'DF', name: 'Riacho Fundo' },
  { code: 'DF_RIACHO_FUNDO_II', stateCode: 'DF', name: 'Riacho Fundo II' },
  { code: 'DF_SAMAMBAIA', stateCode: 'DF', name: 'Samambaia' },
  { code: 'DF_SANTA_MARIA', stateCode: 'DF', name: 'Santa Maria' },
  { code: 'DF_SAO_SEBASTIAO', stateCode: 'DF', name: 'São Sebastião' },
  { code: 'DF_SCIA', stateCode: 'DF', name: 'SCIA' },
  { code: 'DF_SIA', stateCode: 'DF', name: 'SIA' },
  { code: 'DF_SOBRADINHO', stateCode: 'DF', name: 'Sobradinho' },
  { code: 'DF_SOBRADINHO_II', stateCode: 'DF', name: 'Sobradinho II' },
  { code: 'DF_SOL_NASCENTE_POR_DO_SOL', stateCode: 'DF', name: 'Sol Nascente/Pôr do Sol' },
  { code: 'DF_SUDOESTE_OCTOGONAL', stateCode: 'DF', name: 'Sudoeste/Octogonal' },
  { code: 'DF_TAGUATINGA', stateCode: 'DF', name: 'Taguatinga' },
  { code: 'DF_VARJAO', stateCode: 'DF', name: 'Varjão' },
  { code: 'DF_VICENTE_PIRES', stateCode: 'DF', name: 'Vicente Pires' },
  // GO
  { code: 'GO_GOIANIA', stateCode: 'GO', name: 'Goiânia' },
  { code: 'GO_APARECIDA', stateCode: 'GO', name: 'Aparecida de Goiânia' },
  { code: 'GO_ANAPOLIS', stateCode: 'GO', name: 'Anápolis' },
  { code: 'GO_TRINDADE', stateCode: 'GO', name: 'Trindade' },
  { code: 'GO_LUZIANIA', stateCode: 'GO', name: 'Luziânia' },
  { code: 'GO_RIO_VERDE', stateCode: 'GO', name: 'Rio Verde' },
] as const;

/** Códigos/nomes antigos aceitos na importação → código atual. */
const FUEL_IMPORT_CITY_ALIASES: Array<{
  code?: string;
  name?: string;
  mapsTo: (typeof FUEL_IMPORT_CITIES)[number]['code'];
}> = [
  { code: 'DF_ARNIQUEIRAS', mapsTo: 'DF_ARNIQUEIRA' },
  { name: 'Arniqueiras', mapsTo: 'DF_ARNIQUEIRA' },
  { code: 'DF_ASA_NORTE', mapsTo: 'DF_PLANO_PILOTO' },
  { name: 'Asa Norte', mapsTo: 'DF_PLANO_PILOTO' },
  { code: 'DF_SAMAMBAIA_NORTE', mapsTo: 'DF_SAMAMBAIA' },
  { name: 'Samambaia Norte', mapsTo: 'DF_SAMAMBAIA' },
  { code: 'DF_SETOR_CENTRAL_GAMA', mapsTo: 'DF_GAMA' },
  { name: 'Setor Central (Gama)', mapsTo: 'DF_GAMA' },
  { code: 'DF_ZONA_INDUSTRIAL_GUARA', mapsTo: 'DF_GUARA' },
  { name: 'Zona Industrial (Guará)', mapsTo: 'DF_GUARA' },
  { name: 'Sol Nascente', mapsTo: 'DF_SOL_NASCENTE_POR_DO_SOL' },
  { name: 'Pôr do Sol', mapsTo: 'DF_SOL_NASCENTE_POR_DO_SOL' },
  { name: 'Por do Sol', mapsTo: 'DF_SOL_NASCENTE_POR_DO_SOL' },
  { name: 'Sudoeste', mapsTo: 'DF_SUDOESTE_OCTOGONAL' },
  { name: 'Octogonal', mapsTo: 'DF_SUDOESTE_OCTOGONAL' },
];

export const FUEL_STATION_IMPORT_COLUMNS = [
  { name: 'Estado', required: true, hint: 'DF ou GO' },
  { name: 'Cidade', required: true, hint: 'Nome da região administrativa (ex.: Taguatinga, Goiânia)' },
  { name: 'Nome', required: true, hint: 'Nome do posto' },
  { name: 'Endereço', required: false },
  { name: 'Ativo', required: false, hint: 'Sim / Não' },
] as const;

export const FUEL_STATION_IMPORT_TEMPLATE_HEADERS = FUEL_STATION_IMPORT_COLUMNS.map((c) => c.name);

export const FUEL_STATION_IMPORT_TEMPLATE_EXAMPLE = [
  'DF',
  'Taguatinga',
  'Posto Exemplo',
  'QS 01 Conjunto A Lote 10',
  'Sim',
];

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseStateCode(raw: string): 'DF' | 'GO' | null {
  const upper = raw.trim().toUpperCase();
  if (upper === 'DF' || upper === 'GO') return upper;
  return null;
}

/**
 * Resolve o código interno da cidade satélite.
 * Aceita: código antigo (DF_TAGUATINGA), nome da cidade, ou Estado + Cidade.
 */
export function resolveFuelCityCode(cityRaw: string, stateRaw?: string): string | null {
  const cityTrimmed = cityRaw.trim();
  if (!cityTrimmed) return null;

  const upper = cityTrimmed.toUpperCase();
  const byCode = FUEL_IMPORT_CITIES.find((c) => c.code === upper);
  if (byCode) {
    if (stateRaw?.trim()) {
      const state = parseStateCode(stateRaw);
      if (state && byCode.stateCode !== state) return null;
    }
    return byCode.code;
  }

  const aliasByCode = FUEL_IMPORT_CITY_ALIASES.find((a) => a.code === upper);
  if (aliasByCode) {
    if (stateRaw?.trim()) {
      const state = parseStateCode(stateRaw);
      const target = FUEL_IMPORT_CITIES.find((c) => c.code === aliasByCode.mapsTo);
      if (state && target && target.stateCode !== state) return null;
    }
    return aliasByCode.mapsTo;
  }

  const state = stateRaw?.trim() ? parseStateCode(stateRaw) : null;
  if (stateRaw?.trim() && !state) return null;

  const norm = normalizeKey(cityTrimmed);

  const aliasByName = FUEL_IMPORT_CITY_ALIASES.find(
    (a) => a.name && normalizeKey(a.name) === norm
  );
  if (aliasByName) {
    const target = FUEL_IMPORT_CITIES.find((c) => c.code === aliasByName.mapsTo);
    if (state && target && target.stateCode !== state) return null;
    return aliasByName.mapsTo;
  }

  const candidates = FUEL_IMPORT_CITIES.filter((c) => {
    if (state && c.stateCode !== state) return false;
    return (
      normalizeKey(c.name) === norm ||
      normalizeKey(`${c.stateCode} ${c.name}`) === norm ||
      normalizeKey(`${c.name} ${c.stateCode}`) === norm
    );
  });

  if (candidates.length === 1) return candidates[0].code;
  if (candidates.length > 1 && !state) {
    // Nome ambíguo sem Estado — não resolve
    return null;
  }
  return candidates[0]?.code ?? null;
}

function pickRowValue(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  const normalized = new Map(
    Object.entries(row).map(([k, v]) => [normalizeKey(k), v])
  );
  for (const key of keys) {
    const val = normalized.get(normalizeKey(key));
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function parseActive(raw: string): boolean | undefined {
  if (!raw) return undefined;
  const normalized = normalizeKey(raw);
  if (['sim', 's', 'true', '1', 'ativo', 'yes'].includes(normalized)) return true;
  if (['nao', 'n', 'false', '0', 'inativo', 'no'].includes(normalized)) return false;
  return undefined;
}

type ImportRowResult = {
  station: Record<string, unknown> | null;
  skipReasons: string[];
  preview: string;
};

function analyzeImportRow(row: Record<string, unknown>, lineNumber: number): ImportRowResult {
  const stateRaw = pickRowValue(row, 'Estado', 'UF', 'stateCode', 'Estado/UF');
  const cityRaw = pickRowValue(row, 'Cidade', 'cityCode', 'Código da cidade', 'Codigo da cidade');
  const name = pickRowValue(row, 'Nome', 'name', 'Posto');
  const address = pickRowValue(row, 'Endereço', 'Endereco', 'address');
  const ativoRaw = pickRowValue(row, 'Ativo', 'isActive');

  const skipReasons: string[] = [];

  if (!stateRaw) skipReasons.push('Estado em branco (use DF ou GO)');
  else if (!parseStateCode(stateRaw)) skipReasons.push(`Estado inválido: "${stateRaw}" (use DF ou GO)`);

  const cityCode = resolveFuelCityCode(cityRaw, stateRaw);
  if (!cityRaw) skipReasons.push('Cidade em branco');
  else if (!cityCode) {
    skipReasons.push(
      stateRaw
        ? `Cidade inválida para ${stateRaw.trim().toUpperCase()}: "${cityRaw}"`
        : `Cidade inválida: "${cityRaw}"`
    );
  }
  if (!name) skipReasons.push('Nome em branco');

  const preview = name || cityRaw || `Linha ${lineNumber}`;
  if (skipReasons.length > 0) {
    return { station: null, skipReasons, preview };
  }

  const station: Record<string, unknown> = {
    cityCode,
    name,
    address: address || undefined,
  };

  const isActive = parseActive(ativoRaw);
  if (isActive !== undefined) station.isActive = isActive;

  return { station, skipReasons: [], preview };
}

export type FuelStationImportParseReport = {
  stations: Record<string, unknown>[];
  skipped: Array<{ line: number; reasons: string[]; preview: string }>;
  totalRows: number;
};

function buildImportParseReport(rows: Record<string, unknown>[]): FuelStationImportParseReport {
  const stations: Record<string, unknown>[] = [];
  const skipped: FuelStationImportParseReport['skipped'] = [];

  rows.forEach((row, index) => {
    const lineNumber = index + 2;
    const result = analyzeImportRow(row, lineNumber);
    if (result.station) {
      stations.push(result.station);
    } else {
      skipped.push({
        line: lineNumber,
        reasons: result.skipReasons,
        preview: result.preview,
      });
    }
  });

  return { stations, skipped, totalRows: rows.length };
}

function parseCsvStations(text: string): FuelStationImportParseReport {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { stations: [], skipped: [], totalRows: 0 };

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

export async function parseFuelStationsFromFile(file: File): Promise<FuelStationImportParseReport> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (ext === 'xlsx' || ext === 'xls') {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames.find((n) => normalizeKey(n).includes('posto'))
      || workbook.SheetNames[0];
    if (!sheetName) return { stations: [], skipped: [], totalRows: 0 };
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null });
    return buildImportParseReport(rows);
  }

  if (ext === 'csv') return parseCsvStations(await file.text());

  if (ext === 'json') {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error('O JSON deve ser um array de postos');
    return buildImportParseReport(parsed);
  }

  throw new Error('Formato não suportado. Use planilha Excel (.xlsx, .xls), CSV ou JSON.');
}

export function downloadFuelStationImportTemplate(): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    FUEL_STATION_IMPORT_TEMPLATE_HEADERS,
    FUEL_STATION_IMPORT_TEMPLATE_EXAMPLE,
  ]);
  ws['!cols'] = FUEL_STATION_IMPORT_TEMPLATE_HEADERS.map((h) => ({
    wch: h === 'Endereço' ? 36 : h === 'Nome' ? 24 : 14,
  }));
  XLSX.utils.book_append_sheet(wb, ws, 'Postos');

  const citiesSheet = XLSX.utils.aoa_to_sheet([
    ['Estado', 'Cidade'],
    ...FUEL_IMPORT_CITIES.map((c) => [c.stateCode, c.name]),
  ]);
  citiesSheet['!cols'] = [{ wch: 8 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, citiesSheet, 'Cidades');

  XLSX.writeFile(wb, 'modelo-importacao-postos-combustivel.xlsx');
}
