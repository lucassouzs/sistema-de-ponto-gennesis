import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { getPrisma } from '../lib/prisma';

export type LicitacaoRegiaoAceiteRow = {
  id: string;
  regiaoKey: string;
  spreadsheetId: string;
  rowKey: string;
  rowSnapshot: Record<string, string> | null;
  acceptedBy: string;
  acceptedByName: string;
  acceptedAt: Date;
  licitacaoId: string | null;
  processoExcluido?: boolean;
};

type AceiteDbRow = {
  id: string;
  regiaoKey: string;
  spreadsheetId: string;
  rowKey: string;
  rowSnapshot: unknown;
  acceptedBy: string;
  acceptedByName: string;
  acceptedAt: Date;
  licitacaoId: string | null;
  processoExcluido?: boolean;
};

function mapAceite(row: AceiteDbRow): LicitacaoRegiaoAceiteRow {
  return {
    id: row.id,
    regiaoKey: row.regiaoKey,
    spreadsheetId: row.spreadsheetId,
    rowKey: row.rowKey,
    rowSnapshot:
      row.rowSnapshot && typeof row.rowSnapshot === 'object' && !Array.isArray(row.rowSnapshot)
        ? (row.rowSnapshot as Record<string, string>)
        : null,
    acceptedBy: row.acceptedBy,
    acceptedByName: row.acceptedByName,
    acceptedAt: row.acceptedAt,
    licitacaoId: row.licitacaoId,
    processoExcluido: row.processoExcluido === true,
  };
}

export async function getLicitacaoRegiaoAceitesByRowKeys(
  regiaoKey: string,
  spreadsheetId: string,
  rowKeys: string[]
): Promise<LicitacaoRegiaoAceiteRow[]> {
  const uniqueKeys = [...new Set(rowKeys.map((key) => key.trim()).filter(Boolean))];
  if (uniqueKeys.length === 0) {
    return [];
  }

  const rows = await getPrisma().$queryRaw<AceiteDbRow[]>`
    SELECT
      a.id,
      a."regiaoKey",
      a."spreadsheetId",
      a."rowKey",
      a."rowSnapshot",
      a."acceptedBy",
      COALESCE(u.name, a."acceptedBy") AS "acceptedByName",
      a."acceptedAt",
      a."licitacaoId"
    FROM licitacao_regiao_aceites a
    LEFT JOIN users u ON u.id = a."acceptedBy"
    WHERE a."regiaoKey" = ${regiaoKey}
      AND a."spreadsheetId" = ${spreadsheetId}
      AND a."rowKey" IN (${Prisma.join(uniqueKeys)})
    ORDER BY a."acceptedAt" DESC
  `;

  return rows.map(mapAceite);
}

export async function listLicitacaoRegiaoAceites(
  regiaoKey: string,
  spreadsheetId: string
): Promise<LicitacaoRegiaoAceiteRow[]> {
  const rows = await getPrisma().$queryRaw<AceiteDbRow[]>`
    SELECT
      a.id,
      a."regiaoKey",
      a."spreadsheetId",
      a."rowKey",
      a."rowSnapshot",
      a."acceptedBy",
      COALESCE(u.name, a."acceptedBy") AS "acceptedByName",
      a."acceptedAt",
      a."licitacaoId"
    FROM licitacao_regiao_aceites a
    LEFT JOIN users u ON u.id = a."acceptedBy"
    WHERE a."regiaoKey" = ${regiaoKey}
      AND a."spreadsheetId" = ${spreadsheetId}
    ORDER BY a."acceptedAt" DESC
  `;

  return rows.map(mapAceite);
}

export async function createLicitacaoRegiaoAceites(input: {
  regiaoKey: string;
  spreadsheetId: string;
  acceptedBy: string;
  items: Array<{ rowKey: string; rowSnapshot?: Record<string, string> | null }>;
}): Promise<LicitacaoRegiaoAceiteRow[]> {
  const uniqueItems = new Map<string, { rowKey: string; rowSnapshot?: Record<string, string> | null }>();
  for (const item of input.items) {
    const key = item.rowKey.trim();
    if (!key) continue;
    uniqueItems.set(key, item);
  }

  if (uniqueItems.size === 0) {
    return [];
  }

  const created: LicitacaoRegiaoAceiteRow[] = [];

  for (const item of uniqueItems.values()) {
    const id = uuidv4();
    const snapshotJson = item.rowSnapshot ? JSON.stringify(item.rowSnapshot) : null;

    const inserted = await getPrisma().$queryRaw<AceiteDbRow[]>`
      INSERT INTO licitacao_regiao_aceites (
        id, "regiaoKey", "spreadsheetId", "rowKey", "rowSnapshot", "acceptedBy", "acceptedAt"
      )
      VALUES (
        ${id},
        ${input.regiaoKey},
        ${input.spreadsheetId},
        ${item.rowKey},
        ${snapshotJson}::jsonb,
        ${input.acceptedBy},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("regiaoKey", "spreadsheetId", "rowKey") DO NOTHING
      RETURNING
        id,
        "regiaoKey",
        "spreadsheetId",
        "rowKey",
        "rowSnapshot",
        "acceptedBy",
        ${input.acceptedBy} AS "acceptedByName",
        "acceptedAt",
        NULL::text AS "licitacaoId"
    `;

    if (inserted.length > 0) {
      const withName = await getPrisma().$queryRaw<AceiteDbRow[]>`
        SELECT
          a.id,
          a."regiaoKey",
          a."spreadsheetId",
          a."rowKey",
          a."rowSnapshot",
          a."acceptedBy",
          COALESCE(u.name, a."acceptedBy") AS "acceptedByName",
          a."acceptedAt",
          a."licitacaoId"
        FROM licitacao_regiao_aceites a
        LEFT JOIN users u ON u.id = a."acceptedBy"
        WHERE a.id = ${inserted[0].id}
      `;
      if (withName[0]) created.push(mapAceite(withName[0]));
    }
  }

  return created;
}

