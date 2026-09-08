import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { isUnbRelatedLabel } from './unbBranding';

/** Funcionário cujo centro de custo cadastrado é UNB (string livre no Employee). */
export function isEmployeeUnbUser(employeeCostCenter: string | null | undefined): boolean {
  return isUnbRelatedLabel(employeeCostCenter);
}

/** CostCenter cadastrado (name/code) ligado à UNB — OC pula compras e diretoria. */
export function isUnbCostCenterRecord(
  costCenter: { name?: string | null; code?: string | null } | null | undefined,
): boolean {
  if (!costCenter) return false;
  return isUnbRelatedLabel(costCenter.name) || isUnbRelatedLabel(costCenter.code);
}

/** IDs de CostCenter cujo name/code são UNB. */
export async function getUnbCostCenterIds(): Promise<string[]> {
  const rows = await prisma.costCenter.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
  });
  return rows
    .filter((r) => isUnbRelatedLabel(r.name) || isUnbRelatedLabel(r.code))
    .map((r) => r.id);
}

/**
 * null = sem restrição UNB (admin ou usuário não-UNB).
 * string[] = só esses centros de custo (usuário UNB).
 */
export async function getUserUnbCostCenterScope(
  userId: string,
  isAdmin: boolean,
): Promise<string[] | null> {
  if (isAdmin) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employee: { select: { costCenter: true } } },
  });
  if (!isEmployeeUnbUser(user?.employee?.costCenter)) return null;

  return getUnbCostCenterIds();
}

export async function assertCostCenterAllowedForUnbUser(
  userId: string,
  isAdmin: boolean,
  costCenterId: string | null | undefined,
): Promise<void> {
  const scope = await getUserUnbCostCenterScope(userId, isAdmin);
  if (scope === null) return;
  if (!costCenterId || scope.length === 0 || !scope.includes(costCenterId)) {
    throw createError('Sem permissão para usar este centro de custo (escopo UNB)', 403);
  }
}

/** Intersecta filtro pedido com escopo UNB (quando aplicável). */
export function applyUnbCostCenterScopeToIdFilter(
  scope: string[] | null,
  requestedId?: string | null,
): { costCenterId?: string; costCenterIds?: string[]; denyAll?: boolean } {
  if (scope === null) {
    return requestedId ? { costCenterId: requestedId } : {};
  }
  if (scope.length === 0) {
    return { denyAll: true };
  }
  if (requestedId) {
    if (!scope.includes(requestedId)) return { denyAll: true };
    return { costCenterId: requestedId };
  }
  return { costCenterIds: scope };
}
