'use client';

import React, { useEffect, useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

export type ExtratoPdfNatureMode = 'top10' | 'all';

type ExtratoExportPdfModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: ExtratoPdfNatureMode) => void | Promise<void>;
  exporting?: boolean;
  natureCount: number;
  topLimit?: number;
};

export function ExtratoExportPdfModal({
  isOpen,
  onClose,
  onConfirm,
  exporting = false,
  natureCount,
  topLimit = 20
}: ExtratoExportPdfModalProps) {
  const [mode, setMode] = useState<ExtratoPdfNatureMode>('top10');

  useEffect(() => {
    if (isOpen) setMode('top10');
  }, [isOpen]);

  const handleConfirm = () => {
    void onConfirm(mode);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={exporting ? () => {} : onClose}
      title="Exportar resumos em PDF"
      size="md"
      closeOnOverlayClick={!exporting}
    >
      <div className="space-y-5">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          O PDF incluirá filtros aplicados, cards de totais,{' '}
          <strong className="font-medium text-gray-800 dark:text-gray-200">ajustes manuais</strong>{' '}
          do recorte e os resumos (mês, polo, centro de custo e natureza). A listagem completa de
          movimentações do TOTVS{' '}
          <strong className="font-medium text-gray-800 dark:text-gray-200">não</strong> será
          exportada.
        </p>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <p className="mb-3 text-sm font-medium text-gray-900 dark:text-gray-100">
            Naturezas financeiras
          </p>
          <p className="mb-4 text-xs text-gray-600 dark:text-gray-400">
            Por padrão, a tela exibe as {topLimit} maiores saídas. Escolha o que deseja incluir no
            PDF:
          </p>

          <div className="space-y-3">
            <label className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-colors has-[:checked]:border-red-500 has-[:checked]:ring-1 has-[:checked]:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:has-[:checked]:border-red-500">
              <input
                type="radio"
                name="extrato-pdf-nature"
                className="mt-1"
                checked={mode === 'top10'}
                onChange={() => setMode('top10')}
                disabled={exporting}
              />
              <span>
                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                  Top {topLimit} maiores saídas
                </span>
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                  Até {topLimit} naturezas — mesmo critério da visualização inicial.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-colors has-[:checked]:border-red-500 has-[:checked]:ring-1 has-[:checked]:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:has-[:checked]:border-red-500">
              <input
                type="radio"
                name="extrato-pdf-nature"
                className="mt-1"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
                disabled={exporting}
              />
              <span>
                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                  Todas as naturezas
                </span>
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                  {natureCount} natureza(s) com os filtros atuais (ordenadas por saída).
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={exporting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Gerando PDF…
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4" aria-hidden />
                Gerar PDF
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
