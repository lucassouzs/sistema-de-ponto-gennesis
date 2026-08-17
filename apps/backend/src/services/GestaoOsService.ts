import {
  GestaoOsMaintenanceType,
  GestaoOsPriority,
  GestaoOsStatus,
  Prisma
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import {
  assertCanTransition,
  assertCanViewWorkOrder,
  GESTAO_OS_ANALISAR_KEY,
  isGestaoOsManager,
  type GestaoOsAccessContext,
  workOrderVisibilityWhere
} from '../lib/gestaoOsAccess';
import { PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { resolveSlaDueAt } from '../lib/gestaoOsSla';
import { notifyGestaoOsEvent } from '../lib/gestaoOsNotify';
import { parseParts, parsePartsLoose } from '../lib/gestaoOsParts';
import { applyExecutionClock } from '../lib/gestaoOsExecution';
import {
  isChecklistEmpty,
  resolveCategoryChecklistResponses,
  attachWarrantyToLocationTree
} from '../lib/gestaoOsChecklistCopy';
import {
  enrichWorkOrderWithExtras,
  gestaoOsOpsService,
  loadWorkOrderExtras
} from './GestaoOsOpsService';

function newAssetQrToken(): string {
  return randomBytes(16).toString('hex');
}

export type GestaoOsAttachment = {
  url: string;
  name: string;
  mimeType?: string;
};

const STATUS_FEED_LABELS: Record<GestaoOsStatus, string> = {
  OPEN: 'Aberta',
  UNDER_REVIEW: 'Em Análise',
  APPROVED: 'Aprovada',
  SAFETY_CHECK: 'Segurança do Trabalho',
  IN_PROGRESS: 'Em Execução',
  WAITING_PARTS: 'Aguardando Peça/Terceiro',
  COMPLETED: 'Concluída',
  REWORK: 'Aguardando ajuste',
  CLOSED: 'Encerrada/Avaliada',
  CANCELLED: 'Cancelada'
};

const STATUS_TRANSITIONS: Record<GestaoOsStatus, GestaoOsStatus[]> = {
  OPEN: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'CANCELLED'],
  SAFETY_CHECK: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_PARTS', 'COMPLETED', 'CANCELLED'],
  WAITING_PARTS: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['REWORK', 'CLOSED', 'CANCELLED'],
  REWORK: ['IN_PROGRESS', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: []
};

type GestaoOsSafetyChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
  required: boolean;
};

const DEFAULT_SAFETY_CHECKLIST: GestaoOsSafetyChecklistItem[] = [
  { id: 'sst-helmet', label: 'Capacete de segurança', checked: false, required: true },
  { id: 'sst-goggles', label: 'Óculos de proteção', checked: false, required: true },
  { id: 'sst-ear', label: 'Protetor auricular (quando aplicável)', checked: false, required: true },
  { id: 'sst-gloves', label: 'Luvas adequadas à atividade', checked: false, required: true },
  { id: 'sst-boots', label: 'Calçado de segurança', checked: false, required: true },
  { id: 'sst-uniform', label: 'Uniforme / vestimenta adequada', checked: false, required: true },
  { id: 'sst-area', label: 'Área isolada / sinalizada quando necessário', checked: false, required: true },
  { id: 'sst-tools', label: 'Ferramentas e equipamentos em condições de uso', checked: false, required: true },
  { id: 'sst-fit', label: 'Estou apto e ciente dos riscos da atividade', checked: false, required: true }
];

function mergeSafetyChecklist(value: unknown): GestaoOsSafetyChecklistItem[] {
  const byId = new Map<string, { checked?: unknown }>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? '').trim();
      if (!id) continue;
      byId.set(id, row);
    }
  }
  return DEFAULT_SAFETY_CHECKLIST.map((item) => ({
    ...item,
    checked: Boolean(byId.get(item.id)?.checked)
  }));
}

function isSafetyChecklistComplete(items: GestaoOsSafetyChecklistItem[]): boolean {
  return items.length > 0 && items.every((item) => item.required === false || item.checked);
}

const workOrderInclude = {
  requester: { select: { id: true, name: true, email: true, cpf: true, profilePhotoUrl: true } },
  assignee: { select: { id: true, name: true, email: true, cpf: true, profilePhotoUrl: true } },
  building: { select: { id: true, name: true } },
  sector: { select: { id: true, name: true } },
  place: { select: { id: true, name: true } },
  asset: { select: { id: true, name: true, category: true, qrToken: true } },
  events: {
    orderBy: { createdAt: 'asc' as const },
    include: { actor: { select: { id: true, name: true } } }
  }
} satisfies Prisma.GestaoOsWorkOrderInclude;

function parsePriority(value: unknown): GestaoOsPriority {
  const raw = String(value ?? 'MEDIUM').toUpperCase();
  if (raw === 'LOW' || raw === 'MEDIUM' || raw === 'HIGH' || raw === 'URGENT') return raw;
  throw createError('Prioridade inválida', 400);
}

function parseMaintenanceType(value: unknown): GestaoOsMaintenanceType | null {
  if (value == null || value === '') return null;
  const raw = String(value).toUpperCase();
  if (raw === 'CORRECTIVE' || raw === 'PREVENTIVE' || raw === 'PREDICTIVE') return raw;
  throw createError('Tipo de manutenção inválido', 400);
}

function parseStatus(value: unknown): GestaoOsStatus {
  const raw = String(value ?? '').toUpperCase();
  if ((Object.keys(STATUS_TRANSITIONS) as string[]).includes(raw)) {
    return raw as GestaoOsStatus;
  }
  throw createError('Status inválido', 400);
}

function parseAttachments(value: unknown): GestaoOsAttachment[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw createError('Anexos inválidos', 400);
  const parsed: GestaoOsAttachment[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const url = String(row.url ?? '').trim();
    const name = String(row.name ?? row.originalName ?? 'anexo').trim() || 'anexo';
    if (!url) continue;
    parsed.push({
      url,
      name,
      mimeType: row.mimeType ? String(row.mimeType) : undefined
    });
  }
  return parsed;
}

