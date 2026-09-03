import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { getContractAccessForUser } from './contractAccess';
import { AuthRequest } from '../middleware/auth';
import { isAdmTstDpRequestType } from './dpRequestAdmTst';

export const DP_APPROVE_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-solicitacoes-dp');
export const DP_RESTRICTED_APPROVE_MODULE_KEY = pathToModuleKey(
  '/ponto/controle/aprovar-solicitacoes-restritas-dp'
);
export const DP_MANAGE_MODULE_KEY = pathToModuleKey('/ponto/gerenciar-solicitacoes-dp');
export const ADM_TST_MANAGE_MODULE_KEY = pathToModuleKey('/ponto/gerenciar-solicitacoes-adm-tst');
export const DP_SOLICITACOES_MODULE_KEY = pathToModuleKey('/ponto/solicitacoes-dp');
/** Controle: rescisão e alteração de função/salário (além de admin, gerenciar DP ou Gestor DP no contrato). */
export const DP_SENSITIVE_CREATE_MODULE_KEY = pathToModuleKey('/ponto/controle/criar-tipos-restritos-dp');

export const SENSITIVE_DP_REQUEST_TYPES = ['RESCISAO', 'ALTERACAO_FUNCAO_SALARIO'] as const;

export function isSensitiveDpRequestType(requestType: string): boolean {
  return (SENSITIVE_DP_REQUEST_TYPES as readonly string[]).includes(requestType);
}

/**
 * Pode atuar como gestor nas rotas de aprovação DP: vínculo em `user_dp_approval_contracts`
 * ou permissão legada (antes da coluna «Gestor DP» na aba Contratos).
 */
export async function userHasDpApprovePermission(userId: string): Promise<boolean> {
  const legacy = await prisma.userPermission.findFirst({
    where: { userId, module: DP_APPROVE_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  if (legacy) return true;
  const row = await prisma.userDpApprovalContract.findFirst({
    where: { userId },
    select: { id: true },
  });
  return !!row;
}

export async function userHasRestrictedDpApprovePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: DP_RESTRICTED_APPROVE_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
  });
  return !!row;
}

export async function getRestrictedDpApprovalCostCenterIds(
  userId: string,
  isAdmin: boolean
): Promise<string[] | null> {
  if (isAdmin) return null;
  const hasPerm = await userHasRestrictedDpApprovePermission(userId);
  if (!hasPerm) return [];
  const rows = await prisma.userRestrictedDpApprovalCostCenter.findMany({
    where: { userId },
    select: { costCenterId: true },
  });
  return rows.map((r) => r.costCenterId);
}

/** Gestor DP comum ou aprovador de solicitações restritas (para entrar na API de aprovações). */
export async function userHasAnyDpApproverAccess(userId: string): Promise<boolean> {
  if (await userHasDpApprovePermission(userId)) return true;
  return userHasRestrictedDpApprovePermission(userId);
}

export async function userHasDpManagePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: { userId, module: DP_MANAGE_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  return !!row;
}

export async function userHasAdmTstManagePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: ADM_TST_MANAGE_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
  });
  return !!row;
}

/** Gestor da fila DP ou ADM/TST conforme o tipo da solicitação. */
export async function assertUserCanManageDpRequest(
  userId: string,
  isAdmin: boolean,
  requestType: string
): Promise<void> {
  if (isAdmin) return;
  const isAdm = isAdmTstDpRequestType(requestType);
  const allowed = isAdm
    ? await userHasAdmTstManagePermission(userId)
    : await userHasDpManagePermission(userId);
  if (!allowed) {
    throw createError(
      isAdm
        ? 'Sem permissão para gerenciar solicitações ADM/TST'
        : 'Sem permissão para gerenciar solicitações do Departamento Pessoal',
      403
    );
  }
}

export async function userHasSolicitacoesDpModule(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: { userId, module: DP_SOLICITACOES_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  return !!row;
}

export async function userHasSensitiveDpCreateControlePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: DP_SENSITIVE_CREATE_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
  });
  return !!row;
}

