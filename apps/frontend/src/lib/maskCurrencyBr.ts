const currencyFormatterBr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const unitPriceFormatterBr = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 5,
});

/**
 * Mesma regra do salário em `CreateEmployeeForm` / `EditEmployeeForm`: só dígitos,
 * valor = int(dígitos) / 100 (os dois últimos dígitos são centavos).
 */
export function maskCurrencyInputBr(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const asNumber = digits ? parseInt(digits, 10) / 100 : 0;
  return currencyFormatterBr.format(asNumber);
}

/** Como `maskCurrencyInputBr`, mas retorna vazio quando não há dígitos. */
export function maskCurrencyInputBrOrEmpty(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return currencyFormatterBr.format(parseInt(digits, 10) / 100);
}

export function parseCurrencyInputBr(value: string): number | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return parseInt(digits, 10) / 100;
}

export function formatCurrencyInputBrFromNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return '';
  return currencyFormatterBr.format(n);
}

/** Formata preço unitário com até 5 casas (ex.: R$ 0,03230). */
export function formatUnitPriceBr(value: number): string {
  return unitPriceFormatterBr.format(value);
}

/**
 * Máscara para preço unitário com vírgula decimal (até `maxDecimals` casas).
 * Não usa a regra de centavos — permite digitar `0,0323`.
 */
export function maskUnitPriceInputBr(raw: string, maxDecimals = 5): string {
  let s = String(raw ?? '')
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '');
  if (!s) return '';

  s = s.replace(/[^\d.,]/g, '');
  if (!s) return '';

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const sepIdx = Math.max(lastComma, lastDot);
  const hasSep = sepIdx >= 0;

  let intDigits = (hasSep ? s.slice(0, sepIdx) : s).replace(/\D/g, '');
  let fracDigits = hasSep ? s.slice(sepIdx + 1).replace(/\D/g, '') : '';
  fracDigits = fracDigits.slice(0, Math.max(0, maxDecimals));

  // Mantém zeros à esquerda só o necessário ao digitar decimais (0,0323).
  if (intDigits.length > 1) {
    intDigits = intDigits.replace(/^0+(?=\d)/, '');
  }
  if (!intDigits) {
    intDigits = hasSep ? '0' : '';
  }

  if (!hasSep) return intDigits;

  const trimmed = String(raw ?? '').replace(/R\$\s?/gi, '').trim();
  const endsWithSep = /[.,]$/.test(trimmed);
  if (endsWithSep && !fracDigits) return `${intDigits},`;
  return `${intDigits},${fracDigits}`;
}

/** Converte texto de preço unitário (com ou sem R$) em número. */
export function parseUnitPriceInputBr(value: string): number | null {
  const t = String(value ?? '')
    .trim()
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '');
  if (!t) return null;

  const hasComma = t.includes(',');
  const hasDot = t.includes('.');

  let normalized = t;
  if (hasComma && hasDot) {
    normalized = t.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = t.replace(',', '.');
  } else if (hasDot) {
    const parts = t.split('.');
    // Um único ponto = decimal (inclui 0.0323). Vários = milhar.
    normalized = parts.length === 2 ? t : t.replace(/\./g, '');
  }

  normalized = normalized.replace(/[^0-9.-]/g, '');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}
