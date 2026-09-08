export type PurchaseOrderListSortPick = {
  orderNumber?: string | null;
  orderDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function purchaseOrderListSortTime(o: PurchaseOrderListSortPick): number {
  const raw = o.updatedAt || o.createdAt || o.orderDate || 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Mais recente primeiro — última atualização/movimentação da OC (ex.: envio para pagamento). */
export function sortPurchaseOrdersByMostRecent<T extends PurchaseOrderListSortPick>(
  list: T[]
): T[] {
  return [...list].sort((a, b) => {
    const ta = purchaseOrderListSortTime(a);
    const tb = purchaseOrderListSortTime(b);
    if (tb !== ta) return tb - ta;
    return (b.orderNumber || '').localeCompare(a.orderNumber || '', 'pt-BR', { numeric: true });
  });
}
