import {
  Prisma,
  ScheduledNewsAudienceType,
  ScheduledNewsStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { savePersistentUpload, deletePersistentUpload } from '../lib/persistentUpload';
import { gennecyBotUserWhereExclude } from '../lib/gennecyBotUser';

type NewsRow = Prisma.ScheduledNewsGetPayload<{
  include: {
    createdBy: { select: { id: true; name: true } };
    updatedBy: { select: { id: true; name: true } };
    views: { where: { userId: string }; select: { id: true; seenAt: true } };
  };
}>;

type AdminNewsRow = Prisma.ScheduledNewsGetPayload<{
  include: {
    createdBy: { select: { id: true; name: true } };
    updatedBy: { select: { id: true; name: true } };
    _count: { select: { views: true } };
  };
}>;

export type ScheduledNewsDto = {
  id: string;
  title: string;
  summary: string;
  content: string;
  imageUrl: string | null;
  imageKey: string | null;
  status: ScheduledNewsStatus;
  audienceType: ScheduledNewsAudienceType;
  audienceDepartments: string[];
  audiencePositions: string[];
  audienceUserIds: string[];
  priority: number;
  publishAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string } | null;
  updatedBy: { id: string; name: string } | null;
  viewedAt: string | null;
};

export type AdminScheduledNewsDto = Omit<ScheduledNewsDto, 'viewedAt'> & {
  viewsCount: number;
};

export type AdminNewsListResult = {
  data: AdminScheduledNewsDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ScheduledNewsAudienceUserDto = {
  id: string;
  name: string;
  cpf: string;
  profilePhotoUrl: string | null;
  employee: {
    department: string | null;
    position: string | null;
  } | null;
};

type UpsertInput = {
  title?: unknown;
  summary?: unknown;
  content?: unknown;
  status?: unknown;
  audienceType?: unknown;
  audienceDepartments?: unknown;
  audiencePositions?: unknown;
  audienceUserIds?: unknown;
  priority?: unknown;
  publishAt?: unknown;
  expiresAt?: unknown;
};

const userNameSelect = { id: true, name: true } as const;

function normalizeTrimmedString(value: unknown, max = 4000): string {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeOptionalTrimmedString(value: unknown, max = 4000): string | null {
  const normalized = normalizeTrimmedString(value, max);
  return normalized || null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
}

function parseStatus(value: unknown, fallback: ScheduledNewsStatus = 'DRAFT'): ScheduledNewsStatus {
  const normalized = String(value ?? '').toUpperCase();
  if (
    normalized === 'DRAFT' ||
    normalized === 'SCHEDULED' ||
    normalized === 'PUBLISHED' ||
    normalized === 'CANCELLED'
  ) {
    return normalized;
  }
  return fallback;
}

function parseAudienceType(
  value: unknown,
  fallback: ScheduledNewsAudienceType = 'ALL',
): ScheduledNewsAudienceType {
  const normalized = String(value ?? '').toUpperCase();
  if (
    normalized === 'ALL' ||
    normalized === 'DEPARTMENTS' ||
    normalized === 'POSITIONS' ||
    normalized === 'USERS'
  ) {
    return normalized;
  }
  return fallback;
}

function parseDateInput(value: unknown, fieldLabel: string): Date {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error(`${fieldLabel} é obrigatória`);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`${fieldLabel} inválida`);
  return date;
}

function parseOptionalDateInput(value: unknown, fieldLabel: string): Date | null {
  if (value == null || value === '') return null;
  const date = new Date(String(value).trim());
  if (Number.isNaN(date.getTime())) throw new Error(`${fieldLabel} inválida`);
  return date;
}

function mapNews(row: NewsRow): ScheduledNewsDto {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    imageUrl: row.imageUrl ?? null,
    imageKey: row.imageKey ?? null,
    status: row.status,
    audienceType: row.audienceType,
    audienceDepartments: row.audienceDepartments,
    audiencePositions: row.audiencePositions,
    audienceUserIds: row.audienceUserIds,
    priority: row.priority,
    publishAt: row.publishAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    viewedAt: row.views[0]?.seenAt?.toISOString() ?? null,
  };
}

