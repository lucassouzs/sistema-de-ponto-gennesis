import { normalizeContractOrderKey } from './gastosOperacionaisContractOrder';

const STORAGE_KEY = 'controle-geral-known-spreadsheet-contracts';

export function loadKnownSpreadsheetContracts(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();

    return new Set(
      parsed
        .filter((item): item is string => typeof item === 'string' && item.length > 0)
        .map((item) => normalizeContractOrderKey(item))
    );
  } catch {
    return new Set();
  }
}

export function saveKnownSpreadsheetContracts(known: Set<string>): void {
  if (typeof window === 'undefined') return;

  try {
    if (!known.size) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(known)));
  } catch {
    // ignore quota / private mode errors
  }
}

/** Contratos que apareceram pela primeira vez na QUERY BASE DE GASTOS. */
export function findNewSpreadsheetContracts(
  contracts: readonly string[],
  known: Set<string>
): string[] {
  const seen = new Set<string>();
  const newcomers: string[] = [];

  for (const contract of contracts) {
    const trimmed = contract?.trim();
    if (!trimmed) continue;

    const key = normalizeContractOrderKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);

    if (!known.has(key)) {
      newcomers.push(trimmed);
    }
  }

  return newcomers;
}

export function markSpreadsheetContractsAsKnown(
  contracts: readonly string[],
  known: Set<string>
): Set<string> {
  const next = new Set(known);
  let changed = false;

  for (const contract of contracts) {
    const key = normalizeContractOrderKey(contract.trim());
    if (!key || next.has(key)) continue;
    next.add(key);
    changed = true;
  }

  return changed ? next : known;
}
