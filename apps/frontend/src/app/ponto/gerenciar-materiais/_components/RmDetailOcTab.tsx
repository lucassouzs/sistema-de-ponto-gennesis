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

const FALLBACK_PAYMENT_CONDITION_LABELS: Record<string, string> = {
  AVISTA: 'À vista',
  BOLETO_30: 'Boleto 30 dias',
  BOLETO_28: 'Boleto 28 dias'
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

function materialLineLabel(
  m?: NonNullable<PurchaseOrder['items']>[number]['material']
): string {
  if (!m) return '—';
  const d = m.description?.trim();
  const n = m.name?.trim();
  if (d) return d;
  if (n) return n;
  if (m.sinapiCode) return m.sinapiCode;
  return '—';
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

function orderGrandTotal(o: Pick<PurchaseOrder, 'items' | 'freightAmount' | 'amountToPay'>): number {
  const hasLineItems = (o.items?.length ?? 0) > 0;
  if (!hasLineItems) {
    const paid = Number(o.amountToPay);
    return Number.isFinite(paid) ? paid : 0;
  }
  const items = itemsSubtotal(o.items);
  const freight = orderFreightValue(o);
  return Math.round((items + freight) * 100) / 100;
}

function OcCard({
  order,
  paymentLabelMap
}: {
  order: PurchaseOrder;
  paymentLabelMap: Record<string, string>;
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
  const lines = order.items ?? [];
  const subtotal = itemsSubtotal(lines);
  const freight = orderFreightValue(order);
  const total = orderGrandTotal(order);

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
                {lines.map((line, idx) => (
                  <tr key={`${order.id}-${idx}`} className="text-gray-900 dark:text-gray-100">
                    <td className="py-2.5 pr-2 text-center align-top font-medium tabular-nums text-gray-500 dark:text-gray-400">
                      {idx + 1}
                    </td>
                    <td className="max-w-[200px] px-2 py-2.5 align-top sm:max-w-none">
                      {materialLineLabel(line.material)}
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
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
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
};

export function RmDetailOcTab({ materialRequestStatus, orders, enabled = true }: Props) {
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
      return detail?.items?.length ? detail : { ...summary, ...(detail || {}) };
    });
  }, [sorted, detailQueries]);

  const loading = enabled && ids.length > 0 && detailQueries.some((q) => q.isLoading && !q.data);

  if (ids.length === 0) {
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
        <OcCard key={order.id} order={order} paymentLabelMap={paymentLabelMap} />
      ))}
    </div>
  );
}
