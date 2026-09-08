/**
 * Códigos de CC no cadastro (ex.: 02.01.01.01.013) vs RM (ex.: 102.01.01.01.013).
 * SEDES / SEDES NORTE: prefixar "1" somente em códigos hierárquicos (02.xxx, 03.xxx).
 *
 * Prefixos: TOTVS_RM_SEDES_FAMILY_CODE_PREFIXES=02.,03.
 */

const DEFAULT_SEDES_FAMILY_PREFIXES = ['02.', '03.'];

function getSedesFamilyPrefixes(): string[] {
  const raw = process.env.TOTVS_RM_SEDES_FAMILY_CODE_PREFIXES?.trim();
  if (raw) {
    return raw
      .split(/[,;]/)
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return DEFAULT_SEDES_FAMILY_PREFIXES;
}

/** Código hierárquico SEDES no cadastro (ex.: 02.01.01.01.013), não CC-2026-001. */
export function isHierarchicalSedesFamilyCode(code: string): boolean {
  const c = String(code ?? '').trim();
  if (!c || !/^\d{2}\./.test(c)) return false;
  if (alreadyHasRmSedesLeadingOne(c)) return false;
  return getSedesFamilyPrefixes().some((prefix) => c.startsWith(prefix));
}

/** Já está no formato RM (ex.: 102.01.01.01.013). */
export function alreadyHasRmSedesLeadingOne(code: string): boolean {
  const c = String(code ?? '').trim();
  if (!c.startsWith('1') || c.length < 4) return false;
  const rest = c.slice(1);
  return getSedesFamilyPrefixes().some((prefix) => rest.startsWith(prefix));
}

/** Código com "1" na frente para consulta RM. */
export function toRmSedesPrefixedCode(code: string): string {
  const c = String(code ?? '').trim();
  if (!c || alreadyHasRmSedesLeadingOne(c)) return c;
  return `1${c}`;
}

/**
 * Candidatos para busca no RM (prefixed primeiro quando aplicável).
 * CC com nome "SEDES" mas código CC-2026-xxx → só o código cadastrado (match por nome no RM).
 */
export function totvsRmContractLookupCodes(code: string, _name: string): string[] {
  const c = String(code ?? '').trim();
  if (!c) return [];
  if (isHierarchicalSedesFamilyCode(c)) {
    const rm = toRmSedesPrefixedCode(c);
    return rm !== c ? [rm, c] : [c];
  }
  return [c];
}

/** Código principal enviado ao RM (primeiro candidato). */
export function totvsRmContractLookupCostCenterCode(code: string, name: string): string {
  const candidates = totvsRmContractLookupCodes(code, name);
  return candidates[0] ?? String(code ?? '').trim();
}
