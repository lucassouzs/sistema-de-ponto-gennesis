import { v4 as uuidv4 } from 'uuid';
import { getPrisma } from '../lib/prisma';

export type LicitacaoRegiaoManualRow = {
  id: string;
  regiaoKey: string;
  rowKey: string;
  headers: string[];
  rowSnapshot: Record<string, string>;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
};

type ManualDbRow = {
  id: string;
  regiaoKey: string;
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

function mapManual(row: ManualDbRow): LicitacaoRegiaoManualRow {
  return {
    id: row.id,
    regiaoKey: row.regiaoKey,
    rowKey: row.rowKey,
    headers: asStringArray(row.headers),
    rowSnapshot: asStringRecord(row.rowSnapshot),
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
  };
}

export async function listLicitacaoRegiaoManuais(
  regiaoKey: string
): Promise<LicitacaoRegiaoManualRow[]> {
  const rows = await getPrisma().$queryRaw<ManualDbRow[]>`
    SELECT
      m.id,
      m."regiaoKey",
      m."rowKey",
      m.headers,
      m."rowSnapshot",
      m."createdBy",
      COALESCE(u.name, m."createdBy") AS "createdByName",
      m."createdAt"
    FROM licitacao_regiao_manuais m
    LEFT JOIN users u ON u.id = m."createdBy"
    WHERE m."regiaoKey" = ${regiaoKey}
    ORDER BY m."createdAt" DESC
  `;
  return rows.map(mapManual);
}

export async function createLicitacaoRegiaoManual(input: {
  regiaoKey: string;
  headers: string[];
  rowSnapshot: Record<string, string>;
  createdBy: string;
}): Promise<LicitacaoRegiaoManualRow> {
  const id = uuidv4();
  const rowKey = `manual:${id}`;
  const headersJson = JSON.stringify(input.headers);
  const snapshotJson = JSON.stringify(input.rowSnapshot);

  await getPrisma().$executeRaw`
    INSERT INTO licitacao_regiao_manuais (
      id, "regiaoKey", "rowKey", headers, "rowSnapshot", "createdBy", "createdAt"
    ) VALUES (
      ${id},
      ${input.regiaoKey},
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
      m."regiaoKey",
      m."rowKey",
      m.headers,
      m."rowSnapshot",
      m."createdBy",
      COALESCE(u.name, m."createdBy") AS "createdByName",
      m."createdAt"
    FROM licitacao_regiao_manuais m
    LEFT JOIN users u ON u.id = m."createdBy"
    WHERE m.id = ${id}
    LIMIT 1
  `;

  const created = rows[0];
  if (!created) throw new Error('Falha ao criar licitação manual.');
  return mapManual(created);
}

export async function deleteLicitacaoRegiaoManual(input: {
  regiaoKey: string;
  rowKey: string;
}): Promise<boolean> {
  const result = await getPrisma().$executeRaw`
    DELETE FROM licitacao_regiao_manuais
    WHERE "regiaoKey" = ${input.regiaoKey}
      AND "rowKey" = ${input.rowKey}
  `;
  return Number(result) > 0;
}

export async function getLicitacaoRegiaoManualByRowKey(
  regiaoKey: string,
  rowKey: string
): Promise<LicitacaoRegiaoManualRow | null> {
  const rows = await getPrisma().$queryRaw<ManualDbRow[]>`
    SELECT
      m.id,
      m."regiaoKey",
      m."rowKey",
      m.headers,
      m."rowSnapshot",
      m."createdBy",
      COALESCE(u.name, m."createdBy") AS "createdByName",
      m."createdAt"
    FROM licitacao_regiao_manuais m
    LEFT JOIN users u ON u.id = m."createdBy"
    WHERE m."regiaoKey" = ${regiaoKey}
      AND m."rowKey" = ${rowKey}
    LIMIT 1
  `;
  return rows[0] ? mapManual(rows[0]) : null;
}

export async function updateLicitacaoRegiaoManualSnapshot(input: {
  regiaoKey: string;
  rowKey: string;
  rowSnapshot: Record<string, string>;
}): Promise<void> {
  const snapshotJson = JSON.stringify(input.rowSnapshot);
  await getPrisma().$executeRaw`
    UPDATE licitacao_regiao_manuais
    SET "rowSnapshot" = ${snapshotJson}::jsonb
    WHERE "regiaoKey" = ${input.regiaoKey}
      AND "rowKey" = ${input.rowKey}
  `;
}

/** Headers canônicos por região (espelham a planilha). */
export function getCanonicalRegiaoHeaders(regiaoKey: string): string[] {
  const base = [
    'ITEM',
    'ESTADO',
    'ÓRGÃO',
    'OBJETO',
    'QUALIFICAÇÃO TÉCNICA',
    'VALOR ESTIMADO',
    'Nº DO PREGÃO',
    'CÓDIGO / UASG',
    'SITE/LOCAL',
    'ABERTURA',
    'HORA',
    'DESCONTO',
  ];

  if (regiaoKey === 'centro-oeste') {
    return [...base, 'EMPRESA ', 'EDITAL'];
  }

  return [...base, 'FASE DA LICITAÇÃO', 'EMPRESA ', 'EDITAL'];
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

export function normalizeManualRowSnapshot(
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
