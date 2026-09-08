import {
  normalizeContractOrderKey,
  normalizeGastosOperacionaisContractName
} from './gastosOperacionaisContractOrder';

export type ContractDetailLookupSource = {
  id: string;
  name: string;
  costCenter?: { code?: string; name?: string } | null;
};

function gastosContractKey(contract: string): string {
  return normalizeContractOrderKey(normalizeGastosOperacionaisContractName(contract));
}

export function buildGastosContractDetailLookup(
  contracts: readonly ContractDetailLookupSource[]
): Map<string, string> {
  const map = new Map<string, string>();

  const register = (label: string | undefined | null, contractId: string) => {
    if (!label?.trim()) return;
    const key = normalizeContractOrderKey(label.trim());
    if (!key || map.has(key)) return;
    map.set(key, contractId);
  };

  for (const contract of contracts) {
    register(contract.name, contract.id);
    // Também registra o nome canônico (com alias) para manter o link quando o
    // cadastro usa uma variação do nome unificada no painel (ex.: SENAC → SENAC - DF).
    register(normalizeGastosOperacionaisContractName(contract.name), contract.id);
    register(contract.costCenter?.name, contract.id);
    register(contract.costCenter?.code, contract.id);
  }

  return map;
}

export function resolveGastosContractDetailPath(
  gastosContract: string,
  lookup: Map<string, string>,
  contracts: readonly ContractDetailLookupSource[]
): string | null {
  const key = gastosContractKey(gastosContract);
  const direct = lookup.get(key);
  if (direct) return `/ponto/contratos/${direct}`;

  if (key.length < 6) return null;

  for (const contract of contracts) {
    const labels = [contract.name, contract.costCenter?.name, contract.costCenter?.code].filter(
      Boolean
    ) as string[];

    for (const label of labels) {
      const labelKey = normalizeContractOrderKey(label);
      if (labelKey.length < 6) continue;
      if (labelKey.includes(key) || key.includes(labelKey)) {
        return `/ponto/contratos/${contract.id}`;
      }
    }
  }

  return null;
}
