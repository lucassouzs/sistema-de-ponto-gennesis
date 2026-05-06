import {
  getPermissionModuleKeys,
  isValidPermissionModuleKey,
  PERMISSION_ACCESS_ACTION,
} from '@sistema-ponto/permission-modules';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

const VALID_PERMISSION_ACTIONS = new Set<string>([
  PERMISSION_ACCESS_ACTION,
  'criar',
  'ver',
  'editar',
  'excluir',
]);

/** Remove linhas de permissão cujo módulo não existe mais no registro central. */
export async function removeOrphanUserPermissions(): Promise<{ removed: number }> {
  try {
    const keys = getPermissionModuleKeys();
    const result = await prisma.userPermission.deleteMany({
      where: { module: { notIn: keys } },
    });
    return { removed: result.count };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
      console.warn(
        'Tabela user_permissions não encontrada. Aplique as migrações: cd apps/backend && npx prisma migrate deploy'
      );
      return { removed: 0 };
    }
    throw e;
  }
}

export function filterValidPermissionPayload(
  items: Array<{ module: string; action?: string }>
): Array<{ module: string; action: string }> {
  return items
    .filter((p) => isValidPermissionModuleKey(p.module))
    .map((p) => ({ module: p.module, action: p.action ?? PERMISSION_ACCESS_ACTION }))
    .filter((p) => VALID_PERMISSION_ACTIONS.has(p.action));
}
