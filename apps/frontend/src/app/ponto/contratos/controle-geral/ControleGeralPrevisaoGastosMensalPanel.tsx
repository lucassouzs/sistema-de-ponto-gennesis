'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarRange,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import type { GastosLocalityGroup } from './buildQueryGastosRows';
import {
  createPrevisaoGastosColumn,
  DEFAULT_PREVISAO_GASTOS_COLUMNS,
  loadPrevisaoGastosColumns,
  savePrevisaoGastosColumns,
  type PrevisaoGastosColumn
} from './previsaoGastosColumns';

type PrevisaoLocalityGroup = Pick<
  GastosLocalityGroup,
  'localityLabel' | 'rows' | 'subtotal'
> & {
  localityKey: string;
};

type ControleGeralPrevisaoGastosMensalPanelProps = {
  isLoading: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  localityGroups: PrevisaoLocalityGroup[];
  /** Ano de referência da previsão mensal (filtro ou ano corrente). */
  year: number;
};

export function ControleGeralPrevisaoGastosMensalPanel({
  isLoading,
  isError = false,
  errorMessage,
  onRetry,
  localityGroups,
  year
}: ControleGeralPrevisaoGastosMensalPanelProps) {
  const [columns, setColumns] = useState<PrevisaoGastosColumn[]>(() => loadPrevisaoGastosColumns());
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState('');

  const contractCount = useMemo(
    () => localityGroups.reduce((sum, group) => sum + group.rows.length, 0),
    [localityGroups]
  );
  const tableColumnCount = 1 + columns.length;

  const persistColumns = (next: PrevisaoGastosColumn[]) => {
    setColumns(next);
    savePrevisaoGastosColumns(next);
  };

  const handleAddColumn = () => {
    const label = newColumnLabel.trim().replace(/\s+/g, ' ');
    if (!label) {
      toast.error('Informe o nome da coluna.');
      return;
    }
    const exists = columns.some(
      (column) => column.label.localeCompare(label, 'pt-BR', { sensitivity: 'accent' }) === 0
    );
    if (exists) {
      toast.error('Já existe uma coluna com esse nome.');
      return;
    }
    persistColumns([...columns, createPrevisaoGastosColumn(label)]);
    setNewColumnLabel('');
    setIsAddColumnOpen(false);
    toast.success('Coluna adicionada.');
  };

  const handleRemoveColumn = (columnId: string) => {
    if (columns.length <= 1) {
      toast.error('Mantenha ao menos uma coluna.');
      return;
    }
    const target = columns.find((column) => column.id === columnId);
    persistColumns(columns.filter((column) => column.id !== columnId));
    toast.success(target ? `Coluna “${target.label}” removida.` : 'Coluna removida.');
  };

  const handleResetColumns = () => {
    persistColumns(DEFAULT_PREVISAO_GASTOS_COLUMNS.slice());
    toast.success('Colunas restauradas ao padrão.');
  };

  return (
    <Card>
      <CardHeader className="border-b-0 pb-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-sky-100 p-2 sm:p-3 dark:bg-sky-900/30">
              <CalendarRange className="h-5 w-5 text-sky-600 dark:text-sky-400 sm:h-6 sm:w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Previsão de Gastos Mensal
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Mesmos centros de custo do Controle de Contratos · {year}
                {contractCount > 0 ? ` · ${contractCount} contrato(s)` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={handleResetColumns}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              title="Restaurar colunas padrão"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Padrão
            </button>
            <button
              type="button"
              onClick={() => {
                setNewColumnLabel('');
                setIsAddColumnOpen(true);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 text-sm font-semibold text-sky-800 transition-colors hover:bg-sky-100 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-900/40"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Nova coluna
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Carregando centros de custo…
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center dark:border-red-900/50 dark:bg-red-950/30">
            <AlertCircle className="mx-auto mb-2 h-6 w-6 text-red-500" aria-hidden />
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              {errorMessage || 'Não foi possível carregar os centros de custo.'}
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : localityGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            Nenhum centro de custo visível com os filtros atuais.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/60">
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-50 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
                    Contrato
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column.id}
                      className="min-w-[9rem] px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>{column.label}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveColumn(column.id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          title={`Remover coluna ${column.label}`}
                          aria-label={`Remover coluna ${column.label}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {localityGroups.map((group) => (
                  <React.Fragment key={group.localityKey}>
                    <tr className="bg-sky-50 dark:bg-sky-950/30">
                      <td
                        colSpan={tableColumnCount}
                        className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300"
                      >
                        {group.localityLabel}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr
                        key={`previsao-${row.rowKey}`}
                        className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <td className="sticky left-0 z-10 bg-white px-3 py-3 text-sm font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                          {row.contract}
                        </td>
                        {columns.map((column) => (
                          <td
                            key={`${row.rowKey}-${column.id}`}
                            className="px-2 py-3 text-center text-sm tabular-nums text-gray-400 dark:text-gray-500"
                          >
                            —
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Modal
        isOpen={isAddColumnOpen}
        onClose={() => setIsAddColumnOpen(false)}
        title="Nova coluna"
        size="sm"
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Nome da coluna
            </span>
            <input
              type="text"
              value={newColumnLabel}
              onChange={(e) => setNewColumnLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddColumn();
                }
              }}
              placeholder="Ex.: Hospedagem"
              autoFocus
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddColumnOpen(false)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <X className="h-4 w-4" aria-hidden />
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAddColumn}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Adicionar
            </button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
