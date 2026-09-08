'use client';

import React from 'react';
import { Plus, X } from 'lucide-react';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';

export const MAX_SOLICITACAO_ITENS = 20;
export const MAX_ADMISSAO_CANDIDATOS = 30;

export function rowEmployeeOptions(
  allOptions: MultiSelectSearchOption[],
  rows: { employeeId: string }[],
  index: number
): MultiSelectSearchOption[] {
  const usedInOtherRows = rows
    .map((row, i) => (i !== index ? row.employeeId : ''))
    .filter(Boolean);
  const current = rows[index]?.employeeId ?? '';
  return allOptions.filter(
    (opt) => opt.value === current || !usedInOtherRows.includes(opt.value)
  );
}

export function RepeatableCard({
  title,
  index,
  total,
  onRemove,
  children,
}: {
  title: string;
  index: number;
  total: number;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-600 dark:bg-gray-800/40">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</p>
        {total > 1 && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            aria-label={`Remover ${title}`}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function AddMoreButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  if (disabled) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-red-400 hover:bg-red-50/40 hover:text-red-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-red-500/50 dark:hover:bg-red-950/20 dark:hover:text-red-300"
    >
      <Plus className="h-4 w-4" />
      Adicionar mais
    </button>
  );
}

export function ButtonSeg({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-red-600 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'
          : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
      }`}
    >
      {label}
    </button>
  );
}

export function useRepeatableList<T>(
  items: T[],
  emptyItem: () => T,
  patchDetails: (p: Record<string, unknown>) => void,
  key: string,
  max: number
) {
  const updateItem = (index: number, patch: Partial<T>) => {
    const next = items.map((row, i) => (i === index ? { ...row, ...patch } : row));
    patchDetails({ [key]: next });
  };

  const addItem = () => {
    if (items.length >= max) return;
    patchDetails({ [key]: [...items, emptyItem()] });
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    patchDetails({ [key]: items.filter((_, i) => i !== index) });
  };

  return { updateItem, addItem, removeItem };
}

export function parseArrayField<T>(
  details: Record<string, unknown>,
  key: string,
  mapRow: (row: Record<string, unknown>) => T,
  emptyItem: () => T,
  legacyMapper?: (details: Record<string, unknown>) => T[] | null
): T[] {
  const raw = details[key];
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item) => {
      if (!item || typeof item !== 'object') return emptyItem();
      return mapRow(item as Record<string, unknown>);
    });
  }
  const legacy = legacyMapper?.(details);
  if (legacy?.length) return legacy;
  return [emptyItem()];
}
