import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { userHasLogisticsDeliveryAccess } from './logisticsDeliveryAccess';

export const LOGISTICS_DELIVERY_COMPLETION_MODULE_KEY = pathToModuleKey('/ponto/entrega-logistica');

export async function userHasLogisticsDeliveryCompletionModuleAccess(
  userId: string,
): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: LOGISTICS_DELIVERY_COMPLETION_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!row;
}

export async function userHasLogisticsDeliveryCompletionAccess(
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  if (await userHasLogisticsDeliveryCompletionModuleAccess(userId)) return true;
  return false;
}

export async function userHasLogisticsDeliveryReadAccess(
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  if (await userHasLogisticsDeliveryCompletionModuleAccess(userId)) return true;
  return userHasLogisticsDeliveryAccess(userId, isAdmin);
}

export async function assertUserHasLogisticsDeliveryCompletionAccess(
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  const ok = await userHasLogisticsDeliveryCompletionAccess(userId, isAdmin);
  if (!ok) {
    throw createError('Sem permissão para finalizar entregas logísticas', 403);
  }
}
