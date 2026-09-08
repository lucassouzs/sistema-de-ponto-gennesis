import { PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

/** Igual a pathToModuleKey('/ponto/contratos') no pacote permission-modules. */
export const CONTRACTS_MODULE_KEY = 'ponto_contratos';
/** Igual a pathToModuleKey('/ponto/contratos/socios'). */
export const CONTRACTS_SOCIOS_MODULE_KEY = 'ponto_contratos_socios';

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

/**
 * Gastos operacionais (TOTVS) na tela Sócios: libera quem tem Contratos
 * ou só o módulo Contratos Sócios (sem precisar do Contratos geral).
 */
export async function userCanAccessGastosOperacionais(
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  const access = await getContractAccessForUser(userId, isAdmin);
  if (access.filter !== 'none') return true;

  const hasSociosModule = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: CONTRACTS_SOCIOS_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return Boolean(hasSociosModule);
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

export async function assertRecebimentoEntregasOnContract(
  req: AuthRequest,
  contractId: string | null | undefined
): Promise<void> {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  if (req.user.isAdmin) return;
  if (!contractId) {
    throw createError('Entrega sem contrato vinculado', 403);
  }
  await assertContractAccess(req, contractId);
}

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

async function assertUserHasContractMutation(
  userId: string,
  isAdmin: boolean,
  action: 'criar' | 'editar' | 'excluir',
  message: string,
): Promise<void> {
  if (isAdmin) return;

  const crudActions = ['ver', 'criar', 'editar', 'excluir'] as const;
  const granularRows = await prisma.userPermission.findMany({
    where: {
      userId,
      module: CONTRACTS_MODULE_KEY,
      action: { in: [...crudActions] },
      allowed: true,
    },
    select: { action: true },
  });

  // Matriz nova: exige a ação explícita.
  if (granularRows.length > 0) {
    if (!granularRows.some((r) => r.action === action)) {
      throw createError(message, 403);
    }
    return;
  }

  // Legado: só `acesso` no módulo (sem Ver/Criar/Editar/Excluir) → libera mutação.
  const hasAcesso = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: CONTRACTS_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  if (!hasAcesso) {
    throw createError(message, 403);
  }
}

/** Contratos: ação granular `criar`. Administradores passam sempre. */
export async function assertUserCanCreateContract(userId: string, isAdmin: boolean): Promise<void> {
  await assertUserHasContractMutation(
    userId,
    isAdmin,
    'criar',
    'Sem permissão para criar contratos',
  );
}

/** Contratos: ação granular `editar`. Administradores passam sempre. */
export async function assertUserCanEditContract(userId: string, isAdmin: boolean): Promise<void> {
  await assertUserHasContractMutation(
    userId,
    isAdmin,
    'editar',
    'Sem permissão para editar contratos',
  );
}

/** Contratos: ação granular `excluir`. Administradores passam sempre. */
export async function assertUserCanDeleteContract(userId: string, isAdmin: boolean): Promise<void> {
  await assertUserHasContractMutation(
    userId,
    isAdmin,
    'excluir',
    'Sem permissão para excluir contratos',
  );
}
