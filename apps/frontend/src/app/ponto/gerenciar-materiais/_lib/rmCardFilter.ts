import type { PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';
import type { MaterialRequest } from './types';
import {
  isMaterialRequestEffectivelyCancelled,
  matchesMaterialRequestSearch,
  normalizeFluxSearch
} from './search';
import { rmHasOpenItemsForProcurement } from '@/lib/rmProcurementCoverage';

export type RmCardFilter = 'all' | 'pending' | 'approved' | 'awaitingOc' | 'cancelled';

export const DEFAULT_RM_CARD_FILTER: RmCardFilter = 'all';

export function isMaterialRequestAwaitingOc(
  request: MaterialRequest,
  orders: PurchaseOrder[]
): boolean {
  return (
    request.status === 'APPROVED' &&
    !isMaterialRequestEffectivelyCancelled(request, orders) &&
    rmHasOpenItemsForProcurement(request, orders)
  );
}

export function matchesRmCardFilter(
  request: MaterialRequest,
  filter: RmCardFilter,
  materialRequestIdsWithOc: Set<string>,
  orders: PurchaseOrder[]
): boolean {
  if (filter === 'all') return true;

  if (filter === 'cancelled') {
    return isMaterialRequestEffectivelyCancelled(request, orders);
  }

  if (filter === 'approved') {
    return request.status === 'APPROVED' && !isMaterialRequestEffectivelyCancelled(request, orders);
  }

  if (filter === 'pending') return request.status === 'PENDING';
  if (filter === 'awaitingOc') return isMaterialRequestAwaitingOc(request, orders);

  return true;
}

export function filterMaterialRequestsByCard(
  requests: MaterialRequest[],
  filter: RmCardFilter,
  searchTerm: string,
  materialRequestIdsWithOc: Set<string>,
  ordersByMaterialRequestId: Map<string, PurchaseOrder[]>
): MaterialRequest[] {
  const normalizedSearchTerm = normalizeFluxSearch(searchTerm);

  return requests.filter((request) => {
    const orders = ordersByMaterialRequestId.get(request.id) ?? [];
    if (!matchesRmCardFilter(request, filter, materialRequestIdsWithOc, orders)) {
      return false;
    }
    return matchesMaterialRequestSearch(request, normalizedSearchTerm);
  });
}
