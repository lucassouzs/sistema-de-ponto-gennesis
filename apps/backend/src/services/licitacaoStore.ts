import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { getPrisma } from '../lib/prisma';

export const LICITACAO_ARQUIVADA_MOTIVOS = [
  'suspensa',
  'declinada',
  'encerrada',
  'em_andamento',
  'vencidas',
  'aguardando_aprovacao',
  'orcamento',
] as const;
export type LicitacaoArquivadaMotivo = (typeof LICITACAO_ARQUIVADA_MOTIVOS)[number];

export function isLicitacaoArquivadaMotivo(value: unknown): value is LicitacaoArquivadaMotivo {
  return (
    typeof value === 'string' &&
    (LICITACAO_ARQUIVADA_MOTIVOS as readonly string[]).includes(value)
  );
}

export type LicitacaoRow = {
  id: string;
  titulo: string;
  numeroProcesso: string | null;
  orgao: string | null;
  modalidade: string | null;
  status: string;
  objeto: string | null;
  valorEstimado: string | null;
  estado: string | null;
  regiaoKey: string | null;
  vigenciaContrato: string | null;
  analiseJson: unknown;
  arquivada: boolean;
  arquivadaEm: Date | null;
  arquivadaMotivo: LicitacaoArquivadaMotivo | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type LicitacaoDocumentoRow = {
  id: string;
  licitacaoId: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  createdAt: Date;
};

type LicitacaoDbRow = {
  id: string;
  titulo: string;
  numeroProcesso: string | null;
  orgao: string | null;
  modalidade: string | null;
  status: string;
  objeto: string | null;
  valorEstimado: string | null;
  estado: string | null;
  regiaoKey: string | null;
  vigenciaContrato: string | null;
  analiseJson: unknown;
  arquivada: boolean | null;
  arquivadaEm: Date | null;
  arquivadaMotivo: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  creator_id: string | null;
  creator_name: string | null;
};

function mapRow(row: LicitacaoDbRow) {
  return {
    id: row.id,
    titulo: row.titulo,
    numeroProcesso: row.numeroProcesso,
    orgao: row.orgao,
    modalidade: row.modalidade,
    status: row.status,
    objeto: row.objeto,
    valorEstimado: row.valorEstimado,
    estado: row.estado,
    regiaoKey: row.regiaoKey,
    vigenciaContrato: row.vigenciaContrato,
    analiseJson: row.analiseJson,
    arquivada: row.arquivada === true,
    arquivadaEm: row.arquivadaEm ?? null,
    arquivadaMotivo: isLicitacaoArquivadaMotivo(row.arquivadaMotivo)
      ? row.arquivadaMotivo
      : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    creator:
      row.creator_id && row.creator_name
        ? { id: row.creator_id, name: row.creator_name }
        : null,
  };
}

async function fetchDocumentos(licitacaoIds: string[]): Promise<Map<string, LicitacaoDocumentoRow[]>> {
  const map = new Map<string, LicitacaoDocumentoRow[]>();
  if (licitacaoIds.length === 0) return map;

  const docs = await getPrisma().$queryRaw<LicitacaoDocumentoRow[]>`
    SELECT id, "licitacaoId", "originalName", "storagePath", "mimeType", size, "createdAt"
    FROM licitacao_documentos
    WHERE "licitacaoId" IN (${Prisma.join(licitacaoIds)})
    ORDER BY "createdAt" ASC
  `;

  for (const doc of docs) {
    const list = map.get(doc.licitacaoId) ?? [];
    list.push(doc);
    map.set(doc.licitacaoId, list);
  }
  return map;
}

export type LicitacaoListFilters = {
  search?: string;
  dataInicio?: string;
  dataFim?: string;
  regiaoKey?: string;
  estado?: string;
  /** undefined = ativas (não arquivadas); true = só arquivadas; 'all' = todas */
  arquivada?: boolean | 'all';
  arquivadaMotivo?: LicitacaoArquivadaMotivo;
};

function parseDateOnly(value?: string): Date | null {
  const v = value?.trim();
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDateExclusive(value: string): Date | null {
  const start = parseDateOnly(value);
  if (!start) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

export async function licitacaoStoreList(filters: LicitacaoListFilters = {}) {
  const term = filters.search?.trim();
  const inicio = parseDateOnly(filters.dataInicio);
  const fimExclusive = filters.dataFim ? endOfDateExclusive(filters.dataFim) : null;

  const conditions: Prisma.Sql[] = [];
  if (term) {
    conditions.push(
      Prisma.sql`(
        l.titulo ILIKE ${'%' + term + '%'}
        OR COALESCE(l."numeroProcesso", '') ILIKE ${'%' + term + '%'}
        OR COALESCE(l.orgao, '') ILIKE ${'%' + term + '%'}
        OR COALESCE(l.objeto, '') ILIKE ${'%' + term + '%'}
      )`
    );
  }
  if (inicio) {
    conditions.push(Prisma.sql`l."createdAt" >= ${inicio}`);
  }
  if (fimExclusive) {
    conditions.push(Prisma.sql`l."createdAt" < ${fimExclusive}`);
  }
  const regiaoKey = filters.regiaoKey?.trim().toLowerCase();
  if (regiaoKey) {
    conditions.push(Prisma.sql`l."regiaoKey" = ${regiaoKey}`);
  }
  const estado = filters.estado?.trim().toUpperCase();
  if (estado && /^[A-Z]{2}$/.test(estado)) {
    conditions.push(Prisma.sql`l.estado = ${estado}`);
  }

  // Análise manual: apenas processos originados de aceite na planilha por região.
  conditions.push(
    Prisma.sql`EXISTS (
      SELECT 1 FROM licitacao_regiao_aceites a
      WHERE a."licitacaoId" = l.id
    )`
  );

  if (filters.arquivada === true) {
    conditions.push(Prisma.sql`COALESCE(l.arquivada, FALSE) = TRUE`);
    // Sem motivo específico: Análise final — Orçamento tem aba própria.
    if (!filters.arquivadaMotivo) {
      conditions.push(Prisma.sql`(l."arquivadaMotivo" IS DISTINCT FROM 'orcamento')`);
    }
  } else if (filters.arquivada !== 'all') {
    conditions.push(Prisma.sql`COALESCE(l.arquivada, FALSE) = FALSE`);
  }
  if (filters.arquivadaMotivo) {
    conditions.push(Prisma.sql`l."arquivadaMotivo" = ${filters.arquivadaMotivo}`);
  }

  const whereSql = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
  const orderSql =
    filters.arquivada === true
      ? Prisma.sql`ORDER BY COALESCE(l."arquivadaEm", l."updatedAt") DESC`
      : Prisma.sql`ORDER BY l."updatedAt" DESC`;

  const rows = await getPrisma().$queryRaw<LicitacaoDbRow[]>(
    Prisma.sql`
        SELECT
          l.id, l.titulo, l."numeroProcesso", l.orgao, l.modalidade, l.status,
          l.objeto, l."valorEstimado", l.estado, l."regiaoKey", l."vigenciaContrato", l."analiseJson",
          COALESCE(l.arquivada, FALSE) AS arquivada, l."arquivadaEm", l."arquivadaMotivo",
          l."createdBy", l."createdAt", l."updatedAt",
          u.id AS creator_id, u.name AS creator_name
        FROM licitacoes l
        LEFT JOIN users u ON u.id = l."createdBy"
        ${whereSql}
        ${orderSql}
      `
  );

  const docMap = await fetchDocumentos(rows.map((r) => r.id));
  return rows.map((row) => ({
    ...mapRow(row),
    documentos: docMap.get(row.id) ?? [],
  }));
}

export async function licitacaoStoreGetById(id: string) {
  const rows = await getPrisma().$queryRaw<LicitacaoDbRow[]>`
    SELECT
      l.id, l.titulo, l."numeroProcesso", l.orgao, l.modalidade, l.status,
      l.objeto, l."valorEstimado", l.estado, l."regiaoKey", l."vigenciaContrato", l."analiseJson",
      COALESCE(l.arquivada, FALSE) AS arquivada, l."arquivadaEm", l."arquivadaMotivo",
      l."createdBy", l."createdAt", l."updatedAt",
      u.id AS creator_id, u.name AS creator_name
    FROM licitacoes l
    LEFT JOIN users u ON u.id = l."createdBy"
    WHERE l.id = ${id}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;

  const documentos = await getPrisma().$queryRaw<LicitacaoDocumentoRow[]>`
    SELECT id, "licitacaoId", "originalName", "storagePath", "mimeType", size, "createdAt"
    FROM licitacao_documentos
    WHERE "licitacaoId" = ${id}
    ORDER BY "createdAt" ASC
  `;

  return { ...mapRow(row), documentos };
}

export async function licitacaoStoreCreate(
  userId: string,
  data: {
    titulo: string;
    numeroProcesso?: string;
    orgao?: string;
    modalidade?: string;
    objeto?: string;
    valorEstimado?: string;
    estado?: string;
    regiaoKey?: string;
    status?: string;
    analiseJson?: Record<string, unknown>;
  }
) {
  const id = uuidv4();
  const now = new Date();
  const analiseJson = data.analiseJson ? JSON.stringify(data.analiseJson) : null;
  await getPrisma().$executeRaw`
    INSERT INTO licitacoes (
      id, titulo, "numeroProcesso", orgao, modalidade, status,
      objeto, "valorEstimado", estado, "regiaoKey", "analiseJson",
      "createdBy", "createdAt", "updatedAt"
    ) VALUES (
      ${id},
      ${data.titulo},
      ${data.numeroProcesso?.trim() || null},
      ${data.orgao?.trim() || null},
      ${data.modalidade?.trim() || null},
      ${data.status?.trim() || 'RASCUNHO'},
      ${data.objeto?.trim() || null},
      ${data.valorEstimado?.trim() || null},
      ${data.estado?.trim().toUpperCase() || null},
      ${data.regiaoKey?.trim().toLowerCase() || null},
      ${analiseJson}::jsonb,
      ${userId},
      ${now},
      ${now}
    )
  `;
  const created = await licitacaoStoreGetById(id);
  if (!created) throw new Error('Falha ao criar licitação');
  return created;
}

export async function licitacaoStoreUpdate(
  id: string,
  data: Partial<{
    titulo: string;
    numeroProcesso: string | null;
    orgao: string | null;
    modalidade: string | null;
    status: string;
    objeto: string | null;
    valorEstimado: string | null;
    estado: string | null;
    regiaoKey: string | null;
    vigenciaContrato: string | null;
    analiseJson: Record<string, unknown> | unknown;
    arquivada: boolean;
    arquivadaEm: Date | null;
    arquivadaMotivo: LicitacaoArquivadaMotivo | null;
  }>
) {
  const current = await licitacaoStoreGetById(id);
  if (!current) throw new Error('Licitação não encontrada');

  const titulo = data.titulo !== undefined ? data.titulo.trim() : current.titulo;
  const numeroProcesso =
    data.numeroProcesso !== undefined ? data.numeroProcesso : current.numeroProcesso;
  const orgao = data.orgao !== undefined ? data.orgao : current.orgao;
  const modalidade = data.modalidade !== undefined ? data.modalidade : current.modalidade;
  const status = data.status !== undefined ? data.status : current.status;
  const objeto = data.objeto !== undefined ? data.objeto : current.objeto;
  const valorEstimado =
    data.valorEstimado !== undefined ? data.valorEstimado : current.valorEstimado;
  const estado = data.estado !== undefined ? data.estado : current.estado;
  const regiaoKey = data.regiaoKey !== undefined ? data.regiaoKey : current.regiaoKey;
  const vigenciaContrato =
    data.vigenciaContrato !== undefined ? data.vigenciaContrato : current.vigenciaContrato;
  const analiseJson =
    data.analiseJson !== undefined ? data.analiseJson : current.analiseJson;
  const arquivada = data.arquivada !== undefined ? data.arquivada : current.arquivada;
  const arquivadaEm =
    data.arquivadaEm !== undefined ? data.arquivadaEm : current.arquivadaEm;
  const arquivadaMotivo =
    data.arquivadaMotivo !== undefined ? data.arquivadaMotivo : current.arquivadaMotivo;
  const now = new Date();

  await getPrisma().$executeRawUnsafe(`
    ALTER TABLE "licitacoes"
    ADD COLUMN IF NOT EXISTS "arquivada" BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await getPrisma().$executeRawUnsafe(`
    ALTER TABLE "licitacoes"
    ADD COLUMN IF NOT EXISTS "arquivadaEm" TIMESTAMP(3)
  `);
  await getPrisma().$executeRawUnsafe(`
    ALTER TABLE "licitacoes"
    ADD COLUMN IF NOT EXISTS "arquivadaMotivo" TEXT
  `);

  await getPrisma().$executeRawUnsafe(
    `UPDATE licitacoes SET
      titulo = $1,
      "numeroProcesso" = $2,
      orgao = $3,
      modalidade = $4,
      status = $5,
      objeto = $6,
      "valorEstimado" = $7,
      estado = $8,
      "regiaoKey" = $9,
      "vigenciaContrato" = $10,
      "analiseJson" = $11::jsonb,
      arquivada = $12,
      "arquivadaEm" = $13,
      "arquivadaMotivo" = $14,
      "updatedAt" = $15
    WHERE id = $16`,
    titulo,
    numeroProcesso,
    orgao,
    modalidade,
    status,
    objeto,
    valorEstimado,
    estado,
    regiaoKey,
    vigenciaContrato,
    JSON.stringify(analiseJson),
    arquivada === true,
    arquivadaEm,
    arquivadaMotivo,
    now,
    id
  );

  const updated = await licitacaoStoreGetById(id);
  if (!updated) throw new Error('Licitação não encontrada');
  return updated;
}

export async function licitacaoStoreDelete(id: string) {
  const docs = await getPrisma().$queryRaw<LicitacaoDocumentoRow[]>`
    SELECT id, "licitacaoId", "originalName", "storagePath", "mimeType", size, "createdAt"
    FROM licitacao_documentos
    WHERE "licitacaoId" = ${id}
  `;
  await getPrisma().$executeRaw`DELETE FROM licitacoes WHERE id = ${id}`;
  return docs;
}

export async function licitacaoStoreAddDocumento(data: {
  licitacaoId: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  size: number;
}) {
  const id = uuidv4();
  const now = new Date();
  await getPrisma().$executeRaw`
    INSERT INTO licitacao_documentos (
      id, "licitacaoId", "originalName", "storagePath", "mimeType", size, "createdAt"
    ) VALUES (
      ${id},
      ${data.licitacaoId},
      ${data.originalName},
      ${data.storagePath},
      ${data.mimeType},
      ${data.size},
      ${now}
    )
  `;
  return {
    id,
    licitacaoId: data.licitacaoId,
    originalName: data.originalName,
    storagePath: data.storagePath,
    mimeType: data.mimeType,
    size: data.size,
    createdAt: now,
  };
}

export async function licitacaoStoreFindDocumento(licitacaoId: string, documentoId: string) {
  const rows = await getPrisma().$queryRaw<LicitacaoDocumentoRow[]>`
    SELECT id, "licitacaoId", "originalName", "storagePath", "mimeType", size, "createdAt"
    FROM licitacao_documentos
    WHERE id = ${documentoId} AND "licitacaoId" = ${licitacaoId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function licitacaoStoreDeleteDocumento(documentoId: string) {
  await getPrisma().$executeRaw`
    DELETE FROM licitacao_documentos WHERE id = ${documentoId}
  `;
}

export async function licitacaoStoreListDocumentos(licitacaoId: string) {
  return getPrisma().$queryRaw<LicitacaoDocumentoRow[]>`
    SELECT id, "licitacaoId", "originalName", "storagePath", "mimeType", size, "createdAt"
    FROM licitacao_documentos
    WHERE "licitacaoId" = ${licitacaoId}
    ORDER BY "createdAt" ASC
  `;
}

export function useLicitacaoPrismaDelegate(): boolean {
  const p = getPrisma() as { licitacao?: { create?: unknown } };
  return typeof p.licitacao?.create === 'function';
}
