import * as XLSX from 'xlsx';
import {
  basenamePath,
  fileMatchesRecord,
  isZipFile,
  listZipEntryNames,
} from '@/lib/zipEntryNames';
import { resolveContratoNome } from '@/data/juridico-contratos';

export type JuridicoImportColumn = {
  name: string;
  required: boolean;
  hint?: string;
};

export const JURIDICO_PROCESSOS_IMPORT_COLUMNS: readonly JuridicoImportColumn[] = [
  { name: 'ID_PROCESSO', required: true, hint: 'Chave do processo' },
  { name: 'Nº PROCESSO', required: true },
  { name: 'TRIBUNAL', required: false },
  { name: 'VARA', required: false },
  { name: 'RECLAMANTE', required: true },
  { name: 'DATA_AUDIENCIA', required: false },
  { name: 'HORÁRIO', required: false },
  { name: 'PRESENCIAL', required: false },
  { name: 'STATUS PROCESSO', required: false },
  { name: 'DECISÃO DO STF', required: false },
  { name: 'POLO', required: false },
  { name: 'EMPRESA', required: false },
  { name: 'OBJETO', required: false },
  { name: 'CONTRATO', required: false },
  { name: 'FUNÇÃO', required: false },
  { name: 'REGIME DE CONTRATAÇÃO', required: false },
  { name: 'PERÍODO', required: false },
  { name: 'PERÍDO TRABALHADO INÍCIO', required: false },
  { name: 'PERÍDO TRABALHADO FIM', required: false },
  { name: 'REPRESENTANTE DO AUTOR', required: false },
  { name: 'ACORDO', required: false },
  { name: 'VALOR DA CAUSA', required: false },
  { name: 'STATUS DA SENTENÇA', required: false },
  { name: 'VALOR SENTENÇA', required: false },
  { name: 'VALOR DE RO', required: false },
  { name: 'VALOR DE RR', required: false },
  { name: 'VALOR CUSTAS', required: false },
  { name: 'VALOR DO ACORDO', required: false },
  { name: 'VALOR PAGO SENTENCIADO', required: false },
  { name: 'VALOR DA PARCELA', required: false },
  { name: 'VALOR PAGO', required: false },
  { name: 'NUM_PARCELAS', required: false },
  { name: 'CUSTAS', required: false },
  { name: 'PREVIDÊNCIA', required: false },
  { name: 'OUTROS GASTOS / HONONARIOS', required: false },
  { name: 'STATUS', required: false },
  { name: 'OBJETO2', required: false },
  { name: 'DATA_ACORDO', required: false },
  { name: 'DATA DA ABERTURA', required: false },
  { name: 'AGRAVO DE INSTRUMENTO', required: false },
];

export type JuridicoAnexoImport = {
  externalId: string;
  originalName: string;
  sourcePath: string;
};

export type JuridicoComprovanteImport = {
  externalId: string;
  originalName: string;
  sourcePath: string;
  dataPagamento: string;
};

export type JuridicoProcessoImportRow = {
  externalId: string;
  numeroProcesso: string;
  tribunal: string;
  vara: string;
  reclamante: string;
  dataAudiencia: string;
  horario: string;
  presencial: string;
  statusProcesso: string;
  decisaoStf: string;
  polo: string;
  empresa: string;
  objeto: string;
  objeto2: string;
  contrato: string;
  funcao: string;
  regimeContratacao: string;
  periodo: string;
  periodoInicio: string;
  periodoFim: string;
  representanteAutor: string;
  acordo: string;
  valorCausa: string;
  statusSentenca: string;
  valorSentenca: string;
  valorRO: string;
  valorRR: string;
  valorCustas: string;
  valorAcordo: string;
  valorPagoSentenciado: string;
  valorParcela: string;
  valorPago: string;
  numParcelas: string;
  custas: string;
  previdencia: string;
  outrosGastos: string;
  status: string;
  dataAcordo: string;
  dataAbertura: string;
  agravoInstrumento: string;
  anexos: JuridicoAnexoImport[];
  comprovantes: JuridicoComprovanteImport[];
};

