import { Response, NextFunction } from 'express';
import {
  MaterialDeliveryCurrentStatus,
  MaterialDeliveryFinalStatus,
  MaterialDeliveryPaymentStatus,
  MaterialDeliveryPolo,
  MaterialDeliveryStockShortfallType,
  Prisma,
} from '@prisma/client';
import { PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  materialDeliveryService,
  parseGeralShortfallLabel,
} from '../services/MaterialDeliveryService';
import {
  assertRecebimentoEntregasOnContract,
  getContractAccessForUser,
} from '../lib/contractAccess';

const deliveryInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  purchaseOrder: { select: { id: true, orderNumber: true, status: true } },
  contractRecord: { select: { id: true, name: true, number: true } },
  creator: { select: { id: true, name: true } },
  receivedByUser: { select: { id: true, name: true } },
} satisfies Prisma.MaterialDeliveryInclude;

function parseDeliverySequence(value: string): number {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const legacy = trimmed.match(/^ENT-\d{4}-(\d+)$/i);
  if (legacy) return parseInt(legacy[1], 10);
  return 0;
}

async function generateDeliveryNumber(): Promise<string> {
  const rows = await prisma.materialDelivery.findMany({
    select: { deliveryNumber: true },
  });
  let max = 0;
  for (const row of rows) {
    const n = parseDeliverySequence(row.deliveryNumber);
    if (n > max) max = n;
  }
  return String(max + 1);
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? new Prisma.Decimal(n) : null;
}

function buildWhere(query: AuthRequest['query']): Prisma.MaterialDeliveryWhereInput {
  const {
    search,
    polo,
    currentStatus,
    paymentStatus,
    finalStatus,
    receivedByEngineering,
    awaitingEngineering,
  } = query;

  const where: Prisma.MaterialDeliveryWhereInput = {};

  if (polo && (polo === 'DF' || polo === 'GO')) {
    where.polo = polo as MaterialDeliveryPolo;
  }
  if (currentStatus) {
    where.currentStatus = currentStatus as MaterialDeliveryCurrentStatus;
  }
  if (paymentStatus) {
    where.paymentStatus = paymentStatus as MaterialDeliveryPaymentStatus;
  }
  if (finalStatus) {
    where.finalStatus = finalStatus as MaterialDeliveryFinalStatus;
  }
  if (receivedByEngineering === 'true') where.receivedByEngineering = true;
  if (receivedByEngineering === 'false') where.receivedByEngineering = false;
  if (awaitingEngineering === 'true') {
    where.receivedByEngineering = false;
    where.finalStatus = { not: MaterialDeliveryFinalStatus.CANCELADO };
    where.currentStatus = { not: MaterialDeliveryCurrentStatus.CANCELADO };
  }

  const term = typeof search === 'string' ? search.trim() : '';
  if (term) {
    where.OR = [
      { deliveryNumber: { contains: term, mode: 'insensitive' } },
      { movementId: { contains: term, mode: 'insensitive' } },
      { movementNumber: { contains: term, mode: 'insensitive' } },
      { supplierName: { contains: term, mode: 'insensitive' } },
      { rmNumber: { contains: term, mode: 'insensitive' } },
      { deliveryType: { contains: term, mode: 'insensitive' } },
      { observations: { contains: term, mode: 'insensitive' } },
      { contractRecord: { name: { contains: term, mode: 'insensitive' } } },
      { contractRecord: { number: { contains: term, mode: 'insensitive' } } },
      { supplier: { name: { contains: term, mode: 'insensitive' } } },
      { purchaseOrder: { orderNumber: { contains: term, mode: 'insensitive' } } },
    ];
  }

  return where;
}

async function userCanManageAllDeliveries(userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const perm = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: 'ponto_controle_entregas',
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!perm;
}

async function applyRecebimentoContractScope(
  req: AuthRequest,
  where: Prisma.MaterialDeliveryWhereInput
): Promise<Prisma.MaterialDeliveryWhereInput | null> {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  const access = await getContractAccessForUser(req.user.id, req.user.isAdmin);
  if (access.filter === 'none') return null;
  if (access.filter === 'ids') {
    if (access.ids.length === 0) return null;
    return { ...where, contractId: { in: access.ids } };
  }
  return where;
}

