'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import {
  SINGLE_SELECT_PANEL_CLS,
  SINGLE_SELECT_SEARCH_INPUT_CLS,
  SINGLE_SELECT_TRIGGER_BASE_CLS,
  SingleSelectTriggerChevron,
  singleSelectTriggerBorderClass,
  singleSelectTriggerTextClass,
} from '@/components/ui/singleSelectDropdownUi';

export type MultiSelectSearchOption = {
  value: string;
  label: string;
  searchText?: string;
  /** Linha secundária (ex.: OS, contrato) sob o rótulo principal. */
  description?: string;
  /** Quando definido, exibe um indicador de cor ao lado do rótulo. */
  swatchColor?: string;
  /** Foto circular à esquerda (ex.: funcionário). */
  avatarUrl?: string | null;
  /** Iniciais quando não há foto. */
  avatarFallback?: string;
  /** Classe CSS aplicada ao texto do rótulo (ex.: cor do status). */
  labelClassName?: string;
  /** Rótulo compacto no trigger fechado (fallback: label). */
  triggerLabel?: string;
  /** Segmentos da 2ª linha (ex.: status coloridos). */
  statusSegments?: Array<{ text: string; className?: string }>;
  /** Opção visível mas não selecionável. */
  disabled?: boolean;
};

function OptionAvatar({
  url,
  fallback,
}: {
  url?: string | null;
  fallback?: string;
}) {
  if (!url && !fallback) return null;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-red-600 text-xs font-semibold text-white">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        (fallback || '?').slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

function OptionLabelContent({ opt }: { opt: MultiSelectSearchOption }) {
  const label = opt.labelClassName ? (
    <span className={`truncate font-normal tracking-tight ${opt.labelClassName}`}>{opt.label}</span>
  ) : (
    <span className="truncate font-normal tracking-tight text-gray-900 dark:text-gray-100">{opt.label}</span>
  );

  const hasAvatar = Boolean(opt.avatarUrl || opt.avatarFallback);

  const primary = hasAvatar ? (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <OptionAvatar url={opt.avatarUrl} fallback={opt.avatarFallback} />
      {label}
    </span>
  ) : opt.swatchColor ? (
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

  if (hasAvatar) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <OptionAvatar url={opt.avatarUrl} fallback={opt.avatarFallback} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {label}
          {statusSegments.length > 0 ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium leading-tight">
              {statusSegments.map((segment, index) => (
                <span key={`${segment.text}-${index}`} className="inline-flex min-w-0 items-center gap-x-1.5">
                  {index > 0 ? (
                    <span className="text-gray-400 dark:text-gray-500" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  <span className={`truncate ${segment.className || 'text-gray-600 dark:text-gray-300'}`}>
                    {segment.text}
                  </span>
                </span>
              ))}
            </span>
          ) : null}
          {descriptionLines.map((line) => (
            <span
              key={line}
              className="truncate text-[11px] font-normal leading-tight text-gray-500 dark:text-gray-400"
            >
              {line}
            </span>
          ))}
        </span>
      </span>
    );
  }

  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
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
              <span className={`truncate ${segment.className || 'text-gray-600 dark:text-gray-300'}`}>
                {segment.text}
              </span>
            </span>
          ))}
        </span>
      ) : null}
      {descriptionLines.map((line) => (
        <span
          key={line}
          className="truncate text-[11px] font-normal leading-tight text-gray-500 dark:text-gray-400"
        >
          {line}
        </span>
      ))}
    </span>
  );
}

function getPortalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById('dropdown-portal-root') ?? document.body;
}

