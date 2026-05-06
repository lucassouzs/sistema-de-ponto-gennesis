import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { normalizeCostCentersResponse } from '@/lib/costCenters';

interface CostCenter {
  id?: string;
  code: string;
  name?: string;
  description?: string;
  polo?: string;
  isActive?: boolean;
}

/**
 * Hook para buscar centros de custo da API
 * Retorna os centros de custo com apenas o NOME (sem código)
 * Normaliza a resposta para sempre retornar arrays (filtros, listas, etc.)
 */
export function useCostCenters() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: async () => {
      const res = await api.get('/cost-centers', {
        params: { isActive: 'true', limit: 2000 }
      });
      return normalizeCostCentersResponse(res.data);
    },
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });

  const costCenters = normalizeCostCentersResponse(data) as unknown as CostCenter[];

  const formattedCostCenters = costCenters.map(cc => ({
    ...cc,
    label: cc.name || String(cc.code || ''),
    value: cc.name || String(cc.code || '')
  }));

  return {
    costCenters: formattedCostCenters,
    isLoading,
    error,
    costCentersList: formattedCostCenters.map(cc => cc.label || cc.name || '')
  };
}

