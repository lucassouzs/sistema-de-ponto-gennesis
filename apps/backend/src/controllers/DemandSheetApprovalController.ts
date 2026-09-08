import { Response } from 'express';
import { z } from 'zod';
import {
  DemandSheetApprovalStatus,
  DemandSheetPurchaseStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import {
  assertManagerCanActOnDpContract,
  getManagerDpApprovalContractScope,
} from '../lib/dpApprovalAccess';
import { getContractAccessForUser } from '../lib/contractAccess';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';

const fdModuleKey = pathToModuleKey('/ponto/aprovacao-fds');
const fdsAprovadasModuleKey = pathToModuleKey('/ponto/fds-aprovadas');

const PURCHASE_STATUS_VALUES = [
  'WAREHOUSE_DF',
  'WAREHOUSE_GO',
  'FULLY_FULFILLED_BY_STOCK',
  'PARTIALLY_FULFILLED_BY_STOCK',
  'PURCHASE_REQUEST',
  'SUPPLIES',
  'FINISHED',
] as const satisfies readonly DemandSheetPurchaseStatus[];

const anexoSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  url: z.string().optional(),
});

const formSchema = z.object({
  numMovRm: z.string().min(1),
  idMovRm: z.string().min(1),
  codigoPedido: z.string().min(1),
  solicitanteId: z.string().min(1),
  contratoId: z.string().min(1),
  obra: z.string().min(1),
  codFichaDemanda: z.string().min(1),
  faturamentoEstimado: z.union([z.number(), z.string()]),
  custoEstimado: z.union([z.number(), z.string()]),
  observacao: z.string().min(1),
  dataHora: z.string().min(1),
  polo: z.enum(['DF', 'GO']),
  anexos: z.array(anexoSchema).optional().default([]),
});

const managerDecisionSchema = z.object({
  comment: z.string().optional(),
});

const purchaseStatusSchema = z.object({
  purchaseStatus: z.enum(PURCHASE_STATUS_VALUES),
});

function parseMoney(value: string | number): Prisma.Decimal {
  if (typeof value === 'number') {
    return new Prisma.Decimal(value);
  }
  const s = String(value).replace(/[R$\s]/g, '').trim();
  if (!s) return new Prisma.Decimal(0);
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = parseFloat(normalized);
  return new Prisma.Decimal(Number.isFinite(n) ? n : 0);
}

function parseDataHora(value: string): Date {
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  const br = value.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (br) {
    const [, dd, mm, yyyy, hh = '0', mi = '0', ss = '0'] = br;
    return new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(mi),
      Number(ss)
    );
  }
  throw createError('Data e hora inválidas', 400);
}

function serializeRow(row: {
  id: string;
  numMovRm: string;
  idMovRm: string;
  codigoPedido: string;
  solicitanteId: string;
  contratoId: string;
  obra: string;
  codFichaDemanda: string;
  faturamentoEstimado: Prisma.Decimal;
  custoEstimado: Prisma.Decimal;
  observacao: string;
  dataHora: Date;
  polo: string;
  anexos: unknown;
  status: DemandSheetApprovalStatus;
  createdBy: string;
  managerApprovedBy: string | null;
  managerApprovedAt: Date | null;
  managerApprovalComment: string | null;
  managerRejectionReason: string | null;
  managerRejectionComment: string | null;
  purchaseStatus: DemandSheetPurchaseStatus | null;
  purchaseStatusUpdatedBy: string | null;
  purchaseStatusUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  solicitante?: { id: string; name: string } | null;
  contrato?: { id: string; name: string; number: string } | null;
  creator?: { id: string; name: string } | null;
  managerApprover?: { id: string; name: string } | null;
  purchaseStatusUpdater?: { id: string; name: string } | null;
}) {
  return {
    ...row,
    faturamentoEstimado: Number(row.faturamentoEstimado),
    custoEstimado: Number(row.custoEstimado),
    dataHora: row.dataHora.toLocaleString('pt-BR'),
    solicitanteNome: row.solicitante?.name ?? '',
    contratoNome: row.contrato ? `${row.contrato.number} — ${row.contrato.name}` : '',
    creatorNome: row.creator?.name ?? '',
    managerApproverNome: row.managerApprover?.name ?? '',
    purchaseStatusUpdaterNome: row.purchaseStatusUpdater?.name ?? '',
    purchaseStatusUpdatedAt: row.purchaseStatusUpdatedAt
      ? row.purchaseStatusUpdatedAt.toLocaleString('pt-BR')
      : null,
    anexos: Array.isArray(row.anexos) ? row.anexos : [],
  };
}