function DropdownCheckbox({
  id,
  checked,
  indeterminate,
  disabled,
  onToggle,
  noFocusRing,
  children,
}: {
  id?: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  noFocusRing?: boolean;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  const filled = checked || Boolean(indeterminate);

  return (
    <label
      className={`group flex w-full min-h-[2.5rem] items-center gap-3 rounded-md px-2.5 py-2 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/55 ${
        disabled ? 'opacity-45 cursor-not-allowed hover:bg-transparent' : ''
      }`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onToggle();
      }}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        readOnly
        tabIndex={-1}
        aria-hidden
      />
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors outline-none ${
          noFocusRing
            ? ''
            : 'group-focus-within:ring-2 group-focus-within:ring-red-500/80 group-focus-within:ring-offset-1 ring-offset-white dark:ring-offset-gray-800'
        } ${
          filled
            ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
            : 'border-gray-300 bg-white group-hover:border-red-400 dark:border-gray-500 dark:bg-gray-800 dark:group-hover:border-red-400/70'
        }`}
        aria-hidden
      >
        {checked && !indeterminate && (
          <svg className="h-3 w-3 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {indeterminate && (
          <svg className="h-3 w-3 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1 break-words text-sm leading-snug text-gray-800 dark:text-gray-100">
        {children}
      </span>
    </label>
  );
}

export type MultiSelectSearchDropdownProps = {
  label?: string;
  options: MultiSelectSearchOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyOptionsMessage?: string;
  emptySearchMessage?: string;
  icon?: React.ReactNode;
  className?: string;
  closeOnSelect?: boolean;
  /** Fecha o painel ao clicar fora do campo (padrão: true). */
  closeOnOutsideClick?: boolean;
  /**
   * Menu expande no fluxo do documento, logo abaixo do campo.
   * Em páginas/cards prefira o menu flutuante (portal), sem menuInline.
   */
  menuInline?: boolean;
  /** Altura máxima da área rolável de opções (padrão: 220px). */
  listMaxHeight?: number;
  /**
   * @deprecated Mantido por compatibilidade. O menu flutuante já sobrepõe o conteúdo.
   */
  menuOverlapContent?: boolean;
  /** Remove anéis/bordas de foco do campo, busca e checkboxes. Sem borda vermelha ao abrir. */
  noFocusRing?: boolean;
  hideFocus?: boolean;
  /** Controle externo de abertura (ex.: só um campo aberto por vez em modais de filtro). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type FloatingPos = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  openUp: boolean;
};

const LIST_MAX = 220;
const LIST_ROW_ESTIMATE_PX = 42;
const PANEL_CHROME_PX = 118;

function estimateListMaxHeight(optionCount: number, cap: number): number {
  if (optionCount <= 0) return Math.min(cap, 80);
  return Math.min(cap, Math.max(80, optionCount * LIST_ROW_ESTIMATE_PX + 8));
}

function computeFloatingPos(trigger: HTMLElement, listMax: number): FloatingPos {
  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  const margin = 12;
  const width = Math.max(rect.width, 200);
  const preferred = Math.min(listMax + PANEL_CHROME_PX, window.innerHeight - margin * 2);
  const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
  const spaceAbove = rect.top - gap - margin;
  // Abre para cima quando não cabe o painel completo abaixo.
  const openUp = spaceBelow < preferred && spaceAbove > spaceBelow;

  if (openUp) {
    return {
      left: rect.left,
      width,
      bottom: window.innerHeight - rect.top + gap,
      maxHeight: Math.max(160, Math.min(preferred, spaceAbove)),
      openUp: true,
    };
  }

  return {
    left: rect.left,
    width,
    top: rect.bottom + gap,
    maxHeight: Math.max(160, Math.min(preferred, Math.max(spaceBelow, 160))),
    openUp: false,
  };
}

function MenuPanel({
  panelId,
  panelRef,
  listRef,
  search,
  setSearch,
  searchPlaceholder,
  options,
  filtered,
  allSelected,
  someSelected,
  allFilteredSelected,
  someFilteredSelected,
  selectedSet,
  emptyOptionsMessage,
  emptySearchMessage,
  selectAllFiltered,
  deselectAllFiltered,
  toggleValue,
  toggleSelectAll,
  listMaxHeight,
  noFocusRing,
}: {
  panelId: string;
  panelRef: React.RefObject<HTMLDivElement>;
  listRef: React.RefObject<HTMLDivElement>;
  search: string;
  setSearch: (v: string) => void;
  searchPlaceholder: string;
  options: MultiSelectSearchOption[];
  filtered: MultiSelectSearchOption[];
  allSelected: boolean;
  someSelected: boolean;
  allFilteredSelected: boolean;
  someFilteredSelected: boolean;
  selectedSet: Set<string>;
  emptyOptionsMessage: string;
  emptySearchMessage: string;
  selectAllFiltered: () => void;
  deselectAllFiltered: () => void;
  toggleValue: (value: string) => void;
  toggleSelectAll: (checked: boolean) => void;
  listMaxHeight: number;
  noFocusRing?: boolean;
}) {
  return (
    <div
      id={panelId}
      ref={panelRef}
      role="listbox"
      className={`flex flex-col overflow-hidden ${SINGLE_SELECT_PANEL_CLS}`}
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
              }}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 outline-none transition-colors hover:bg-gray-200/80 hover:text-gray-600 focus:ring-0 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              aria-label="Limpar pesquisa"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {options.length > 0 ? (
        <div className="shrink-0 border-b border-gray-100 px-1.5 py-1 dark:border-gray-700">
          <DropdownCheckbox
            id={`${panelId}-all`}
            noFocusRing={noFocusRing}
            checked={search.trim() ? allFilteredSelected : allSelected}
            indeterminate={
              search.trim()
                ? someFilteredSelected && !allFilteredSelected
                : someSelected && !allSelected
            }
            onToggle={() => {
              const nextChecked = search.trim() ? !allFilteredSelected : !allSelected;
              if (search.trim()) {
                if (nextChecked) selectAllFiltered();
                else deselectAllFiltered();
              } else {
                toggleSelectAll(nextChecked);
              }
            }}
          >
            <span className="font-semibold text-gray-800 dark:text-gray-100">
              {search.trim() ? 'Selecionar resultados da busca' : 'Selecionar tudo'}
            </span>
          </DropdownCheckbox>
        </div>
      ) : null}

      <div
        ref={listRef}
        className="overflow-y-auto overflow-x-hidden px-1.5 py-1"
        style={{ maxHeight: listMaxHeight }}
      >
        {options.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">{emptyOptionsMessage}</p>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">{emptySearchMessage}</p>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((opt) => (
              <DropdownCheckbox
                key={opt.value}
                noFocusRing={noFocusRing}
                checked={selectedSet.has(opt.value)}
                onToggle={() => toggleValue(opt.value)}
              >
                <OptionLabelContent opt={opt} />
              </DropdownCheckbox>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MultiSelectSearchDropdown({
  label,
  options,
  selected,
  onChange,
  disabled = false,
  placeholder = 'Selecione um ou mais itens',
  searchPlaceholder = 'Pesquisar...',
  emptyOptionsMessage = 'Nenhuma opção disponível.',
  emptySearchMessage = 'Nenhum resultado para esta pesquisa.',
  icon,
  className = '',
  closeOnSelect = false,
  closeOnOutsideClick = true,
  menuInline = false,
  listMaxHeight: listMaxHeightProp,
  menuOverlapContent: _menuOverlapContent = false,
  noFocusRing = false,
  hideFocus = false,
  open: openControlled,
  onOpenChange,
}: MultiSelectSearchDropdownProps) {
  void _menuOverlapContent;
  const effectiveListMax = listMaxHeightProp ?? LIST_MAX;
  const [openInternal, setOpenInternal] = useState(false);
  const open = openControlled ?? openInternal;

  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === 'function' ? next(open) : next;
      if (openControlled === undefined) setOpenInternal(resolved);
      onOpenChange?.(resolved);
    },
    [open, openControlled, onOpenChange]
  );
  const [search, setSearch] = useState('');
  const [floatingPos, setFloatingPos] = useState<FloatingPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listScrollTopRef = useRef(0);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.description ?? ''} ${o.searchText ?? ''} ${o.value}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, search]);

  const allValues = useMemo(() => options.map((o) => o.value), [options]);
  const allFilteredValues = useMemo(() => filtered.map((o) => o.value), [filtered]);

  const allSelected = allValues.length > 0 && allValues.every((v) => selectedSet.has(v));
  const someSelected = allValues.some((v) => selectedSet.has(v));
  const allFilteredSelected =
    allFilteredValues.length > 0 && allFilteredValues.every((v) => selectedSet.has(v));
  const someFilteredSelected = allFilteredValues.some((v) => selectedSet.has(v));

  const estimatedListMax = useMemo(
    () => estimateListMaxHeight(filtered.length, effectiveListMax),
    [filtered.length, effectiveListMax]
  );

  const syncFloatingPos = useCallback(() => {
    if (!triggerRef.current) return;
    setFloatingPos(computeFloatingPos(triggerRef.current, estimatedListMax));
  }, [estimatedListMax]);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || menuInline) return;

    syncFloatingPos();

    const onScrollOrResize = (e: Event) => {
      if (e.type === 'scroll' && panelRef.current?.contains(e.target as Node)) return;
      syncFloatingPos();
    };

    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, menuInline, syncFloatingPos]);

  // Reset de scroll só ao abrir / mudar busca — nunca ao marcar item.
  useLayoutEffect(() => {
    if (!open) {
      listScrollTopRef.current = 0;
      return;
    }
    if (menuInline) return;
    listScrollTopRef.current = 0;
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [open, menuInline, search]);

  // Preserva a posição ao marcar/desmarcar (re-render do pai).
  useLayoutEffect(() => {
    if (!open || menuInline || !listRef.current) return;
    listRef.current.scrollTop = listScrollTopRef.current;
  }, [open, menuInline, selected]);

  useEffect(() => {
    if (!open || menuInline) return;
    const list = listRef.current;
    if (!list) return;
    const onListScroll = () => {
      listScrollTopRef.current = list.scrollTop;
    };
    list.addEventListener('scroll', onListScroll, { passive: true });
    return () => list.removeEventListener('scroll', onListScroll);
  }, [open, menuInline, floatingPos]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
      setSearch('');
    }
  }, [disabled, open, setOpen]);

  useEffect(() => {
    if (!open || !closeOnOutsideClick) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeOnOutsideClick, setOpen]);

  const closePanel = () => {
    setOpen(false);
    setSearch('');
  };

  const rememberScroll = () => {
    if (listRef.current) listScrollTopRef.current = listRef.current.scrollTop;
  };

  const toggleValue = (value: string) => {
    rememberScroll();
    onChange(selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);
    if (closeOnSelect) closePanel();
  };

  const selectAllFiltered = () => {
    rememberScroll();
    onChange(Array.from(new Set([...selected, ...allFilteredValues])));
  };

  const deselectAllFiltered = () => {
    rememberScroll();
    const remove = new Set(allFilteredValues);
    onChange(selected.filter((v) => !remove.has(v)));
  };

  const toggleSelectAll = (checked: boolean) => {
    rememberScroll();
    onChange(checked ? [...allValues] : []);
  };

  const triggerLabel =
    selected.length === 0
      ? options.length === 0
        ? emptyOptionsMessage
        : placeholder
      : selected.length === options.length && options.length > 0
        ? 'Todos selecionados'
        : `${selected.length} selecionado(s)`;

  const listMaxHeight = menuInline
    ? estimatedListMax
    : floatingPos
      ? Math.min(estimatedListMax, Math.max(80, floatingPos.maxHeight - PANEL_CHROME_PX))
      : estimatedListMax;

  const menuProps = {
    panelId,
    panelRef,
    listRef,
    search,
    setSearch,
    searchPlaceholder,
    options,
    filtered,
    allSelected,
    someSelected,
    allFilteredSelected,
    someFilteredSelected,
    selectedSet,
    emptyOptionsMessage,
    emptySearchMessage,
    selectAllFiltered,
    deselectAllFiltered,
    toggleValue,
    toggleSelectAll,
    listMaxHeight,
    noFocusRing,
  };

  const suppressOpenBorder = hideFocus || noFocusRing;
  const hasSelection = selected.length > 0;

  const inlineMenu =
    open && menuInline ? (
      <div className="mt-2" style={{ maxHeight: estimatedListMax + PANEL_CHROME_PX }}>
        <MenuPanel {...menuProps} />
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
        <MenuPanel {...menuProps} />
      </div>
    ) : null;

  return (
    <div ref={containerRef} className={className}>
      {label ? (
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      ) : null}
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
        className={`${SINGLE_SELECT_TRIGGER_BASE_CLS} ${icon ? 'pl-10' : ''} ${singleSelectTriggerBorderClass(open, suppressOpenBorder)} ${singleSelectTriggerTextClass(hasSelection)}`}
        data-form-field-trigger="true"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 text-gray-400 dark:text-gray-500">
            {icon}
          </span>
        ) : null}
        <span className="block truncate">{triggerLabel}</span>
        <SingleSelectTriggerChevron open={open} />
      </button>

      {inlineMenu}
      {mounted && floatingMenu && getPortalRoot()
        ? createPortal(floatingMenu, getPortalRoot()!)
        : null}
    </div>
  );
}
