import { Request, Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  buildAuditSummary,
  enrichTimelineRefs,
  entityLabel,
  resolveTimelineRef,
  type AuditAction,
} from '../lib/auditLog';
import {
  loginEventSourceChannelLabel,
  loginEventTypeLabel,
} from '../lib/impersonationLoginEvents';

function clientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim() || null;
  }
  return req.socket?.remoteAddress || null;
}

function clientUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  if (!ua) return null;
  return String(ua).slice(0, 500);
}

function parseSource(value: unknown): string | null {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'mobile' || raw === 'web') return raw;
  return null;
}

function normalizePath(value: unknown): string | null {
  if (value == null) return null;
  const path = String(value).trim();
  if (!path.startsWith('/')) return null;
  if (path.length > 500) return path.slice(0, 500);
  return path;
}

function normalizeLabel(value: unknown): string | null {
  if (value == null) return null;
  const label = String(value).trim();
  if (!label) return null;
  return label.slice(0, 200);
}

/** Interpreta `YYYY-MM-DD` em intervalo inclusivo (início/fim do dia local do servidor). */
function parseDateRangeFilter(
  fromRaw: unknown,
  toRaw: unknown
): { gte?: Date; lte?: Date } | null {
  const fromStr = String(fromRaw || '').trim();
  const toStr = String(toRaw || '').trim();
  const fromMatch = fromStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const toMatch = toStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!fromMatch && !toMatch) return null;

  const range: { gte?: Date; lte?: Date } = {};
  if (fromMatch) {
    range.gte = new Date(
      Number(fromMatch[1]),
      Number(fromMatch[2]) - 1,
      Number(fromMatch[3]),
      0,
      0,
      0,
      0
    );
  }
  if (toMatch) {
    range.lte = new Date(
      Number(toMatch[1]),
      Number(toMatch[2]) - 1,
      Number(toMatch[3]),
      23,
      59,
      59,
      999
    );
  }
  return range;
}

/** Debounce: não gravar a mesma página do mesmo usuário em menos de N ms */
const PAGE_VISIT_DEDUP_MS = 45_000;

export class UserActivityController {
  /** Registra visita de página do usuário autenticado (ele mesmo). */
  async recordPageView(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) throw createError('Usuário não autenticado', 401);

      const path = normalizePath(req.body?.path);
      if (!path) throw createError('Path inválido', 400);
      const label = normalizeLabel(req.body?.label);
      const now = new Date();

      const recent = await prisma.userPageVisit.findFirst({
        where: {
          userId: req.user.id,
          path,
          createdAt: { gte: new Date(now.getTime() - PAGE_VISIT_DEDUP_MS) }
        },
        select: { id: true }
      });

