import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import {
  assertCanAttachContractToDpRequest,
  assertManagerCanActOnDpContract,
  getDpFormContractWhere,
  getManagerDpApprovalContractScope,
  userMayCreateSensitiveDpRequest,
} from '../lib/dpApprovalAccess';
import { parseDpRequestDetails } from '../lib/dpRequestDetails';

const SENSITIVE_MANAGER_ONLY_DP_TYPES = ['RESCISAO', 'ALTERACAO_FUNCAO_SALARIO'] as const;

const DP_REQUEST_TYPES = [
  'ADMISSAO',
  'ADVERTENCIA_SUSPENSAO',
  'ALTERACAO_FUNCAO_SALARIO',
  'ATESTADO_MEDICO',
  'BENEFICIOS_VIAGEM',
  'FERIAS',
  'HORA_EXTRA',
  'OUTRAS_SOLICITACOES',
  'RESCISAO',
  'RETIFICACAO_ALOCACAO',
] as const;

const createDpRequestSchema = z.object({
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  requestType: z.enum(DP_REQUEST_TYPES),

  /** Prazo desejado para retorno/acompanhamento pelo DP (independe das datas de período em férias, atestado etc.). */
  prazoInicio: z.string().min(1).optional(),
  prazoFim: z.string().min(1).optional(),
  contractId: z.string().min(1),

  // Persistimos para histórico (mesmo que possamos derivar do contrato depois).
  company: z.string().min(1).optional(),
  polo: z.string().min(1).optional(),

  details: z.unknown().optional(),
});

const approveDpRequestSchema = z.object({
  /** Vazio é permitido (aprovação/rejeição sem observação). */
  comment: z.string().optional().transform((s) => (typeof s === 'string' ? s.trim() : '')),
  isInternal: z.boolean().default(false), // Mantemos por compatibilidade futura.
});

const DP_FEEDBACK_NEXT_STATUSES = [
  'IN_REVIEW_DP',
  'IN_FINANCEIRO',
  'WAITING_RETURN',
  'WAITING_RETURN_ACCOUNTING',
  'WAITING_RETURN_ADM_TST',
  'WAITING_RETURN_ENGINEERING',
  'CONCLUDED',
  'CANCELLED',
] as const;

const feedbackDpRequestSchema = z.object({
  feedback: z.string().min(1),
  nextStatus: z.enum(DP_FEEDBACK_NEXT_STATUSES),
  /** Texto extra ao concluir (se vazio, usa `feedback` como comentário de conclusão). */
  conclusionComment: z.string().optional(),
  responsibleNote: z.string().optional(),
});

const requesterReturnSchema = z.object({
  comment: z.string().min(1, 'Informe o retorno para o DP'),
});

function toDate(input: string, fieldName: string): Date {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw createError(`Data inválida em ${fieldName}`, 400);
  }
  return d;
}

/** Prazo de acompanhamento pelo DP: só usa datas enviadas no payload; não replica período de férias/atestado. */
function computePrazos(prazoInicioRaw?: string, prazoFimRaw?: string): { prazoInicio: Date; prazoFim: Date } {
  if (prazoInicioRaw && prazoFimRaw) {
    const a = toDate(prazoInicioRaw, 'prazoInicio');
    const b = toDate(prazoFimRaw, 'prazoFim');
    if (b < a) throw createError('Prazo - fim deve ser posterior ao prazo - início', 400);
    return { prazoInicio: a, prazoFim: b };
  }

  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  return { prazoInicio: today, prazoFim: end };
}

type DpStatusHistoryEntry = {
  at: string;
  status: string;
  note?: string;
  actorUserId?: string;
  actorName?: string;
};

async function getUserDisplayName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  if (!u) return userId;
  const n = (u.name || '').trim();
  return n || u.email || userId;
}

type StatusTransitionMeta = {
  note?: string | null;
  actorUserId?: string;
  actorName?: string | null;
};

