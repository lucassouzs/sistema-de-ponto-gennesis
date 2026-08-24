import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type NfeRecebidaListItem = {
  id: string;
  chaveAcesso: string | null;
  nsu: string;
  schema: string | null;
  numero: string | null;
  serie: string | null;
  emitCnpj: string | null;
  emitNome: string | null;
  destinatarioCnpj: string | null;
  valor: number | null;
  dataEmissao: string | null;
  fetchedAt: string;
  /** XML já gravado na pasta de NFs (busca SEFAZ / importação). */
  hasXml: boolean;
  /** true quando o XML no disco é procNFe completo (não resumo). */
  isFullXml: boolean;
  xmlFileName: string | null;
};

type WorkerDoc = {
  nsu?: string;
  schema?: string;
  file?: string;
};

type WorkerResult = {
  ok?: boolean;
  error?: string;
  ultimoNsu?: string;
  docs?: WorkerDoc[];
  message?: string;
  chave?: string;
  fileName?: string;
  docsCount?: number;
  documentosRecebidos?: number;
  statusCodigo?: string;
  statusMotivo?: string;
};

/** cStat 656: a SEFAZ bloqueia o CNPJ por 1 hora quando as consultas se repetem sem novidade. */
const SEFAZ_CONSUMO_INDEVIDO = '656';
/** Bloqueio oficial da SEFAZ. */
export const SEFAZ_BLOQUEIO_MS = 60 * 60 * 1000;
/**
 * Folga além de 1h para não consultar “no limite” e renovar o 656.
 * Usado tanto após bloqueio quanto entre consultas normais (cStat 137).
 */
export const SEFAZ_COOLDOWN_MS = 65 * 60 * 1000;
let sefazBlockedUntil: number | null = null;

export function isSefazBlockedMessage(msg: string | null | undefined): boolean {
  return Boolean(msg && /consumo indevido|bloquead/i.test(msg));
}

function sefazBloqueioRestanteMin(): number | null {
  if (sefazBlockedUntil == null) return null;
  const restante = sefazBlockedUntil - Date.now();
  if (restante <= 0) {
    sefazBlockedUntil = null;
    return null;
  }
  return Math.max(1, Math.ceil(restante / 60_000));
}

/** Restaura o cooldown 656 após restart do processo (usa lastFetchAt + mensagem). */
function restoreSefazBlockFromState(lastFetchAt: Date | null | undefined, lastMessage: string | null | undefined) {
  if (!lastFetchAt || !isSefazBlockedMessage(lastMessage)) return;
  const until = lastFetchAt.getTime() + SEFAZ_BLOQUEIO_MS;
  if (until > Date.now()) {
    sefazBlockedUntil = until;
  }
}

/**
 * Decide se ainda dá para consultar a SEFAZ sem risco de renovar o bloqueio.
 * Após 656 exige o bloqueio oficial + folga; entre consultas normais usa o cooldown com folga.
 */
export async function getSefazFetchGate(): Promise<{
  ok: boolean;
  waitMin?: number;
  reason?: 'blocked' | 'cooldown';
  lastFetchAt?: string | null;
}> {
  const state = await prisma.nfeDistribuicaoState.findUnique({ where: { id: 'default' } });
  if (!state?.lastFetchAt) {
    return { ok: true, lastFetchAt: null };
  }

  restoreSefazBlockFromState(state.lastFetchAt, state.lastMessage);
  const blockedMin = sefazBloqueioRestanteMin();
  if (blockedMin != null) {
    // Ainda dentro da janela oficial de 60 min do 656 — NÃO consultar.
    return {
      ok: false,
      waitMin: blockedMin,
      reason: 'blocked',
      lastFetchAt: state.lastFetchAt.toISOString(),
    };
  }

  const requiredMs = SEFAZ_COOLDOWN_MS; // 65 min: após 656 ou consulta normal (evita renovar bloqueio)
  const elapsed = Date.now() - state.lastFetchAt.getTime();
  if (elapsed >= requiredMs) {
    return { ok: true, lastFetchAt: state.lastFetchAt.toISOString() };
  }

  return {
    ok: false,
    waitMin: Math.max(1, Math.ceil((requiredMs - elapsed) / 60_000)),
    reason: isSefazBlockedMessage(state.lastMessage) ? 'blocked' : 'cooldown',
    lastFetchAt: state.lastFetchAt.toISOString(),
  };
}

function dataDir(): string {
  const configured = process.env.NFE_DATA_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), 'data', 'nfe-xmls');
}

