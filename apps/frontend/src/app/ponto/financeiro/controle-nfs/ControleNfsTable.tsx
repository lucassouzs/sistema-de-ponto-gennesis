'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Columns, Filter } from 'lucide-react';
import {
  formatCurrencyTotal,
  isCurrencyColumn,
  sumCurrencyColumn
} from './controleNfsCurrency';
import { ControleNfsColumnFilterMenu } from './ControleNfsColumnFilterMenu';
import {
  applyColumnFilters,
  applyGlobalSearch,
  getUniqueColumnValues,
  isColumnFilterActive,
  normalizeSearchText,
  type ColumnFiltersState
} from './controleNfsTableFilters';

type ControleNfsTableProps = {
  headers: string[];
  rows: string[][];
  searchQuery: string;
  onFilteredCountChange?: (count: number) => void;
};

function statusBadgeClass(status: string): string {
  const normalized = normalizeSearchText(status);
  if (normalized.includes('pago') && !normalized.includes('nao')) {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
  }
  if (normalized.includes('nao pago') || normalized.includes('pendente')) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

export function ControleNfsTable({
  headers,
  rows,
  searchQuery,
  onFilteredCountChange
}: ControleNfsTableProps) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>({});
  const [hiddenColumns, setHiddenColumns] = useState<Set<number>>(() => new Set());
  const [openFilterCol, setOpenFilterCol] = useState<number | null>(null);
  const [columnsPanelOpen, setColumnsPanelOpen] = useState(false);
  const columnsPanelRef = useRef<HTMLDivElement>(null);

  const uniqueValuesByColumn = useMemo(
    () => headers.map((_, colIndex) => getUniqueColumnValues(rows, colIndex)),
    [headers, rows]
  );

  const filteredRows = useMemo(() => {
    const afterSearch = applyGlobalSearch(rows, searchQuery);
    return applyColumnFilters(afterSearch, columnFilters);
  }, [rows, searchQuery, columnFilters]);

  useEffect(() => {
    onFilteredCountChange?.(filteredRows.length);
  }, [filteredRows.length, onFilteredCountChange]);

  const visibleColumnIndices = useMemo(
    () => headers.map((_, index) => index).filter((index) => !hiddenColumns.has(index)),
    [headers, hiddenColumns]
  );

  const statusColumnIndex = useMemo(
    () => headers.findIndex((header) => normalizeSearchText(header).includes('status financeiro')),
    [headers]
  );

  const currencyColumnTotals = useMemo(
    () =>
      headers.map((_, colIndex) =>
        isCurrencyColumn(filteredRows, colIndex) ? sumCurrencyColumn(filteredRows, colIndex) : null
      ),
    [headers, filteredRows]
  );

  const showCurrencyFooter = useMemo(
    () => visibleColumnIndices.some((colIndex) => currencyColumnTotals[colIndex] != null),
    [visibleColumnIndices, currencyColumnTotals]
  );

  const totalLabelColumnIndex = useMemo(() => {
    const visibleNonCurrency = visibleColumnIndices.find(
      (index) => !isCurrencyColumn(filteredRows, index)
    );
    return visibleNonCurrency ?? visibleColumnIndices[0] ?? 0;
  }, [visibleColumnIndices, filteredRows]);

  const activeFilterCount = useMemo(
    () =>
      headers.filter((_, colIndex) =>
        isColumnFilterActive(colIndex, columnFilters, uniqueValuesByColumn[colIndex] ?? [])
      ).length,
    [headers, columnFilters, uniqueValuesByColumn]
  );

  const applyColumnFilter = (colIndex: number, selected: string[] | null) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (!selected) {
        delete next[colIndex];
      } else {
        next[colIndex] = selected;
      }
      return next;
    });
  };

  const hideColumn = (colIndex: number) => {
    setHiddenColumns((prev) => new Set(prev).add(colIndex));
    setOpenFilterCol(null);
  };

  const toggleColumnVisibility = (colIndex: number, visible: boolean) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(colIndex);
      else next.add(colIndex);
      return next;
    });
  };

  const showAllColumns = () => {
    setHiddenColumns(new Set());
    setColumnsPanelOpen(false);
  };

  const clearAllFilters = () => {
    setColumnFilters({});
    setOpenFilterCol(null);
  };

  if (headers.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500 dark:text-gray-400">
        A aba selecionada não possui dados para exibir.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            Limpar filtros ({activeFilterCount})
          </button>
        ) : null}

        <div className="relative" ref={columnsPanelRef}>
          <button
            type="button"
            onClick={() => setColumnsPanelOpen((open) => !open)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            <Columns className="h-4 w-4" aria-hidden />
            Colunas
            {hiddenColumns.size > 0 ? (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                {hiddenColumns.size} oculta{hiddenColumns.size === 1 ? '' : 's'}
              </span>
            ) : null}
          </button>

          {columnsPanelOpen ? (
            <>
              <div
                className="fixed inset-0 z-20"
                aria-hidden
                onClick={() => setColumnsPanelOpen(false)}
              />
              <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-gray-800">
                  <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Colunas visíveis
                  </p>
                  <button
                    type="button"
                    onClick={showAllColumns}
                    className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                  >
                    Mostrar todas
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto p-2">
                  {headers.map((header, colIndex) => (
                    <label
                      key={`col-toggle-${colIndex}`}
                      className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.has(colIndex)}
                        onChange={(event) =>
                          toggleColumnVisibility(colIndex, event.target.checked)
                        }
                        className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-gray-600"
                      />
                      <span className="break-words">{header}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/90">
            <tr>
              {visibleColumnIndices.map((colIndex) => {
                const header = headers[colIndex];
                const uniqueValues = uniqueValuesByColumn[colIndex] ?? [];
                const filterActive = isColumnFilterActive(
                  colIndex,
                  columnFilters,
                  uniqueValues
                );

                return (
                  <th
                    key={`${header}-${colIndex}`}
                    className="relative min-w-[120px] whitespace-nowrap px-3 py-2 text-left align-top text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="line-clamp-2 normal-case" title={header}>
                        {header}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenFilterCol((current) => (current === colIndex ? null : colIndex))
                        }
                        className={`mt-0.5 shrink-0 rounded p-0.5 transition-colors ${
                          filterActive
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : 'text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200'
                        }`}
                        aria-label={`Filtrar coluna ${header}`}
                      >
                        <Filter className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>

                    {openFilterCol === colIndex ? (
                      <ControleNfsColumnFilterMenu
                        colIndex={colIndex}
                        header={header}
                        uniqueValues={uniqueValues}
                        selectedValues={columnFilters[colIndex]}
                        onApply={applyColumnFilter}
                        onHideColumn={hideColumn}
                        onClose={() => setOpenFilterCol(null)}
                      />
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
            {visibleColumnIndices.length === 0 ? (
              <tr>
                <td className="px-3 py-10 text-center text-gray-500 dark:text-gray-400">
                  Todas as colunas estão ocultas. Use o botão &quot;Colunas&quot; para exibir
                  novamente.
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnIndices.length}
                  className="px-3 py-10 text-center text-gray-500 dark:text-gray-400"
                >
                  Nenhum registro encontrado com os filtros atuais.
                </td>
              </tr>
            ) : (
              filteredRows.map((row, rowIndex) => (
                <tr
                  key={`row-${rowIndex}`}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/60"
                >
                  {visibleColumnIndices.map((colIndex) => {
                    const value = row[colIndex] ?? '';
                    const isStatusCell =
                      colIndex === statusColumnIndex && value.trim().length > 0;
                    return (
                      <td
                        key={`cell-${rowIndex}-${colIndex}`}
                        className="whitespace-nowrap px-3 py-2 text-gray-800 dark:text-gray-200"
                      >
                        {isStatusCell ? (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(value)}`}
                          >
                            {value}
                          </span>
                        ) : value.trim() ? (
                          value
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>

          {showCurrencyFooter && filteredRows.length > 0 && visibleColumnIndices.length > 0 ? (
            <tfoot className="sticky bottom-0 z-10 border-t-2 border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-800/95">
              <tr>
                {visibleColumnIndices.map((colIndex) => {
                  const total = currencyColumnTotals[colIndex];
                  return (
                    <td
                      key={`total-${colIndex}`}
                      className="whitespace-nowrap px-3 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100"
                    >
                      {total != null
                        ? formatCurrencyTotal(total)
                        : colIndex === totalLabelColumnIndex
                          ? 'Total'
                          : null}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
