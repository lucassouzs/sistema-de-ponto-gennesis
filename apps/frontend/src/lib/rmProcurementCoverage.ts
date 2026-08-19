/** Status de OC que ainda ocupam o item da RM. */
const OC_CLOSED_STATUSES = new Set(['REJECTED', 'CANCELLED']);

export type OcCoverageOrder = {
  status?: string | null;
  items?: Array<{ materialRequestItemId?: string | null } | null> | null;
};

export type RmCoverageRequest = {
  id: string;
  status: string;
  items?: Array<{ id: string; status?: string | null }> | null;
  _count?: { items?: number } | null;
  purchaseOrders?: OcCoverageOrder[] | null;
};

export function isRmItemCancelled(item: { status?: string | null }): boolean {
  return String(item.status || '') === 'CANCELLED';
}

export function canCancelRmItem(
  item: { id: string; status?: string | null },
  request: { status: string },
  orders: Array<{
    status: string;
    items?: Array<{ materialRequestItemId?: string | null } | null> | null;
  }>
): boolean {
  if (isRmItemCancelled(item)) return false;
  if (request.status === 'FULFILLED' || request.status === 'CANCELLED') return false;
  if (item.status === 'DELIVERED' || item.status === 'PURCHASED') return false;
  if (getActiveOcForRmItem(item.id, orders)) return false;
  return true;
}

export function canUserCancelRmItem(opts: {
  userId?: string | null;
  requestedBy?: string | null;
  isAdministrator?: boolean;
  isAdmin?: boolean;
  canApproveMaterialRequests?: boolean;
}): boolean {
  if (opts.isAdministrator || opts.isAdmin) return true;
  if (opts.userId && opts.requestedBy && opts.userId === opts.requestedBy) return true;
  if (opts.canApproveMaterialRequests) return true;
  return false;
}

export function isOcCoveringRmItems(status?: string | null): boolean {
  return !OC_CLOSED_STATUSES.has(String(status || ''));
}

export function getCoveredRmItemIdsFromOrders(orders: OcCoverageOrder[]): Set<string> {
  const covered = new Set<string>();
  for (const order of orders) {
    if (!isOcCoveringRmItems(order.status)) continue;
    for (const item of order.items ?? []) {
      const id = item?.materialRequestItemId;
      if (id) covered.add(id);
    }
  }
  return covered;
}

/** Preferência: OCs passadas; senão purchaseOrders embutidos na RM. */
export function getCoveredRmItemIds(
  request: RmCoverageRequest,
  orders?: OcCoverageOrder[]
): Set<string> {
  const source =
    orders && orders.length > 0 ? orders : (request.purchaseOrders ?? []);
  return getCoveredRmItemIdsFromOrders(source);
}

export function getOpenRmItemIds(
  request: RmCoverageRequest,
  orders?: OcCoverageOrder[]
): string[] {
  const covered = getCoveredRmItemIds(request, orders);
  const items = request.items ?? [];
  if (items.length > 0) {
    return items
      .filter((i) => !isRmItemCancelled(i))
      .map((i) => i.id)
      .filter((id) => !covered.has(id));
  }
  return [];
}

/** OC ativa que cobre o item da RM (se houver). */
export function getActiveOcForRmItem(
  materialRequestItemId: string,
  orders: Array<{
    status: string;
    orderNumber?: string | null;
    items?: Array<{ materialRequestItemId?: string | null } | null> | null;
  }>
): { orderNumber: string } | null {
  for (const order of orders) {
    if (!isOcCoveringRmItems(order.status)) continue;
    const hit = (order.items ?? []).some(
      (i) => i?.materialRequestItemId === materialRequestItemId
    );
    if (!hit) continue;
    const orderNumber = (order.orderNumber || '').trim();
    return orderNumber ? { orderNumber } : { orderNumber: '' };
  }
  return null;
}

/**
 * Contagens para listagem: total de itens da RM e quantos ainda sem OC ativa.
 */
export function getRmItemCoverageCounts(
  request: RmCoverageRequest,
  orders?: OcCoverageOrder[]
): { total: number | null; pending: number | null } {
  const items = request.items ?? [];
  const countTotal = request._count?.items;
  const total =
    items.length > 0
      ? items.length
      : typeof countTotal === 'number'
        ? countTotal
        : null;
  if (total == null) return { total: null, pending: null };

  if (items.length > 0) {
    return { total, pending: getOpenRmItemIds(request, orders).length };
  }

  const covered = getCoveredRmItemIds(request, orders).size;
  return { total, pending: Math.max(0, total - covered) };
}

/**
 * RM aprovada com pelo menos um item ainda sem OC ativa.
 * Se a listagem não trouxer itens, cai no legado: sem OCs ativas.
 */
export function rmHasOpenItemsForProcurement(
  request: RmCoverageRequest,
  orders?: OcCoverageOrder[]
): boolean {
  if (request.status !== 'APPROVED') return false;
  const source =
    orders && orders.length > 0 ? orders : (request.purchaseOrders ?? []);
  const covered = getCoveredRmItemIdsFromOrders(source);
  const items = request.items ?? [];

  if (items.length > 0) {
    return items.some((i) => !isRmItemCancelled(i) && !covered.has(i.id));
  }

  const total = request._count?.items;
  if (typeof total === 'number' && total > 0) {
    // Sem ids: se há cobertura parcial desconhecida, assume aberto se covered < total
    // (covered só conta itens com materialRequestItemId).
    if (covered.size > 0 && covered.size < total) return true;
    if (covered.size >= total) return false;
  }

  // Legado: nenhuma OC ativa → ainda aguarda OC
  return !source.some((o) => isOcCoveringRmItems(o.status));
}

export const OC_STATUSES_ALLOW_RETURN_ITEM_TO_RM = new Set([
  'DRAFT',
  'PENDING_COMPRAS',
  'PENDING',
  'PENDING_DIRETORIA',
  'IN_REVIEW',
  /** Anexar boleto e Pagamento — se já houver lançamento, a UI/API bloqueiam. */
  'APPROVED',
]);

export function canReturnOcItemToRm(
  status: string,
  opts?: { hasFinancialEntry?: boolean }
): boolean {
  if (!OC_STATUSES_ALLOW_RETURN_ITEM_TO_RM.has(status)) return false;
  if (status === 'APPROVED' && opts?.hasFinancialEntry) return false;
  return true;
}
