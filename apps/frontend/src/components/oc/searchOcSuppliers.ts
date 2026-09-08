import api from '@/lib/api';
import type { OcSupplierOption } from '@/components/oc/OcPurchaseOrderFormFields';

export async function searchOcSuppliers(query: string): Promise<OcSupplierOption[]> {
  const res = await api.get('/suppliers', {
    params: {
      search: query.trim() || undefined,
      isActive: true,
      limit: 50,
      page: 1,
    },
  });
  return res.data?.data || [];
}
