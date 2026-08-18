'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Building2,
  ClipboardList,
  FileText,
  ListPlus,
  Wallet,
  X
} from 'lucide-react';
import { FilterMultiSelectField } from '@/components/ui/FilterMultiSelectField';
import type { ExtratoCaixaFiltroPayload, ExtratoFiltroAllValues } from '@/lib/extratoCaixaFiltrosSalvos';
import { ExtratoFiltrosSalvosPanel } from './ExtratoFiltrosSalvosPanel';
import {
  EXTRATO_FILTER_DATE_CLASS,
  MOVIMENTO_TIPO_ALL_VALUES,
  MOVIMENTO_TIPO_FILTER_OPTIONS
} from './extratoFiltrosConstants';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

export type ExtratoFilterOption = {
  value: string;
  label: string;
  searchText?: string;
};

type FilterFieldKey =
  | 'movimento'
  | 'polo'
  | 'cc'
  | 'nature'
  | 'fornecedor'
  | 'historico'
  | 'tipoOperacao';

function withAllIfEmpty(applied: string[], all: string[]): string[] {
  return applied.length === 0 && all.length > 0 ? [...all] : [...applied];
}

function expandApplied(
  applied: ExtratoCaixaFiltroPayload,
  all: ExtratoFiltroAllValues
): ExtratoCaixaFiltroPayload {
  return {
    ccFilterCodes: withAllIfEmpty(applied.ccFilterCodes, all.cc),
    natureFilterCodes: withAllIfEmpty(applied.natureFilterCodes, all.nature),
    poloFilterIds: withAllIfEmpty(applied.poloFilterIds, all.polo),
    fornecedorFilterValues: withAllIfEmpty(applied.fornecedorFilterValues, all.fornecedor),
    historicoFilterValues: withAllIfEmpty(applied.historicoFilterValues, all.historico),
    tipoOperacaoFilterValues: withAllIfEmpty(applied.tipoOperacaoFilterValues, all.tipoOperacao),
    movimentoTipoFilter: withAllIfEmpty(applied.movimentoTipoFilter, all.movimento),
    periodFrom: applied.periodFrom,
    periodTo: applied.periodTo
  };
}

export type ExtratoFiltrosModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (draft: ExtratoCaixaFiltroPayload) => void;
  applied: ExtratoCaixaFiltroPayload;
  allValues: ExtratoFiltroAllValues;
  buildDefaults: () => ExtratoCaixaFiltroPayload;
  options: {
    polo: ExtratoFilterOption[];
    cc: ExtratoFilterOption[];
    nature: ExtratoFilterOption[];
    fornecedor: ExtratoFilterOption[];
    historico: ExtratoFilterOption[];
    tipoOperacao: ExtratoFilterOption[];
  };
  disabled?: boolean;
};

