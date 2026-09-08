const OLD_PLATE_REGEX = /^[A-Z]{3}[0-9]{4}$/;
const MERCOSUL_PLATE_REGEX = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

export function stripPlaca(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidBrazilianPlate(value: string): boolean {
  const raw = stripPlaca(value);
  return OLD_PLATE_REGEX.test(raw) || MERCOSUL_PLATE_REGEX.test(raw);
}

export function formatPlacaDisplay(value: string): string {
  const raw = stripPlaca(value);
  if (!raw) return '';

  if (MERCOSUL_PLATE_REGEX.test(raw)) return raw;
  if (OLD_PLATE_REGEX.test(raw)) return `${raw.slice(0, 3)}-${raw.slice(3)}`;

  return maskBrazilianPlate(value);
}

/** Máscara dinâmica: antiga ABC-1234 ou Mercosul AAA0A00 */
export function maskBrazilianPlate(input: string): string {
  const raw = stripPlaca(input);

  let letters = '';
  let index = 0;
  while (index < raw.length && letters.length < 3) {
    const char = raw[index];
    if (/[A-Z]/.test(char)) letters += char;
    index += 1;
  }

  const rest = raw.slice(index);
  if (letters.length < 3) return letters;
  if (!rest) return letters;

  if (/^[0-9][A-Z]/.test(rest)) {
    const digit = rest[0];
    const letter = rest[1];
    const suffix = rest.slice(2).replace(/[^0-9]/g, '').slice(0, 2);
    return `${letters}${digit}${letter}${suffix}`;
  }

  const digits = rest.replace(/[^0-9]/g, '').slice(0, 4);
  return digits ? `${letters}-${digits}` : letters;
}

export function normalizePlacaForStorage(value: string): string {
  return formatPlacaDisplay(value);
}

export function normalizePlacaForCompare(value: string): string {
  return stripPlaca(value);
}
