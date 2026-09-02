export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatCpfInput(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function looksLikeEmail(value: string): boolean {
  return /[a-zA-Z@]/.test(value);
}

export function normalizeLoginIdentifierInput(value: string): string {
  const trimmed = value.trimStart();
  if (looksLikeEmail(trimmed)) return trimmed.toLowerCase();
  return formatCpfInput(trimmed);
}

export function serializeLoginIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (looksLikeEmail(trimmed)) return trimmed.toLowerCase();
  return onlyDigits(trimmed);
}
