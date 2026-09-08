import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import {
  assertUserIsContractGestorForCostCenter,
  getContractGestorListScopeCostCenterIds,
  userHasContractGestorAssignment,
} from './contractGestorApprovalAccess';

export const RM_APPROVE_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-requisicoes-materiais');
export const GERENCIAR_MATERIAIS_MODULE_KEY = pathToModuleKey('/ponto/gerenciar-materiais');
export const MAPA_COTACAO_MODULE_KEY = pathToModuleKey('/ponto/mapa-cotacao');

/** Gestor por contrato ou permissão legada Controle. */
export async function userHasRmApprovePermission(userId: string): Promise<boolean> {
  if (await userHasContractGestorAssignment(userId)) return true;
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: RM_APPROVE_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!row;
}

/** Mesma regra da tela Mapa de Cotação: admin ou permissão do módulo. */
export async function userHasMapaCotacaoAccess(
  userId: string,
  isAdmin?: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: MAPA_COTACAO_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!row;
}

/**
 * Enviar RM para Correção (IN_REVIEW): aprovador de RM ou quem usa o mapa de cotação.
 * Não exige gestor por contrato — Compras no mapa também pode devolver.
 */
export async function assertUserCanSendRmToCorrection(
  userId: string,
  isAdmin?: boolean,
): Promise<void> {
  if (isAdmin) return;
  if (await userHasRmApprovePermission(userId)) return;
  if (await userHasMapaCotacaoAccess(userId, false)) return;
  throw createError('Sem permissão para enviar requisição para correção', 403);
}

export async function userHasFullMaterialRequestListAccess(
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: GERENCIAR_MATERIAIS_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!row;
}

/** Centros de custo permitidos na listagem de RMs para aprovador gestor; null = sem filtro. */
export async function getRmApproverListScopeCostCenterIds(
  userId: string,
  isAdmin: boolean,
): Promise<string[] | null> {
  if (await userHasFullMaterialRequestListAccess(userId, isAdmin)) return null;
  return getContractGestorListScopeCostCenterIds(userId, isAdmin, RM_APPROVE_MODULE_KEY);
}

export async function assertUserCanApproveMaterialRequests(
  userId: string,
  isAdmin?: boolean,
): Promise<void> {
  if (isAdmin) return;
  if (await userHasRmApprovePermission(userId)) return;
  throw createError('Sem permissão para aprovar requisições de materiais', 403);
}

export async function assertUserCanApproveMaterialRequestForCostCenter(
  userId: string,
  isAdmin: boolean,
  costCenterId: string | null | undefined,
): Promise<void> {
  if (isAdmin) return;
  await assertUserCanApproveMaterialRequests(userId, isAdmin);
  await assertUserIsContractGestorForCostCenter(
    userId,
    isAdmin,
    RM_APPROVE_MODULE_KEY,
    costCenterId,
  );
}

/** Decisões do aprovador (não do solicitante). */
export function isRmApproverStatusChange(
  nextStatus: string,
  requestedBy: string,
  actorUserId: string,
): boolean {
  if (nextStatus === 'APPROVED' || nextStatus === 'IN_REVIEW') return true;
  if (nextStatus === 'CANCELLED' && requestedBy !== actorUserId) return true;
  return false;
}
