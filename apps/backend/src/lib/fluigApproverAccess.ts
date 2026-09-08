import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';

const FLUIG_APROVADORES_CONTROLE_KEY = pathToModuleKey(
  '/ponto/controle/gerenciar-aprovadores-fluig'
);

export type FluigApproverAccess = {
  fullAccess: boolean;
  nameKeys: string[];
};

function normalizeApproverNameKey(nameOrKey: string): string {
  return nameOrKey.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeFluigApproverNameKey(nameOrKey: string): string {
  return normalizeApproverNameKey(nameOrKey);
}

async function userHasModulePermission(userId: string, moduleKey: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: moduleKey,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function userHasFluigApproversControlePermission(
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  if (isAdmin) return true;
  return userHasModulePermission(userId, FLUIG_APROVADORES_CONTROLE_KEY);
}

export async function getFluigApproverAccessForUser(
  userId: string,
  isAdmin: boolean
): Promise<FluigApproverAccess> {
  if (await userHasFluigApproversControlePermission(userId, isAdmin)) {
    return { fullAccess: true, nameKeys: [] };
  }

  const scoped = await prisma.fluigWorkflowApproverViewer.findMany({
    where: { userId },
    select: { approverNameKey: true },
    orderBy: { approverNameKey: 'asc' },
  });

  if (scoped.length === 0) {
    return { fullAccess: false, nameKeys: [] };
  }

  return {
    fullAccess: false,
    nameKeys: scoped.map((row) => row.approverNameKey),
  };
}

export async function userCanAccessFluigApprover(
  userId: string,
  isAdmin: boolean,
  approverNameKey: string
): Promise<boolean> {
  const access = await getFluigApproverAccessForUser(userId, isAdmin);
  if (access.fullAccess) return true;
  const key = normalizeApproverNameKey(approverNameKey);
  return access.nameKeys.includes(key);
}

export async function userCanManageFluigApproverViewers(
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  return userHasFluigApproversControlePermission(userId, isAdmin);
}

/** Usuários com acesso total (admin ou módulo de controle) — não entram na lista de designados. */
export async function listFluigApproverFullAccessUserIds(): Promise<Set<string>> {
  const [permissionRows, adminEmployees] = await Promise.all([
    prisma.userPermission.findMany({
      where: {
        module: FLUIG_APROVADORES_CONTROLE_KEY,
        action: PERMISSION_ACCESS_ACTION,
        allowed: true,
      },
      select: { userId: true },
    }),
    prisma.employee.findMany({
      where: { position: { equals: 'Administrador', mode: 'insensitive' } },
      select: { userId: true },
    }),
  ]);

  return new Set([
    ...permissionRows.map((row) => row.userId),
    ...adminEmployees.map((row) => row.userId),
  ]);
}

async function userHasFluigApproverFullAccessById(userId: string): Promise<boolean> {
  const fullAccessIds = await listFluigApproverFullAccessUserIds();
  return fullAccessIds.has(userId);
}

export type FluigApproverViewerRow = {
  id: string;
  userId: string;
  approverNameKey: string;
  approverName: string;
  user: {
    id: string;
    name: string;
    email: string;
    profilePhotoUrl: string | null;
  };
};

export async function listFluigApproverViewers(
  approverNameKey: string
): Promise<FluigApproverViewerRow[]> {
  const key = normalizeApproverNameKey(approverNameKey);
  const [rows, fullAccessIds] = await Promise.all([
    prisma.fluigWorkflowApproverViewer.findMany({
      where: { approverNameKey: key },
      orderBy: { user: { name: 'asc' } },
      select: {
        id: true,
        userId: true,
        approverNameKey: true,
        approverName: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profilePhotoUrl: true,
          },
        },
      },
    }),
    listFluigApproverFullAccessUserIds(),
  ]);

  return rows.filter((row) => !fullAccessIds.has(row.userId));
}

export async function listAllFluigApproverViewerKeys(): Promise<Record<string, string[]>> {
  const [rows, fullAccessIds] = await Promise.all([
    prisma.fluigWorkflowApproverViewer.findMany({
      select: { approverNameKey: true, userId: true },
    }),
    listFluigApproverFullAccessUserIds(),
  ]);
  const map: Record<string, string[]> = {};
  for (const row of rows) {
    if (fullAccessIds.has(row.userId)) continue;
    if (!map[row.approverNameKey]) map[row.approverNameKey] = [];
    map[row.approverNameKey].push(row.userId);
  }
  return map;
}

export async function replaceFluigApproverViewers(params: {
  approverNameKey: string;
  approverName: string;
  userIds: string[];
  updatedBy: string;
}): Promise<FluigApproverViewerRow[]> {
  const key = normalizeApproverNameKey(params.approverNameKey);
  const approverName = params.approverName.trim() || key;
  const uniqueUserIds = Array.from(new Set(params.userIds.map((id) => id.trim()).filter(Boolean)));

  await prisma.$transaction(async (tx) => {
    await tx.fluigWorkflowApproverViewer.deleteMany({
      where: { approverNameKey: key },
    });

    if (uniqueUserIds.length > 0) {
      await tx.fluigWorkflowApproverViewer.createMany({
        data: uniqueUserIds.map((userId) => ({
          approverNameKey: key,
          approverName,
          userId,
          updatedBy: params.updatedBy,
        })),
      });
    }
  });

  return listFluigApproverViewers(key);
}

export async function addFluigApproverViewer(params: {
  approverNameKey: string;
  approverName: string;
  userId: string;
  updatedBy: string;
}): Promise<FluigApproverViewerRow> {
  if (await userHasFluigApproverFullAccessById(params.userId)) {
    throw new Error('Usuário já tem acesso total aos aprovadores');
  }

  const key = normalizeApproverNameKey(params.approverNameKey);
  const approverName = params.approverName.trim() || key;

  const row = await prisma.fluigWorkflowApproverViewer.upsert({
    where: {
      approverNameKey_userId: {
        approverNameKey: key,
        userId: params.userId,
      },
    },
    create: {
      approverNameKey: key,
      approverName,
      userId: params.userId,
      updatedBy: params.updatedBy,
    },
    update: {
      approverName,
      updatedBy: params.updatedBy,
    },
    select: {
      id: true,
      userId: true,
      approverNameKey: true,
      approverName: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          profilePhotoUrl: true,
        },
      },
    },
  });

  return row;
}

export async function removeFluigApproverViewer(
  approverNameKey: string,
  userId: string
): Promise<void> {
  const key = normalizeApproverNameKey(approverNameKey);
  await prisma.fluigWorkflowApproverViewer.deleteMany({
    where: { approverNameKey: key, userId },
  });
}
