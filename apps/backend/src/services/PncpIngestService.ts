import { prisma } from '../lib/prisma';
import {
  fetchPncpPublicacaoPage,
  normalizePncpSearchText,
  objetoMatchesPncpKeywords,
  PNCP_MODALIDADES,
  type PncpContratacaoListItem,
} from './PncpConsultaService';
import { loadPncpKeywordsNormalized } from './pncpKeywordsStore';

/** DF/GO/SP primeiro para a lista encher rápido; depois o restante do Brasil. */
export const BRASIL_UFS = [
  'DF', 'GO', 'SP',
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'ES', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'TO',
] as const;

const BRASIL_UF_SET = new Set<string>(BRASIL_UFS);

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_PAGE_DELAY_MS = 650;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const INCREMENTAL_OVERLAP_DAYS = 1;
const MAX_429_RETRIES = 5;
const MAX_PAGES_PER_COMBO = 40;
const PROGRESS_EVERY_PAGES = 3;

export type PncpSyncTrigger = 'cron' | 'manual';

export type PncpSyncOptions = {
  /** Subconjunto de UFs; omitido = todas. */
  ufs?: string[];
  /** Só UFs com erro na última tentativa persistida. */
  retryErrorsOnly?: boolean;
  /** Busca desde a última sync OK da UF (default true). */
  incremental?: boolean;
  /** Só UFs desatualizadas (default true no incremental). Ignorado se escolher UFs específicas. */
  staleOnly?: boolean;
  /** Força lookback completo (30 dias) em todas as UFs selecionadas. */
  fullResync?: boolean;
};

export type PncpUfProgress = {
  uf: string;
  status: 'pending' | 'running' | 'done' | 'error';
  upsertedThisRun: number;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastStatus: string | null;
  lastErrorMessage: string | null;
};

export type PncpSyncStatus = {
  running: boolean;
  currentUf: string | null;
  currentModalidade: string | null;
  syncOptions: {
    ufs: string[];
    retryErrorsOnly: boolean;
    incremental: boolean;
    staleOnly: boolean;
    fullResync: boolean;
  } | null;
  progress: {
    totalUfs: number;
    doneUfs: number;
    pendingUfs: number;
    pagesFetched: number;
    upserted: number;
    rateLimitHits: number;
    lookbackDays: number;
    startedAt: string | null;
    ufs: PncpUfProgress[];
  } | null;
  mirror: {
    total: number;
    byUf: { uf: string; count: number }[];
  };
  errorUfCount: number;
  lastRun: {
    id: string;
    status: string;
    trigger: string;
    startedAt: string;
    finishedAt: string | null;
    lookbackDays: number;
    pagesFetched: number;
    upserted: number;
    pruned: number;
    rateLimitHits: number;
    errorMessage: string | null;
  } | null;
};

let running = false;
let cancelRequested = false;
let currentRunId: string | null = null;

function isSyncCancelRequested(): boolean {
  return cancelRequested;
}

/** Solicita interrupção da sync em andamento (efetiva entre páginas/UFs). */
export function requestPncpSyncCancel(): { requested: boolean; message?: string } {
  if (!running) {
    return { requested: false, message: 'Nenhuma sincronização em andamento.' };
  }
  cancelRequested = true;
  console.log('[pncp-sync] cancelamento solicitado');
  return { requested: true };
}

let currentUf: string | null = null;
let currentModalidade: string | null = null;
let liveLookbackDays = DEFAULT_LOOKBACK_DAYS;
let liveStartedAt: string | null = null;
let livePagesFetched = 0;
let liveUpserted = 0;
let liveRateLimitHits = 0;
let liveUfProgress: PncpUfProgress[] = [];
let liveSyncOptions: PncpSyncStatus['syncOptions'] = null;
let cronStarted = false;
let cronTimer: ReturnType<typeof setInterval> | null = null;

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw == null || raw === '') return fallback;
  const s = raw.trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'nao', 'não', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function envInt(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toYyyymmdd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || '');
  return /limite de requisi/i.test(message);
}

function normalizeUfs(raw: string[] | undefined): string[] {
  if (!raw?.length) return [...BRASIL_UFS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const uf = String(item || '').trim().toUpperCase();
    if (!BRASIL_UF_SET.has(uf) || seen.has(uf)) continue;
    seen.add(uf);
    out.push(uf);
  }
  return out.sort(
    (a, b) => BRASIL_UFS.indexOf(a as (typeof BRASIL_UFS)[number]) - BRASIL_UFS.indexOf(b as (typeof BRASIL_UFS)[number])
  );
}

