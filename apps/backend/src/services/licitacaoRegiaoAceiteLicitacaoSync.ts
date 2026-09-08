import { findLicitacaoRegiaoTab } from './LicitacoesPlanilhaSheetsService';
import {
  licitacaoStoreCreate,
  licitacaoStoreDelete,
  licitacaoStoreGetById,
  licitacaoStoreUpdate,
} from './licitacaoStore';
import {
  LicitacaoRegiaoAceiteRow,
  listAceitesPendingLicitacaoSync,
  listAceitesWithLicitacaoId,
  setAceiteLicitacaoId,
} from './licitacaoRegiaoAceiteStore';
import { extractEstadoFromAnaliseJson, extractEstadoFromRowSnapshot } from '../lib/licitacaoEstado';
import { extractRegiaoKeyFromAnaliseJson } from '../lib/licitacaoRegiao';

function normalizeHeaderKey(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function pickSnapshotValue(
  snapshot: Record<string, string> | null | undefined,
  keys: string[]
): string | null {
  if (!snapshot) return null;
  const byKey = new Map<string, string>();
  for (const [header, value] of Object.entries(snapshot)) {
    const normalized = normalizeHeaderKey(header);
    const trimmed = value?.trim();
    if (trimmed) byKey.set(normalized, trimmed);
  }
  for (const key of keys) {
    const value = byKey.get(normalizeHeaderKey(key));
    if (value) return value;
  }
  return null;
}

function pickSnapshotByPartialKey(
  snapshot: Record<string, string> | null | undefined,
  fragments: string[]
): string | null {
  if (!snapshot) return null;
  for (const [header, value] of Object.entries(snapshot)) {
    const normalized = normalizeHeaderKey(header);
    const trimmed = value?.trim();
    if (!trimmed) continue;
    if (fragments.some((fragment) => normalized.includes(normalizeHeaderKey(fragment)))) {
      return trimmed;
    }
  }
  return null;
}

function buildTitulo(snapshot: Record<string, string> | null | undefined, regiaoKey: string): string {
  const orgao = pickSnapshotValue(snapshot, ['ÓRGÃO', 'ORGAO']);
  const objeto = pickSnapshotValue(snapshot, ['OBJETO']);
  const tab = findLicitacaoRegiaoTab(regiaoKey);

  if (orgao) return orgao;
  if (objeto) return objeto.length > 120 ? `${objeto.slice(0, 117)}…` : objeto;
  const item = pickSnapshotValue(snapshot, ['ITEM']);
  if (item) return `Licitação ${tab?.label ?? regiaoKey} — Item ${item}`;
  return `Licitação ${tab?.label ?? regiaoKey}`;
}

function buildOrigemRegiao(aceite: LicitacaoRegiaoAceiteRow) {
  const tab = findLicitacaoRegiaoTab(aceite.regiaoKey);
  const estado = extractEstadoFromRowSnapshot(aceite.rowSnapshot) || null;
  return {
    regiaoKey: aceite.regiaoKey,
    regiaoLabel: tab?.label ?? aceite.regiaoKey,
    spreadsheetId: aceite.spreadsheetId,
    rowKey: aceite.rowKey,
    aceiteId: aceite.id,
    aceiteEm: aceite.acceptedAt.toISOString(),
    aceitePor: aceite.acceptedBy,
    aceitePorNome: aceite.acceptedByName,
    estado,
    rowSnapshot: aceite.rowSnapshot ?? null,
  };
}

function buildAnaliseJson(aceite: LicitacaoRegiaoAceiteRow): Record<string, unknown> {
  return {
    origemRegiao: buildOrigemRegiao(aceite),
    responsavelAnalise: aceite.acceptedByName,
    historicoExtracoes: [],
    conversas: [],
  };
}

function mergeOrigemRegiaoIntoAnaliseJson(
  currentAnaliseJson: unknown,
  aceite: LicitacaoRegiaoAceiteRow
): Record<string, unknown> | null {
  const base =
    currentAnaliseJson && typeof currentAnaliseJson === 'object' && !Array.isArray(currentAnaliseJson)
      ? { ...(currentAnaliseJson as Record<string, unknown>) }
      : {};

  const origemAtual = base.origemRegiao as Record<string, unknown> | undefined;
  const estadoAtual = extractEstadoFromAnaliseJson(base);
  const origemNova = buildOrigemRegiao(aceite);
  const estadoNovo = origemNova.estado ?? extractEstadoFromRowSnapshot(aceite.rowSnapshot);

  const precisaOrigem =
    !origemAtual ||
    !estadoAtual ||
    (estadoNovo && estadoAtual !== estadoNovo) ||
    !origemAtual.rowSnapshot;

  if (!precisaOrigem) return null;

  return {
    ...base,
    origemRegiao: {
      ...origemAtual,
      ...origemNova,
      estado: estadoNovo || origemNova.estado,
      rowSnapshot: origemNova.rowSnapshot ?? origemAtual?.rowSnapshot ?? null,
    },
    responsavelAnalise:
      typeof base.responsavelAnalise === 'string' && base.responsavelAnalise.trim()
        ? base.responsavelAnalise
        : aceite.acceptedByName,
  };
}

async function repairLicitacaoOrigemFromAceite(
  aceite: LicitacaoRegiaoAceiteRow
): Promise<boolean> {
  if (!aceite.licitacaoId) return false;

  const licitacao = await licitacaoStoreGetById(aceite.licitacaoId);
  if (!licitacao) return false;

  const estado = extractEstadoFromRowSnapshot(aceite.rowSnapshot) || null;
  const merged = mergeOrigemRegiaoIntoAnaliseJson(licitacao.analiseJson, aceite);
  const precisaEstado = Boolean(estado && licitacao.estado !== estado);
  const regiaoKey = aceite.regiaoKey?.trim().toLowerCase() || null;
  const precisaRegiao = Boolean(regiaoKey && licitacao.regiaoKey !== regiaoKey);

  if (!merged && !precisaEstado && !precisaRegiao) return false;

  await licitacaoStoreUpdate(aceite.licitacaoId, {
    ...(merged ? { analiseJson: merged } : {}),
    ...(estado ? { estado } : {}),
    ...(regiaoKey ? { regiaoKey } : {}),
  });
  return true;
}

export async function repairAllLinkedAceitesOrigemRegiao(): Promise<number> {
  const linked = await listAceitesWithLicitacaoId();
  let repaired = 0;
  for (const aceite of linked) {
    if (await repairLicitacaoOrigemFromAceite(aceite)) repaired += 1;
  }
  return repaired;
}

export async function ensureLicitacaoForAceite(
  aceite: LicitacaoRegiaoAceiteRow
): Promise<string | null> {
  if (aceite.licitacaoId) {
    const existing = await licitacaoStoreGetById(aceite.licitacaoId);
    if (existing) {
      await repairLicitacaoOrigemFromAceite(aceite);
      return aceite.licitacaoId;
    }
  }

  const snapshot = aceite.rowSnapshot;
  const titulo = buildTitulo(snapshot, aceite.regiaoKey);
  const orgao = pickSnapshotValue(snapshot, ['ÓRGÃO', 'ORGAO']);
  const objeto = pickSnapshotValue(snapshot, ['OBJETO']);
  const valorEstimado = pickSnapshotValue(snapshot, ['VALOR ESTIMADO', 'VALOR']);
  const modalidade =
    pickSnapshotByPartialKey(snapshot, ['modalidade', 'concorrencia', 'pregao']) ??
    pickSnapshotValue(snapshot, ['MODALIDADE']);
  const numeroProcesso =
    pickSnapshotByPartialKey(snapshot, ['processo', 'pregao', 'edital']) ??
    pickSnapshotValue(snapshot, ['Nº', 'NUMERO', 'NÚMERO']);

  const estado = extractEstadoFromRowSnapshot(snapshot) || undefined;

  const licitacao = await licitacaoStoreCreate(aceite.acceptedBy, {
    titulo,
    numeroProcesso: numeroProcesso ?? undefined,
    orgao: orgao ?? undefined,
    modalidade: modalidade ?? undefined,
    objeto: objeto ?? undefined,
    valorEstimado: valorEstimado ?? undefined,
    estado,
    regiaoKey: aceite.regiaoKey?.trim().toLowerCase() || undefined,
    status: 'EM_ANALISE',
    analiseJson: buildAnaliseJson(aceite),
  });

  await setAceiteLicitacaoId(aceite.id, licitacao.id);
  return licitacao.id;
}

export async function syncAceitesToLicitacoes(
  aceites: LicitacaoRegiaoAceiteRow[]
): Promise<string[]> {
  const licitacaoIds: string[] = [];
  for (const aceite of aceites) {
    const licitacaoId = await ensureLicitacaoForAceite(aceite);
    if (licitacaoId) licitacaoIds.push(licitacaoId);
  }
  return licitacaoIds;
}

export async function backfillLicitacaoEstadoColumn(): Promise<number> {
  const { getPrisma } = await import('../lib/prisma');
  const rows = await getPrisma().$queryRaw<
    Array<{ id: string; estado: string | null; analiseJson: unknown }>
  >`SELECT id, estado, "analiseJson" FROM licitacoes`;

  let updated = 0;
  for (const row of rows) {
    if (row.estado?.trim()) continue;
    const estado = extractEstadoFromAnaliseJson(row.analiseJson);
    if (!estado) continue;
    await licitacaoStoreUpdate(row.id, { estado });
    updated += 1;
  }
  return updated;
}

export async function backfillLicitacaoRegiaoKeyColumn(): Promise<number> {
  const { getPrisma } = await import('../lib/prisma');
  await getPrisma().$executeRawUnsafe(`
    UPDATE licitacoes l
    SET "regiaoKey" = a."regiaoKey"
    FROM licitacao_regiao_aceites a
    WHERE a."licitacaoId" = l.id
      AND a."regiaoKey" IS NOT NULL
      AND (l."regiaoKey" IS NULL OR l."regiaoKey" = '')
  `);

  const rows = await getPrisma().$queryRaw<
    Array<{ id: string; regiaoKey: string | null; analiseJson: unknown }>
  >`SELECT id, "regiaoKey", "analiseJson" FROM licitacoes WHERE "regiaoKey" IS NULL OR "regiaoKey" = ''`;

  let updated = 0;
  for (const row of rows) {
    const key = extractRegiaoKeyFromAnaliseJson(row.analiseJson);
    if (!key) continue;
    await licitacaoStoreUpdate(row.id, { regiaoKey: key });
    updated += 1;
  }
  return updated;
}

/**
 * Remove processos de análise que não têm aceite vinculado
 * (órfãos após exclusão parcial, criação manual, etc.).
 */
export async function purgeLicitacoesWithoutAceite(): Promise<number> {
  const { getPrisma } = await import('../lib/prisma');
  const deleted = await getPrisma().$queryRaw<{ id: string }[]>`
    DELETE FROM licitacoes l
    WHERE NOT EXISTS (
      SELECT 1 FROM licitacao_regiao_aceites a
      WHERE a."licitacaoId" = l.id
    )
    RETURNING l.id
  `;
  return deleted.length;
}

export async function syncAllPendingAceitesToLicitacoes(): Promise<number> {
  await repairAllLinkedAceitesOrigemRegiao();
  await backfillLicitacaoEstadoColumn();
  await backfillLicitacaoRegiaoKeyColumn();

  // Só recria processos a partir de aceites sem vínculo. Depois remove fantasma
  // (processos sem aceite — criação manual, sync incompleto, etc.).
  const pending = await listAceitesPendingLicitacaoSync();
  if (pending.length > 0) {
    await syncAceitesToLicitacoes(pending);
  }
  await purgeLicitacoesWithoutAceite();
  return pending.length;
}

export async function removeLicitacoesLinkedToAceites(licitacaoIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(licitacaoIds.map((id) => id.trim()).filter(Boolean))];
  for (const licitacaoId of uniqueIds) {
    try {
      await licitacaoStoreDelete(licitacaoId);
    } catch (error) {
      console.warn(`Licitações: falha ao excluir processo vinculado ${licitacaoId}`, error);
    }
  }
}
