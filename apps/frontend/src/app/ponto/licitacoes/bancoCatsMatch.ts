const STOP_WORDS = new Set([
  'a',
  'as',
  'o',
  'os',
  'um',
  'uma',
  'uns',
  'umas',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'por',
  'para',
  'com',
  'sem',
  'sob',
  'sobre',
  'entre',
  'ate',
  'ou',
  'e',
  'que',
  'se',
  'ao',
  'aos',
  'pelo',
  'pela',
  'pelos',
  'pelas',
  'ser',
  'sera',
  'sendo',
  'ter',
  'tem',
  'tendo',
  'este',
  'esta',
  'esse',
  'essa',
  'isto',
  'isso',
  'seu',
  'sua',
  'seus',
  'suas',
  'meu',
  'minha',
  'como',
  'mais',
  'menos',
  'muito',
  'muita',
  'muitos',
  'muitas',
  'todo',
  'toda',
  'todos',
  'todas',
  'outro',
  'outra',
  'outros',
  'outras',
  'mesmo',
  'mesma',
  'ja',
  'ainda',
  'tambem',
  'nao',
  'sim',
  'apenas',
  'somente',
  'qualquer',
  'quando',
  'onde',
  'qual',
  'quais',
  'via',
]);

const UNIT_WORDS = new Set([
  'mm',
  'mm2',
  'mm3',
  'cm',
  'cm2',
  'm',
  'm2',
  'm3',
  'kg',
  'kv',
  'v',
  'va',
  'w',
  'kw',
  'a',
  'ma',
  'hp',
  'cv',
  'pol',
  'dn',
  'pn',
  'mpa',
  'mpas',
  'pa',
  'kpa',
  'fck',
]);

/** Normaliza texto para comparação (acentos, unidades e forma tipográfica). */
export function normalizeMatchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/mm\s*²/g, 'mm2')
    .replace(/m\s*²/g, 'm2')
    .replace(/cm\s*²/g, 'cm2')
    .replace(/[²]/g, '2')
    .replace(/[³]/g, '3')
    .replace(/(\d),(\d)/g, '$1.$2') // 1,5 → 1.5 para comparar de forma estável
    .replace(/\s+/g, ' ')
    .trim();
}

function protectUnitCompounds(value: string): string {
  return value
    .replace(/\bmm2\b/g, ' zzunitmmsqzz ')
    .replace(/\bcm2\b/g, ' zzunitcmsqzz ')
    .replace(/\bm2\b/g, ' zzunitmsqzz ')
    .replace(/\bmm3\b/g, ' zzunitmmcuzz ')
    .replace(/\bm3\b/g, ' zzunitmcuzz ');
}

function restoreUnitCompounds(value: string): string {
  return value
    .replace(/\bzzunitmmsqzz\b/g, 'mm2')
    .replace(/\bzzunitcmsqzz\b/g, 'cm2')
    .replace(/\bzzunitmsqzz\b/g, 'm2')
    .replace(/\bzzunitmmcuzz\b/g, 'mm3')
    .replace(/\bzzunitmcuzz\b/g, 'm3');
}

/** Texto indexável: palavras + números + unidades em tokens separados por espaço. */
export function buildSearchIndexText(value: string): string {
  const normalized = protectUnitCompounds(normalizeMatchText(value));
  // Mantém letras, dígitos, ponto, barra e hífen (úteis em 0.6/1.0 e anti-chama)
  const spaced = restoreUnitCompounds(
    normalized
      .replace(/([a-z]+)(\d)/g, '$1 $2')
      .replace(/(\d)([a-z]+)/g, '$1 $2')
      .replace(/[^a-z0-9./-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
  return ` ${spaced} `;
}

function isNumericToken(token: string): boolean {
  // Unidades compostas (mm2) não contam como "número puro"
  if (UNIT_WORDS.has(token)) return false;
  return /\d/.test(token);
}

function addKeyword(target: string[], seen: Set<string>, token: string) {
  const cleaned = token.replace(/^[-./]+|[-./]+$/g, '');
  if (!cleaned) return;
  if (seen.has(cleaned)) return;
  seen.add(cleaned);
  target.push(cleaned);
}

function isNoiseNumericToken(token: string): boolean {
  // Datas de referência (AF_12/2015), anos isolados e dígitos soltos geram ruído
  if (/^\d{2}\/\d{4}$/.test(token)) return true;
  if (/^(19|20)\d{2}$/.test(token)) return true;
  if (/^\d$/.test(token)) return true;
  return false;
}

/**
 * Separa vários serviços colados pelo usuário.
 * Prioridade: blocos por linha em branco → uma linha por serviço → texto único.
 */
export function splitHabilitacaoServicos(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Blocos separados por linha em branco (serviço com várias linhas internas).
  const byBlankLine = trimmed
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (byBlankLine.length > 1) {
    return byBlankLine;
  }

  // Cada quebra de linha = um serviço diferente (mesmo com nomes curtos).
  const lines = trimmed
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(\d+[\).\-:…]|[-•*])\s+/, '').trim())
    .filter(Boolean);

  if (lines.length > 1) {
    return lines;
  }

  return [trimmed];
}