      if (!recent) {
        await prisma.userPageVisit.create({
          data: {
            userId: req.user.id,
            path,
            label
          }
        });
      }

      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          lastSeenAt: now,
          lastActivityPath: path,
          lastActivityLabel: label
        }
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  /** Histórico de atividade de um funcionário (logins + páginas). */
  async getUserActivity(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const loginsLimit = Math.min(Math.max(Number(req.query.loginsLimit) || 50, 1), 200);
      const visitsLimit = Math.min(Math.max(Number(req.query.visitsLimit) || 100, 1), 300);
      const visitsPage = Math.max(Number(req.query.visitsPage) || 1, 1);
      const loginsPage = Math.max(Number(req.query.loginsPage) || 1, 1);

      const loginsDateFilter = parseDateRangeFilter(
        req.query.loginsFrom ?? req.query.from,
        req.query.loginsTo ?? req.query.to
      );
      const visitsDateFilter = parseDateRangeFilter(
        req.query.visitsFrom ?? req.query.from,
        req.query.visitsTo ?? req.query.to
      );

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          lastLoginAt: true,
          lastSeenAt: true,
          lastActivityPath: true,
          lastActivityLabel: true
        }
      });

      if (!user) throw createError('Usuário não encontrado', 404);

      const loginsWhere = {
        userId: id,
        ...(loginsDateFilter ? { createdAt: loginsDateFilter } : {})
      };
      const visitsWhere = {
        userId: id,
        ...(visitsDateFilter ? { createdAt: visitsDateFilter } : {})
      };

      const [logins, loginsTotal, visits, visitsTotal, totalLoginsAll, totalPageVisitsAll] =
        await Promise.all([
          prisma.userLoginEvent.findMany({
            where: loginsWhere,
            orderBy: { createdAt: 'desc' },
            skip: (loginsPage - 1) * loginsLimit,
            take: loginsLimit
          }),
          prisma.userLoginEvent.count({ where: loginsWhere }),
          prisma.userPageVisit.findMany({
            where: visitsWhere,
            orderBy: { createdAt: 'desc' },
            skip: (visitsPage - 1) * visitsLimit,
            take: visitsLimit
          }),
          prisma.userPageVisit.count({ where: visitsWhere }),
          prisma.userLoginEvent.count({ where: { userId: id, type: 'login' } }),
          prisma.userPageVisit.count({ where: { userId: id } })
        ]);

      res.json({
        success: true,
        data: {
          summary: {
            lastLoginAt: user.lastLoginAt,
            lastSeenAt: user.lastSeenAt,
            lastActivityPath: user.lastActivityPath,
            lastActivityLabel: user.lastActivityLabel,
            totalLogins: totalLoginsAll,
            totalPageVisits: totalPageVisitsAll
          },
          logins: {
            items: logins,
            pagination: {
              page: loginsPage,
              limit: loginsLimit,
              total: loginsTotal,
              totalPages: Math.max(1, Math.ceil(loginsTotal / loginsLimit))
            }
          },
          pageVisits: {
            items: visits,
            pagination: {
              page: visitsPage,
              limit: visitsLimit,
              total: visitsTotal,
              totalPages: Math.max(1, Math.ceil(visitsTotal / visitsLimit))
            }
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Insights do período: top páginas, origem, clientes, horário de pico e linha do tempo.
   */
  async getUserActivityInsights(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dateFilter =
        parseDateRangeFilter(req.query.from, req.query.to) ||
        parseDateRangeFilter(todayYmdSaoPaulo(), todayYmdSaoPaulo());

      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!user) throw createError('Usuário não encontrado', 404);

      const where = {
        userId: id,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      };

      const [logins, visits, audits] = await Promise.all([
        prisma.userLoginEvent.findMany({
          where,
          select: {
            id: true,
            type: true,
            source: true,
            userAgent: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 2500,
        }),
        prisma.userPageVisit.findMany({
          where,
          select: {
            id: true,
            path: true,
            label: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 2500,
        }),
        prisma.auditLog.findMany({
          where: {
            userId: id,
            action: { in: ['CREATE', 'DELETE', 'APPROVE', 'REJECT'] },
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          select: {
            id: true,
            action: true,
            entity: true,
            entityId: true,
            summary: true,
            newData: true,
            oldData: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 2500,
        }),
      ]);

      const pageCounts = new Map<string, { path: string; label: string | null; count: number }>();
      for (const visit of visits) {
        const current = pageCounts.get(visit.path);
        if (current) {
          current.count += 1;
          if (!current.label && visit.label) current.label = visit.label;
        } else {
          pageCounts.set(visit.path, {
            path: visit.path,
            label: visit.label,
            count: 1,
          });
        }
      }

      const isHomePage = (path: string, label: string | null) => {
        const normalized = String(path || '').replace(/\/+$/, '').toLowerCase();
        const labelNorm = String(label || '').trim().toLowerCase();
        if (normalized === '/ponto/home' || normalized === '/home') return true;
        if (labelNorm === 'início' || labelNorm === 'inicio') return true;
        return false;
      };

      const topPages = Array.from(pageCounts.values())
        .filter((item) => !isHomePage(item.path, item.label))
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
        .slice(0, 40);

      const bySource = { web: 0, mobile: 0, other: 0 };
      const byClientMap = new Map<string, number>();
      for (const login of logins) {
        if (String(login.type || 'login').toLowerCase() !== 'login') continue;
        const src = String(login.source || '').toLowerCase();
        if (src === 'web') bySource.web += 1;
        else if (src === 'mobile') bySource.mobile += 1;
        else bySource.other += 1;

        const client = parseClientLabel(login.userAgent, login.source);
        byClientMap.set(client, (byClientMap.get(client) || 0) + 1);
      }
      const byClient = Array.from(byClientMap.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

      const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0 }));
      for (const login of logins) {
        byHour[hourInSaoPaulo(login.createdAt)].total += 1;
      }
      for (const visit of visits) {
        byHour[hourInSaoPaulo(visit.createdAt)].total += 1;
      }

      const auditType = (action: string): 'create' | 'delete' | 'approve' | 'reject' => {
        const a = String(action || '').toUpperCase();
        if (a === 'DELETE') return 'delete';
        if (a === 'APPROVE') return 'approve';
        if (a === 'REJECT') return 'reject';
        return 'create';
      };

      const enrichedRefs = await enrichTimelineRefs(audits);

      const TIMELINE_MAX = 2000;
      const timelineAll = [
        ...logins.map((login) => {
          const typeRaw = String(login.type || 'login').toLowerCase();
          const title = loginEventTypeLabel(login.type, login.source);
          const timelineType =
            typeRaw === 'logout'
              ? ('logout' as const)
              : typeRaw === 'impersonate' ||
                  typeRaw === 'stop_impersonate' ||
                  typeRaw === 'impersonated_by'
                ? ('create' as const)
                : ('login' as const);
          return {
            id: `login-${login.id}`,
            type: timelineType,
            at: login.createdAt,
            title,
            subtitle: loginEventSourceChannelLabel(login.source),
          };
        }),
        ...visits.map((visit) => ({
          id: `visit-${visit.id}`,
          type: 'visit' as const,
          at: visit.createdAt,
          title: visit.label || visit.path,
          subtitle: visit.label ? visit.path : null,
        })),
        ...audits.map((audit) => {
          const type = auditType(audit.action);
          const action = String(audit.action || 'CREATE').toUpperCase() as AuditAction;
          const title =
            audit.summary ||
            buildAuditSummary(
              ['CREATE', 'DELETE', 'APPROVE', 'REJECT'].includes(action) ? action : 'CREATE',
              audit.entity
            );
          const ref =
            resolveTimelineRef(audit.action, audit.newData, audit.oldData) ||
            (audit.entityId ? enrichedRefs.get(`${audit.entity}:${audit.entityId}`) : null) ||
            null;
          return {
            id: `audit-${audit.id}`,
            type,
            at: audit.createdAt,
            title,
            subtitle: ref || entityLabel(audit.entity),
          };
        }),
      ].sort((a, b) => b.at.getTime() - a.at.getTime());

      const timelineTotal = timelineAll.length;
      const timeline = timelineAll.slice(0, TIMELINE_MAX).map((item) => ({
        ...item,
        at: item.at.toISOString(),
      }));

      res.json({
        success: true,
        data: {
          topPages,
          bySource,
          byClient,
          byHour,
          timeline,
          timelineTotal,
          totals: {
            logins: logins.filter((e) => String(e.type || 'login').toLowerCase() === 'login').length,
            visits: visits.length,
            actions: audits.length,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

function todayYmdSaoPaulo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function hourInSaoPaulo(date: Date): number {
  const hourRaw = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(date);
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return 0;
  return Math.min(23, Math.max(0, hour === 24 ? 0 : hour));
}

function parseClientLabel(userAgent?: string | null, source?: string | null): string {
  const ua = String(userAgent || '').toLowerCase();
  const src = String(source || '').toLowerCase();
  if (src === 'mobile' || ua.includes('okhttp') || ua.includes('gennesis')) {
    return 'App mobile';
  }
  if (!ua) return 'Desconhecido';
  if (ua.includes('edg/') || ua.includes('edgios')) return 'Edge';
  if (ua.includes('chrome') && !ua.includes('chromium')) return 'Chrome';
  if (ua.includes('firefox') || ua.includes('fxios')) return 'Firefox';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('opera') || ua.includes('opr/')) return 'Opera';
  return 'Outro';
}

/** Grava evento de login + atualiza lastLoginAt (não bloqueia o login se falhar). */
export async function recordSuccessfulLogin(
  req: Request,
  userId: string,
  sourceHint?: unknown
): Promise<void> {
  const now = new Date();
  const source =
    parseSource(sourceHint) ||
    parseSource(req.headers['x-client-source']) ||
    (String(req.headers['user-agent'] || '').toLowerCase().includes('okhttp') ||
    String(req.headers['user-agent'] || '').toLowerCase().includes('gennesis')
      ? 'mobile'
      : 'web');

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: now,
        lastSeenAt: now
      }
    }),
    prisma.userLoginEvent.create({
      data: {
        userId,
        type: 'login',
        success: true,
        source,
        ipAddress: clientIp(req),
        userAgent: clientUserAgent(req)
      }
    })
  ]);
}

/** Grava evento de logout (não bloqueia o logout se falhar). */
export async function recordSuccessfulLogout(
  req: Request,
  userId: string,
  sourceHint?: unknown
): Promise<void> {
  const source =
    parseSource(sourceHint) ||
    parseSource(req.headers['x-client-source']) ||
    (String(req.headers['user-agent'] || '').toLowerCase().includes('okhttp') ||
    String(req.headers['user-agent'] || '').toLowerCase().includes('gennesis')
      ? 'mobile'
      : 'web');

  await prisma.userLoginEvent.create({
    data: {
      userId,
      type: 'logout',
      success: true,
      source,
      ipAddress: clientIp(req),
      userAgent: clientUserAgent(req),
    },
  });
}
