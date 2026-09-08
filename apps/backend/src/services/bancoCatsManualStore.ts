import { v4 as uuidv4 } from 'uuid';
import { getPrisma } from '../lib/prisma';

export const BANCO_CATS_CANONICAL_HEADERS = [
  'EMPRESA',
  'DESCRIÇÃO',
  'UND',
  'QUANT.',
  'Ind. Fonte',
  'FONTE',
] as const;

export type BancoCatsManualRow = {
  id: string;
  spreadsheetId: string;
  rowKey: string;
  headers: string[];
  rowSnapshot: Record<string, string>;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
};

type ManualDbRow = {
  id: string;
  spreadsheetId: string;
  rowKey: string;
  headers: unknown;
  rowSnapshot: unknown;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' && raw.trim()) out[key] = raw.trim();
  }
  return out;
}

function mapManual(row: ManualDbRow): BancoCatsManualRow {
  return {
    id: row.id,
    spreadsheetId: row.spreadsheetId,
    rowKey: row.rowKey,
    headers: asStringArray(row.headers),
    rowSnapshot: asStringRecord(row.rowSnapshot),
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
  };
}

export function getCanonicalBancoCatsHeaders(): string[] {
  return [...BANCO_CATS_CANONICAL_HEADERS];
}

export function snapshotToCells(
  headers: string[],
  snapshot: Record<string, string>
): string[] {
  return headers.map((header) => {
    const direct = snapshot[header];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    const trimmedKey = header.trim();
    const match = Object.entries(snapshot).find(([key]) => key.trim() === trimmedKey);
    return match?.[1]?.trim() ?? '';
  });
}

export function normalizeBancoCatsRowSnapshot(
  headers: string[],
  fields: Record<string, string>
): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const header of headers) {
    const raw = fields[header] ?? fields[header.trim()] ?? '';
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value) snapshot[header] = value;
  }
  return snapshot;
}

export async function listBancoCatsManuais(
  spreadsheetId: string
): Promise<BancoCatsManualRow[]> {
  const rows = await getPrisma().$queryRaw<ManualDbRow[]>`
    SELECT
      m.id,
      m."spreadsheetId",
      m."rowKey",
      m.headers,
      m."rowSnapshot",
      m."createdBy",
      COALESCE(u.name, m."createdBy") AS "createdByName",
      m."createdAt"
    FROM banco_cats_servicos m
    LEFT JOIN users u ON u.id = m."createdBy"
    WHERE m."spreadsheetId" = ${spreadsheetId}
    ORDER BY m."createdAt" DESC
  `;
  return rows.map(mapManual);
}

export async function createBancoCatsManual(input: {
  spreadsheetId: string;
  headers: string[];
  rowSnapshot: Record<string, string>;
  createdBy: string;
}): Promise<BancoCatsManualRow> {
  const id = uuidv4();
  const rowKey = `manual:${id}`;
  const headersJson = JSON.stringify(input.headers);
  const snapshotJson = JSON.stringify(input.rowSnapshot);

  await getPrisma().$executeRaw`
    INSERT INTO banco_cats_servicos (
      id, "spreadsheetId", "rowKey", headers, "rowSnapshot", "createdBy", "createdAt"
    ) VALUES (
      ${id},
      ${input.spreadsheetId},
      ${rowKey},
      ${headersJson}::jsonb,
      ${snapshotJson}::jsonb,
      ${input.createdBy},
      CURRENT_TIMESTAMP
    )
  `;

  const rows = await getPrisma().$queryRaw<ManualDbRow[]>`
    SELECT
      m.id,
      m."spreadsheetId",
      m."rowKey",
      m.headers,
      m."rowSnapshot",
      m."createdBy",
      COALESCE(u.name, m."createdBy") AS "createdByName",
      m."createdAt"
    FROM banco_cats_servicos m
    LEFT JOIN users u ON u.id = m."createdBy"
    WHERE m.id = ${id}
    LIMIT 1
  `;

  const created = rows[0];
  if (!created) throw new Error('Falha ao criar serviço no Banco CAT\'s.');
  return mapManual(created);
}

export async function deleteBancoCatsManual(input: {
  spreadsheetId: string;
  rowKey: string;
}): Promise<boolean> {
  const result = await getPrisma().$executeRaw`
    DELETE FROM banco_cats_servicos
    WHERE "spreadsheetId" = ${input.spreadsheetId}
      AND "rowKey" = ${input.rowKey}
  `;
  return Number(result) > 0;
}
