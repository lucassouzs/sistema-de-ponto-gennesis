import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { getPrisma } from '../lib/prisma';

export type LicitacaoRegiaoRejeiteRow = {
  id: string;
  regiaoKey: string;
  spreadsheetId: string;
  rowKey: string;
  rowSnapshot: Record<string, string> | null;
  rejectedBy: string;
  rejectedByName: string;
  rejectedAt: Date;
};

type RejeiteDbRow = {
  id: string;
  regiaoKey: string;
  spreadsheetId: string;
  rowKey: string;
  rowSnapshot: unknown;
  rejectedBy: string;
  rejectedByName: string;
  rejectedAt: Date;
};

function mapRejeite(row: RejeiteDbRow): LicitacaoRegiaoRejeiteRow {
  return {
    id: row.id,
    regiaoKey: row.regiaoKey,
    spreadsheetId: row.spreadsheetId,
    rowKey: row.rowKey,
    rowSnapshot:
      row.rowSnapshot && typeof row.rowSnapshot === 'object' && !Array.isArray(row.rowSnapshot)
        ? (row.rowSnapshot as Record<string, string>)
        : null,
    rejectedBy: row.rejectedBy,
    rejectedByName: row.rejectedByName,
    rejectedAt: row.rejectedAt,
  };
}

export async function listLicitacaoRegiaoRejeites(
  regiaoKey: string,
  spreadsheetId: string
): Promise<LicitacaoRegiaoRejeiteRow[]> {
  const rows = await getPrisma().$queryRaw<RejeiteDbRow[]>`
    SELECT
      r.id,
      r."regiaoKey",
      r."spreadsheetId",
      r."rowKey",
      r."rowSnapshot",
      r."rejectedBy",
      COALESCE(u.name, r."rejectedBy") AS "rejectedByName",
      r."rejectedAt"
    FROM licitacao_regiao_rejeites r
    LEFT JOIN users u ON u.id = r."rejectedBy"
    WHERE r."regiaoKey" = ${regiaoKey}
      AND r."spreadsheetId" = ${spreadsheetId}
    ORDER BY r."rejectedAt" DESC
  `;

  return rows.map(mapRejeite);
}

export async function createLicitacaoRegiaoRejeites(input: {
  regiaoKey: string;
  spreadsheetId: string;
  rejectedBy: string;
  items: Array<{ rowKey: string; rowSnapshot?: Record<string, string> | null }>;
}): Promise<LicitacaoRegiaoRejeiteRow[]> {
  const uniqueItems = new Map<string, { rowKey: string; rowSnapshot?: Record<string, string> | null }>();
  for (const item of input.items) {
    const key = item.rowKey.trim();
    if (!key) continue;
    uniqueItems.set(key, item);
  }

  if (uniqueItems.size === 0) {
    return [];
  }

  const created: LicitacaoRegiaoRejeiteRow[] = [];

  for (const item of uniqueItems.values()) {
    const id = uuidv4();
    const snapshotJson = item.rowSnapshot ? JSON.stringify(item.rowSnapshot) : null;

    const inserted = await getPrisma().$queryRaw<RejeiteDbRow[]>`
      INSERT INTO licitacao_regiao_rejeites (
        id, "regiaoKey", "spreadsheetId", "rowKey", "rowSnapshot", "rejectedBy", "rejectedAt"
      )
      VALUES (
        ${id},
        ${input.regiaoKey},
        ${input.spreadsheetId},
        ${item.rowKey},
        ${snapshotJson}::jsonb,
        ${input.rejectedBy},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("regiaoKey", "spreadsheetId", "rowKey") DO NOTHING
      RETURNING
        id,
        "regiaoKey",
        "spreadsheetId",
        "rowKey",
        "rowSnapshot",
        "rejectedBy",
        ${input.rejectedBy} AS "rejectedByName",
        "rejectedAt"
    `;

    if (inserted.length > 0) {
      const withName = await getPrisma().$queryRaw<RejeiteDbRow[]>`
        SELECT
          r.id,
          r."regiaoKey",
          r."spreadsheetId",
          r."rowKey",
          r."rowSnapshot",
          r."rejectedBy",
          COALESCE(u.name, r."rejectedBy") AS "rejectedByName",
          r."rejectedAt"
        FROM licitacao_regiao_rejeites r
        LEFT JOIN users u ON u.id = r."rejectedBy"
        WHERE r.id = ${inserted[0].id}
      `;
      if (withName[0]) created.push(mapRejeite(withName[0]));
    }
  }

  return created;
}

export async function deleteLicitacaoRegiaoRejeites(input: {
  regiaoKey: string;
  spreadsheetId: string;
  rowKeys: string[];
}): Promise<string[]> {
  const uniqueKeys = [...new Set(input.rowKeys.map((key) => key.trim()).filter(Boolean))];
  if (uniqueKeys.length === 0) return [];

  const deleted = await getPrisma().$queryRaw<Array<{ rowKey: string }>>`
    DELETE FROM licitacao_regiao_rejeites
    WHERE "regiaoKey" = ${input.regiaoKey}
      AND "spreadsheetId" = ${input.spreadsheetId}
      AND "rowKey" IN (${Prisma.join(uniqueKeys)})
    RETURNING "rowKey"
  `;

  return deleted.map((row) => row.rowKey);
}
