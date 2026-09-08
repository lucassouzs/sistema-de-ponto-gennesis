import { parseCurrencyInputBr } from '@/lib/maskCurrencyBr';

export const OC_TYPE_AVISTA = 'AVISTA';
export const OC_TYPE_BOLETO = 'BOLETO';

export function parseCurrencyBR(input: string): number | null {
  const t = input.trim().replace(/\s/g, '');
  if (!t) return null;
  const normalized = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Texto do campo quantidade → número (vazio ou inválido = null). Aceita vírgula ou ponto. */
export function numericQuantityFromInput(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** Texto do campo valor unitário → número (vazio ou inválido = 0). Aceita máscara BRL ou vírgula/ponto. */
export function numericUnitPriceFromInput(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  const fromMask = parseCurrencyInputBr(t);
  if (fromMask !== null) return Math.max(0, fromMask);
  const br = parseCurrencyBR(t);
  if (br !== null) return Math.max(0, br);
  const normalized = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function formatCurrencyBR(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/** Formata texto digitado no padrão brasileiro (ex.: 12,5 → 12,50). */
export function formatCurrencyInputValue(raw: string): string {
  const n = parseCurrencyBR(raw);
  if (n == null) return raw;
  return formatCurrencyBR(n);
}
