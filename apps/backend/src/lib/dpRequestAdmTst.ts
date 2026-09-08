import type { Prisma } from '@prisma/client';

const ADM_TST_TYPE_VALUES = [
  'ADM_VIAGENS',
  'ADM_EPI_FARDAMENTO',
  'ADM_MANUTENCAO_ESCRITORIO',
  'ADM_MATERIAL_ESCRITORIO',
  'ADM_INFORMATICA',
  'ADM_TREINAMENTOS_NR',
  'ADM_ASOS',
] as const;

export function isAdmTstDpRequestType(requestType: string): boolean {
  return requestType.startsWith('ADM_');
}

export function isDepartamentoPessoalSector(department?: string | null): boolean {
  const normalized = (department ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return normalized === 'departamento pessoal';
}

/** Solicitações ADM/TST não entram na fila de aprovação do gestor. */
export function admTstManagerApprovalExclusionWhere(): Prisma.DpRequestWhereInput {
  return {
    requestType: {
      notIn: [...ADM_TST_TYPE_VALUES] as Prisma.EnumDpRequestTypeFilter['in'],
    },
  };
}

/** Apenas solicitações ADM/TST (fila de gerenciamento ADM/TST). */
export function admTstOnlyWhere(): Prisma.DpRequestWhereInput {
  return {
    requestType: {
      in: [...ADM_TST_TYPE_VALUES] as Prisma.EnumDpRequestTypeFilter['in'],
    },
  };
}

/** Próximas etapas permitidas no feedback de solicitações ADM/TST. */
export const ADM_TST_FEEDBACK_NEXT_STATUSES = [
  'IN_REVIEW_DP',
  'WAITING_SUPPLIES',
  'WAITING_PAYMENT',
  'CONCLUDED',
  'CANCELLED',
] as const;

/** Status em que a equipe ADM/TST pode registrar feedback. */
export const ADM_TST_MAY_ACT_STATUSES = ['IN_REVIEW_DP', 'WAITING_SUPPLIES', 'WAITING_PAYMENT'] as const;
