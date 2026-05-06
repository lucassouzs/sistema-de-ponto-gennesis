/** Rótulos de fase da OC — mesma fonte usada em OcPurchaseOrdersPanel. */
export const OC_STATUS_LABELS_PT: Record<string, string> = {
  DRAFT: 'Rascunho',
  PENDING_COMPRAS: 'OC - Aprovação Compras',
  PENDING: 'OC - Aprovação Gestor',
  PENDING_DIRETORIA: 'OC - Aprovação Diretoria',
  IN_REVIEW: 'CORREÇÃO OC',
  /** OC já aprovada nas etapas Compras/Gestor/Diretoria — em geral fase Pagamento / boleto / comprovante. */
  APPROVED: 'Pagamento',
  PENDING_PROOF_VALIDATION: 'Validação Comprovante',
  PENDING_PROOF_CORRECTION: 'Correção comprovante',
  PENDING_NF_ATTACHMENT: 'Anexar NF',
  SENT: 'Enviada',
  FINALIZED: 'Finalizada',
  PARTIALLY_RECEIVED: 'Parcialmente Recebida',
  RECEIVED: 'Recebida',
  REJECTED: 'Reprovada',
  CANCELLED: 'Cancelada'
};

export function purchaseOrderPhaseLabel(status: string): string {
  return OC_STATUS_LABELS_PT[status] || status;
}

/** Classes de texto (tabela / linhas) alinhadas às cores do fluxo da OC. */
export function ocStatusTextClass(status: string): string {
  if (status === 'FINALIZED' || status === 'RECEIVED') return 'text-indigo-600 dark:text-indigo-400';
  if (status === 'APPROVED' || status === 'SENT') return 'text-green-600 dark:text-green-400';
  if (status === 'PENDING_PROOF_VALIDATION') return 'text-violet-600 dark:text-violet-400';
  if (status === 'PENDING_PROOF_CORRECTION') return 'text-amber-600 dark:text-amber-400';
  if (status === 'PENDING_NF_ATTACHMENT') return 'text-teal-600 dark:text-teal-400';
  if (
    status === 'IN_REVIEW' ||
    status === 'PENDING' ||
    status === 'PENDING_DIRETORIA' ||
    status === 'PENDING_COMPRAS'
  )
    return 'text-yellow-700 dark:text-yellow-400';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'text-red-600 dark:text-red-400';
  if (status === 'DRAFT') return 'text-gray-500 dark:text-gray-400';
  if (status === 'PARTIALLY_RECEIVED') return 'text-cyan-600 dark:text-cyan-400';
  return 'text-gray-600 dark:text-gray-400';
}