function resolveSyncOptions(options?: PncpSyncOptions): Required<PncpSyncOptions> {
  const fullResync = options?.fullResync === true;
  const incremental = fullResync ? false : options?.incremental !== false;
  return {
    ufs: normalizeUfs(options?.ufs),
    retryErrorsOnly: options?.retryErrorsOnly === true,
    incremental,
    staleOnly: fullResync ? false : options?.staleOnly !== false,
    fullResync,
  };
}

/** Preenche lastSuccessAt a partir do espelho local (syncs anteriores à tabela por UF). */
async function backfillPncpSyncUfStatesFromMirror(): Promise<number> {
  const [mirrorMax, lastGlobalRun, existingStates] = await Promise.all([
    prisma.pncpContratacao.groupBy({
      by: ['uf'],
      _max: { syncedAt: true, dataInclusao: true },
    }),
    prisma.pncpSyncRun.findFirst({
      where: { status: { in: ['success', 'partial'] }, finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
    }),
    prisma.pncpSyncUfState.findMany({ select: { uf: true, lastSuccessAt: true, lastStatus: true } }),
  ]);

  const existingMap = new Map(existingStates.map((s) => [s.uf, s]));
  let count = 0;

  for (const row of mirrorMax) {
    const existing = existingMap.get(row.uf);
    if (existing?.lastSuccessAt) continue;

    const inferred =
      row._max.syncedAt ?? row._max.dataInclusao ?? lastGlobalRun?.finishedAt ?? null;
    if (!inferred) continue;

    await prisma.pncpSyncUfState.upsert({
      where: { uf: row.uf },
      create: {
        uf: row.uf,
        lastSuccessAt: inferred,
        lastAttemptAt: inferred,
        lastStatus: existing?.lastStatus === 'error' ? 'error' : 'success',
        lastDataFinal: toYyyymmdd(inferred),
      },
      update: {
        lastSuccessAt: inferred,
        lastAttemptAt: inferred,
        ...(existing?.lastStatus === 'error' ? {} : { lastStatus: 'success' }),
      },
    });
    count += 1;
  }

  if (count > 0) {
    console.log(`[pncp-sync] backfill: ${count} UF(s) com lastSuccessAt inferido do espelho`);
  }
  return count;
}

function isExplicitUfSelection(options: Required<PncpSyncOptions>): boolean {
  return options.ufs.length < BRASIL_UFS.length;
}

async function resolveUfsToSync(options: Required<PncpSyncOptions>): Promise<string[]> {
  await backfillPncpSyncUfStatesFromMirror();

  if (options.retryErrorsOnly) {
    const errorRows = await prisma.pncpSyncUfState.findMany({
      where: { lastStatus: 'error' },
      select: { uf: true },
      orderBy: { uf: 'asc' },
    });
    let ufs = errorRows.map((r: { uf: string }) => r.uf);
    if (options.ufs.length < BRASIL_UFS.length) {
      const allowed = new Set(options.ufs);
      ufs = ufs.filter((uf: string) => allowed.has(uf));
    }
    return ufs.sort(
      (a: string, b: string) =>
        BRASIL_UFS.indexOf(a as (typeof BRASIL_UFS)[number]) -
        BRASIL_UFS.indexOf(b as (typeof BRASIL_UFS)[number])
    );
  }

  let ufs = options.ufs;

  if (
    options.staleOnly &&
    options.incremental &&
    !options.fullResync &&
    !isExplicitUfSelection(options)
  ) {
    const staleMs = envInt('PNCP_SYNC_STALE_MS', 45 * 60 * 1000);
    const cutoff = Date.now() - staleMs;
    const states = await loadUfStates();

    ufs = ufs.filter((uf) => {
      const s = states.get(uf);
      if (!s?.lastSuccessAt || s.lastStatus === 'error') return true;
      return s.lastSuccessAt.getTime() < cutoff;
    });

    if (ufs.length === 0) {
      console.log('[pncp-sync] todas as UFs estão atualizadas (staleOnly)');
    } else {
      console.log(`[pncp-sync] staleOnly: ${ufs.length} UF(s) desatualizada(s) → ${ufs.join(', ')}`);
    }
  }

  return ufs;
}

type UfStateRow = Awaited<ReturnType<typeof loadUfStates>> extends Map<string, infer V> ? V : never;

async function loadUfStates(): Promise<
  Map<
    string,
    {
      lastSuccessAt: Date | null;
      lastAttemptAt: Date | null;
      lastStatus: string;
      lastErrorMessage: string | null;
    }
  >
> {
  const rows = await prisma.pncpSyncUfState.findMany();
  return new Map(
    rows.map(
      (r: {
        uf: string;
        lastSuccessAt: Date | null;
        lastAttemptAt: Date | null;
        lastStatus: string;
        lastErrorMessage: string | null;
      }) => [
        r.uf,
        {
          lastSuccessAt: r.lastSuccessAt,
          lastAttemptAt: r.lastAttemptAt,
          lastStatus: r.lastStatus,
          lastErrorMessage: r.lastErrorMessage,
        },
      ]
    )
  );
}

async function loadMirrorLastSyncedByUf(): Promise<Map<string, Date>> {
  const rows = await prisma.pncpContratacao.groupBy({
    by: ['uf'],
    _max: { syncedAt: true },
  });
  const map = new Map<string, Date>();
  for (const row of rows) {
    if (row._max.syncedAt) map.set(row.uf, row._max.syncedAt);
  }
  return map;
}

let lastBackfillAt = 0;

async function ensureUfStatesBackfilled(): Promise<void> {
  const now = Date.now();
  if (now - lastBackfillAt < 30_000) return;

  const [stateSuccessCount, mirrorUfCount] = await Promise.all([
    prisma.pncpSyncUfState.count({ where: { lastSuccessAt: { not: null } } }),
    prisma.pncpContratacao.groupBy({ by: ['uf'], _count: { _all: true } }).then((r) => r.length),
  ]);

  if (mirrorUfCount > 0 && stateSuccessCount >= mirrorUfCount) {
    lastBackfillAt = now;
    return;
  }

  await backfillPncpSyncUfStatesFromMirror();
  lastBackfillAt = now;
}

function getDateWindowForUf(
  ufState: UfStateRow | undefined,
  lookbackDays: number,
  incremental: boolean
): { dataInicial: string; dataFinal: string; mode: 'incremental' | 'full' } {
  const end = new Date();
  const dataFinal = toYyyymmdd(end);

  if (incremental && ufState?.lastSuccessAt) {
    const start = new Date(ufState.lastSuccessAt);
    start.setDate(start.getDate() - INCREMENTAL_OVERLAP_DAYS);
    return { dataInicial: toYyyymmdd(start), dataFinal, mode: 'incremental' };
  }

  const start = new Date();
  start.setDate(start.getDate() - lookbackDays);
  return { dataInicial: toYyyymmdd(start), dataFinal, mode: 'full' };
}

async function persistUfState(
  uf: string,
  status: 'success' | 'error',
  runId: string,
  dataFinal: string,
  errorMessage?: string | null
): Promise<void> {
  const now = new Date();
  await prisma.pncpSyncUfState.upsert({
    where: { uf },
    create: {
      uf,
      lastStatus: status,
      lastAttemptAt: now,
      lastSuccessAt: status === 'success' ? now : null,
      lastDataFinal: dataFinal,
      lastErrorMessage: status === 'error' ? errorMessage ?? null : null,
      lastRunId: runId,
    },
    update: {
      lastStatus: status,
      lastAttemptAt: now,
      lastDataFinal: dataFinal,
      lastRunId: runId,
      ...(status === 'success'
        ? { lastSuccessAt: now, lastErrorMessage: null }
        : { lastErrorMessage: errorMessage ?? null }),
    },
  });
}

async function upsertItems(
  items: PncpContratacaoListItem[],
  codigoModalidade: number,
  ufFallback: string,
  keywordsNormalized: string[]
): Promise<number> {
  const now = new Date();
  let count = 0;

  for (const item of items) {
    const numero = item.numeroControlePNCP?.trim();
    if (!numero) continue;
    if (!objetoMatchesPncpKeywords(item.objeto, keywordsNormalized)) continue;

    const uf = (item.uf || ufFallback).toUpperCase();
    const data = {
      sequencialCompra: item.sequencialCompra,
      processo: item.processo,
      numeroCompra: item.numeroCompra,
      objeto: item.objeto,
      objetoNorm: normalizePncpSearchText(item.objeto || ''),
      orgao: item.orgao,
      cnpjOrgao: item.cnpjOrgao,
      unidadeCompradora: item.unidadeCompradora,
      codigoUnidadeCompradora: item.codigoUnidadeCompradora,
      uf,
      municipio: item.municipio,
      modalidade: item.modalidade,
      codigoModalidade,
      situacao: item.situacao,
      modoDisputa: item.modoDisputa,
      plataforma: item.plataforma,
      srp: item.srp,
      valorEstimado: item.valorEstimado,
      valorHomologado: item.valorHomologado,
      dataInclusao: parseIsoDate(item.dataInclusao),
      dataAberturaProposta: parseIsoDate(item.dataAberturaProposta),
      dataEncerramentoProposta: parseIsoDate(item.dataEncerramentoProposta),
      amparoLegal: item.amparoLegal,
      linkSistemaOrigem: item.linkSistemaOrigem,
      linkPncp: item.linkPncp,
      syncedAt: now,
    };

    await prisma.pncpContratacao.upsert({
      where: { numeroControlePNCP: numero },
      create: { numeroControlePNCP: numero, ...data },
      update: data,
    });
    count += 1;
  }

  return count;
}

async function fetchComboWithBackoff(params: {
  dataInicial: string;
  dataFinal: string;
  uf: string;
  codigo: number;
  pagina: number;
  tamanhoPagina: number;
}): Promise<{ result: Awaited<ReturnType<typeof fetchPncpPublicacaoPage>>; rateHits: number }> {
  let rateHits = 0;
  let delay = 1000;

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    try {
      const result = await fetchPncpPublicacaoPage({
        ...params,
        timeoutMs: 40_000,
      });
      return { result, rateHits };
    } catch (err) {
      if (!isRateLimitError(err) || attempt === MAX_429_RETRIES) throw err;
      rateHits += 1;
      await sleep(delay);
      delay = Math.min(delay * 2, 30_000);
    }
  }

  throw new Error('Limite de requisições do PNCP excedido.');
}

