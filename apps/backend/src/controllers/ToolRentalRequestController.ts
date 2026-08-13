import { Response, NextFunction } from 'express';
import {
  ToolRentalDemandType,
  ToolRentalLogisticsMode,
  ToolRentalPriority,
  ToolRentalRequestStatus,
} from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { assertUserHasToolRentalSuppliesAccess } from '../lib/toolRentalSuppliesAccess';

const include = {
  assignedUser: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  suppliesApprovedBy: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true, tradeName: true, code: true } },
  events: {
    orderBy: { createdAt: 'asc' as const },
    include: { actor: { select: { id: true, name: true } } },
  },
} as const;

async function appendStatusEvent(
  tx: {
    toolRentalRequestEvent: {
      create: (args: {
        data: {
          requestId: string;
          fromStatus: ToolRentalRequestStatus | null;
          toStatus: ToolRentalRequestStatus;
          actorId: string | null;
          note: string | null;
        };
      }) => Promise<unknown>;
    };
  },
  data: {
    requestId: string;
    fromStatus?: ToolRentalRequestStatus | null;
    toStatus: ToolRentalRequestStatus;
    actorId?: string | null;
    note?: string | null;
  }
) {
  await tx.toolRentalRequestEvent.create({
    data: {
      requestId: data.requestId,
      fromStatus: data.fromStatus ?? null,
      toStatus: data.toStatus,
      actorId: data.actorId ?? null,
      note: data.note ?? null,
    },
  });
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function requireString(value: unknown, label: string): string {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) throw createError(`${label} é obrigatório`, 400);
  return trimmed;
}

function parseDateOnly(value: unknown, fieldLabel: string): Date {
  const raw = String(value ?? '').trim();
  if (!raw) throw createError(`${fieldLabel} é obrigatório`, 400);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw createError(`${fieldLabel} inválido`, 400);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw createError(`${fieldLabel} inválido`, 400);
  }
  return date;
}

function parseDemandType(value: unknown): ToolRentalDemandType {
  const raw = String(value ?? '').trim().toUpperCase();
  if (Object.values(ToolRentalDemandType).includes(raw as ToolRentalDemandType)) {
    return raw as ToolRentalDemandType;
  }
  throw createError('Tipo de demanda inválido', 400);
}

function parsePriority(value: unknown): ToolRentalPriority {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return ToolRentalPriority.NORMAL;
  if (Object.values(ToolRentalPriority).includes(raw as ToolRentalPriority)) {
    return raw as ToolRentalPriority;
  }
  throw createError('Prioridade inválida', 400);
}

function parseLogisticsMode(value: unknown): ToolRentalLogisticsMode {
  const raw = String(value ?? '').trim().toUpperCase();
  if (Object.values(ToolRentalLogisticsMode).includes(raw as ToolRentalLogisticsMode)) {
    return raw as ToolRentalLogisticsMode;
  }
  throw createError('Modalidade logística inválida', 400);
}

function parseStatusFilter(value: unknown): ToolRentalRequestStatus[] | undefined {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw || raw === 'ALL') return undefined;
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const statuses: ToolRentalRequestStatus[] = [];
  for (const part of parts) {
    if (Object.values(ToolRentalRequestStatus).includes(part as ToolRentalRequestStatus)) {
      statuses.push(part as ToolRentalRequestStatus);
    } else {
      throw createError('Status de filtro inválido', 400);
    }
  }
  return statuses.length ? statuses : undefined;
}