/**
 * `null` = usuário não é gestor DP (sem permissão ou sem contratos vinculados).
 * `{}` = admin (sem filtro de contrato).
 */
async function buildManagerDpScopeFromContractIds(contractIds: string[]): Promise<Record<string, unknown>> {
  if (contractIds.length === 0) return { contractId: { in: [] } };
  const rows = await prisma.contract.findMany({
    where: { id: { in: contractIds } },
    select: { costCenterId: true },
    distinct: ['costCenterId'],
  });
  const costCenterIds = rows.map((r) => r.costCenterId).filter(Boolean);
  if (costCenterIds.length === 0) return { contractId: { in: contractIds } };
  return {
    OR: [{ contractId: { in: contractIds } }, { costCenterId: { in: costCenterIds } }],
  };
}

export async function getDpManagerApprovalVisibilityWhere(
  userId: string,
  isAdmin: boolean
): Promise<Record<string, unknown> | null> {
  if (isAdmin) return {};
  const regularScope = await getManagerDpApprovalContractScope(userId, false);
  const restrictedCcIds = await getRestrictedDpApprovalCostCenterIds(userId, false);
  const hasRestricted = await userHasRestrictedDpApprovePermission(userId);
  const orParts: Record<string, unknown>[] = [];
  if (regularScope) {
    orParts.push({
      AND: [regularScope, { requestType: { notIn: [...SENSITIVE_DP_REQUEST_TYPES] } }],
    });
  }
  if (hasRestricted && restrictedCcIds && restrictedCcIds.length > 0) {
    orParts.push({
      requestType: { in: [...SENSITIVE_DP_REQUEST_TYPES] },
      costCenterId: { in: restrictedCcIds },
    });
  }
  if (orParts.length === 0) return null;
  return { OR: orParts };
}

