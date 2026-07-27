import api from '@/lib/api';
import { resolveGastosPoloFromContractName } from '@/lib/extratoCaixaPolo';
import type { QueryGastosDetailRow, QueryGastosNaturezaDetailRow } from './buildQueryGastosRows';
import { resolveCanonicalGastosContractName } from './gastosOperacionaisContractOrder';

export type GastosOperacionaisTotvsApi = {
  success: boolean;
  message?: string;
  data: {
    configured: boolean;
    detailRows?: QueryGastosDetailRow[];
    naturezaDetailRows?: QueryGastosNaturezaDetailRow[];
    fetchedAt?: string;
    message?: string;
  };
};

export type GastosOperacionaisTotvsQueryData = {
  detailRows: QueryGastosDetailRow[];
  naturezaDetailRows: QueryGastosNaturezaDetailRow[];
  fetchedAt: string;
};

/** Query key compartilhada entre Controle Geral e o módulo Gastos Operacionais. */
export const GASTOS_OPERACIONAIS_TOTVS_QUERY_KEY = [
  'gastos-operacionais-module-totvs-v38-jfgo-de-goias-alias'
] as const;

/**
 * Carrega gastos TOTVS no mesmo formato para os dois módulos.
 * Importante: manter um único shape no cache do React Query.
 */
export async function fetchGastosOperacionaisTotvs(): Promise<GastosOperacionaisTotvsQueryData> {
  const res = await api.get<GastosOperacionaisTotvsApi>('/contracts/gastos-operacionais', {
    timeout: 180_000
  });
  const payload = res.data;

  if (payload?.data?.configured === false) {
    throw new Error(
      payload.data.message ??
        'Integração TOTVS RM não configurada. Defina TOTVS_RM_* no servidor.'
    );
  }

  if (payload?.success === false) {
    throw new Error(payload.message ?? 'Não foi possível carregar os gastos no TOTVS RM.');
  }

  const detailRows = (payload.data?.detailRows ?? []).map((row) => {
    const contract = resolveCanonicalGastosContractName(row.contract);
    const polo = resolveGastosPoloFromContractName(contract, row.polo);
    return { ...row, contract, polo };
  });

  const naturezaDetailRows = (payload.data?.naturezaDetailRows ?? []).map((row) => ({
    ...row,
    contract: resolveCanonicalGastosContractName(row.contract)
  }));

  return {
    detailRows,
    naturezaDetailRows,
    fetchedAt: payload.data?.fetchedAt ?? new Date().toISOString()
  };
}
