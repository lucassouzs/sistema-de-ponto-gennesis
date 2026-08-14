import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const COMPANY_KEY = 'gestao-os-company-id';

async function getCompanyId(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return localStorage.getItem(COMPANY_KEY);
    return AsyncStorage.getItem(COMPANY_KEY);
  } catch {
    return null;
  }
}

export async function setGestaoOsCompanyId(id: string | null) {
  try {
    if (Platform.OS === 'web') {
      if (id) localStorage.setItem(COMPANY_KEY, id);
      else localStorage.removeItem(COMPANY_KEY);
      return;
    }
    if (id) await AsyncStorage.setItem(COMPANY_KEY, id);
    else await AsyncStorage.removeItem(COMPANY_KEY);
  } catch {
    /* ignore */
  }
}

async function withCompany(params?: Record<string, string>) {
  const companyId = await getCompanyId();
  const search = new URLSearchParams(params || {});
  if (companyId) search.set('companyId', companyId);
  const qs = search.toString();
  return {
    qs: qs ? `?${qs}` : '',
    headers: companyId ? { 'x-gestao-os-company-id': companyId } : ({} as Record<string, string>)
  };
}

async function parseJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || 'Erro na API de Gestão de OS');
  }
  return json?.data ?? json;
}

export type GestaoOsWorkOrderMobile = {
  id: string;
  displayNumber: number;
  osNumber: number | null;
  status: string;
  priority: string;
  category: string;
  description: string;
  locationLabel: string | null;
  dueAt: string | null;
  assigneeId: string | null;
  completionNote: string | null;
  checklistResponses: Array<{ id: string; label: string; checked: boolean }> | null;
  signatureTechnicianUrl: string | null;
};

export async function fetchGestaoOsMe() {
  const { qs, headers } = await withCompany();
  const res = await api.get(`/api/gestao-os/me${qs}`, { headers });
  return parseJson(res);
}

export async function fetchAssignedWorkOrders() {
  const { qs, headers } = await withCompany({ assignedToMe: 'true', limit: '100' });
  const res = await api.get(`/api/gestao-os${qs}`, { headers });
  return parseJson(res) as Promise<GestaoOsWorkOrderMobile[]>;
}

export async function fetchWorkOrder(id: string) {
  const { qs, headers } = await withCompany();
  const res = await api.get(`/api/gestao-os/${id}${qs}`, { headers });
  return parseJson(res) as Promise<GestaoOsWorkOrderMobile>;
}

export async function transitionWorkOrder(
  id: string,
  body: Record<string, unknown>
) {
  const companyId = await getCompanyId();
  const res = await api.post(`/api/gestao-os/${id}/transition`, {
    ...body,
    companyId: companyId || undefined
  });
  return parseJson(res);
}

export async function resolveAssetQr(token: string) {
  const { qs, headers } = await withCompany();
  const sep = qs ? '&' : '?';
  const res = await api.get(`/api/gestao-os/cadastros/qr/resolve${qs}${sep}token=${encodeURIComponent(token)}`, {
    headers
  });
  return parseJson(res);
}

export async function createWorkOrderFromQr(input: {
  category: string;
  description: string;
  buildingId?: string;
  sectorId?: string;
  placeId?: string;
  assetId?: string;
}) {
  const companyId = await getCompanyId();
  const res = await api.post('/api/gestao-os', { ...input, companyId: companyId || undefined });
  return parseJson(res);
}