function ensureDataDir(): string {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function xmlSearchDirs(): string[] {
  const dirs = [dataDir()];
  const envDir = process.env.NFE_XML_DIR?.trim();
  if (envDir) dirs.push(path.resolve(envDir));
  return [...new Set(dirs.map((d) => path.resolve(d)))];
}

/** Localiza o XML no disco, preferindo documento completo (procNFe) em vez de resumo (resNFe). */
export async function resolveNfeXmlAbsolutePath(
  row: {
    xmlFileName?: string | null;
    chaveAcesso?: string | null;
  },
  opts?: { preferFull?: boolean }
): Promise<string | null> {
  const preferFull = opts?.preferFull !== false;
  const chave = (row.chaveAcesso || '').replace(/\D/g, '');
  const candidateNames = [
    chave ? `NFe-${chave}.xml` : null,
    chave ? `${chave}.xml` : null,
    chave ? `NFe${chave}.xml` : null,
    row.xmlFileName?.trim() || null,
  ].filter((n): n is string => Boolean(n));

  const found: Array<{ path: string; full: boolean }> = [];

  for (const dir of xmlSearchDirs()) {
    for (const name of candidateNames) {
      const fullPath = path.join(dir, name);
      const xml = await readXmlIfExists(fullPath);
      if (xml == null) continue;
      found.push({ path: fullPath, full: isXmlCompletoNfe(xml) });
    }
    if (chave) {
      try {
        const files = await fs.promises.readdir(dir);
        for (const f of files) {
          if (!f.toLowerCase().endsWith('.xml') || !f.includes(chave)) continue;
          const fullPath = path.join(dir, f);
          if (found.some((x) => x.path === fullPath)) continue;
          const xml = await readXmlIfExists(fullPath);
          if (xml == null) continue;
          found.push({ path: fullPath, full: isXmlCompletoNfe(xml) });
        }
      } catch {
        /* ignore missing dir */
      }
    }
  }

  if (found.length === 0) return null;
  if (preferFull) {
    const complete = found.find((f) => f.full);
    if (complete) return complete.path;
  }
  return found[0]?.path ?? null;
}

/** Resumo SEFAZ (sem itens) — não serve para DANFE. */
function isResumoNfeXml(xml: string): boolean {
  return /<resNFe[\s>/]/i.test(xml) && !/<nfeProc[\s>/]/i.test(xml);
}

function isXmlCompletoNfe(xml: string): boolean {
  if (!xml || isResumoNfeXml(xml)) return false;
  return (
    /<nfeProc[\s>/]/i.test(xml) ||
    (/<NFe[\s>/]/i.test(xml) && /<infNFe[\s>/]/i.test(xml))
  );
}

async function readXmlIfExists(filePath: string): Promise<string | null> {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const m = xml.match(re);
  return m?.[1]?.trim() || null;
}

/** Extrai número/série da chave de acesso (44 dígitos). */
function numeroSerieFromChave(chave: string | null): { numero: string | null; serie: string | null } {
  if (!chave || !/^\d{44}$/.test(chave)) return { numero: null, serie: null };
  const serie = String(Number(chave.slice(22, 25)));
  const numero = String(Number(chave.slice(25, 34)));
  return { numero, serie };
}

function parseNfeXml(xml: string): {
  chaveAcesso: string | null;
  numero: string | null;
  serie: string | null;
  emitCnpj: string | null;
  emitNome: string | null;
  destinatarioCnpj: string | null;
  valor: Prisma.Decimal | null;
  dataEmissao: Date | null;
} {
  const chaveAcesso =
    extractTag(xml, 'chNFe') ||
    xml.match(/Id="NFe(\d{44})"/i)?.[1] ||
    null;

  const fromChave = numeroSerieFromChave(chaveAcesso);
  let numero = extractTag(xml, 'nNF') || fromChave.numero;
  let serie = extractTag(xml, 'serie') || fromChave.serie;

  const emitBlock = xml.match(/<emit>[\s\S]*?<\/emit>/i)?.[0] ?? '';
  const destBlock = xml.match(/<dest>[\s\S]*?<\/dest>/i)?.[0] ?? '';

  // resNFe traz CNPJ/xNome na raiz (sem bloco <emit>)
  const emitCnpj =
    extractTag(emitBlock, 'CNPJ') ||
    extractTag(emitBlock, 'CPF') ||
    (!emitBlock ? extractTag(xml, 'CNPJ') || extractTag(xml, 'CPF') : null);
  const emitNome =
    extractTag(emitBlock, 'xNome') || (!emitBlock ? extractTag(xml, 'xNome') : null);
  const destinatarioCnpj = extractTag(destBlock, 'CNPJ') || extractTag(destBlock, 'CPF');

  const valorStr = extractTag(xml, 'vNF');
  const valor =
    valorStr && Number.isFinite(Number(valorStr.replace(',', '.')))
      ? new Prisma.Decimal(valorStr.replace(',', '.'))
      : null;

  const dhEmi = extractTag(xml, 'dhEmi') || extractTag(xml, 'dEmi');
  let dataEmissao: Date | null = null;
  if (dhEmi) {
    const ymd = dhEmi.length >= 10 ? dhEmi.slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      dataEmissao = new Date(`${ymd}T12:00:00`);
    } else {
      const parsed = new Date(dhEmi);
      if (!Number.isNaN(parsed.getTime())) dataEmissao = parsed;
    }
  }

  return {
    chaveAcesso,
    numero,
    serie,
    emitCnpj,
    emitNome,
    destinatarioCnpj,
    valor,
    dataEmissao
  };
}

