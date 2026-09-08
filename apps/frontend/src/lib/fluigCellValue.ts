/** Valor de célula Fluig (string ou objeto com display/value). */
export function formatFluigCellValue(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (val instanceof Date) return val.toLocaleString('pt-BR');
  if (typeof val === 'object' && val !== null) {
    const o = val as Record<string, unknown>;
    const v = o.display ?? o.displayValue ?? o.value ?? o.internalValue;
    return v != null ? String(v).trim() : '';
  }
  return String(val).trim();
}

export function normalizeFluigColumnKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}