function mapAdminNews(row: AdminNewsRow): AdminScheduledNewsDto {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    imageUrl: row.imageUrl ?? null,
    imageKey: row.imageKey ?? null,
    status: row.status,
    audienceType: row.audienceType,
    audienceDepartments: row.audienceDepartments,
    audiencePositions: row.audiencePositions,
    audienceUserIds: row.audienceUserIds,
    priority: row.priority,
    publishAt: row.publishAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    viewsCount: row._count.views,
  };
}

function buildActiveWindowWhere(now = new Date()): Prisma.ScheduledNewsWhereInput {
  return {
    status: { in: ['PUBLISHED', 'SCHEDULED'] },
    publishAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
  };
}

export class ScheduledNewsService {
  private async getUserAudience(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        employee: {
          select: {
            department: true,
            position: true,
          },
        },
      },
    });

    if (!user) throw new Error('USER_NOT_FOUND');
    return {
      userId,
      department: String(user.employee?.department || '').trim(),
      position: String(user.employee?.position || '').trim(),
    };
  }

  private buildAudienceWhere(audience: {
    userId: string;
    department: string;
    position: string;
  }): Prisma.ScheduledNewsWhereInput {
    const audienceWhere: Prisma.ScheduledNewsWhereInput[] = [{ audienceType: 'ALL' }];

    if (audience.department) {
      audienceWhere.push({
        audienceType: 'DEPARTMENTS',
        audienceDepartments: { has: audience.department },
      });
    }
    if (audience.position) {
      audienceWhere.push({
        audienceType: 'POSITIONS',
        audiencePositions: { has: audience.position },
      });
    }

    audienceWhere.push({
      audienceType: 'USERS',
      audienceUserIds: { has: audience.userId },
    });

    return { OR: audienceWhere };
  }

  private validateCreateInput(input: UpsertInput) {
    const title = normalizeTrimmedString(input.title, 180);
    const summary = normalizeTrimmedString(input.summary, 6000);
    const content = normalizeTrimmedString(input.content, 30000);
    const status = parseStatus(input.status, 'DRAFT');
    const audienceType = parseAudienceType(input.audienceType, 'ALL');
    const audienceDepartments = normalizeStringArray(input.audienceDepartments);
    const audiencePositions = normalizeStringArray(input.audiencePositions);
    const audienceUserIds = normalizeStringArray(input.audienceUserIds);
    const priority = Math.max(0, Number(input.priority ?? 0) || 0);
    const publishAt = parseDateInput(input.publishAt, 'Data de publicação');
    const expiresAt = parseOptionalDateInput(input.expiresAt, 'Data de expiração');

    if (!title) throw new Error('Título é obrigatório');
    if (!summary) throw new Error('Resumo é obrigatório');
    if (!content) throw new Error('Conteúdo é obrigatório');
    if (expiresAt && publishAt > expiresAt) {
      throw new Error('A data de expiração deve ser maior que a data de publicação');
    }
    if (audienceType === 'DEPARTMENTS' && audienceDepartments.length === 0) {
      throw new Error('Selecione ao menos um setor');
    }
    if (audienceType === 'POSITIONS' && audiencePositions.length === 0) {
      throw new Error('Selecione ao menos um cargo');
    }
    if (audienceType === 'USERS' && audienceUserIds.length === 0) {
      throw new Error('Selecione ao menos um usuário');
    }

    return {
      title,
      summary,
      content,
      status,
      audienceType,
      audienceDepartments,
      audiencePositions,
      audienceUserIds,
      priority,
      publishAt,
      expiresAt,
    };
  }

  async listAdmin(params?: {
    page?: unknown;
    limit?: unknown;
    q?: string;
    status?: string;
  }): Promise<AdminNewsListResult> {
    const page = Math.max(1, Number(params?.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(params?.limit ?? 12) || 12));
    const q = String(params?.q ?? '').trim();
    const status = String(params?.status ?? '').trim().toUpperCase();

    const where: Prisma.ScheduledNewsWhereInput = {};
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { summary: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (status === 'DRAFT' || status === 'SCHEDULED' || status === 'PUBLISHED' || status === 'CANCELLED') {
      where.status = status;
    }

    const [rows, total] = await prisma.$transaction([
      prisma.scheduledNews.findMany({
        where,
        orderBy: [{ publishAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          createdBy: { select: userNameSelect },
          updatedBy: { select: userNameSelect },
          _count: { select: { views: true } },
        },
      }),
      prisma.scheduledNews.count({ where }),
    ]);

    return {
      data: rows.map(mapAdminNews),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getAdminById(id: string): Promise<AdminScheduledNewsDto | null> {
    const row = await prisma.scheduledNews.findUnique({
      where: { id },
      include: {
        createdBy: { select: userNameSelect },
        updatedBy: { select: userNameSelect },
        _count: { select: { views: true } },
      },
    });
    return row ? mapAdminNews(row) : null;
  }

  async listAudienceUsers(): Promise<ScheduledNewsAudienceUserDto[]> {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        AND: [
          gennecyBotUserWhereExclude(),
          {
            NOT: {
              OR: [
                { name: { equals: 'Administrador', mode: 'insensitive' } },
                { employee: { is: { position: { equals: 'Administrador', mode: 'insensitive' } } } },
              ],
            },
          },
        ],
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        cpf: true,
        profilePhotoUrl: true,
        employee: {
          select: {
            department: true,
            position: true,
          },
        },
      },
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      profilePhotoUrl: user.profilePhotoUrl ?? null,
      employee: user.employee
        ? {
            department: user.employee.department ?? null,
            position: user.employee.position ?? null,
          }
        : null,
    }));
  }

  async create(input: UpsertInput, actorId?: string): Promise<AdminScheduledNewsDto> {
    const validated = this.validateCreateInput(input);
    const created = await prisma.scheduledNews.create({
      data: {
        ...validated,
        createdById: actorId || null,
        updatedById: actorId || null,
      },
      include: {
        createdBy: { select: userNameSelect },
        updatedBy: { select: userNameSelect },
        _count: { select: { views: true } },
      },
    });
    return mapAdminNews(created);
  }

  async update(id: string, input: UpsertInput, actorId?: string): Promise<AdminScheduledNewsDto> {
    const existing = await prisma.scheduledNews.findUnique({ where: { id } });
    if (!existing) throw new Error('NOT_FOUND');

    const validated = this.validateCreateInput({
      title: input.title ?? existing.title,
      summary: input.summary ?? existing.summary,
      content: input.content ?? existing.content,
      status: input.status ?? existing.status,
      audienceType: input.audienceType ?? existing.audienceType,
      audienceDepartments: input.audienceDepartments ?? existing.audienceDepartments,
      audiencePositions: input.audiencePositions ?? existing.audiencePositions,
      audienceUserIds: input.audienceUserIds ?? existing.audienceUserIds,
      priority: input.priority ?? existing.priority,
      publishAt: input.publishAt ?? existing.publishAt,
      expiresAt: input.expiresAt ?? existing.expiresAt,
    });

    const updated = await prisma.scheduledNews.update({
      where: { id },
      data: {
        ...validated,
        updatedById: actorId || existing.updatedById || null,
      },
      include: {
        createdBy: { select: userNameSelect },
        updatedBy: { select: userNameSelect },
        _count: { select: { views: true } },
      },
    });
    return mapAdminNews(updated);
  }

  async publish(id: string, actorId?: string): Promise<AdminScheduledNewsDto> {
    const existing = await prisma.scheduledNews.findUnique({ where: { id } });
    if (!existing) throw new Error('NOT_FOUND');
    const updated = await prisma.scheduledNews.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        updatedById: actorId || existing.updatedById || null,
      },
      include: {
        createdBy: { select: userNameSelect },
        updatedBy: { select: userNameSelect },
        _count: { select: { views: true } },
      },
    });
    return mapAdminNews(updated);
  }

  async cancel(id: string, actorId?: string): Promise<AdminScheduledNewsDto> {
    const existing = await prisma.scheduledNews.findUnique({ where: { id } });
    if (!existing) throw new Error('NOT_FOUND');
    const updated = await prisma.scheduledNews.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        updatedById: actorId || existing.updatedById || null,
      },
      include: {
        createdBy: { select: userNameSelect },
        updatedBy: { select: userNameSelect },
        _count: { select: { views: true } },
      },
    });
    return mapAdminNews(updated);
  }

  async uploadImage(id: string, file: Express.Multer.File, actorId?: string): Promise<AdminScheduledNewsDto> {
    const existing = await prisma.scheduledNews.findUnique({ where: { id } });
    if (!existing) throw new Error('NOT_FOUND');
    if (!file?.buffer) throw new Error('Imagem é obrigatória');

    const upload = await savePersistentUpload({
      folder: 'scheduled-news',
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileNamePrefix: 'news-',
      includeSafeOriginalName: true,
    });

    if (existing.imageKey) {
      await deletePersistentUpload(existing.imageKey);
    }

    const updated = await prisma.scheduledNews.update({
      where: { id },
      data: {
        imageUrl: upload.url,
        imageKey: upload.key,
        updatedById: actorId || existing.updatedById || null,
      },
      include: {
        createdBy: { select: userNameSelect },
        updatedBy: { select: userNameSelect },
        _count: { select: { views: true } },
      },
    });
    return mapAdminNews(updated);
  }

  async getCurrentForUser(userId: string): Promise<ScheduledNewsDto | null> {
    const audience = await this.getUserAudience(userId);
    const row = await prisma.scheduledNews.findFirst({
      where: {
        AND: [
          buildActiveWindowWhere(),
          this.buildAudienceWhere(audience),
          {
            views: {
              none: { userId },
            },
          },
        ],
      },
      orderBy: [{ priority: 'desc' }, { publishAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        createdBy: { select: userNameSelect },
        updatedBy: { select: userNameSelect },
        views: {
          where: { userId },
          select: { id: true, seenAt: true },
        },
      },
    });
    return row ? mapNews(row) : null;
  }

  async markViewed(id: string, userId: string): Promise<ScheduledNewsDto> {
    const audience = await this.getUserAudience(userId);
    const existing = await prisma.scheduledNews.findFirst({
      where: {
        id,
        AND: [buildActiveWindowWhere(), this.buildAudienceWhere(audience)],
      },
      include: {
        createdBy: { select: userNameSelect },
        updatedBy: { select: userNameSelect },
        views: {
          where: { userId },
          select: { id: true, seenAt: true },
        },
      },
    });
    if (!existing) throw new Error('NOT_FOUND');

    await prisma.scheduledNewsView.upsert({
      where: {
        newsId_userId: {
          newsId: id,
          userId,
        },
      },
      update: {
        seenAt: new Date(),
      },
      create: {
        newsId: id,
        userId,
        seenAt: new Date(),
      },
    });

    const updated = await prisma.scheduledNews.findUniqueOrThrow({
      where: { id },
      include: {
        createdBy: { select: userNameSelect },
        updatedBy: { select: userNameSelect },
        views: {
          where: { userId },
          select: { id: true, seenAt: true },
        },
      },
    });
    return mapNews(updated);
  }
}

export const scheduledNewsService = new ScheduledNewsService();
