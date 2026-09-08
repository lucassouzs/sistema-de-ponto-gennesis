import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';

export const FUEL_APPROVE_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-combustivel');

export async function userHasFuelApproveControlePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: FUEL_APPROVE_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!row;
}

/** Pode aprovar combustível: apenas permissão Controle (não herda gestor de contrato). */
export async function userHasFuelApprovePermission(userId: string): Promise<boolean> {
  return userHasFuelApproveControlePermission(userId);
}

/**
 * Escopo para listar/decidir solicitações de combustível.
 * Permissão Controle → todas; sem permissão → null.
 */
export async function getManagerFuelApprovalContractScope(
  userId: string,
  isAdmin: boolean,
): Promise<Record<string, unknown> | null> {
  if (isAdmin) return {};
  if (await userHasFuelApproveControlePermission(userId)) return {};
  return null;
}

export async function assertManagerCanActOnFuelContract(
  userId: string,
  isAdmin: boolean,
  _contractId: string | null,
): Promise<void> {
  if (isAdmin) return;
  if (await userHasFuelApproveControlePermission(userId)) return;
  throw createError('Sem permissão para aprovar solicitações de combustível', 403);
}
