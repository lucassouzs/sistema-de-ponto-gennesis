import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export type ServiceOrderOption = {
  id: string;
  numero: number;
  ano: number;
  status: string;
  label: string;
  costCenterId?: string;
  divSe: string | null;
  folderNumber: string | null;
  /** Descrição do serviço no cadastro da OS (pleito). */
  serviceDescription?: string | null;
  contractName: string | null;
  contractNumber: string | null;
};

function serviceOrderDedupeKey(item: ServiceOrderOption): string {
  const divSe = (item.divSe || '').trim().toLowerCase();
  const folder = (item.folderNumber || '').trim().toLowerCase();
  const contract = (item.contractNumber || '').trim().toLowerCase();
  if (divSe) return `divSe:${divSe}\0${folder}\0${contract}`;
  const label = (item.label || '').trim().toLowerCase();
  if (label) return `label:${label}\0${contract}`;
  return `num:${item.numero}\0${item.ano}\0${contract}`;
}

export function dedupeServiceOrderOptions(items: ServiceOrderOption[]): ServiceOrderOption[] {
  const byId = new Map<string, ServiceOrderOption>();
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const byKey = new Map<string, ServiceOrderOption>();
  for (const item of Array.from(byId.values())) {
    const key = serviceOrderDedupeKey(item);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, item);
      continue;
    }
    if (item.ano > prev.ano || (item.ano === prev.ano && item.numero > prev.numero)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

function normalizeServiceOrdersResponse(payload: unknown): ServiceOrderOption[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  const data = Array.isArray(root.data) ? root.data : Array.isArray(root) ? root : [];
  return dedupeServiceOrderOptions(data as ServiceOrderOption[]);
}

export function serviceOrderOptionFullLabel(os: ServiceOrderOption): string {
  return os.label;
}

export function filterServiceOrdersByQuery(
  orders: ServiceOrderOption[],
  query: string
): ServiceOrderOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return orders;
  return orders.filter((os) => {
    const label = os.label.toLowerCase();
    return (
      label.includes(q) ||
      (os.divSe || '').toLowerCase().includes(q) ||
      (os.folderNumber || '').toLowerCase().includes(q) ||
      (os.contractNumber || '').toLowerCase().includes(q) ||
      (os.contractName || '').toLowerCase().includes(q) ||
      `${os.numero}/${os.ano}`.includes(q) ||
      String(os.numero).includes(q)
    );
  });
}

export function useServiceOrdersByCostCenter(costCenterId: string) {
  const trimmed = costCenterId.trim();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['service-orders', 'cost-center', trimmed],
    queryFn: async () => {
      const res = await api.get('/service-orders', {
        params: { costCenterId: trimmed },
      });
      return normalizeServiceOrdersResponse(res.data);
    },
    enabled: !!trimmed,
    staleTime: 60_000,
  });

  return {
    serviceOrders: data ?? [],
    isLoading: isLoading || isFetching,
    error,
  };
}

export function useServiceOrdersByContract(contractId: string) {
  const trimmed = contractId.trim();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['service-orders', 'contract', trimmed],
    queryFn: async () => {
      const res = await api.get('/service-orders', {
        params: { contractId: trimmed },
      });
      return normalizeServiceOrdersResponse(res.data);
    },
    enabled: !!trimmed,
    staleTime: 60_000,
  });

  return {
    serviceOrders: data ?? [],
    isLoading: isLoading || isFetching,
    error,
  };
}
