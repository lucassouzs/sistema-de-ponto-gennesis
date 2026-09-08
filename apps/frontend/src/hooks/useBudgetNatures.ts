import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { BudgetNatureMatchTarget } from '@/lib/budgetNatureMatch';

export function useBudgetNatures() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['budget-natures', 'extrato-lookup'],
    queryFn: async () => {
      const res = await api.get('/budget-natures', {
        params: { isActive: 'true', limit: 5000 },
      });
      const items = res.data?.data;
      return Array.isArray(items) ? (items as BudgetNatureMatchTarget[]) : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    budgetNatures: data ?? [],
    isLoading,
    error,
  };
}
