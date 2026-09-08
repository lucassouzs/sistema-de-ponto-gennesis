import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';

export const FUEL_SUPPLIES_MODULE_KEY = pathToModuleKey('/ponto/solicitacoes-combustivel');

export async function userHasFuelSuppliesModuleAccess(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: FUEL_SUPPLIES_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!row;
}

export async function userHasFuelSuppliesAccess(userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  return userHasFuelSuppliesModuleAccess(userId);
}

export async function assertUserHasFuelSuppliesAccess(
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  const ok = await userHasFuelSuppliesAccess(userId, isAdmin);
  if (!ok) {
    throw createError('Sem permissão para gerenciar solicitações de combustível no Suprimentos', 403);
  }
}
