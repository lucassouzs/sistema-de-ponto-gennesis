'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Search, X } from 'lucide-react';
import {
  SINGLE_SELECT_LIST_MAX,
  SINGLE_SELECT_PANEL_CLS,
  SINGLE_SELECT_SEARCH_INPUT_CLS,
  SINGLE_SELECT_TRIGGER_BASE_CLS,
  SingleSelectTriggerChevron,
  singleSelectOptionClassName,
  singleSelectTriggerBorderClass,
  singleSelectTriggerTextClass,
} from '@/components/ui/singleSelectDropdownUi';

const DEFAULT_MIN_SEARCH_LENGTH = 2;
const DEFAULT_SEARCH_DEBOUNCE_MS = 300;
const LIST_MAX = SINGLE_SELECT_LIST_MAX;

type FloatingPos = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  openUp: boolean;
};

export type AsyncSearchSelectDropdownProps<T> = {
  value: string;
  selectedLabel?: string;
  onChange: (option: T) => void;
  searchFn: (query: string) => Promise<T[]>;
  getOptionId: (option: T) => string;
  getOptionLabel: (option: T) => string;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  noFocusRing?: boolean;
  hideFocus?: boolean;
  minSearchLength?: number;
  queryKeyPrefix: string;
  /** Mantém o painel aberto após escolher (para ir selecionando vários). */
  stayOpenOnSelect?: boolean;
  /** IDs já escolhidos — mostra check e permite marcar/desmarcar na lista. */
  selectedIds?: string[];
};

function getPortalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById('dropdown-portal-root') ?? document.body;
}

function computeFloatingPos(trigger: HTMLElement): FloatingPos {
  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  const margin = 12;
  const width = Math.max(rect.width, 200);
  const chrome = 72;
  const preferred = LIST_MAX + chrome;

  const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
  const spaceAbove = rect.top - gap - margin;
  const openUp = spaceBelow < preferred && spaceAbove > spaceBelow;

  if (openUp) {
    const maxHeight = Math.max(160, Math.min(preferred, spaceAbove));
    return {
      left: rect.left,
      width,
      bottom: window.innerHeight - rect.top + gap,
      maxHeight,
      openUp: true,
    };
  }

  const maxHeight = Math.max(160, Math.min(preferred, spaceBelow));
  return {
    left: rect.left,
    width,
    top: rect.bottom + gap,
    maxHeight,
    openUp: false,
  };
}

export function AsyncSearchSelectDropdown<T>({
  value,
  selectedLabel = '',
  onChange,
  searchFn,
  getOptionId,
  getOptionLabel,
  disabled = false,
  placeholder = 'Digite para buscar...',
  searchPlaceholder = 'Pesquisar...',
  noFocusRing = false,
  hideFocus = false,
  minSearchLength = DEFAULT_MIN_SEARCH_LENGTH,
  queryKeyPrefix,
  stayOpenOnSelect = false,
  selectedIds,
}: AsyncSearchSelectDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [floatingPos, setFloatingPos] = useState<FloatingPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setDebouncedSearch('');
      return;
    }
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), DEFAULT_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [search, open]);

  const canSearch = debouncedSearch.length >= minSearchLength;

  const { data: results = [], isFetching, isError } = useQuery({
    queryKey: [queryKeyPrefix, debouncedSearch],
    queryFn: () => searchFn(debouncedSearch),
    enabled: open && canSearch,
    staleTime: 30_000,
  });

  const syncFloatingPos = useCallback(() => {
    if (!triggerRef.current) return;
    setFloatingPos(computeFloatingPos(triggerRef.current));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    syncFloatingPos();
    if (listRef.current) listRef.current.scrollTop = 0;

    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      syncFloatingPos();
    };

    window.addEventListener('resize', syncFloatingPos);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', syncFloatingPos);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, syncFloatingPos]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
      setSearch('');
    }
  }, [disabled, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const closePanel = () => {
    setOpen(false);
    setSearch('');
  };

  const pickOption = (option: T) => {
    onChange(option);
    if (stayOpenOnSelect) {
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
      return;
    }
    closePanel();
  };

  const triggerLabel = useMemo(() => {
    if (selectedLabel) return selectedLabel;
    if (value) return 'Item selecionado';
    return placeholder;
  }, [selectedLabel, value, placeholder]);

  const listMaxHeight = floatingPos ? Math.max(80, floatingPos.maxHeight - 72) : LIST_MAX;

  const optionClassName = singleSelectOptionClassName;

  const listContent = (() => {
    const q = search.trim();
    if (q.length < minSearchLength) {
      return (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Digite ao menos {minSearchLength} caracteres para buscar.
        </p>
      );
    }
    if (isFetching) {
      return (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">Buscando…</p>
      );
    }
    if (isError) {
      return (
        <p className="py-6 text-center text-sm text-red-600 dark:text-red-400">Erro ao buscar.</p>
      );
    }
    if (results.length === 0) {
      return (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Nenhum resultado para esta pesquisa.
        </p>
      );
    }
    return (
      <div className="space-y-0.5">
        {results.map((option) => {
          const id = getOptionId(option);
          const active = selectedIds ? selectedIds.includes(id) : id === value;
          return (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickOption(option)}
              className={optionClassName(active)}
            >
              <span className="min-w-0 flex-1 truncate">{getOptionLabel(option)}</span>
              {active ? <Check className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    );
  })();

  const panelClassName = SINGLE_SELECT_PANEL_CLS;

  const menuContent = (
    <div
      id={panelId}
      ref={panelRef}
      role="listbox"
      className={panelClassName}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 border-b border-gray-100 px-3 py-2.5 dark:border-gray-700">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden
          />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${SINGLE_SELECT_SEARCH_INPUT_CLS} ${search ? 'pr-9' : 'pr-3'}`}
          />
          {search ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSearch('');
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 outline-none transition-colors hover:bg-gray-200/80 hover:text-gray-600 focus:ring-0 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              aria-label="Limpar pesquisa"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={listRef}
        style={{ maxHeight: listMaxHeight }}
        className="overflow-y-auto overflow-x-hidden px-2 py-2"
      >
        {listContent}
      </div>
    </div>
  );

  const floatingMenu =
    open && floatingPos ? (
      <div
        style={{
          position: 'fixed',
          zIndex: 99999,
          left: floatingPos.left,
          width: floatingPos.width,
          maxHeight: floatingPos.maxHeight,
          ...(floatingPos.openUp ? { bottom: floatingPos.bottom } : { top: floatingPos.top }),
        }}
      >
        {menuContent}
      </div>
    ) : null;

  return (
    <div ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          if (!open) syncFloatingPos();
          setOpen((v) => {
            if (v) setSearch('');
            return !v;
          });
        }}
        className={`${SINGLE_SELECT_TRIGGER_BASE_CLS} ${singleSelectTriggerBorderClass(open, hideFocus || noFocusRing)} ${singleSelectTriggerTextClass(Boolean(selectedLabel || value))}`}
        data-form-field-trigger="true"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="block truncate">{triggerLabel}</span>
        <SingleSelectTriggerChevron open={open} />
      </button>

      {mounted && floatingMenu && getPortalRoot()
        ? createPortal(floatingMenu, getPortalRoot()!)
        : null}
    </div>
  );
}
