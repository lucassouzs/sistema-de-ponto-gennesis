'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { purchaseOrderPhaseLabelForOrder } from '@/components/oc/ocStatusLabels';

type PleitoOsPurchaseOrderItem = {
  quantity: number | string;
  unit?: string | null;
  unitPrice?: number | string | null;
  totalPrice?: number | string | null;
  material?: {
    name?: string | null;
    sinapiCode?: string | null;
  } | null;
};

type PleitoOsPurchaseOrder = {
  id: string;
  orderNumber: string;
  status: string;
  orderDate?: string | null;
  paymentType?: string | null;
  paymentCondition?: string | null;
  paymentBoletoUrl?: string | null;
  boletoAttachmentUrl?: string | null;
  paymentBoletoInstallments?: unknown;
  paymentParcelCount?: number;
  paymentBoletoPhaseReleased?: boolean | null;
  supplier?: { name?: string | null } | null;
  materialRequest?: { requestNumber?: string | null } | null;
  items?: PleitoOsPurchaseOrderItem[];
};

function formatOcItemQuantity(value: number | string | null | undefined): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });
}

function formatOcItemCurrency(value: number | string | null | undefined): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const OC_ITEMS_TABLE_COL = {
  qtd: 'w-14',
  un: 'w-12',
  unitPrice: 'w-[5.75rem]',
  total: 'w-[5.75rem]',
} as const;

export function PleitoOsPurchaseOrdersSection({
  serviceOrderId,
  serviceOrderText,
  variant = 'section',
}: {
  serviceOrderId?: string | null;
  serviceOrderText?: string | null;
  /** `tab`: sem borda/título superior (modal de OS em abas). */
  variant?: 'section' | 'tab';
}) {
  const trimmedText = serviceOrderText?.trim() || '';
  const canFetch = Boolean(serviceOrderId || trimmedText);
  const isTab = variant === 'tab';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['pleito-os-purchase-orders', serviceOrderId, trimmedText],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', {
        params: {
          serviceOrderId: serviceOrderId || undefined,
          serviceOrderText: trimmedText || undefined,
          limit: 100,
        },
      });
      return (res.data?.data ?? []) as PleitoOsPurchaseOrder[];
    },
    enabled: canFetch,
  });

  const orders = data ?? [];

  if (!canFetch) {
    return (
      <div className={isTab ? 'space-y-2' : 'pt-4 border-t border-gray-200 dark:border-gray-700'}>
        {!isTab ? (
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">OCs vinculadas</p>
        ) : null}
        <p className={`text-sm text-gray-500 dark:text-gray-400 ${isTab ? '' : 'mt-2'}`}>
          Esta ordem de serviço não possui vínculo para buscar OCs.
        </p>
      </div>
    );
  }

  return (
    <div className={isTab ? 'space-y-3' : 'pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3'}>
      {!isTab ? (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">OCs vinculadas</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Ordens de compra das requisições de material desta OS.
          </p>
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Ordens de compra das requisições de material desta OS.
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Carregando OCs...</p>
      ) : isError ? (
        <p className="text-sm text-red-500 dark:text-red-400">Não foi possível carregar as OCs.</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma OC vinculada a esta OS.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const items = order.items ?? [];
            return (
              <div
                key={order.id}
                className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600"
              >
                <div className="bg-gray-50 px-3 py-2.5 dark:bg-gray-900/40">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {order.orderNumber}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {order.supplier?.name?.trim() || 'Fornecedor não informado'}
                        {order.materialRequest?.requestNumber
                          ? ` · RM ${order.materialRequest.requestNumber}`
                          : ''}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                      {purchaseOrderPhaseLabelForOrder(order)}
                    </span>
                  </div>
                </div>

                {items.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Sem itens cadastrados.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="w-full table-fixed text-xs">
                      <colgroup>
                        <col />
                        <col className={OC_ITEMS_TABLE_COL.qtd} />
                        <col className={OC_ITEMS_TABLE_COL.un} />
                        <col className={OC_ITEMS_TABLE_COL.unitPrice} />
                        <col className={OC_ITEMS_TABLE_COL.total} />
                      </colgroup>
                      <thead className="border-t border-gray-200 bg-white text-gray-500 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-400">
                        <tr>
                          <th className="px-3 py-2 font-medium">Material</th>
                          <th className={`px-2 py-2 text-center font-medium ${OC_ITEMS_TABLE_COL.qtd}`}>
                            Qtd
                          </th>
                          <th className={`px-2 py-2 text-center font-medium ${OC_ITEMS_TABLE_COL.un}`}>Un</th>
                          <th className={`px-2 py-2 text-center font-medium ${OC_ITEMS_TABLE_COL.unitPrice}`}>
                            Valor unit.
                          </th>
                          <th className={`px-2 py-2 text-center font-medium ${OC_ITEMS_TABLE_COL.total}`}>
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {items.map((item, index) => (
                          <tr key={`${order.id}-item-${index}`}>
                            <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                              {item.material?.name?.trim() || 'Material sem nome'}
                            </td>
                            <td
                              className={`px-2 py-2 text-center tabular-nums text-gray-700 dark:text-gray-300 ${OC_ITEMS_TABLE_COL.qtd}`}
                            >
                              {formatOcItemQuantity(item.quantity)}
                            </td>
                            <td
                              className={`px-2 py-2 text-center text-gray-700 dark:text-gray-300 ${OC_ITEMS_TABLE_COL.un}`}
                            >
                              {item.unit?.trim() || '—'}
                            </td>
                            <td
                              className={`px-2 py-2 text-center tabular-nums text-gray-700 dark:text-gray-300 ${OC_ITEMS_TABLE_COL.unitPrice}`}
                            >
                              {formatOcItemCurrency(item.unitPrice)}
                            </td>
                            <td
                              className={`px-2 py-2 text-center tabular-nums text-gray-700 dark:text-gray-300 ${OC_ITEMS_TABLE_COL.total}`}
                            >
                              {formatOcItemCurrency(item.totalPrice)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
