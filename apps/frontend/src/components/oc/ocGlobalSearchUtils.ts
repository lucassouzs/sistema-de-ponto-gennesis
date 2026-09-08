import { formatOcListDisplayId } from '@/components/oc/ocListDisplay';
import { showInAttachBoletoTab } from '@/components/oc/ocPaymentBoleto';
import {
  purchaseOrderPhaseLabel,
  purchaseOrderPhaseLabelForOrder
} from '@/components/oc/ocStatusLabels';
import type { OcTab, PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';

export const normalizeOcSearch = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const OC_TAB_LABELS: Record<OcTab, string> = {
  compras: 'Aprovação Compras',
  gestor: 'Aprovação Gestor',
  diretoria: 'Aprovação Diretoria',
  IN_REVIEW: 'Correção',
  APPROVED: 'Pagamento',
  ATTACH_BOLETO: 'Anexar Boleto',
  PROOF_VALIDATION: 'Validação Comprovante',
  PROOF_CORRECTION: 'Correção Comprovante',
  ATTACH_NF: 'Anexar NF',
  FINALIZADAS: 'Finalizadas',
  outras: 'Canceladas'
};

export function getOcTabForOrder(order: PurchaseOrder): OcTab | null {
  if (order.status === 'REJECTED' || order.status === 'CANCELLED') return 'outras';
  if (order.status === 'PENDING_COMPRAS' || order.status === 'DRAFT') return 'compras';
  if (order.status === 'PENDING') return 'gestor';
  if (order.status === 'PENDING_DIRETORIA') return 'diretoria';
  if (order.status === 'IN_REVIEW') return 'IN_REVIEW';
  if (showInAttachBoletoTab(order)) return 'ATTACH_BOLETO';
  if (order.status === 'APPROVED') return 'APPROVED';
  if (order.status === 'PENDING_PROOF_VALIDATION') return 'PROOF_VALIDATION';
  if (order.status === 'PENDING_PROOF_CORRECTION') return 'PROOF_CORRECTION';
  if (order.status === 'PENDING_NF_ATTACHMENT') return 'ATTACH_NF';
  if (order.status === 'FINALIZED' || order.status === 'SENT') return 'FINALIZADAS';
  return null;
}

export function matchesPurchaseOrderGlobalSearch(
  order: PurchaseOrder,
  normalizedSearchTerm: string
): boolean {
  if (!normalizedSearchTerm) return true;
  const searchableParts = [
    order.orderNumber,
    purchaseOrderPhaseLabel(order.status),
    purchaseOrderPhaseLabelForOrder(order),
    order.materialRequest?.requestNumber,
    order.materialRequest?.serviceOrder,
    order.materialRequest?.description,
    order.materialRequest?.costCenter?.code,
    order.materialRequest?.costCenter?.name,
    order.supplier?.name,
    order.supplier?.code,
    order.creator?.name
  ];
  return searchableParts.some((part) =>
    normalizeOcSearch(String(part ?? '')).includes(normalizedSearchTerm)
  );
}

export type OcGlobalSearchHit = {
  id: string;
  tab: OcTab;
  title: string;
  subtitle: string;
};

export function buildOcGlobalSearchHits(
  orders: PurchaseOrder[],
  searchTerm: string
): OcGlobalSearchHit[] {
  const normalizedSearchTerm = normalizeOcSearch(searchTerm);
  if (!normalizedSearchTerm) return [];

  const hits: OcGlobalSearchHit[] = [];
  const seen = new Set<string>();

  for (const order of orders) {
    if (!matchesPurchaseOrderGlobalSearch(order, normalizedSearchTerm)) continue;
    if (seen.has(order.id)) continue;
    seen.add(order.id);

    const tab = getOcTabForOrder(order);
    if (!tab) continue;

    const fullNumber = order.orderNumber?.trim() || '';
    hits.push({
      id: order.id,
      tab,
      title: fullNumber ? formatOcListDisplayId(fullNumber) : `OC #${order.id.slice(0, 8)}`,
      subtitle: `${OC_TAB_LABELS[tab]} · ${order.supplier?.name || 'Sem fornecedor'}`
    });
  }

  return hits.slice(0, 12);
}
