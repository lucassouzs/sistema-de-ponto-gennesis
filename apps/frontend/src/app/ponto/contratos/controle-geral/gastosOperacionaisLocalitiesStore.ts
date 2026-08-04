import {
  buildCatalogLocalityOverrideMap,
  GASTOS_OPERACIONAIS_LOCALITIES,
  type GastosOperacionaisLocality
} from './gastosOperacionaisContractOrder';
import {
  loadGastosLocalityOverrides,
  saveGastosLocalityOverrides,
  type GastosOperacionaisLocalityOverrideMap
} from './gastosOperacionaisLocalityOverrides';

const STORAGE_KEY = 'gastos-operacionais-localities-catalog-v1';

export type GastosLocalityKey = string;

export type GastosLocalityItem = {
  key: GastosLocalityKey;
  label: string;
  builtIn: boolean;
};

type LocalitiesCatalogStore = {
  /** Localidades criadas pelo usuário. */
  custom: Array<{ key: string; label: string }>;
  /** Renomeações de localidades (built-in ou custom). */
  labelOverrides: Record<string, string>;
  /** Keys removidas (não reaparecem no seed). */
  removedKeys: string[];
};

const EMPTY_STORE: LocalitiesCatalogStore = {
  custom: [],
  labelOverrides: {},
  removedKeys: []
};

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function slugifyLocalityKey(label: string): string {
  const base =
    stripAccents(label)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'LOCALIDADE';
  return `CUSTOM_${base}`;
}

function readStore(): LocalitiesCatalogStore {
  if (typeof window === 'undefined') return { ...EMPTY_STORE };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_STORE };

    const parsed = JSON.parse(raw) as Partial<LocalitiesCatalogStore>;
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_STORE };

    return {
      custom: Array.isArray(parsed.custom)
        ? parsed.custom.filter(
            (item): item is { key: string; label: string } =>
              !!item &&
              typeof item === 'object' &&
              typeof item.key === 'string' &&
              typeof item.label === 'string' &&
              item.key.length > 0 &&
              item.label.trim().length > 0
          )
        : [],
      labelOverrides:
        parsed.labelOverrides && typeof parsed.labelOverrides === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.labelOverrides).filter(
                (entry): entry is [string, string] =>
                  typeof entry[0] === 'string' && typeof entry[1] === 'string'
              )
            )
          : {},
      removedKeys: Array.isArray(parsed.removedKeys)
        ? parsed.removedKeys.filter((key): key is string => typeof key === 'string' && key.length > 0)
        : []
    };
  } catch {
    return { ...EMPTY_STORE };
  }
}

function writeStore(store: LocalitiesCatalogStore): void {
  if (typeof window === 'undefined') return;

  try {
    const isEmpty =
      store.custom.length === 0 &&
      store.removedKeys.length === 0 &&
      Object.keys(store.labelOverrides).length === 0;
    if (isEmpty) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota / private mode
  }
}

const builtInKeySet = new Set(
  GASTOS_OPERACIONAIS_LOCALITIES.map((item) => item.key as string)
);

/** Lista ativa de localidades (seed − removidas + custom), com labels sobrescritos. */
export function loadGastosLocalitiesCatalog(): GastosLocalityItem[] {
  const store = readStore();
  const removed = new Set(store.removedKeys);

  const builtIn: GastosLocalityItem[] = GASTOS_OPERACIONAIS_LOCALITIES.filter(
    (item) => !removed.has(item.key)
  ).map((item) => ({
    key: item.key,
    label: store.labelOverrides[item.key]?.trim() || item.label,
    builtIn: true
  }));

  const custom: GastosLocalityItem[] = store.custom
    .filter((item) => !removed.has(item.key))
    .map((item) => ({
      key: item.key,
      label: store.labelOverrides[item.key]?.trim() || item.label,
      builtIn: false
    }));

  return [...builtIn, ...custom];
}

