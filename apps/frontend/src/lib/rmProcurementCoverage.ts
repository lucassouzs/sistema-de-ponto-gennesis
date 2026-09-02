/** Status de OC que ainda ocupam o item da RM. */
const OC_CLOSED_STATUSES = new Set(['REJECTED', 'CANCELLED']);

export type OcCoverageOrder = {
  status?: string | null;
  items?: Array<{ materialRequestItemId?: string | null } | null> | null;
};

export type RmCoverageItem = {
  id: string;
  status?: string | null;
};

export type RmCoverageRequest = {
  id: string;
  status: string;
  items?: RmCoverageItem[] | null;
  _count?: { items?: number } | null;
  purchaseOrders?: OcCoverageOrder[] | null;
};

export function isRmItemCancelled(
  itemOrStatus: { status?: string | null } | string | null | undefined
): boolean {
  const status =
    typeof itemOrStatus === 'object' && itemOrStatus != null
      ? itemOrStatus.status
      : itemOrStatus;
  return String(status || '').toUpperCase() === 'CANCELLED';
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
  const covered = getCoveredRmItemIdsFromOrders(source);
  applyLegacySingleLineOcCoverage(request, source, covered);
  return covered;
}

/**
 * RM com item único + OC ativa com linha sem materialRequestItemId (legado / vínculo incompleto).
 */
function applyLegacySingleLineOcCoverage(
  request: RmCoverageRequest,
  orders: OcCoverageOrder[],
  covered: Set<string>
): void {
  const openItems = (request.items ?? []).filter((item) => !isRmItemCancelled(item));
  if (openItems.length === 1) {
    const onlyId = openItems[0]!.id;
    if (covered.has(onlyId)) return;
    if (applyLegacySingleLineOcCoverageForOrders(orders, onlyId, covered)) return;
  }

  if (openItems.length === 0 && request._count?.items === 1 && covered.size === 0) {
    applyLegacySingleLineOcCoverageForOrders(orders, '__legacy_single_rm_item__', covered);
  }
}

function applyLegacySingleLineOcCoverageForOrders(
  orders: OcCoverageOrder[],
  itemId: string,
  covered: Set<string>
): boolean {
  for (const order of orders) {
    if (!isOcCoveringRmItems(order.status)) continue;
    const lines = (order.items ?? []).filter(Boolean);
    if (lines.length !== 1 || lines[0]?.materialRequestItemId) continue;
    covered.add(itemId);
    return true;
  }
  return false;
}

export function getOpenRmItemIds(
  request: RmCoverageRequest,
  orders?: OcCoverageOrder[]
): string[] {
  const covered = getCoveredRmItemIds(request, orders);
  const items = request.items ?? [];
  if (items.length > 0) {
    return items
      .filter((i) => !isRmItemCancelled(i) && !covered.has(i.id))
      .map((i) => i.id);
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
  }>,
  opts?: { openRmItemCount?: number }
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

  if (opts?.openRmItemCount === 1) {
    for (const order of orders) {
      if (!isOcCoveringRmItems(order.status)) continue;
      const lines = (order.items ?? []).filter(Boolean);
      if (lines.length !== 1 || lines[0]?.materialRequestItemId) continue;
      const orderNumber = (order.orderNumber || '').trim();
      return orderNumber ? { orderNumber } : { orderNumber: '' };
    }
  }

  return null;
}

/**
 * Contagens para listagem: total, pendentes (sem OC ativa) e cancelados.
 */
export function getRmItemCoverageCounts(
  request: RmCoverageRequest,
  orders?: OcCoverageOrder[]
): { total: number | null; pending: number | null; cancelled: number | null } {
  const items = request.items ?? [];
  const countTotal = request._count?.items;
  const total =
    items.length > 0
      ? items.length
      : typeof countTotal === 'number'
        ? countTotal
        : null;
  if (total == null) return { total: null, pending: null, cancelled: null };

  if (items.length > 0) {
    const hasItemStatus = items.some((i) => i.status != null && String(i.status).trim() !== '');
    const cancelled = hasItemStatus
      ? items.filter((i) => isRmItemCancelled(i)).length
      : null;
    return {
      total,
      pending: getOpenRmItemIds(request, orders).length,
      cancelled,
    };
  }

  const covered = getCoveredRmItemIds(request, orders).size;
  return { total, pending: Math.max(0, total - covered), cancelled: null };
}

/**
 * RM aprovada com pelo menos um item ainda sem OC ativa e não cancelado.
 * Se a listagem não trouxer itens, cai no legado: sem OCs ativas.
 */
export function rmHasOpenItemsForProcurement(
  request: RmCoverageRequest,
  orders?: OcCoverageOrder[]
): boolean {
  if (request.status !== 'APPROVED') return false;
  const covered = getCoveredRmItemIds(request, orders);
  const items = request.items ?? [];

  if (items.length > 0) {
    return items.some((i) => !isRmItemCancelled(i) && !covered.has(i.id));
  }

  const total = request._count?.items;
  if (typeof total === 'number' && total > 0) {
    if (covered.size > 0 && covered.size < total) return true;
    if (covered.size >= total) return false;
  }

  const source =
    orders && orders.length > 0 ? orders : (request.purchaseOrders ?? []);
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
