import { PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

/** Igual a pathToModuleKey('/ponto/contratos') no pacote permission-modules. */
export const CONTRACTS_MODULE_KEY = 'ponto_contratos';

export type ContractAccessFilter =
  | { filter: 'all' }
  | { filter: 'none' }
  | { filter: 'ids'; ids: string[] };

export async function getContractAccessForUser(
  userId: string,
  isAdmin: boolean
): Promise<ContractAccessFilter> {
  if (isAdmin) return { filter: 'all' };

  const hasModule = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: CONTRACTS_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
  });

  if (!hasModule) return { filter: 'none' };

  const rows = await prisma.userContractPermission.findMany({
    where: { userId },
    select: { contractId: true },
  });

  return { filter: 'ids', ids: rows.map((r) => r.contractId) };
}

export async function assertContractAccess(req: AuthRequest, contractId: string): Promise<void> {
  if (!req.user) throw createError('Usuário não autenticado', 401);

  const access = await getContractAccessForUser(req.user.id, req.user.isAdmin);
  if (access.filter === 'all') return;
  if (access.filter === 'none') {
    throw createError('Sem permissão para acessar contratos', 403);
  }
  if (!access.ids.includes(contractId)) {
    throw createError('Sem permissão para este contrato', 403);
  }
}

/** Flags da aba «Contratos» em permissões (orçamento, relatórios, OS, produção semanal). */
export type ContractScopedModuleFlag = 'orcamento' | 'relatorios' | 'ordemServico' | 'producaoSemanal';

export async function assertContractModulePermission(
  req: AuthRequest,
  contractId: string,
  module: ContractScopedModuleFlag
): Promise<void> {
  await assertContractAccess(req, contractId);
  if (!req.user) throw createError('Usuário não autenticado', 401);
  if (req.user.isAdmin) return;

  const row = await prisma.userContractPermission.findUnique({
    where: {
      userId_contractId: { userId: req.user.id, contractId },
    },
    select: {
      accessOrcamento: true,
      accessRelatorios: true,
      accessOrdemServico: true,
      accessProducaoSemanal: true,
    },
  });

  const ok =
    module === 'orcamento'
      ? row?.accessOrcamento === true
      : module === 'relatorios'
        ? row?.accessRelatorios === true
        : module === 'ordemServico'
          ? row?.accessOrdemServico === true
          : row?.accessProducaoSemanal === true;

  if (!ok) {
    const msg =
      module === 'producaoSemanal'
        ? 'Sem permissão de Produção Semanal neste contrato'
        : module === 'ordemServico'
          ? 'Sem permissão de Ordem de Serviço neste contrato'
          : module === 'relatorios'
            ? 'Sem permissão de Relatórios neste contrato'
            : 'Sem permissão de Orçamento neste contrato';
    throw createError(msg, 403);
  }
}

/** Contratos: garante que usuário não-admin pode criar (ação granular `criar`). Administradores passam sempre. */
export async function assertUserCanCreateContract(userId: string, isAdmin: boolean): Promise<void> {
  if (isAdmin) return;
  const can = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: CONTRACTS_MODULE_KEY,
      action: 'criar',
      allowed: true,
    },
    select: { id: true },
  });
  if (!can) {
    throw createError('Sem permissão para criar contratos', 403);
  }
}
