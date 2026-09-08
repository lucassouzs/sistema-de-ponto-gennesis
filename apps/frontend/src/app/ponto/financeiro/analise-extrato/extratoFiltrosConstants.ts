export const MOVIMENTO_TIPO_FILTER_OPTIONS = [
  { value: 'entrada', label: 'Entradas', searchText: 'entradas entrada crédito' },
  { value: 'saida', label: 'Saídas', searchText: 'saídas saida débito' }
] as const;

export const MOVIMENTO_TIPO_ALL_VALUES = MOVIMENTO_TIPO_FILTER_OPTIONS.map((o) => o.value);

export const EXTRATO_FILTER_DATE_CLASS =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-red-400';
