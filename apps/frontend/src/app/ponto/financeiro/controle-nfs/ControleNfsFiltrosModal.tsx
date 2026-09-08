'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X } from 'lucide-react';
import { CONTROLE_NFS_TABS } from './controleNfsTabs';
import { createDefaultControleNfsCardsFilter } from './controleNfsCardsFilter';
import { ControleNfsFilterMultiSelectField } from './ControleNfsFilterMultiSelectField';
import { ControleNfsFiltrosSalvosPanel } from './ControleNfsFiltrosSalvosPanel';
import { CONTROLE_NFS_FILTER_DATE_CLASS } from './controleNfsFiltrosConstants';
import type { ControleNfsCardsFilterState } from './controleNfsTypes';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

type FilterFieldKey = 'contratos';

type PeriodRangeFieldsProps = {
  title: string;
  fromId: string;
  toId: string;
  dateFrom: string;
  dateTo: string;
  disabled?: boolean;
  onChange: (patch: { dateFrom: string; dateTo: string }) => void;
};

function PeriodRangeFields({
  title,
  fromId,
  toId,
  dateFrom,
  dateTo,
  disabled,
  onChange
}: PeriodRangeFieldsProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor={fromId}
            className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            De
          </label>
          <input
            id={fromId}
            type="date"
            value={dateFrom}
            onChange={(event) => onChange({ dateFrom: event.target.value, dateTo })}
            disabled={disabled}
            className={CONTROLE_NFS_FILTER_DATE_CLASS}
          />
        </div>
        <div>
          <label
            htmlFor={toId}
            className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            Até
          </label>
          <input
            id={toId}
            type="date"
            value={dateTo}
            onChange={(event) => onChange({ dateFrom, dateTo: event.target.value })}
            min={dateFrom || undefined}
            disabled={disabled}
            className={CONTROLE_NFS_FILTER_DATE_CLASS}
          />
        </div>
      </div>
    </div>
  );
}

export type ControleNfsFiltrosModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (draft: ControleNfsCardsFilterState) => void;
  applied: ControleNfsCardsFilterState;
  disabled?: boolean;
};

export function ControleNfsFiltrosModal({
  isOpen,
  onClose,
  onApply,
  applied,
  disabled = false
}: ControleNfsFiltrosModalProps) {
  const [draft, setDraft] = useState<ControleNfsCardsFilterState>(applied);
  const [openField, setOpenField] = useState<FilterFieldKey | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    setDraft({ ...applied });
    setOpenField(null);
  }, [isOpen, applied]);

  useEffect(() => {
    if (!isOpen) return;
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  const contractOptions = useMemo(
    () =>
      CONTROLE_NFS_TABS.map((tab) => ({
        value: tab.key,
        label: tab.label,
        searchText: tab.sheetName
      })),
    []
  );

  if (!mounted || !isOpen) return null;

  return createPortal(
    <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/50"
        aria-label="Fechar filtros"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="controle-nfs-filtros-title"
        className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2
            id="controle-nfs-filtros-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            Filtro dos cards
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            aria-label="Fechar"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          <div className="space-y-4">
            <ControleNfsFiltrosSalvosPanel
              filterDraft={draft}
              onLoadDraft={setDraft}
              disabled={disabled}
            />

            <ControleNfsFilterMultiSelectField
              fieldKey="contratos"
              label="Contratos"
              icon={FileText}
              options={contractOptions}
              selected={draft.tabKeys}
              onChange={(tabKeys) => setDraft((current) => ({ ...current, tabKeys }))}
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Todos os contratos"
              searchPlaceholder="Pesquisar contrato..."
              emptyOptionsMessage="Nenhum contrato disponível."
              emptySearchMessage="Nenhum contrato encontrado."
            />

            <PeriodRangeFields
              title="Período emissão"
              fromId="controle-nfs-filter-emissao-from"
              toId="controle-nfs-filter-emissao-to"
              dateFrom={draft.emissaoDateFrom}
              dateTo={draft.emissaoDateTo}
              disabled={disabled}
              onChange={({ dateFrom, dateTo }) =>
                setDraft((current) => ({
                  ...current,
                  emissaoDateFrom: dateFrom,
                  emissaoDateTo: dateTo
                }))
              }
            />

            <PeriodRangeFields
              title="Período recebimento"
              fromId="controle-nfs-filter-recebimento-from"
              toId="controle-nfs-filter-recebimento-to"
              dateFrom={draft.recebimentoDateFrom}
              dateTo={draft.recebimentoDateTo}
              disabled={disabled}
              onChange={({ dateFrom, dateTo }) =>
                setDraft((current) => ({
                  ...current,
                  recebimentoDateFrom: dateFrom,
                  recebimentoDateTo: dateTo
                }))
              }
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setDraft(createDefaultControleNfsCardsFilter())}
            disabled={disabled}
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Limpar filtros
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            disabled={disabled}
            className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            Aplicar
          </button>
        </div>
      </div>
    </AppModalOverlay>,
    document.body
  );
}