async function reserveCodes(count: number): Promise<string[]> {
  if (count <= 0) return [];
  const result = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(
      CASE WHEN code ~ '^[0-9]+$' THEN CAST(code AS INTEGER) END
    ) AS max
    FROM tool_rental_requests
  `;
  let start = Number(result[0]?.max ?? 0);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    start += 1;
    codes.push(String(start));
  }
  return codes;
}

export class ToolRentalRequestController {
  async suppliesPendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);
      const count = await prisma.toolRentalRequest.count({
        where: {
          status: {
            in: [
              ToolRentalRequestStatus.OPEN,
              ToolRentalRequestStatus.SUPPLIER_RELATION,
              ToolRentalRequestStatus.AWAITING_PAYMENT,
            ],
          },
        },
      });
      res.json({ success: true, data: { count } });
    } catch (error) {
      // Tabela ainda não migrada no ambiente local — não derruba o polling do layout.
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2021'
      ) {
        res.json({ success: true, data: { count: 0 } });
        return;
      }
      next(error);
    }
  }

  async suppliesSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);

      const grouped = await prisma.toolRentalRequest.groupBy({
        by: ['status'],
        _count: { _all: true },
      });

      const byStatus: Record<string, number> = {};
      let total = 0;
      for (const row of grouped) {
        const n = row._count._all;
        byStatus[row.status] = n;
        total += n;
      }

      res.json({
        success: true,
        data: {
          open: byStatus[ToolRentalRequestStatus.OPEN] ?? 0,
          supplierRelation: byStatus[ToolRentalRequestStatus.SUPPLIER_RELATION] ?? 0,
          awaitingPayment: byStatus[ToolRentalRequestStatus.AWAITING_PAYMENT] ?? 0,
          completed: byStatus[ToolRentalRequestStatus.COMPLETED] ?? 0,
          rejected: byStatus[ToolRentalRequestStatus.REJECTED] ?? 0,
          cancelled: byStatus[ToolRentalRequestStatus.CANCELLED] ?? 0,
          total,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const { search, page = 1, limit = 20, status, scope } = req.query;
      const where: Record<string, unknown> = {};

      const statusFilter = parseStatusFilter(status);
      if (statusFilter?.length === 1) {
        where.status = statusFilter[0];
      } else if (statusFilter && statusFilter.length > 1) {
        where.status = { in: statusFilter };
      }

      // Engenharia: só as próprias, a menos que admin. Suprimentos usa scope=all.
      const scopeAll = String(scope ?? '').toLowerCase() === 'all';
      if (scopeAll) {
        await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);
      } else if (!req.user.isAdmin) {
        where.OR = [
          { createdById: req.user.id },
          { assignedUserId: req.user.id },
        ];
      }

      if (search) {
        const term = String(search);
        const searchOr = [
          { code: { contains: term, mode: 'insensitive' } },
          { titulo: { contains: term, mode: 'insensitive' } },
          { obra: { contains: term, mode: 'insensitive' } },
          { contrato: { contains: term, mode: 'insensitive' } },
          { equipamento: { contains: term, mode: 'insensitive' } },
          { supplierName: { contains: term, mode: 'insensitive' } },
          { assignedUser: { name: { contains: term, mode: 'insensitive' } } },
        ];
        if (where.OR) {
          where.AND = [{ OR: where.OR }, { OR: searchOr }];
          delete where.OR;
        } else {
          where.OR = searchOr;
        }
      }

      const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const pageNum = Math.max(1, Number(page) || 1);
      const skip = (pageNum - 1) * limitNum;

      const [rows, total] = await Promise.all([
        prisma.toolRentalRequest.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: [{ createdAt: 'desc' }],
          include,
        }),
        prisma.toolRentalRequest.count({ where }),
      ]);

      res.json({
        success: true,
        data: rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const row = await prisma.toolRentalRequest.findUnique({
        where: { id: req.params.id },
        include,
      });
      if (!row) throw createError('Solicitação não encontrada', 404);

      const isOwner =
        row.createdById === req.user.id || row.assignedUserId === req.user.id;
      if (!req.user.isAdmin && !isOwner) {
        await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);
      }

      res.json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const body = (req.body || {}) as Record<string, unknown>;

      const polo = requireString(body.polo, 'Polo').toUpperCase();
      if (polo !== 'DF' && polo !== 'GO') {
        throw createError('Polo deve ser DF ou GO', 400);
      }

      const contrato = requireString(body.contrato, 'Contrato');
      const obra = requireString(body.obra, 'Obra');
      const titulo = requireString(body.titulo, 'Título da locação');
      const equipamento = requireString(body.equipamento, 'Equipamento');
      const demandType = parseDemandType(body.demandType);
      const priority = parsePriority(body.priority);
      const logisticsMode = parseLogisticsMode(body.logisticsMode);
      const periodoInicio = parseDateOnly(body.periodoInicio, 'Data de início');
      const periodoFim = parseDateOnly(body.periodoFim, 'Data de fim');
      if (periodoFim < periodoInicio) {
        throw createError('Data final não pode ser anterior à data inicial', 400);
      }

      const assignedUserId = req.user.id;

      let supplierId: string | null = normalizeOptionalString(body.supplierId);
      let supplierName: string | null = normalizeOptionalString(body.supplierName);
      if (supplierId) {
        const supplier = await prisma.supplier.findUnique({
          where: { id: supplierId },
          select: { id: true, name: true, tradeName: true, isActive: true },
        });
        if (!supplier || !supplier.isActive) {
          throw createError('Fornecedor inválido', 400);
        }
        supplierName = supplier.tradeName || supplier.name;
      }

      const linkSugestao = normalizeOptionalString(body.linkSugestao);
      if (linkSugestao && !/^https?:\/\//i.test(linkSugestao)) {
        throw createError('Link de sugestão deve começar com http:// ou https://', 400);
      }

      const [code] = await reserveCodes(1);
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.toolRentalRequest.create({
          data: {
            code,
            polo,
            contrato,
            obra,
            titulo,
            assignedUserId,
            supplierId,
            supplierName,
            priority,
            logisticsMode,
            demandType,
            equipamento,
            periodoInicio,
            periodoFim,
            linkSugestao,
            createdById: req.user!.id,
            status: ToolRentalRequestStatus.OPEN,
          },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: null,
          toStatus: ToolRentalRequestStatus.OPEN,
          actorId: req.user!.id,
          note: 'Solicitação aberta pela Engenharia',
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });

      res.status(201).json({ success: true, data: created });
    } catch (error) {
      next(error);
    }
  }

  async moveToSupplierRelation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);

      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);
      if (row.status !== ToolRentalRequestStatus.OPEN) {
        throw createError(
          'Somente solicitações abertas (após SC) podem ir para Relação com o Fornecedor',
          400
        );
      }

      const comment = normalizeOptionalString(req.body?.comment ?? req.body?.suppliesApprovalComment);
      const updated = await prisma.$transaction(async (tx) => {
        await tx.toolRentalRequest.update({
          where: { id: row.id },
          data: {
            status: ToolRentalRequestStatus.SUPPLIER_RELATION,
            suppliesApprovedById: req.user!.id,
            suppliesApprovedAt: new Date(),
            suppliesApprovalComment: comment,
            suppliesRejectionReason: null,
          },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: ToolRentalRequestStatus.OPEN,
          toStatus: ToolRentalRequestStatus.SUPPLIER_RELATION,
          actorId: req.user!.id,
          note: comment || 'Encaminhada para Relação com o Fornecedor',
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async moveToAwaitingPayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);

      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);
      if (row.status !== ToolRentalRequestStatus.SUPPLIER_RELATION) {
        throw createError(
          'Somente solicitações em Relação com o Fornecedor podem ir para Aguardando Pagamento',
          400
        );
      }

      const ocMirrorUrl = normalizeOptionalString(req.body?.ocMirrorUrl);
      const ocMirrorName = normalizeOptionalString(req.body?.ocMirrorName);

      const updated = await prisma.$transaction(async (tx) => {
        await tx.toolRentalRequest.update({
          where: { id: row.id },
          data: {
            status: ToolRentalRequestStatus.AWAITING_PAYMENT,
            ...(ocMirrorUrl
              ? {
                  ocMirrorUrl,
                  ocMirrorName: ocMirrorName || 'espelho-oc',
                }
              : {}),
            suppliesApprovedById: req.user!.id,
            suppliesApprovedAt: new Date(),
          },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: ToolRentalRequestStatus.SUPPLIER_RELATION,
          toStatus: ToolRentalRequestStatus.AWAITING_PAYMENT,
          actorId: req.user!.id,
          note: ocMirrorUrl
            ? 'Espelho da OC anexado — aguardando pagamento'
            : 'Encaminhada para Aguardando Pagamento',
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async complete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);

      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);
      if (row.status !== ToolRentalRequestStatus.AWAITING_PAYMENT) {
        throw createError(
          'Somente solicitações aguardando pagamento podem ser finalizadas',
          400
        );
      }

      const paymentProofUrl = normalizeOptionalString(req.body?.paymentProofUrl);
      const paymentProofName = normalizeOptionalString(req.body?.paymentProofName);

      const updated = await prisma.$transaction(async (tx) => {
        await tx.toolRentalRequest.update({
          where: { id: row.id },
          data: {
            status: ToolRentalRequestStatus.COMPLETED,
            ...(paymentProofUrl
              ? {
                  paymentProofUrl,
                  paymentProofName: paymentProofName || 'comprovante-pagamento',
                }
              : {}),
            suppliesApprovedById: req.user!.id,
            suppliesApprovedAt: new Date(),
          },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: ToolRentalRequestStatus.AWAITING_PAYMENT,
          toStatus: ToolRentalRequestStatus.COMPLETED,
          actorId: req.user!.id,
          note: paymentProofUrl
            ? 'Comprovante de pagamento anexado — solicitação finalizada'
            : 'Solicitação finalizada',
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async suppliesReject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);

      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);
      if (
        row.status !== ToolRentalRequestStatus.OPEN &&
        row.status !== ToolRentalRequestStatus.SUPPLIER_RELATION
      ) {
        throw createError('Somente solicitações abertas ou em relação com fornecedor podem ser rejeitadas', 400);
      }

      const reason = requireString(
        req.body?.reason ?? req.body?.suppliesRejectionReason,
        'Motivo da rejeição'
      );
      const updated = await prisma.$transaction(async (tx) => {
        await tx.toolRentalRequest.update({
          where: { id: row.id },
          data: {
            status: ToolRentalRequestStatus.REJECTED,
            suppliesApprovedById: req.user!.id,
            suppliesApprovedAt: new Date(),
            suppliesRejectionReason: reason,
            suppliesApprovalComment: null,
          },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: row.status,
          toStatus: ToolRentalRequestStatus.REJECTED,
          actorId: req.user!.id,
          note: reason,
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);
      if (row.status !== ToolRentalRequestStatus.OPEN) {
        throw createError('Somente solicitações abertas podem ser canceladas', 400);
      }
      const isOwner = row.createdById === req.user.id;
      if (!req.user.isAdmin && !isOwner) {
        throw createError('Sem permissão para cancelar esta solicitação', 403);
      }
      const updated = await prisma.$transaction(async (tx) => {
        await tx.toolRentalRequest.update({
          where: { id: row.id },
          data: { status: ToolRentalRequestStatus.CANCELLED },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: ToolRentalRequestStatus.OPEN,
          toStatus: ToolRentalRequestStatus.CANCELLED,
          actorId: req.user!.id,
          note: 'Solicitação cancelada',
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
}
