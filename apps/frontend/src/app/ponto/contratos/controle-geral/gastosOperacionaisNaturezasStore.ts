import {
  GASTOS_OPERACIONAIS_DFC_LEAF_BLOCKS,
  isGastosOperacionaisPositiveCreditNatureza,
  normalizeGastosOperacionaisNaturezaKey,
  resolveGastosOperacionaisDfcEntry,
  type GastosOperacionaisDfcLeafBlock
} from './gastosOperacionaisDfcBlocks';

const STORAGE_KEY = 'gastos-operacionais-naturezas-config-v1';

export type GastosNaturezaCustomMapping = {
  id: string;
  /** Rótulo exato ou normalizado vindo do TOTVS RM. */
  totvsLabel: string;
  blockId: string;
  /** Natureza canônica do bloco DFC (existente ou nova). */
  targetCanonicalLabel: string;
  /** Quando true, totvsLabel é alias da canônica; quando false, nova entrada no bloco. */
  asAlias: boolean;
  sumAsPositiveCredit?: boolean;
  createdAt: string;
};

export type GastosNaturezasConfigStore = {
  mappings: GastosNaturezaCustomMapping[];
  /** Naturezas do TOTVS marcadas como "não precisa mapear". */
  dismissedTotvsKeys: string[];
  /** Naturezas novas já visualizadas pelo usuário (some o badge). */
  acknowledgedTotvsKeys: string[];
  /** Naturezas do catálogo DFC desvinculadas pelo usuário (some de Configuradas). */
  unlinkedConfiguredKeys: string[];
};

export type GastosConfiguredNaturezaItem = {
  key: string;
  label: string;
  aliases: string[];
  blockId: string;
  blockCode: string;
  blockLabel: string;
  blockPath: string;
  sumAsPositiveCredit: boolean;
  builtIn: boolean;
  customMappingId?: string;
};

export type GastosTotvsNaturezaItem = {
  key: string;
  label: string;
  total: number;
  totalAbs: number;
  byContract: Array<{ contract: string; total: number }>;
  isConfigured: boolean;
  isDismissed: boolean;
  isAcknowledged: boolean;
  isNew: boolean;
  mappedBlockId?: string;
  mappedCanonicalLabel?: string;
};

const EMPTY_STORE: GastosNaturezasConfigStore = {
  mappings: [],
  dismissedTotvsKeys: [],
  acknowledgedTotvsKeys: [],
  unlinkedConfiguredKeys: []
};

function readStore(): GastosNaturezasConfigStore {
  if (typeof window === 'undefined') return { ...EMPTY_STORE };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_STORE };

    const parsed = JSON.parse(raw) as Partial<GastosNaturezasConfigStore>;
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_STORE };

    return {
      mappings: Array.isArray(parsed.mappings)
        ? parsed.mappings.filter(
            (item): item is GastosNaturezaCustomMapping =>
              !!item &&
              typeof item === 'object' &&
              typeof item.id === 'string' &&
              typeof item.totvsLabel === 'string' &&
              typeof item.blockId === 'string' &&
              typeof item.targetCanonicalLabel === 'string' &&
              typeof item.createdAt === 'string'
          )
        : [],
      dismissedTotvsKeys: Array.isArray(parsed.dismissedTotvsKeys)
        ? parsed.dismissedTotvsKeys.filter((key): key is string => typeof key === 'string')
        : [],
      acknowledgedTotvsKeys: Array.isArray(parsed.acknowledgedTotvsKeys)
        ? parsed.acknowledgedTotvsKeys.filter((key): key is string => typeof key === 'string')
        : [],
      unlinkedConfiguredKeys: Array.isArray(parsed.unlinkedConfiguredKeys)
        ? parsed.unlinkedConfiguredKeys.filter((key): key is string => typeof key === 'string')
        : []
    };
  } catch {
    return { ...EMPTY_STORE };
  }
}

function writeStore(store: GastosNaturezasConfigStore): void {
  if (typeof window === 'undefined') return;

  try {
    const isEmpty =
      store.mappings.length === 0 &&
      store.dismissedTotvsKeys.length === 0 &&
      store.acknowledgedTotvsKeys.length === 0 &&
      store.unlinkedConfiguredKeys.length === 0;
    if (isEmpty) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota / private mode
  }
}

export function loadGastosNaturezasConfigStore(): GastosNaturezasConfigStore {
  return readStore();
}

