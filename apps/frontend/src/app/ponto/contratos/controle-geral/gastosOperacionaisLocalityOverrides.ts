import {
  buildCatalogLocalityOverrideMap,
  getContractLocality,
  normalizeContractOrderKey,
  type GastosOperacionaisLocality
} from './gastosOperacionaisContractOrder';

const STORAGE_KEY = 'gastos-operacionais-locality-overrides';
const CATALOG_SEED_KEY = 'gastos-operacionais-locality-catalog-seeded-v2';

export type GastosOperacionaisLocalityOverrideMap = Partial<
  Record<string, GastosOperacionaisLocality | null>
>;

export type EffectiveContractLocality = GastosOperacionaisLocality | 'OUTROS';

/**
 * Localidade efetiva do contrato.
 * Usa override salvo pelo usuário; senão, o catálogo embutido; contratos novos ficam em "Outros".
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
  visibleLocalities: readonly GastosOperacionaisLocality[] | undefined,
  overrides: GastosOperacionaisLocalityOverrideMap = {}
): boolean {
  if (!visibleLocalities?.length) return true;

  const effective = getEffectiveContractLocality(contract, overrides);
  if (effective === 'OUTROS') return false;

  return visibleLocalities.includes(effective);
}

export function contractMatchesLocalitiesWithOverrides(
  contract: string,
  localities: GastosOperacionaisLocality[],
  overrides: GastosOperacionaisLocalityOverrideMap = {}
): boolean {
  if (!localities.length) return true;
  const effective = getEffectiveContractLocality(contract, overrides);
  return effective !== 'OUTROS' && localities.includes(effective);
}

export function applyContractLocalityOverride(
  contract: string,
  locality: EffectiveContractLocality,
  overrides: GastosOperacionaisLocalityOverrideMap
): GastosOperacionaisLocalityOverrideMap {
  const key = normalizeContractOrderKey(contract);

  if (locality === 'OUTROS') {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) {
      return overrides;
    }
    const next = { ...overrides };
    delete next[key];
    return next;
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

    const parsed = JSON.parse(raw) as Record<string, GastosOperacionaisLocality | null>;
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
