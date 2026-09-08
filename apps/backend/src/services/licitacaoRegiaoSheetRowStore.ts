import { v4 as uuidv4 } from 'uuid';
import { getPrisma } from '../lib/prisma';
import { snapshotToCells } from './licitacaoRegiaoManualStore';

export type LicitacaoRegiaoSheetRow = {
  id: string;
  regiaoKey: string;
  spreadsheetId: string;
  rowKey: string;
  headers: string[];
  rowSnapshot: Record<string, string>;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

type SheetRowDb = {
  id: string;
  regiaoKey: string;
  spreadsheetId: string;
  rowKey: string;
  headers: unknown;
  rowSnapshot: unknown;
  firstSeenAt: Date;
  lastSeenAt: Date;
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

function mapRow(row: SheetRowDb): LicitacaoRegiaoSheetRow {
  return {
    id: row.id,
    regiaoKey: row.regiaoKey,
    spreadsheetId: row.spreadsheetId,
    rowKey: row.rowKey,
    headers: asStringArray(row.headers),
    rowSnapshot: asStringRecord(row.rowSnapshot),
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
  };
}

function normalizeIdentityPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function snapshotField(snapshot: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const direct = snapshot[name];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    const match = Object.entries(snapshot).find(
      ([key]) => key.trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return '';
}

/** Identidade de negócio para não reexibir versão antiga após edição na planilha. */
export function buildSheetRowBusinessKey(snapshot: Record<string, string>): string | null {
  const pregao = normalizeIdentityPart(
    snapshotField(snapshot, 'Nº DO PREGÃO', 'N° DO PREGÃO', 'NO DO PREGAO', 'PREGÃO', 'PREGAO')
  );
  const uasg = normalizeIdentityPart(
    snapshotField(snapshot, 'CÓDIGO / UASG', 'CODIGO / UASG', 'UASG', 'CÓDIGO', 'CODIGO')
  );
  const orgao = normalizeIdentityPart(snapshotField(snapshot, 'ÓRGÃO', 'ORGAO'));
  const objeto = normalizeIdentityPart(snapshotField(snapshot, 'OBJETO'));

  if (pregao && uasg) return `pregao:${pregao}|uasg:${uasg}`;
  if (pregao && orgao) return `pregao:${pregao}|orgao:${orgao}`;
  if (orgao && objeto) return `orgao:${orgao}|objeto:${objeto}`;
  return null;
}

export function cellsToSnapshot(
  headers: string[],
  row: string[]
): Record<string, string> {
  const snapshot: Record<string, string> = {};
  headers.forEach((header, index) => {
    const value = row[index]?.trim() ?? '';
    if (value) snapshot[header] = value;
  });
  return snapshot;
}

/** Upsert append-only: novas linhas entram; existentes atualizam snapshot; nunca apaga. */
export async function upsertLicitacaoRegiaoSheetRows(input: {
  regiaoKey: string;
  spreadsheetId: string;
  headers: string[];
  rows: Array<{ rowKey: string; cells: string[] }>;
}): Promise<void> {
  if (input.rows.length === 0) return;

  const prisma = getPrisma();
  const headersJson = JSON.stringify(input.headers);

  for (const row of input.rows) {
    const id = uuidv4();
    const snapshotJson = JSON.stringify(cellsToSnapshot(input.headers, row.cells));

    await prisma.$executeRaw`
      INSERT INTO licitacao_regiao_sheet_rows (
        id, "regiaoKey", "spreadsheetId", "rowKey", headers, "rowSnapshot", "firstSeenAt", "lastSeenAt"
      ) VALUES (
        ${id},
        ${input.regiaoKey},
        ${input.spreadsheetId},
        ${row.rowKey},
        ${headersJson}::jsonb,
        ${snapshotJson}::jsonb,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("regiaoKey", "spreadsheetId", "rowKey")
      DO UPDATE SET
        headers = EXCLUDED.headers,
        "rowSnapshot" = EXCLUDED."rowSnapshot",
        "lastSeenAt" = CURRENT_TIMESTAMP
    `;
  }
}

export async function listLicitacaoRegiaoSheetRows(input: {
  regiaoKey: string;
  spreadsheetId: string;
}): Promise<LicitacaoRegiaoSheetRow[]> {
  const rows = await getPrisma().$queryRaw<SheetRowDb[]>`
    SELECT
      id,
      "regiaoKey",
      "spreadsheetId",
      "rowKey",
      headers,
      "rowSnapshot",
      "firstSeenAt",
      "lastSeenAt"
    FROM licitacao_regiao_sheet_rows
    WHERE "regiaoKey" = ${input.regiaoKey}
      AND "spreadsheetId" = ${input.spreadsheetId}
    ORDER BY "firstSeenAt" ASC
  `;
  return rows.map(mapRow);
}

/** Linhas já vistas que sumiram da planilha, reconstruídas como células. */
export function retainedRowsMissingFromSheet(input: {
  headers: string[];
  liveRowKeys: Set<string>;
  liveBusinessKeys: Set<string>;
  stored: LicitacaoRegiaoSheetRow[];
}): { rows: string[][]; rowKeys: string[] } {
  const candidates = input.stored.filter((stored) => {
    if (input.liveRowKeys.has(stored.rowKey)) return false;
    const businessKey = buildSheetRowBusinessKey(stored.rowSnapshot);
    if (businessKey && input.liveBusinessKeys.has(businessKey)) return false;
    return true;
  });

  // Se a mesma licitação foi editada várias vezes e depois apagada, fica só a versão mais recente.
  const latestByBusiness = new Map<string, LicitacaoRegiaoSheetRow>();
  const withoutBusiness: LicitacaoRegiaoSheetRow[] = [];

  for (const stored of candidates) {
    const businessKey = buildSheetRowBusinessKey(stored.rowSnapshot);
    if (!businessKey) {
      withoutBusiness.push(stored);
      continue;
    }
    const current = latestByBusiness.get(businessKey);
    if (!current || stored.lastSeenAt > current.lastSeenAt) {
      latestByBusiness.set(businessKey, stored);
    }
  }

  const retained = [...withoutBusiness, ...latestByBusiness.values()].sort(
    (a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime()
  );

  return {
    rows: retained.map((stored) => snapshotToCells(input.headers, stored.rowSnapshot)),
    rowKeys: retained.map((stored) => stored.rowKey),
  };
}
