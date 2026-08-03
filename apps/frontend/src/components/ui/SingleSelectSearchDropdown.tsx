'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import type { MultiSelectSearchOption } from './MultiSelectSearchDropdown';

export type SingleSelectSearchDropdownProps = {
  value: string;
  onChange: (value: string) => void;
  options: MultiSelectSearchOption[];
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyOptionsMessage?: string;
  emptySearchMessage?: string;
  allowEmpty?: boolean;
  emptyOptionLabel?: string;
  className?: string;
  triggerClassName?: string;
  hideChevron?: boolean;
  menuInline?: boolean;
  /** Altura máxima da lista de opções (padrão: 220). */
  listMaxHeight?: number;
  noFocusRing?: boolean;
  hideFocus?: boolean;
  disableSearch?: boolean;
  menuAlign?: 'start' | 'end';
  matchTriggerWidth?: boolean;
  menuMinWidth?: number;
};

type FloatingPos = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  openUp: boolean;
};

const LIST_MAX = SINGLE_SELECT_LIST_MAX;

function getPortalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById('dropdown-portal-root') ?? document.body;
}

type FloatingPosOptions = {
  align?: 'start' | 'end';
  matchTriggerWidth?: boolean;
  disableSearch?: boolean;
  optionCount?: number;
  minMenuWidth?: number;
  listMax?: number;
};

const MENU_OPTION_CHROME_PX = 76;
const COMPACT_MENU_MIN_WIDTH_PX = 140;

function estimateCompactMenuMinWidth(labels: string[], triggerWidth = 0): number {
  const longest = labels.length > 0 ? labels.reduce((max, label) => Math.max(max, label.length), 0) : 0;
  const contentWidth = Math.ceil(longest * 8.5 + MENU_OPTION_CHROME_PX);
  const widerThanTrigger = triggerWidth > 0 ? Math.ceil(triggerWidth + 48) : 0;
  return Math.max(COMPACT_MENU_MIN_WIDTH_PX, contentWidth, widerThanTrigger);
}

function computeFloatingPos(trigger: HTMLElement, options?: FloatingPosOptions): FloatingPos {
  const rect = trigger.getBoundingClientRect();
  const gap = 4;
  const margin = 12;
  const baseWidth = options?.matchTriggerWidth ? rect.width : Math.max(rect.width, 200);
  const width = options?.minMenuWidth ? Math.max(baseWidth, options.minMenuWidth) : baseWidth;
  const disableSearch = options?.disableSearch ?? false;
  const listMax = options?.listMax ?? LIST_MAX;
  const listChrome = disableSearch ? 16 : 72;
  // Usa a altura pedida (não encolhe quando há poucas opções — evita painel “miúdo”).
  const preferred = Math.min(listMax + listChrome, window.innerHeight - margin * 2);

  const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
  const spaceAbove = rect.top - gap - margin;
  // Abre para cima quando não cabe o painel completo abaixo.
  const openUp = spaceBelow < preferred && spaceAbove > spaceBelow;

  let left = rect.left;
  if (options?.align === 'end') {
    left = rect.right - width;
  }
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

  if (openUp) {
    const maxHeight = Math.max(160, Math.min(preferred, spaceAbove));
    return {
      left,
      width,
      bottom: window.innerHeight - rect.top + gap,
      maxHeight,
      openUp: true,
    };
  }

  return {
    left,
    width,
    top: rect.bottom + gap,
    maxHeight: Math.max(160, Math.min(preferred, Math.max(spaceBelow, 160))),
    openUp: false,
  };
}

function OptionLabelContent({ opt, noTruncate = false }: { opt: MultiSelectSearchOption; noTruncate?: boolean }) {
  const labelClass = noTruncate ? 'whitespace-nowrap' : 'truncate';
  const label = opt.labelClassName ? (
    <span className={`${labelClass} font-normal tracking-tight ${opt.labelClassName}`}>{opt.label}</span>
  ) : (
    <span className={`${labelClass} font-normal tracking-tight text-gray-900 dark:text-gray-100`}>
      {opt.label}
    </span>
  );

  const primary = opt.swatchColor ? (
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      <span
        className="h-5 w-5 shrink-0 rounded-md border border-black/15 shadow-sm dark:border-white/20"
        style={{ backgroundColor: opt.swatchColor }}
        aria-hidden
      />
      {label}
    </span>
  ) : (
    label
  );

  const statusSegments = opt.statusSegments?.filter((s) => s.text.trim()) ?? [];
  const descriptionLines = (opt.description ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (statusSegments.length === 0 && descriptionLines.length === 0) return primary;

  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1 py-0.5 text-left">
      {primary}
      {statusSegments.length > 0 ? (
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium leading-tight">
          {statusSegments.map((segment, index) => (
            <span key={`${segment.text}-${index}`} className="inline-flex min-w-0 items-center gap-x-1.5">
              {index > 0 ? (
                <span className="text-gray-400 dark:text-gray-500" aria-hidden>
                  ·
                </span>
              ) : null}
              <span className={`${noTruncate ? 'whitespace-nowrap' : 'truncate'} ${segment.className || 'text-gray-600 dark:text-gray-300'}`}>
                {segment.text}
              </span>
            </span>
          ))}
        </span>
      ) : null}
      {descriptionLines.map((line) => (
        <span
          key={line}
          className={`${noTruncate ? 'whitespace-nowrap' : 'truncate'} text-[11px] font-normal leading-tight text-gray-500 dark:text-gray-400`}
        >
          {line}
        </span>
      ))}
    </span>
  );
}

