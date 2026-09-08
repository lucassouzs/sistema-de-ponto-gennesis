const CURRENCY_CELL_PATTERN = /^R\$\s*[\d.,-]+/i;

export function parseCurrencyCell(value: string): number | null {
  const text = value.trim();
  if (!text || text === '-' || text === 'R$ -' || text === 'R$-') return null;
  if (!CURRENCY_CELL_PATTERN.test(text)) return null;

  const normalized = text.replace(/[R$\s]/g, '').trim();
  if (!normalized || normalized === '-') return null;

  const parsed = normalized.includes(',')
    ? parseFloat(normalized.replace(/\./g, '').replace(',', '.'))
    : parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

export function isCurrencyColumn(rows: string[][], colIndex: number): boolean {
  return rows.some((row) => CURRENCY_CELL_PATTERN.test(row[colIndex]?.trim() ?? ''));
}

export function formatCurrencyTotal(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function sumCurrencyColumn(rows: string[][], colIndex: number): number {
  let total = 0;
  for (const row of rows) {
    const parsed = parseCurrencyCell(row[colIndex] ?? '');
    if (parsed != null) total += parsed;
  }
  return total;
}