export type JuridicoSheetInfo = {
  name: string;
  kind:
    | 'processos'
    | 'anexos'
    | 'comprovantes'
    | 'objetos'
    | 'funcoes'
    | 'varas'
    | 'contratos'
    | 'objetoLookup'
    | 'ignorada';
  rows: number;
};

export type JuridicoImportReport = {
  processos: JuridicoProcessoImportRow[];
  sheets: JuridicoSheetInfo[];
  skipped: { line: number; reasons: string[]; preview: string }[];
};

function normalizeHeaderKey(header: string): string {
  return String(header || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/º/g, 'o')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function sheetMatrix(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  });
}

function headerMap(cells: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  cells.forEach((cell, idx) => {
    const key = normalizeHeaderKey(cellToString(cell));
    if (key && map[key] === undefined) map[key] = idx;
  });
  return map;
}

function pick(map: Record<string, number>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    if (map[key] !== undefined) return map[key];
  }
  for (const wanted of keys) {
    const found = Object.keys(map).find(
      (k) => k === wanted || k.startsWith(`${wanted} `) || k.endsWith(` ${wanted}`),
    );
    if (found) return map[found];
  }
  return undefined;
}

function get(row: unknown[], index: number | undefined): string {
  if (index === undefined) return '';
  return cellToString(row[index]);
}

function getDate(row: unknown[], index: number | undefined): string {
  if (index === undefined) return '';
  return cellToDateString(row[index]);
}

type SheetKind = JuridicoSheetInfo['kind'];

function classifySheet(name: string, headers: string[]): SheetKind {
  const n = normalizeHeaderKey(name);
  const h = headers.map(normalizeHeaderKey).filter(Boolean);
  const hasIdProcesso = h.some((x) => x === 'id processo' || x === 'id_processo');
  const hasNumero = h.some(
    (x) => x.includes('n processo') || x.includes('no processo') || x === 'reclamante',
  );
  const hasContratoId = h.some((x) => x === 'id contrato');
  const hasContratoNome = h.some((x) => x === 'contrato');

  // Aba de cadastro de contratos: serve de lookup para trocar o ID pelo nome real.
  if (hasContratoId && hasContratoNome && !hasIdProcesso) return 'contratos';
  if (hasContratoId && !hasIdProcesso) return 'ignorada';
  if (n.includes('controle de contratos') && !hasIdProcesso) return 'ignorada';
  if (h.includes('id objeto processo') || (n.includes('objetos') && n.includes('processo'))) {
    return 'objetos';
  }
  if (
    hasIdProcesso &&
    h.some(
      (x) =>
        x.includes('anexo pagamento') ||
        x.includes('comprovante') ||
        x === 'anexo pagamento' ||
        x === 'id pagamento',
    )
  ) {
    return 'comprovantes';
  }
  if (
    hasIdProcesso &&
    h.some((x) => x.includes('anexo ata') || x === 'id ata processual' || x === 'anexo ata')
  ) {
    return 'anexos';
  }
  if (hasIdProcesso && hasNumero) return 'processos';
  if (h.includes('id funcao') || (n.includes('funcao') && h.includes('funcao'))) return 'funcoes';
  if (h.includes('id varatr') || n.includes('varas')) return 'varas';
  if (h.includes('id contrato') && h.includes('contrato')) return 'contratos';
  if (h.includes('id obj') || n.includes('obejtos') || (n.includes('objetos') && !n.includes('processo'))) {
    return 'objetoLookup';
  }
  return 'ignorada';
}

function usefulRow(row: unknown[]): boolean {
  return row.some((c) => cellToString(c));
}