/** Substitui o store local (ex.: sync com o servidor). */
export function replaceGastosNaturezasConfigStore(
  store: GastosNaturezasConfigStore
): GastosNaturezasConfigStore {
  const next: GastosNaturezasConfigStore = {
    mappings: Array.isArray(store.mappings) ? store.mappings : [],
    dismissedTotvsKeys: Array.isArray(store.dismissedTotvsKeys) ? store.dismissedTotvsKeys : [],
    acknowledgedTotvsKeys: Array.isArray(store.acknowledgedTotvsKeys)
      ? store.acknowledgedTotvsKeys
      : [],
    unlinkedConfiguredKeys: Array.isArray(store.unlinkedConfiguredKeys)
      ? store.unlinkedConfiguredKeys
      : []
  };
  writeStore(next);
  return next;
}

function saveStore(store: GastosNaturezasConfigStore): void {
  writeStore(store);
}

export function getCustomAllowedNaturezaKeys(
  store: GastosNaturezasConfigStore = loadGastosNaturezasConfigStore()
): Set<string> {
  const keys = new Set<string>();
  for (const mapping of store.mappings) {
    const key = normalizeGastosOperacionaisNaturezaKey(mapping.totvsLabel);
    if (key) keys.add(key);
    const canonicalKey = normalizeGastosOperacionaisNaturezaKey(mapping.targetCanonicalLabel);
    if (canonicalKey && !mapping.asAlias) keys.add(canonicalKey);
  }
  return keys;
}

export function isCustomGastosOperacionaisAllowedNatureza(
  natureza: string,
  store: GastosNaturezasConfigStore = loadGastosNaturezasConfigStore()
): boolean {
  const key = normalizeGastosOperacionaisNaturezaKey(natureza);
  if (!key) return false;
  return getCustomAllowedNaturezaKeys(store).has(key);
}

export function getUnlinkedConfiguredNaturezaKeys(
  store: GastosNaturezasConfigStore = loadGastosNaturezasConfigStore()
): Set<string> {
  return new Set(store.unlinkedConfiguredKeys);
}

export function isUnlinkedConfiguredNatureza(
  natureza: string,
  store: GastosNaturezasConfigStore = loadGastosNaturezasConfigStore()
): boolean {
  const key = normalizeGastosOperacionaisNaturezaKey(natureza);
  if (!key) return false;
  if (store.unlinkedConfiguredKeys.includes(key)) return true;

  const entry = resolveGastosOperacionaisDfcEntry(natureza);
  if (!entry) return false;
  return store.unlinkedConfiguredKeys.includes(
    normalizeGastosOperacionaisNaturezaKey(entry.canonicalLabel)
  );
}

function getBlockById(blockId: string): GastosOperacionaisDfcLeafBlock | undefined {
  return GASTOS_OPERACIONAIS_DFC_LEAF_BLOCKS.find((block) => block.id === blockId);
}

export function findNaturezaCustomMapping(
  natureza: string,
  store: GastosNaturezasConfigStore = loadGastosNaturezasConfigStore()
): GastosNaturezaCustomMapping | null {
  const key = normalizeGastosOperacionaisNaturezaKey(natureza);
  if (!key) return null;
  return (
    store.mappings.find((mapping) => {
      const totvsKey = normalizeGastosOperacionaisNaturezaKey(mapping.totvsLabel);
      if (totvsKey === key) return true;
      if (!mapping.asAlias) {
        return normalizeGastosOperacionaisNaturezaKey(mapping.targetCanonicalLabel) === key;
      }
      return false;
    }) ?? null
  );
}

/**
 * Resolve bloco DFC também para mappings customizados (senão caem em "Outras naturezas").
 */
export function resolveGastosNaturezaModalEntry(natureza: string): {
  leafBlockId: string;
  canonicalLabel: string;
  pathLabels: readonly string[];
} | null {
  const builtIn = resolveGastosOperacionaisDfcEntry(natureza);
  if (builtIn) {
    return {
      leafBlockId: builtIn.leafBlockId,
      canonicalLabel: builtIn.canonicalLabel,
      pathLabels: builtIn.pathLabels
    };
  }

  const store = loadGastosNaturezasConfigStore();
  const mapping = findNaturezaCustomMapping(natureza, store);
  if (!mapping) return null;

  if (mapping.asAlias) {
    const target = resolveGastosOperacionaisDfcEntry(mapping.targetCanonicalLabel);
    if (target) {
      return {
        leafBlockId: target.leafBlockId,
        canonicalLabel: target.canonicalLabel,
        pathLabels: target.pathLabels
      };
    }
  }

  const block = getBlockById(mapping.blockId);
  if (!block) return null;

  return {
    leafBlockId: block.id,
    canonicalLabel: mapping.targetCanonicalLabel.trim() || mapping.totvsLabel.trim(),
    pathLabels: [...block.parentLabels, `${block.code} ${block.label}`]
  };
}

