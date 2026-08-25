import {
  DEFAULT_EMPLOYEE_ACCESS_MODULE_KEYS,
  PERMISSION_ACCESS_ACTION,
  getPermissionModuleKeys,
  isValidPermissionModuleKey,
} from '@sistema-ponto/permission-modules';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
// Nota: reload do registro central de permission-modules — «Aprovações» removida da matriz; visibilidade agora é derivada (gestor + Espelho NF).

const VALID_PERMISSION_ACTIONS = new Set<string>([
  PERMISSION_ACCESS_ACTION,
  'criar',
  'ver',
  'editar',
  'excluir',
]);

type PermissionDbClient = {
  user: { findMany: typeof prisma.user.findMany };
  userPermission: {
    findMany: typeof prisma.userPermission.findMany;
    createMany: typeof prisma.userPermission.createMany;
    deleteMany: typeof prisma.userPermission.deleteMany;
  };
};

function isDatabaseUnreachableError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.name === 'PrismaClientInitializationError') return true;
  const m = e.message.toLowerCase();
  return m.includes("can't reach database server") || m.includes('could not connect');
}

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
    if (isDatabaseUnreachableError(e)) {
      console.warn(
        'PostgreSQL indisponível; limpeza de permissões órfãs ignorada. Verifique se o servidor está em execução (ex.: docker compose up -d na raiz do monorepo) e se DATABASE_URL no .env aponta para o host/porta corretos.'
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

/**
 * Garante as 3 permissões padrão (Solicitações DP/ADM/TST, Reserva de Veículos,
 * Solicitar Combustível) com ação `acesso` (VER na UI).
 * - Sem `userIds`: todos os usuários do sistema.
 * - Com `userIds`: só esses IDs (ex.: usuário recém-criado).
 */
export async function ensureDefaultEmployeeAccessPermissions(
  userIds?: string[],
  client: PermissionDbClient = prisma
): Promise<{ granted: number }> {
  try {
    const modules = DEFAULT_EMPLOYEE_ACCESS_MODULE_KEYS.filter((key) =>
      isValidPermissionModuleKey(key)
    );
    if (modules.length === 0) return { granted: 0 };

    const users =
      userIds && userIds.length > 0
        ? userIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
        : (
            await client.user.findMany({
              select: { id: true },
            })
          ).map((u) => u.id);

    if (users.length === 0) return { granted: 0 };

    const existing = await client.userPermission.findMany({
      where: {
        userId: { in: users },
        module: { in: [...modules] },
        action: PERMISSION_ACCESS_ACTION,
      },
      select: { userId: true, module: true },
    });
    const have = new Set(existing.map((row) => `${row.userId}\0${row.module}`));

    const toCreate: Array<{
      userId: string;
      module: string;
      action: string;
      allowed: boolean;
    }> = [];
    for (const userId of users) {
      for (const module of modules) {
        if (have.has(`${userId}\0${module}`)) continue;
        toCreate.push({
          userId,
          module,
          action: PERMISSION_ACCESS_ACTION,
          allowed: true,
        });
      }
    }

    if (toCreate.length === 0) return { granted: 0 };

    const chunkSize = 1000;
    for (let i = 0; i < toCreate.length; i += chunkSize) {
      await client.userPermission.createMany({
        data: toCreate.slice(i, i + chunkSize),
        skipDuplicates: true,
      });
    }

    return { granted: toCreate.length };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
      console.warn(
        'Tabela user_permissions não encontrada. Aplique as migrações: cd apps/backend && npx prisma migrate deploy'
      );
      return { granted: 0 };
    }
    if (isDatabaseUnreachableError(e)) {
      console.warn(
        'PostgreSQL indisponível; concessão de permissões padrão ignorada.'
      );
      return { granted: 0 };
    }
    throw e;
  }
}
