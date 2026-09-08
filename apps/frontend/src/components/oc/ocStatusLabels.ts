/** Rótulos de fase da OC — mesma fonte usada em OcPurchaseOrdersPanel. */
import { showInAttachBoletoTab, type OrderBoletoPhasePick } from '@/components/oc/ocPaymentBoleto';

export const OC_STATUS_LABELS_PT: Record<string, string> = {
  DRAFT: 'Rascunho',
  PENDING_COMPRAS: 'Aprovação Compras',
  PENDING: 'Aprovação Gestor',
  PENDING_DIRETORIA: 'Aprovação Diretoria',
  IN_REVIEW: 'Correção',
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

/**
 * Rótulo de fase alinhado às abas do fluxo OC.
 * `APPROVED` + ainda em Anexar Boleto → "Anexar Boleto" (não "Pagamento").
 */
export function purchaseOrderPhaseLabelForOrder(
  order: OrderBoletoPhasePick & { status: string }
): string {
  if (showInAttachBoletoTab(order)) return 'Anexar Boleto';
  return purchaseOrderPhaseLabel(order.status);
}

/** Classes de badge (pill) alinhadas às cores do fluxo da OC. */
export function ocStatusBadgeClass(status: string): string {
  const base = 'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap';
  if (status === 'FINALIZED' || status === 'RECEIVED')
    return `${base} bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200`;
  if (status === 'APPROVED' || status === 'SENT')
    return `${base} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200`;
  if (status === 'PENDING_PROOF_VALIDATION')
    return `${base} bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200`;
  if (status === 'PENDING_PROOF_CORRECTION')
    return `${base} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200`;
  if (status === 'PENDING_NF_ATTACHMENT')
    return `${base} bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200`;
  if (
    status === 'IN_REVIEW' ||
    status === 'PENDING' ||
    status === 'PENDING_DIRETORIA' ||
    status === 'PENDING_COMPRAS'
  )
    return `${base} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200`;
  if (status === 'REJECTED' || status === 'CANCELLED')
    return `${base} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200`;
  if (status === 'DRAFT')
    return `${base} bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300`;
  if (status === 'PARTIALLY_RECEIVED')
    return `${base} bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200`;
  return `${base} bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300`;
}

/** Badge considerando fase Anexar Boleto vs Pagamento (mesmo status APPROVED). */
export function ocStatusBadgeClassForOrder(
  order: OrderBoletoPhasePick & { status: string }
): string {
  const base = 'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap';
  if (showInAttachBoletoTab(order)) {
    return `${base} bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200`;
  }
  return ocStatusBadgeClass(order.status);
}

/** Chaves de status de entrega da OC na listagem (cores ajustáveis em `ocDeliveryStatusBadgeClass`). */
export type OcDeliveryStatusBadgeKey =
  | 'pending'
  | 'cancelled'
  | 'received'
  | 'received_partial'
  | 'site'
  | 'site_partial';

/** Badge de status de entrega — mesmo formato visual da coluna STATUS (pill semibold). */
export function ocDeliveryStatusBadgeClass(key: OcDeliveryStatusBadgeKey): string {
  const base = 'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap';
  switch (key) {
    case 'pending':
      return `${base} bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300`;
    case 'cancelled':
      return `${base} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200`;
    case 'received':
      return `${base} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200`;
    case 'received_partial':
      return `${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200`;
    case 'site':
      return `${base} bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200`;
    case 'site_partial':
      return `${base} bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200`;
    default:
      return `${base} bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300`;
  }
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