async function persistProgress(
  runId: string,
  data: {
    pagesFetched: number;
    upserted: number;
    rateLimitHits: number;
  }
): Promise<void> {
  await prisma.pncpSyncRun.update({
    where: { id: runId },
    data,
  });
}

/** Marca runs órfãos (ex.: backend reiniciou no meio) como failed. */
export async function recoverOrphanPncpSyncRuns(): Promise<number> {
  const result = await prisma.pncpSyncRun.updateMany({
    where: { status: 'running' },
    data: {
      status: 'failed',
      finishedAt: new Date(),
      errorMessage: 'Interrompido (servidor reiniciou ou sync abortado).',
    },
  });
  if (result.count > 0) {
    console.log(`[pncp-sync] ${result.count} run(s) órfão(s) marcados como failed`);
  }
  return result.count;
}

function resetLiveProgress(lookbackDays: number, ufs: string[], ufStateMap: Map<string, UfStateRow>): void {
  liveLookbackDays = lookbackDays;
  liveStartedAt = new Date().toISOString();
  livePagesFetched = 0;
  liveUpserted = 0;
  liveRateLimitHits = 0;
  currentUf = null;
  currentModalidade = null;
  liveUfProgress = ufs.map((uf) => {
    const state = ufStateMap.get(uf);
    return {
      uf,
      status: 'pending' as const,
      upsertedThisRun: 0,
      lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
      lastAttemptAt: state?.lastAttemptAt?.toISOString() ?? null,
      lastStatus: state?.lastStatus ?? null,
      lastErrorMessage: state?.lastErrorMessage ?? null,
    };
  });
}

