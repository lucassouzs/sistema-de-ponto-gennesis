import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { userIsAdministrator } from './kanbanAccess';

export const KANBAN_VALUES_MODULE_KEY = pathToModuleKey('/ponto/controle/ver-valores-kanban');

export async function userHasKanbanValuesPermission(userId: string): Promise<boolean> {
  if (await userIsAdministrator(userId)) return true;

  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: KANBAN_VALUES_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!row;
}