export async function listAceitesWithLicitacaoId(): Promise<LicitacaoRegiaoAceiteRow[]> {
  const rows = await getPrisma().$queryRaw<AceiteDbRow[]>`
    SELECT
      a.id,
      a."regiaoKey",
      a."spreadsheetId",
      a."rowKey",
      a."rowSnapshot",
      a."acceptedBy",
      COALESCE(u.name, a."acceptedBy") AS "acceptedByName",
      a."acceptedAt",
      a."licitacaoId"
    FROM licitacao_regiao_aceites a
    LEFT JOIN users u ON u.id = a."acceptedBy"
    WHERE a."licitacaoId" IS NOT NULL
    ORDER BY a."acceptedAt" ASC
  `;

  return rows.map(mapAceite);
}

export async function listAceitesPendingLicitacaoSync(): Promise<LicitacaoRegiaoAceiteRow[]> {
  const rows = await getPrisma().$queryRaw<AceiteDbRow[]>`
    SELECT
      a.id,
      a."regiaoKey",
      a."spreadsheetId",
      a."rowKey",
      a."rowSnapshot",
      a."acceptedBy",
      COALESCE(u.name, a."acceptedBy") AS "acceptedByName",
      a."acceptedAt",
      a."licitacaoId",
      a."processoExcluido"
    FROM licitacao_regiao_aceites a
    LEFT JOIN users u ON u.id = a."acceptedBy"
    WHERE a."licitacaoId" IS NULL
      AND COALESCE(a."processoExcluido", FALSE) = FALSE
    ORDER BY a."acceptedAt" ASC
  `;

  return rows.map(mapAceite);
}

export async function getLicitacaoIdsForAceiteRowKeys(input: {
  regiaoKey: string;
  spreadsheetId: string;
  rowKeys: string[];
}): Promise<string[]> {
  const uniqueKeys = [...new Set(input.rowKeys.map((key) => key.trim()).filter(Boolean))];
  if (uniqueKeys.length === 0) return [];

  const rows = await getPrisma().$queryRaw<{ licitacaoId: string | null }[]>`
    SELECT a."licitacaoId"
    FROM licitacao_regiao_aceites a
    WHERE a."regiaoKey" = ${input.regiaoKey}
      AND a."spreadsheetId" = ${input.spreadsheetId}
      AND a."rowKey" IN (${Prisma.join(uniqueKeys)})
      AND a."licitacaoId" IS NOT NULL
  `;

  return rows.map((row) => row.licitacaoId).filter((id): id is string => Boolean(id));
}

export async function setAceiteLicitacaoId(aceiteId: string, licitacaoId: string): Promise<void> {
  await getPrisma().$executeRaw`
    UPDATE licitacao_regiao_aceites
    SET "licitacaoId" = ${licitacaoId},
        "processoExcluido" = FALSE
    WHERE id = ${aceiteId}
  `;
}

export async function clearProcessoExcluidoForAceites(aceiteIds: string[]): Promise<void> {
  const unique = [...new Set(aceiteIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  await getPrisma().$executeRawUnsafe(`
    ALTER TABLE "licitacao_regiao_aceites"
    ADD COLUMN IF NOT EXISTS "processoExcluido" BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await getPrisma().$executeRaw`
    UPDATE licitacao_regiao_aceites
    SET "processoExcluido" = FALSE
    WHERE id IN (${Prisma.join(unique)})
  `;
}

export async function deleteLicitacaoRegiaoAceites(input: {
  regiaoKey: string;
  spreadsheetId: string;
  rowKeys: string[];
}): Promise<string[]> {
  const uniqueKeys = [...new Set(input.rowKeys.map((key) => key.trim()).filter(Boolean))];
  if (uniqueKeys.length === 0) {
    return [];
  }

  const deleted = await getPrisma().$queryRaw<{ rowKey: string }[]>`
    DELETE FROM licitacao_regiao_aceites
    WHERE "regiaoKey" = ${input.regiaoKey}
      AND "spreadsheetId" = ${input.spreadsheetId}
      AND "rowKey" IN (${Prisma.join(uniqueKeys)})
    RETURNING "rowKey"
  `;

  return deleted.map((row) => row.rowKey);
}

/**
 * Ao excluir o processo de análise: mantém o aceite na planilha,
 * só desvincula e marca para o sync não recriar o processo.
 */
export async function unlinkAceitesFromDeletedLicitacao(licitacaoId: string): Promise<number> {
  const id = licitacaoId.trim();
  if (!id) return 0;

  await getPrisma().$executeRawUnsafe(`
    ALTER TABLE "licitacao_regiao_aceites"
    ADD COLUMN IF NOT EXISTS "processoExcluido" BOOLEAN NOT NULL DEFAULT FALSE
  `);

  const updated = await getPrisma().$queryRaw<{ id: string }[]>`
    UPDATE licitacao_regiao_aceites
    SET "licitacaoId" = NULL,
        "processoExcluido" = TRUE
    WHERE "licitacaoId" = ${id}
    RETURNING id
  `;

  return updated.length;
}
