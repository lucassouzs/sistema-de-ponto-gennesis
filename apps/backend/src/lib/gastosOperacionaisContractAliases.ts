import { normalizeCostCenterKey } from './controleGeralGastosMapping';

/** Variações da planilha → nome canônico (espelha o frontend). */
const GASTOS_OPERACIONAIS_CONTRACT_ALIASES: Readonly<Record<string, string>> = {
  [normalizeCostCenterKey('TJGO MANUTENÇÃO LOTE 02')]: 'TJ MANUTENÇÃO RIO VERDE - CORRETIVA',
  [normalizeCostCenterKey('JUSTIÇA FEDERAL DE GOIÁS')]: 'JUSTIÇA FEDERAL GOIAS'
};

export function normalizeGastosOperacionaisContractName(contract: string): string {
  const trimmed = contract.trim();
  if (!trimmed) return trimmed;
  return GASTOS_OPERACIONAIS_CONTRACT_ALIASES[normalizeCostCenterKey(trimmed)] ?? trimmed;
}

export function gastosContractLookupKey(contract: string): string {
  return normalizeCostCenterKey(normalizeGastosOperacionaisContractName(contract));
}
