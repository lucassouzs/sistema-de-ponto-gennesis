import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';

export const CONTROLE_NFS_MODULE_KEY = pathToModuleKey('/ponto/financeiro/controle-nfs');

/**
 * Páginas de Métricas que leem a mesma planilha (Relatório de Custos) por endpoints
 * compartilhados, sem passar pela página de Controle de NF's.
 */
const CONTROLE_NFS_SHARED_MODULE_KEYS = [
  CONTROLE_NFS_MODULE_KEY,
  pathToModuleKey('/ponto/contratos/controle-geral'),
  pathToModuleKey('/ponto/contratos/socios'),
  pathToModuleKey('/ponto/contratos/gastos-operacionais'),
];

async function userHasAnyModuleAccess(userId: string, moduleKeys: string[]): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: { in: moduleKeys },
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!row;
}

/** Alinhado ao front (`useRoutePermission`): admin ou permissão do módulo. */
export async function userHasControleNfsAccess(userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  return userHasAnyModuleAccess(userId, [CONTROLE_NFS_MODULE_KEY]);
}

/** Endpoints da planilha consumidos também por Controle Geral, Sócios e Gastos Operacionais. */
export async function userHasControleNfsSharedDataAccess(
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  return userHasAnyModuleAccess(userId, CONTROLE_NFS_SHARED_MODULE_KEYS);
}
