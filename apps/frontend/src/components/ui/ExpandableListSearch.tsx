'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { clsx } from 'clsx';

type ExpandableListSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Largura expandida no desktop (classe Tailwind width). */
  expandedWidthClassName?: string;
  'aria-label'?: string;
};

/**
 * Busca da toolbar de listas: começa só com ícone e abre o campo ao clicar.
 * Permanece aberta enquanto houver texto; fecha no blur/Escape se estiver vazia.
 */
export function ExpandableListSearch({
  value,
  onChange,
  placeholder = 'Buscar...',
  expandedWidthClassName = 'w-full sm:w-[280px]',
  'aria-label': ariaLabel = 'Buscar',
}: ExpandableListSearchProps) {
  const [open, setOpen] = useState(Boolean(value.trim()));
  const inputRef = useRef<HTMLInputElement>(null);
  const expanded = open || Boolean(value.trim());

  useEffect(() => {
    if (value.trim()) setOpen(true);
  }, [value]);

  useEffect(() => {
    if (!expanded) return;
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [expanded]);

  const requestClose = () => {
    if (value.trim()) return;
    setOpen(false);
  };

  return (
    <div
      className={clsx(
        'relative h-10 overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800',
        'transition-[max-width,width,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        expanded
          ? clsx(
              expandedWidthClassName,
              'min-w-0 max-w-[280px] shadow-sm focus-within:ring-2 focus-within:ring-red-500 sm:max-w-[280px]',
            )
          : 'w-10 max-w-10 shrink-0',
      )}
    >
      {!expanded ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={ariaLabel}
          title={ariaLabel}
          className="absolute inset-0 z-10 flex items-center justify-center text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <Search className="h-4 w-4" />
        </button>
      ) : null}

      <div
        className={clsx(
          'absolute inset-0 flex items-center transition-opacity duration-200 ease-out',
          expanded ? 'opacity-100 delay-75' : 'pointer-events-none opacity-0',
        )}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          tabIndex={expanded ? 0 : -1}
          onChange={(e) => onChange(e.target.value)}
          onBlur={requestClose}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (value) onChange('');
              else {
                setOpen(false);
                (e.target as HTMLInputElement).blur();
              }
            }
          }}
          aria-label={ariaLabel}
          className="h-full w-full bg-transparent py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-gray-100"
        />
        {value ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
