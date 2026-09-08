'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function toggleCheckboxFilterSet<T>(set: Set<T>, value: T, checked: boolean): Set<T> {
  const next = new Set(set);
  if (checked) next.add(value);
  else next.delete(value);
  return next;
}

export type CheckboxFilterDropdownProps<T extends string | number> = {
  title: string;
  options: { value: T; label: string }[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
  allLabel?: string;
  noneLabel?: string;
  minWidth?: string;
  disabled?: boolean;
};

export function CheckboxFilterDropdown<T extends string | number>({
  title,
  options,
  selected,
  onChange,
  allLabel = 'Marcar todos',
  noneLabel = 'Limpar',
  minWidth = '11rem',
  disabled = false
}: CheckboxFilterDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const summary =
    options.length === 0
      ? 'Sem opções'
      : selected.size === 0
        ? 'Todos'
        : selected.size === options.length
          ? 'Todos selecionados'
          : `${selected.size} selecionado(s)`;

  return (
    <div ref={rootRef} className="relative" style={{ minWidth }}>
      <button
        type="button"
        onClick={() => !disabled && options.length > 0 && setOpen((v) => !v)}
        disabled={disabled || options.length === 0}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700/50"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex min-w-0 flex-col items-start text-left">
          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {title}
          </span>
          <span className="max-w-[140px] truncate text-xs">{summary}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && options.length > 0 ? (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 w-full min-w-[220px] rounded-lg border border-gray-200 bg-white py-2 shadow-lg dark:border-gray-600 dark:bg-gray-800"
        >
          <div className="flex items-center justify-end gap-2 border-b border-gray-100 px-3 pb-2 text-[11px] dark:border-gray-700">
            <button
              type="button"
              onClick={() => onChange(new Set(options.map((o) => o.value)))}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {allLabel}
            </button>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="text-gray-500 hover:underline dark:text-gray-400"
            >
              {noneLabel}
            </button>
          </div>
          <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto px-2 pt-2">
            {options.map((opt) => (
              <label
                key={String(opt.value)}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(opt.value)}
                  onChange={(e) =>
                    onChange(toggleCheckboxFilterSet(selected, opt.value, e.target.checked))
                  }
                  className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600"
                />
                <span className="truncate">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