function parseDecimal(value: string | null): number | null {
  if (!value) return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function formatEnderecoFromBlock(block: string): string | null {
  if (!block) return null;
  const parts = [
    extractTag(block, 'xLgr'),
    extractTag(block, 'nro'),
    extractTag(block, 'xCpl'),
    extractTag(block, 'xBairro'),
    extractTag(block, 'xMun'),
    extractTag(block, 'UF'),
    extractTag(block, 'CEP'),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

export type NfeDetalheItem = {
  nItem: number;
  codigo: string | null;
  descricao: string | null;
  ncm: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
};

export type NfeDetalheResponse = {
  id: string;
  chaveAcesso: string | null;
  nsu: string;
  schema: string | null;
  numero: string | null;
  serie: string | null;
  emitCnpj: string | null;
  emitNome: string | null;
  destinatarioCnpj: string | null;
  valor: number | null;
  dataEmissao: string | null;
  fetchedAt: string;
  hasXml: boolean;
  isFullXml: boolean;
  xmlFileName: string | null;
  naturezaOperacao: string | null;
  emitFantasia: string | null;
  emitIe: string | null;
  emitEndereco: string | null;
  destNome: string | null;
  destIe: string | null;
  destEndereco: string | null;
  totais: {
    vProd: number | null;
    vFrete: number | null;
    vSeg: number | null;
    vDesc: number | null;
    vOutro: number | null;
    vICMS: number | null;
    vIPI: number | null;
    vPIS: number | null;
    vCOFINS: number | null;
    vNF: number | null;
  };
  itens: NfeDetalheItem[];
  aviso: string | null;
};

/** Extrai cabeçalho enriquecido + itens do XML (procNFe) ou só o que houver no resumo. */
function parseNfeDetalheFromXml(xml: string): {
  naturezaOperacao: string | null;
  emitFantasia: string | null;
  emitIe: string | null;
  emitEndereco: string | null;
  destNome: string | null;
  destCnpj: string | null;
  destIe: string | null;
  destEndereco: string | null;
  totais: NfeDetalheResponse['totais'];
  itens: NfeDetalheItem[];
  isFullXml: boolean;
} {
  const isFull = isXmlCompletoNfe(xml);
  const emitBlock = xml.match(/<emit>[\s\S]*?<\/emit>/i)?.[0] ?? '';
  const destBlock = xml.match(/<dest>[\s\S]*?<\/dest>/i)?.[0] ?? '';
  const enderEmit = xml.match(/<enderEmit>[\s\S]*?<\/enderEmit>/i)?.[0] ?? '';
  const enderDest = xml.match(/<enderDest>[\s\S]*?<\/enderDest>/i)?.[0] ?? '';
  const totalBlock = xml.match(/<ICMSTot>[\s\S]*?<\/ICMSTot>/i)?.[0] ?? '';

  const itens: NfeDetalheItem[] = [];
  if (isFull) {
    const detRe = /<det\b([^>]*)>([\s\S]*?)<\/det>/gi;
    let m: RegExpExecArray | null;
    while ((m = detRe.exec(xml)) !== null) {
      const attrs = m[1] || '';
      const body = m[2] || '';
      const nItemAttr = attrs.match(/nItem\s*=\s*"(\d+)"/i)?.[1];
      const prod = body.match(/<prod>[\s\S]*?<\/prod>/i)?.[0] ?? body;
      itens.push({
        nItem: nItemAttr ? Number(nItemAttr) : itens.length + 1,
        codigo: extractTag(prod, 'cProd'),
        descricao: extractTag(prod, 'xProd'),
        ncm: extractTag(prod, 'NCM'),
        cfop: extractTag(prod, 'CFOP'),
        unidade: extractTag(prod, 'uCom') || extractTag(prod, 'uTrib'),
        quantidade: parseDecimal(extractTag(prod, 'qCom') || extractTag(prod, 'qTrib')),
        valorUnitario: parseDecimal(extractTag(prod, 'vUnCom') || extractTag(prod, 'vUnTrib')),
        valorTotal: parseDecimal(extractTag(prod, 'vProd')),
      });
    }
    itens.sort((a, b) => a.nItem - b.nItem);
  }

  return {
    naturezaOperacao: extractTag(xml, 'natOp'),
    emitFantasia: extractTag(emitBlock, 'xFant'),
    emitIe: extractTag(emitBlock, 'IE'),
    emitEndereco: formatEnderecoFromBlock(enderEmit),
    destNome: extractTag(destBlock, 'xNome'),
    destCnpj: extractTag(destBlock, 'CNPJ') || extractTag(destBlock, 'CPF'),
    destIe: extractTag(destBlock, 'IE'),
    destEndereco: formatEnderecoFromBlock(enderDest),
    totais: {
      vProd: parseDecimal(extractTag(totalBlock, 'vProd')),
      vFrete: parseDecimal(extractTag(totalBlock, 'vFrete')),
      vSeg: parseDecimal(extractTag(totalBlock, 'vSeg')),
      vDesc: parseDecimal(extractTag(totalBlock, 'vDesc')),
      vOutro: parseDecimal(extractTag(totalBlock, 'vOutro')),
      vICMS: parseDecimal(extractTag(totalBlock, 'vICMS')),
      vIPI: parseDecimal(extractTag(totalBlock, 'vIPI')),
      vPIS: parseDecimal(extractTag(totalBlock, 'vPIS')),
      vCOFINS: parseDecimal(extractTag(totalBlock, 'vCOFINS')),
      vNF: parseDecimal(extractTag(totalBlock, 'vNF') || extractTag(xml, 'vNF')),
    },
    itens,
    isFullXml: isFull,
  };
}

async function getOrCreateState() {
  return prisma.nfeDistribuicaoState.upsert({
    where: { id: 'default' },
    create: { id: 'default', ultimoNsu: '000000000000000' },
    update: {}
  });
}

type ImportResult = 'created' | 'updated' | 'skipped' | 'out_of_year';

type ImportCounts = {
  imported: number;
  updated: number;
  skipped: number;
  outOfYear: number;
};

function emptyImportCounts(): ImportCounts {
  return { imported: 0, updated: 0, skipped: 0, outOfYear: 0 };
}

function addImportCounts(a: ImportCounts, b: ImportCounts): ImportCounts {
  return {
    imported: a.imported + b.imported,
    updated: a.updated + b.updated,
    skipped: a.skipped + b.skipped,
    outOfYear: a.outOfYear + b.outOfYear,
  };
}

function formatImportMessageParts(counts: ImportCounts): string {
  if (counts.imported <= 0) return 'nenhuma nota nova nesta consulta';
  return counts.imported === 1 ? '1 nota nova nesta consulta' : `${counts.imported} notas novas nesta consulta`;
}

function emissionYear(dataEmissao: Date | null): number | null {
  if (!dataEmissao) return null;
  return dataEmissao.getFullYear();
}

function targetYearFromPeriod(period?: { from?: string; to?: string }): number {
  const fromYear = period?.from?.slice(0, 4);
  if (fromYear && /^\d{4}$/.test(fromYear)) return Number(fromYear);
  const yearEnv = process.env.NFE_AUTO_FETCH_YEAR?.trim();
  if (yearEnv && /^\d{4}$/.test(yearEnv)) return Number(yearEnv);
  return new Date().getFullYear();
}

function classifyImport(
  result: 'created' | 'updated',
  dataEmissao: Date | null,
  year: number
): ImportResult {
  const y = emissionYear(dataEmissao);
  if (y == null || y !== year) return 'out_of_year';
  return result;
}

async function importFromXmlFile(
  filePath: string,
  nsu: string,
  schema?: string | null,
  period?: { from?: string; to?: string }
): Promise<ImportResult> {
  const xml = await fs.promises.readFile(filePath, 'utf8');
  const parsed = parseNfeXml(xml);
  const year = targetYearFromPeriod(period);

  const fileName = path.basename(filePath);
  const destDir = ensureDataDir();
  const destPath = path.join(destDir, fileName);

  if (path.resolve(filePath) !== path.resolve(destPath)) {
    await fs.promises.copyFile(filePath, destPath);
  }

  const data = {
    nsu: nsu || parsed.chaveAcesso || fileName,
    schema: schema ?? null,
    numero: parsed.numero,
    serie: parsed.serie,
    emitCnpj: parsed.emitCnpj,
    emitNome: parsed.emitNome,
    destinatarioCnpj: parsed.destinatarioCnpj,
    valor: parsed.valor,
    dataEmissao: parsed.dataEmissao,
    xmlFileName: fileName,
    fetchedAt: new Date()
  };

  const incomingResumo =
    (schema || '').toLowerCase().includes('resnfe') ||
    fileName.toLowerCase().startsWith('resnfe');

  if (parsed.chaveAcesso) {
    const existing = await prisma.nfeRecebida.findUnique({
      where: { chaveAcesso: parsed.chaveAcesso },
      select: { id: true, schema: true, xmlFileName: true, dataEmissao: true, valor: true }
    });
    if (existing) {
      const existingFull =
        (existing.schema || '').toLowerCase().includes('proc') ||
        (existing.xmlFileName || '').startsWith('NFe-');
      if (existingFull && incomingResumo) return 'skipped';

      const keepDate =
        incomingResumo ||
        !parsed.dataEmissao ||
        (existing.dataEmissao != null &&
          emissionYear(parsed.dataEmissao) !== emissionYear(existing.dataEmissao) &&
          emissionYear(existing.dataEmissao) === year);
      const savedDate = keepDate ? existing.dataEmissao : parsed.dataEmissao;
      const savedValor =
        parsed.valor == null && existing.valor != null ? existing.valor : parsed.valor;

      await prisma.nfeRecebida.update({
        where: { chaveAcesso: parsed.chaveAcesso },
        data: {
          ...data,
          dataEmissao: savedDate,
          valor: savedValor,
          schema: incomingResumo ? existing.schema : data.schema,
          xmlFileName: incomingResumo ? existing.xmlFileName : data.xmlFileName,
        }
      });
      return classifyImport('updated', savedDate, year);
    }
    try {
      await prisma.nfeRecebida.create({
        data: { ...data, chaveAcesso: parsed.chaveAcesso }
      });
      return classifyImport('created', parsed.dataEmissao, year);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const clash = await prisma.nfeRecebida.findUnique({
          where: { chaveAcesso: parsed.chaveAcesso },
          select: { dataEmissao: true, valor: true, schema: true, xmlFileName: true },
        });
        const savedDate = incomingResumo && clash?.dataEmissao ? clash.dataEmissao : parsed.dataEmissao;
        await prisma.nfeRecebida.update({
          where: { chaveAcesso: parsed.chaveAcesso },
          data: {
            ...data,
            dataEmissao: savedDate,
            valor: parsed.valor == null && clash?.valor != null ? clash.valor : parsed.valor,
          }
        });
        return classifyImport('updated', savedDate, year);
      }
      throw err;
    }
  }

  const existingByNsu = nsu
    ? await prisma.nfeRecebida.findFirst({
        where: { nsu },
        select: { id: true, dataEmissao: true, valor: true },
      })
    : null;
  if (existingByNsu) {
    const savedDate =
      incomingResumo && existingByNsu.dataEmissao
        ? existingByNsu.dataEmissao
        : parsed.dataEmissao ?? existingByNsu.dataEmissao;
    await prisma.nfeRecebida.update({
      where: { id: existingByNsu.id },
      data: {
        ...data,
        dataEmissao: savedDate,
        valor:
          parsed.valor == null && existingByNsu.valor != null
            ? existingByNsu.valor
            : parsed.valor,
      },
    });
    return classifyImport('updated', savedDate, year);
  }

  await prisma.nfeRecebida.create({
    data: { ...data, chaveAcesso: null }
  });
  return classifyImport('created', parsed.dataEmissao, year);
}

function runJavaWorker(
  ultNsu: string,
  outDir: string,
  period?: { from?: string; to?: string },
  opts?: { maxConsultas?: number }
): Promise<WorkerResult> {
  const maxConsultas =
    opts?.maxConsultas ??
    (Number(process.env.NFE_MAX_CONSULTAS?.trim() || '50') || 50);
  const args = [
    `--ult-nsu=${ultNsu}`,
    `--out-dir=${outDir}`,
    `--max-consultas=${Math.max(1, maxConsultas)}`,
  ];
  if (period?.from) args.push(`--period-from=${period.from}`);
  if (period?.to) args.push(`--period-to=${period.to}`);
  return spawnJavaWorker(args);
}

/** Busca XML completo (procNFe) na SEFAZ pela chave de 44 dígitos. */
function runJavaWorkerByChave(chave: string, outDir: string): Promise<WorkerResult> {
  const digits = chave.replace(/\D/g, '');
  if (digits.length !== 44) {
    return Promise.reject(new Error('Chave de acesso inválida (44 dígitos).'));
  }
  return spawnJavaWorker([`--chave=${digits}`, `--out-dir=${outDir}`]);
}

function resolveMonorepoRoot(): string {
  // start: cwd = apps/backend; build/dev às vezes = raiz do monorepo
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'tools', 'nfe-distribuicao', 'pom.xml'))) return cwd;
  const up = path.resolve(cwd, '../..');
  if (fs.existsSync(path.join(up, 'tools', 'nfe-distribuicao', 'pom.xml'))) return up;
  return path.resolve(cwd, '../..');
}

