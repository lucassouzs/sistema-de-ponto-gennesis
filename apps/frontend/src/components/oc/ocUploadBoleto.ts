import api from '@/lib/api';

export async function uploadOcBoletoFile(
  file: File
): Promise<{ url: string; originalName: string }> {
  const fd = new FormData();
  fd.append('boleto', file);
  const up = await api.post('/purchase-orders/upload-boleto', fd);
  const url = up.data?.data?.url as string | undefined;
  const originalName = up.data?.data?.originalName as string | undefined;
  if (!url) throw new Error('Resposta inválida do upload');
  return { url, originalName: originalName || file.name };
}

export function isOcBoletoPaymentType(paymentType: string | null | undefined): boolean {
  return paymentType === 'BOLETO';
}