function setUfStatus(uf: string, status: PncpUfProgress['status']): void {
  const row = liveUfProgress.find((u) => u.uf === uf);
  if (row) row.status = status;
}

function addUfUpserted(uf: string, n: number): void {
  const row = liveUfProgress.find((u) => u.uf === uf);
  if (row) row.upsertedThisRun += n;
}

function buildIdleUfProgress(
  ufStateMap: Map<string, UfStateRow>,
  mirrorSyncedAt: Map<string, Date>
): PncpUfProgress[] {
  return BRASIL_UFS.map((uf) => {
    const state = ufStateMap.get(uf);
    const mirrorAt = mirrorSyncedAt.get(uf);
    const lastSuccessAt = state?.lastSuccessAt ?? mirrorAt ?? null;
    const lastStatus =
      state?.lastStatus ??
      (mirrorAt ? 'success' : null);
    const idleStatus: PncpUfProgress['status'] =
      lastStatus === 'error' ? 'error' : lastStatus === 'success' ? 'done' : 'pending';
    return {
      uf,
      status: idleStatus,
      upsertedThisRun: 0,
      lastSuccessAt: lastSuccessAt?.toISOString() ?? null,
      lastAttemptAt: state?.lastAttemptAt?.toISOString() ?? lastSuccessAt?.toISOString() ?? null,
      lastStatus,
      lastErrorMessage: state?.lastErrorMessage ?? null,
    };
  });
}

function buildDisplayUfProgress(
  ufStateMap: Map<string, UfStateRow>,
  mirrorSyncedAt: Map<string, Date>,
  liveOverrides?: PncpUfProgress[]
): PncpUfProgress[] {
  const base = buildIdleUfProgress(ufStateMap, mirrorSyncedAt);
  if (!liveOverrides?.length) return base;

  const liveMap = new Map(liveOverrides.map((u) => [u.uf, u]));
  return base.map((row) => {
    const live = liveMap.get(row.uf);
    if (!live) return row;
    return {
      ...row,
      status: live.status,
      upsertedThisRun: live.upsertedThisRun,
      lastSuccessAt: live.lastSuccessAt ?? row.lastSuccessAt,
      lastAttemptAt: live.lastAttemptAt ?? row.lastAttemptAt,
      lastStatus: live.lastStatus ?? row.lastStatus,
      lastErrorMessage: live.lastErrorMessage ?? row.lastErrorMessage,
    };
  });
}