export function isCustomPositiveCreditNatureza(
  natureza: string,
  store: GastosNaturezasConfigStore = loadGastosNaturezasConfigStore()
): boolean {
  const mapping = findNaturezaCustomMapping(natureza, store);
  if (!mapping) return false;
  if (mapping.sumAsPositiveCredit) return true;
  if (mapping.asAlias) {
    return isGastosOperacionaisPositiveCreditNatureza(mapping.targetCanonicalLabel);
  }
  return false;
}

export function buildConfiguredNaturezaCatalog(
  store: GastosNaturezasConfigStore = loadGastosNaturezasConfigStore()
): GastosConfiguredNaturezaItem[] {
  const items: GastosConfiguredNaturezaItem[] = [];
  const unlinked = new Set(store.unlinkedConfiguredKeys);

  for (const block of GASTOS_OPERACIONAIS_DFC_LEAF_BLOCKS) {
    const blockPath = [...block.parentLabels, `${block.code} ${block.label}`].join(' › ');
    for (const entry of block.naturezas) {
      const key = normalizeGastosOperacionaisNaturezaKey(entry.label);
      if (unlinked.has(key)) continue;

      const aliases = [...(entry.aliases ?? [])];
      items.push({
        key,
        label: entry.label,
        aliases,
        blockId: block.id,
        blockCode: block.code,
        blockLabel: block.label,
        blockPath,
        sumAsPositiveCredit: Boolean(entry.sumAsPositiveCredit),
        builtIn: true
      });
    }
  }

  for (const mapping of store.mappings) {
    const block = getBlockById(mapping.blockId);
    if (!block) continue;

    const blockPath = [...block.parentLabels, `${block.code} ${block.label}`].join(' › ');
    const canonicalKey = normalizeGastosOperacionaisNaturezaKey(mapping.targetCanonicalLabel);
    if (unlinked.has(canonicalKey)) continue;

    if (mapping.asAlias) {
      const existing = items.find(
        (item) =>
          item.blockId === mapping.blockId &&
          normalizeGastosOperacionaisNaturezaKey(item.label) === canonicalKey
      );
      if (existing) {
        const aliasKey = normalizeGastosOperacionaisNaturezaKey(mapping.totvsLabel);
        if (aliasKey && !existing.aliases.some((a) => normalizeGastosOperacionaisNaturezaKey(a) === aliasKey)) {
          existing.aliases.push(mapping.totvsLabel.trim());
        }
        continue;
      }
    }

    const itemKey = normalizeGastosOperacionaisNaturezaKey(
      mapping.asAlias ? mapping.totvsLabel : mapping.targetCanonicalLabel
    );
    if (unlinked.has(itemKey)) continue;

    items.push({
      key: itemKey,
      label: mapping.asAlias ? mapping.totvsLabel.trim() : mapping.targetCanonicalLabel.trim(),
      aliases: mapping.asAlias
        ? []
        : normalizeGastosOperacionaisNaturezaKey(mapping.totvsLabel) ===
            normalizeGastosOperacionaisNaturezaKey(mapping.targetCanonicalLabel)
          ? []
          : [mapping.totvsLabel.trim()],
      blockId: mapping.blockId,
      blockCode: block.code,
      blockLabel: block.label,
      blockPath,
      sumAsPositiveCredit: Boolean(mapping.sumAsPositiveCredit),
      builtIn: false,
      customMappingId: mapping.id
    });
  }

  return items.sort((a, b) => {
    const byPath = a.blockPath.localeCompare(b.blockPath, 'pt-BR');
    if (byPath !== 0) return byPath;
    return a.label.localeCompare(b.label, 'pt-BR');
  });
}

