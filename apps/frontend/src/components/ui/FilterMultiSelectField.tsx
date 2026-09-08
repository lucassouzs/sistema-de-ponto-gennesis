'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  MultiSelectSearchDropdown,
  type MultiSelectSearchOption
} from '@/components/ui/MultiSelectSearchDropdown';

export type FilterMultiSelectOption = MultiSelectSearchOption;

type FilterMultiSelectFieldProps<T extends string> = {
  fieldKey: T;
  label: string;
  icon: LucideIcon;
  options: FilterMultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  openField: T | null;
  onOpenField: (key: T | null) => void;
  disabled?: boolean;
  placeholder: string;
  searchPlaceholder: string;
  emptyOptionsMessage: string;
  emptySearchMessage: string;
  listMaxHeight?: number;
};

/** Multi-select com ícone e abertura exclusiva (modais de filtro). */
export function FilterMultiSelectField<T extends string>({
  fieldKey,
  label,
  icon: Icon,
  options,
  selected,
  onChange,
  openField,
  onOpenField,
  disabled,
  placeholder,
  searchPlaceholder,
  emptyOptionsMessage,
  emptySearchMessage,
  listMaxHeight
}: FilterMultiSelectFieldProps<T>) {
  return (
    <MultiSelectSearchDropdown
      label={label}
      options={options}
      selected={selected}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyOptionsMessage={emptyOptionsMessage}
      emptySearchMessage={emptySearchMessage}
      icon={<Icon className="h-4 w-4" aria-hidden />}
      menuInline
      noFocusRing
      listMaxHeight={listMaxHeight}
      open={openField === fieldKey}
      onOpenChange={(next) => onOpenField(next ? fieldKey : null)}
    />
  );
}