export async function parseJuridicoProcessosFromFile(file: File): Promise<JuridicoImportReport> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  if (!workbook.SheetNames.length) throw new Error('Planilha sem abas.');

  const sheets: JuridicoSheetInfo[] = [];
  const classified: Array<{
    name: string;
    kind: SheetKind;
    matrix: (string | number | Date | null)[][];
    map: Record<string, number>;
    headerIndex: number;
  }> = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const matrix = sheetMatrix(sheet);
    let headerIndex = 0;
    let map = headerMap(matrix[0] || []);
    let kind = classifySheet(name, Object.keys(map).length ? (matrix[0] || []).map(cellToString) : []);
    if (kind === 'ignorada') {
      for (let i = 0; i < Math.min(5, matrix.length); i += 1) {
        const candidate = headerMap(matrix[i] || []);
        const k = classifySheet(name, (matrix[i] || []).map(cellToString));
        if (k !== 'ignorada') {
          headerIndex = i;
          map = candidate;
          kind = k;
          break;
        }
      }
    }
    const dataRows = matrix.slice(headerIndex + 1).filter(usefulRow).length;
    sheets.push({ name, kind, rows: dataRows });
    classified.push({ name, kind, matrix, map, headerIndex });
  }

  const processoSheets = classified.filter((s) => s.kind === 'processos');
  if (processoSheets.length === 0) {
    throw new Error(
      'Não encontrei a aba de processos. Precisa ter colunas como ID_PROCESSO, Nº PROCESSO e RECLAMANTE.',
    );
  }

  const funcoes = new Map<string, string>();
  const varas = new Map<string, string>();
  const contratos = new Map<string, string>();
  const objetosLookup = new Map<string, string>();
  const objetosByProcesso = new Map<string, string[]>();
  const anexosByProcesso = new Map<string, JuridicoAnexoImport[]>();
  const comprovantesByProcesso = new Map<string, JuridicoComprovanteImport[]>();

  for (const sheet of classified) {
    const rows = sheet.matrix.slice(sheet.headerIndex + 1);
    const m = sheet.map;
    if (sheet.kind === 'funcoes') {
      const idIdx = pick(m, 'id funcao');
      const nomeIdx = pick(m, 'funcao');
      for (const row of rows) {
        const id = get(row, idIdx);
        const nome = get(row, nomeIdx);
        if (id && nome) funcoes.set(id, nome);
      }
    } else if (sheet.kind === 'varas') {
      const idIdx = pick(m, 'id varatr', 'id vara');
      const nomeIdx = pick(m, 'vara');
      for (const row of rows) {
        const id = get(row, idIdx);
        const nome = get(row, nomeIdx);
        if (id && nome) varas.set(id, nome);
      }
    } else if (sheet.kind === 'contratos') {
      const idIdx = pick(m, 'id contrato');
      const nomeIdx = pick(m, 'contrato');
      for (const row of rows) {
        const id = get(row, idIdx);
        const nome = get(row, nomeIdx);
        if (id && nome) contratos.set(id, nome);
      }
    } else if (sheet.kind === 'objetoLookup') {
      const idIdx = pick(m, 'id obj', 'id objeto');
      const nomeIdx = pick(m, 'objeto');
      for (const row of rows) {
        const id = get(row, idIdx);
        const nome = get(row, nomeIdx);
        if (id && nome) objetosLookup.set(id.toLowerCase(), nome);
      }
    } else if (sheet.kind === 'anexos') {
      const idIdx = pick(m, 'id ata processual', 'id anexo');
      const procIdx = pick(m, 'id processo');
      const pathIdx = pick(m, 'anexo ata', 'anexo');
      for (const row of rows) {
        const proc = get(row, procIdx);
        const sourcePath = get(row, pathIdx);
        if (!proc) continue;
        const list = anexosByProcesso.get(proc) || [];
        list.push({
          externalId: get(row, idIdx),
          originalName: sourcePath ? basenamePath(sourcePath) : 'anexo',
          sourcePath,
        });
        anexosByProcesso.set(proc, list);
      }
    } else if (sheet.kind === 'comprovantes') {
      const idIdx = pick(m, 'id pagamento', 'id comprovante');
      const procIdx = pick(m, 'id processo');
      const pathIdx = pick(m, 'anexo pagamento', 'anexo do comprovante', 'anexo');
      const dataIdx = pick(m, 'data pagamento', 'data_pagamento');
      for (const row of rows) {
        const proc = get(row, procIdx);
        const sourcePath = get(row, pathIdx);
        if (!proc) continue;
        const list = comprovantesByProcesso.get(proc) || [];
        list.push({
          externalId: get(row, idIdx),
          originalName: sourcePath ? basenamePath(sourcePath) : 'comprovante',
          sourcePath,
          dataPagamento: getDate(row, dataIdx),
        });
        comprovantesByProcesso.set(proc, list);
      }
    }
  }

  // Segunda passagem de objetos depois do lookup carregado
  for (const sheet of classified.filter((s) => s.kind === 'objetos')) {
    const rows = sheet.matrix.slice(sheet.headerIndex + 1);
    const m = sheet.map;
    const procIdx = pick(m, 'id processo');
    const objIdx = pick(m, 'objeto processo', 'objeto');
    for (const row of rows) {
      const proc = get(row, procIdx);
      const code = get(row, objIdx);
      if (!proc || !code) continue;
      const label = objetosLookup.get(code.toLowerCase()) || code;
      const list = objetosByProcesso.get(proc) || [];
      if (!list.includes(label)) list.push(label);
      objetosByProcesso.set(proc, list);
    }
  }

  const processos: JuridicoProcessoImportRow[] = [];
  const skipped: JuridicoImportReport['skipped'] = [];
  const seen = new Set<string>();

  for (const sheet of processoSheets) {
    const m = sheet.map;
    const idx = {
      id: pick(m, 'id processo'),
      numero: pick(m, 'n processo', 'no processo', 'numero processo'),
      tribunal: pick(m, 'tribunal'),
      vara: pick(m, 'vara'),
      reclamante: pick(m, 'reclamante'),
      dataAudiencia: pick(m, 'data audiencia', 'data_audiencia'),
      horario: pick(m, 'horario'),
      presencial: pick(m, 'presencial'),
      statusProcesso: pick(m, 'status processo'),
      decisaoStf: pick(m, 'decisao do stf', 'decisao stf'),
      polo: pick(m, 'polo'),
      empresa: pick(m, 'empresa'),
      objeto: pick(m, 'objeto'),
      contrato: pick(m, 'contrato'),
      funcao: pick(m, 'funcao'),
      regime: pick(m, 'regime de contratacao', 'regime contratacao'),
      periodo: pick(m, 'periodo'),
      periodoInicio: pick(m, 'perido trabalhado inicio', 'periodo trabalhado inicio'),
      periodoFim: pick(m, 'perido trabalhado fim', 'periodo trabalhado fim'),
      representante: pick(m, 'representante do autor'),
      acordo: pick(m, 'acordo'),
      valorCausa: pick(m, 'valor da causa'),
      statusSentenca: pick(m, 'status da sentenca'),
      valorSentenca: pick(m, 'valor sentenca'),
      valorRO: pick(m, 'valor de ro'),
      valorRR: pick(m, 'valor de rr'),
      valorCustas: pick(m, 'valor custas'),
      valorAcordo: pick(m, 'valor do acordo'),
      valorPagoSentenciado: pick(m, 'valor pago sentenciado'),
      valorParcela: pick(m, 'valor da parcela'),
      valorPago: pick(m, 'valor pago'),
      numParcelas: pick(m, 'num parcelas', 'num_parcelas'),
      custas: pick(m, 'custas'),
      previdencia: pick(m, 'previdencia'),
      outrosGastos: pick(m, 'outros gastos hononarios', 'outros gastos honorarios'),
      status: pick(m, 'status'),
      objeto2: pick(m, 'objeto2', 'objeto 2'),
      dataAcordo: pick(m, 'data acordo', 'data_acordo'),
      dataAbertura: pick(m, 'data da abertura', 'data abertura'),
      agravo: pick(m, 'agravo de instrumento'),
    };

    for (let i = sheet.headerIndex + 1; i < sheet.matrix.length; i += 1) {
      const row = sheet.matrix[i] || [];
      if (!usefulRow(row)) continue;
      const externalId = get(row, idx.id);
      const numeroProcesso = get(row, idx.numero);
      const reclamante = get(row, idx.reclamante);
      if (!externalId && !numeroProcesso && !reclamante) {
        skipped.push({
          line: i + 1,
          reasons: ['Linha sem ID, número ou reclamante'],
          preview: cellToString(row[0]),
        });
        continue;
      }
      const key = externalId || `${numeroProcesso}|${reclamante}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const varaRaw = get(row, idx.vara);
      const funcaoRaw = get(row, idx.funcao);
      const contratoRaw = get(row, idx.contrato);
      const objetoRaw = get(row, idx.objeto);
      const extraObjetos = objetosByProcesso.get(externalId) || [];
      const objeto2Raw = get(row, idx.objeto2);
      const objeto2 =
        objeto2Raw ||
        extraObjetos.filter((o) => !objetoRaw.toLowerCase().includes(o.toLowerCase())).join(' / ');

      processos.push({
        externalId,
        numeroProcesso,
        tribunal: get(row, idx.tribunal),
        vara: varas.get(varaRaw) || varaRaw,
        reclamante,
        dataAudiencia: getDate(row, idx.dataAudiencia),
        horario: get(row, idx.horario),
        presencial: get(row, idx.presencial),
        statusProcesso: get(row, idx.statusProcesso),
        decisaoStf: get(row, idx.decisaoStf),
        polo: get(row, idx.polo),
        empresa: get(row, idx.empresa),
        objeto: objetoRaw,
        objeto2,
        contrato: contratos.get(contratoRaw) || resolveContratoNome(contratoRaw),
        funcao: funcoes.get(funcaoRaw) || funcaoRaw,
        regimeContratacao: get(row, idx.regime),
        periodo: get(row, idx.periodo),
        periodoInicio: getDate(row, idx.periodoInicio),
        periodoFim: getDate(row, idx.periodoFim),
        representanteAutor: get(row, idx.representante),
        acordo: get(row, idx.acordo),
        valorCausa: get(row, idx.valorCausa),
        statusSentenca: get(row, idx.statusSentenca),
        valorSentenca: get(row, idx.valorSentenca),
        valorRO: get(row, idx.valorRO),
        valorRR: get(row, idx.valorRR),
        valorCustas: get(row, idx.valorCustas),
        valorAcordo: get(row, idx.valorAcordo),
        valorPagoSentenciado: get(row, idx.valorPagoSentenciado),
        valorParcela: get(row, idx.valorParcela),
        valorPago: get(row, idx.valorPago),
        numParcelas: get(row, idx.numParcelas),
        custas: get(row, idx.custas),
        previdencia: get(row, idx.previdencia),
        outrosGastos: get(row, idx.outrosGastos),
        status: get(row, idx.status),
        dataAcordo: getDate(row, idx.dataAcordo),
        dataAbertura: getDate(row, idx.dataAbertura),
        agravoInstrumento: get(row, idx.agravo),
        anexos: anexosByProcesso.get(externalId) || [],
        comprovantes: comprovantesByProcesso.get(externalId) || [],
      });
    }
  }

  return { processos, sheets, skipped };
}

export type LinkedFilePack = {
  files: File[];
  zipFiles: File[];
  names: string[];
  matched: number;
  unmatched: string[];
};

export async function inspectJuridicoFilePack(
  files: File[],
  records: Array<{ sourcePath?: string; externalId?: string }>,
): Promise<LinkedFilePack> {
  const zipFiles: File[] = [];
  const loose: File[] = [];
  const names: string[] = [];

  for (const file of files) {
    if (isZipFile(file)) {
      zipFiles.push(file);
      try {
        const entries = await listZipEntryNames(file);
        names.push(...entries);
      } catch (err) {
        throw err instanceof Error ? err : new Error('Falha ao ler o ZIP.');
      }
    } else {
      loose.push(file);
      names.push(file.name);
    }
  }

  let matched = 0;
  const unmatched: string[] = [];
  for (const name of names) {
    const hit = records.some((r) => fileMatchesRecord(name, r.sourcePath, r.externalId));
    if (hit) matched += 1;
    else unmatched.push(basenamePath(name));
  }

  return { files: loose, zipFiles, names, matched, unmatched };
}

export function collectAnexos(processos: JuridicoProcessoImportRow[]): JuridicoAnexoImport[] {
  return processos.flatMap((p) => p.anexos);
}

export function collectComprovantes(
  processos: JuridicoProcessoImportRow[],
): JuridicoComprovanteImport[] {
  return processos.flatMap((p) => p.comprovantes);
}