const includeDefault = {
  solicitante: { select: { id: true, name: true } },
  contrato: { select: { id: true, name: true, number: true } },
  creator: { select: { id: true, name: true } },
  managerApprover: { select: { id: true, name: true } },
  purchaseStatusUpdater: { select: { id: true, name: true } },
} as const;

async function userCanAccessFdModule(userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const perm = await prisma.userPermission.findFirst({
    where: { userId, module: fdModuleKey, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  return !!perm;
}

async function userCanAccessFdsAprovadasModule(userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const perm = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: fdsAprovadasModuleKey,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
  });
  return !!perm;
}

/** Escopo de gestor DP usa `contractId`; a tabela de FD usa `contratoId`. */
function mapManagerScopeToFdWhere(
  scope: Record<string, unknown> | null
): Prisma.DemandSheetApprovalWhereInput {
  if (!scope || Object.keys(scope).length === 0) return {};
  const contractFilter = scope.contractId as { in?: string[] } | undefined;
  if (contractFilter?.in?.length) {
    return { contratoId: { in: contractFilter.in } };
  }
  return {};
}

async function listWhereForUser(userId: string, isAdmin: boolean): Promise<Prisma.DemandSheetApprovalWhereInput> {
  if (isAdmin) return {};
  const hasModule = await userCanAccessFdModule(userId, isAdmin);
  const access = await getContractAccessForUser(userId, false);
  const scope = await getManagerDpApprovalContractScope(userId, isAdmin);

  const or: Prisma.DemandSheetApprovalWhereInput[] = [{ createdBy: userId }];
  if (hasModule && access.filter === 'ids' && access.ids.length > 0) {
    or.push({ contratoId: { in: access.ids } });
  }
  const managerScope = mapManagerScopeToFdWhere(scope);
  if (Object.keys(managerScope).length > 0) {
    or.push(managerScope);
  }
  return { OR: or };
}

export class DemandSheetApprovalController {
  async list(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const search = String(req.query.search ?? '').trim();
      const status = String(req.query.status ?? '').trim();

      const where: Prisma.DemandSheetApprovalWhereInput = {
        ...(await listWhereForUser(req.user.id, req.user.isAdmin)),
      };

      if (status && status !== 'ALL') {
        where.status = status as DemandSheetApprovalStatus;
      }

      if (search) {
        where.AND = [
          {
            OR: [
              { codFichaDemanda: { contains: search, mode: 'insensitive' } },
              { codigoPedido: { contains: search, mode: 'insensitive' } },
              { numMovRm: { contains: search, mode: 'insensitive' } },
              { obra: { contains: search, mode: 'insensitive' } },
            ],
          },
        ];
      }

      const rows = await prisma.demandSheetApproval.findMany({
        where,
        include: includeDefault,
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, data: rows.map(serializeRow) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao listar fichas de demanda' });
    }
  }

  async create(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const canCreate =
        req.user.isAdmin || (await userCanAccessFdModule(req.user.id, req.user.isAdmin));
      if (!canCreate) {
        throw createError('Sem permissão para cadastrar fichas de demanda', 403);
      }

      const body = formSchema.parse(req.body);

      const row = await prisma.demandSheetApproval.create({
        data: {
          numMovRm: body.numMovRm.trim(),
          idMovRm: body.idMovRm.trim(),
          codigoPedido: body.codigoPedido.trim(),
          solicitanteId: body.solicitanteId,
          contratoId: body.contratoId,
          obra: body.obra.trim(),
          codFichaDemanda: body.codFichaDemanda.trim(),
          faturamentoEstimado: parseMoney(body.faturamentoEstimado),
          custoEstimado: parseMoney(body.custoEstimado),
          observacao: body.observacao.trim(),
          dataHora: parseDataHora(body.dataHora),
          polo: body.polo,
          anexos: body.anexos,
          status: 'WAITING_MANAGER',
          createdBy: req.user.id,
        },
        include: includeDefault,
      });

      return res.status(201).json({ success: true, data: serializeRow(row) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao criar ficha de demanda' });
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const existing = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!existing) throw createError('Ficha de demanda não encontrada', 404);
      if (existing.status !== 'WAITING_MANAGER') {
        throw createError('Somente fichas aguardando aprovação podem ser editadas', 400);
      }
      if (!req.user.isAdmin && existing.createdBy !== req.user.id) {
        throw createError('Sem permissão para editar esta ficha', 403);
      }

      const body = formSchema.parse(req.body);

      const row = await prisma.demandSheetApproval.update({
        where: { id },
        data: {
          numMovRm: body.numMovRm.trim(),
          idMovRm: body.idMovRm.trim(),
          codigoPedido: body.codigoPedido.trim(),
          solicitanteId: body.solicitanteId,
          contratoId: body.contratoId,
          obra: body.obra.trim(),
          codFichaDemanda: body.codFichaDemanda.trim(),
          faturamentoEstimado: parseMoney(body.faturamentoEstimado),
          custoEstimado: parseMoney(body.custoEstimado),
          observacao: body.observacao.trim(),
          dataHora: parseDataHora(body.dataHora),
          polo: body.polo,
          anexos: body.anexos,
        },
        include: includeDefault,
      });

      return res.json({ success: true, data: serializeRow(row) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao atualizar ficha de demanda' });
    }
  }

  async remove(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const existing = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!existing) throw createError('Ficha de demanda não encontrada', 404);
      if (existing.status !== 'WAITING_MANAGER') {
        throw createError('Somente fichas aguardando aprovação podem ser excluídas', 400);
      }
      if (!req.user.isAdmin && existing.createdBy !== req.user.id) {
        throw createError('Sem permissão para excluir esta ficha', 403);
      }

      await prisma.demandSheetApproval.delete({ where: { id } });
      return res.json({ success: true });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao excluir ficha de demanda' });
    }
  }

  async getManagerApprovals(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const scope = await getManagerDpApprovalContractScope(req.user.id, req.user.isAdmin);
      if (scope === null) {
        return res.json({ success: true, data: [] });
      }

      const managerScope = mapManagerScopeToFdWhere(scope);
      const rawPhase = String(req.query.phase ?? 'PENDING').toUpperCase();
      type Phase = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
      const phase: Phase = (['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).includes(
        rawPhase as Phase
      )
        ? (rawPhase as Phase)
        : 'PENDING';

      const phaseFilter =
        phase === 'PENDING'
          ? { status: 'WAITING_MANAGER' as const }
          : phase === 'APPROVED'
            ? { status: 'APPROVED' as const }
            : phase === 'REJECTED'
              ? { status: 'REJECTED' as const }
              : {
                  status: {
                    in: ['WAITING_MANAGER', 'APPROVED', 'REJECTED'] as DemandSheetApprovalStatus[],
                  },
                };

      const rows = await prisma.demandSheetApproval.findMany({
        where: { ...phaseFilter, ...managerScope },
        include: includeDefault,
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, data: rows.map(serializeRow) });
    } catch (e) {
      return res.status(500).json({ error: 'Erro ao buscar aprovações de FD' });
    }
  }

  async approveManager(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const row = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!row) throw createError('Ficha de demanda não encontrada', 404);
      if (row.status !== 'WAITING_MANAGER') {
        throw createError('A ficha não está aguardando aprovação do gestor', 400);
      }

      await assertManagerCanActOnDpContract(req.user.id, req.user.isAdmin, row.contratoId);

      const payload = managerDecisionSchema.parse(req.body);

      const updated = await prisma.demandSheetApproval.update({
        where: { id },
        data: {
          status: 'APPROVED',
          managerApprovedBy: req.user.id,
          managerApprovedAt: new Date(),
          managerApprovalComment: payload.comment?.trim() || null,
          managerRejectionReason: null,
          managerRejectionComment: null,
        },
        include: includeDefault,
      });

      return res.json({ success: true, data: serializeRow(updated) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao aprovar ficha de demanda' });
    }
  }

  async rejectManager(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const row = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!row) throw createError('Ficha de demanda não encontrada', 404);
      if (row.status !== 'WAITING_MANAGER') {
        throw createError('A ficha não está aguardando aprovação do gestor', 400);
      }

      await assertManagerCanActOnDpContract(req.user.id, req.user.isAdmin, row.contratoId);

      const payload = managerDecisionSchema.parse(req.body);
      const reason = payload.comment?.trim() || 'Reprovada pelo gestor';

      const updated = await prisma.demandSheetApproval.update({
        where: { id },
        data: {
          status: 'REJECTED',
          managerApprovedBy: null,
          managerApprovedAt: null,
          managerApprovalComment: null,
          managerRejectionReason: reason,
          managerRejectionComment: payload.comment?.trim() || null,
        },
        include: includeDefault,
      });

      return res.json({ success: true, data: serializeRow(updated) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao rejeitar ficha de demanda' });
    }
  }

  async getNotificationCounts(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      let pendingManager = 0;
      const scope = await getManagerDpApprovalContractScope(req.user.id, req.user.isAdmin);
      if (scope !== null) {
        const managerScope = mapManagerScopeToFdWhere(scope);
        pendingManager = await prisma.demandSheetApproval.count({
          where: { status: 'WAITING_MANAGER', ...managerScope },
        });
      }

      let pendingPurchase = 0;
      const canPurchase = await userCanAccessFdsAprovadasModule(req.user.id, req.user.isAdmin);
      if (canPurchase) {
        pendingPurchase = await prisma.demandSheetApproval.count({
          where: { status: 'APPROVED', purchaseStatus: null },
        });
      }

      return res.json({
        success: true,
        data: { pendingManager, pendingPurchase },
      });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao buscar notificações de FD' });
    }
  }

  async listApprovedForPurchasing(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const canAccess = await userCanAccessFdsAprovadasModule(req.user.id, req.user.isAdmin);
      if (!canAccess) {
        throw createError('Sem permissão para acessar fichas aprovadas', 403);
      }

      const search = String(req.query.search ?? '').trim();
      const purchaseStatus = String(req.query.purchaseStatus ?? '').trim();

      const where: Prisma.DemandSheetApprovalWhereInput = {
        status: 'APPROVED',
      };

      if (purchaseStatus && purchaseStatus !== 'ALL') {
        if (purchaseStatus === 'NONE') {
          where.purchaseStatus = null;
        } else if (
          (PURCHASE_STATUS_VALUES as readonly string[]).includes(purchaseStatus)
        ) {
          where.purchaseStatus = purchaseStatus as DemandSheetPurchaseStatus;
        }
      }

      if (search) {
        where.AND = [
          {
            OR: [
              { codFichaDemanda: { contains: search, mode: 'insensitive' } },
              { codigoPedido: { contains: search, mode: 'insensitive' } },
              { numMovRm: { contains: search, mode: 'insensitive' } },
              { obra: { contains: search, mode: 'insensitive' } },
            ],
          },
        ];
      }

      const rows = await prisma.demandSheetApproval.findMany({
        where,
        include: includeDefault,
        orderBy: [{ managerApprovedAt: 'desc' }, { createdAt: 'desc' }],
      });

      return res.json({ success: true, data: rows.map(serializeRow) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao listar fichas aprovadas' });
    }
  }

  async updatePurchaseStatus(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const canAccess = await userCanAccessFdsAprovadasModule(req.user.id, req.user.isAdmin);
      if (!canAccess) {
        throw createError('Sem permissão para atualizar status de compras', 403);
      }

      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const row = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!row) throw createError('Ficha de demanda não encontrada', 404);
      if (row.status !== 'APPROVED') {
        throw createError('Somente fichas aprovadas pelo gestor podem receber status de compras', 400);
      }

      const body = purchaseStatusSchema.parse(req.body);

      const updated = await prisma.demandSheetApproval.update({
        where: { id },
        data: {
          purchaseStatus: body.purchaseStatus,
          purchaseStatusUpdatedBy: req.user.id,
          purchaseStatusUpdatedAt: new Date(),
        },
        include: includeDefault,
      });

      return res.json({ success: true, data: serializeRow(updated) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao atualizar status de compras' });
    }
  }
}