async function allocateNextOsNumber(
  db: Prisma.TransactionClient | typeof prisma
): Promise<number> {
  await db.$executeRawUnsafe(`
    INSERT INTO "gestao_os_settings" ("id", "nextOsNumber", "updatedAt")
    VALUES ('default', 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO NOTHING;
  `);
  const settingsRows = await db.$queryRaw<{ nextOsNumber: number }[]>`
    SELECT "nextOsNumber" FROM "gestao_os_settings" WHERE "id" = 'default' LIMIT 1
  `;
  const configuredNext = Number(settingsRows[0]?.nextOsNumber ?? 1);
  const osAgg = await db.$queryRaw<{ max: number | null }[]>`
    SELECT MAX("osNumber")::int AS max FROM "gestao_os_work_orders"
  `;
  const maxOs = Number(osAgg[0]?.max ?? 0);
  const next = Math.max(maxOs + 1, configuredNext);
  await db.$executeRaw`
    UPDATE "gestao_os_settings"
    SET "nextOsNumber" = ${next + 1},
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = 'default'
  `;
  return next;
}

async function attachOsNumbers<T extends { id: string }>(
  rows: T[]
): Promise<Array<T & { osNumber: number | null }>> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const found = await prisma.$queryRawUnsafe<{ id: string; osNumber: number | null }[]>(
    `SELECT "id", "osNumber" FROM "gestao_os_work_orders" WHERE "id" IN (${ids
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(',')})`
  );
  const map = new Map(found.map((r) => [r.id, r.osNumber]));
  return rows.map((row) => ({
    ...row,
    osNumber: map.has(row.id) ? map.get(row.id)! : null
  }));
}

