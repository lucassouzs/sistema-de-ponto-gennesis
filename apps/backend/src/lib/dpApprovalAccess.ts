import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { getContractAccessForUser } from './contractAccess';
import { AuthRequest } from '../middleware/auth';

export const DP_APPROVE_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-solicitacoes-dp');
export const DP_MANAGE_MODULE_KEY = pathToModuleKey('/ponto/gerenciar-solicitacoes-dp');
/** Controle: rescisão e alteração de função/salário (além de admin, gerenciar DP ou Gestor DP no contrato). */
export const DP_SENSITIVE_CREATE_MODULE_KEY = pathToModuleKey('/ponto/controle/criar-tipos-restritos-dp');

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

export async function userHasDpManagePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: { userId, module: DP_MANAGE_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
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
  if (list.length > 0) return { contractId: { in: list } };
  const legacy = await prisma.userPermission.findFirst({
    where: { userId, module: DP_APPROVE_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  if (!legacy) return null;
  const access = await getContractAccessForUser(userId, false);
  if (access.filter === 'ids' && access.ids.length > 0) {
    return { contractId: { in: access.ids } };
  }
  return null;
}

export async function assertManagerCanActOnDpContract(
  userId: string,
  isAdmin: boolean,
  contractId: string | null
): Promise<void> {
  if (isAdmin) return;
  if (!contractId) {
    throw createError('Sem permissão para esta solicitação', 403);
  }
  const hasApprove = await userHasDpApprovePermission(userId);
  if (!hasApprove) {
    throw createError('Sem permissão para aprovar solicitações DP', 403);
  }
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
  throw createError('Sem permissão para aprovar solicitações deste contrato', 403);
}

/** Pode vincular o contrato ao formulário de solicitação DP: módulo Contratos, gestão DP ou aprovador com contrato vinculado. */
export async function assertCanAttachContractToDpRequest(req: AuthRequest, contractId: string): Promise<void> {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  if (req.user.isAdmin) return;
  if (await userHasDpManagePermission(req.user.id)) return;

  const access = await getContractAccessForUser(req.user.id, false);
  if (access.filter === 'ids' && access.ids.includes(contractId)) {
    return;
  }

  if (await userHasDpApprovePermission(req.user.id)) {
    const row = await prisma.userDpApprovalContract.findFirst({
      where: { userId: req.user.id, contractId },
      select: { id: true },
    });
    if (row) return;
    const legacy = await prisma.userPermission.findFirst({
      where: {
        userId: req.user.id,
        module: DP_APPROVE_MODULE_KEY,
        action: PERMISSION_ACCESS_ACTION,
        allowed: true,
      },
    });
    if (legacy && access.filter === 'ids' && access.ids.includes(contractId)) return;
  }

  throw createError('Sem permissão para usar este contrato na solicitação', 403);
}

export async function userMayCreateSensitiveDpRequest(
  userId: string,
  isAdmin: boolean,
  contractId: string
): Promise<boolean> {
  if (isAdmin) return true;
  if (await userHasDpManagePermission(userId)) return true;
  if (await userHasSensitiveDpCreateControlePermission(userId)) return true;
  if (!(await userHasDpApprovePermission(userId))) return false;
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

/** Contratos que podem ser usados no formulário de solicitação DP (acesso a contratos OU escopo de aprovação DP; DP gestão = todos). */
export async function getDpFormContractWhere(
  userId: string,
  isAdmin: boolean
): Promise<{ id?: { in: string[] } } | Record<string, never>> {
  if (isAdmin) return {};
  if (await userHasDpManagePermission(userId)) return {};

  const ids = new Set<string>();
  const access = await getContractAccessForUser(userId, false);
  if (access.filter === 'ids') {
    for (const id of access.ids) ids.add(id);
  }
  if (await userHasDpApprovePermission(userId)) {
    const dpRows = await prisma.userDpApprovalContract.findMany({
      where: { userId },
      select: { contractId: true },
    });
    if (dpRows.length > 0) {
      for (const r of dpRows) ids.add(r.contractId);
    } else {
      const legacy = await prisma.userPermission.findFirst({
        where: { userId, module: DP_APPROVE_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
      });
      if (legacy && access.filter === 'ids') {
        for (const id of access.ids) ids.add(id);
      }
    }
  }
  if (ids.size === 0) return { id: { in: [] } };
  return { id: { in: Array.from(ids) } };
}
