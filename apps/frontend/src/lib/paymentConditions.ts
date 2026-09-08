import api from '@/lib/api';
import type { PaymentConditionRow } from '@/components/oc/PaymentConditionSelect';

export async function fetchPaymentConditions(params?: {
  paymentType?: string;
  activeOnly?: string;
}): Promise<PaymentConditionRow[]> {
  const res = await api.get('/payment-conditions', { params });
  return (res.data?.data || []) as PaymentConditionRow[];
}

export async function deletePaymentCondition(id: string): Promise<void> {
  await api.delete(`/payment-conditions/${id}`);
}
