import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';

export function stringsToSelectOptions(items: readonly string[]): MultiSelectSearchOption[] {
  return items.map((item) => ({
    value: item,
    label: item,
    searchText: item,
  }));
}

export function labeledToSelectOptions(
  items: ReadonlyArray<{ value: string; label: string; searchText?: string }>
): MultiSelectSearchOption[] {
  return items.map((item) => ({
    value: item.value,
    label: item.label,
    searchText: item.searchText ?? item.label,
  }));
}

export const PERCENT_0_100_STEP5_OPTIONS: MultiSelectSearchOption[] = Array.from(
  { length: 21 },
  (_, index) => {
    const percent = index * 5;
    const value = String(percent);
    return { value, label: `${percent}%`, searchText: value };
  }
);

export const EMPLOYEE_POLO_OPTIONS = stringsToSelectOptions(['BRASÍLIA', 'GOIÁS']);

export const EMPLOYEE_MODALITY_OPTIONS = labeledToSelectOptions([
  { value: 'CLT', label: 'CLT' },
  { value: 'MEI', label: 'MEI' },
  { value: 'ESTAGIARIO', label: 'ESTAGIÁRIO' },
]);

export const EMPLOYEE_CATEGORIA_FINANCEIRA_OPTIONS = stringsToSelectOptions(['CUSTO', 'DESPESA']);

export const EMPLOYEE_REGIME_OPTIONS = labeledToSelectOptions([
  { value: 'PRESENCIAL', label: 'Presencial' },
  { value: 'REMOTO', label: 'Remoto' },
]);

export function selectTriggerErrorCls(hasError: boolean): string {
  return hasError ? '[&>button]:!border-red-500 dark:[&>button]:!border-red-400' : '';
}

/** Opções de filtro com valor "all" como primeira opção (ex.: Todos / Todas). */
export function filterOptionsWithAll(
  items: readonly string[],
  allLabel = 'Todos'
): MultiSelectSearchOption[] {
  const filtered = items.filter((item) => item !== 'Todos' && item !== 'Todas');
  return [
    { value: 'all', label: allLabel, searchText: allLabel },
    ...stringsToSelectOptions(filtered),
  ];
}

export const EMPLOYEE_STATUS_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
]);