export function SingleSelectSearchDropdown({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = 'Selecionar...',
  searchPlaceholder = 'Pesquisar...',
  emptyOptionsMessage = 'Nenhuma opção disponível.',
  emptySearchMessage = 'Nenhum resultado para esta pesquisa.',
  allowEmpty = true,
  emptyOptionLabel = 'Nenhum',
  className = '',
  triggerClassName,
  hideChevron = false,
  menuInline = false,
  listMaxHeight: listMaxHeightProp,
  noFocusRing = false,
  hideFocus = false,
  disableSearch = false,
  menuAlign = 'start',
  matchTriggerWidth = false,
  menuMinWidth,
}: SingleSelectSearchDropdownProps) {
  const listCap = listMaxHeightProp ?? LIST_MAX;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [floatingPos, setFloatingPos] = useState<FloatingPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const statusText = (o.statusSegments ?? []).map((s) => s.text).join(' ');
      const hay = `${o.label} ${o.triggerLabel ?? ''} ${statusText} ${o.description ?? ''} ${o.searchText ?? ''} ${o.value}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, search]);

  const selectedLabel = useMemo(() => {
    if (!value) return '';
    const selected = options.find((o) => o.value === value);
    if (!selected) return '';
    return selected.triggerLabel || selected.label;
  }, [options, value]);

  const syncFloatingPos = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerWidth = triggerRef.current.getBoundingClientRect().width;
    const labels = [
      ...(allowEmpty ? [emptyOptionLabel] : []),
      ...options.map((o) => o.label),
    ];
    const minWidth = disableSearch
      ? menuMinWidth
        ? Math.max(estimateCompactMenuMinWidth(labels, triggerWidth), menuMinWidth)
        : estimateCompactMenuMinWidth(labels, triggerWidth)
      : menuMinWidth;
    setFloatingPos(
      computeFloatingPos(triggerRef.current, {
        align: menuAlign,
        matchTriggerWidth,
        disableSearch,
        optionCount: options.length + (allowEmpty ? 1 : 0),
        minMenuWidth: minWidth,
        listMax: listCap,
      })
    );
  }, [
    menuAlign,
    matchTriggerWidth,
    disableSearch,
    options,
    allowEmpty,
    emptyOptionLabel,
    menuMinWidth,
    listCap,
  ]);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || menuInline) return;

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
  }, [open, menuInline, syncFloatingPos]);

  useEffect(() => {
    if (!open || disableSearch) return;
    const id = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open, disableSearch]);

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

  const pickValue = (next: string) => {
    onChange(next);
    closePanel();
  };

  const triggerLabel =
    selectedLabel ||
    (options.length === 0 ? emptyOptionsMessage : placeholder);

  const triggerButtonClassName = triggerClassName
    ? triggerClassName
    : `${SINGLE_SELECT_TRIGGER_BASE_CLS} ${singleSelectTriggerBorderClass(open, hideFocus)} ${singleSelectTriggerTextClass(Boolean(selectedLabel))}`;

  const triggerLabelClassName = hideChevron ? 'text-center' : 'block truncate';

  const listMaxHeight = menuInline
    ? listCap
    : floatingPos
      ? Math.min(listCap, Math.max(120, floatingPos.maxHeight - (disableSearch ? 16 : 72)))
      : listCap;

  const optionClassName = singleSelectOptionClassName;

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
      {!disableSearch ? (
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
      ) : null}

      <div
        ref={listRef}
        style={{ maxHeight: listMaxHeight }}
        className="overflow-y-auto overflow-x-hidden px-2 py-2"
      >
        {options.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{emptyOptionsMessage}</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{emptySearchMessage}</p>
        ) : (
          <div className="space-y-0.5">
            {allowEmpty && !search.trim() ? (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickValue('')}
                className={optionClassName(!value)}
              >
                <span className={`min-w-0 flex-1 ${disableSearch ? 'whitespace-nowrap' : 'truncate'}`}>
                  {emptyOptionLabel}
                </span>
                {!value ? <Check className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden /> : null}
              </button>
            ) : null}
            {filtered.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickValue(opt.value)}
                  className={optionClassName(active)}
                >
                  <span
                    className={`min-w-0 flex-1 ${
                      opt.description?.trim() || (opt.statusSegments?.length ?? 0) > 0
                        ? ''
                        : disableSearch
                          ? 'whitespace-nowrap'
                          : 'truncate'
                    }`}
                  >
                    <OptionLabelContent opt={opt} noTruncate={disableSearch} />
                  </span>
                  {active ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 self-start text-red-600 dark:text-red-400" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const inlineMenu =
    open && menuInline ? (
      <div className="mt-2" style={{ maxHeight: listCap + 72 }}>
        {menuContent}
      </div>
    ) : null;

  const floatingMenu =
    open && !menuInline && floatingPos ? (
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
    <div ref={containerRef} className={className}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          if (!open && !menuInline) syncFloatingPos();
          setOpen((v) => {
            if (v) setSearch('');
            return !v;
          });
        }}
        className={triggerButtonClassName}
        data-form-field-trigger={triggerClassName ? undefined : 'true'}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={triggerLabelClassName}>{triggerLabel}</span>
        {!hideChevron ? <SingleSelectTriggerChevron open={open} /> : null}
      </button>

      {inlineMenu}
      {mounted && floatingMenu && getPortalRoot()
        ? createPortal(floatingMenu, getPortalRoot()!)
        : null}
    </div>
  );
}