function resolveNfeWorkerJar(): string {
  if (process.env.NFE_WORKER_JAR?.trim()) return process.env.NFE_WORKER_JAR.trim();
  const root = resolveMonorepoRoot();
  const candidates = [
    path.resolve(process.cwd(), 'vendor', 'nfe-distribuicao.jar'),
    path.resolve(root, 'apps/backend/vendor/nfe-distribuicao.jar'),
    path.resolve(process.cwd(), 'dist', 'nfe-distribuicao.jar'),
    path.resolve(root, 'apps/backend/dist/nfe-distribuicao.jar'),
    path.resolve(process.cwd(), 'native', 'nfe-distribuicao.jar'),
    path.resolve(root, 'apps/backend/native/nfe-distribuicao.jar'),
    path.resolve(root, 'tools/nfe-distribuicao/target/nfe-distribuicao.jar'),
    path.resolve(process.cwd(), '../../tools/nfe-distribuicao/target/nfe-distribuicao.jar'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function resolveNfeJavaBin(): string {
  if (process.env.NFE_JAVA_BIN?.trim()) return process.env.NFE_JAVA_BIN.trim();
  const root = resolveMonorepoRoot();
  const bundled = [
    path.resolve(process.cwd(), 'vendor', 'jdk', 'bin', 'java'),
    path.resolve(root, 'apps/backend/vendor/jdk/bin/java'),
    path.resolve(process.cwd(), 'dist', 'jdk', 'bin', 'java'),
    path.resolve(root, 'apps/backend/dist/jdk/bin/java'),
    path.resolve(root, '.tools/jdk/bin/java'),
  ];
  for (const p of bundled) {
    if (fs.existsSync(p)) return p;
  }
  return 'java';
}

function findJavaInPath(): string | null {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const names = process.platform === 'win32' ? ['java.exe'] : ['java'];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function nfeJavaAvailable(): boolean {
  const javaBin = resolveNfeJavaBin();
  if (javaBin !== 'java') return fs.existsSync(javaBin);
  return findJavaInPath() != null;
}

/** Log de diagnóstico no boot: mostra se o worker SEFAZ tem JAR e Java disponíveis. */
export function logNfeRuntimeStatus(): void {
  const jar = resolveNfeWorkerJar();
  const javaBin = resolveNfeJavaBin();
  const javaResolved = javaBin === 'java' ? findJavaInPath() : javaBin;

  console.log(`   📦 NF-e worker JAR: ${jar} ${fs.existsSync(jar) ? '(ok)' : '(AUSENTE)'}`);
  console.log(
    javaResolved && fs.existsSync(javaResolved)
      ? `   ☕ Java: ${javaResolved}`
      : '   ☕ Java: NÃO encontrado — defina RAILPACK_PACKAGES=java@17 no serviço (ou NFE_JAVA_BIN)'
  );
}

function spawnJavaWorker(extraArgs: string[]): Promise<WorkerResult> {
  const jar = resolveNfeWorkerJar();
  const javaBin = resolveNfeJavaBin();

  if (!fs.existsSync(jar)) {
    return Promise.reject(
      new Error(
        `Worker Java não encontrado em ${jar}. Compile tools/nfe-distribuicao (mvn package) e configure NFE_WORKER_JAR.`
      )
    );
  }

  const required = [
    'NFE_CERT_PATH',
    'NFE_CERT_PASSWORD',
    'NFE_CADEIA_PATH',
    'NFE_CNPJ',
    'NFE_UF',
  ];
  for (const key of required) {
    if (!process.env[key]?.trim()) {
      return Promise.reject(new Error(`Variável ${key} não configurada no backend (.env).`));
    }
  }

  return new Promise((resolve, reject) => {
    const args = ['-jar', jar, ...extraArgs];

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(javaBin, args, {
        env: { ...process.env },
        windowsHide: true,
      });
    } catch (err) {
      reject(
        new Error(
          `Não foi possível executar o Java (${javaBin}): ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      );
      return;
    }

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (err) => {
      const isMissingJava = (err as NodeJS.ErrnoException)?.code === 'ENOENT';
      reject(
        isMissingJava
          ? new Error(
              `Java não encontrado no servidor (${javaBin}). No Railway, adicione a variável RAILPACK_PACKAGES=java@17 no serviço do backend e faça redeploy.`
            )
          : err
      );
    });
    child.on('close', (code) => {
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const jsonLine = [...lines].reverse().find((l) => l.startsWith('{'));
      if (!jsonLine) {
        reject(
          new Error(
            `Worker Java não retornou JSON (exit ${code}). ${stderr || stdout || 'Sem saída.'}`
          )
        );
        return;
      }
      try {
        const parsed = JSON.parse(jsonLine) as WorkerResult;
        if (parsed.ok === false) {
          reject(new Error(parsed.error || parsed.message || 'Falha no worker Java'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error(`JSON inválido do worker: ${jsonLine}`));
      }
    });
  });
}

async function importDirectory(
  dir: string,
  period?: { from?: string; to?: string }
): Promise<ImportCounts> {
  if (!fs.existsSync(dir)) return emptyImportCounts();
  const files = (await fs.promises.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.xml'));
  // Completos (NFe-chave) depois dos resumos, para não sobrescrever procNFe com resNFe.
  files.sort((a, b) => {
    const score = (name: string) =>
      /^NFe-\d{44}\.xml$/i.test(name) ? 2 : /^resNFe-/i.test(name) ? 0 : 1;
    return score(a) - score(b);
  });
  const counts = emptyImportCounts();
  for (const file of files) {
    const full = path.join(dir, file);
    const nsuMatch = file.match(/(\d{15,})/);
    let schema: string | null = 'import';
    try {
      const xml = await fs.promises.readFile(full, 'utf8');
      if (isResumoNfeXml(xml)) schema = 'resNFe';
      else if (isXmlCompletoNfe(xml)) schema = 'procNFe';
    } catch {
      /* keep import */
    }
    const result = await importFromXmlFile(
      full,
      nsuMatch?.[1] || file.replace(/\.xml$/i, ''),
      schema,
      period
    );
    if (result === 'created') counts.imported += 1;
    else if (result === 'updated') counts.updated += 1;
    else if (result === 'skipped') counts.skipped += 1;
    else if (result === 'out_of_year') counts.outOfYear += 1;
  }
  return counts;
}

function normalizePeriod(input?: { periodFrom?: string; periodTo?: string }) {
  const from = input?.periodFrom?.trim() || undefined;
  const to = input?.periodTo?.trim() || undefined;
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    throw new Error('Data inicial inválida. Use AAAA-MM-DD.');
  }
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error('Data final inválida. Use AAAA-MM-DD.');
  }
  if (from && to && from > to) {
    throw new Error('A data inicial não pode ser maior que a final.');
  }
  return { from, to };
}

/** Período padrão do job automático: ano configurado (ou ano atual) até hoje. */
export function nfeAutoFetchPeriod(): { periodFrom: string; periodTo: string } {
  const now = new Date();
  const yearEnv = process.env.NFE_AUTO_FETCH_YEAR?.trim();
  const year = yearEnv && /^\d{4}$/.test(yearEnv) ? Number(yearEnv) : now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const today = `${now.getFullYear()}-${m}-${d}`;
  const from = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const to = today <= yearEnd ? today : yearEnd;
  if (from > to) {
    return { periodFrom: today, periodTo: today };
  }
  return { periodFrom: from, periodTo: to };
}

let buscarInFlight: Promise<unknown> | null = null;

export class NfeRecebidaService {
  async list(params: {
    q?: string;
    emitente?: string | string[];
    page?: number;
    pageSize?: number;
    periodFrom?: string;
    periodTo?: string;
    scope?: 'ano' | 'outros';
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(500, Math.max(1, params.pageSize ?? 50));
    const q = params.q?.trim();
    const emitentes = (Array.isArray(params.emitente) ? params.emitente : [params.emitente || ''])
      .flatMap((v) => String(v).split(','))
      .map((v) => v.trim())
      .filter(Boolean);
    const period = normalizePeriod(params);
    const year = nfeAutoFetchPeriod().periodFrom.slice(0, 4);
    const yearFrom = `${year}-01-01`;
    const yearTo = `${year}-12-31`;

    const and: Prisma.NfeRecebidaWhereInput[] = [];
    if (q) {
      and.push({
        OR: [
          { emitNome: { contains: q, mode: 'insensitive' } },
          { emitCnpj: { contains: q } },
          { numero: { contains: q } },
          { chaveAcesso: { contains: q } },
          { nsu: { contains: q } },
        ],
      });
    }
    if (emitentes.length > 0) {
      and.push({
        OR: emitentes.map((emitente) => {
          const digits = emitente.replace(/\D/g, '');
          if (digits.length >= 11) {
            return { emitCnpj: { contains: digits } };
          }
          return {
            OR: [
              { emitNome: { contains: emitente, mode: 'insensitive' } },
              { emitCnpj: { contains: emitente } },
            ],
          };
        }),
      });
    }
    if (params.scope === 'outros') {
      and.push({
        OR: [
          { dataEmissao: null },
          { dataEmissao: { lt: new Date(`${yearFrom}T00:00:00.000Z`) } },
          { dataEmissao: { gt: new Date(`${yearTo}T23:59:59.999Z`) } },
        ],
      });
    } else if (period.from || period.to) {
      and.push({
        dataEmissao: {
          ...(period.from ? { gte: new Date(`${period.from}T00:00:00.000Z`) } : {}),
          ...(period.to ? { lte: new Date(`${period.to}T23:59:59.999Z`) } : {}),
        },
      });
    }

    const where: Prisma.NfeRecebidaWhereInput = and.length > 0 ? { AND: and } : {};

    const yearWhere: Prisma.NfeRecebidaWhereInput = {
      dataEmissao: {
        gte: new Date(`${yearFrom}T00:00:00.000Z`),
        lte: new Date(`${yearTo}T23:59:59.999Z`),
      },
    };
    const outrosWhere: Prisma.NfeRecebidaWhereInput = {
      OR: [
        { dataEmissao: null },
        { dataEmissao: { lt: new Date(`${yearFrom}T00:00:00.000Z`) } },
        { dataEmissao: { gt: new Date(`${yearTo}T23:59:59.999Z`) } },
      ],
    };

    const [total, rows, state, totalAno, totalOutros] = await Promise.all([
      prisma.nfeRecebida.count({ where }),
      prisma.nfeRecebida.findMany({
        where,
        orderBy: [{ dataEmissao: 'desc' }, { fetchedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      getOrCreateState(),
      prisma.nfeRecebida.count({ where: yearWhere }),
      prisma.nfeRecebida.count({ where: outrosWhere }),
    ]);

    const items: NfeRecebidaListItem[] = await Promise.all(
      rows.map(async (row) => {
        const xmlPath = await resolveNfeXmlAbsolutePath(row, { preferFull: true });
        const schemaLower = (row.schema || '').toLowerCase();
        const isFullXml = schemaLower.includes('resnfe')
          ? false
          : schemaLower.includes('procnfe') || schemaLower.includes('nfeproc')
            ? true
            : Boolean(xmlPath);
        const chaveOk = (row.chaveAcesso || '').replace(/\D/g, '').length === 44;
        return {
          id: row.id,
          chaveAcesso: row.chaveAcesso,
          nsu: row.nsu,
          schema: row.schema,
          numero: row.numero,
          serie: row.serie,
          emitCnpj: row.emitCnpj,
          emitNome: row.emitNome,
          destinatarioCnpj: row.destinatarioCnpj,
          valor: row.valor != null ? Number(row.valor) : null,
          dataEmissao: row.dataEmissao?.toISOString() ?? null,
          fetchedAt: row.fetchedAt.toISOString(),
          hasXml: Boolean(xmlPath) || chaveOk,
          isFullXml: Boolean(xmlPath) && isFullXml,
          xmlFileName: row.xmlFileName,
        };
      })
    );

    return {
      items,
      total,
      totalAno,
      totalOutros,
      page,
      pageSize,
      ultimoNsu: state.ultimoNsu,
      lastFetchAt: state.lastFetchAt?.toISOString() ?? null,
      lastMessage: state.lastMessage
    };
  }

  /** Lista emitentes distintos (para filtro da tela). */
  async listEmitentes(): Promise<Array<{ cnpj: string; nome: string }>> {
    const rows = await prisma.nfeRecebida.findMany({
      where: {
        OR: [{ emitCnpj: { not: null } }, { emitNome: { not: null } }],
      },
      distinct: ['emitCnpj'],
      select: { emitCnpj: true, emitNome: true },
      orderBy: [{ emitCnpj: 'asc' }],
    });

    const byKey = new Map<string, { cnpj: string; nome: string }>();
    for (const row of rows) {
      const cnpj = (row.emitCnpj || '').replace(/\D/g, '');
      const nome = (row.emitNome || '').trim();
      const key = cnpj || nome.toLowerCase();
      if (!key) continue;
      const prev = byKey.get(key);
      if (!prev || (nome && !prev.nome)) {
        byKey.set(key, { cnpj, nome: nome || prev?.nome || cnpj || '—' });
      }
    }

    return Array.from(byKey.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    );
  }

  /** Detalhe enriquecido a partir do XML (tenta obter procNFe na SEFAZ se só houver resumo). */
  async getDetalhe(id: string): Promise<NfeDetalheResponse | null> {
    const row = await prisma.nfeRecebida.findUnique({ where: { id } });
    if (!row) return null;

    let xmlPath = await resolveNfeXmlAbsolutePath(row, { preferFull: true });
    let xml = xmlPath ? await readXmlIfExists(xmlPath) : null;
    const chaveOk = (row.chaveAcesso || '').replace(/\D/g, '').length === 44;

    // Se só houver resumo (ou nada), tenta baixar o XML completo pela chave.
    if ((!xml || !isXmlCompletoNfe(xml)) && chaveOk) {
      try {
        const fullPath = await this.ensureFullXml(row);
        if (fullPath) {
          xmlPath = fullPath;
          xml = await readXmlIfExists(fullPath);
        }
      } catch (err) {
        console.warn('[nfe] getDetalhe: não foi possível obter XML completo:', err);
      }
    }

    const base: NfeDetalheResponse = {
      id: row.id,
      chaveAcesso: row.chaveAcesso,
      nsu: row.nsu,
      schema: row.schema,
      numero: row.numero,
      serie: row.serie,
      emitCnpj: row.emitCnpj,
      emitNome: row.emitNome,
      destinatarioCnpj: row.destinatarioCnpj,
      valor: row.valor != null ? Number(row.valor) : null,
      dataEmissao: row.dataEmissao?.toISOString() ?? null,
      fetchedAt: row.fetchedAt.toISOString(),
      hasXml: Boolean(xmlPath) || chaveOk,
      isFullXml: false,
      xmlFileName: row.xmlFileName,
      naturezaOperacao: null,
      emitFantasia: null,
      emitIe: null,
      emitEndereco: null,
      destNome: null,
      destIe: null,
      destEndereco: null,
      totais: {
        vProd: null,
        vFrete: null,
        vSeg: null,
        vDesc: null,
        vOutro: null,
        vICMS: null,
        vIPI: null,
        vPIS: null,
        vCOFINS: null,
        vNF: row.valor != null ? Number(row.valor) : null,
      },
      itens: [],
      aviso: null,
    };

    if (!xml) {
      base.aviso = chaveOk
        ? 'Não foi possível obter o XML completo na SEFAZ neste momento. Tente Baixar DANFE mais tarde.'
        : 'Sem XML local para esta nota.';
      return base;
    }

    const parsed = parseNfeDetalheFromXml(xml);
    base.isFullXml = parsed.isFullXml;
    base.naturezaOperacao = parsed.naturezaOperacao;
    base.emitFantasia = parsed.emitFantasia;
    base.emitIe = parsed.emitIe;
    base.emitEndereco = parsed.emitEndereco;
    base.destNome = parsed.destNome;
    base.destIe = parsed.destIe;
    base.destEndereco = parsed.destEndereco;
    if (parsed.destCnpj) base.destinatarioCnpj = parsed.destCnpj;
    base.totais = {
      ...parsed.totais,
      vNF: parsed.totais.vNF ?? base.totais.vNF,
    };
    base.itens = parsed.itens;

    if (!parsed.isFullXml) {
      base.aviso =
        'Só há o resumo SEFAZ (resNFe). Itens e impostos detalhados exigem o XML completo (procNFe), que ainda não está disponível para esta chave.';
    }

    return base;
  }

  /** Retorna caminho absoluto e nome sugerido do XML da NF, ou null se não houver arquivo. */
  async getXmlFile(id: string): Promise<{ absolutePath: string; downloadName: string } | null> {
    const row = await prisma.nfeRecebida.findUnique({
      where: { id },
      select: { xmlFileName: true, chaveAcesso: true, numero: true },
    });
    if (!row) return null;
    const absolutePath = await this.ensureFullXml(row);
    if (!absolutePath) return null;
    const chave = (row.chaveAcesso || '').replace(/\D/g, '');
    const downloadName =
      (chave ? `NFe-${chave}.xml` : null) ||
      (row.xmlFileName && path.basename(row.xmlFileName)) ||
      `nfe-${row.numero || id}.xml`;
    return { absolutePath, downloadName };
  }

  /**
   * Garante XML completo (procNFe) no disco.
   * Se só houver resumo (resNFe), consulta a SEFAZ pela chave.
   */
  async ensureFullXml(row: {
    xmlFileName?: string | null;
    chaveAcesso?: string | null;
    id?: string;
  }): Promise<string | null> {
    let absolutePath = await resolveNfeXmlAbsolutePath(row, { preferFull: true });
    if (absolutePath) {
      const xml = await readXmlIfExists(absolutePath);
      if (xml && isXmlCompletoNfe(xml)) return absolutePath;
    }

    const chave = (row.chaveAcesso || '').replace(/\D/g, '');
    if (chave.length !== 44) return absolutePath;

    const javaEnabled =
      process.env.NFE_JAVA_ENABLED === '1' || process.env.NFE_JAVA_ENABLED === 'true';
    if (!javaEnabled) {
      throw new Error(
        'Só há o resumo da NF (resNFe). Ative NFE_JAVA_ENABLED=1 com certificado para baixar o XML completo / DANFE.'
      );
    }

    const outDir = ensureDataDir();
    const result = await runJavaWorkerByChave(chave, outDir);
    if (!result.docsCount || result.docsCount < 1) {
      throw new Error(
        result.message ||
          'A SEFAZ não retornou o XML completo desta NF (pode ser só resumo ou fora da janela de 90 dias).'
      );
    }

    const fileName = result.fileName?.trim() || `NFe-${chave}.xml`;
    const fullPath = path.join(outDir, fileName);
    if (row.id) {
      await prisma.nfeRecebida.update({
        where: { id: row.id },
        data: { xmlFileName: fileName, schema: 'procNFe' },
      });
    }

    absolutePath = (await resolveNfeXmlAbsolutePath(
      { ...row, xmlFileName: fileName, chaveAcesso: chave },
      { preferFull: true }
    )) || fullPath;

    const xml = await readXmlIfExists(absolutePath);
    if (!xml || !isXmlCompletoNfe(xml)) {
      throw new Error('XML baixado ainda não é o documento completo (procNFe).');
    }
    return absolutePath;
  }

  /** Gera DANFE em PDF a partir do XML completo (busca na SEFAZ se necessário). */
  async getDanfePdf(id: string): Promise<{ buffer: Buffer; downloadName: string }> {
    const row = await prisma.nfeRecebida.findUnique({
      where: { id },
      select: { id: true, xmlFileName: true, chaveAcesso: true, numero: true },
    });
    if (!row) throw new Error('NF não encontrada');

    const xmlPath = await this.ensureFullXml(row);
    if (!xmlPath) throw new Error('XML da NF não encontrado no servidor');

    const xml = await fs.promises.readFile(xmlPath, 'utf8');
    if (!isXmlCompletoNfe(xml)) {
      throw new Error('XML incompleto (resumo). Não é possível gerar o DANFE.');
    }

    const chave = (row.chaveAcesso || '').replace(/\D/g, '');
    const pdfPath = path.join(
      path.dirname(xmlPath),
      chave ? `DANFE-${chave}.pdf` : `DANFE-${row.numero || id}.pdf`
    );

    try {
      await fs.promises.access(pdfPath, fs.constants.R_OK);
      const cached = await fs.promises.readFile(pdfPath);
      if (cached.length > 1000) {
        return {
          buffer: cached,
          downloadName: path.basename(pdfPath),
        };
      }
    } catch {
      /* gerar */
    }

    const { gerarPDF } = await import('nfe-danfe-pdf');
    const pdfDoc = await gerarPDF(xml);
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      // nfe-danfe-pdf já chama doc.end() internamente
    });

    await fs.promises.writeFile(pdfPath, buffer).catch(() => undefined);

    return {
      buffer,
      downloadName: path.basename(pdfPath),
    };
  }

  async buscar(input?: {
    periodFrom?: string;
    periodTo?: string;
    trigger?: 'manual' | 'cron';
    /** Zera o NSU e varre o histórico ainda disponível na SEFAZ. */
    resetNsu?: boolean;
  }) {
    if (buscarInFlight) {
      throw new Error('Já existe uma busca de NFs em andamento. Aguarde terminar.');
    }

    const run = (async () => {
      const period = normalizePeriod(input);
      const state = await getOrCreateState();
      restoreSefazBlockFromState(state.lastFetchAt, state.lastMessage);
      const outDir = ensureDataDir();
      let imported = 0;
      let skipped = 0;
      let message = '';
      const resetNsu = Boolean(input?.resetNsu);
      const triggerLabel = input?.trigger === 'cron' ? ' [auto]' : resetNsu ? ' [histórico]' : '';
      const periodLabel =
        period.from || period.to
          ? ` período ${period.from || '…'} a ${period.to || '…'}`
          : '';

      const javaEnabled =
        process.env.NFE_JAVA_ENABLED === '1' || process.env.NFE_JAVA_ENABLED === 'true';
      const importDir = process.env.NFE_XML_DIR?.trim();

      if (javaEnabled) {
        const gate = await getSefazFetchGate();
        if (!gate.ok) {
          const msg =
            gate.reason === 'blocked'
              ? `A SEFAZ ainda está com consulta pausada deste CNPJ. Próxima tentativa em ~${gate.waitMin} min.`
              : `Aguardando intervalo mínimo entre consultas SEFAZ (~${gate.waitMin} min) para não renovar o bloqueio.`;
          // Auto: só pula — não chama a SEFAZ e não “renova” o bloqueio.
          if (input?.trigger === 'cron') {
            return {
              imported: 0,
              skipped: 0,
              message: msg,
              periodFrom: period.from ?? null,
              periodTo: period.to ?? null,
              resetNsu,
              skippedDueToCooldown: true,
            };
          }
          throw new Error(msg);
        }

        const startNsu = resetNsu ? '000000000000000' : state.ultimoNsu;
        if (resetNsu) {
          await prisma.nfeDistribuicaoState.update({
            where: { id: 'default' },
            data: { ultimoNsu: startNsu },
          });
        }
        const histMax = Number(process.env.NFE_HISTORICO_MAX_CONSULTAS?.trim() || '200') || 200;
        const maxConsultas = resetNsu
          ? Math.max(histMax, Number(process.env.NFE_MAX_CONSULTAS?.trim() || '50') || 50)
          : undefined;
        const result = await runJavaWorker(startNsu, outDir, period, { maxConsultas });
        const fromOut = await importDirectory(outDir, period);
        imported = fromOut.imported;
        skipped = fromOut.skipped + fromOut.outOfYear;
        const novoNsu = result.ultimoNsu || startNsu;

        if (result.statusCodigo === SEFAZ_CONSUMO_INDEVIDO) {
          sefazBlockedUntil = Date.now() + SEFAZ_BLOQUEIO_MS;
          message = `SEFAZ${triggerLabel}: consulta bloqueada por consumo indevido (consultas repetidas). Libera em ~60 min. Último NSU: ${novoNsu}.`;
          await prisma.nfeDistribuicaoState.update({
            where: { id: 'default' },
            data: { lastFetchAt: new Date(), lastMessage: message },
          });
          throw new Error(message);
        }

        message = `SEFAZ${triggerLabel}${periodLabel}: ${formatImportMessageParts(fromOut)}. Último NSU: ${novoNsu}.`;
        await prisma.nfeDistribuicaoState.update({
          where: { id: 'default' },
          data: {
            ultimoNsu: novoNsu,
            lastFetchAt: new Date(),
            lastMessage: message
          }
        });
      } else if (importDir) {
        const result = await importDirectory(importDir, period);
        const fromOut = await importDirectory(outDir, period);
        const counts = addImportCounts(result, fromOut);
        imported = counts.imported;
        skipped = counts.skipped + counts.outOfYear;
        message = `Importação de pasta${triggerLabel}${periodLabel}: ${formatImportMessageParts(counts)}. Configure NFE_JAVA_ENABLED=1 para buscar na SEFAZ.`;
        await prisma.nfeDistribuicaoState.update({
          where: { id: 'default' },
          data: {
            lastFetchAt: new Date(),
            lastMessage: message
          }
        });
      } else {
        // Ainda tenta a pasta local de XMLs (legado).
        const fromOut = await importDirectory(outDir, period);
        if (fromOut.imported + fromOut.updated + fromOut.skipped + fromOut.outOfYear === 0) {
          throw new Error(
            'Busca não configurada. Defina NFE_JAVA_ENABLED=1 (com certificado) ou NFE_XML_DIR / data/nfe-xmls com XMLs.'
          );
        }
        imported = fromOut.imported;
        skipped = fromOut.skipped + fromOut.outOfYear;
        message = `Importação local${triggerLabel}${periodLabel}: ${formatImportMessageParts(fromOut)}.`;
        await prisma.nfeDistribuicaoState.update({
          where: { id: 'default' },
          data: {
            lastFetchAt: new Date(),
            lastMessage: message,
          },
        });
      }

      return {
        imported,
        skipped,
        message,
        periodFrom: period.from ?? null,
        periodTo: period.to ?? null,
        resetNsu,
        skippedDueToCooldown: false,
      };
    })();

    // catch aqui evita unhandledRejection (mata o processo no Node 18);
    // o erro real continua propagando para quem chamou via `run`.
    buscarInFlight = run
      .catch(() => undefined)
      .finally(() => {
        buscarInFlight = null;
      });

    return run as Promise<{
      imported: number;
      skipped: number;
      message: string;
      periodFrom: string | null;
      periodTo: string | null;
      resetNsu: boolean;
      skippedDueToCooldown?: boolean;
    }>;
  }

  /** Reimporta XMLs já baixados (sem consultar SEFAZ). */
  async reimportLocal(period?: { periodFrom?: string; periodTo?: string }) {
    const p = normalizePeriod(period);
    const outDir = ensureDataDir();
    const fromDir = await importDirectory(outDir, p);
    const xmlDir = process.env.NFE_XML_DIR?.trim();
    let extra = emptyImportCounts();
    if (xmlDir && path.resolve(xmlDir) !== path.resolve(outDir)) {
      extra = await importDirectory(xmlDir, p);
    }
    const counts = addImportCounts(fromDir, extra);
    const message = `Reimportação local: ${formatImportMessageParts(counts)}.`;
    // Não sobrescreve lastMessage da SEFAZ (evita poluir a UI)
    return { ...counts, message };
  }
}
