import { getPrisma } from '../lib/prisma';
import { PNCP_KEYWORDS_OBJETO_PADRAO } from './pncpKeywords';

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export type PncpKeywordEntry = {
  keyword: string;
  custom: boolean;
};

let cachedNormalized: string[] | null = null;
let cachedEntries: PncpKeywordEntry[] | null = null;

export function invalidatePncpKeywordsCache() {
  cachedNormalized = null;
  cachedEntries = null;
}

function normalizeKeywordInput(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function toNormalizedUnique(keywords: string[]): string[] {
  return keywords
    .map((k) => normalizeSearchText(k))
    .filter((k, i, arr) => k.length >= 3 && arr.indexOf(k) === i);
}

export async function listCustomPncpKeywords(): Promise<string[]> {
  const rows = await getPrisma().$queryRaw<Array<{ keyword: string }>>`
    SELECT k.keyword
    FROM pncp_keywords_custom k
    ORDER BY k.keyword ASC
  `;
  return rows.map((row) => row.keyword).filter(Boolean);
}

export async function listPncpKeywordEntries(): Promise<PncpKeywordEntry[]> {
  // Sempre remonta a partir da lista padrão + custom (evita lista stale após hot reload).
  const custom = await listCustomPncpKeywords();
  const padraoSet = new Set(
    PNCP_KEYWORDS_OBJETO_PADRAO.map((k) => k.trim().toLowerCase()).filter(Boolean)
  );
  const entries: PncpKeywordEntry[] = [];

  for (const keyword of PNCP_KEYWORDS_OBJETO_PADRAO) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    entries.push({ keyword: trimmed, custom: false });
  }

  for (const keyword of custom) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    if (padraoSet.has(trimmed.toLowerCase())) continue;
    entries.push({ keyword: trimmed, custom: true });
  }

  entries.sort((a, b) => a.keyword.localeCompare(b.keyword, 'pt-BR'));
  cachedEntries = entries;
  cachedNormalized = null;
  return entries;
}

export async function loadPncpKeywordsNormalized(): Promise<string[]> {
  if (cachedNormalized) return cachedNormalized;
  const entries = await listPncpKeywordEntries();
  cachedNormalized = toNormalizedUnique(entries.map((e) => e.keyword));
  return cachedNormalized;
}

export async function addCustomPncpKeyword(input: {
  keyword: string;
  createdBy: string;
}): Promise<string> {
  const keyword = normalizeKeywordInput(input.keyword);
  if (keyword.length < 3) {
    throw new Error('A palavra-chave deve ter pelo menos 3 caracteres.');
  }

  const alreadyPadrao = PNCP_KEYWORDS_OBJETO_PADRAO.some(
    (k) => k.trim().toLowerCase() === keyword.toLowerCase()
  );
  if (alreadyPadrao) {
    throw new Error('Essa palavra-chave já existe na lista padrão.');
  }

  const existing = await getPrisma().$queryRaw<Array<{ keyword: string }>>`
    SELECT k.keyword
    FROM pncp_keywords_custom k
    WHERE lower(k.keyword) = lower(${keyword})
    LIMIT 1
  `;
  if (existing[0]) {
    throw new Error('Essa palavra-chave já foi adicionada.');
  }

  await getPrisma().$executeRaw`
    INSERT INTO pncp_keywords_custom (keyword, "createdBy", "createdAt")
    VALUES (${keyword}, ${input.createdBy}, CURRENT_TIMESTAMP)
  `;

  invalidatePncpKeywordsCache();
  return keyword;
}

export async function removeCustomPncpKeyword(keywordRaw: string): Promise<boolean> {
  const keyword = normalizeKeywordInput(keywordRaw);
  if (!keyword) return false;

  const result = await getPrisma().$executeRaw`
    DELETE FROM pncp_keywords_custom
    WHERE lower(keyword) = lower(${keyword})
  `;

  invalidatePncpKeywordsCache();
  return Number(result) > 0;
}