export function ExtratoFiltrosModal({
  isOpen,
  onClose,
  onApply,
  applied,
  allValues,
  buildDefaults,
  options,
  disabled = false
}: ExtratoFiltrosModalProps) {
  const [draft, setDraft] = useState<ExtratoCaixaFiltroPayload>(() => expandApplied(applied, allValues));
  const [openField, setOpenField] = useState<FilterFieldKey | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(expandApplied(applied, allValues));
    setOpenField(null);
  }, [isOpen]); // snapshot de applied/allValues ao abrir

  useEffect(() => {
    if (!isOpen) return;
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  const movimentoOptions: ExtratoFilterOption[] = MOVIMENTO_TIPO_FILTER_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    searchText: o.searchText
  }));

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
        aria-labelledby="extrato-filtros-title"
        className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2
            id="extrato-filtros-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            Filtros
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
            <ExtratoFiltrosSalvosPanel
              filterDraft={draft}
              onLoadDraft={setDraft}
              allValues={allValues}
              disabled={disabled}
            />

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Período (data de compensação)
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="extrato-filter-from"
                    className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    De
                  </label>
                  <input
                    id="extrato-filter-from"
                    type="date"
                    value={draft.periodFrom}
                    onChange={(e) => setDraft((d) => ({ ...d, periodFrom: e.target.value }))}
                    disabled={disabled}
                    className={EXTRATO_FILTER_DATE_CLASS}
                  />
                </div>
                <div>
                  <label
                    htmlFor="extrato-filter-to"
                    className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    Até
                  </label>
                  <input
                    id="extrato-filter-to"
                    type="date"
                    value={draft.periodTo}
                    onChange={(e) => setDraft((d) => ({ ...d, periodTo: e.target.value }))}
                    min={draft.periodFrom || undefined}
                    disabled={disabled}
                    className={EXTRATO_FILTER_DATE_CLASS}
                  />
                </div>
              </div>
            </div>

            <FilterMultiSelectField
              fieldKey="movimento"
              label="Entradas e Saídas"
              icon={Wallet}
              options={movimentoOptions}
              selected={draft.movimentoTipoFilter}
              onChange={(movimentoTipoFilter) => setDraft((d) => ({ ...d, movimentoTipoFilter }))}
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Entradas e saídas"
              searchPlaceholder="Pesquisar..."
              emptyOptionsMessage="Nenhuma opção disponível."
              emptySearchMessage="Nenhuma opção encontrada."
            />

            <FilterMultiSelectField
              fieldKey="polo"
              label="Polo"
              icon={Building2}
              options={options.polo}
              selected={draft.poloFilterIds}
              onChange={(poloFilterIds) => setDraft((d) => ({ ...d, poloFilterIds }))}
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Todos os polos"
              searchPlaceholder="Pesquisar polo..."
              emptyOptionsMessage="Nenhum polo no balanço carregado."
              emptySearchMessage="Nenhum polo encontrado."
            />

            <FilterMultiSelectField
              fieldKey="cc"
              label="Centro de Custo"
              icon={ListPlus}
              options={options.cc}
              selected={draft.ccFilterCodes}
              onChange={(ccFilterCodes) => setDraft((d) => ({ ...d, ccFilterCodes }))}
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Todos os centros de custo"
              searchPlaceholder="Pesquisar centro de custo..."
              emptyOptionsMessage="Nenhum centro de custo no balanço carregado."
              emptySearchMessage="Nenhum centro de custo encontrado."
            />

            <FilterMultiSelectField
              fieldKey="nature"
              label="Natureza Financeira"
              icon={BookOpen}
              options={options.nature}
              selected={draft.natureFilterCodes}
              onChange={(natureFilterCodes) => setDraft((d) => ({ ...d, natureFilterCodes }))}
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Todas as naturezas financeiras"
              searchPlaceholder="Pesquisar natureza ou código..."
              emptyOptionsMessage="Nenhuma natureza no balanço carregado."
              emptySearchMessage="Nenhuma natureza encontrada."
            />

            <FilterMultiSelectField
              fieldKey="fornecedor"
              label="Fornecedor"
              icon={Building2}
              options={options.fornecedor}
              selected={draft.fornecedorFilterValues}
              onChange={(fornecedorFilterValues) =>
                setDraft((d) => ({ ...d, fornecedorFilterValues }))
              }
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Todos os fornecedores"
              searchPlaceholder="Pesquisar fornecedor..."
              emptyOptionsMessage="Nenhum fornecedor no balanço carregado."
              emptySearchMessage="Nenhum fornecedor encontrado."
            />

            <FilterMultiSelectField
              fieldKey="historico"
              label="Histórico"
              icon={FileText}
              options={options.historico}
              selected={draft.historicoFilterValues}
              onChange={(historicoFilterValues) =>
                setDraft((d) => ({ ...d, historicoFilterValues }))
              }
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Todos os históricos"
              searchPlaceholder="Pesquisar histórico..."
              emptyOptionsMessage="Nenhum histórico no balanço carregado."
              emptySearchMessage="Nenhum histórico encontrado."
            />

            <FilterMultiSelectField
              fieldKey="tipoOperacao"
              label="Tipo de Operação"
              icon={ClipboardList}
              options={options.tipoOperacao}
              selected={draft.tipoOperacaoFilterValues}
              onChange={(tipoOperacaoFilterValues) =>
                setDraft((d) => ({ ...d, tipoOperacaoFilterValues }))
              }
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Todos os tipos de operação"
              searchPlaceholder="Pesquisar tipo..."
              emptyOptionsMessage="Nenhum tipo de operação no balanço carregado."
              emptySearchMessage="Nenhum tipo encontrado."
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setDraft(buildDefaults())}
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

export { MOVIMENTO_TIPO_ALL_VALUES };
