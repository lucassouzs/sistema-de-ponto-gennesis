import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import api from '@/lib/api';
import { normalizeCostCentersResponse } from '@/lib/costCenters';
import { usePermissions } from '@/hooks/usePermissions';

interface CostCenter {
  id?: string;
  code: string;
  name?: string;
  description?: string;
  polo?: string;
  isActive?: boolean;
}

/**
 * Hook para buscar centros de custo da API.
 * Usuários UNB recebem só CCs UNB (filtrados no backend).
 */
export function useCostCenters() {
  const { isUnbUser, isLoading: permissionsLoading } = usePermissions();
  const { data, isLoading, error } = useQuery({
    queryKey: ['cost-centers', isUnbUser ? 'unb' : 'all'],
    queryFn: async () => {
      const res = await api.get('/cost-centers', {
        params: { isActive: 'true', limit: 2000 },
      });
      return normalizeCostCentersResponse(res.data);
    },
    enabled: !permissionsLoading,
    staleTime: 5 * 60 * 1000,
  });

  const costCenters = useMemo(() => {
    const list = normalizeCostCentersResponse(data) as unknown as CostCenter[];
    const formattedCostCenters = list.map((cc) => ({
      ...cc,
      label: cc.name || String(cc.code || ''),
      value: cc.name || String(cc.code || ''),
    }));

    const seenLabels = new Set<string>();
    return formattedCostCenters.filter((cc) => {
      const label = cc.label || cc.name || String(cc.code || '');
      if (seenLabels.has(label)) return false;
      seenLabels.add(label);
      return true;
    });
  }, [data]);

  return {
    costCenters,
    isLoading: permissionsLoading || isLoading,
    error,
    costCentersList: costCenters.map((cc) => cc.label || cc.name || ''),
  };
}
