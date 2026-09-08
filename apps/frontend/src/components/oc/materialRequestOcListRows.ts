import { formatOcListDisplayId } from '@/components/oc/ocListDisplay';
import { sortPurchaseOrdersByMostRecent } from '@/components/oc/ocPurchaseOrderListSort';
import {
  ocStatusBadgeClassForOrder,
  purchaseOrderPhaseLabelForOrder
} from '@/components/oc/ocStatusLabels';

export type MaterialRequestOcListPurchaseOrder = {
  id: string;
  status: string;
  orderNumber?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  paymentType?: string | null;
  paymentCondition?: string | null;
  paymentBoletoUrl?: string | null;
  boletoAttachmentUrl?: string | null;
  paymentBoletoInstallments?: unknown;
  paymentParcelCount?: number;
  paymentBoletoPhaseReleased?: boolean | null;
  items?: Array<{ materialRequestItemId?: string | null } | null> | null;
};

export type MaterialRequestOcListRow = {
  key: string;
  id: string;
  idTitle?: string;
  status: string;
  statusBadgeClassName: string;
};

const RM_POST_APPROVAL = new Set(['APPROVED', 'PARTIALLY_FULFILLED', 'FULFILLED']);

const ocWaitBadgeClass =
  'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';

/** Rótulo da OC sem prefixo "OC -" para caber melhor na coluna. */
export function purchaseOrderPhaseShortLabel(
  orderOrStatus: string | MaterialRequestOcListPurchaseOrder
): string {
  const full =
    typeof orderOrStatus === 'string'
      ? purchaseOrderPhaseLabelForOrder({ status: orderOrStatus })
      : purchaseOrderPhaseLabelForOrder(orderOrStatus);
  return full.replace(/^OC\s*-\s*/i, '').trim() || full;
}

export function sortMaterialRequestPurchaseOrders<T extends MaterialRequestOcListPurchaseOrder>(
  orders: T[]
): T[] {
  return sortPurchaseOrdersByMostRecent(orders);
}

export function materialRequestOcListRows(
  request: { status?: string },
  purchaseOrders: MaterialRequestOcListPurchaseOrder[]
): MaterialRequestOcListRow[] {
  const rm = String(request.status || '');
  const pos = Array.isArray(purchaseOrders) ? purchaseOrders : [];

  if (!RM_POST_APPROVAL.has(rm)) return [];

  if (pos.length === 0) {
    if (rm === 'APPROVED') {
      return [
        {
          key: 'wait-oc',
          id: '—',
          status: 'Aguardando OC',
          statusBadgeClassName: ocWaitBadgeClass
        }
      ];
    }
    return [];
  }

  return sortMaterialRequestPurchaseOrders(pos).map((po) => {
    const fullNumber = po.orderNumber && String(po.orderNumber).trim() ? String(po.orderNumber) : '';
    const id = fullNumber ? formatOcListDisplayId(fullNumber) : po.id.slice(0, 8);
    return {
      key: `po-${po.id}`,
      id,
      idTitle: fullNumber || undefined,
      status: purchaseOrderPhaseShortLabel(po),
      statusBadgeClassName: ocStatusBadgeClassForOrder(po)
    };
  });
}
