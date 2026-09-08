import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface EspelhoNfBootstrapPayload {
  providers: unknown[];
  takers: unknown[];
  bankAccounts: unknown[];
  taxCodes: unknown[];
  mirrors: unknown[];
}

export function useEspelhoNfBootstrap() {
  return useQuery({
    queryKey: ['espelho-nf-bootstrap'],
    queryFn: async () => {
      const res = await api.get('/espelho-nf/bootstrap');
      const d = res?.data?.data;
      if (!d || typeof d !== 'object') {
        return {
          providers: [],
          takers: [],
          bankAccounts: [],
          taxCodes: [],
          mirrors: []
        } as EspelhoNfBootstrapPayload;
      }
      return {
        providers: Array.isArray(d.providers) ? d.providers : [],
        takers: Array.isArray(d.takers) ? d.takers : [],
        bankAccounts: Array.isArray(d.bankAccounts) ? d.bankAccounts : [],
        taxCodes: Array.isArray(d.taxCodes) ? d.taxCodes : [],
        mirrors: Array.isArray(d.mirrors) ? d.mirrors : []
      } as EspelhoNfBootstrapPayload;
    }
  });
}
