'use client';

import React from 'react';
import { clsx } from 'clsx';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

export type ModalCloseConfirmProps = {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Texto do corpo. Default alinhado à RM. */
  message?: string;
  title?: string;
  /** z-index acima de modais empilhados (ex.: etiquetas sobre o card). */
  className?: string;
};

/**
 * Diálogo padrão “Deseja fechar?” usado ao tentar fechar modais com dados.
 * Não usa o Modal compartilhado para evitar confirmação aninhada.
 */
export function ModalCloseConfirm({
  isOpen,
  onCancel,
  onConfirm,
  title = 'Deseja fechar?',
  message = 'Tem certeza que deseja fechar? Os dados preenchidos serão perdidos.',
  className,
}: ModalCloseConfirmProps) {
  if (!isOpen) return null;

  return (
    <AppModalOverlay
      className={clsx(
        'app-modal-overlay fixed inset-0 z-[2010] flex items-center justify-center',
        className,
      )}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-close-confirm-title"
        className="app-modal-panel app-modal-panel--open relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
      >
        <h3
          id="modal-close-confirm-title"
          className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100"
        >
          {title}
        </h3>
        <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">{message}</p>
        <div className="flex items-center justify-center space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-red-700 dark:hover:bg-red-800"
          >
            Fechar
          </button>
        </div>
      </div>
    </AppModalOverlay>
  );
}
