import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import {
  getContractGestorCostCenterIds,
  userHasContractGestorAssignment,
} from './contractGestorApprovalAccess';

export const OC_APPROVE_COMPRAS_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-compras');
/** Legado — oculto na UI; aprovação do gestor é só pela coluna Gestor do contrato. */
export const OC_APPROVE_GESTOR_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-gestor');
export const OC_APPROVE_DIRETORIA_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-diretoria');
export const OC_TAB_ATTACH_BOLETO_KEY = pathToModuleKey('/ponto/controle/oc-anexar-boleto');
export const OC_TAB_PAYMENT_KEY = pathToModuleKey('/ponto/controle/oc-pagamento');
export const OC_TAB_VALIDATE_PROOF_KEY = pathToModuleKey('/ponto/controle/oc-validar-comprovante');
export const OC_TAB_PROOF_CORRECTION_KEY = pathToModuleKey('/ponto/controle/oc-corrigir-comprovante');
export const OC_TAB_ATTACH_NF_KEY = pathToModuleKey('/ponto/controle/oc-anexar-nf');
export const OC_TAB_CORRECTION_KEY = pathToModuleKey('/ponto/controle/oc-correcao');
export const OC_RETURN_ITEM_TO_RM_KEY = pathToModuleKey('/ponto/controle/oc-devolver-item-rm');

/** Módulos que liberam listagem completa de OCs (sem filtro só de gestor de contrato). */
const OC_FULL_LIST_MODULE_KEYS = [
  OC_APPROVE_COMPRAS_MODULE_KEY,
  OC_APPROVE_DIRETORIA_MODULE_KEY,
  OC_TAB_ATTACH_BOLETO_KEY,
  OC_TAB_PAYMENT_KEY,
  OC_TAB_VALIDATE_PROOF_KEY,
  OC_TAB_PROOF_CORRECTION_KEY,
  OC_TAB_ATTACH_NF_KEY,
  OC_TAB_CORRECTION_KEY,
] as const;

export type OcApprovalPhase = 'compras' | 'gestor' | 'diretoria';

export function ocApprovalPhaseForStatus(status: string): OcApprovalPhase | null {
  if (status === 'PENDING_COMPRAS' || status === 'DRAFT') return 'compras';
  if (status === 'PENDING') return 'gestor';
  if (status === 'PENDING_DIRETORIA') return 'diretoria';
  return null;
}

