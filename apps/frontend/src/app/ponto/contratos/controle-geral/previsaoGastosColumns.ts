export type PrevisaoGastosColumn = {
  id: string;
  label: string;
};

const STORAGE_KEY = 'controle-geral-previsao-gastos-columns-v1';

export const DEFAULT_PREVISAO_GASTOS_COLUMNS: PrevisaoGastosColumn[] = [
  { id: 'previa-folha', label: 'Prévia da Folha' },
  { id: 'material', label: 'Material' },
  { id: 'empreita', label: 'Empreita' },
  { id: 'combustivel', label: 'Combustível' }
];

function slugifyColumnId(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `coluna-${Date.now()}`;
}

export function createPrevisaoGastosColumn(label: string): PrevisaoGastosColumn {
  const trimmed = label.trim().replace(/\s+/g, ' ');
  return {
    id: `${slugifyColumnId(trimmed)}-${Date.now().toString(36)}`,
    label: trimmed
  };
}

export function loadPrevisaoGastosColumns(): PrevisaoGastosColumn[] {
  if (typeof window === 'undefined') return DEFAULT_PREVISAO_GASTOS_COLUMNS.slice();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREVISAO_GASTOS_COLUMNS.slice();

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_PREVISAO_GASTOS_COLUMNS.slice();
    }

    const columns: PrevisaoGastosColumn[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const id = typeof (item as { id?: unknown }).id === 'string'
        ? (item as { id: string }).id.trim()
        : '';
      const label = typeof (item as { label?: unknown }).label === 'string'
        ? (item as { label: string }).label.trim()
        : '';
      if (!id || !label || seen.has(id)) continue;
      seen.add(id);
      columns.push({ id, label });
    }

    return columns.length > 0 ? columns : DEFAULT_PREVISAO_GASTOS_COLUMNS.slice();
  } catch {
    return DEFAULT_PREVISAO_GASTOS_COLUMNS.slice();
  }
}

export function savePrevisaoGastosColumns(columns: PrevisaoGastosColumn[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
  } catch {
    // ignore quota / private mode errors
  }
}