async function persistWorkOrderExtras(
  id: string,
  extras: {
    slaHoursApplied?: number | null;
    slaWarnedAt?: Date | null;
    parts?: unknown;
    relatedWorkOrderId?: string | null;
    startPhotoUrl?: string | null;
    endPhotoUrl?: string | null;
    executionMs?: number | null;
    lastExecutionResumeAt?: Date | null;
  }
) {
  const sets: string[] = [];
  if (extras.slaHoursApplied !== undefined) {
    sets.push(
      `"slaHoursApplied" = ${
        extras.slaHoursApplied == null ? 'NULL' : Number(extras.slaHoursApplied)
      }`
    );
  }
  if (extras.slaWarnedAt !== undefined) {
    sets.push(
      extras.slaWarnedAt
        ? `"slaWarnedAt" = '${extras.slaWarnedAt.toISOString()}'::timestamp`
        : `"slaWarnedAt" = NULL`
    );
  }
  if (extras.parts !== undefined) {
    const json = JSON.stringify(extras.parts ?? []).replace(/'/g, "''");
    sets.push(`"parts" = '${json}'::jsonb`);
  }
  if (extras.relatedWorkOrderId !== undefined) {
    sets.push(
      extras.relatedWorkOrderId
        ? `"relatedWorkOrderId" = '${String(extras.relatedWorkOrderId).replace(/'/g, "''")}'`
        : `"relatedWorkOrderId" = NULL`
    );
  }
  if (extras.startPhotoUrl !== undefined) {
    sets.push(
      extras.startPhotoUrl
        ? `"startPhotoUrl" = '${String(extras.startPhotoUrl).replace(/'/g, "''")}'`
        : `"startPhotoUrl" = NULL`
    );
  }
  if (extras.endPhotoUrl !== undefined) {
    sets.push(
      extras.endPhotoUrl
        ? `"endPhotoUrl" = '${String(extras.endPhotoUrl).replace(/'/g, "''")}'`
        : `"endPhotoUrl" = NULL`
    );
  }
  if (extras.executionMs !== undefined) {
    sets.push(`"executionMs" = ${Math.max(0, Math.round(Number(extras.executionMs) || 0))}`);
  }
  if (extras.lastExecutionResumeAt !== undefined) {
    sets.push(
      extras.lastExecutionResumeAt
        ? `"lastExecutionResumeAt" = '${extras.lastExecutionResumeAt.toISOString()}'::timestamp`
        : `"lastExecutionResumeAt" = NULL`
    );
  }
  if (!sets.length) return;
  await prisma.$executeRawUnsafe(
    `UPDATE "gestao_os_work_orders" SET ${sets.join(', ')} WHERE "id" = '${id.replace(/'/g, "''")}'`
  );
}

async function enrichWorkOrders<
  T extends { id: string; status: GestaoOsStatus; dueAt?: Date | string | null }
>(rows: T[]) {
  const withOs = await attachOsNumbers(rows);
  const extras = await loadWorkOrderExtras(withOs.map((r) => r.id));
  return withOs.map((row) => enrichWorkOrderWithExtras(row, extras.get(row.id)));
}

function notifyPayloadFromWo(wo: {
  displayNumber: number;
  osNumber?: number | null;
  status: GestaoOsStatus;
  locationLabel?: string | null;
  category?: string | null;
  priority?: GestaoOsPriority;
  dueAt?: Date | string | null;
}) {
  const due =
    wo.dueAt == null
      ? null
      : wo.dueAt instanceof Date
        ? wo.dueAt
        : new Date(wo.dueAt);
  return {
    displayNumber: wo.displayNumber,
    osNumber: wo.osNumber ?? null,
    statusLabel: STATUS_FEED_LABELS[wo.status] || wo.status,
    locationLabel: wo.locationLabel,
    category: wo.category,
    priorityLabel: wo.priority || null,
    dueAtLabel: due && !Number.isNaN(due.getTime()) ? due.toLocaleString('pt-BR') : null
  };
}

async function buildLocationLabel(input: {
  buildingId?: string | null;
  sectorId?: string | null;
  placeId?: string | null;
  assetId?: string | null;
}): Promise<string | null> {
  const parts: string[] = [];
  if (input.buildingId) {
    const building = await prisma.gestaoOsBuilding.findUnique({ where: { id: input.buildingId } });
    if (building) parts.push(building.name);
  }
  if (input.sectorId) {
    const sector = await prisma.gestaoOsSector.findUnique({ where: { id: input.sectorId } });
    if (sector) parts.push(sector.name);
  }
  if (input.placeId) {
    const place = await prisma.gestaoOsPlace.findUnique({ where: { id: input.placeId } });
    if (place) parts.push(place.name);
  }
  if (input.assetId) {
    const asset = await prisma.gestaoOsAsset.findUnique({ where: { id: input.assetId } });
    if (asset) parts.push(asset.name);
  }
  return parts.length ? parts.join(' › ') : null;
}

const DEFAULT_TREE = [
  {
    name: 'Sede Administrativa',
    code: 'SEDE',
    sectors: [
      {
        name: 'Administrativo',
        places: [
          {
            name: 'Recepção',
            assets: [
              { name: 'Ar-condicionado receptivo', category: 'Climatização' },
              { name: 'Iluminação geral', category: 'Elétrica' }
            ]
          },
          {
            name: 'Sala de reuniões',
            assets: [{ name: 'Projetor', category: 'TI' }]
          }
        ]
      },
      {
        name: 'Operações',
        places: [
          {
            name: 'Almoxarifado',
            assets: [{ name: 'Porta de acesso', category: 'Civil' }]
          }
        ]
      }
    ]
  },
  {
    name: 'Prédio Técnico',
    code: 'TEC',
    sectors: [
      {
        name: 'Manutenção',
        places: [
          {
            name: 'Casa de máquinas',
            assets: [
              { name: 'Bombas hidráulicas', category: 'Hidráulica' },
              { name: 'Quadro elétrico', category: 'Elétrica' }
            ]
          }
        ]
      }
    ]
  }
] as const;

const DEFAULT_CATEGORIES = [
  { name: 'Ar-condicionado / Climatização', code: 'HVAC' },
  { name: 'Iluminação', code: 'ILUM' },
  { name: 'Hidráulica', code: 'HIDRO' },
  { name: 'Automação', code: 'AUTO' },
  { name: 'Energia elétrica', code: 'ELET' },
  { name: 'Elevadores', code: 'ELEV' },
  { name: 'Bombas e motores', code: 'BOMB' },
  { name: 'Civil / Estruturas', code: 'CIVIL' },
  { name: 'Segurança do trabalho', code: 'SST' },
  { name: 'TI / Dados', code: 'TI' }
] as const;

export class GestaoOsService {
  async ensureDefaultCategories(companyId?: string | null) {
    for (const cat of DEFAULT_CATEGORIES) {
      const existing = await prisma.gestaoOsServiceCategory.findFirst({
        where: {
          name: cat.name,
          ...(companyId ? { companyId } : { companyId: null })
        }
      });
      if (existing) continue;
      await prisma.gestaoOsServiceCategory.create({
        data: {
          name: cat.name,
          code: cat.code,
          companyId: companyId || null,
          description: 'Categoria padrão do módulo de manutenção predial'
        }
      });
    }
  }

  async ensureDefaultLocations(companyId?: string | null) {
    const count = await prisma.gestaoOsBuilding.count({
      where: companyId ? { companyId } : undefined
    });
    if (count > 0) {
      await this.ensureDefaultCategories(companyId);
      return;
    }

    for (const buildingDef of DEFAULT_TREE) {
      await prisma.gestaoOsBuilding.create({
        data: {
          name: buildingDef.name,
          code: buildingDef.code,
          companyId: companyId || null,
          sectors: {
            create: buildingDef.sectors.map((sector) => ({
              name: sector.name,
              places: {
                create: sector.places.map((place) => ({
                  name: place.name,
                  assets: {
                    create: place.assets.map((asset) => ({
                      name: asset.name,
                      category: asset.category,
                      qrToken: newAssetQrToken()
                    }))
                  }
                }))
              }
            }))
          }
        }
      });
    }
    await this.ensureDefaultCategories(companyId);
  }

  async getLocationTree(companyId?: string | null) {
    await this.ensureDefaultLocations(companyId);
    const tree = await prisma.gestaoOsBuilding.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {})
      },
      orderBy: { name: 'asc' },
      include: {
        sectors: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          include: {
            places: {
              where: { isActive: true },
              orderBy: { name: 'asc' },
              include: {
                assets: {
                  where: { isActive: true },
                  orderBy: { name: 'asc' }
                }
              }
            }
          }
        }
      }
    });
    return attachWarrantyToLocationTree(tree);
  }

  async list(
    params: {
      search?: string;
      status?: string;
      priority?: string;
      requesterId?: string;
      assigneeId?: string;
      buildingId?: string;
      overdue?: boolean;
      limit?: number;
    },
    access: GestaoOsAccessContext
  ) {
    const visibility = workOrderVisibilityWhere(access) as Prisma.GestaoOsWorkOrderWhereInput;
    const where: Prisma.GestaoOsWorkOrderWhereInput = { ...visibility };

    if (params.overdue) {
      where.dueAt = { lt: new Date() };
      where.status = {
        in: [
          'OPEN',
          'UNDER_REVIEW',
          'APPROVED',
          'SAFETY_CHECK',
          'IN_PROGRESS',
          'WAITING_PARTS',
          'REWORK'
        ]
      };
    } else if (params.status) {
      where.status = parseStatus(params.status);
    }
    if (params.priority) where.priority = parsePriority(params.priority);
    if (params.requesterId) where.requesterId = params.requesterId;
    if (params.assigneeId) where.assigneeId = params.assigneeId;
    if (params.buildingId) where.buildingId = params.buildingId;

    const search = params.search?.trim();
    if (search) {
      const asNumber = Number(search.replace(/\D/g, ''));
      const numberFilters: Prisma.GestaoOsWorkOrderWhereInput[] = [];
      if (Number.isFinite(asNumber) && asNumber > 0) {
        numberFilters.push({ displayNumber: asNumber });
        const byOs = await prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT "id" FROM "gestao_os_work_orders" WHERE "osNumber" = ${asNumber}`
        );
        if (byOs.length) numberFilters.push({ id: { in: byOs.map((r) => r.id) } });
      }
      where.OR = [
        { category: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { locationLabel: { contains: search, mode: 'insensitive' } },
        { providerName: { contains: search, mode: 'insensitive' } },
        ...numberFilters
      ];
    }

    const rows = await prisma.gestaoOsWorkOrder.findMany({
      where,
      include: workOrderInclude,
      orderBy: [{ openedAt: 'desc' }, { displayNumber: 'desc' }],
      take: params.limit && params.limit > 0 ? Math.min(params.limit, 500) : 200
    });
    return enrichWorkOrders(rows);
  }

  async getById(id: string, _access?: GestaoOsAccessContext) {
    const row = await prisma.gestaoOsWorkOrder.findUnique({
      where: { id },
      include: workOrderInclude
    });
    if (!row) throw createError('Chamado não encontrado', 404);
    const [enriched] = await enrichWorkOrders([row]);
    let recurrence90dCount = 0;
    if (row.assetId) {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      recurrence90dCount = await prisma.gestaoOsWorkOrder.count({
        where: {
          assetId: row.assetId,
          openedAt: { gte: since },
          status: { not: 'CANCELLED' }
        }
      });
    }
    return { ...enriched, recurrence90dCount };
  }

  async listTechnicians(companyId?: string | null) {
    const userSelect = {
      id: true,
      name: true,
      email: true,
      cpf: true,
      profilePhotoUrl: true,
      isActive: true,
      employee: { select: { position: true } }
    } as const;

    const toTechnician = (user: {
      id: string;
      name: string;
      email: string;
      cpf: string;
      profilePhotoUrl: string | null;
      employee: { position: string } | null;
    }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      cpf: user.cpf,
      profilePhotoUrl: user.profilePhotoUrl,
      position: user.employee?.position ?? null
    });

    const isAssignableTechnician = (user: {
      name: string;
      email: string;
      employee: { position: string } | null;
    }) => {
      const name = user.name.trim().toLowerCase();
      const email = user.email.trim().toLowerCase();
      const position = (user.employee?.position || '').trim().toLowerCase();
      if (name === 'administrador' || position === 'administrador') return false;
      if (name === 'gennecy' || email.startsWith('gennecy-bot@') || email.includes('gennecy-bot')) {
        return false;
      }
      return true;
    };

    if (companyId) {
      const members = await prisma.gestaoOsMembership.findMany({
        where: {
          companyId,
          isActive: true,
          profile: { in: ['TECHNICIAN', 'MANAGER', 'ADMIN'] }
        },
        include: { user: { select: userSelect } },
        take: 300
      });
      return members
        .filter((m) => m.user.isActive && m.user.employee && isAssignableTechnician(m.user))
        .map((m) => toTechnician(m.user));
    }

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        employee: { isNot: null }
      },
      select: userSelect,
      orderBy: { name: 'asc' },
      take: 300
    });
    return users.filter(isAssignableTechnician).map(toTechnician);
  }

  async create(
    input: {
      requesterId: string;
      category: string;
      description: string;
      priority?: unknown;
      buildingId?: string | null;
      sectorId?: string | null;
      placeId?: string | null;
      assetId?: string | null;
      attachments?: unknown;
      companyId?: string | null;
      dueAt?: string | null;
      maintenanceType?: unknown;
      relatedWorkOrderId?: string | null;
      autoAssign?: boolean;
    },
    access: GestaoOsAccessContext
  ) {
    const category = String(input.category ?? '').trim();
    const description = String(input.description ?? '').trim();
    if (!category) throw createError('Informe a categoria/tipo de serviço', 400);
    if (!description) throw createError('Informe a descrição do problema', 400);
    if (!input.buildingId) throw createError('Selecione o prédio', 400);
    if (!input.sectorId) throw createError('Selecione o andar', 400);
    if (!input.placeId) throw createError('Selecione o local', 400);

    const companyId = input.companyId || access.companyId || null;
    const priority = parsePriority(input.priority);

    const locationLabel = await buildLocationLabel({
      buildingId: input.buildingId,
      sectorId: input.sectorId,
      placeId: input.placeId,
      assetId: input.assetId
    });

    const attachments = parseAttachments(input.attachments) ?? [];
    const sla = await resolveSlaDueAt({
      priority,
      assetId: input.assetId,
      explicitDueAt: input.dueAt
    });
    const checklistResponses = await resolveCategoryChecklistResponses(category, companyId);

    let relatedWorkOrderId: string | null = null;
    if (input.relatedWorkOrderId) {
      const related = await prisma.gestaoOsWorkOrder.findUnique({
        where: { id: String(input.relatedWorkOrderId) },
        select: { id: true }
      });
      if (!related) throw createError('Chamado relacionado não encontrado', 400);
      relatedWorkOrderId = related.id;
    } else if (input.assetId) {
      // Sugestão automática de reincidência: último chamado aberto/fechado do mesmo ativo.
      const prev = await prisma.gestaoOsWorkOrder.findFirst({
        where: {
          assetId: input.assetId,
          status: { in: ['COMPLETED', 'CLOSED', 'IN_PROGRESS', 'WAITING_PARTS', 'REWORK'] }
        },
        orderBy: { openedAt: 'desc' },
        select: { id: true }
      });
      relatedWorkOrderId = prev?.id ?? null;
    }

    let assigneeId: string | null = null;
    if (input.autoAssign) {
      const suggested = await gestaoOsOpsService.suggestAssignee(access, {
        buildingId: input.buildingId,
        category
      });
      assigneeId = suggested?.id ?? null;
    }

    const created = await prisma.$transaction(async (tx) => {
      const agg = await tx.gestaoOsWorkOrder.aggregate({ _max: { displayNumber: true } });
      const displayNumber = (agg._max.displayNumber ?? 0) + 1;

      return tx.gestaoOsWorkOrder.create({
        data: {
          displayNumber,
          companyId: companyId || null,
          status: GestaoOsStatus.OPEN,
          priority,
          maintenanceType: parseMaintenanceType(input.maintenanceType),
          category,
          description,
          buildingId: input.buildingId || null,
          sectorId: input.sectorId || null,
          placeId: input.placeId || null,
          assetId: input.assetId || null,
          locationLabel,
          requesterId: input.requesterId,
          assigneeId,
          dueAt: sla.dueAt,
          attachments: attachments as Prisma.InputJsonValue,
          ...(checklistResponses.length
            ? { checklistResponses: checklistResponses as Prisma.InputJsonValue }
            : {}),
          events: {
            create: {
              toStatus: GestaoOsStatus.OPEN,
              note: `Chamado aberto · SLA ${sla.slaHoursApplied}h (${sla.source})`,
              actorId: input.requesterId
            }
          }
        },
        include: workOrderInclude
      });
    });

    await persistWorkOrderExtras(created.id, {
      slaHoursApplied: sla.slaHoursApplied,
      relatedWorkOrderId
    });

    const enriched = await this.getById(created.id, access);

    const requester = await prisma.user.findUnique({
      where: { id: input.requesterId },
      select: { email: true, name: true }
    });
    const analysts = await prisma.user.findMany({
      where: {
        isActive: true,
        userPermissions: {
          some: {
            module: GESTAO_OS_ANALISAR_KEY,
            action: PERMISSION_ACCESS_ACTION,
            allowed: true
          }
        }
      },
      select: { email: true, name: true },
      take: 40
    });
    notifyGestaoOsEvent('opened', notifyPayloadFromWo(enriched), [
      ...(requester ? [requester] : []),
      ...analysts
    ]);
    if (assigneeId) {
      const assignee = await prisma.user.findUnique({
        where: { id: assigneeId },
        select: { email: true, name: true }
      });
      if (assignee) {
        notifyGestaoOsEvent('assigned', notifyPayloadFromWo(enriched), [assignee]);
      }
    }

    return enriched;
  }

  async update(
    id: string,
    actorId: string,
    input: {
      priority?: unknown;
      maintenanceType?: unknown;
      assigneeId?: string | null;
      providerName?: string | null;
      category?: string;
      description?: string;
      attachments?: unknown;
      completionNote?: string | null;
      dueAt?: string | null;
      checklistResponses?: unknown;
      safetyChecklistResponses?: unknown;
      safetyPhotoUrl?: string | null;
      signatureRequesterUrl?: string | null;
      signatureTechnicianUrl?: string | null;
      parts?: unknown;
      relatedWorkOrderId?: string | null;
      startPhotoUrl?: string | null;
      endPhotoUrl?: string | null;
      autoAssign?: boolean;
    },
    access: GestaoOsAccessContext
  ) {
    const current = await this.getById(id, access);
    if (current.status === 'CLOSED' || current.status === 'CANCELLED') {
      throw createError('OS encerrada ou cancelada não pode ser editada', 400);
    }
    if (
      !isGestaoOsManager(access) &&
      !access.canExecutar &&
      current.assigneeId !== actorId &&
      current.requesterId !== actorId
    ) {
      throw createError('Sem permissão para editar esta OS', 403);
    }

    const data: Prisma.GestaoOsWorkOrderUpdateInput = {};
    if (input.priority != null) data.priority = parsePriority(input.priority);
    if (input.maintenanceType !== undefined) {
      data.maintenanceType = parseMaintenanceType(input.maintenanceType);
    }
    let nextAssigneeId: string | null | undefined = undefined;
    if (input.autoAssign) {
      const suggested = await gestaoOsOpsService.suggestAssignee(access, {
        buildingId: current.buildingId,
        category: input.category ?? current.category
      });
      nextAssigneeId = suggested?.id ?? null;
      data.assignee = nextAssigneeId
        ? { connect: { id: nextAssigneeId } }
        : { disconnect: true };
    } else if (input.assigneeId !== undefined) {
      nextAssigneeId = input.assigneeId ? String(input.assigneeId) : null;
      data.assignee = nextAssigneeId
        ? { connect: { id: nextAssigneeId } }
        : { disconnect: true };
    }
    if (input.providerName !== undefined) {
      data.providerName = input.providerName ? String(input.providerName).trim() : null;
    }
    if (input.category != null) {
      const category = String(input.category).trim();
      if (!category) throw createError('Categoria inválida', 400);
      data.category = category;
    }
    if (input.description != null) {
      const description = String(input.description).trim();
      if (!description) throw createError('Descrição inválida', 400);
      data.description = description;
    }
    if (input.attachments !== undefined) {
      data.attachments = (parseAttachments(input.attachments) ?? []) as Prisma.InputJsonValue;
    }
    if (input.completionNote !== undefined) {
      data.completionNote = input.completionNote ? String(input.completionNote).trim() : null;
    }
    if (input.dueAt !== undefined) {
      const d = input.dueAt ? new Date(input.dueAt) : null;
      data.dueAt = d && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (input.checklistResponses !== undefined) {
      data.checklistResponses = (input.checklistResponses ?? null) as Prisma.InputJsonValue;
    }
    if (input.safetyChecklistResponses !== undefined) {
      data.safetyChecklistResponses = mergeSafetyChecklist(
        input.safetyChecklistResponses
      ) as Prisma.InputJsonValue;
    }
    if (input.safetyPhotoUrl !== undefined) {
      data.safetyPhotoUrl = input.safetyPhotoUrl ? String(input.safetyPhotoUrl).trim() : null;
    }
    if (input.signatureRequesterUrl !== undefined) {
      data.signatureRequesterUrl = input.signatureRequesterUrl
        ? String(input.signatureRequesterUrl).trim()
        : null;
    }
    if (input.signatureTechnicianUrl !== undefined) {
      data.signatureTechnicianUrl = input.signatureTechnicianUrl
        ? String(input.signatureTechnicianUrl).trim()
        : null;
    }

    await prisma.gestaoOsWorkOrder.update({
      where: { id },
      data,
      include: workOrderInclude
    });

    const extras: Parameters<typeof persistWorkOrderExtras>[1] = {};
    if (input.parts !== undefined) extras.parts = parseParts(input.parts);
    if (input.relatedWorkOrderId !== undefined) {
      extras.relatedWorkOrderId = input.relatedWorkOrderId
        ? String(input.relatedWorkOrderId)
        : null;
    }
    if (input.startPhotoUrl !== undefined) {
      extras.startPhotoUrl = input.startPhotoUrl ? String(input.startPhotoUrl).trim() : null;
    }
    if (input.endPhotoUrl !== undefined) {
      extras.endPhotoUrl = input.endPhotoUrl ? String(input.endPhotoUrl).trim() : null;
    }
    if (Object.keys(extras).length) await persistWorkOrderExtras(id, extras);

    const enriched = await this.getById(id, access);
    if (nextAssigneeId && nextAssigneeId !== current.assigneeId) {
      const assignee = await prisma.user.findUnique({
        where: { id: nextAssigneeId },
        select: { email: true, name: true }
      });
      if (assignee) {
        notifyGestaoOsEvent('assigned', notifyPayloadFromWo(enriched), [assignee]);
      }
    }
    if (input.parts !== undefined) {
      notifyGestaoOsEvent(
        'parts',
        notifyPayloadFromWo(enriched),
        [enriched.requester, enriched.assignee].filter(Boolean) as Array<{
          email?: string | null;
          name?: string | null;
        }>
      );
    }

    void actorId;
    return enriched;
  }

  async transitionStatus(
    id: string,
    actorId: string,
    input: {
      status: unknown;
      note?: string | null;
      cancelReason?: string | null;
      priority?: unknown;
      maintenanceType?: unknown;
      assigneeId?: string | null;
      providerName?: string | null;
      completionNote?: string | null;
      rating?: number | null;
      ratingComment?: string | null;
      attachments?: unknown;
      checklistResponses?: unknown;
      signatureRequesterUrl?: string | null;
      signatureTechnicianUrl?: string | null;
      dueAt?: string | null;
      safetyChecklistResponses?: unknown;
      safetyPhotoUrl?: string | null;
      parts?: unknown;
      startPhotoUrl?: string | null;
      endPhotoUrl?: string | null;
      autoAssign?: boolean;
      relatedWorkOrderId?: string | null;
    },
    access: GestaoOsAccessContext
  ) {
    const current = await this.getById(id, access);
    const nextStatus = parseStatus(input.status);
    const allowed = STATUS_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw createError(
        `Transição inválida: ${current.status} → ${nextStatus}`,
        400
      );
    }

    assertCanTransition(access, current.status, nextStatus, {
      requesterId: current.requesterId,
      assigneeId: current.assigneeId,
      companyId: current.companyId
    });

    if (nextStatus === 'CANCELLED') {
      const reason = String(input.cancelReason ?? '').trim();
      if (!reason) throw createError('Informe a justificativa do cancelamento', 400);
    }

    if (nextStatus === 'REWORK') {
      const reason = String(input.note ?? '').trim();
      if (!reason) throw createError('Informe o que precisa ser ajustado', 400);
    }

    if (nextStatus === 'APPROVED') {
      if (!input.maintenanceType && !current.maintenanceType) {
        throw createError('Defina o tipo de manutenção ao aprovar a OS', 400);
      }
    }

    const startPhoto = String(
      input.startPhotoUrl !== undefined
        ? input.startPhotoUrl ?? ''
        : (current as { startPhotoUrl?: string | null }).startPhotoUrl ?? ''
    ).trim();
    const endPhoto = String(
      input.endPhotoUrl !== undefined
        ? input.endPhotoUrl ?? ''
        : (current as { endPhotoUrl?: string | null }).endPhotoUrl ?? ''
    ).trim();

    if (
      (current.status === 'APPROVED' || current.status === 'SAFETY_CHECK') &&
      nextStatus === 'IN_PROGRESS'
    ) {
      const safetyItems = mergeSafetyChecklist(
        input.safetyChecklistResponses !== undefined
          ? input.safetyChecklistResponses
          : current.safetyChecklistResponses
      );
      const photo = String(
        input.safetyPhotoUrl !== undefined
          ? input.safetyPhotoUrl ?? ''
          : current.safetyPhotoUrl ?? ''
      ).trim();
      if (!isSafetyChecklistComplete(safetyItems)) {
        throw createError(
          'Preencha o checklist de segurança do trabalho antes de iniciar a execução',
          400
        );
      }
      if (!photo) {
        throw createError(
          'Envie uma foto usando os equipamentos de proteção antes de iniciar a execução',
          400
        );
      }
      if (!startPhoto) {
        throw createError('Envie a foto de início do serviço antes de iniciar a execução', 400);
      }
    }

    if (nextStatus === 'COMPLETED' && !endPhoto) {
      throw createError('Envie a foto de conclusão do serviço antes de concluir', 400);
    }

    if (nextStatus === 'WAITING_PARTS') {
      const parts =
        input.parts !== undefined
          ? parseParts(input.parts)
          : parsePartsLoose((current as { parts?: unknown }).parts ?? []);
      if (!parts.length) {
        throw createError(
          'Informe ao menos uma peça/material (nome, fornecedor, valor ou previsão) ao aguardar peça',
          400
        );
      }
    }

    if (nextStatus === 'CLOSED') {
      const rating = input.rating != null ? Number(input.rating) : current.rating;
      if (rating != null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
        throw createError('Avaliação deve ser entre 1 e 5', 400);
      }
    }

    const now = new Date();
    const data: Prisma.GestaoOsWorkOrderUpdateInput = {
      status: nextStatus
    };

    // Na primeira análise (Em Análise), o chamado vira OS e recebe o número da OS.
    let createdOsNumber: number | null = null;
    if (current.status === 'OPEN' && nextStatus === 'UNDER_REVIEW') {
      const existingOs = await prisma.$queryRaw<{ osNumber: number | null }[]>`
        SELECT "osNumber" FROM "gestao_os_work_orders" WHERE "id" = ${id} LIMIT 1
      `;
      if (existingOs[0]?.osNumber == null) {
        createdOsNumber = await allocateNextOsNumber(prisma);
      }
    }

    if (input.priority != null) data.priority = parsePriority(input.priority);
    if (input.maintenanceType !== undefined) {
      data.maintenanceType = parseMaintenanceType(input.maintenanceType);
    }

    let assignedId: string | null | undefined = undefined;
    if (input.autoAssign && !input.assigneeId) {
      const suggested = await gestaoOsOpsService.suggestAssignee(access, {
        buildingId: current.buildingId,
        category: current.category
      });
      assignedId = suggested?.id ?? null;
      data.assignee = assignedId ? { connect: { id: assignedId } } : { disconnect: true };
    } else if (input.assigneeId !== undefined) {
      assignedId = input.assigneeId ? String(input.assigneeId) : null;
      data.assignee = assignedId
        ? { connect: { id: assignedId } }
        : { disconnect: true };
    }

    if (input.providerName !== undefined) {
      data.providerName = input.providerName ? String(input.providerName).trim() : null;
    }
    if (input.completionNote !== undefined) {
      data.completionNote = input.completionNote ? String(input.completionNote).trim() : null;
    }
    if (input.attachments !== undefined) {
      const incoming = parseAttachments(input.attachments) ?? [];
      const existing = Array.isArray(current.attachments)
        ? (current.attachments as GestaoOsAttachment[])
        : [];
      data.attachments = [...existing, ...incoming] as Prisma.InputJsonValue;
    }
    if (input.checklistResponses !== undefined) {
      data.checklistResponses = (input.checklistResponses ?? null) as Prisma.InputJsonValue;
    } else if (
      nextStatus === 'APPROVED' &&
      isChecklistEmpty(current.checklistResponses)
    ) {
      const copied = await resolveCategoryChecklistResponses(
        String(current.category || ''),
        current.companyId
      );
      if (copied.length) {
        data.checklistResponses = copied as Prisma.InputJsonValue;
      }
    }
    if (input.safetyChecklistResponses !== undefined || nextStatus === 'APPROVED') {
      data.safetyChecklistResponses = mergeSafetyChecklist(
        input.safetyChecklistResponses !== undefined
          ? input.safetyChecklistResponses
          : current.safetyChecklistResponses
      ) as Prisma.InputJsonValue;
    }
    if (input.safetyPhotoUrl !== undefined) {
      data.safetyPhotoUrl = input.safetyPhotoUrl ? String(input.safetyPhotoUrl).trim() : null;
    }
    if (
      (current.status === 'APPROVED' || current.status === 'SAFETY_CHECK') &&
      nextStatus === 'IN_PROGRESS'
    ) {
      data.safetyChecklistResponses = mergeSafetyChecklist(
        input.safetyChecklistResponses !== undefined
          ? input.safetyChecklistResponses
          : current.safetyChecklistResponses
      ) as Prisma.InputJsonValue;
      const photo = String(
        input.safetyPhotoUrl !== undefined
          ? input.safetyPhotoUrl ?? ''
          : current.safetyPhotoUrl ?? ''
      ).trim();
      data.safetyPhotoUrl = photo || null;
    }
    if (input.signatureRequesterUrl !== undefined) {
      data.signatureRequesterUrl = input.signatureRequesterUrl
        ? String(input.signatureRequesterUrl).trim()
        : null;
    }
    if (input.signatureTechnicianUrl !== undefined) {
      data.signatureTechnicianUrl = input.signatureTechnicianUrl
        ? String(input.signatureTechnicianUrl).trim()
        : null;
    }

    let slaHoursToPersist: number | null | undefined = undefined;
    if (input.dueAt !== undefined) {
      const d = input.dueAt ? new Date(input.dueAt) : null;
      data.dueAt = d && !Number.isNaN(d.getTime()) ? d : null;
    } else if (nextStatus === 'APPROVED' && !current.dueAt) {
      const sla = await resolveSlaDueAt({
        priority: (input.priority != null
          ? parsePriority(input.priority)
          : current.priority) as GestaoOsPriority,
        assetId: current.assetId,
        from: now
      });
      data.dueAt = sla.dueAt;
      slaHoursToPersist = sla.slaHoursApplied;
    }

    if (nextStatus === 'APPROVED') data.approvedAt = now;
    const clock = applyExecutionClock({
      currentStatus: current.status,
      nextStatus,
      now,
      startedAt: current.startedAt,
      executionMs: (current as { executionMs?: number | null }).executionMs,
      lastExecutionResumeAt: (current as { lastExecutionResumeAt?: string | null })
        .lastExecutionResumeAt
    });
    if (clock.startedAt) data.startedAt = clock.startedAt;
    if (current.status === 'REWORK' && nextStatus === 'IN_PROGRESS') {
      data.completedAt = null;
    }
    if (nextStatus === 'COMPLETED') data.completedAt = now;
    if (nextStatus === 'CLOSED') {
      data.closedAt = now;
      if (input.rating != null) data.rating = Number(input.rating);
      if (input.ratingComment !== undefined) {
        data.ratingComment = input.ratingComment ? String(input.ratingComment).trim() : null;
      }
    }
    if (nextStatus === 'CANCELLED') {
      data.cancelledAt = now;
      data.cancelReason = String(input.cancelReason).trim();
    }

    const noteParts: string[] = [];
    const noteText = String(input.note ?? '').trim();
    if (noteText) noteParts.push(noteText);
    if (nextStatus === 'CANCELLED') {
      noteParts.push(String(input.cancelReason).trim());
    }
    if (createdOsNumber != null) {
      noteParts.push(`OS #${createdOsNumber} criada a partir do chamado`);
    }
    if (slaHoursToPersist != null) {
      noteParts.push(`SLA ${slaHoursToPersist}h definido na aprovação`);
    }
    const note = noteParts.filter(Boolean).join(' · ') || null;

    // Atribui o número da OS antes do update de status (coluna via SQL).
    if (createdOsNumber != null) {
      await prisma.$executeRaw`
        UPDATE "gestao_os_work_orders"
        SET "osNumber" = ${createdOsNumber}
        WHERE "id" = ${id}
      `;
    }

    await prisma.gestaoOsWorkOrder.update({
      where: { id },
      data: {
        ...data,
        events: {
          create: {
            fromStatus: current.status,
            toStatus: nextStatus,
            note,
            actorId
          }
        }
      },
      include: workOrderInclude
    });

    const extras: Parameters<typeof persistWorkOrderExtras>[1] = {};
    if (slaHoursToPersist !== undefined) extras.slaHoursApplied = slaHoursToPersist;
    if (input.parts !== undefined) extras.parts = parseParts(input.parts);
    if (input.startPhotoUrl !== undefined || (nextStatus === 'IN_PROGRESS' && startPhoto)) {
      extras.startPhotoUrl = startPhoto || null;
    }
    if (input.endPhotoUrl !== undefined || (nextStatus === 'COMPLETED' && endPhoto)) {
      extras.endPhotoUrl = endPhoto || null;
    }
    if (input.relatedWorkOrderId !== undefined) {
      extras.relatedWorkOrderId = input.relatedWorkOrderId
        ? String(input.relatedWorkOrderId)
        : null;
    }
    extras.executionMs = clock.executionMs;
    extras.lastExecutionResumeAt = clock.lastExecutionResumeAt;
    if (Object.keys(extras).length) await persistWorkOrderExtras(id, extras);

    const enriched = await this.getById(id, access);
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true, email: true }
    });
    notifyGestaoOsEvent(
      'status',
      {
        ...notifyPayloadFromWo(enriched),
        actorName: actor?.name,
        note
      },
      [enriched.requester, enriched.assignee].filter(Boolean) as Array<{
        email?: string | null;
        name?: string | null;
      }>
    );
    if (assignedId && assignedId !== current.assigneeId) {
      const assignee = await prisma.user.findUnique({
        where: { id: assignedId },
        select: { email: true, name: true }
      });
      if (assignee) {
        notifyGestaoOsEvent('assigned', notifyPayloadFromWo(enriched), [assignee]);
      }
    }

    return enriched;
  }

  async summary(access: GestaoOsAccessContext) {
    const visibility = workOrderVisibilityWhere(access) as Prisma.GestaoOsWorkOrderWhereInput;
    const groups = await prisma.gestaoOsWorkOrder.groupBy({
      by: ['status'],
      where: visibility,
      _count: { _all: true }
    });
    const byStatus = Object.fromEntries(
      groups.map((g) => [g.status, g._count._all])
    ) as Partial<Record<GestaoOsStatus, number>>;
    const openLike =
      (byStatus.OPEN ?? 0) +
      (byStatus.UNDER_REVIEW ?? 0) +
      (byStatus.APPROVED ?? 0) +
      (byStatus.SAFETY_CHECK ?? 0) +
      (byStatus.IN_PROGRESS ?? 0) +
      (byStatus.WAITING_PARTS ?? 0) +
      (byStatus.REWORK ?? 0);
    const overdue = await prisma.gestaoOsWorkOrder.count({
      where: {
        ...visibility,
        dueAt: { lt: new Date() },
        status: { notIn: ['CLOSED', 'CANCELLED', 'COMPLETED'] }
      }
    });
    return {
      byStatus,
      openLike,
      overdue,
      total: groups.reduce((s, g) => s + g._count._all, 0)
    };
  }

  async listComments(workOrderId: string, access: GestaoOsAccessContext) {
    const row = await prisma.gestaoOsWorkOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        requesterId: true,
        assigneeId: true,
        events: {
          orderBy: { createdAt: 'asc' as const },
          include: { actor: { select: { id: true, name: true, profilePhotoUrl: true } } }
        },
        comments: {
          orderBy: { createdAt: 'asc' as const },
          include: { author: { select: { id: true, name: true, profilePhotoUrl: true } } }
        }
      }
    });
    if (!row) throw createError('Chamado não encontrado', 404);
    assertCanViewWorkOrder(access, row);

    type Author = { id: string; name: string; profilePhotoUrl?: string | null };
    type FeedItem = {
      id: string;
      kind: 'comment' | 'system';
      content: string;
      createdAt: string;
      author: Author | null;
    };

    const feed: FeedItem[] = [];

    for (const event of row.events) {
      const who = event.actor?.name || 'Sistema';
      const to = STATUS_FEED_LABELS[event.toStatus];
      const from = event.fromStatus ? STATUS_FEED_LABELS[event.fromStatus] : null;
      const line = from
        ? `${who} alterou de ${from} para ${to}`
        : `${who} abriu o chamado`;
      feed.push({
        id: `sys-event-${event.id}`,
        kind: 'system',
        content: event.note?.trim() && event.note.trim() !== 'Chamado aberto'
          ? `${line}. ${event.note.trim()}`
          : line,
        createdAt: event.createdAt.toISOString(),
        author: event.actor
          ? {
              id: event.actor.id,
              name: event.actor.name,
              profilePhotoUrl: event.actor.profilePhotoUrl
            }
          : null
      });
    }

    for (const comment of row.comments) {
      feed.push({
        id: comment.id,
        kind: 'comment',
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
        author: {
          id: comment.author.id,
          name: comment.author.name,
          profilePhotoUrl: comment.author.profilePhotoUrl
        }
      });
    }

    feed.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return feed;
  }

  async createComment(workOrderId: string, userId: string, content: string, access: GestaoOsAccessContext) {
    const text = content.trim();
    if (!text) throw createError('Escreva um comentário', 400);
    if (text.length > 4000) throw createError('Comentário muito longo (máx. 4000 caracteres)', 400);

    const row = await prisma.gestaoOsWorkOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, requesterId: true, assigneeId: true }
    });
    if (!row) throw createError('Chamado não encontrado', 404);
    assertCanViewWorkOrder(access, row);

    const comment = await prisma.gestaoOsWorkOrderComment.create({
      data: {
        workOrderId,
        userId,
        content: text
      },
      include: {
        author: { select: { id: true, name: true, profilePhotoUrl: true } }
      }
    });

    return {
      id: comment.id,
      kind: 'comment' as const,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      author: {
        id: comment.author.id,
        name: comment.author.name,
        profilePhotoUrl: comment.author.profilePhotoUrl
      }
    };
  }

  async deleteComment(commentId: string, userId: string, isAdmin: boolean) {
    const comment = await prisma.gestaoOsWorkOrderComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true }
    });
    if (!comment) throw createError('Comentário não encontrado', 404);
    if (!isAdmin && comment.userId !== userId) {
      throw createError('Sem permissão para excluir este comentário', 403);
    }
    await prisma.gestaoOsWorkOrderComment.delete({ where: { id: commentId } });
  }
}

export const gestaoOsService = new GestaoOsService();