/** Extrai palavras-chave relevantes, incluindo números e unidades técnicas. */
export function extractKeywords(text: string): string[] {
  const normalized = protectUnitCompounds(normalizeMatchText(text));
  const prepared = restoreUnitCompounds(
    normalized
      .replace(/([a-z]+)(\d)/g, '$1 $2')
      .replace(/(\d)([a-z]+)/g, '$1 $2')
      .replace(/[^a-z0-9./-]+/g, ' ')
  );

  const rawTokens = prepared.split(/\s+/).filter(Boolean);
  const keywords: string[] = [];
  const seen = new Set<string>();

  for (const token of rawTokens) {
    if (STOP_WORDS.has(token)) continue;

    if (isNumericToken(token)) {
      if (isNoiseNumericToken(token)) continue;
      // Aceita 1.5, 0.6/1.0, 450/750, etc.
      addKeyword(keywords, seen, token);
      // Também registra partes de frações: 0.6/1.0 → 0.6 e 1.0
      if (token.includes('/')) {
        for (const part of token.split('/')) {
          if (!part || !/\d/.test(part) || isNoiseNumericToken(part)) continue;
          addKeyword(keywords, seen, part);
        }
      }
      continue;
    }

    if (UNIT_WORDS.has(token)) {
      addKeyword(keywords, seen, token);
      continue;
    }

    // Palavras textuais / compostas: mínimo 3 letras (aceita fck, mpa, etc.)
    const lettersOnly = token.replace(/-/g, '');
    if (lettersOnly.length < 3) continue;
    if (/^[a-z]+(-[a-z]+)*$/.test(token)) {
      addKeyword(keywords, seen, token);
      if (token.includes('-')) {
        for (const part of token.split('-')) {
          if (part.length >= 3 && !STOP_WORDS.has(part)) {
            addKeyword(keywords, seen, part);
          }
        }
      }
    }
  }

  return keywords;
}

export type KeywordMatchResult<T> = {
  item: T;
  score: number;
  matchedKeywords: string[];
};

function keywordWeight(keyword: string): number {
  if (isNumericToken(keyword)) return 3;
  if (UNIT_WORDS.has(keyword)) return 2;
  return 1;
}

/** Pluraliza forma comum em português (texto já normalizado, sem acento). */
function toPortuguesePlural(word: string): string | null {
  if (word.length < 3 || word.endsWith('s')) return null;

  if (word.endsWith('ao') && word.length >= 3) return `${word.slice(0, -2)}oes`;
  if (word.endsWith('m')) return `${word.slice(0, -1)}ns`;
  if (word.endsWith('al') && word.length > 3) return `${word.slice(0, -2)}ais`;
  if (word.endsWith('el') && word.length > 3) return `${word.slice(0, -2)}eis`;
  if (word.endsWith('ol') && word.length > 3) return `${word.slice(0, -2)}ois`;
  if (word.endsWith('ul') && word.length > 3) return `${word.slice(0, -2)}uis`;
  if (word.endsWith('il') && word.length > 3) return `${word.slice(0, -2)}is`;
  if (/[rzn]$/.test(word)) return `${word}es`;

  const last = word[word.length - 1];
  if ('aeiou'.includes(last)) return `${word}s`;
  return null;
}

