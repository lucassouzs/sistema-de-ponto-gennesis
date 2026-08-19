import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type GestaoOsChecklistCopyItem = {
  id: string;
  label: string;
  checked: boolean;
  required?: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
};

export function parseChecklistLabels(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  const labels: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const label = item.trim();
      if (label) labels.push(label);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const label = String((item as { label?: unknown }).label ?? '').trim();
    if (label) labels.push(label);
  }
  return labels;
}

export function checklistResponsesFromItems(items: unknown): GestaoOsChecklistCopyItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, idx) => {
      if (typeof item === 'string') {
        const label = item.trim();
        if (!label) return null;
        return { id: `item-${idx + 1}`, label, checked: false };
      }
      if (!item || typeof item !== 'object') return null;
      const row = item as { id?: unknown; label?: unknown; required?: unknown };
      const label = String(row.label ?? '').trim();
      if (!label) return null;
      return {
        id: String(row.id ?? `item-${idx + 1}`),
        label,
        checked: false,
        required: !!row.required
      };
    })
    .filter(Boolean) as GestaoOsChecklistCopyItem[];
}

export function parseChecklistResponses(value: unknown): GestaoOsChecklistCopyItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, idx) => {
      if (typeof item === 'string') {
        const label = item.trim();
        if (!label) return null;
        return { id: `item-${idx + 1}`, label, checked: false };
      }
      if (!item || typeof item !== 'object') return null;
      const row = item as {
        id?: unknown;
        label?: unknown;
        checked?: unknown;
        required?: unknown;
        startedAt?: unknown;
        completedAt?: unknown;
        beforePhotoUrl?: unknown;
        afterPhotoUrl?: unknown;
      };
      const label = String(row.label ?? '').trim();
      if (!label) return null;
      return {
        id: String(row.id ?? `item-${idx + 1}`),
        label,
        checked: Boolean(row.checked),
        required: !!row.required,
        startedAt: row.startedAt ? String(row.startedAt) : null,
        completedAt: row.completedAt ? String(row.completedAt) : null,
        beforePhotoUrl: row.beforePhotoUrl ? String(row.beforePhotoUrl) : null,
        afterPhotoUrl: row.afterPhotoUrl ? String(row.afterPhotoUrl) : null
      };
    })
    .filter(Boolean) as GestaoOsChecklistCopyItem[];
}

export function isChecklistEmpty(value: unknown): boolean {
  return checklistResponsesFromItems(value).length === 0;
}

/** Sem itens: não bloqueia. Com itens: todos precisam estar marcados. */
export function isExecutionChecklistComplete(value: unknown): boolean {
  const items = parseChecklistResponses(value);
  if (items.length === 0) return true;
  return items.every((item) => !!item.checked);
}

export async function loadCategoryChecklistId(categoryId: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<{ checklistId: string | null }[]>(
    `SELECT "checklistId" FROM "gestao_os_service_categories" WHERE "id" = '${categoryId.replace(
      /'/g,
      "''"
    )}' LIMIT 1`
  );
  return rows[0]?.checklistId ?? null;
}

