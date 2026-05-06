import type { OcTab, PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';
import { orderNeedsPaymentBoleto } from '@/components/oc/ocPaymentBoleto';
import type { FluxTab } from './types';

export function fluxTabToOcTab(f: FluxTab): OcTab {
  switch (f) {
    case 'oc_compras':
      return 'compras';
    case 'oc_gestor':
      return 'gestor';
    case 'oc_diretoria':
      return 'diretoria';
    case 'oc_IN_REVIEW':
      return 'IN_REVIEW';
    case 'oc_APPROVED':
      return 'APPROVED';
    case 'oc_ATTACH_BOLETO':
      return 'ATTACH_BOLETO';
    case 'oc_PROOF_VALIDATION':
      return 'PROOF_VALIDATION';
    case 'oc_PROOF_CORRECTION':
      return 'PROOF_CORRECTION';
    case 'oc_ATTACH_NF':
      return 'ATTACH_NF';
    case 'oc_FINALIZADAS':
      return 'FINALIZADAS';
    default:
      return 'gestor';
  }
}

export function orderNeedsFinanceBoleto(o: PurchaseOrder): boolean {
  return orderNeedsPaymentBoleto(o);
}
