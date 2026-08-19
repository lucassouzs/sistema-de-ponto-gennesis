'use client';

import { Ban, Loader2 } from 'lucide-react';
import { formatOcListDisplayId } from '@/components/oc/ocListDisplay';
import {
  canCancelRmItem,
  getActiveOcForRmItem,
  isRmItemCancelled,
} from '@/lib/rmProcurementCoverage';

type RmItemSituationCellProps = {
  item: { id: string; status?: string | null };
  requestStatus: string;
  requestEffectivelyCancelled: boolean;
  orders: Array<{
    status: string;
    orderNumber?: string | null;
    items?: Array<{ materialRequestItemId?: string | null } | null> | null;
  }>;
  canCancel?: boolean;
  onCancel?: () => void;
  cancelling?: boolean;
};

export function RmItemSituationCell({
  item,
  requestStatus,
  requestEffectivelyCancelled,
  orders,
  canCancel = false,
  onCancel,
  cancelling = false,
}: RmItemSituationCellProps) {
  const activeOc = getActiveOcForRmItem(item.id, orders);
  const pendingOc =
    !activeOc &&
    !isRmItemCancelled(item) &&
    requestStatus === 'APPROVED' &&
    !requestEffectivelyCancelled;
  const showCancel =
    canCancel &&
    !!onCancel &&
    canCancelRmItem(item, { status: requestStatus }, orders);

  if (isRmItemCancelled(item)) {
    return (
      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
        Cancelado
      </span>
    );
  }

  if (activeOc) {
    return (
      <span
        className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
        title={
          activeOc.orderNumber
            ? `Vinculado à OC ${activeOc.orderNumber}`
            : 'Item em ordem de compra'
        }
      >
        {activeOc.orderNumber ? `OC ${formatOcListDisplayId(activeOc.orderNumber)}` : 'Em OC'}
      </span>
    );
  }

  if (pendingOc) {
    return (
      <div className="inline-flex flex-col items-center gap-1">
        <span
          className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
          title="Aguardando mapa de cotação / nova OC"
        >
          Pendente
        </span>
        {showCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            title="Cancelar item"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            {cancelling ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Ban className="h-3 w-3" aria-hidden />
            )}
            Cancelar
          </button>
        ) : null}
      </div>
    );
  }

  return <span className="text-xs text-gray-400 dark:text-gray-500">—</span>;
}
