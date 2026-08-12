'use client';

import React, { useCallback } from 'react';
import { X } from 'lucide-react';
import { BoletoParcelasList } from '@/components/oc/BoletoParcelasList';
import type { BoletoParcelasOrderFields } from '@/components/oc/boletoParcelasUtils';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';

export type BoletoParcelasModalOrder = BoletoParcelasOrderFields & {
  id: string;
  orderNumber: string;
};

export type BoletoParcelasModalProps = {
  order: BoletoParcelasModalOrder;
  editable?: boolean;
  onClose: () => void;
  onSaved: (payload: { data: unknown }) => void;
  onReleaseToPayment?: (orderId: string) => void;
  releasePending?: boolean;
};

export function BoletoParcelasModal({
  order,
  editable = true,
  onClose,
  onSaved,
  onReleaseToPayment,
  releasePending = false
}: BoletoParcelasModalProps) {
  const n = order.paymentParcelCount ?? 1;

  const closeForm = useCallback(() => {
    onClose();
  }, [onClose]);

  const { requestClose, confirmUi } = useModalCloseConfirm(closeForm);

  return (
    <>
      <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" onClick={requestClose} />
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {n > 1 ? 'Boletos por parcela' : 'Anexar boleto'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {order.orderNumber} —{' '}
                {n > 1
                  ? `${n} parcelas. A parcela atual é obrigatória; as demais podem ser anexadas agora, se quiser.`
                  : 'Informe vencimento e anexe o arquivo do boleto.'}
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <BoletoParcelasList
            order={order}
            hideAttachmentLinks
            editable={editable}
            hint={
              editable
                ? 'A parcela atual é obrigatória. Você pode anexar as demais agora ou depois, uma por vez.'
                : 'Somente quem criou a OC pode anexar ou editar os boletos.'
            }
            onReleaseToPayment={onReleaseToPayment}
            releasePending={releasePending}
            onSaved={onSaved}
          />

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
      {confirmUi}
    </>
  );
}
