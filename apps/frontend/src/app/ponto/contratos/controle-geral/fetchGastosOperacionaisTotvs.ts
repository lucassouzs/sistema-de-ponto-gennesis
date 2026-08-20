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
    totvsNaturezaCatalog?: Array<{
      label: string;
      total?: number;
      totalAbs: number;
      isConfigured: boolean;
      byContract?: Array<{ contract: string; total: number }>;
    }>;
    fetchedAt?: string;
    message?: string;
  };
};

export type GastosOperacionaisTotvsQueryData = {
  detailRows: QueryGastosDetailRow[];
  naturezaDetailRows: QueryGastosNaturezaDetailRow[];
  totvsNaturezaCatalog: Array<{
    label: string;
    total: number;
    totalAbs: number;
    isConfigured: boolean;
    byContract: Array<{ contract: string; total: number }>;
  }>;
  fetchedAt: string;
};

/** Query key compartilhada entre Controle Geral e o módulo Gastos Operacionais. */
export const GASTOS_OPERACIONAIS_TOTVS_QUERY_KEY = [
  'gastos-operacionais-module-totvs-v41-natureza-by-contract'
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

  const totvsNaturezaCatalog = (payload.data?.totvsNaturezaCatalog ?? []).map((row) => ({
    label: row.label,
    total: typeof row.total === 'number' ? row.total : 0,
    totalAbs: typeof row.totalAbs === 'number' ? row.totalAbs : Math.abs(row.total ?? 0),
    isConfigured: Boolean(row.isConfigured),
    byContract: Array.isArray(row.byContract)
      ? row.byContract
          .filter(
            (entry): entry is { contract: string; total: number } =>
              !!entry &&
              typeof entry.contract === 'string' &&
              typeof entry.total === 'number' &&
              entry.total !== 0
          )
          .map((entry) => ({
            contract: resolveCanonicalGastosContractName(entry.contract),
            total: entry.total
          }))
      : []
  }));

  return {
    detailRows,
    naturezaDetailRows,
    totvsNaturezaCatalog,
    fetchedAt: payload.data?.fetchedAt ?? new Date().toISOString()
  };
}
