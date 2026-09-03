import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import {
  assertCanAttachCostCenterToDpRequest,
  assertCanAttachContractToDpRequest,
  assertManagerCanApproveDpRequest,
  getDpManagerApprovalVisibilityWhere,
  isSensitiveDpRequestType,
  userMayCreateSensitiveDpRequest,
} from '../lib/dpApprovalAccess';
import { parseDpRequestDetails } from '../lib/dpRequestDetails';
import {
  isAdmTstDpRequestType,
  isDepartamentoPessoalSector,
  admTstManagerApprovalExclusionWhere,
  admTstOnlyWhere,
  ADM_TST_FEEDBACK_NEXT_STATUSES,
  ADM_TST_MAY_ACT_STATUSES,
} from '../lib/dpRequestAdmTst';
import { assertUserCanManageDpRequest } from '../lib/dpApprovalAccess';

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
  'ADM_VIAGENS',
  'ADM_EPI_FARDAMENTO',
  'ADM_MANUTENCAO_ESCRITORIO',
  'ADM_MATERIAL_ESCRITORIO',
  'ADM_INFORMATICA',
  'ADM_TREINAMENTOS_NR',
  'ADM_ASOS',
] as const;

const createDpRequestSchema = z.object({
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  requestType: z.enum(DP_REQUEST_TYPES),

  /** Prazo desejado para retorno/acompanhamento pelo DP (independe das datas de período em férias, atestado etc.). */
  prazoInicio: z.string().min(1).optional(),
  prazoFim: z.string().min(1).optional(),
  contractId: z.string().min(1).optional(),
  costCenterId: z.string().min(1).optional(),

  // Persistimos para histórico (mesmo que possamos derivar do centro de custo depois).
  company: z.string().min(1).optional(),
  polo: z.string().min(1).optional(),

  details: z.unknown().optional(),
}).refine((data) => Boolean(data.costCenterId || data.contractId), {
  message: 'Selecione o contrato',
  path: ['costCenterId'],
});

const approveDpRequestSchema = z.object({
  /** Vazio é permitido (aprovação sem observação). */
  comment: z.string().optional().transform((s) => (typeof s === 'string' ? s.trim() : '')),
  isInternal: z.boolean().default(false), // Mantemos por compatibilidade futura.
});

