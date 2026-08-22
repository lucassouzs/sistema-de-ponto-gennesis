import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';

export const TOOL_RENTAL_SUPPLIES_MODULE_KEY = pathToModuleKey(
  '/ponto/solicitacoes-ferramentas'
);

export async function userHasToolRentalSuppliesModuleAccess(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: TOOL_RENTAL_SUPPLIES_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!row;
}

export async function userHasToolRentalSuppliesAccess(
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  if (isAdmin) return true;
  return userHasToolRentalSuppliesModuleAccess(userId);
}

export async function assertUserHasToolRentalSuppliesAccess(
  userId: string,
  isAdmin: boolean
): Promise<void> {
  const ok = await userHasToolRentalSuppliesAccess(userId, isAdmin);
  if (!ok) {
    throw createError('Sem permissão para analisar solicitações de ferramentas no Suprimentos', 403);
  }
}
