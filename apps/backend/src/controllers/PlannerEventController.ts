import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { PlannerAgendaSharePermission } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ChatService } from '../services/ChatService';
import {
  buildGoogleAuthUrl,
  disconnectGoogleCalendar,
  getFrontendOrigin,
  handleGoogleOAuthCallback,
  isGoogleCalendarConfigured,
  isGoogleCalendarConnected,
  syncGoogleCalendarEvents,
} from '../services/googleCalendarSync';

const chatUploadService = new ChatService();

const ataUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const ok =
      mime === 'application/pdf' ||
      mime === 'application/x-pdf' ||
      name.endsWith('.pdf');
    if (!ok) {
      cb(new Error('Envie apenas arquivo PDF da ata'));
      return;
    }
    cb(null, true);
  },
});

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeColor(value: unknown): string {
  const raw = String(value || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
  return '#3B82F6';
}

const PLANNER_EVENT_ICONS = new Set([
  'meeting',
  'phone',
  'chart',
  'star',
  'check',
  'plane',
  'coffee',
  'users',
  'map-pin',
  'briefcase',
]);

function normalizeIcon(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw || raw === 'none') return null;
  return PLANNER_EVENT_ICONS.has(raw) ? raw : null;
}

function parseAttendeeIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ];
}

const eventInclude = {
  attendees: {
    include: { user: { select: { id: true, name: true, email: true, profilePhotoUrl: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

function serializeEvent<T extends {
  attendees?: Array<{ user: { id: string; name: string; email: string; profilePhotoUrl: string | null } }>;
}>(event: T) {
  const { attendees, ...rest } = event;
  return {
    ...rest,
    attendees: (attendees || []).map((a) => a.user),
  };
}

async function replaceEventAttendees(eventId: string, ownerId: string, attendeeIds: string[]) {
  const unique = [...new Set(attendeeIds)].filter((id) => id !== ownerId);
  if (unique.length > 0) {
    const found = await prisma.user.findMany({
      where: { id: { in: unique }, isActive: true },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw createError('Uma ou mais pessoas atribuídas não foram encontradas', 400);
    }
  }

  await prisma.$transaction([
    prisma.plannerEventAttendee.deleteMany({ where: { eventId } }),
    ...(unique.length
      ? [
          prisma.plannerEventAttendee.createMany({
            data: unique.map((userId) => ({ eventId, userId })),
          }),
        ]
      : []),
  ]);
}

function parsePermission(value: unknown): PlannerAgendaSharePermission {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'WRITE') return PlannerAgendaSharePermission.WRITE;
  return PlannerAgendaSharePermission.READ;
}

type GoogleOAuthState = {
  userId: string;
  returnTo?: string;
};

type AgendaAccess = {
  ownerId: string;
  canWrite: boolean;
  isOwner: boolean;
  permission: 'OWNER' | 'READ' | 'WRITE';
};

async function resolveAgendaAccess(
  requesterId: string,
  ownerId: string
): Promise<AgendaAccess | null> {
  if (ownerId === requesterId) {
    return { ownerId, canWrite: true, isOwner: true, permission: 'OWNER' };
  }
  const share = await prisma.plannerAgendaShare.findUnique({
    where: {
      ownerId_sharedWithUserId: { ownerId, sharedWithUserId: requesterId },
    },
  });
  if (!share) return null;
  const canWrite = share.permission === PlannerAgendaSharePermission.WRITE;
  return {
    ownerId,
    canWrite,
    isOwner: false,
    permission: canWrite ? 'WRITE' : 'READ',
  };
}

const userPublicSelect = {
  id: true,
  name: true,
  email: true,
  profilePhotoUrl: true,
} as const;

export class PlannerEventController {
  async listAgendas(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: userPublicSelect,
      });
      if (!me) throw createError('Usuário não encontrado', 404);

      const shares = await prisma.plannerAgendaShare.findMany({
        where: { sharedWithUserId: userId },
        include: { owner: { select: userPublicSelect } },
        orderBy: { createdAt: 'asc' },
      });

      const agendas = [
        {
          ownerId: me.id,
          name: me.name,
          email: me.email,
          profilePhotoUrl: me.profilePhotoUrl,
          permission: 'OWNER' as const,
          isMine: true,
        },
        ...shares.map((s) => ({
          ownerId: s.owner.id,
          name: s.owner.name,
          email: s.owner.email,
          profilePhotoUrl: s.owner.profilePhotoUrl,
          permission: s.permission as 'READ' | 'WRITE',
          isMine: false,
        })),
      ];

      res.json({ success: true, data: agendas });
    } catch (error) {
      next(error);
    }
  }

  async listShares(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const shares = await prisma.plannerAgendaShare.findMany({
        where: { ownerId: userId },
        include: { sharedWith: { select: userPublicSelect } },
        orderBy: { createdAt: 'asc' },
      });

      res.json({
        success: true,
        data: shares.map((s) => ({
          id: s.id,
          userId: s.sharedWithUserId,
          permission: s.permission,
          user: s.sharedWith,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  async addShare(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const targetUserId = String(req.body?.userId || '').trim();
      if (!targetUserId) throw createError('Usuário é obrigatório', 400);
      if (targetUserId === ownerId) {
        throw createError('Não é possível compartilhar consigo mesmo', 400);
      }

      const target = await prisma.user.findFirst({
        where: { id: targetUserId, isActive: true },
        select: userPublicSelect,
      });
      if (!target) throw createError('Usuário não encontrado', 404);

      const permission = parsePermission(req.body?.permission);
      const share = await prisma.plannerAgendaShare.upsert({
        where: {
          ownerId_sharedWithUserId: { ownerId, sharedWithUserId: targetUserId },
        },
        create: {
          ownerId,
          sharedWithUserId: targetUserId,
          permission,
          createdBy: ownerId,
        },
        update: { permission },
        include: { sharedWith: { select: userPublicSelect } },
      });

      res.status(201).json({
        success: true,
        data: {
          id: share.id,
          userId: share.sharedWithUserId,
          permission: share.permission,
          user: share.sharedWith,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateShare(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const targetUserId = String(req.params.userId || '').trim();
      if (!targetUserId) throw createError('Usuário inválido', 400);

      const existing = await prisma.plannerAgendaShare.findUnique({
        where: {
          ownerId_sharedWithUserId: { ownerId, sharedWithUserId: targetUserId },
        },
      });
      if (!existing) throw createError('Compartilhamento não encontrado', 404);

      const permission = parsePermission(req.body?.permission);
      const share = await prisma.plannerAgendaShare.update({
        where: { id: existing.id },
        data: { permission },
        include: { sharedWith: { select: userPublicSelect } },
      });

      res.json({
        success: true,
        data: {
          id: share.id,
          userId: share.sharedWithUserId,
          permission: share.permission,
          user: share.sharedWith,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async removeShare(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const targetUserId = String(req.params.userId || '').trim();
      if (!targetUserId) throw createError('Usuário inválido', 400);

      const existing = await prisma.plannerAgendaShare.findUnique({
        where: {
          ownerId_sharedWithUserId: { ownerId, sharedWithUserId: targetUserId },
        },
      });
      if (!existing) throw createError('Compartilhamento não encontrado', 404);

      await prisma.plannerAgendaShare.delete({ where: { id: existing.id } });
      res.json({ success: true, data: { userId: targetUserId } });
    } catch (error) {
      next(error);
    }
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const requesterId = req.user!.id;
      const ownerId = String(req.query.ownerId || requesterId).trim() || requesterId;
      const access = await resolveAgendaAccess(requesterId, ownerId);
      if (!access) throw createError('Sem permissão para ver esta agenda', 403);

      const from = parseDate(req.query.from);
      const to = parseDate(req.query.to);

      const dateFilters: object[] = [];
      if (from) dateFilters.push({ endAt: { gt: from } });
      if (to) dateFilters.push({ startAt: { lt: to } });

      const ownershipFilter =
        ownerId === requesterId
          ? {
              OR: [
                { userId: ownerId },
                { attendees: { some: { userId: requesterId } } },
              ],
            }
          : { userId: ownerId };

      const events = await prisma.plannerEvent.findMany({
        where: {
          AND: [ownershipFilter, ...dateFilters],
        },
        include: eventInclude,
        orderBy: [{ startAt: 'asc' }, { title: 'asc' }],
      });

      res.json({
        success: true,
        data: events.map(serializeEvent),
        meta: {
          ownerId: access.ownerId,
          permission: access.permission,
          canWrite: access.canWrite,
          isOwner: access.isOwner,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const requesterId = req.user!.id;
      const ownerId = String(req.body?.ownerId || requesterId).trim() || requesterId;
      const access = await resolveAgendaAccess(requesterId, ownerId);
      if (!access || !access.canWrite) {
        throw createError('Sem permissão para editar esta agenda', 403);
      }

      const title = String(req.body?.title || '').trim();
      if (!title) throw createError('Título é obrigatório', 400);

      const startAt = parseDate(req.body?.startAt);
      const endAt = parseDate(req.body?.endAt);
      if (!startAt || !endAt) throw createError('Data/hora de início e fim são obrigatórias', 400);
      if (endAt <= startAt) throw createError('O término deve ser depois do início', 400);

      const attendeeIds = parseAttendeeIds(req.body?.attendeeIds) ?? [];
      const icon = normalizeIcon(req.body?.icon);

      const created = await prisma.plannerEvent.create({
        data: {
          userId: ownerId,
          title,
          description: String(req.body?.description || '').trim(),
          startAt,
          endAt,
          color: normalizeColor(req.body?.color),
          icon,
        },
      });

      if (attendeeIds.length > 0) {
        await replaceEventAttendees(created.id, ownerId, attendeeIds);
      }

      const full = await prisma.plannerEvent.findUniqueOrThrow({
        where: { id: created.id },
        include: eventInclude,
      });

      res.status(201).json({ success: true, data: serializeEvent(full) });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const requesterId = req.user!.id;
      const id = String(req.params.id || '');
      const existing = await prisma.plannerEvent.findUnique({ where: { id } });
      if (!existing) throw createError('Evento não encontrado', 404);

      const access = await resolveAgendaAccess(requesterId, existing.userId);
      if (!access || !access.canWrite) {
        throw createError('Sem permissão para editar esta agenda', 403);
      }

      const title =
        req.body?.title !== undefined ? String(req.body.title || '').trim() : existing.title;
      if (!title) throw createError('Título é obrigatório', 400);

      const startAt =
        req.body?.startAt !== undefined ? parseDate(req.body.startAt) : existing.startAt;
      const endAt = req.body?.endAt !== undefined ? parseDate(req.body.endAt) : existing.endAt;
      if (!startAt || !endAt) throw createError('Data/hora de início e fim inválidas', 400);
      if (endAt <= startAt) throw createError('O término deve ser depois do início', 400);

      await prisma.plannerEvent.update({
        where: { id },
        data: {
          title,
          description:
            req.body?.description !== undefined
              ? String(req.body.description || '').trim()
              : existing.description,
          startAt,
          endAt,
          color:
            req.body?.color !== undefined ? normalizeColor(req.body.color) : existing.color,
          icon:
            req.body?.icon !== undefined ? normalizeIcon(req.body.icon) : existing.icon,
        },
      });

      const attendeeIds = parseAttendeeIds(req.body?.attendeeIds);
      if (attendeeIds !== undefined) {
        await replaceEventAttendees(id, existing.userId, attendeeIds);
      }

      const full = await prisma.plannerEvent.findUniqueOrThrow({
        where: { id },
        include: eventInclude,
      });

      res.json({ success: true, data: serializeEvent(full) });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const requesterId = req.user!.id;
      const id = String(req.params.id || '');
      const existing = await prisma.plannerEvent.findUnique({ where: { id } });
      if (!existing) throw createError('Evento não encontrado', 404);

      const access = await resolveAgendaAccess(requesterId, existing.userId);
      if (!access || !access.canWrite) {
        throw createError('Sem permissão para editar esta agenda', 403);
      }

      await prisma.plannerEvent.delete({ where: { id } });
      res.json({ success: true, data: { id } });
    } catch (error) {
      next(error);
    }
  }

  static uploadAtaMiddleware() {
    return [
      ataUpload.single('ata'),
      (err: unknown, _req: AuthRequest, _res: Response, next: NextFunction) => {
        if (!err) return next();
        const msg = err instanceof Error ? err.message : 'Falha no upload';
        if (String(msg).includes('File too large')) {
          return next(createError('PDF muito grande (máx. 10MB)', 400));
        }
        return next(createError(msg, 400));
      },
    ];
  }

  async uploadAta(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const requesterId = req.user!.id;
      const id = String(req.params.id || '');
      const existing = await prisma.plannerEvent.findUnique({ where: { id } });
      if (!existing) throw createError('Evento não encontrado', 404);

      const access = await resolveAgendaAccess(requesterId, existing.userId);
      if (!access || !access.canWrite) {
        throw createError('Sem permissão para editar esta agenda', 403);
      }

      const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
      if (!file) throw createError('Envie o PDF da ata', 400);

      const upload = await chatUploadService.uploadFile(file, requesterId);
      await prisma.plannerEvent.update({
        where: { id },
        data: {
          ataFileName: file.originalname || 'ata.pdf',
          ataFileUrl: upload.url,
          ataFileKey: upload.key,
          ataFileSize: upload.size,
          ataMimeType: upload.mimeType || 'application/pdf',
        },
      });

      const full = await prisma.plannerEvent.findUniqueOrThrow({
        where: { id },
        include: eventInclude,
      });

      res.json({ success: true, data: serializeEvent(full) });
    } catch (error) {
      next(error);
    }
  }

  async deleteAta(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const requesterId = req.user!.id;
      const id = String(req.params.id || '');
      const existing = await prisma.plannerEvent.findUnique({ where: { id } });
      if (!existing) throw createError('Evento não encontrado', 404);

      const access = await resolveAgendaAccess(requesterId, existing.userId);
      if (!access || !access.canWrite) {
        throw createError('Sem permissão para editar esta agenda', 403);
      }

      await prisma.plannerEvent.update({
        where: { id },
        data: {
          ataFileName: null,
          ataFileUrl: null,
          ataFileKey: null,
          ataFileSize: null,
          ataMimeType: null,
        },
      });

      const full = await prisma.plannerEvent.findUniqueOrThrow({
        where: { id },
        include: eventInclude,
      });

      res.json({ success: true, data: serializeEvent(full) });
    } catch (error) {
      next(error);
    }
  }

  async googleStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const configured = isGoogleCalendarConfigured();
      const connected = configured
        ? await isGoogleCalendarConnected(req.user!.id)
        : false;
      res.json({ success: true, data: { configured, connected } });
    } catch (error) {
      next(error);
    }
  }

  async googleAuthUrl(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!isGoogleCalendarConfigured()) {
        throw createError(
          'Google Calendar não configurado. Defina GOOGLE_CALENDAR_CLIENT_ID e GOOGLE_CALENDAR_CLIENT_SECRET no backend.',
          503
        );
      }
      if (!process.env.JWT_SECRET) throw createError('JWT_SECRET não configurado', 500);

      const returnTo = String(req.query.returnTo || '/ponto/agenda').trim() || '/ponto/agenda';
      const state = jwt.sign(
        { userId: req.user!.id, returnTo } satisfies GoogleOAuthState,
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );
      const url = buildGoogleAuthUrl(state);
      res.json({ success: true, data: { url } });
    } catch (error) {
      next(error);
    }
  }

  async googleCallback(req: AuthRequest, res: Response, _next: NextFunction) {
    const frontend = getFrontendOrigin().replace(/\/$/, '');
    try {
      const code = String(req.query.code || '');
      const state = String(req.query.state || '');
      const oauthError = String(req.query.error || '');

      if (oauthError) {
        return res.redirect(
          `${frontend}/ponto/agenda?googleCalendar=error&reason=${encodeURIComponent(oauthError)}`
        );
      }
      if (!code || !state || !process.env.JWT_SECRET) {
        return res.redirect(`${frontend}/ponto/agenda?googleCalendar=error&reason=invalid_callback`);
      }

      const payload = jwt.verify(state, process.env.JWT_SECRET) as GoogleOAuthState;
      if (!payload?.userId) {
        return res.redirect(`${frontend}/ponto/agenda?googleCalendar=error&reason=invalid_state`);
      }

      await handleGoogleOAuthCallback(payload.userId, code);

      const returnTo = (payload.returnTo || '/ponto/agenda').startsWith('/')
        ? payload.returnTo || '/ponto/agenda'
        : '/ponto/agenda';
      const sep = returnTo.includes('?') ? '&' : '?';
      return res.redirect(`${frontend}${returnTo}${sep}googleCalendar=connected`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'callback_failed';
      return res.redirect(
        `${frontend}/ponto/agenda?googleCalendar=error&reason=${encodeURIComponent(message)}`
      );
    }
  }

  async googleSync(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!isGoogleCalendarConfigured()) {
        throw createError('Google Calendar não configurado no servidor', 503);
      }
      const userId = req.user!.id;
      const connected = await isGoogleCalendarConnected(userId);
      if (!connected) throw createError('Conecte sua conta Google primeiro', 400);

      const from =
        parseDate(req.body?.from) ||
        (() => {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          d.setDate(d.getDate() - d.getDay());
          return d;
        })();
      const to =
        parseDate(req.body?.to) ||
        (() => {
          const d = new Date(from);
          d.setDate(d.getDate() + 28);
          return d;
        })();

      const result = await syncGoogleCalendarEvents(userId, from, to);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async googleDisconnect(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await disconnectGoogleCalendar(req.user!.id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}