const rejectDpRequestSchema = z
  .object({
    cancellationReason: z.string().optional(),
    /** Compatibilidade: aceita `comment` legado como motivo. */
    comment: z.string().optional(),
  })
  .transform((data) => ({
    cancellationReason: (data.cancellationReason ?? data.comment ?? '').trim(),
  }))
  .refine((data) => data.cancellationReason.length > 0, {
    message: 'Informe o motivo do cancelamento',
    path: ['cancellationReason'],
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

const FEEDBACK_NEXT_STATUSES = [
  ...DP_FEEDBACK_NEXT_STATUSES,
  ...ADM_TST_FEEDBACK_NEXT_STATUSES.filter(
    (status) => !(DP_FEEDBACK_NEXT_STATUSES as readonly string[]).includes(status)
  ),
] as const;

const feedbackDpRequestSchema = z
  .object({
    feedback: z.string().min(1),
    nextStatus: z.enum(FEEDBACK_NEXT_STATUSES),
    /** Texto extra ao concluir (se vazio, usa `feedback` como comentário de conclusão). */
    conclusionComment: z.string().optional(),
    responsibleNote: z.string().optional(),
    cancellationReason: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.nextStatus === 'CANCELLED' && !(data.cancellationReason || '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe o motivo do cancelamento',
        path: ['cancellationReason'],
      });
    }
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
type DpCostCenterSummary = {
  id: string;
  name: string;
  code: string;
  company: string | null;
  polo: string | null;
};

async function attachDpContractSummaries<
  T extends { contractId: string | null; costCenterId?: string | null },
>(rows: T[]): Promise<(T & { contract: DpContractSummary | null; costCenter: DpCostCenterSummary | null })[]> {
  const contractIds = [...new Set(rows.map((r) => r.contractId).filter((id): id is string => !!id))];
  const costCenterIds = [
    ...new Set(rows.map((r) => r.costCenterId).filter((id): id is string => !!id)),
  ];

  const [contracts, costCenters] = await Promise.all([
    contractIds.length
      ? prisma.contract.findMany({
          where: { id: { in: contractIds } },
          select: { id: true, number: true, name: true, costCenterId: true },
        })
      : Promise.resolve([]),
    costCenterIds.length
      ? prisma.costCenter.findMany({
          where: { id: { in: costCenterIds } },
          select: { id: true, name: true, code: true, company: true, polo: true },
        })
      : Promise.resolve([]),
  ]);

  const contractById = new Map(contracts.map((c) => [c.id, c]));
  const extraCcIds = contracts
    .map((c) => c.costCenterId)
    .filter((id): id is string => !!id && !costCenterIds.includes(id));
  const extraCenters =
    extraCcIds.length > 0
      ? await prisma.costCenter.findMany({
          where: { id: { in: extraCcIds } },
          select: { id: true, name: true, code: true, company: true, polo: true },
        })
      : [];
  const centerById = new Map(
    [...costCenters, ...extraCenters].map((c) => [
      c.id,
      {
        id: c.id,
        name: c.name,
        code: c.code,
        company: c.company ?? null,
        polo: c.polo ?? null,
      },
    ])
  );

  return rows.map((r) => {
    const contract = r.contractId
      ? contractById.get(r.contractId)
        ? {
            id: contractById.get(r.contractId)!.id,
            number: contractById.get(r.contractId)!.number,
            name: contractById.get(r.contractId)!.name,
          }
        : null
      : null;
    const ccId = r.costCenterId || (r.contractId ? contractById.get(r.contractId)?.costCenterId : null);
    return {
      ...r,
      contract,
      costCenter: ccId ? centerById.get(ccId) ?? null : null,
    };
  });
}

export class DpRequestController {
  /** Contratos ativos (via centro de custo) para o formulário de solicitação geral. */
  async getEligibleContracts(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const contracts = await prisma.contract.findMany({
        where: { costCenter: { isActive: true } },
        select: {
          id: true,
          name: true,
          number: true,
          costCenterId: true,
          costCenter: {
            select: { company: true, polo: true, name: true, code: true },
          },
        },
        orderBy: { name: 'asc' },
        take: 2000,
      });

      const data = contracts.map((c) => ({
        id: c.id,
        name: c.name.trim() || c.number,
        number: c.number,
        costCenterId: c.costCenterId,
        costCenter: {
          company: c.costCenter.company ?? null,
          polo: c.costCenter.polo ?? null,
          name: c.costCenter.name ?? null,
          code: c.costCenter.code ?? null,
        },
      }));

      return res.json({ success: true, data });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode && typeof err.statusCode === 'number') {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao listar contratos' });
    }
  }

  /** Centros de custo ativos para o campo «Contrato» das solicitações internas. */
  async getEligibleCostCenters(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const centers = await prisma.costCenter.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          code: true,
          company: true,
          polo: true,
          contracts: { select: { id: true } },
        },
        orderBy: { name: 'asc' },
        take: 2000,
      });

      const data = centers.map((c) => ({
        id: c.id,
        name: c.name.trim() || c.code,
        code: c.code,
        company: c.company ?? null,
        polo: c.polo ?? null,
        contractIds: c.contracts.map((x) => x.id),
      }));

      return res.json({ success: true, data });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode && typeof err.statusCode === 'number') {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao listar centros de custo' });
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

      if (
        validated.requestType === 'ADM_ASOS' &&
        !isDepartamentoPessoalSector(employee.department)
      ) {
        throw createError("ASO's disponível apenas para o setor Departamento Pessoal", 403);
      }

      let parsedDetails: Record<string, unknown>;
      try {
        parsedDetails = parseDpRequestDetails(validated.requestType, validated.details);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Detalhes do formulário inválidos';
        return res.status(400).json({ error: msg });
      }

      let costCenter: {
        id: string;
        company: string | null;
        polo: string | null;
        isActive: boolean;
      } | null = null;
      let contract: { id: string } | null = null;

      if (validated.costCenterId) {
        await assertCanAttachCostCenterToDpRequest(req, validated.costCenterId);
        costCenter = await prisma.costCenter.findFirst({
          where: { id: validated.costCenterId, isActive: true },
          select: { id: true, company: true, polo: true, isActive: true },
        });
        if (!costCenter) throw createError('Centro de custo não encontrado', 404);

        if (validated.contractId) {
          const linked = await prisma.contract.findUnique({
            where: { id: validated.contractId },
            select: { id: true, costCenterId: true },
          });
          if (!linked || linked.costCenterId !== costCenter.id) {
            throw createError('Contrato não pertence ao centro de custo selecionado', 400);
          }
          contract = { id: linked.id };
        } else {
          const first = await prisma.contract.findFirst({
            where: { costCenterId: costCenter.id },
            select: { id: true },
          });
          contract = first;
        }
      } else if (validated.contractId) {
        await assertCanAttachContractToDpRequest(req, validated.contractId);
        const found = await prisma.contract.findUnique({
          where: { id: validated.contractId },
          include: { costCenter: true },
        });
        if (!found || !found.costCenter?.isActive) {
          throw createError('Contrato não encontrado', 404);
        }
        contract = { id: found.id };
        costCenter = found.costCenter;
      }

      if (!costCenter) throw createError('Selecione o contrato', 400);

      if (isSensitiveDpRequestType(validated.requestType)) {
        const ok = await userMayCreateSensitiveDpRequest(
          actorUserId,
          req.user.isAdmin,
          contract?.id ?? null,
          costCenter.id
        );
        if (!ok) {
          throw createError(
            'Somente administradores, equipe que gerencia solicitações DP, quem tem permissão em Controle (criar solicitações restritas) ou gestores autorizados para este contrato podem criar rescisão ou alteração de função/salário.',
            403
          );
        }
      }

      const company = validated.company ?? costCenter.company ?? '';
      const polo = validated.polo ?? costCenter.polo ?? '';
      const sectorSolicitante = (employee.department ?? '').trim();
      if (!sectorSolicitante) {
        throw createError('Setor do solicitante não cadastrado no perfil do funcionário', 400);
      }

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
        ADM_VIAGENS: 'Viagens',
        ADM_EPI_FARDAMENTO: "EPI's e fardamento",
        ADM_MANUTENCAO_ESCRITORIO: 'Manutenção do escritório',
        ADM_MATERIAL_ESCRITORIO: 'Material de escritório',
        ADM_INFORMATICA: 'Informática',
        ADM_TREINAMENTOS_NR: "Treinamentos e NR's",
        ADM_ASOS: "ASO's",
      };
      const isAdmRequest = isAdmTstDpRequestType(validated.requestType);
      const titlePrefix = isAdmRequest ? 'Solicitação ADM/TST' : 'Solicitação DP';
      const title = `${titlePrefix} · ${typeLabel[validated.requestType] ?? validated.requestType.replace(/_/g, ' ')}`;

      const { prazoInicio, prazoFim } = computePrazos(validated.prazoInicio, validated.prazoFim);

      const DP_DISPLAY_NUMBER_ADVISORY_LOCK = 91827364;
      const createdAtIso = new Date().toISOString();
      const actorName = (employee.user?.name || employee.user?.email || '').trim() || undefined;
      const initialStatus = isAdmRequest ? 'IN_REVIEW_DP' : 'WAITING_MANAGER';

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
            sectorSolicitante,
            solicitanteNome: employee.user?.name ?? '',
            solicitanteEmail: employee.user?.email ?? actorEmail,
            prazoInicio,
            prazoFim,
            details: parsedDetails as Prisma.InputJsonValue,
            contractId: contract?.id ?? null,
            costCenterId: costCenter.id,
            company: company || null,
            polo: polo || null,
            status: initialStatus,
            statusHistory: [
              {
                at: createdAtIso,
                status: initialStatus,
                actorUserId: actorUserId,
                actorName,
                ...(isAdmRequest
                  ? { note: 'Encaminhada para ADM/TST (sem aprovação do gestor)' }
                  : {}),
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

  private async listManageQueue(req: AuthRequest, res: Response, scope: 'DP' | 'ADM_TST') {
    if (!req.user) throw createError('Usuário não autenticado', 401);

    const { status } = req.query;
    const where: Prisma.DpRequestWhereInput = {
      ...(scope === 'ADM_TST' ? admTstOnlyWhere() : admTstManagerApprovalExclusionWhere()),
    };
    if (status && typeof status === 'string' && status !== 'all') {
      where.status = status as Prisma.EnumDpRequestStatusFilter['equals'];
    }

    const requests = await prisma.dpRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            costCenter: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = await attachDpContractSummaries(requests);
    return res.json({ success: true, data });
  }

  /** Fila de gerenciamento do Departamento Pessoal (sem solicitações ADM/TST). */
  async getForApproval(req: AuthRequest, res: Response) {
    try {
      return await this.listManageQueue(req, res, 'DP');
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao buscar solicitações para gerenciamento' });
    }
  }

  /** Fila de gerenciamento ADM/TST. */
  async getForAdmTstManagement(req: AuthRequest, res: Response) {
    try {
      return await this.listManageQueue(req, res, 'ADM_TST');
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao buscar solicitações ADM/TST' });
    }
  }

  /**
   * Lista solicitações DP que o gestor pode visualizar, filtradas pela fase:
   *  - `PENDING` (padrão): aguardando decisão do gestor (`WAITING_MANAGER`).
   *  - `APPROVED`: já aprovadas pelo gestor (`managerApprovedAt` preenchido).
   *  - `REJECTED`: reprovadas pelo gestor (`managerRejectionReason` preenchido).
   *  - `ALL`: união das três fases acima.
   * O escopo (contratos visíveis ao gestor) é aplicado em todas as fases.
   */
  async getWaitingManagerApprovals(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const visibility = await getDpManagerApprovalVisibilityWhere(req.user.id, req.user.isAdmin);
      if (visibility === null) {
        return res.json({ success: true, data: [] });
      }

      const rawPhase = String(req.query.phase ?? 'PENDING').toUpperCase();
      type Phase = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
      const phase: Phase = (['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).includes(
        rawPhase as Phase
      )
        ? (rawPhase as Phase)
        : 'PENDING';

      const phaseFilter: Prisma.DpRequestWhereInput =
        phase === 'PENDING'
          ? { status: 'WAITING_MANAGER' as const }
          : phase === 'APPROVED'
            ? { managerApprovedAt: { not: null } }
            : phase === 'REJECTED'
              ? { managerRejectionReason: { not: null } }
              : {
                  OR: [
                    { status: 'WAITING_MANAGER' as const },
                    { managerApprovedAt: { not: null } },
                    { managerRejectionReason: { not: null } },
                  ],
                };

      const requests = await prisma.dpRequest.findMany({
        where: {
          AND: [phaseFilter, visibility as Prisma.DpRequestWhereInput, admTstManagerApprovalExclusionWhere()],
        },
        include: {
          employee: {
            select: {
              costCenter: true,
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
      if (isAdmTstDpRequestType(dpRequest.requestType)) {
        throw createError('Solicitações ADM/TST não passam por aprovação do gestor', 400);
      }

      await assertManagerCanApproveDpRequest(
        req.user.id,
        req.user.isAdmin,
        dpRequest.requestType,
        dpRequest.contractId,
        dpRequest.costCenterId
      );

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
      if (isAdmTstDpRequestType(dpRequest.requestType)) {
        throw createError('Solicitações ADM/TST não passam por aprovação do gestor', 400);
      }

      await assertManagerCanApproveDpRequest(
        req.user.id,
        req.user.isAdmin,
        dpRequest.requestType,
        dpRequest.contractId,
        dpRequest.costCenterId
      );

      const payload = rejectDpRequestSchema.parse(req.body);
      const rejectionReason = payload.cancellationReason;
      const rejecterName = await getUserDisplayName(req.user.id);

      const updated = await prisma.dpRequest.update({
        where: { id: requestId },
        data: {
          status: 'CANCELLED',
          managerApprovedBy: null,
          managerApprovedAt: null,
          managerApprovalComment: null,
          managerRejectionReason: rejectionReason,
          managerRejectionComment: null,
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
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: 'Dados inválidos', details: e.issues });
      }
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

      await assertUserCanManageDpRequest(
        req.user.id,
        req.user.isAdmin,
        dpRequest.requestType
      );

      const payload = feedbackDpRequestSchema.parse(req.body);

      const current = dpRequest.status;
      const isAdmTst = isAdmTstDpRequestType(dpRequest.requestType);

      if (isAdmTst) {
        if (!(ADM_TST_MAY_ACT_STATUSES as readonly string[]).includes(current)) {
          throw createError('A solicitação não está na etapa correta para feedback ADM/TST', 400);
        }
      } else {
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
      }

      const next = payload.nextStatus;
      if (isAdmTst && !(ADM_TST_FEEDBACK_NEXT_STATUSES as readonly string[]).includes(next)) {
        throw createError('Etapa inválida para solicitação ADM/TST', 400);
      }
      const responsible = (payload.responsibleNote || '').trim();
      const dpActorName = await getUserDisplayName(req.user.id);
      const cancellationReason = (payload.cancellationReason || '').trim();
      const historyNote =
        next === 'CONCLUDED'
          ? (payload.conclusionComment || payload.feedback).trim()
          : next === 'CANCELLED'
            ? [
                `Motivo do cancelamento: ${cancellationReason}`,
                payload.feedback.trim(),
                responsible ? `Responsável: ${responsible}` : '',
              ]
                .filter(Boolean)
                .join('\n')
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

      if (next === 'CANCELLED') {
        data.dpCancellationReason = cancellationReason;
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

