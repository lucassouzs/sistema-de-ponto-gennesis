'use client';

import React, { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Loading } from '@/components/ui/Loading';
import type { PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';
import { formatOcListDisplayId } from '@/components/oc/ocListDisplay';
import {
  materialRequestOcListRows,
  sortMaterialRequestPurchaseOrders
} from '@/components/oc/materialRequestOcListRows';
import {
  ocStatusBadgeClassForOrder,
  purchaseOrderPhaseLabelForOrder
} from '@/components/oc/ocStatusLabels';
import {
  buildPaymentConditionLabelMap,
  type PaymentConditionRow
} from '@/components/oc/PaymentConditionSelect';
import { isOcCoveringRmItems, isRmItemCancelled } from '@/lib/rmProcurementCoverage';
import {
  catalogMaterialLabel,
  catalogMaterialSubtitle
} from '../_lib/display';

const FALLBACK_PAYMENT_CONDITION_LABELS: Record<string, string> = {
  AVISTA: 'À vista',
  BOLETO_30: 'Boleto 30 dias',
  BOLETO_28: 'Boleto 28 dias'
};

type RmItemFallback = {
  id: string;
  quantity?: number | string | null;
  unit?: string | null;
  unitPrice?: number | string | null;
  totalPrice?: number | string | null;
  notes?: string | null;
  observation?: string | null;
  material?: NonNullable<PurchaseOrder['items']>[number]['material'] | null;
};

function paymentConditionDisplay(
  order: Pick<PurchaseOrder, 'paymentType' | 'paymentCondition'>,
  labelMap: Record<string, string>
): string | null {
  if (order.paymentType === 'AVISTA') {
    return labelMap.AVISTA ?? 'À vista';
  }
  const code = (order.paymentCondition || '').trim();
  if (!code) {
    return order.paymentType === 'BOLETO' ? 'Boleto' : null;
  }
  return labelMap[code] ?? code;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(v) ? v : 0
  );
}

function itemsSubtotal(items?: { totalPrice: number }[] | null) {
  return (items ?? []).reduce((s, i) => s + Number(i.totalPrice || 0), 0);
}

function orderFreightValue(o: Pick<PurchaseOrder, 'freightAmount' | 'amountToPay' | 'items'>): number {
  const items = itemsSubtotal(o.items);
  const fRaw = o.freightAmount;
  if (fRaw != null && fRaw !== '' && Number.isFinite(Number(fRaw))) {
    return Math.max(0, Number(fRaw));
  }
  const paid = Number(o.amountToPay);
  if (Number.isFinite(paid)) return Math.max(0, paid - items);
  return 0;
}

/** Total da OC (itens + frete, ou amountToPay quando ainda sem linhas). */
export function purchaseOrderGrandTotal(
  o: Pick<PurchaseOrder, 'items' | 'freightAmount' | 'amountToPay'>
): number {
  const hasLineItems = (o.items?.length ?? 0) > 0;
  if (!hasLineItems) {
    const paid = Number(o.amountToPay);
    return Number.isFinite(paid) ? paid : 0;
  }
  const items = itemsSubtotal(o.items);
  const freight = orderFreightValue(o);
  return Math.round((items + freight) * 100) / 100;
}

function lineHasDisplayData(line: NonNullable<PurchaseOrder['items']>[number]): boolean {
  return Boolean(
    line.material ||
      line.quantity != null ||
      line.unitPrice != null ||
      line.totalPrice != null
  );
}

function buildLineFromRmItem(rm: RmItemFallback, rmItemId: string) {
  const qty = Number(rm.quantity);
  const unitPrice = Number(rm.unitPrice);
  const totalRaw = rm.totalPrice != null ? Number(rm.totalPrice) : NaN;
  const totalPrice = Number.isFinite(totalRaw)
    ? totalRaw
    : Number.isFinite(qty) && Number.isFinite(unitPrice)
      ? qty * unitPrice
      : 0;
  return {
    id: rmItemId,
    materialRequestItemId: rmItemId,
    quantity: Number.isFinite(qty) ? qty : 0,
    unit: rm.unit || '—',
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    totalPrice,
    material: rm.material ?? undefined,
    materialRequestItem: {
      notes: (rm.notes || rm.observation || '').trim() || undefined,
    },
  } as NonNullable<PurchaseOrder['items']>[number];
}

/** Monta linhas exibíveis: detalhe da OC ou fallback pelos vínculos / itens da RM. */
export function resolvePurchaseOrderDisplayLines(
  order: PurchaseOrder,
  rmItems?: RmItemFallback[] | null,
  orphanCancelledItems?: RmItemFallback[] | null,
  orphanIndex?: number
): NonNullable<PurchaseOrder['items']> {
  const raw = order.items ?? [];
  if (raw.some(lineHasDisplayData)) return raw;

  const linkedIds = raw
    .map((line) => line.materialRequestItemId)
    .filter((id): id is string => Boolean(id));

  if (linkedIds.length > 0 && rmItems?.length) {
    return linkedIds
      .map((rmItemId) => {
        const rm = rmItems.find((i) => i.id === rmItemId);
        return rm ? buildLineFromRmItem(rm, rmItemId) : null;
      })
      .filter(Boolean) as NonNullable<PurchaseOrder['items']>;
  }

  const orderClosed = order.status === 'REJECTED' || order.status === 'CANCELLED';
  if (
    orderClosed &&
    orphanCancelledItems?.length &&
    typeof orphanIndex === 'number' &&
    orphanIndex >= 0 &&
    orphanCancelledItems[orphanIndex]
  ) {
    const rm = orphanCancelledItems[orphanIndex];
    return [buildLineFromRmItem(rm, rm.id)];
  }

  return raw;
}