export function getGastosLocalityLabelFromCatalog(
  key: GastosLocalityKey,
  catalog: readonly GastosLocalityItem[] = loadGastosLocalitiesCatalog()
): string {
  if (key === 'OUTROS') return 'Sem localidade';
  return catalog.find((item) => item.key === key)?.label ?? key;
}

function allocateUniqueKey(preferred: string, existingKeys: Set<string>): string {
  if (!existingKeys.has(preferred)) return preferred;
  let n = 2;
  while (existingKeys.has(`${preferred}_${n}`)) n += 1;
  return `${preferred}_${n}`;
}

export function createGastosLocality(label: string): GastosLocalityItem {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error('Informe o nome da localidade.');
  }

  const store = readStore();
  const existing = new Set([
    ...loadGastosLocalitiesCatalog().map((item) => item.key),
    ...store.removedKeys
  ]);
  const key = allocateUniqueKey(slugifyLocalityKey(trimmed), existing);

  const next: LocalitiesCatalogStore = {
    ...store,
    custom: [...store.custom, { key, label: trimmed }],
    removedKeys: store.removedKeys.filter((k) => k !== key)
  };
  writeStore(next);

  return { key, label: trimmed, builtIn: false };
}

export function renameGastosLocality(key: GastosLocalityKey, label: string): GastosLocalityItem {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error('Informe o nome da localidade.');
  }
  if (key === 'OUTROS') {
    throw new Error('Sem localidade não pode ser editada.');
  }

  const catalog = loadGastosLocalitiesCatalog();
  const current = catalog.find((item) => item.key === key);
  if (!current) {
    throw new Error('Localidade não encontrada.');
  }

  const store = readStore();
  const next: LocalitiesCatalogStore = {
    ...store,
    labelOverrides: {
      ...store.labelOverrides,
      [key]: trimmed
    },
    custom: store.custom.map((item) =>
      item.key === key ? { ...item, label: trimmed } : item
    )
  };
  writeStore(next);

  return { key, label: trimmed, builtIn: current.builtIn };
}

/**
 * Remove a localidade e move contratos associados para Sem localidade (OUTROS).
 * Retorna quantos contratos foram remanejados.
 */
export function deleteGastosLocality(key: GastosLocalityKey): {
  removed: GastosLocalityItem;
  movedContracts: number;
} {
  if (key === 'OUTROS') {
    throw new Error('Sem localidade não pode ser removida.');
  }

  const catalog = loadGastosLocalitiesCatalog();
  const current = catalog.find((item) => item.key === key);
  if (!current) {
    throw new Error('Localidade não encontrada.');
  }

  const store = readStore();
  const nextStore: LocalitiesCatalogStore = {
    custom: store.custom.filter((item) => item.key !== key),
    labelOverrides: { ...store.labelOverrides },
    removedKeys: store.removedKeys.includes(key)
      ? store.removedKeys
      : [...store.removedKeys, key]
  };
  delete nextStore.labelOverrides[key];
  writeStore(nextStore);

  const overrides = loadGastosLocalityOverrides();
  const nextOverrides: GastosOperacionaisLocalityOverrideMap = { ...overrides };
  const movedKeys = new Set<string>();

  for (const [contractKey, locality] of Object.entries(overrides)) {
    if (locality === key) {
      nextOverrides[contractKey] = null;
      movedKeys.add(contractKey);
    }
  }

  // Contratos do catálogo embutido dessa localidade: força Sem localidade
  // (senão o seed/catalog volta a atribuí-los).
  if (builtInKeySet.has(key)) {
    const catalogMap = buildCatalogLocalityOverrideMap();
    for (const [contractKey, locality] of Object.entries(catalogMap)) {
      if (locality !== (key as GastosOperacionaisLocality)) continue;
      const currentOverride = Object.prototype.hasOwnProperty.call(nextOverrides, contractKey)
        ? nextOverrides[contractKey]
        : undefined;
      if (currentOverride === undefined || currentOverride === key) {
        nextOverrides[contractKey] = null;
        movedKeys.add(contractKey);
      }
    }
  }

  saveGastosLocalityOverrides(nextOverrides);

  return { removed: current, movedContracts: movedKeys.size };
}
