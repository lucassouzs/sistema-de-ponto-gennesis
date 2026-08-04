import {
  buildCatalogLocalityOverrideMap,
  getContractLocality,
  normalizeContractOrderKey
} from './gastosOperacionaisContractOrder';

const STORAGE_KEY = 'gastos-operacionais-locality-overrides';
const CATALOG_SEED_KEY = 'gastos-operacionais-locality-catalog-seeded-v2';

export type GastosOperacionaisLocalityOverrideMap = Partial<Record<string, string | null>>;

export type EffectiveContractLocality = string;

export const SEM_LOCALIDADE_KEY = 'OUTROS' as const;
export const SEM_LOCALIDADE_LABEL = 'Sem localidade';

/**
 * Localidade efetiva do contrato.
 * Usa override salvo pelo usuário; senão, o catálogo embutido; contratos novos ficam em "Sem localidade".
 */
export function getEffectiveContractLocality(
  contract: string,
  overrides: GastosOperacionaisLocalityOverrideMap = {}
): EffectiveContractLocality {
  const key = normalizeContractOrderKey(contract);
  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    return overrides[key] ?? 'OUTROS';
  }
  return getContractLocality(contract) ?? 'OUTROS';
}

export function isContractInVisibleLocalities(
  contract: string,
  visibleLocalities: readonly string[] | undefined,
  overrides: GastosOperacionaisLocalityOverrideMap = {}
): boolean {
  if (!visibleLocalities?.length) return true;

  const effective = getEffectiveContractLocality(contract, overrides);
  // Sem localidade sempre aparece — para poder atribuir/mover depois.
  if (effective === 'OUTROS') return true;

  return visibleLocalities.includes(effective);
}

export function contractMatchesLocalitiesWithOverrides(
  contract: string,
  localities: string[],
  overrides: GastosOperacionaisLocalityOverrideMap = {}
): boolean {
  if (!localities.length) return true;
  const effective = getEffectiveContractLocality(contract, overrides);
  return localities.includes(effective);
}

export function applyContractLocalityOverride(
  contract: string,
  locality: EffectiveContractLocality,
  overrides: GastosOperacionaisLocalityOverrideMap
): GastosOperacionaisLocalityOverrideMap {
  const key = normalizeContractOrderKey(contract);

  // null = Sem localidade explícito (não volta ao catálogo embutido).
  if (locality === 'OUTROS') {
    if (Object.prototype.hasOwnProperty.call(overrides, key) && overrides[key] === null) {
      return overrides;
    }
    return {
      ...overrides,
      [key]: null
    };
  }

  if (overrides[key] === locality) {
    return overrides;
  }

  return {
    ...overrides,
    [key]: locality
  };
}

export function loadGastosLocalityOverrides(): GastosOperacionaisLocalityOverrideMap {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, string | null>;
    if (!parsed || typeof parsed !== 'object') return {};

    return parsed;
  } catch {
    return {};
  }
}

export function saveGastosLocalityOverrides(overrides: GastosOperacionaisLocalityOverrideMap): void {
  if (typeof window === 'undefined') return;

  try {
    if (!Object.keys(overrides).length) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore quota / private mode errors
  }
}

/**
 * Carrega overrides do usuário e garante entradas do catálogo embutido (sem sobrescrever o usuário).
 */
export function loadGastosLocalityOverridesWithCatalogSeed(): GastosOperacionaisLocalityOverrideMap {
  const existing = loadGastosLocalityOverrides();
  const catalog = buildCatalogLocalityOverrideMap();
  const merged: GastosOperacionaisLocalityOverrideMap = { ...existing };

  for (const [key, locality] of Object.entries(catalog)) {
    if (!Object.prototype.hasOwnProperty.call(merged, key)) {
      merged[key] = locality;
    }
  }

  const migrated = migrateMergedContractLocalityOverrides(merged);

  if (typeof window !== 'undefined') {
    if (migrated !== existing) {
      saveGastosLocalityOverrides(migrated);
    }
    if (!window.localStorage.getItem(CATALOG_SEED_KEY)) {
      window.localStorage.setItem(CATALOG_SEED_KEY, '1');
    }
  }

  return migrated;
}

/** Migra overrides de contratos unificados por alias (ex.: Lote 02 → Rio Verde). */
function migrateMergedContractLocalityOverrides(
  overrides: GastosOperacionaisLocalityOverrideMap
): GastosOperacionaisLocalityOverrideMap {
  const migrations: Array<{ from: string; to: string }> = [
    {
      from: normalizeContractOrderKey('TJGO MANUTENÇÃO LOTE 02'),
      to: normalizeContractOrderKey('TJ MANUTENÇÃO RIO VERDE - CORRETIVA')
    },
    {
      from: normalizeContractOrderKey('JUSTIÇA FEDERAL DE GOIÁS'),
      to: normalizeContractOrderKey('JUSTIÇA FEDERAL GOIAS')
    }
  ];

  let next = overrides;
  let changed = false;

  for (const { from, to } of migrations) {
    if (!Object.prototype.hasOwnProperty.call(next, from)) continue;
    if (!changed) {
      next = { ...next };
      changed = true;
    }
    if (!Object.prototype.hasOwnProperty.call(next, to) && next[from]) {
      next[to] = next[from];
    }
    delete next[from];
  }

  return next;
}
