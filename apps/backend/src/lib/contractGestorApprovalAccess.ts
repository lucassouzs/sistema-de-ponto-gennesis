import { PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';

async function userHasLegacyModule(userId: string, moduleKey: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: { userId, module: moduleKey, action: PERMISSION_ACCESS_ACTION, allowed: true },
    select: { id: true },
  });
  return !!row;
}

/** Contratos em que o usuário é gestor (coluna «Gestor» na aba Contratos). */
export async function userHasContractGestorAssignment(userId: string): Promise<boolean> {
  const row = await prisma.userDpApprovalContract.findFirst({
    where: { userId },
    select: { id: true },
  });
  return !!row;
}

export async function getContractGestorCostCenterIds(userId: string): Promise<string[]> {
  const contractIds = (
    await prisma.userDpApprovalContract.findMany({
      where: { userId },
      select: { contractId: true },
    })
  ).map((row) => row.contractId);

  if (contractIds.length === 0) return [];

  const rows = await prisma.contract.findMany({
    where: { id: { in: contractIds } },
    select: { costCenterId: true },
    distinct: ['costCenterId'],
  });

  return rows.map((row) => row.costCenterId).filter(Boolean);
}

/**
 * null = sem filtro por contrato (admin ou permissão legada Controle).
 * string[] = centros de custo dos contratos em que é gestor (pode ser vazio).
 */
export async function getContractGestorListScopeCostCenterIds(
  userId: string,
  isAdmin: boolean,
  legacyControleModuleKey: string,
): Promise<string[] | null> {
  if (isAdmin) return null;
  if (await userHasLegacyModule(userId, legacyControleModuleKey)) return null;
  if (!(await userHasContractGestorAssignment(userId))) return null;
  return getContractGestorCostCenterIds(userId);
}

export async function assertUserIsContractGestorForCostCenter(
  userId: string,
  isAdmin: boolean,
  legacyControleModuleKey: string,
  costCenterId: string | null | undefined,
): Promise<void> {
  if (isAdmin) return;

  const scopeIds = await getContractGestorListScopeCostCenterIds(userId, false, legacyControleModuleKey);
  if (scopeIds === null) return;

  if (!costCenterId || scopeIds.length === 0 || !scopeIds.includes(costCenterId)) {
    throw createError('Sem permissão para aprovar solicitações deste contrato', 403);
  }
}
