const OLD_PLATE_REGEX = /^[A-Z]{3}[0-9]{4}$/;
const MERCOSUL_PLATE_REGEX = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

/** Posições que devem ser dígito (0-based), demais letras. */
const MERCOSUL_DIGIT_POS = new Set([3, 5, 6]);
const OLD_DIGIT_POS = new Set([3, 4, 5, 6]);

const TO_DIGIT: Record<string, string> = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  S: '5',
  B: '8',
  G: '6',
  Z: '2'
};

const TO_LETTER: Record<string, string> = {
  '0': 'O',
  '1': 'I',
  '5': 'S',
  '8': 'B',
  '6': 'G',
  '2': 'Z'
};

const AMBIGUOUS: Record<string, string[]> = {
  '0': ['0', 'O'],
  O: ['O', '0'],
  '1': ['1', 'I'],
  I: ['I', '1'],
  '5': ['5', 'S'],
  S: ['S', '5'],
  '8': ['8', 'B'],
  B: ['B', '8'],
  '6': ['6', 'G'],
  G: ['G', '6'],
  '2': ['2', 'Z'],
  Z: ['Z', '2'],
  Q: ['Q', '0'],
  D: ['D', '0'],
  L: ['L', '1']
};

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

  return raw;
}

export function normalizePlacaForStorage(value: unknown): string {
  return formatPlacaDisplay(String(value ?? '').trim());
}

export function placaVariants(value: string): string[] {
  const raw = stripPlaca(value);
  const formatted = formatPlacaDisplay(value);
  const variants = new Set<string>([raw, formatted]);
  if (OLD_PLATE_REGEX.test(raw)) {
    variants.add(`${raw.slice(0, 3)}-${raw.slice(3)}`);
    variants.add(raw);
  }
  return Array.from(variants);
}

function applyDigitLetterPattern(src: string, digitPositions: Set<number>): string {
  if (src.length !== 7) return src;
  return src
    .split('')
    .map((ch, i) => {
      const wantDigit = digitPositions.has(i);
      if (wantDigit) {
        if (/[0-9]/.test(ch)) return ch;
        return TO_DIGIT[ch] || ch;
      }
      if (/[A-Z]/.test(ch)) return ch;
      return TO_LETTER[ch] || ch;
    })
    .join('');
}

function expandAmbiguousPlates(raw: string): string[] {
  if (raw.length !== 7) return [raw];
  let results = [''];
  for (const ch of raw) {
    const opts = AMBIGUOUS[ch] || [ch];
    const next: string[] = [];
    for (const prefix of results) {
      for (const opt of opts) next.push(prefix + opt);
    }
    results = next;
    if (results.length > 128) break;
  }
  return results;
}

/**
 * Tenta corrigir placa “quase certa” da planilha (espaços, O/0, I/1, etc.).
 * Retorna formatada para gravação ou null se não der para validar.
 */
export function repairBrazilianPlate(value: unknown): string | null {
  const original = String(value ?? '').trim();
  if (!original) return null;

  const raw = stripPlaca(original);
  if (!raw) return null;
  if (isValidBrazilianPlate(raw)) return formatPlacaDisplay(raw);

  const seeds = new Set<string>([raw]);
  if (raw.length > 7) {
    seeds.add(raw.slice(0, 7));
    seeds.add(raw.slice(raw.length - 7));
  }

  for (const seed of seeds) {
    if (seed.length !== 7) continue;

    for (const pattern of [MERCOSUL_DIGIT_POS, OLD_DIGIT_POS]) {
      const fixed = applyDigitLetterPattern(seed, pattern);
      if (isValidBrazilianPlate(fixed)) return formatPlacaDisplay(fixed);
    }

    for (const variant of expandAmbiguousPlates(seed)) {
      if (isValidBrazilianPlate(variant)) return formatPlacaDisplay(variant);
      for (const pattern of [MERCOSUL_DIGIT_POS, OLD_DIGIT_POS]) {
        const fixed = applyDigitLetterPattern(variant, pattern);
        if (isValidBrazilianPlate(fixed)) return formatPlacaDisplay(fixed);
      }
    }
  }

  return null;
}
