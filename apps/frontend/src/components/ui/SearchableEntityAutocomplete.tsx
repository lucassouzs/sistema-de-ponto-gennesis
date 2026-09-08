'use client';

import React, { useMemo } from 'react';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';

export type SearchableEntityAutocompleteProps<T> = {
  /** Chave do item selecionado — quando informado, tem precedência sobre searchValue. */
  value?: string;
  searchValue: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (item: T) => void;
  items: T[];
  getItemKey: (item: T) => string;
  getItemLabel: (item?: T | null) => string;
  loading?: boolean;
  loadError?: boolean;
  /** @deprecated Ignorado — estilo vem do SingleSelectSearchDropdown. */
  inputClassName?: string;
  placeholder?: string;
  emptyListMessage?: string;
  notFoundMessage?: string;
  loadingMessage?: string;
  errorMessage?: string;
  maxResults?: number;
  noFocusRing?: boolean;
  allowEmpty?: boolean;
};

export function SearchableEntityAutocomplete<T>({
  value: valueProp,
  searchValue,
  isOpen: _isOpen,
  onOpen: _onOpen,
  onClose: _onClose,
  onSearchChange,
  onSelect,
  items,
  getItemKey,
  getItemLabel,
  loading = false,
  loadError = false,
  placeholder = 'Digite para buscar...',
  emptyListMessage = 'Nenhum registro disponível.',
  notFoundMessage = 'Nenhum resultado para esta busca.',
  loadingMessage = 'Carregando…',
  errorMessage = 'Erro ao carregar.',
  maxResults = 50,
  noFocusRing = false,
  allowEmpty = true,
}: SearchableEntityAutocompleteProps<T>) {
  const resolvedValue = useMemo(() => {
    if (valueProp !== undefined) return valueProp;
    const normalized = searchValue.trim().toLowerCase();
    if (!normalized) return '';
    const match = items.find((item) => getItemLabel(item).trim().toLowerCase() === normalized);
    return match ? getItemKey(match) : '';
  }, [valueProp, searchValue, items, getItemKey, getItemLabel]);

  const options: MultiSelectSearchOption[] = useMemo(() => {
    const base = items.slice(0, maxResults).map((item) => ({
      value: getItemKey(item),
      label: getItemLabel(item),
      searchText: getItemLabel(item),
    }));

    if (resolvedValue && !base.some((option) => option.value === resolvedValue) && searchValue.trim()) {
      base.unshift({
        value: resolvedValue,
        label: searchValue.trim(),
        searchText: searchValue.trim(),
      });
    }

    return base;
  }, [items, maxResults, getItemKey, getItemLabel, resolvedValue, searchValue]);

  const emptyMessage = loadError
    ? errorMessage
    : items.length === 0
      ? emptyListMessage
      : notFoundMessage;

  return (
    <SingleSelectSearchDropdown
      value={resolvedValue}
      onChange={(id) => {
        if (!id) {
          onSearchChange('');
          return;
        }
        const item = items.find((entry) => getItemKey(entry) === id);
        if (item) {
          onSelect(item);
          onSearchChange(getItemLabel(item));
        }
      }}
      options={options}
      disabled={loading}
      placeholder={placeholder}
      searchPlaceholder={placeholder}
      emptyOptionsMessage={loading ? loadingMessage : emptyMessage}
      emptySearchMessage={notFoundMessage}
      allowEmpty={allowEmpty}
      noFocusRing={noFocusRing}
    />
  );
}
