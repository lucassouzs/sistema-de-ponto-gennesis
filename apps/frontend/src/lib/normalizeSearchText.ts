/** Remove acentos e normaliza caixa para buscas tolerantes (ex.: "antonio" encontra "Antônio"). */
export function normalizeSearchText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** True se `haystack` contém `needle`, ignorando acentos e maiúsculas/minúsculas. */
export function textMatchesSearch(
  haystack: string | null | undefined,
  needle: string | null | undefined
): boolean {
  const q = normalizeSearchText(needle);
  if (!q) return true;
  return normalizeSearchText(haystack).includes(q);
}