export async function persistCategoryChecklistId(
  categoryId: string,
  checklistId: string | null
): Promise<void> {
  const id = categoryId.replace(/'/g, "''");
  const value = checklistId
    ? `'${checklistId.replace(/'/g, "''")}'`
    : 'NULL';
  await prisma.$executeRawUnsafe(
    `UPDATE "gestao_os_service_categories" SET "checklistId" = ${value} WHERE "id" = '${id}'`
  );
}

export async function upsertChecklistTemplate(input: {
  companyId?: string | null;
  name: string;
  planType?: 'PREVENTIVE' | 'PMOC' | 'SAFETY';
  category?: string | null;
  labels: string[];
  existingId?: string | null;
}): Promise<string | null> {
  const labels = input.labels.map((l) => l.trim()).filter(Boolean);
  if (!labels.length) return input.existingId ?? null;
  const items = labels.map((label, idx) => ({
    id: `item-${idx + 1}`,
    label,
    required: false
  }));
  if (input.existingId) {
    const existing = await prisma.gestaoOsChecklistTemplate.findUnique({
      where: { id: input.existingId }
    });
    if (existing) {
      await prisma.gestaoOsChecklistTemplate.update({
        where: { id: existing.id },
        data: { name: input.name, items: items as Prisma.InputJsonValue, isActive: true }
      });
      return existing.id;
    }
  }
  const created = await prisma.gestaoOsChecklistTemplate.create({
    data: {
      companyId: input.companyId || null,
      name: input.name,
      planType: input.planType ?? 'PREVENTIVE',
      category: input.category || null,
      items: items as Prisma.InputJsonValue
    }
  });
  return created.id;
}

export async function loadIfspChecklistLabels(input: {
  buildingId?: string | null;
  assetId?: string | null;
}): Promise<string[]> {
  const where: Prisma.GestaoOsDocumentWhereInput = {
    kind: { in: ['CHECKLIST_IFSP', 'MANUAL_PATRIMONIO'] },
    notes: { not: null }
  };
  const or: Prisma.GestaoOsDocumentWhereInput[] = [];
  if (input.assetId) or.push({ assetId: input.assetId });
  if (input.buildingId) or.push({ buildingId: input.buildingId });
  if (or.length) where.OR = or;
  const docs = await prisma.gestaoOsDocument.findMany({
    where,
    select: { notes: true, kind: true },
    orderBy: { createdAt: 'desc' },
    take: 8
  });
  const labels: string[] = [];
  for (const doc of docs) {
    for (const line of parseChecklistLabels(doc.notes)) {
      if (!labels.includes(line)) labels.push(line);
    }
  }
  return labels;
}

export async function resolveCategoryChecklistResponses(
  categoryName: string,
  companyId?: string | null
): Promise<GestaoOsChecklistCopyItem[]> {
  const name = categoryName.trim();
  if (!name) return [];
  const category = await prisma.gestaoOsServiceCategory.findFirst({
    where: {
      name,
      isActive: true,
      ...(companyId ? { OR: [{ companyId }, { companyId: null }] } : {})
    },
    select: { id: true }
  });
  if (!category) return [];
  const checklistId = await loadCategoryChecklistId(category.id);
  if (!checklistId) return [];
  const template = await prisma.gestaoOsChecklistTemplate.findUnique({
    where: { id: checklistId },
    select: { items: true, isActive: true }
  });
  if (!template?.isActive) return [];
  return checklistResponsesFromItems(template.items).map((item) => ({
    ...item,
    required: true
  }));
}

const SKIP_CHECKLIST_HYDRATE = new Set(['CLOSED', 'CANCELLED']);

/** OS já aberta/aprovada sem itens: copia o checklist atual do tipo de serviço. */
export async function hydrateEmptyExecutionChecklist(row: {
  id: string;
  status: string;
  category: string;
  companyId?: string | null;
  checklistResponses?: unknown;
}): Promise<GestaoOsChecklistCopyItem[] | null> {
  if (SKIP_CHECKLIST_HYDRATE.has(row.status)) return null;
  if (!isChecklistEmpty(row.checklistResponses)) return null;
  const copied = await resolveCategoryChecklistResponses(row.category, row.companyId);
  if (!copied.length) return null;
  await prisma.gestaoOsWorkOrder.update({
    where: { id: row.id },
    data: { checklistResponses: copied as Prisma.InputJsonValue }
  });
  return copied;
}

export async function loadAssetWarrantyMap(
  ids: string[]
): Promise<Map<string, Date | null>> {
  const map = new Map<string, Date | null>();
  if (!ids.length) return map;
  const found = await prisma.$queryRawUnsafe<{ id: string; warrantyEndsAt: Date | null }[]>(
    `SELECT "id", "warrantyEndsAt" FROM "gestao_os_assets" WHERE "id" IN (${ids
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(',')})`
  );
  for (const row of found) map.set(row.id, row.warrantyEndsAt);
  return map;
}

export async function persistAssetWarranty(
  id: string,
  warrantyEndsAt: Date | null | undefined
): Promise<void> {
  if (warrantyEndsAt === undefined) return;
  const safeId = id.replace(/'/g, "''");
  const value = warrantyEndsAt
    ? `'${warrantyEndsAt.toISOString()}'::timestamp`
    : 'NULL';
  await prisma.$executeRawUnsafe(
    `UPDATE "gestao_os_assets" SET "warrantyEndsAt" = ${value} WHERE "id" = '${safeId}'`
  );
}

export function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value == null || String(value).trim() === '') return null;
  const raw = String(value).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00.000Z`)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function attachWarrantyToLocationTree<
  T extends {
    sectors?: Array<{
      places?: Array<{
        assets?: Array<{ id: string; warrantyEndsAt?: Date | string | null }>;
      }>;
    }>;
  }
>(tree: T[]): Promise<T[]> {
  const ids: string[] = [];
  for (const building of tree) {
    for (const sector of building.sectors ?? []) {
      for (const place of sector.places ?? []) {
        for (const asset of place.assets ?? []) ids.push(asset.id);
      }
    }
  }
  const map = await loadAssetWarrantyMap(ids);
  return tree.map((building) => ({
    ...building,
    sectors: (building.sectors ?? []).map((sector) => ({
      ...sector,
      places: (sector.places ?? []).map((place) => ({
        ...place,
        assets: (place.assets ?? []).map((asset) => ({
          ...asset,
          warrantyEndsAt: map.get(asset.id)?.toISOString() ?? null
        }))
      }))
    }))
  })) as T[];
}