export async function getPncpSyncStatus(): Promise<PncpSyncStatus> {
  await ensureUfStatesBackfilled();

  const [last, ufStateMap, errorUfCount, mirrorSyncedAt] = await Promise.all([
    prisma.pncpSyncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    loadUfStates(),
    prisma.pncpSyncUfState.count({ where: { lastStatus: 'error' } }),
    loadMirrorLastSyncedByUf(),
  ]);

  const isRunning = running && (!last || last.id === currentRunId || last.status === 'running');

  const grouped = await prisma.pncpContratacao.groupBy({
    by: ['uf'],
    _count: { _all: true },
    orderBy: { uf: 'asc' },
  });
  const byUf = grouped.map((g) => ({ uf: g.uf, count: g._count._all }));
  const mirrorTotal = byUf.reduce((sum, r) => sum + r.count, 0);

  const ufs = buildDisplayUfProgress(
    ufStateMap,
    mirrorSyncedAt,
    isRunning ? liveUfProgress : undefined
  );

  const errorCountFromDisplay = ufs.filter((u) => u.lastStatus === 'error' || u.status === 'error').length;

  return {
    running: isRunning,
    currentUf: isRunning ? currentUf : null,
    currentModalidade: isRunning ? currentModalidade : null,
    syncOptions: isRunning ? liveSyncOptions : null,
    progress: {
      totalUfs: isRunning && liveUfProgress.length > 0 ? liveUfProgress.length : BRASIL_UFS.length,
      doneUfs: isRunning
        ? ufs.filter((u) => liveUfProgress.some((l) => l.uf === u.uf && (u.status === 'done' || u.status === 'error'))).length
        : ufs.filter((u) => u.lastStatus === 'success' || u.lastStatus === 'error').length,
      pendingUfs: isRunning
        ? liveUfProgress.filter((l) => {
            const row = ufs.find((u) => u.uf === l.uf);
            return row?.status === 'pending';
          }).length
        : ufs.filter((u) => u.status === 'pending' && u.lastStatus !== 'error').length,
      pagesFetched: isRunning ? livePagesFetched : last?.pagesFetched ?? 0,
      upserted: isRunning ? liveUpserted : last?.upserted ?? 0,
      rateLimitHits: isRunning ? liveRateLimitHits : last?.rateLimitHits ?? 0,
      lookbackDays: isRunning ? liveLookbackDays : last?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS,
      startedAt: isRunning ? liveStartedAt : last?.startedAt?.toISOString() ?? null,
      ufs,
    },
    mirror: {
      total: mirrorTotal,
      byUf,
    },
    errorUfCount: Math.max(errorUfCount, errorCountFromDisplay),
    lastRun: last
      ? {
          id: last.id,
          status: isRunning ? 'running' : last.status === 'running' ? 'failed' : last.status,
          trigger: last.trigger,
          startedAt: last.startedAt.toISOString(),
          finishedAt: last.finishedAt?.toISOString() ?? null,
          lookbackDays: last.lookbackDays,
          pagesFetched: last.pagesFetched,
          upserted: last.upserted,
          pruned: last.pruned,
          rateLimitHits: last.rateLimitHits,
          errorMessage: last.errorMessage,
        }
      : null,
  };
}

export class PncpSyncNothingToDoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PncpSyncNothingToDoError';
  }
}

type SyncRunCounters = {
  pagesFetched: number;
  upserted: number;
  rateLimitHits: number;
};

type SyncOneUfResult = {
  cancelled: boolean;
  hadError: boolean;
  errorMessage: string | null;
};

