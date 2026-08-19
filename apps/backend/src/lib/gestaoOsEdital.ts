import { prisma } from './prisma';

export const GESTAO_OS_ORIGINS = ['REQUEST', 'SAC', 'UNPLANNED', 'PLANTAO'] as const;
export type GestaoOsOrigin = (typeof GESTAO_OS_ORIGINS)[number];

export const GESTAO_OS_SAC_KINDS = ['CHAMADO', 'DUVIDA', 'RECLAMACAO'] as const;
export type GestaoOsSacKind = (typeof GESTAO_OS_SAC_KINDS)[number];

export type GestaoOsChecklistEvidenceItem = {
  id: string;
  label: string;
  checked: boolean;
  required?: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
};

export function parseOrigin(value: unknown): GestaoOsOrigin {
  const raw = String(value ?? 'REQUEST').trim().toUpperCase();
  if ((GESTAO_OS_ORIGINS as readonly string[]).includes(raw)) return raw as GestaoOsOrigin;
  return 'REQUEST';
}

export function parseSacKind(value: unknown): GestaoOsSacKind | null {
  const raw = String(value ?? '').trim().toUpperCase();
  if ((GESTAO_OS_SAC_KINDS as readonly string[]).includes(raw)) return raw as GestaoOsSacKind;
  return null;
}

export function parseTeamUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    const id = String(item ?? '').trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, 20);
}

export function parseChecklistEvidence(value: unknown): GestaoOsChecklistEvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const label = String(row.label ?? '').trim();
      if (!label) return null;
      return {
        id: String(row.id ?? `item-${idx + 1}`),
        label,
        checked: Boolean(row.checked),
        required: row.required !== false,
        startedAt: row.startedAt ? String(row.startedAt) : null,
        completedAt: row.completedAt ? String(row.completedAt) : null,
        beforePhotoUrl: row.beforePhotoUrl ? String(row.beforePhotoUrl) : null,
        afterPhotoUrl: row.afterPhotoUrl ? String(row.afterPhotoUrl) : null
      };
    })
    .filter(Boolean) as GestaoOsChecklistEvidenceItem[];
}

export function isExecutionChecklistEvidenceComplete(value: unknown): boolean {
  const items = parseChecklistEvidence(value);
  if (!items.length) return true;
  return items.every(
    (item) =>
      !!item.checked &&
      !!item.startedAt &&
      !!item.completedAt &&
      !!item.beforePhotoUrl &&
      !!item.afterPhotoUrl
  );
}

export function stampChecklistToggle(
  items: GestaoOsChecklistEvidenceItem[],
  index: number,
  checked: boolean
): GestaoOsChecklistEvidenceItem[] {
  const now = new Date().toISOString();
  return items.map((item, i) => {
    if (i !== index) return item;
    if (!checked) {
      return { ...item, checked: false, completedAt: null };
    }
    return {
      ...item,
      checked: true,
      startedAt: item.startedAt || now,
      completedAt: now
    };
  });
}

function sqlText(value: string | null | undefined): string {
  if (value == null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNum(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'NULL';
  return String(value);
}

export async function persistAssetSerial(id: string, serialNumber: string | null | undefined) {
  if (serialNumber === undefined) return;
  await prisma.$executeRawUnsafe(
    `UPDATE "gestao_os_assets" SET "serialNumber" = ${sqlText(serialNumber)} WHERE "id" = ${sqlText(id)}`
  );
}

export async function persistBuildingEdital(
  id: string,
  input: {
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    responsibleUserId?: string | null;
    prepostoUserId?: string | null;
    managerUserId?: string | null;
    fiscalUserId?: string | null;
    qrToken?: string | null;
  }
) {
  const sets: string[] = [];
  if (input.address !== undefined) sets.push(`"address" = ${sqlText(input.address)}`);
  if (input.latitude !== undefined) sets.push(`"latitude" = ${sqlNum(input.latitude)}`);
  if (input.longitude !== undefined) sets.push(`"longitude" = ${sqlNum(input.longitude)}`);
  if (input.responsibleUserId !== undefined) {
    sets.push(`"responsibleUserId" = ${sqlText(input.responsibleUserId)}`);
  }
  if (input.prepostoUserId !== undefined) sets.push(`"prepostoUserId" = ${sqlText(input.prepostoUserId)}`);
  if (input.managerUserId !== undefined) sets.push(`"managerUserId" = ${sqlText(input.managerUserId)}`);
  if (input.fiscalUserId !== undefined) sets.push(`"fiscalUserId" = ${sqlText(input.fiscalUserId)}`);
  if (input.qrToken !== undefined) sets.push(`"qrToken" = ${sqlText(input.qrToken)}`);
  if (!sets.length) return;
  await prisma.$executeRawUnsafe(
    `UPDATE "gestao_os_buildings" SET ${sets.join(', ')} WHERE "id" = ${sqlText(id)}`
  );
}

export async function loadBuildingEditalMap(ids: string[]) {
  const map = new Map<
    string,
    {
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      responsibleUserId: string | null;
      prepostoUserId: string | null;
      managerUserId: string | null;
      fiscalUserId: string | null;
      qrToken: string | null;
    }
  >();
  if (!ids.length) return map;
  const found = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      responsibleUserId: string | null;
      prepostoUserId: string | null;
      managerUserId: string | null;
      fiscalUserId: string | null;
      qrToken: string | null;
    }>
  >(
    `SELECT "id", "address", "latitude", "longitude", "responsibleUserId", "prepostoUserId", "managerUserId", "fiscalUserId", "qrToken"
     FROM "gestao_os_buildings"
     WHERE "id" IN (${ids.map((id) => sqlText(id)).join(',')})`
  );
  for (const row of found) map.set(row.id, row);
  return map;
}

export function parseCloseQrToken(value: unknown): string {
  let raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('gennesis-os-close:')) raw = raw.slice('gennesis-os-close:'.length).trim();
  try {
    const url = new URL(raw);
    const q = url.searchParams.get('close') || url.searchParams.get('qr') || url.searchParams.get('token');
    if (q) return q.trim();
  } catch {
    /* payload puro */
  }
  return raw;
}

export async function loadUnitBuildingIds(userId: string): Promise<string[]> {
  const id = String(userId || '').trim();
  if (!id) return [];
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "id" FROM "gestao_os_buildings"
     WHERE "isActive" = true AND (
       "responsibleUserId" = ${sqlText(id)}
       OR "prepostoUserId" = ${sqlText(id)}
       OR "managerUserId" = ${sqlText(id)}
       OR "fiscalUserId" = ${sqlText(id)}
     )`
  );
  return rows.map((row) => row.id);
}

export async function loadAssetSerialMap(ids: string[]) {
  const map = new Map<string, string | null>();
  if (!ids.length) return map;
  const found = await prisma.$queryRawUnsafe<{ id: string; serialNumber: string | null }[]>(
    `SELECT "id", "serialNumber" FROM "gestao_os_assets" WHERE "id" IN (${ids
      .map((id) => sqlText(id))
      .join(',')})`
  );
  for (const row of found) map.set(row.id, row.serialNumber);
  return map;
}