function buildDeliveryData(body: Record<string, unknown>, partial = false) {
  const data: Prisma.MaterialDeliveryUpdateInput = {};

  if (!partial || body.polo !== undefined) {
    if (!body.polo || (body.polo !== 'DF' && body.polo !== 'GO')) {
      if (!partial) throw createError('Polo é obrigatório (DF ou GO)', 400);
    } else {
      data.polo = body.polo as MaterialDeliveryPolo;
    }
  }

  const stringFields = [
    'movementId',
    'movementNumber',
    'supplierName',
    'rmNumber',
    'deliveryType',
    'observations',
  ] as const;

  for (const field of stringFields) {
    if (!partial || body[field] !== undefined) {
      (data as Record<string, unknown>)[field] =
        body[field] != null && String(body[field]).trim() !== ''
          ? String(body[field]).trim()
          : null;
    }
  }

  if (!partial || body.currentStatus !== undefined) {
    if (body.currentStatus) data.currentStatus = body.currentStatus as MaterialDeliveryCurrentStatus;
  }
  if (!partial || body.paymentStatus !== undefined) {
    if (body.paymentStatus) data.paymentStatus = body.paymentStatus as MaterialDeliveryPaymentStatus;
  }

  if (!partial || body.orderValue !== undefined) data.orderValue = parseDecimal(body.orderValue);
  if (!partial || body.totalPaid !== undefined) data.totalPaid = parseDecimal(body.totalPaid);
  if (!partial || body.expectedDelivery !== undefined) {
    data.expectedDelivery = parseDate(body.expectedDelivery);
  }

  if (!partial || body.supplierId !== undefined) {
    data.supplier = body.supplierId
      ? { connect: { id: String(body.supplierId) } }
      : { disconnect: true };
  }

  if (!partial || body.purchaseOrderId !== undefined) {
    data.purchaseOrder = body.purchaseOrderId
      ? { connect: { id: String(body.purchaseOrderId) } }
      : { disconnect: true };
  }

  if (!partial || body.contractId !== undefined) {
    data.contractRecord = body.contractId
      ? { connect: { id: String(body.contractId) } }
      : { disconnect: true };
  }

  return data;
}

async function applyAutoStockShortfallType(
  data: Prisma.MaterialDeliveryUpdateInput,
  body: Record<string, unknown>,
  existing?: {
    paymentStatus: MaterialDeliveryPaymentStatus;
    movementId: string | null;
    purchaseOrderId: string | null;
  }
) {
  const paymentStatus = (
    body.paymentStatus !== undefined ? body.paymentStatus : existing?.paymentStatus
  ) as MaterialDeliveryPaymentStatus | undefined;

  const movementId =
    body.movementId !== undefined
      ? body.movementId != null && String(body.movementId).trim() !== ''
        ? String(body.movementId).trim()
        : null
      : (existing?.movementId ?? null);

  let purchaseOrderId: string | null = existing?.purchaseOrderId ?? null;
  if (body.purchaseOrderId !== undefined) {
    purchaseOrderId = body.purchaseOrderId ? String(body.purchaseOrderId) : null;
  } else if (data.purchaseOrder && 'connect' in data.purchaseOrder && data.purchaseOrder.connect) {
    purchaseOrderId = data.purchaseOrder.connect.id ?? null;
  } else if (data.purchaseOrder && 'disconnect' in data.purchaseOrder) {
    purchaseOrderId = null;
  }

  data.stockShortfallType = await materialDeliveryService.resolveStockShortfallType({
    paymentStatus: paymentStatus ?? null,
    movementId,
    purchaseOrderId,
  });
}