export function collectNaturezaKeysInUse(
  totvsNaturezas: readonly { label: string }[],
  configuredCatalog: readonly GastosConfiguredNaturezaItem[] = buildConfiguredNaturezaCatalog()
): Set<string> {
  const configuredKeys = new Set<string>();
  for (const item of configuredCatalog) {
    configuredKeys.add(item.key);
    for (const alias of item.aliases) {
      configuredKeys.add(normalizeGastosOperacionaisNaturezaKey(alias));
    }
  }

  const inUse = new Set<string>();
  for (const row of totvsNaturezas) {
    const rawKey = normalizeGastosOperacionaisNaturezaKey(row.label);
    if (!rawKey || rawKey === '—' || rawKey === '-') continue;

    if (configuredKeys.has(rawKey)) {
      const entry = resolveGastosOperacionaisDfcEntry(row.label);
      const canonicalKey = entry
        ? normalizeGastosOperacionaisNaturezaKey(entry.canonicalLabel)
        : rawKey;
      inUse.add(canonicalKey || rawKey);
      continue;
    }

    for (const item of configuredCatalog) {
      if (item.aliases.some((alias) => normalizeGastosOperacionaisNaturezaKey(alias) === rawKey)) {
        inUse.add(item.key);
      }
    }
  }

  return inUse;
}