/** Acrescenta transição ao histórico (e reconstrói linha base se o registro for antigo). */
function appendStatusTransition(
  row: {
    createdAt: Date;
    updatedAt: Date;
    managerApprovedAt: Date | null;
    status: string;
  },
  existing: unknown,
  nextStatus: string,
  meta?: StatusTransitionMeta
): Prisma.InputJsonValue {
  let list: DpStatusHistoryEntry[] = Array.isArray(existing)
    ? (existing as unknown[]).filter(
        (e): e is DpStatusHistoryEntry =>
          e !== null &&
          typeof e === 'object' &&
          typeof (e as DpStatusHistoryEntry).at === 'string' &&
          typeof (e as DpStatusHistoryEntry).status === 'string'
      )
    : [];
  if (list.length === 0) {
    list.push({ at: row.createdAt.toISOString(), status: 'WAITING_MANAGER' });
    if (row.managerApprovedAt) {
      list.push({ at: row.managerApprovedAt.toISOString(), status: 'IN_REVIEW_DP' });
    }
  }
  const last = list[list.length - 1];
  if (!last || last.status !== row.status) {
    list.push({ at: row.updatedAt.toISOString(), status: row.status });
  }
  const at = new Date().toISOString();
  const entry: DpStatusHistoryEntry = { at, status: nextStatus };
  if (meta?.note != null && String(meta.note).trim()) {
    entry.note = String(meta.note).trim();
  }
  if (meta?.actorUserId) {
    entry.actorUserId = meta.actorUserId;
  }
  if (meta?.actorName != null && String(meta.actorName).trim()) {
    entry.actorName = String(meta.actorName).trim();
  }
  list.push(entry);
  return list as unknown as Prisma.InputJsonValue;
}

type DpContractSummary = { id: string; number: string; name: string };

async function attachDpContractSummaries<T extends { contractId: string | null }>(
  rows: T[]
): Promise<(T & { contract: DpContractSummary | null })[]> {
  const ids = [...new Set(rows.map((r) => r.contractId).filter((id): id is string => !!id))];
  if (ids.length === 0) {
    return rows.map((r) => ({ ...r, contract: null }));
  }
  const contracts = await prisma.contract.findMany({
    where: { id: { in: ids } },
    select: { id: true, number: true, name: true },
  });
  const byId = new Map(contracts.map((c) => [c.id, c]));
  return rows.map((r) => ({
    ...r,
    contract: r.contractId ? byId.get(r.contractId) ?? null : null,
  }));
}