export class MaterialDeliveryController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 100 } = req.query;
      const forRecebimento = req.query.forRecebimento === 'true';
      let where = buildWhere(req.query);

      if (forRecebimento) {
        const scoped = await applyRecebimentoContractScope(req, where);
        if (scoped === null) {
          const limitNum = Math.min(Math.max(Number(limit) || 100, 1), 500);
          return res.json({
            success: true,
            data: [],
            pagination: { page: 1, limit: limitNum, total: 0, totalPages: 0 },
          });
        }
        where = scoped;
      }
      const limitNum = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const pageNum = Math.max(1, Number(page) || 1);
      const skip = (pageNum - 1) * limitNum;

      const [items, total] = await Promise.all([
        prisma.materialDelivery.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: [{ expectedDelivery: 'asc' }, { createdAt: 'desc' }],
          include: deliveryInclude,
        }),
        prisma.materialDelivery.count({ where }),
      ]);

      return res.json({
        success: true,
        data: items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  async resolveShortfallType(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { paymentStatus, movementId, purchaseOrderId } = req.query;
      const stockShortfallType = await materialDeliveryService.resolveStockShortfallType({
        paymentStatus: paymentStatus
          ? (String(paymentStatus) as MaterialDeliveryPaymentStatus)
          : null,
        movementId: movementId ? String(movementId) : null,
        purchaseOrderId: purchaseOrderId ? String(purchaseOrderId) : null,
      });
      res.json({ success: true, data: { stockShortfallType } });
    } catch (error) {
      next(error);
    }
  }

  async upsertGeralLookups(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : req.body;
      if (!Array.isArray(rows)) {
        throw createError('Envie um array em rows com lookupKey e shortfallType', 400);
      }
      const parsedRows = rows.map((row: { lookupKey?: string; shortfallType?: unknown }) => ({
        lookupKey: String(row.lookupKey ?? ''),
        shortfallType:
          parseGeralShortfallLabel(row.shortfallType) ??
          (row.shortfallType as MaterialDeliveryStockShortfallType),
      }));
      const result = await materialDeliveryService.upsertGeralLookups(parsedRows);
      res.json({
        success: true,
        data: result,
        message: `${result.upserted} registro(s) importado(s) da aba GERAL`,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const forRecebimento = req.query.forRecebimento === 'true';
      let baseWhere: Prisma.MaterialDeliveryWhereInput = {
        finalStatus: { not: MaterialDeliveryFinalStatus.CANCELADO },
        currentStatus: { not: MaterialDeliveryCurrentStatus.CANCELADO },
      };

      if (forRecebimento) {
        const scoped = await applyRecebimentoContractScope(req, baseWhere);
        if (scoped === null) {
          return res.json({
            success: true,
            data: { total: 0, awaitingEngineering: 0, delivered: 0, overdue: 0 },
          });
        }
        baseWhere = scoped;
      }

      const [total, awaitingEngineering, delivered, overdue] = await Promise.all([
        prisma.materialDelivery.count({ where: baseWhere }),
        prisma.materialDelivery.count({
          where: {
            ...baseWhere,
            receivedByEngineering: false,
          },
        }),
        prisma.materialDelivery.count({
          where: {
            ...baseWhere,
            receivedByEngineering: true,
          },
        }),
        prisma.materialDelivery.count({
          where: {
            ...baseWhere,
            receivedByEngineering: false,
            expectedDelivery: { lt: new Date() },
            currentStatus: {
              notIn: [
                MaterialDeliveryCurrentStatus.ENTREGUE,
                MaterialDeliveryCurrentStatus.CANCELADO,
              ],
            },
          },
        }),
      ]);

      return res.json({
        success: true,
        data: { total, awaitingEngineering, delivered, overdue },
      });
    } catch (error) {
      return next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const item = await prisma.materialDelivery.findUnique({
        where: { id: req.params.id },
        include: deliveryInclude,
      });
      if (!item) throw createError('Entrega não encontrada', 404);
      res.json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const data = buildDeliveryData(req.body) as Prisma.MaterialDeliveryUpdateInput;
      await applyAutoStockShortfallType(data, req.body);
      const deliveryNumber = await generateDeliveryNumber();

      const item = await prisma.materialDelivery.create({
        data: {
          ...(data as Prisma.MaterialDeliveryCreateInput),
          deliveryNumber,
          creator: { connect: { id: userId } },
        },
        include: deliveryInclude,
      });

      res.status(201).json({
        success: true,
        data: item,
        message: 'Entrega registrada com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.materialDelivery.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) throw createError('Entrega não encontrada', 404);

      const data = buildDeliveryData(req.body, true);
      await applyAutoStockShortfallType(data, req.body, {
        paymentStatus: existing.paymentStatus,
        movementId: existing.movementId,
        purchaseOrderId: existing.purchaseOrderId,
      });

      const item = await prisma.materialDelivery.update({
        where: { id: req.params.id },
        data,
        include: deliveryInclude,
      });

      res.json({ success: true, data: item, message: 'Entrega atualizada com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async markReceivedByEngineering(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const existing = await prisma.materialDelivery.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) throw createError('Entrega não encontrada', 404);

      const canManageAll = await userCanManageAllDeliveries(userId, req.user?.isAdmin ?? false);
      if (!canManageAll) {
        await assertRecebimentoEntregasOnContract(req, existing.contractId);
      }

      const item = await prisma.materialDelivery.update({
        where: { id: req.params.id },
        data: {
          receivedByEngineering: true,
          receivedByUser: { connect: { id: userId } },
          receivedAt: new Date(),
          currentStatus: MaterialDeliveryCurrentStatus.ENTREGUE,
          finalStatus: MaterialDeliveryFinalStatus.CONCLUIDO,
          actualDelivery: existing.actualDelivery ?? new Date(),
        },
        include: deliveryInclude,
      });

      res.json({
        success: true,
        data: item,
        message: 'Recebimento confirmado pela engenharia',
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.materialDelivery.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) throw createError('Entrega não encontrada', 404);

      await prisma.materialDelivery.delete({ where: { id: req.params.id } });
      res.json({ success: true, message: 'Entrega excluída com sucesso' });
    } catch (error) {
      next(error);
    }
  }
}
