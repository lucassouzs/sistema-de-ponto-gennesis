'use client';

import React, { useMemo } from 'react';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Digite para buscar...',
  className = '',
  label,
  error,
  disabled = false
}: SearchableSelectProps) {
  const dropdownOptions = useMemo(
    () => options.map((option) => ({ value: option, label: option, searchText: option })),
    [options]
  );

  return (
    <div className={className}>
      {label ? (
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      ) : null}
      <SingleSelectSearchDropdown
        value={value}
        onChange={onChange}
        options={dropdownOptions}
        disabled={disabled}
        placeholder={placeholder}
        searchPlaceholder="Pesquisar..."
        emptyOptionsMessage="Nenhuma opção disponível."
        emptySearchMessage="Nenhum item encontrado."
        allowEmpty
        noFocusRing
      />
      {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