export class DpRequestController {
  /** Lista enxuta de contratos para o formulário (inclui escopo de «aprovar DP» sem módulo Contratos). */
  async getEligibleContracts(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const where = await getDpFormContractWhere(req.user.id, req.user.isAdmin);
      const contracts = await prisma.contract.findMany({
        where,
        select: {
          id: true,
          name: true,
          number: true,
          costCenter: { select: { company: true, polo: true } },
        },
        orderBy: { name: 'asc' },
        take: 500,
      });
      return res.json({ success: true, data: contracts });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode && typeof err.statusCode === 'number') {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao listar contratos' });
    }
  }

  async getMyRequests(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const employee = await prisma.employee.findUnique({
        where: { userId: req.user.id },
        select: { id: true, department: true, employeeId: true },
      });

      if (!employee) throw createError('Funcionário não encontrado', 404);

      const { status } = req.query;

      const where: any = { employeeId: employee.id };
      if (status && typeof status === 'string' && status !== 'all') {
        where.status = status;
      }

      const requests = await prisma.dpRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      const data = await attachDpContractSummaries(requests);

      return res.json({ success: true, data });
    } catch (e) {
      return res.status(500).json({ error: 'Erro ao buscar solicitações DP' });
    }
  }

  async createRequest(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const { id: actorUserId, email: actorEmail } = req.user;

      const employee = await prisma.employee.findUnique({
        where: { userId: actorUserId },
        include: { user: true },
      });
      if (!employee) throw createError('Funcionário não encontrado', 404);

      const validated = createDpRequestSchema.parse(req.body);

      let parsedDetails: Record<string, unknown>;
      try {
        parsedDetails = parseDpRequestDetails(validated.requestType, validated.details);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Detalhes do formulário inválidos';
        return res.status(400).json({ error: msg });
      }

      await assertCanAttachContractToDpRequest(req, validated.contractId);

      const isSensitiveType = (SENSITIVE_MANAGER_ONLY_DP_TYPES as readonly string[]).includes(
        validated.requestType
      );
      if (isSensitiveType) {
        const ok = await userMayCreateSensitiveDpRequest(
          actorUserId,
          req.user.isAdmin,
          validated.contractId
        );
        if (!ok) {
          throw createError(
            'Somente administradores, equipe que gerencia solicitações DP, quem tem permissão em Controle (criar solicitações restritas) ou gestores autorizados para este contrato podem criar rescisão ou alteração de função/salário.',
            403
          );
        }
      }

      const contract = await prisma.contract.findUnique({
        where: { id: validated.contractId },
        include: { costCenter: true },
      });

      if (!contract) throw createError('Contrato não encontrado', 404);

      const company = validated.company ?? contract.costCenter.company ?? '';
      const polo = validated.polo ?? contract.costCenter.polo ?? '';

      const typeLabel: Record<string, string> = {
        ADMISSAO: 'Admissão',
        FERIAS: 'Férias',
        RESCISAO: 'Rescisão',
        ALTERACAO_FUNCAO_SALARIO: 'Alteração de função/salário',
        ADVERTENCIA_SUSPENSAO: 'Medida disciplinar',
        ATESTADO_MEDICO: 'Atestado médico',
        RETIFICACAO_ALOCACAO: 'Retificação de alocação',
        HORA_EXTRA: 'Hora extra',
        BENEFICIOS_VIAGEM: 'Benefícios de viagem',
        OUTRAS_SOLICITACOES: 'Outras solicitações',
      };
      const title = `Solicitação DP · ${typeLabel[validated.requestType] ?? validated.requestType.replace(/_/g, ' ')}`;

      const { prazoInicio, prazoFim } = computePrazos(validated.prazoInicio, validated.prazoFim);

      const DP_DISPLAY_NUMBER_ADVISORY_LOCK = 91827364;
      const createdAtIso = new Date().toISOString();

      const created = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${DP_DISPLAY_NUMBER_ADVISORY_LOCK})`);
        const agg = await tx.dpRequest.aggregate({ _max: { displayNumber: true } });
        const nextDisplay = (agg._max.displayNumber ?? 0) + 1;
        return tx.dpRequest.create({
          data: {
            displayNumber: nextDisplay,
            employeeId: employee.id,
            urgency: validated.urgency,
            requestType: validated.requestType,
            title,
            sectorSolicitante: employee.department,
            solicitanteNome: employee.user?.name ?? '',
            solicitanteEmail: employee.user?.email ?? actorEmail,
            prazoInicio,
            prazoFim,
            details: parsedDetails as Prisma.InputJsonValue,
            contractId: contract.id,
            company: company || null,
            polo: polo || null,
            status: 'WAITING_MANAGER',
            statusHistory: [
              {
                at: createdAtIso,
                status: 'WAITING_MANAGER',
                actorUserId: actorUserId,
                actorName: (employee.user?.name || employee.user?.email || '').trim() || undefined,
              },
            ] as Prisma.InputJsonValue,
          },
        });
      });

      return res.status(201).json({ success: true, data: created });
    } catch (e: unknown) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: 'Dados inválidos', details: e.issues });
      }
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode && typeof err.statusCode === 'number') {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao criar solicitação DP' });
    }
  }

  async getForApproval(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const { status } = req.query;
      const where: any = {};
      if (status && typeof status === 'string' && status !== 'all') {
        where.status = status;
      }

      const requests = await prisma.dpRequest.findMany({
        where,
        include: {
          employee: {
            select: {
              user: { select: { name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const data = await attachDpContractSummaries(requests);

      return res.json({ success: true, data });
    } catch (e) {
      return res.status(500).json({ error: 'Erro ao buscar solicitações DP para aprovação' });
    }
  }

  async getWaitingManagerApprovals(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const scope = await getManagerDpApprovalContractScope(req.user.id, req.user.isAdmin);
      if (scope === null) {
        return res.json({ success: true, data: [] });
      }

      const requests = await prisma.dpRequest.findMany({
        where: { status: 'WAITING_MANAGER', ...scope },
        include: {
          employee: {
            select: {
              user: { select: { name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const data = await attachDpContractSummaries(requests);

      return res.json({ success: true, data });
    } catch (e) {
      return res.status(500).json({ error: 'Erro ao buscar aprovações pendentes do DP' });
    }
  }

  async approveManager(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const requestId = String(req.params.id || '').trim();
      if (!requestId) throw createError('ID inválido', 400);

      const dpRequest = await prisma.dpRequest.findUnique({ where: { id: requestId } });
      if (!dpRequest) throw createError('Solicitação DP não encontrada', 404);
      if (dpRequest.status !== 'WAITING_MANAGER') {
        throw createError('A solicitação não está aguardando aprovação do gestor', 400);
      }

      await assertManagerCanActOnDpContract(req.user.id, req.user.isAdmin, dpRequest.contractId);

      const payload = approveDpRequestSchema.parse(req.body);
      const approverName = await getUserDisplayName(req.user.id);

      const updated = await prisma.dpRequest.update({
        where: { id: requestId },
        data: {
          status: 'IN_REVIEW_DP',
          managerApprovedBy: req.user.id,
          managerApprovedAt: new Date(),
          managerApprovalComment: payload.comment || null,
          managerRejectionReason: null,
          managerRejectionComment: null,
          statusHistory: appendStatusTransition(
            {
              createdAt: dpRequest.createdAt,
              updatedAt: dpRequest.updatedAt,
              managerApprovedAt: dpRequest.managerApprovedAt,
              status: dpRequest.status,
            },
            dpRequest.statusHistory,
            'IN_REVIEW_DP',
            {
              note: payload.comment || undefined,
              actorUserId: req.user.id,
              actorName: approverName,
            }
          ),
        },
      });

      return res.json({ success: true, data: updated });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode && typeof err.statusCode === 'number') {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao aprovar solicitação DP' });
    }
  }

  async rejectManager(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const requestId = String(req.params.id || '').trim();
      if (!requestId) throw createError('ID inválido', 400);

      const dpRequest = await prisma.dpRequest.findUnique({ where: { id: requestId } });
      if (!dpRequest) throw createError('Solicitação DP não encontrada', 404);
      if (dpRequest.status !== 'WAITING_MANAGER') {
        throw createError('A solicitação não está aguardando aprovação do gestor', 400);
      }

      await assertManagerCanActOnDpContract(req.user.id, req.user.isAdmin, dpRequest.contractId);

      const payload = approveDpRequestSchema.parse(req.body);
      const rejectionReason = (payload.comment || 'Rejeitada pelo gestor').trim();
      const rejecterName = await getUserDisplayName(req.user.id);

      const updated = await prisma.dpRequest.update({
        where: { id: requestId },
        data: {
          status: 'CANCELLED',
          managerApprovedBy: null,
          managerApprovedAt: null,
          managerApprovalComment: null,
          managerRejectionReason: rejectionReason,
          managerRejectionComment: payload.comment || null,
          statusHistory: appendStatusTransition(
            {
              createdAt: dpRequest.createdAt,
              updatedAt: dpRequest.updatedAt,
              managerApprovedAt: dpRequest.managerApprovedAt,
              status: dpRequest.status,
            },
            dpRequest.statusHistory,
            'CANCELLED',
            {
              note: rejectionReason,
              actorUserId: req.user.id,
              actorName: rejecterName,
            }
          ),
        },
      });

      return res.json({ success: true, data: updated });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode && typeof err.statusCode === 'number') {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao rejeitar solicitação DP' });
    }
  }

  async dpFeedback(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const requestId = String(req.params.id || '').trim();
      if (!requestId) throw createError('ID inválido', 400);

      const dpRequest = await prisma.dpRequest.findUnique({ where: { id: requestId } });
      if (!dpRequest) throw createError('Solicitação DP não encontrada', 404);

      const payload = feedbackDpRequestSchema.parse(req.body);

      const current = dpRequest.status;
      const dpMayAct: string[] = [
        'IN_REVIEW_DP',
        'IN_FINANCEIRO',
        'WAITING_RETURN',
        'WAITING_RETURN_ACCOUNTING',
        'WAITING_RETURN_ADM_TST',
        'WAITING_RETURN_ENGINEERING',
      ];
      if (!dpMayAct.includes(current)) {
        throw createError('A solicitação não está na etapa correta para feedback do DP', 400);
      }

      const next = payload.nextStatus;
      const responsible = (payload.responsibleNote || '').trim();
      const dpActorName = await getUserDisplayName(req.user.id);
      const historyNote =
        next === 'CONCLUDED'
          ? (payload.conclusionComment || payload.feedback).trim()
          : [payload.feedback.trim(), responsible ? `Responsável: ${responsible}` : ''].filter(Boolean).join('\n');

      const data: Prisma.DpRequestUpdateInput = {
        dpFeedback: payload.feedback.trim(),
        dpFeedbackAt: new Date(),
        dpHandledBy: req.user.id,
        status: next,
        dpResponsibleNote: responsible || null,
        statusHistory: appendStatusTransition(
          {
            createdAt: dpRequest.createdAt,
            updatedAt: dpRequest.updatedAt,
            managerApprovedAt: dpRequest.managerApprovedAt,
            status: dpRequest.status,
          },
          dpRequest.statusHistory,
          next,
          {
            note: historyNote || undefined,
            actorUserId: req.user.id,
            actorName: dpActorName,
          }
        ),
      };

      if (next === 'CONCLUDED') {
        data.dpConcludedAt = new Date();
        data.dpConclusionComment = (payload.conclusionComment || payload.feedback).trim();
      } else {
        data.dpConcludedAt = null;
      }

      const updated = await prisma.dpRequest.update({
        where: { id: requestId },
        data,
      });

      return res.json({ success: true, data: updated });
    } catch (e: unknown) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: 'Dados inválidos', details: e.issues });
      }
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode && typeof err.statusCode === 'number') {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao registrar feedback DP' });
    }
  }

  async requesterReturn(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const requestId = String(req.params.id || '').trim();
      if (!requestId) throw createError('ID inválido', 400);

      const employee = await prisma.employee.findUnique({
        where: { userId: req.user.id },
        select: {
          id: true,
          user: { select: { name: true, email: true } },
        },
      });
      if (!employee) throw createError('Funcionário não encontrado', 404);

      const dpRequest = await prisma.dpRequest.findUnique({ where: { id: requestId } });
      if (!dpRequest) throw createError('Solicitação DP não encontrada', 404);
      if (dpRequest.employeeId !== employee.id) {
        throw createError('Sem permissão para responder esta solicitação', 403);
      }
      if (dpRequest.status !== 'WAITING_RETURN') {
        throw createError('A solicitação não está aguardando retorno', 400);
      }

      const payload = requesterReturnSchema.parse(req.body);
      const returnerName =
        (employee.user?.name || employee.user?.email || '').trim() || (await getUserDisplayName(req.user.id));

      const updated = await prisma.dpRequest.update({
        where: { id: requestId },
        data: {
          requesterReturnComment: payload.comment.trim(),
          requesterReturnedAt: new Date(),
          status: 'IN_REVIEW_DP',
          statusHistory: appendStatusTransition(
            {
              createdAt: dpRequest.createdAt,
              updatedAt: dpRequest.updatedAt,
              managerApprovedAt: dpRequest.managerApprovedAt,
              status: dpRequest.status,
            },
            dpRequest.statusHistory,
            'IN_REVIEW_DP',
            {
              note: payload.comment.trim(),
              actorUserId: req.user.id,
              actorName: returnerName,
            }
          ),
        },
      });

      return res.json({ success: true, data: updated });
    } catch (e) {
           if (e instanceof z.ZodError) {
        return res.status(400).json({ error: 'Dados inválidos', details: e.issues });
      }
      return res.status(500).json({ error: 'Erro ao registrar retorno do solicitante' });
    }
  }
}