/** Sincroniza uma UF (todas as modalidades) e atualiza progresso/estado persistido. */
async function syncOneUf(params: {
  uf: string;
  runId: string;
  ufState: UfStateRow | undefined;
  lookbackDays: number;
  incremental: boolean;
  pageDelayMs: number;
  counters: SyncRunCounters;
  keywordsNormalized: string[];
}): Promise<SyncOneUfResult> {
  const {
    uf,
    runId,
    ufState,
    lookbackDays,
    incremental,
    pageDelayMs,
    counters,
    keywordsNormalized,
  } = params;

  if (isSyncCancelRequested()) {
    return { cancelled: true, hadError: false, errorMessage: null };
  }

  currentUf = uf;
  setUfStatus(uf, 'running');

  const window = getDateWindowForUf(ufState, lookbackDays, incremental);
  console.log(
    `[pncp-sync] UF ${uf} (${window.mode} ${window.dataInicial}→${window.dataFinal})… upserted=${counters.upserted}, pages=${counters.pagesFetched}`
  );

  let ufHadError = false;
  let ufErrorMessage: string | null = null;

  modalidadeLoop: for (const modalidade of PNCP_MODALIDADES) {
    if (isSyncCancelRequested()) {
      setUfStatus(uf, 'pending');
      return { cancelled: true, hadError: false, errorMessage: null };
    }

    currentModalidade = modalidade.nome;
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && page <= MAX_PAGES_PER_COMBO) {
      if (isSyncCancelRequested()) {
        setUfStatus(uf, 'pending');
        return { cancelled: true, hadError: false, errorMessage: null };
      }

      try {
        const { result, rateHits } = await fetchComboWithBackoff({
          dataInicial: window.dataInicial,
          dataFinal: window.dataFinal,
          uf,
          codigo: modalidade.codigo,
          pagina: page,
          tamanhoPagina: 50,
        });
        counters.rateLimitHits += rateHits;
        liveRateLimitHits = counters.rateLimitHits;
        counters.pagesFetched += 1;
        livePagesFetched = counters.pagesFetched;
        totalPages = Math.max(1, result.totalPaginas || 1);
        const added = await upsertItems(
          result.items,
          modalidade.codigo,
          uf,
          keywordsNormalized
        );
        counters.upserted += added;
        liveUpserted = counters.upserted;
        addUfUpserted(uf, added);

        // Incremental: sem registros na 1ª página → pula restante desta modalidade.
        if (
          incremental &&
          page === 1 &&
          (result.items?.length ?? 0) === 0 &&
          (result.totalRegistros ?? 0) === 0
        ) {
          break;
        }

        if (counters.pagesFetched % PROGRESS_EVERY_PAGES === 0) {
          await persistProgress(runId, {
            pagesFetched: counters.pagesFetched,
            upserted: counters.upserted,
            rateLimitHits: counters.rateLimitHits,
          });
        }
      } catch (err) {
        ufHadError = true;
        ufErrorMessage = err instanceof Error ? err.message : String(err);
        if (isRateLimitError(err)) {
          counters.rateLimitHits += 1;
          liveRateLimitHits = counters.rateLimitHits;
          break;
        }
        console.warn(`[pncp-sync] falha ${uf}/${modalidade.codigo} p${page}:`, ufErrorMessage);
        break;
      }

      page += 1;
      if (page <= totalPages && page <= MAX_PAGES_PER_COMBO) {
        await sleep(pageDelayMs);
      }
    }

    if (ufHadError) break modalidadeLoop;
    await sleep(Math.min(pageDelayMs, 400));
  }

  if (isSyncCancelRequested()) {
    setUfStatus(uf, 'pending');
    return { cancelled: true, hadError: false, errorMessage: null };
  }

  const ufStatus = ufHadError ? 'error' : 'success';
  setUfStatus(uf, ufHadError ? 'error' : 'done');
  await persistUfState(uf, ufStatus, runId, window.dataFinal, ufErrorMessage);

  const row = liveUfProgress.find((u) => u.uf === uf);
  if (row && ufStatus === 'success') {
    const nowIso = new Date().toISOString();
    row.lastSuccessAt = nowIso;
    row.lastAttemptAt = nowIso;
    row.lastStatus = 'success';
    row.lastErrorMessage = null;
  } else if (row) {
    row.lastAttemptAt = new Date().toISOString();
    row.lastStatus = 'error';
    row.lastErrorMessage = ufErrorMessage;
  }

  return { cancelled: false, hadError: ufHadError, errorMessage: ufErrorMessage };
}

/**
 * Ingestão por UF × modalidades. Suporta seleção de UFs, retry de erros e sync incremental.
 * Não roda em paralelo — lock em memória.
 */