export function buildTotvsNaturezaItems(
  totvsNaturezas: readonly {
    label: string;
    total: number;
    totalAbs: number;
    isConfigured: boolean;
    byContract?: Array<{ contract: string; total: number }>;
  }[],
  store: GastosNaturezasConfigStore = loadGastosNaturezasConfigStore()
): GastosTotvsNaturezaItem[] {
  const dismissed = new Set(store.dismissedTotvsKeys);
  const acknowledged = new Set(store.acknowledgedTotvsKeys);
  const mappingByKey = new Map(
    store.mappings.map((mapping) => [
      normalizeGastosOperacionaisNaturezaKey(mapping.totvsLabel),
      mapping
    ])
  );

  return totvsNaturezas
    .map((row) => {
      const key = normalizeGastosOperacionaisNaturezaKey(row.label);
      const mapping = mappingByKey.get(key);
      const unlinked = isUnlinkedConfiguredNatureza(row.label, store);
      const isConfigured = !unlinked && (row.isConfigured || Boolean(mapping));
      const isDismissed = dismissed.has(key);
      const isAcknowledged = acknowledged.has(key);
      const isNew = !isConfigured && !isDismissed;

      return {
        key,
        label: row.label,
        total: row.total,
        totalAbs: row.totalAbs,
        byContract: Array.isArray(row.byContract) ? row.byContract : [],
        isConfigured,
        isDismissed,
        isAcknowledged,
        isNew,
        mappedBlockId: mapping?.blockId,
        mappedCanonicalLabel: mapping?.targetCanonicalLabel
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

export function countNewTotvsNaturezas(
  totvsNaturezas: readonly {
    label: string;
    total: number;
    totalAbs: number;
    isConfigured: boolean;
    byContract?: Array<{ contract: string; total: number }>;
  }[],
  store: GastosNaturezasConfigStore = loadGastosNaturezasConfigStore()
): number {
  return buildTotvsNaturezaItems(totvsNaturezas, store).filter(
    (item) => item.isNew && !item.isAcknowledged
  ).length;
}

export function mapTotvsNaturezaToBlock(input: {
  totvsLabel: string;
  blockId: string;
  targetCanonicalLabel: string;
  asAlias: boolean;
  sumAsPositiveCredit?: boolean;
}): GastosNaturezaCustomMapping {
  const totvsLabel = input.totvsLabel.trim();
  const targetCanonicalLabel = input.targetCanonicalLabel.trim();
  if (!totvsLabel) throw new Error('Informe a natureza do TOTVS.');
  if (!input.blockId) throw new Error('Selecione o bloco DFC.');
  if (!targetCanonicalLabel) throw new Error('Informe a natureza canônica.');

  const block = getBlockById(input.blockId);
  if (!block) throw new Error('Bloco DFC não encontrado.');

  const store = readStore();
  const key = normalizeGastosOperacionaisNaturezaKey(totvsLabel);
  const nextMappings = store.mappings.filter(
    (mapping) => normalizeGastosOperacionaisNaturezaKey(mapping.totvsLabel) !== key
  );

  const mapping: GastosNaturezaCustomMapping = {
    id: `map_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    totvsLabel,
    blockId: input.blockId,
    targetCanonicalLabel,
    asAlias: input.asAlias,
    sumAsPositiveCredit: input.sumAsPositiveCredit,
    createdAt: new Date().toISOString()
  };

  saveStore({
    ...store,
    mappings: [...nextMappings, mapping],
    dismissedTotvsKeys: store.dismissedTotvsKeys.filter((k) => k !== key),
    acknowledgedTotvsKeys: [...new Set([...store.acknowledgedTotvsKeys, key])],
    unlinkedConfiguredKeys: store.unlinkedConfiguredKeys.filter(
      (k) =>
        k !== key &&
        k !== normalizeGastosOperacionaisNaturezaKey(targetCanonicalLabel)
    )
  });

  return mapping;
}

/**
 * Remove a natureza do catálogo Configuradas.
 * Built-in: marca como desvinculada. Custom: remove o mapping.
 */
export function unlinkConfiguredNatureza(item: {
  key: string;
  label: string;
  aliases?: readonly string[];
  customMappingId?: string;
  builtIn: boolean;
}): void {
  const store = readStore();
  const keysToUnlink = new Set<string>([
    normalizeGastosOperacionaisNaturezaKey(item.key),
    normalizeGastosOperacionaisNaturezaKey(item.label),
    ...(item.aliases ?? []).map((alias) => normalizeGastosOperacionaisNaturezaKey(alias))
  ]);
  keysToUnlink.delete('');

  if (item.customMappingId) {
    saveStore({
      ...store,
      mappings: store.mappings.filter((mapping) => mapping.id !== item.customMappingId),
      unlinkedConfiguredKeys: [
        ...new Set([...store.unlinkedConfiguredKeys, ...Array.from(keysToUnlink)])
      ]
    });
    return;
  }

  if (!item.builtIn) {
    throw new Error('Natureza inválida para desvincular.');
  }

  saveStore({
    ...store,
    unlinkedConfiguredKeys: [
      ...new Set([...store.unlinkedConfiguredKeys, ...Array.from(keysToUnlink)])
    ]
  });
}

export function dismissTotvsNatureza(label: string): void {
  const key = normalizeGastosOperacionaisNaturezaKey(label);
  if (!key) throw new Error('Natureza inválida.');

  const store = readStore();
  saveStore({
    ...store,
    dismissedTotvsKeys: [...new Set([...store.dismissedTotvsKeys, key])],
    acknowledgedTotvsKeys: [...new Set([...store.acknowledgedTotvsKeys, key])],
    mappings: store.mappings.filter(
      (mapping) => normalizeGastosOperacionaisNaturezaKey(mapping.totvsLabel) !== key
    )
  });
}

export function acknowledgeTotvsNatureza(label: string): void {
  const key = normalizeGastosOperacionaisNaturezaKey(label);
  if (!key) return;

  const store = readStore();
  saveStore({
    ...store,
    acknowledgedTotvsKeys: [...new Set([...store.acknowledgedTotvsKeys, key])]
  });
}

export function acknowledgeAllNewTotvsNaturezas(
  totvsNaturezas: readonly {
    label: string;
    total: number;
    totalAbs: number;
    isConfigured: boolean;
    byContract?: Array<{ contract: string; total: number }>;
  }[]
): void {
  const store = readStore();
  const items = buildTotvsNaturezaItems(totvsNaturezas, store);
  const keys = items.filter((item) => item.isNew).map((item) => item.key);
  saveStore({
    ...store,
    acknowledgedTotvsKeys: [...new Set([...store.acknowledgedTotvsKeys, ...keys])]
  });
}

export function removeCustomNaturezaMapping(mappingId: string): void {
  const store = readStore();
  saveStore({
    ...store,
    mappings: store.mappings.filter((mapping) => mapping.id !== mappingId)
  });
}

export function getDfcBlockSelectOptions(): Array<{ value: string; label: string }> {
  return GASTOS_OPERACIONAIS_DFC_LEAF_BLOCKS.map((block) => ({
    value: block.id,
    label: `${block.code} ${block.label}`
  }));
}

export function getCanonicalOptionsForBlock(
  blockId: string,
  store: GastosNaturezasConfigStore = loadGastosNaturezasConfigStore()
): Array<{ value: string; label: string }> {
  const block = getBlockById(blockId);
  if (!block) return [];

  const builtIn = block.naturezas.map((entry) => ({
    value: entry.label,
    label: entry.label
  }));

  const custom = store.mappings
    .filter((mapping) => mapping.blockId === blockId && !mapping.asAlias)
    .map((mapping) => ({
      value: mapping.targetCanonicalLabel,
      label: `${mapping.targetCanonicalLabel} (customizada)`
    }));

  return [...builtIn, ...custom];
}
