import {
  getGastosContractAggregateKey,
  normalizeContractOrderKey,
  normalizeGastosOperacionaisContractName
} from './gastosOperacionaisContractOrder';

export type FaturamentoByGastosContractEntry = {
  contract: string;
  faturamento: number;
  liquido: number;
  recebido: number;
  /** null = aba/contrato sem coluna Conta Vinculada. */
  contaVinculada: number | null;
};

export type NfsContractTotals = {
  faturamento: number;
  liquido: number;
  recebido: number;
  contaVinculada: number | null;
};

const EMPTY_NFS_TOTALS: NfsContractTotals = {
  faturamento: 0,
  liquido: 0,
  recebido: 0,
  contaVinculada: null
};

function lookupKeysForContract(contract: string): string[] {
  const raw = contract.trim();
  if (!raw) return [];
  const normalized = normalizeGastosOperacionaisContractName(raw);
  const keys = [
    getGastosContractAggregateKey(raw),
    normalizeContractOrderKey(normalized),
    normalizeContractOrderKey(raw)
  ];
  return Array.from(new Set(keys.filter(Boolean)));
}

export function buildFaturamentoByContractLookup(
  entries: readonly FaturamentoByGastosContractEntry[]
): Map<string, NfsContractTotals> {
  const map = new Map<string, NfsContractTotals>();

  for (const entry of entries) {
    const totals: NfsContractTotals = {
      faturamento: entry.faturamento,
      liquido: entry.liquido,
      recebido: entry.recebido,
      contaVinculada: entry.contaVinculada ?? null
    };
    for (const key of lookupKeysForContract(entry.contract)) {
      map.set(key, totals);
    }
  }

  return map;
}

export function resolveContractFaturamento(
  contract: string,
  lookup: Map<string, NfsContractTotals>
): number {
  return resolveContractNfsTotals(contract, lookup).faturamento;
}

export function resolveContractLiquido(contract: string, lookup: Map<string, NfsContractTotals>): number {
  return resolveContractNfsTotals(contract, lookup).liquido;
}

export function resolveContractRecebido(contract: string, lookup: Map<string, NfsContractTotals>): number {
  return resolveContractNfsTotals(contract, lookup).recebido;
}

export function resolveContractContaVinculada(
  contract: string,
  lookup: Map<string, NfsContractTotals>
): number | null {
  return resolveContractNfsTotals(contract, lookup).contaVinculada;
}

export function resolveContractNfsTotals(
  contract: string,
  lookup: Map<string, NfsContractTotals>
): NfsContractTotals {
  for (const key of lookupKeysForContract(contract)) {
    const hit = lookup.get(key);
    if (hit) return hit;
  }
  return EMPTY_NFS_TOTALS;
}