export async function runPncpIngest(
  trigger: PncpSyncTrigger = 'manual',
  rawOptions?: PncpSyncOptions
): Promise<PncpSyncStatus> {
  if (running) {
    return getPncpSyncStatus();
  }

  const options = resolveSyncOptions(rawOptions);
  const ufsToSync = await resolveUfsToSync(options);
  const ufStateMap = await loadUfStates();

  if (ufsToSync.length === 0) {
    throw new PncpSyncNothingToDoError(
      options.retryErrorsOnly
        ? 'Nenhuma UF com erro para repetir.'
        : options.staleOnly && options.incremental && !options.fullResync
          ? 'Todas as UFs estão atualizadas. Nada novo para buscar.'
          : 'Nenhuma UF selecionada para sincronizar.'
    );
  }

  running = true;
  cancelRequested = false;
  const lookbackDays = envInt('PNCP_SYNC_LOOKBACK_DAYS', DEFAULT_LOOKBACK_DAYS);
  const pageDelayMs = envInt('PNCP_SYNC_PAGE_DELAY_MS', DEFAULT_PAGE_DELAY_MS);
  const keywordsNormalized = await loadPncpKeywordsNormalized();
  liveSyncOptions = {
    ufs: ufsToSync,
    retryErrorsOnly: options.retryErrorsOnly,
    incremental: options.incremental,
    staleOnly: options.staleOnly,
    fullResync: options.fullResync,
  };
  resetLiveProgress(lookbackDays, ufsToSync, ufStateMap);

  await recoverOrphanPncpSyncRuns();

  const run = await prisma.pncpSyncRun.create({
    data: {
      status: 'running',
      trigger,
      lookbackDays,
    },
  });
  currentRunId = run.id;

  let pruned = 0;
  let hadPartialFailure = false;
  let wasCancelled = false;
  const counters: SyncRunCounters = {
    pagesFetched: 0,
    upserted: 0,
    rateLimitHits: 0,
  };

  try {
    for (const uf of ufsToSync) {
      if (isSyncCancelRequested()) {
        wasCancelled = true;
        break;
      }

      const result = await syncOneUf({
        uf,
        runId: run.id,
        ufState: ufStateMap.get(uf),
        lookbackDays,
        incremental: options.incremental,
        pageDelayMs,
        counters,
        keywordsNormalized,
      });
      if (result.cancelled) {
        wasCancelled = true;
        break;
      }
      if (result.hadError) hadPartialFailure = true;
    }

    currentModalidade = null;

    // Auto-retry: UFs com erro (ex.: PNCP indisponível) são repetidas sozinhas.
    if (!wasCancelled && hadPartialFailure) {
      const autoRetryRounds = envInt('PNCP_SYNC_AUTO_RETRY_ROUNDS', 2);
      const autoRetryDelayMs = envInt('PNCP_SYNC_AUTO_RETRY_DELAY_MS', 15_000);

      for (let round = 1; round <= autoRetryRounds; round++) {
        const failedUfs = liveUfProgress
          .filter((u) => u.status === 'error')
          .map((u) => u.uf);
        if (failedUfs.length === 0) break;

        console.log(
          `[pncp-sync] auto-retry ${round}/${autoRetryRounds} em ${Math.round(autoRetryDelayMs / 1000)}s: ${failedUfs.join(', ')}`
        );
        for (const uf of failedUfs) {
          setUfStatus(uf, 'pending');
        }
        currentUf = null;
        currentModalidade = null;
        await sleep(autoRetryDelayMs);

        if (isSyncCancelRequested()) {
          wasCancelled = true;
          break;
        }

        for (const uf of failedUfs) {
          if (isSyncCancelRequested()) {
            wasCancelled = true;
            break;
          }
          const result = await syncOneUf({
            uf,
            runId: run.id,
            ufState: ufStateMap.get(uf),
            lookbackDays,
            incremental: options.incremental,
            pageDelayMs,
            counters,
            keywordsNormalized,
          });
          if (result.cancelled) {
            wasCancelled = true;
            break;
          }
        }

        if (wasCancelled) break;
      }

      hadPartialFailure = liveUfProgress.some((u) => u.status === 'error');
      currentModalidade = null;
    }

    const { pagesFetched, upserted, rateLimitHits } = counters;

    if (wasCancelled) {
      await prisma.pncpSyncRun.update({
        where: { id: run.id },
        data: {
          status: 'partial',
          finishedAt: new Date(),
          pagesFetched,
          upserted,
          pruned,
          rateLimitHits,
          errorMessage: 'Sincronização cancelada pelo usuário.',
        },
      });
      console.log(`[pncp-sync] cancelada upserted=${upserted} pages=${pagesFetched}`);
    } else {
    if (options.fullResync) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - lookbackDays);
      const deletedOld = await prisma.pncpContratacao.deleteMany({
        where: {
          OR: [
            { dataInclusao: { lt: cutoff } },
            {
              AND: [{ dataInclusao: null }, { syncedAt: { lt: cutoff } }],
            },
          ],
        },
      });
      pruned = deletedOld.count;

      const stale = await prisma.pncpContratacao.findMany({
        select: { id: true, objeto: true },
      });
      const staleIds = stale
        .filter((row) => !objetoMatchesPncpKeywords(row.objeto, keywordsNormalized))
        .map((row) => row.id);
      if (staleIds.length > 0) {
        const deletedKw = await prisma.pncpContratacao.deleteMany({
          where: { id: { in: staleIds } },
        });
        pruned += deletedKw.count;
      }

      if (pruned > 0) {
        console.log(`[pncp-sync] prune (full): ${pruned} registro(s) removidos`);
      }
    }

    const status = hadPartialFailure ? 'partial' : 'success';
    await prisma.pncpSyncRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt: new Date(),
        pagesFetched,
        upserted,
        pruned,
        rateLimitHits,
        errorMessage: hadPartialFailure
          ? 'Sync concluído com falhas parciais (rate-limit ou erros pontuais).'
          : null,
      },
    });
    console.log(`[pncp-sync] fim status=${status} upserted=${upserted} pages=${pagesFetched} ufs=${ufsToSync.length}`);
    }
  } catch (err) {
    const { pagesFetched, upserted, rateLimitHits } = counters;
    const fatalError = err instanceof Error ? err.message : 'Erro desconhecido no sync PNCP';
    await prisma.pncpSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        pagesFetched,
        upserted,
        pruned,
        rateLimitHits,
        errorMessage: fatalError,
      },
    });
    console.error('[pncp-sync] failed:', fatalError);
  } finally {
    running = false;
    cancelRequested = false;
    currentRunId = null;
    currentUf = null;
    currentModalidade = null;
    liveSyncOptions = null;
    liveUfProgress = [];
  }

  return getPncpSyncStatus();
}