async function userHasModule(userId: string, module: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: { userId, module, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  return !!row;
}

/** Admin ou qualquer módulo de fluxo/aprovação de OC no Controle → listagem sem filtro de gestor. */
export async function userHasFullPurchaseOrderListAccess(
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  for (const module of OC_FULL_LIST_MODULE_KEYS) {
    if (await userHasModule(userId, module)) return true;
  }
  return false;
}

/**
 * Centros de custo permitidos na listagem de OCs para aprovador gestor;
 * null = sem filtro (admin ou outros módulos de Controle OC).
 */
export async function getOcGestorApproverListScopeCostCenterIds(
  userId: string,
  isAdmin: boolean,
): Promise<string[] | null> {
  if (await userHasFullPurchaseOrderListAccess(userId, isAdmin)) return null;
  if (!(await userHasContractGestorAssignment(userId))) return null;
  return getContractGestorCostCenterIds(userId);
}

export async function userHasOcComprasApprovePermission(userId: string): Promise<boolean> {
  return userHasModule(userId, OC_APPROVE_COMPRAS_MODULE_KEY);
}

/** Somente gestor do contrato (coluna Gestor). */
export async function userHasOcGestorApprovePermission(userId: string): Promise<boolean> {
  return userHasContractGestorAssignment(userId);
}

export async function userHasOcDiretoriaApprovePermission(userId: string): Promise<boolean> {
  return userHasModule(userId, OC_APPROVE_DIRETORIA_MODULE_KEY);
}

/** Controle: devolver item da OC à RM (qualquer pessoa com a permissão). */
export async function userHasOcReturnItemToRmPermission(userId: string): Promise<boolean> {
  return userHasModule(userId, OC_RETURN_ITEM_TO_RM_KEY);
}

export async function assertUserCanReturnOcItemToRm(
  userId: string,
  isAdmin: boolean
): Promise<void> {
  if (isAdmin) return;
  if (await userHasOcReturnItemToRmPermission(userId)) return;
  throw createError(
    'Sem permissão: libere «Devolver item da OC à RM» em Controle → Ordem de Compra',
    403
  );
}

export async function assertUserHasOcModule(
  userId: string,
  isAdmin: boolean,
  module: string,
  message: string
): Promise<void> {
  if (isAdmin) return;
  if (!(await userHasModule(userId, module))) {
    throw createError(message, 403);
  }
}

export async function assertUserMayActOnOcApprovalPhase(
  userId: string,
  isAdmin: boolean,
  phase: OcApprovalPhase,
  materialRequestCostCenterId?: string | null,
): Promise<void> {
  if (isAdmin) return;

  if (phase === 'compras') {
    if (!(await userHasOcComprasApprovePermission(userId))) {
      throw createError('Sem permissão para aprovar OCs na fase de compras', 403);
    }
    return;
  }

  if (phase === 'gestor') {
    if (!(await userHasOcGestorApprovePermission(userId))) {
      throw createError('Sem permissão para aprovar OCs na fase do gestor', 403);
    }
    const scopeIds = await getContractGestorCostCenterIds(userId);
    if (
      !materialRequestCostCenterId ||
      scopeIds.length === 0 ||
      !scopeIds.includes(materialRequestCostCenterId)
    ) {
      throw createError('Sem permissão para aprovar solicitações deste contrato', 403);
    }
    return;
  }

  if (!(await userHasOcDiretoriaApprovePermission(userId))) {
    throw createError('Sem permissão para aprovar OCs na fase da diretoria', 403);
  }
}

/** Valida aprovação, reprovação ou envio para correção nas fases de aprovação da OC. */
export async function assertOcApprovalStatusChange(
  userId: string,
  isAdmin: boolean,
  currentStatus: string,
  newStatus: string,
  materialRequestCostCenterId?: string | null,
): Promise<void> {
  const phase = ocApprovalPhaseForStatus(currentStatus);
  if (!phase) return;

  const approvalActions = new Set([
    'PENDING',
    'PENDING_DIRETORIA',
    'APPROVED',
    'IN_REVIEW',
    'REJECTED',
  ]);
  if (!approvalActions.has(newStatus)) return;

  await assertUserMayActOnOcApprovalPhase(userId, isAdmin, phase, materialRequestCostCenterId);
}

/**
 * Gates de mudança de status fora das fases de aprovação (pagamento, validação, NF…).
 * As fases de aprovação continuam em `assertOcApprovalStatusChange`.
 */
export async function assertOcFlowStatusChange(
  userId: string,
  isAdmin: boolean,
  currentStatus: string,
  newStatus: string,
  materialRequestCostCenterId?: string | null,
): Promise<void> {
  await assertOcApprovalStatusChange(
    userId,
    isAdmin,
    currentStatus,
    newStatus,
    materialRequestCostCenterId
  );

  if (newStatus === 'PENDING_PROOF_VALIDATION') {
    if (currentStatus === 'PENDING_PROOF_CORRECTION') {
      await assertUserHasOcModule(
        userId,
        isAdmin,
        OC_TAB_PROOF_CORRECTION_KEY,
        'Sem permissão na aba Correção Comprovante da OC'
      );
    } else {
      await assertUserHasOcModule(
        userId,
        isAdmin,
        OC_TAB_PAYMENT_KEY,
        'Sem permissão na aba Pagamento da OC'
      );
    }
    return;
  }

  if (newStatus === 'PENDING_PROOF_CORRECTION') {
    await assertUserHasOcModule(
      userId,
      isAdmin,
      OC_TAB_VALIDATE_PROOF_KEY,
      'Sem permissão na aba Validação Comprovante da OC'
    );
    return;
  }

  if (newStatus === 'PENDING_NF_ATTACHMENT') {
    await assertUserHasOcModule(
      userId,
      isAdmin,
      OC_TAB_VALIDATE_PROOF_KEY,
      'Sem permissão na aba Validação Comprovante da OC'
    );
    return;
  }

  if (newStatus === 'FINALIZED') {
    await assertUserHasOcModule(
      userId,
      isAdmin,
      OC_TAB_ATTACH_NF_KEY,
      'Sem permissão na aba Anexar NF da OC'
    );
  }
}
