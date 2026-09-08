'use client';

import React from 'react';

/** Status padronizado de aprovação em todas as listas. */
export type ApprovalStatusKind = 'aprovado' | 'cancelado' | 'pendente';

export const APPROVAL_STATUS_COLUMN_TITLE = 'Status aprovação';

const LABELS: Record<ApprovalStatusKind, string> = {
  aprovado: 'Aprovado',
  cancelado: 'Cancelado',
  pendente: 'Pendente',
};

const BADGE_CLASS: Record<ApprovalStatusKind, string> = {
  aprovado:
    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  cancelado: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  pendente:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200',
};

export function approvalStatusBadgeClass(kind: ApprovalStatusKind): string {
  return `inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${BADGE_CLASS[kind]}`;
}

export function ApprovalStatusBadge({ kind }: { kind: ApprovalStatusKind }) {
  return <span className={approvalStatusBadgeClass(kind)}>{LABELS[kind]}</span>;
}

/** DP / Solicitações */
export function dpToApprovalStatus(status: string): ApprovalStatusKind {
  if (status === 'WAITING_MANAGER') return 'pendente';
  if (status === 'CANCELLED') return 'cancelado';
  return 'aprovado';
}

/** Espelho NF */
export function espelhoToApprovalStatus(status: string): ApprovalStatusKind {
  if (status === 'APPROVED') return 'aprovado';
  if (status === 'CANCELLED') return 'cancelado';
  return 'pendente';
}

/** Ficha de Demanda */
export function fdToApprovalStatus(status: string): ApprovalStatusKind {
  if (status === 'APPROVED') return 'aprovado';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'cancelado';
  return 'pendente';
}

/** Combustível */
export function fuelToApprovalStatus(status: string): ApprovalStatusKind {
  if (status === 'PENDING_MANAGER') return 'pendente';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'cancelado';
  return 'aprovado';
}

/** Requisição de Materiais */
export function rmToApprovalStatus(status: string): ApprovalStatusKind {
  if (status === 'APPROVED') return 'aprovado';
  if (status === 'CANCELLED' || status === 'REJECTED') return 'cancelado';
  return 'pendente';
}

/** Ordem de Compra */
export function ocToApprovalStatus(status: string): ApprovalStatusKind {
  if (status === 'REJECTED' || status === 'CANCELLED') return 'cancelado';
  if (
    status === 'DRAFT' ||
    status === 'PENDING_COMPRAS' ||
    status === 'PENDING' ||
    status === 'PENDING_DIRETORIA' ||
    status === 'IN_REVIEW'
  ) {
    return 'pendente';
  }
  return 'aprovado';
}