/** Dispara sync em background; retorna status imediato. */
export function startPncpIngestBackground(
  trigger: PncpSyncTrigger,
  options?: PncpSyncOptions
): {
  accepted: boolean;
  alreadyRunning: boolean;
  nothingToDo?: boolean;
  message?: string;
} {
  if (running) {
    return { accepted: false, alreadyRunning: true };
  }

  void runPncpIngest(trigger, options).catch((err) => {
    if (err instanceof PncpSyncNothingToDoError) {
      console.log(`[pncp-sync] ${err.message}`);
      return;
    }
    console.error('[pncp-sync] erro não tratado:', err);
  });

  return { accepted: true, alreadyRunning: false };
}

export async function startPncpIngestBackgroundSafe(
  trigger: PncpSyncTrigger,
  options?: PncpSyncOptions
): Promise<{
  accepted: boolean;
  alreadyRunning: boolean;
  nothingToDo: boolean;
  message?: string;
}> {
  if (running) {
    return { accepted: false, alreadyRunning: true, nothingToDo: false };
  }

  const resolved = resolveSyncOptions(options);
  const ufsToSync = await resolveUfsToSync(resolved);
  if (ufsToSync.length === 0) {
    const message = resolved.retryErrorsOnly
      ? 'Nenhuma UF com erro para repetir.'
      : resolved.staleOnly && resolved.incremental && !resolved.fullResync
        ? 'Todas as UFs estão atualizadas. Nada novo para buscar.'
        : 'Nenhuma UF selecionada para sincronizar.';
    return { accepted: false, alreadyRunning: false, nothingToDo: true, message };
  }

  startPncpIngestBackground(trigger, options);
  return { accepted: true, alreadyRunning: false, nothingToDo: false };
}

export function startPncpSyncScheduler(): void {
  if (cronStarted) return;
  if (!envBool('PNCP_SYNC_ENABLED', true)) {
    console.log('[pncp-sync] desabilitado (PNCP_SYNC_ENABLED=false)');
    return;
  }

  cronStarted = true;
  const intervalMs = envInt('PNCP_SYNC_INTERVAL_MS', DEFAULT_INTERVAL_MS);
  const bootDelayMs = envInt('PNCP_SYNC_BOOT_DELAY_MS', 30_000);

  console.log(
    `[pncp-sync] agendado: primeira em ${Math.round(bootDelayMs / 1000)}s, depois a cada ${Math.round(intervalMs / 60000)} min (incremental)`
  );

  void recoverOrphanPncpSyncRuns().catch((e) => {
    console.error('[pncp-sync] falha ao limpar órfãos:', e);
  });

  void ensureUfStatesBackfilled().catch((e) => {
    console.error('[pncp-sync] falha no backfill inicial:', e);
  });

  setTimeout(() => {
    const r = startPncpIngestBackground('cron', { incremental: true, staleOnly: true });
    if (r.alreadyRunning) {
      console.log('[pncp-sync] já em andamento no boot');
    }
  }, bootDelayMs);

  cronTimer = setInterval(() => {
    startPncpIngestBackground('cron', { incremental: true, staleOnly: true });
  }, intervalMs);

  if (typeof cronTimer.unref === 'function') {
    cronTimer.unref();
  }
}

export function getPncpIngestDebug(): {
  running: boolean;
  currentRunId: string | null;
  currentUf: string | null;
  currentModalidade: string | null;
} {
  return { running, currentRunId, currentUf, currentModalidade };
}
