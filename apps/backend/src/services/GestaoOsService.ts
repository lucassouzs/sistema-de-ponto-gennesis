import {
  GestaoOsMaintenanceType,
  GestaoOsPriority,
  GestaoOsStatus,
  Prisma
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

function newAssetQrToken(): string {
  return randomBytes(16).toString('hex');
}

export type GestaoOsAttachment = {
  url: string;
  name: string;
  mimeType?: string;
};

const STATUS_TRANSITIONS: Record<GestaoOsStatus, GestaoOsStatus[]> = {
  OPEN: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_PARTS', 'COMPLETED', 'CANCELLED'],
  WAITING_PARTS: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['CLOSED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: []
};

const workOrderInclude = {
  requester: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
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

export class GestaoOsService {
  async ensureDefaultLocations() {
    const count = await prisma.gestaoOsBuilding.count();
    if (count > 0) return;

    for (const buildingDef of DEFAULT_TREE) {
      await prisma.gestaoOsBuilding.create({
        data: {
          name: buildingDef.name,
          code: buildingDef.code,
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
  }

  async getLocationTree() {
    await this.ensureDefaultLocations();
    return prisma.gestaoOsBuilding.findMany({
      where: { isActive: true },
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
  }

  async list(params: {
    search?: string;
    status?: string;
    priority?: string;
    requesterId?: string;
    assigneeId?: string;
    limit?: number;
  }) {
    const where: Prisma.GestaoOsWorkOrderWhereInput = {};

    if (params.status) where.status = parseStatus(params.status);
    if (params.priority) where.priority = parsePriority(params.priority);
    if (params.requesterId) where.requesterId = params.requesterId;
    if (params.assigneeId) where.assigneeId = params.assigneeId;

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
    return attachOsNumbers(rows);
  }

  async getById(id: string) {
    const row = await prisma.gestaoOsWorkOrder.findUnique({
      where: { id },
      include: workOrderInclude
    });
    if (!row) throw createError('Chamado não encontrado', 404);
    const [enriched] = await attachOsNumbers([row]);
    return enriched;
  }

  async listTechnicians() {
    return prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
      take: 300
    });
  }

  async create(input: {
    requesterId: string;
    category: string;
    description: string;
    priority?: unknown;
    buildingId?: string | null;
    sectorId?: string | null;
    placeId?: string | null;
    assetId?: string | null;
    attachments?: unknown;
  }) {
    const category = String(input.category ?? '').trim();
    const description = String(input.description ?? '').trim();
    if (!category) throw createError('Informe a categoria/tipo de serviço', 400);
    if (!description) throw createError('Informe a descrição do problema', 400);
    if (!input.buildingId) throw createError('Selecione o prédio', 400);

    const locationLabel = await buildLocationLabel({
      buildingId: input.buildingId,
      sectorId: input.sectorId,
      placeId: input.placeId,
      assetId: input.assetId
    });

    const attachments = parseAttachments(input.attachments) ?? [];

    return prisma.$transaction(async (tx) => {
      // Numeração do CHAMADO — independente de gestao_os_settings.nextOsNumber (só para OS).
      const agg = await tx.gestaoOsWorkOrder.aggregate({ _max: { displayNumber: true } });
      const displayNumber = (agg._max.displayNumber ?? 0) + 1;

      const created = await tx.gestaoOsWorkOrder.create({
        data: {
          displayNumber,
          status: GestaoOsStatus.OPEN,
          priority: parsePriority(input.priority),
          category,
          description,
          buildingId: input.buildingId || null,
          sectorId: input.sectorId || null,
          placeId: input.placeId || null,
          assetId: input.assetId || null,
          locationLabel,
          requesterId: input.requesterId,
          attachments: attachments as Prisma.InputJsonValue,
          events: {
            create: {
              toStatus: GestaoOsStatus.OPEN,
              note: 'Chamado aberto',
              actorId: input.requesterId
            }
          }
        },
        include: workOrderInclude
      });

      // Abertura cria só o chamado — número da OS vem na 1ª análise (nextOsNumber).
      return { ...created, osNumber: null as number | null };
    });
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
    }
  ) {
    const current = await this.getById(id);
    if (current.status === 'CLOSED' || current.status === 'CANCELLED') {
      throw createError('OS encerrada ou cancelada não pode ser editada', 400);
    }

    const data: Prisma.GestaoOsWorkOrderUpdateInput = {};
    if (input.priority != null) data.priority = parsePriority(input.priority);
    if (input.maintenanceType !== undefined) {
      data.maintenanceType = parseMaintenanceType(input.maintenanceType);
    }
    if (input.assigneeId !== undefined) {
      data.assignee = input.assigneeId
        ? { connect: { id: String(input.assigneeId) } }
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

    const updated = await prisma.gestaoOsWorkOrder.update({
      where: { id },
      data,
      include: workOrderInclude
    });

    void actorId;
    return updated;
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
    }
  ) {
    const current = await this.getById(id);
    const nextStatus = parseStatus(input.status);
    const allowed = STATUS_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw createError(
        `Transição inválida: ${current.status} → ${nextStatus}`,
        400
      );
    }

    if (nextStatus === 'CANCELLED') {
      const reason = String(input.cancelReason ?? '').trim();
      if (!reason) throw createError('Informe a justificativa do cancelamento', 400);
    }

    if (nextStatus === 'APPROVED') {
      if (!input.maintenanceType && !current.maintenanceType) {
        throw createError('Defina o tipo de manutenção ao aprovar a OS', 400);
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
        await prisma.$executeRawUnsafe(`
          INSERT INTO "gestao_os_settings" ("id", "nextOsNumber", "updatedAt")
          VALUES ('default', 1, CURRENT_TIMESTAMP)
          ON CONFLICT ("id") DO NOTHING;
        `);
        const settingsRows = await prisma.$queryRaw<{ nextOsNumber: number }[]>`
          SELECT "nextOsNumber" FROM "gestao_os_settings" WHERE "id" = 'default' LIMIT 1
        `;
        const configuredNext = Number(settingsRows[0]?.nextOsNumber ?? 1);
        const osAgg = await prisma.$queryRaw<{ max: number | null }[]>`
          SELECT MAX("osNumber")::int AS max FROM "gestao_os_work_orders"
        `;
        const maxOs = Number(osAgg[0]?.max ?? 0);
        createdOsNumber = Math.max(maxOs + 1, configuredNext);
      }
    }

    if (input.priority != null) data.priority = parsePriority(input.priority);
    if (input.maintenanceType !== undefined) {
      data.maintenanceType = parseMaintenanceType(input.maintenanceType);
    }
    if (input.assigneeId !== undefined) {
      data.assignee = input.assigneeId
        ? { connect: { id: String(input.assigneeId) } }
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

    if (nextStatus === 'APPROVED') data.approvedAt = now;
    if (nextStatus === 'IN_PROGRESS' && !current.startedAt) data.startedAt = now;
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
    const note = noteParts.filter(Boolean).join(' · ') || null;

    // Atribui o número da OS antes do update de status (coluna via SQL).
    if (createdOsNumber != null) {
      await prisma.$executeRaw`
        UPDATE "gestao_os_work_orders"
        SET "osNumber" = ${createdOsNumber}
        WHERE "id" = ${id}
      `;
      await prisma.$executeRaw`
        UPDATE "gestao_os_settings"
        SET "nextOsNumber" = ${createdOsNumber + 1},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = 'default'
      `;
    }

    const updated = await prisma.gestaoOsWorkOrder.update({
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

    if (createdOsNumber != null) {
      return { ...updated, osNumber: createdOsNumber };
    }

    // Anexa osNumber lido do banco (client Prisma pode ainda não tipar o campo).
    const osRows = await prisma.$queryRaw<{ osNumber: number | null }[]>`
      SELECT "osNumber" FROM "gestao_os_work_orders" WHERE "id" = ${id} LIMIT 1
    `;
    return { ...updated, osNumber: osRows[0]?.osNumber ?? null };
  }

  async summary() {
    const groups = await prisma.gestaoOsWorkOrder.groupBy({
      by: ['status'],
      _count: { _all: true }
    });
    const byStatus = Object.fromEntries(
      groups.map((g) => [g.status, g._count._all])
    ) as Partial<Record<GestaoOsStatus, number>>;
    const openLike =
      (byStatus.OPEN ?? 0) +
      (byStatus.UNDER_REVIEW ?? 0) +
      (byStatus.APPROVED ?? 0) +
      (byStatus.IN_PROGRESS ?? 0) +
      (byStatus.WAITING_PARTS ?? 0);
    return { byStatus, openLike, total: groups.reduce((s, g) => s + g._count._all, 0) };
  }
}

export const gestaoOsService = new GestaoOsService();
