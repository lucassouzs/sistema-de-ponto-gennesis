import type { PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';
import { orderNeedsFinanceBoleto } from './flux';
import type { FluxTab, MaterialRequest } from './types';
import { rmContractDisplay, rmOsDisplay, rmSolicitante } from './display';
import { formatRmListDisplayId } from './rmListDisplay';
import { rmHasOpenItemsForProcurement } from '@/lib/rmProcurementCoverage';

export const normalizeFluxSearch = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const FLUX_TAB_LABELS: Record<FluxTab, string> = {
  rm_PENDING: 'Pendentes',
  rm_IN_REVIEW: 'Correção RM',
  rm_APPROVED: 'RMs Aprovadas',
  rm_CANCELLED: 'Canceladas',
  oc_compras: 'Aprovação Compras',
  oc_gestor: 'Aprovação Gestor',
  oc_diretoria: 'Aprovação Diretoria',
  oc_IN_REVIEW: 'Correção',
  oc_ATTACH_BOLETO: 'Anexar Boleto',
  oc_APPROVED: 'Pagamento',
  oc_PROOF_VALIDATION: 'Validação Comprovante',
  oc_PROOF_CORRECTION: 'Correção Comprovante',
  oc_ATTACH_NF: 'Anexar NF',
  oc_FINALIZADAS: 'Finalizadas'
};

const OC_CLOSED_STATUSES = new Set(['REJECTED', 'CANCELLED']);

/** SC cancelada/rejeitada ou aprovada só com OC(s) reprovada(s)/cancelada(s). */
export function isMaterialRequestEffectivelyCancelled(
  request: MaterialRequest,
  orders: PurchaseOrder[] = []
): boolean {
  if (request.status === 'CANCELLED' || request.status === 'REJECTED') return true;
  if (request.status !== 'APPROVED' || orders.length === 0) return false;
  return orders.every((o) => OC_CLOSED_STATUSES.has(o.status));
}

function parseOcRejectionReasonFromNotes(notes?: string | null): string | null {
  if (!notes?.trim()) return null;
  const lines = notes.split('\n').reverse();
  for (const line of lines) {
    const match = line.match(/^\[(?:Reprovação|Cancelamento)[^\]]*\]\s*(.+)$/i);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

export function getMaterialRequestDisplayStatus(
  request: MaterialRequest,
  orders: PurchaseOrder[] = []
): MaterialRequest['status'] {
  if (isMaterialRequestEffectivelyCancelled(request, orders)) return 'CANCELLED';
  if (request.status === 'REJECTED') return 'CANCELLED';
  return request.status;
}

export function getMaterialRequestCancellationReason(
  request: MaterialRequest,
  orders: PurchaseOrder[] = []
): string | null {
  const rmReason = (request.rejectionReason || '').trim();
  if (rmReason) return rmReason;

  for (const order of orders) {
    if (!OC_CLOSED_STATUSES.has(order.status)) continue;
    const fromNotes = parseOcRejectionReasonFromNotes(order.notes);
    if (fromNotes) return fromNotes;
  }

  return null;
}

export function matchesMaterialRequestSearch(
  request: MaterialRequest,
  normalizedSearchTerm: string
): boolean {
  if (!normalizedSearchTerm) return true;
  const searchableParts = [
    rmSolicitante(request)?.name,
    request.description,
    request.requestNumber,
    request.serviceOrder,
    rmOsDisplay(request),
    rmContractDisplay(request),
    request.costCenter?.name,
    request.costCenter?.id,
    ...(request.items ?? []).map((item) => item.material?.name || ''),
    ...(request.items ?? []).map((item) => item.material?.description || ''),
    ...(request.items ?? []).map((item) => item.material?.sinapiCode || '')
  ];
  return searchableParts.some((part) =>
    normalizeFluxSearch(part).includes(normalizedSearchTerm)
  );
}

export function matchesPurchaseOrderSearch(
  order: PurchaseOrder,
  normalizedSearchTerm: string
): boolean {
  if (!normalizedSearchTerm) return true;
  const searchableParts = [
    order.orderNumber,
    order.status,
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
    normalizeFluxSearch(String(part ?? '')).includes(normalizedSearchTerm)
  );
}

export function getFluxTabForMaterialRequest(
  request: MaterialRequest,
  materialRequestIdsWithOc: Set<string>,
  ordersForRequest: PurchaseOrder[] = []
): FluxTab | null {
  if (isMaterialRequestEffectivelyCancelled(request, ordersForRequest)) return 'rm_CANCELLED';
  if (request.status === 'PENDING') return 'rm_PENDING';
  if (request.status === 'IN_REVIEW') return 'rm_IN_REVIEW';
  if (request.status === 'APPROVED') {
    // Parcialmente atendida (itens devolvidos) continua em RMs Aprovadas.
    if (rmHasOpenItemsForProcurement(request, ordersForRequest)) return 'rm_APPROVED';
    if (materialRequestIdsWithOc.has(request.id)) return null;
    return 'rm_APPROVED';
  }
  return null;
}

export function getFluxTabForPurchaseOrder(order: PurchaseOrder): FluxTab | null {
  if (order.status === 'REJECTED' || order.status === 'CANCELLED') return null;
  if (order.status === 'PENDING_COMPRAS' || order.status === 'DRAFT') return 'oc_compras';
  if (order.status === 'PENDING') return 'oc_gestor';
  if (order.status === 'PENDING_DIRETORIA') return 'oc_diretoria';
  if (order.status === 'IN_REVIEW') return 'oc_IN_REVIEW';
  if (orderNeedsFinanceBoleto(order)) return 'oc_ATTACH_BOLETO';
  if (order.status === 'APPROVED') return 'oc_APPROVED';
  if (order.status === 'PENDING_PROOF_VALIDATION') return 'oc_PROOF_VALIDATION';
  if (order.status === 'PENDING_PROOF_CORRECTION') return 'oc_PROOF_CORRECTION';
  if (order.status === 'PENDING_NF_ATTACHMENT') return 'oc_ATTACH_NF';
  if (order.status === 'FINALIZED' || order.status === 'SENT') return 'oc_FINALIZADAS';
  return 'oc_gestor';
}

export type FluxSearchHit =
  | {
      kind: 'rm';
      id: string;
      tab: FluxTab;
      title: string;
      subtitle: string;
    }
  | {
      kind: 'oc';
      id: string;
      tab: FluxTab;
      title: string;
      subtitle: string;
    };

export function buildFluxSearchHits(input: {
  requests: MaterialRequest[];
  orders: PurchaseOrder[];
  materialRequestIdsWithOc: Set<string>;
  searchTerm: string;
}): FluxSearchHit[] {
  const normalizedSearchTerm = normalizeFluxSearch(input.searchTerm);
  if (!normalizedSearchTerm) return [];

  const hits: FluxSearchHit[] = [];
  const seenOcIds = new Set<string>();

  for (const request of input.requests) {
    if (!matchesMaterialRequestSearch(request, normalizedSearchTerm)) continue;

    const orders = input.orders.filter(
      (o) => (o.materialRequestId ?? o.materialRequest?.id) === request.id
    );
    const tab = getFluxTabForMaterialRequest(request, input.materialRequestIdsWithOc, orders);
    if (!tab) continue;

    hits.push({
      kind: 'rm',
      id: request.id,
      tab,
      title: formatRmListDisplayId(request.requestNumber) || `#${request.id.slice(0, 8)}`,
      subtitle: `${FLUX_TAB_LABELS[tab]} · ${request.costCenter?.name || 'Sem centro de custo'}`
    });
  }

  for (const order of input.orders) {
    if (!matchesPurchaseOrderSearch(order, normalizedSearchTerm)) continue;
    if (seenOcIds.has(order.id)) continue;
    seenOcIds.add(order.id);

    const tab = getFluxTabForPurchaseOrder(order);
    if (!tab) continue;
    hits.push({
      kind: 'oc',
      id: order.id,
      tab,
      title: order.orderNumber || `OC #${order.id.slice(0, 8)}`,
      subtitle: `${FLUX_TAB_LABELS[tab]} · ${order.supplier?.name || 'Sem fornecedor'}`
    });
  }

  return hits.slice(0, 12);
}