function OcCard({
  order,
  paymentLabelMap,
  budgetTotal,
  rmItems,
  orphanCancelledItems,
  orphanIndex,
}: {
  order: PurchaseOrder;
  paymentLabelMap: Record<string, string>;
  /** Orçamento da OS — quando informado, exibe % desta OC. */
  budgetTotal?: number | null;
  rmItems?: RmItemFallback[] | null;
  orphanCancelledItems?: RmItemFallback[] | null;
  orphanIndex?: number;
}) {
  const ocNo =
    order.orderNumber && String(order.orderNumber).trim()
      ? formatOcListDisplayId(String(order.orderNumber))
      : order.id.slice(0, 8);
  const statusLabel = purchaseOrderPhaseLabelForOrder(order).replace(/^OC\s*-\s*/i, '').trim();
  const paymentLabel = paymentConditionDisplay(order, paymentLabelMap);
  const orderDate = order.orderDate ? new Date(order.orderDate) : null;
  const dateLabel =
    orderDate && !Number.isNaN(orderDate.getTime())
      ? orderDate.toLocaleDateString('pt-BR')
      : null;
  const lines = resolvePurchaseOrderDisplayLines(
    order,
    rmItems,
    orphanCancelledItems,
    orphanIndex
  );
  const subtotal = itemsSubtotal(lines);
  const freight = orderFreightValue({ ...order, items: lines });
  const total = purchaseOrderGrandTotal({ ...order, items: lines });
  const showBudgetPct = budgetTotal != null && budgetTotal > 0;
  const budgetPct = showBudgetPct ? (total / budgetTotal) * 100 : null;
  const orderClosed = order.status === 'REJECTED' || order.status === 'CANCELLED';

  return (
    <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
            OC {ocNo}
          </h3>
          {order.supplier?.name ? (
            <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
              {order.supplier.name}
            </p>
          ) : null}
        </div>
        <span className={ocStatusBadgeClassForOrder(order)} title={statusLabel}>
          {statusLabel}
        </span>
      </div>

      <dl className="divide-y divide-gray-200 dark:divide-gray-700">
        {dateLabel ? (
          <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">Data</dt>
            <dd className="min-w-0 text-sm text-gray-900 dark:text-gray-100 sm:text-right">
              {dateLabel}
            </dd>
          </div>
        ) : null}
        {paymentLabel ? (
          <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
              Pagamento
            </dt>
            <dd className="min-w-0 text-sm text-gray-900 dark:text-gray-100 sm:text-right">
              {paymentLabel}
            </dd>
          </div>
        ) : null}
      </dl>

      {lines.length > 0 ? (
        <>
          <div className="mt-3 table-scroll">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                  <th className="w-10 whitespace-nowrap pb-2.5 pr-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                    #
                  </th>
                  <th className="px-2 pb-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Material
                  </th>
                  <th className="whitespace-nowrap px-2 pb-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                    Qtd
                  </th>
                  <th className="whitespace-nowrap px-2 pb-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                    Un.
                  </th>
                  <th className="whitespace-nowrap px-2 pb-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                    Unitário
                  </th>
                  <th className="whitespace-nowrap pb-2.5 pl-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {lines.map((line, idx) => {
                  const materialSubtitle = catalogMaterialSubtitle(line.material);
                  return (
                  <tr
                    key={`${order.id}-${line.id || idx}`}
                    className={`text-gray-900 dark:text-gray-100 ${orderClosed ? 'opacity-80' : ''}`}
                  >
                    <td className="py-2.5 pr-2 text-center align-top font-medium tabular-nums text-gray-500 dark:text-gray-400">
                      {idx + 1}
                    </td>
                    <td className="max-w-[200px] px-2 py-2.5 align-top sm:max-w-none">
                      {catalogMaterialLabel(line.material)}
                      {materialSubtitle ? (
                        <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-500 dark:text-gray-400">
                          {materialSubtitle}
                        </p>
                      ) : null}
                      {orderClosed ? (
                        <p className="mt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                          Item cancelado nesta OC
                        </p>
                      ) : null}
                      {(() => {
                        const detail =
                          line.notes?.trim() ||
                          (typeof line.materialRequestItem?.notes === 'string'
                            ? line.materialRequestItem.notes.trim()
                            : '');
                        return detail ? (
                          <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-500 dark:text-gray-400">
                            {detail}
                          </p>
                        ) : null;
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right align-top tabular-nums">
                      {Number(line.quantity)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-center align-top">
                      {line.unit || '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right align-top tabular-nums">
                      {formatCurrency(Number(line.unitPrice))}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pl-2 text-right align-top font-medium tabular-nums">
                      {formatCurrency(Number(line.totalPrice))}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            className={`mt-3 grid gap-2 ${
              showBudgetPct ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
            }`}
          >
            <div className="rounded-lg border border-gray-200 px-2.5 py-2.5 dark:border-gray-700">
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Itens</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {formatCurrency(subtotal)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 px-2.5 py-2.5 dark:border-gray-700">
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Frete</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {formatCurrency(freight)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 px-2.5 py-2.5 dark:border-gray-700">
              <p className="text-[11px] font-medium text-red-600/80 dark:text-red-400/90">Total</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-700 dark:text-red-300">
                {formatCurrency(total)}
              </p>
            </div>
            {showBudgetPct && budgetPct != null ? (
              <div className="rounded-lg border border-gray-200 px-2.5 py-2.5 dark:border-gray-700">
                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  % orçamento
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {budgetPct.toFixed(1)}%
                </p>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
          Itens ainda não carregados ou OC sem materiais.
        </p>
      )}
    </section>
  );
}

type Props = {
  materialRequestStatus?: string;
  orders: PurchaseOrder[];
  enabled?: boolean;
  /** Mensagem quando não há OCs (padrão: texto da RM). */
  emptyMessage?: string;
  /** Orçamento da OS para exibir % de cada OC. */
  budgetTotal?: number | null;
  /** Itens da RM — fallback para exibir linhas em OCs canceladas sem detalhe persistido. */
  rmItems?: RmItemFallback[] | null;
};

export function RmDetailOcTab({
  materialRequestStatus,
  orders,
  enabled = true,
  emptyMessage,
  budgetTotal,
  rmItems,
}: Props) {
  const sorted = useMemo(() => sortMaterialRequestPurchaseOrders(orders), [orders]);
  const ids = useMemo(() => sorted.map((o) => o.id), [sorted]);

  const { data: paymentConditionRows } = useQuery({
    queryKey: ['payment-conditions', 'all-labels'],
    queryFn: async () => {
      const res = await api.get('/payment-conditions', { params: { activeOnly: 'false' } });
      return (res.data?.data || []) as PaymentConditionRow[];
    },
    enabled,
    staleTime: 60_000
  });

  const paymentLabelMap = useMemo(
    () => buildPaymentConditionLabelMap(paymentConditionRows, FALLBACK_PAYMENT_CONDITION_LABELS),
    [paymentConditionRows]
  );

  const detailQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['purchase-order-detail', id],
      queryFn: async () => {
        const res = await api.get(`/purchase-orders/${id}`);
        return res.data?.data as PurchaseOrder;
      },
      enabled: enabled && Boolean(id),
      staleTime: 30_000
    }))
  });

  const detailedOrders = useMemo(() => {
    return sorted.map((summary, i) => {
      const detail = detailQueries[i]?.data;
      return { ...summary, ...(detail || {}) } as PurchaseOrder;
    });
  }, [sorted, detailQueries]);

  const orphanCancelledItems = useMemo(() => {
    if (!rmItems?.length) return [];
    const coveredByActive = new Set<string>();
    for (const order of detailedOrders) {
      if (!isOcCoveringRmItems(order.status)) continue;
      for (const line of order.items ?? []) {
        if (line.materialRequestItemId) coveredByActive.add(line.materialRequestItemId);
      }
    }
    return rmItems.filter(
      (item) => isRmItemCancelled((item as { status?: string | null }).status) && !coveredByActive.has(item.id)
    );
  }, [rmItems, detailedOrders]);

  const emptyClosedOrderIds = useMemo(() => {
    return detailedOrders
      .filter((order) => {
        const closed = order.status === 'REJECTED' || order.status === 'CANCELLED';
        return closed && resolvePurchaseOrderDisplayLines(order, rmItems).length === 0;
      })
      .map((order) => order.id);
  }, [detailedOrders, rmItems]);

  const loading = enabled && ids.length > 0 && detailQueries.some((q) => q.isLoading && !q.data);

  if (ids.length === 0) {
    if (emptyMessage) {
      return (
        <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">{emptyMessage}</p>
      );
    }
    const waitRows = materialRequestOcListRows(
      { status: materialRequestStatus },
      []
    );
    const awaiting = waitRows.some((r) => r.key === 'wait-oc');
    return (
      <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
        {awaiting
          ? 'RM aprovada — aguardando geração da OC.'
          : 'Nenhuma ordem de compra vinculada a esta RM.'}
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loading />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {detailedOrders.map((order) => (
        <OcCard
          key={order.id}
          order={order}
          paymentLabelMap={paymentLabelMap}
          budgetTotal={budgetTotal}
          rmItems={rmItems}
          orphanCancelledItems={orphanCancelledItems}
          orphanIndex={emptyClosedOrderIds.indexOf(order.id)}
        />
      ))}
    </div>
  );
}
