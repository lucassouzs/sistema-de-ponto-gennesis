import { GestaoOsStatus } from '@prisma/client';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';

/** Ver/abrir chamados — módulo principal Gestão de OS (visão geral / operação). */
export const GESTAO_OS_MODULE_KEY = pathToModuleKey('/ponto/sistema-gestao-os');
/** Solicitar e acompanhar os próprios chamados (fluxo pessoal). */
export const GESTAO_OS_MEUS_CHAMADOS_KEY = pathToModuleKey('/ponto/meus-chamados');
/** Cadastros (locais, ativos, prestadores…). */
export const GESTAO_OS_CADASTROS_KEY = pathToModuleKey('/ponto/sistema-gestao-os/cadastros');
/** Analisar / aprovar / cancelar / atribuir. */
export const GESTAO_OS_ANALISAR_KEY = pathToModuleKey('/ponto/controle/gestao-os-analisar');
/** Executar OS em campo. */
export const GESTAO_OS_EXECUTAR_KEY = pathToModuleKey('/ponto/controle/gestao-os-executar');
/** Encerrar e avaliar. */
export const GESTAO_OS_ENCERRAR_KEY = pathToModuleKey('/ponto/controle/gestao-os-encerrar');

export type GestaoOsAccessContext = {
  userId: string;
  isAdmin: boolean;
  canAnalisar: boolean;
  canExecutar: boolean;
  canEncerrar: boolean;
  canCadastros: boolean;
  /** Pode abrir e listar os próprios chamados (Meus Chamados). */
  canMeusChamados: boolean;
  /** Pode ver a visão geral (todos os chamados) — Central de Chamados / operação. */
  canViewAll: boolean;
  /** @deprecated single-tenant — sempre null */
  companyId: string | null;
  /** @deprecated */
  profile: null;
  memberships: [];
};

async function userHasModule(userId: string, module: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: { userId, module, action: PERMISSION_ACCESS_ACTION, allowed: true }
  });
  return !!row;
}

export async function resolveGestaoOsAccess(input: {
  userId: string;
  isAdmin: boolean;
  companyId?: string | null;
  requireCompany?: boolean;
}): Promise<GestaoOsAccessContext> {
  if (input.isAdmin) {
    return {
      userId: input.userId,
      isAdmin: true,
      canAnalisar: true,
      canExecutar: true,
      canEncerrar: true,
      canCadastros: true,
      canMeusChamados: true,
      canViewAll: true,
      companyId: null,
      profile: null,
      memberships: []
    };
  }

  const [canModule, canMeusChamados, canAnalisar, canExecutar, canEncerrar, canCadastros] =
    await Promise.all([
      userHasModule(input.userId, GESTAO_OS_MODULE_KEY),
      userHasModule(input.userId, GESTAO_OS_MEUS_CHAMADOS_KEY),
      userHasModule(input.userId, GESTAO_OS_ANALISAR_KEY),
      userHasModule(input.userId, GESTAO_OS_EXECUTAR_KEY),
      userHasModule(input.userId, GESTAO_OS_ENCERRAR_KEY),
      userHasModule(input.userId, GESTAO_OS_CADASTROS_KEY)
    ]);

  const canViewAll =
    canModule || canAnalisar || canExecutar || canEncerrar || canCadastros;
  const canMeus = canMeusChamados || canViewAll;

  if (!canMeus && !canViewAll) {
    throw createError(
      'Sem permissão para chamados. Libere «Meus Chamados» ou «Central de Chamados» em Controle.',
      403
    );
  }

  return {
    userId: input.userId,
    isAdmin: false,
    canAnalisar,
    canExecutar,
    canEncerrar,
    canCadastros: canCadastros || canAnalisar,
    canMeusChamados: canMeus,
    canViewAll,
    companyId: null,
    profile: null,
    memberships: []
  };
}

/** Visão operacional (todos os chamados, resumos, técnicos). */
export function assertCanViewAllWorkOrders(ctx: GestaoOsAccessContext) {
  if (ctx.isAdmin || ctx.canViewAll) return;
  throw createError(
    'Sem permissão para a visão geral. Libere «Central de Chamados» em Controle.',
    403
  );
}

/** Ver um chamado: visão geral ou solicitante/responsável do próprio registro. */
export function assertCanViewWorkOrder(
  ctx: GestaoOsAccessContext,
  workOrder: { requesterId: string; assigneeId: string | null }
) {
  if (ctx.isAdmin || ctx.canViewAll) return;
  if (workOrder.requesterId === ctx.userId || workOrder.assigneeId === ctx.userId) return;
  throw createError('Sem permissão para ver este chamado', 403);
}

export function assertCanManageCadastros(ctx: GestaoOsAccessContext) {
  if (ctx.isAdmin || ctx.canCadastros || ctx.canAnalisar) return;
  throw createError(
    'Sem permissão: libere «Sistema de Gestão de OS» (cadastros) ou «Analisar OS» em Controle',
    403
  );
}

export function isGestaoOsManager(ctx: GestaoOsAccessContext): boolean {
  return ctx.isAdmin || ctx.canAnalisar || ctx.canCadastros;
}

export function assertCanTransition(
  ctx: GestaoOsAccessContext,
  from: GestaoOsStatus,
  to: GestaoOsStatus,
  _workOrder: { requesterId: string; assigneeId: string | null; companyId: string | null }
) {
  if (ctx.isAdmin) return;

  if (to === 'CANCELLED') {
    if (ctx.canAnalisar) return;
    if (from === 'OPEN') return; // quem abriu / tem módulo pode cancelar chamado aberto
    throw createError('Sem permissão para cancelar. Libere «Analisar OS» em Controle.', 403);
  }

  if (
    (from === 'OPEN' && to === 'UNDER_REVIEW') ||
    (from === 'UNDER_REVIEW' && to === 'APPROVED')
  ) {
    if (ctx.canAnalisar) return;
    throw createError('Sem permissão para analisar/aprovar. Libere «Analisar OS» em Controle.', 403);
  }

  if (
    (from === 'APPROVED' && to === 'SAFETY_CHECK') ||
    (from === 'SAFETY_CHECK' && to === 'IN_PROGRESS') ||
    (from === 'IN_PROGRESS' && (to === 'WAITING_PARTS' || to === 'COMPLETED')) ||
    (from === 'WAITING_PARTS' && (to === 'IN_PROGRESS' || to === 'COMPLETED'))
  ) {
    if (ctx.canExecutar || ctx.canAnalisar) return;
    throw createError('Sem permissão para executar. Libere «Executar OS» em Controle.', 403);
  }

  if (from === 'COMPLETED' && to === 'CLOSED') {
    if (ctx.canEncerrar || ctx.canAnalisar) return;
    throw createError('Sem permissão para encerrar. Libere «Encerrar OS» em Controle.', 403);
  }

  throw createError('Transição não permitida para as suas permissões', 403);
}

/** Single-tenant: sem filtro por empresa/perfil. */
export function workOrderVisibilityWhere(_ctx: GestaoOsAccessContext): Record<string, never> {
  return {};
}

export function pickCompanyIdFromRequest(_req: {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}): string | undefined {
  return undefined;
}

export async function listUserGestaoOsMemberships(_userId: string) {
  return [];
}
