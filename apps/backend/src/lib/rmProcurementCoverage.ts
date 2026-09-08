/** Status de OC que ainda “ocupam” o item da RM (não podem ser cotados de novo). */
export const OC_STATUSES_COVERING_RM_ITEMS = [
  'DRAFT',
  'PENDING_COMPRAS',
  'PENDING',
  'PENDING_DIRETORIA',
  'IN_REVIEW',
  'APPROVED',
  'PENDING_PROOF_VALIDATION',
  'PENDING_PROOF_CORRECTION',
  'PENDING_NF_ATTACHMENT',
  'SENT',
  'FINALIZED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
] as const;

/** Fases em que quem tem a permissão Controle pode retirar um item e devolver à RM. */
export const OC_STATUSES_ALLOW_RETURN_ITEM_TO_RM = [
  'DRAFT',
  'PENDING_COMPRAS',
  'PENDING',
  'PENDING_DIRETORIA',
  'IN_REVIEW',
  /** Anexar boleto e Pagamento (sem lançamento financeiro). */
  'APPROVED',
] as const;

export function isOcStatusCoveringRmItems(status: string): boolean {
  return (OC_STATUSES_COVERING_RM_ITEMS as readonly string[]).includes(status);
}

export function isOcStatusAllowingReturnItemToRm(status: string): boolean {
  return (OC_STATUSES_ALLOW_RETURN_ITEM_TO_RM as readonly string[]).includes(status);
}
