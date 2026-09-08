/**
 * Espelha apps/frontend/.../gastosOperacionaisAllowedNaturezas.ts
 * + overrides persistidos (mappings / unlinked).
 */

import {
  getGastosOperacionaisDfcAllowedKeys,
  normalizeGastosOperacionaisNaturezaKey,
  gastosNaturezaTotalContribution as dfcGastosNaturezaTotalContribution,
  isGastosOperacionaisPositiveCreditNatureza as dfcIsPositiveCredit
} from './gastosOperacionaisDfcBlocks';
import {
  findNaturezaMapping,
  getCustomAllowedNaturezaKeys,
  isUnlinkedConfiguredNatureza,
  loadGastosNaturezasConfigStore
} from '../services/gastosOperacionaisNaturezasConfigStore';

const GASTOS_OPERACIONAIS_LEGACY_ALLOWED_NATUREZAS = [] as const;

const GASTOS_OPERACIONAIS_LEGACY_ALIASES = [] as const;

const GASTOS_OPERACIONAIS_LEGACY_ALLOWED_KEYS = new Set(
  [...GASTOS_OPERACIONAIS_LEGACY_ALLOWED_NATUREZAS, ...GASTOS_OPERACIONAIS_LEGACY_ALIASES].map(
    (natureza) => normalizeGastosOperacionaisNaturezaKey(natureza)
  )
);

const GASTOS_OPERACIONAIS_DFC_ALLOWED_KEYS = getGastosOperacionaisDfcAllowedKeys();

export function isGastosOperacionaisAllowedNatureza(natureza: string): boolean {
  const key = normalizeGastosOperacionaisNaturezaKey(natureza);
  if (!key || key === '—' || key === '-') return false;

  const store = loadGastosNaturezasConfigStore();
  if (isUnlinkedConfiguredNatureza(natureza, store)) return false;

  if (
    GASTOS_OPERACIONAIS_DFC_ALLOWED_KEYS.has(key) ||
    GASTOS_OPERACIONAIS_LEGACY_ALLOWED_KEYS.has(key)
  ) {
    return true;
  }

  return getCustomAllowedNaturezaKeys(store).has(key);
}

export function isGastosOperacionaisPositiveCreditNatureza(natureza: string): boolean {
  if (dfcIsPositiveCredit(natureza)) return true;

  const store = loadGastosNaturezasConfigStore();
  const mapping = findNaturezaMapping(natureza, store);
  if (!mapping) return false;

  if (mapping.sumAsPositiveCredit) return true;
  if (mapping.asAlias) {
    return dfcIsPositiveCredit(mapping.targetCanonicalLabel);
  }
  return false;
}

/**
 * Contribuição no total DFC com overrides de mappings customizados.
 */
export function gastosNaturezaTotalContribution(natureza: string, total: number): number {
  if (!Number.isFinite(total) || total === 0) return 0;
  const magnitude = Math.abs(total);

  if (isGastosOperacionaisPositiveCreditNatureza(natureza)) {
    return magnitude;
  }

  const store = loadGastosNaturezasConfigStore();
  const mapping = findNaturezaMapping(natureza, store);
  if (mapping?.asAlias) {
    return dfcGastosNaturezaTotalContribution(mapping.targetCanonicalLabel, total);
  }

  return -magnitude;
}