/** Singulariza forma comum em português (texto já normalizado, sem acento). */
function toPortugueseSingular(word: string): string | null {
  if (word.length < 4 || !word.endsWith('s')) return null;

  if (word.endsWith('oes') && word.length > 4) return `${word.slice(0, -3)}ao`;
  if (word.endsWith('aes') && word.length > 4) return `${word.slice(0, -3)}ao`;
  if (word.endsWith('aos') && word.length > 4) return `${word.slice(0, -3)}ao`;
  if (word.endsWith('ais') && word.length > 4) return `${word.slice(0, -3)}al`;
  if (word.endsWith('eis') && word.length > 4) return `${word.slice(0, -3)}el`;
  if (word.endsWith('ois') && word.length > 4) return `${word.slice(0, -3)}ol`;
  if (word.endsWith('uis') && word.length > 4) return `${word.slice(0, -3)}ul`;
  if (word.endsWith('ns') && word.length > 3) return `${word.slice(0, -2)}m`;

  if (word.endsWith('es') && word.length > 4) {
    const stem = word.slice(0, -2);
    if (/[rzn]$/.test(stem)) return stem;
  }

  // telhas → telha, metalicas → metalica (exige ≥4 letras no singular)
  if (word.length > 4) {
    const withoutS = word.slice(0, -1);
    const last = withoutS[withoutS.length - 1];
    if ('aeiou'.includes(last) && withoutS.length >= 4) return withoutS;
  }

  return null;
}

/**
 * Expande um token textual para singular e plural em português,
 * para que "telha" e "telhas" (ou "metalica"/"metalicas") casem entre si.
 */
export function expandPortugueseNumberVariants(token: string): string[] {
  if (!token || UNIT_WORDS.has(token) || isNumericToken(token)) return [token];
  if (token.length < 3 || !/^[a-z]+(-[a-z]+)*$/.test(token)) return [token];

  const forms = new Set<string>([token]);
  const singular = toPortugueseSingular(token);
  if (singular) forms.add(singular);

  const pluralFromToken = toPortuguesePlural(token);
  if (pluralFromToken) forms.add(pluralFromToken);

  if (singular) {
    const pluralFromSingular = toPortuguesePlural(singular);
    if (pluralFromSingular) forms.add(pluralFromSingular);
  }

  return Array.from(forms);
}

function tokenMatchesInSearchText(searchText: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`);
  return pattern.test(searchText);
}

/** Verifica se a chave aparece no texto indexado (números/unidades exatos; texto com plural PT). */
export function containsKeyword(searchText: string, keyword: string): boolean {
  // Busca por token delimitado sempre que possível, para evitar falso positivo
  // (ex.: "1.5" não deve casar dentro de "11.5" sem contexto).
  if (isNumericToken(keyword) || UNIT_WORDS.has(keyword)) {
    return tokenMatchesInSearchText(searchText, keyword);
  }

  // Singular/plural: "telha" ↔ "telhas", "metalica" ↔ "metalicas"
  for (const variant of expandPortugueseNumberVariants(keyword)) {
    if (tokenMatchesInSearchText(searchText, variant)) return true;
  }
  return false;
}

/**
 * Ranqueia itens pelas palavras-chave presentes no texto indexado.
 * Ordem principal: quantidade de chaves (decrescente).
 * Em empate: peso de números/unidades e similaridade com a consulta.
 */
export function matchByKeywords<T extends { searchText: string }>(
  items: T[],
  keywords: string[],
  options?: { minScore?: number; limit?: number | null; queryText?: string }
): KeywordMatchResult<T>[] {
  if (keywords.length === 0) return [];

  const minScore = options?.minScore ?? 1;
  /** `null` = sem corte. Se `limit` for omitido, usa 80 (legado). Número positivo limita. */
  const limit =
    options && 'limit' in options
      ? options.limit
      : 80;
  const queryIndex = options?.queryText
    ? buildSearchIndexText(options.queryText).trim()
    : '';
  const results: KeywordMatchResult<T>[] = [];

  for (const item of items) {
    const matchedKeywords: string[] = [];
    let weightedScore = 0;

    for (const keyword of keywords) {
      if (containsKeyword(item.searchText, keyword)) {
        matchedKeywords.push(keyword);
        weightedScore += keywordWeight(keyword);
      }
    }

    if (matchedKeywords.length < minScore) continue;

    const coverage = matchedKeywords.length / keywords.length;
    let score = weightedScore + coverage;

    // Bônus quando a descrição é essencialmente a mesma da consulta
    if (queryIndex) {
      const itemIndex = item.searchText.trim();
      if (itemIndex === queryIndex) {
        score += 100;
      } else if (itemIndex.includes(queryIndex) || queryIndex.includes(itemIndex)) {
        score += 40;
      }
    }

    results.push({ item, score, matchedKeywords });
  }

  results.sort((a, b) => {
    const keyDiff = b.matchedKeywords.length - a.matchedKeywords.length;
    if (keyDiff !== 0) return keyDiff;
    if (b.score !== a.score) return b.score - a.score;
    return 0;
  });

  if (typeof limit === 'number' && limit > 0) {
    return results.slice(0, limit);
  }
  return results;
}
