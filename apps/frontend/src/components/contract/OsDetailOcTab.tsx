'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Loading } from '@/components/ui/Loading';
import type { PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';
import { RmDetailOcTab } from '@/app/ponto/gerenciar-materiais/_components/RmDetailOcTab';

export function OsDetailOcTab({
  serviceOrderId,
  serviceOrderText,
  enabled = true,
}: {
  serviceOrderId?: string | null;
  serviceOrderText?: string | null;
  enabled?: boolean;
}) {
  const trimmedText = serviceOrderText?.trim() || '';
  const canFetch = Boolean(serviceOrderId || trimmedText);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['os-detail-purchase-orders', serviceOrderId, trimmedText],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', {
        params: {
          serviceOrderId: serviceOrderId || undefined,
          serviceOrderText: trimmedText || undefined,
          limit: 100,
        },
      });
      return (res.data?.data ?? []) as PurchaseOrder[];
    },
    enabled: enabled && canFetch,
  });

  if (!canFetch) {
    return (
      <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
        Esta ordem de serviço não possui vínculo para buscar OCs.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loading />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-10 text-center text-sm text-red-500 dark:text-red-400">
        Não foi possível carregar as ordens de compra.
      </p>
    );
  }

  return (
    <RmDetailOcTab
      orders={data ?? []}
      enabled={enabled}
      emptyMessage="Nenhuma ordem de compra vinculada a esta OS."
    />
  );
}
