'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EyeOff, Search } from 'lucide-react';
import {
  cellFilterLabel,
  normalizeSearchText,
  type ColumnFiltersState
} from './controleNfsTableFilters';

type ControleNfsColumnFilterMenuProps = {
  colIndex: number;
  header: string;
  uniqueValues: string[];
  selectedValues: string[] | undefined;
  onApply: (colIndex: number, selected: string[] | null) => void;
  onHideColumn: (colIndex: number) => void;
  onClose: () => void;
};

export function ControleNfsColumnFilterMenu({
  colIndex,
  header,
  uniqueValues,
  selectedValues,
  onApply,
  onHideColumn,
  onClose
}: ControleNfsColumnFilterMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [draftSelected, setDraftSelected] = useState<Set<string>>(
    () => new Set(selectedValues ?? uniqueValues)
  );

  useEffect(() => {
    setDraftSelected(new Set(selectedValues ?? uniqueValues));
  }, [selectedValues, uniqueValues, colIndex]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [onClose]);

  const filteredValues = useMemo(() => {
    const query = normalizeSearchText(search);
    if (!query) return uniqueValues;
    return uniqueValues.filter((value) =>
      normalizeSearchText(cellFilterLabel(value)).includes(query)
    );
  }, [search, uniqueValues]);

  const allFilteredSelected =
    filteredValues.length > 0 && filteredValues.every((value) => draftSelected.has(value));

  const toggleValue = (value: string) => {
    setDraftSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const applyDraft = () => {
    const selected = Array.from(draftSelected);
    if (selected.length === uniqueValues.length) {
      onApply(colIndex, null);
    } else {
      onApply(colIndex, selected);
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-900"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
        <p className="truncate text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
          {header}
        </p>
      </div>

      <div className="border-b border-gray-100 p-2 dark:border-gray-800">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar valores..."
            className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-2 text-xs text-gray-900 outline-none ring-red-500 focus:ring-1 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
      </div>

      <div className="max-h-52 overflow-y-auto p-2">
        <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={() => {
              setDraftSelected((prev) => {
                const next = new Set(prev);
                if (allFilteredSelected) {
                  filteredValues.forEach((value) => next.delete(value));
                } else {
                  filteredValues.forEach((value) => next.add(value));
                }
                return next;
              });
            }}
            className="rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-gray-600"
          />
          Selecionar tudo
        </label>

        {filteredValues.length === 0 ? (
          <p className="px-1 py-2 text-xs text-gray-500 dark:text-gray-400">Nenhum valor encontrado.</p>
        ) : (
          filteredValues.map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <input
                type="checkbox"
                checked={draftSelected.has(value)}
                onChange={() => toggleValue(value)}
                className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-gray-600"
              />
              <span className="break-words">{cellFilterLabel(value)}</span>
            </label>
          ))
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-gray-100 p-2 dark:border-gray-800">
        <button
          type="button"
          onClick={() => {
            onApply(colIndex, null);
            onClose();
          }}
          className="text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Limpar
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onHideColumn(colIndex);
              onClose();
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <EyeOff className="h-3.5 w-3.5" aria-hidden />
            Ocultar
          </button>
          <button
            type="button"
            onClick={applyDraft}
            className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
