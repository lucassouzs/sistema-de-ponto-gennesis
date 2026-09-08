import {
  normalizeContractOrderKey,
  normalizeGastosOperacionaisContractName
} from './gastosOperacionaisContractOrder';

const STORAGE_KEY = 'controle-geral-excluded-contracts';
const LEGACY_STORAGE_KEY = 'gastos-operacionais-excluded-contracts';

/** Chave canônica (com aliases) para ocultar/restaurar um único contrato. */
function toExcludedKey(contract: string): string {
  return normalizeContractOrderKey(normalizeGastosOperacionaisContractName(contract));
}

function migrateExcludedAliasKeys(keys: Iterable<string>): Set<string> {
  const next = new Set<string>();
  for (const key of keys) {
    next.add(toExcludedKey(key));
  }
  return next;
}

function migrateLegacyExcludedContracts(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) return new Set();

    const parsed = JSON.parse(legacyRaw) as unknown;
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);

    if (!Array.isArray(parsed)) return new Set();

    const migrated = migrateExcludedAliasKeys(
      parsed
        .filter((item): item is string => typeof item === 'string' && item.length > 0)
        .map((item) => toExcludedKey(item))
    );
    saveControleGeralExcludedContracts(migrated);
    return migrated;
  } catch {
    return new Set();
  }
}

export function loadControleGeralExcludedContracts(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return migrateLegacyExcludedContracts();

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();

    const loaded = migrateExcludedAliasKeys(
      parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
    );
    // Persiste unificação de aliases (ex.: JUSTIÇA FEDERAL DE GOIÁS → JUSTIÇA FEDERAL GOIAS).
    if (
      loaded.size !== parsed.length ||
      parsed.some(
        (item) => typeof item === 'string' && item.length > 0 && toExcludedKey(item) !== item
      )
    ) {
      saveControleGeralExcludedContracts(loaded);
    }
    return loaded;
  } catch {
    return new Set();
  }
}

export function saveControleGeralExcludedContracts(excluded: Set<string>): void {
  if (typeof window === 'undefined') return;

  try {
    if (!excluded.size) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(excluded)));
  } catch {
    // ignore quota / private mode errors
  }
}

export function isContractExcludedFromControleGeralView(
  contract: string,
  excluded: Set<string>
): boolean {
  return excluded.has(toExcludedKey(contract));
}

export function addControleGeralExcludedContracts(
  contracts: readonly string[],
  excluded: Set<string>
): Set<string> {
  const next = new Set(excluded);
  let changed = false;

  for (const contract of contracts) {
    const key = toExcludedKey(contract);
    if (!next.has(key)) {
      next.add(key);
      changed = true;
    }
  }

  if (!changed) return excluded;
  saveControleGeralExcludedContracts(next);
  return next;
}

export function removeControleGeralExcludedContract(
  contract: string,
  excluded: Set<string>
): Set<string> {
  const targetKey = toExcludedKey(contract);
  const next = new Set(excluded);
  let changed = false;

  for (const key of Array.from(excluded)) {
    if (key === targetKey || toExcludedKey(key) === targetKey) {
      next.delete(key);
      changed = true;
    }
  }

  if (!changed) return excluded;
  saveControleGeralExcludedContracts(next);
  return next;
}

export function clearControleGeralExcludedContracts(): Set<string> {
  saveControleGeralExcludedContracts(new Set());
  return new Set();
}
