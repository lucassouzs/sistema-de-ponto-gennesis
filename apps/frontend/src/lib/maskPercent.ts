export function maskPercentInput(raw: string): string {
  let s = String(raw ?? '')
    .replace(/%/g, '')
    .replace(/\s/g, '');
  if (!s) return '';

  s = s.replace(/[^\d.,]/g, '');
  const commaIdx = s.lastIndexOf(',');
  const dotIdx = s.lastIndexOf('.');
  const sepIdx = Math.max(commaIdx, dotIdx);

  let intPart = (sepIdx >= 0 ? s.slice(0, sepIdx) : s).replace(/\D/g, '');
  let fracPart = sepIdx >= 0 ? s.slice(sepIdx + 1).replace(/\D/g, '').slice(0, 2) : '';

  if (intPart.length > 1) intPart = intPart.replace(/^0+(?=\d)/, '');
  if (!intPart && sepIdx >= 0) intPart = '0';

  const trimmed = String(raw ?? '').replace(/%/g, '').trim();
  const endsWithSep = /[.,]$/.test(trimmed);

  if (sepIdx < 0) return intPart ? `${intPart}%` : '';
  if (endsWithSep && !fracPart) return `${intPart || '0'},%`;
  return `${intPart || '0'},${fracPart}%`;
}

export function parsePercentInput(value: string): number | null {
  const t = String(value ?? '')
    .trim()
    .replace(/%/g, '')
    .replace(/\s/g, '');
  if (!t) return null;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function formatPercentFromNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}
