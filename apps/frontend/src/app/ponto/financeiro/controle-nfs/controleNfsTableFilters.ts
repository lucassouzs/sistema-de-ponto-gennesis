export { normalizeSearchText } from '@/lib/normalizeSearchText';
import { normalizeSearchText } from '@/lib/normalizeSearchText';

export const EMPTY_FILTER_VALUE = '__EMPTY__';

export function cellFilterKey(value: string): string {
  const trimmed = value.trim();
  return trimmed || EMPTY_FILTER_VALUE;
}

export function cellFilterLabel(key: string): string {
  return key === EMPTY_FILTER_VALUE ? '(Vazios)' : key;
}

export type ColumnFiltersState = Record<number, string[]>;

export function getUniqueColumnValues(rows: string[][], colIndex: number): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    values.add(cellFilterKey(row[colIndex] ?? ''));
  }
  return Array.from(values).sort((a, b) => {
    if (a === EMPTY_FILTER_VALUE) return 1;
    if (b === EMPTY_FILTER_VALUE) return -1;
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
  });
}

export function isColumnFilterActive(
  colIndex: number,
  filters: ColumnFiltersState,
  allValues: string[]
): boolean {
  const selected = filters[colIndex];
  if (!selected) return false;
  if (allValues.length === 0) return false;
  return selected.length < allValues.length;
}

export function applyGlobalSearch(rows: string[][], query: string): string[][] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return rows;
  return rows.filter((row) =>
    row.some((cell) => normalizeSearchText(cell).includes(normalized))
  );
}

export function applyColumnFilters(rows: string[][], filters: ColumnFiltersState): string[][] {
  const activeEntries = Object.entries(filters).filter(([, selected]) => selected != null);
  if (activeEntries.length === 0) return rows;

  return rows.filter((row) =>
    activeEntries.every(([colIndexStr, selected]) => {
      const colIndex = Number(colIndexStr);
      if (!selected || selected.length === 0) return false;
      const key = cellFilterKey(row[colIndex] ?? '');
      return selected.includes(key);
    })
  );
}
