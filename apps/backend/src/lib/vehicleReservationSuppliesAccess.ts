import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';

export const VEHICLE_RESERVATION_SUPPLIES_MODULE_KEY = pathToModuleKey(
  '/ponto/solicitacoes-reserva-veiculos'
);

export async function userHasVehicleReservationSuppliesModuleAccess(
  userId: string
): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: VEHICLE_RESERVATION_SUPPLIES_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true
    },
    select: { id: true }
  });
  return !!row;
}

export async function userHasVehicleReservationSuppliesAccess(
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  if (isAdmin) return true;
  return userHasVehicleReservationSuppliesModuleAccess(userId);
}

export async function assertUserHasVehicleReservationSuppliesAccess(
  userId: string,
  isAdmin: boolean
): Promise<void> {
  const ok = await userHasVehicleReservationSuppliesAccess(userId, isAdmin);
  if (!ok) {
    throw createError('Sem permissão para gerenciar reservas de veículos no Suprimentos', 403);
  }
}