export async function getManagerDpApprovalContractScope(
  userId: string,
  isAdmin: boolean
): Promise<Record<string, unknown> | null> {
  if (isAdmin) return {};
  const hasApprove = await userHasDpApprovePermission(userId);
  if (!hasApprove) return null;
  const ids = await prisma.userDpApprovalContract.findMany({
    where: { userId },
    select: { contractId: true },
  });
  const list = ids.map((r) => r.contractId);
  if (list.length > 0) return buildManagerDpScopeFromContractIds(list);
  const legacy = await prisma.userPermission.findFirst({
    where: { userId, module: DP_APPROVE_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  if (!legacy) return null;
  const access = await getContractAccessForUser(userId, false);
  if (access.filter === 'ids' && access.ids.length > 0) {
    return buildManagerDpScopeFromContractIds(access.ids);
  }
  return null;
}

export async function assertManagerCanActOnDpContract(
  userId: string,
  isAdmin: boolean,
  contractId: string | null,
  costCenterId?: string | null
): Promise<void> {
  if (isAdmin) return;
  const hasApprove = await userHasDpApprovePermission(userId);
  if (!hasApprove) {
    throw createError('Sem permissão para aprovar solicitações DP', 403);
  }

  if (contractId) {
    const ok = await prisma.userDpApprovalContract.findFirst({
      where: { userId, contractId },
      select: { id: true },
    });
    if (ok) return;
    const legacy = await prisma.userPermission.findFirst({
      where: { userId, module: DP_APPROVE_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
    });
    if (legacy) {
      const access = await getContractAccessForUser(userId, false);
      if (access.filter === 'ids' && access.ids.includes(contractId)) return;
    }
  }

  if (costCenterId) {
    const contracts = await prisma.contract.findMany({
      where: { costCenterId },
      select: { id: true },
    });
    for (const c of contracts) {
      try {
        await assertManagerCanActOnDpContract(userId, false, c.id);
        return;
      } catch {
        // tenta próximo contrato do mesmo centro de custo
      }
    }
  }

  throw createError('Sem permissão para aprovar solicitações deste contrato', 403);
}

export async function assertManagerCanApproveDpRequest(
  userId: string,
  isAdmin: boolean,
  requestType: string,
  contractId: string | null,
  costCenterId?: string | null
): Promise<void> {
  if (isAdmin) return;
  if (isSensitiveDpRequestType(requestType)) {
    const hasPerm = await userHasRestrictedDpApprovePermission(userId);
    if (!hasPerm) {
      throw createError('Sem permissão para aprovar solicitações internas restritas', 403);
    }
    if (!costCenterId) {
      throw createError('Solicitação sem centro de custo para aprovação restrita', 403);
    }
    const ok = await prisma.userRestrictedDpApprovalCostCenter.findFirst({
      where: { userId, costCenterId },
      select: { id: true },
    });
    if (!ok) {
      throw createError(
        'Sem permissão para aprovar solicitações restritas deste centro de custo',
        403
      );
    }
    return;
  }
  await assertManagerCanActOnDpContract(userId, isAdmin, contractId, costCenterId);
}

/** Pode vincular centro de custo ao formulário de solicitação DP. */
export async function assertCanAttachCostCenterToDpRequest(
  req: AuthRequest,
  costCenterId: string
): Promise<void> {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  if (req.user.isAdmin) return;
  if (await userHasDpManagePermission(req.user.id)) return;
  if (await userHasSolicitacoesDpModule(req.user.id)) return;

  const cc = await prisma.costCenter.findFirst({
    where: { id: costCenterId, isActive: true },
    select: { id: true },
  });
  if (!cc) throw createError('Centro de custo não encontrado', 404);

  const access = await getContractAccessForUser(req.user.id, false);
  if (access.filter === 'ids') {
    const linked = await prisma.contract.findFirst({
      where: { costCenterId, id: { in: access.ids } },
      select: { id: true },
    });
    if (linked) return;
  }

  if (await userHasDpApprovePermission(req.user.id)) {
    const contracts = await prisma.contract.findMany({
      where: { costCenterId },
      select: { id: true },
    });
    for (const c of contracts) {
      const row = await prisma.userDpApprovalContract.findFirst({
        where: { userId: req.user.id, contractId: c.id },
        select: { id: true },
      });
      if (row) return;
    }
  }

  throw createError('Sem permissão para usar este centro de custo na solicitação', 403);
}

/** Pode vincular contrato ao formulário de solicitação geral. */
export async function assertCanAttachContractToDpRequest(
  req: AuthRequest,
  contractId: string
): Promise<void> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, costCenterId: true },
  });
  if (!contract) throw createError('Contrato não encontrado', 404);
  await assertCanAttachCostCenterToDpRequest(req, contract.costCenterId);
}

async function userIsGestorDpOnContract(userId: string, contractId: string): Promise<boolean> {
  const row = await prisma.userDpApprovalContract.findFirst({
    where: { userId, contractId },
    select: { id: true },
  });
  if (row) return true;
  const legacy = await prisma.userPermission.findFirst({
    where: { userId, module: DP_APPROVE_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  if (!legacy) return false;
  const access = await getContractAccessForUser(userId, false);
  return access.filter === 'ids' && access.ids.includes(contractId);
}

export async function userMayCreateSensitiveDpRequest(
  userId: string,
  isAdmin: boolean,
  contractId?: string | null,
  costCenterId?: string | null
): Promise<boolean> {
  if (isAdmin) return true;
  if (await userHasDpManagePermission(userId)) return true;
  if (await userHasSensitiveDpCreateControlePermission(userId)) return true;
  if (contractId && (await userIsGestorDpOnContract(userId, contractId))) return true;
  if (costCenterId) {
    const contracts = await prisma.contract.findMany({
      where: { costCenterId },
      select: { id: true },
    });
    for (const c of contracts) {
      if (await userIsGestorDpOnContract(userId, c.id)) return true;
    }
  }
  return false;
}
