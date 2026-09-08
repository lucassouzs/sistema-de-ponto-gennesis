import api from '@/lib/api';
import {
  loadGastosNaturezasConfigStore,
  replaceGastosNaturezasConfigStore,
  type GastosNaturezasConfigStore
} from './gastosOperacionaisNaturezasStore';

type NaturezasConfigApiResponse = {
  success: boolean;
  data?: GastosNaturezasConfigStore;
  message?: string;
};

export async function fetchGastosNaturezasConfigFromServer(): Promise<GastosNaturezasConfigStore> {
  const local = loadGastosNaturezasConfigStore();
  const res = await api.get<NaturezasConfigApiResponse>(
    '/contracts/gastos-operacionais/naturezas-config'
  );
  const data = res.data?.data;
  if (!data || typeof data !== 'object') {
    return local;
  }

  const serverEmpty =
    data.mappings.length === 0 &&
    data.unlinkedConfiguredKeys.length === 0 &&
    data.dismissedTotvsKeys.length === 0 &&
    data.acknowledgedTotvsKeys.length === 0;

  const localHasData =
    local.mappings.length > 0 ||
    local.unlinkedConfiguredKeys.length > 0 ||
    local.dismissedTotvsKeys.length > 0 ||
    local.acknowledgedTotvsKeys.length > 0;

  if (serverEmpty && localHasData) {
    return pushGastosNaturezasConfigToServer(local);
  }

  return replaceGastosNaturezasConfigStore(data);
}

export async function pushGastosNaturezasConfigToServer(
  store: GastosNaturezasConfigStore = loadGastosNaturezasConfigStore()
): Promise<GastosNaturezasConfigStore> {
  const res = await api.put<NaturezasConfigApiResponse>(
    '/contracts/gastos-operacionais/naturezas-config',
    store
  );
  const data = res.data?.data;
  if (!data || typeof data !== 'object') {
    return store;
  }
  return replaceGastosNaturezasConfigStore(data);
}
