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
  checklistResponses: Array<{
    id: string;
    label: string;
    checked: boolean;
    startedAt?: string | null;
    completedAt?: string | null;
    beforePhotoUrl?: string | null;
    afterPhotoUrl?: string | null;
  }> | null;
  buildingCloseQrRequired?: boolean;
  origin?: string | null;
  safetyChecklistResponses: Array<{
    id: string;
    label: string;
    checked: boolean;
    required?: boolean;
  }> | null;
  safetyPhotoUrl: string | null;
  signatureTechnicianUrl: string | null;
  startPhotoUrl: string | null;
  endPhotoUrl: string | null;
  parts: Array<{
    id: string;
    name: string;
    supplier: string | null;
    quantity: number;
    unitCost: number | null;
    expectedAt: string | null;
    notes: string | null;
  }> | null;
  slaOverdue?: boolean;
  slaWarning?: boolean;
};

export const GESTAO_OS_SAFETY_CHECKLIST_ITEMS = [
  { id: 'sst-helmet', label: 'Capacete de segurança', checked: false, required: true },
  { id: 'sst-goggles', label: 'Óculos de proteção', checked: false, required: true },
  { id: 'sst-ear', label: 'Protetor auricular (quando aplicável)', checked: false, required: true },
  { id: 'sst-gloves', label: 'Luvas adequadas à atividade', checked: false, required: true },
  { id: 'sst-boots', label: 'Calçado de segurança', checked: false, required: true },
  { id: 'sst-uniform', label: 'Uniforme / vestimenta adequada', checked: false, required: true },
  { id: 'sst-area', label: 'Área isolada / sinalizada quando necessário', checked: false, required: true },
  { id: 'sst-tools', label: 'Ferramentas e equipamentos em condições de uso', checked: false, required: true },
  { id: 'sst-fit', label: 'Estou apto e ciente dos riscos da atividade', checked: false, required: true }
];

export async function fetchGestaoOsMe() {
  const { qs, headers } = await withCompany();
  const res = await api.get(`/api/gestao-os/me${qs}`, { headers });
  return parseJson(res);
}

export type GestaoOsAgendaKind = 'work_order' | 'plan';

export type GestaoOsAgendaItem = {
  id: string;
  kind: GestaoOsAgendaKind;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  color: string;
  href: string;
  overdue?: boolean;
  workOrderId?: string;
  planId?: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
};

export async function fetchGestaoOsAgenda(
  from: Date,
  to: Date
): Promise<GestaoOsAgendaItem[]> {
  const { qs, headers } = await withCompany({
    from: from.toISOString(),
    to: to.toISOString()
  });
  try {
    const res = await api.get(`/api/gestao-os/agenda${qs}`, { headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return [];
    const data = json?.data ?? json;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
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

const CLOSE_TOKEN_KEY = 'gestao-os-close-token';
const OFFLINE_QUEUE_KEY = 'gestao-os-offline-queue';
const OFFLINE_URL_MAP_KEY = 'gestao-os-offline-url-map';
const LOCAL_DRAFT_KEY = 'gestao-os-local-drafts';

type OfflineJob =
  | { type: 'transition'; id: string; body: Record<string, unknown> }
  | { type: 'create'; input: Record<string, unknown> }
  | { type: 'patch'; id: string; body: Record<string, unknown> }
  | { type: 'upload'; uri: string; name: string; mimeType: string };

export type GestaoOsLocalDraft = {
  checklist?: GestaoOsWorkOrderMobile['checklistResponses'];
  safetyChecklist?: GestaoOsWorkOrderMobile['safetyChecklistResponses'];
  safetyPhotoUrl?: string | null;
  startPhotoUrl?: string | null;
  endPhotoUrl?: string | null;
  parts?: GestaoOsWorkOrderMobile['parts'];
  note?: string;
  updatedAt: number;
};

function isNetworkError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /network|failed to fetch|network request failed|timeout|offline|sem conexão|sem rede|econnrefused|enotfound|typeerror/i.test(
    msg
  );
}

function isLocalMediaUrl(value: string) {
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return false;
  return (
    /^file:/i.test(value) ||
    /^content:/i.test(value) ||
    /^ph:/i.test(value) ||
    /^assets-library:/i.test(value) ||
    value.startsWith('offline:') ||
    /\/(ImagePicker|Caches|cache|tmp)\//i.test(value)
  );
}

export async function saveCloseQrToken(token: string) {
  const raw = token.replace(/^gennesis-os-close:/, '').trim();
  await AsyncStorage.setItem(CLOSE_TOKEN_KEY, raw);
}

export async function readCloseQrToken() {
  return AsyncStorage.getItem(CLOSE_TOKEN_KEY);
}

export async function clearCloseQrToken() {
  await AsyncStorage.removeItem(CLOSE_TOKEN_KEY);
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function readUrlMap(): Promise<Record<string, string>> {
  return readJson<Record<string, string>>(OFFLINE_URL_MAP_KEY, {});
}

async function rememberUploadedUrl(localUri: string, remote: string) {
  const map = await readUrlMap();
  map[localUri] = remote;
  await AsyncStorage.setItem(OFFLINE_URL_MAP_KEY, JSON.stringify(map));
}

export async function loadGestaoOsLocalDraft(id: string): Promise<GestaoOsLocalDraft | null> {
  const all = await readJson<Record<string, GestaoOsLocalDraft>>(LOCAL_DRAFT_KEY, {});
  return all[id] ?? null;
}

export async function saveGestaoOsLocalDraft(id: string, draft: Omit<GestaoOsLocalDraft, 'updatedAt'>) {
  const all = await readJson<Record<string, GestaoOsLocalDraft>>(LOCAL_DRAFT_KEY, {});
  all[id] = { ...draft, updatedAt: Date.now() };
  await AsyncStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(all));
}

export async function clearGestaoOsLocalDraft(id: string) {
  const all = await readJson<Record<string, GestaoOsLocalDraft>>(LOCAL_DRAFT_KEY, {});
  delete all[id];
  await AsyncStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(all));
}

async function enqueueOffline(job: OfflineJob) {
  const list = await readJson<OfflineJob[]>(OFFLINE_QUEUE_KEY, []);
  let next = list;
  if (job.type === 'patch') {
    next = list.filter((item) => !(item.type === 'patch' && item.id === job.id));
    next.push(job);
  } else if (job.type === 'upload') {
    if (list.some((item) => item.type === 'upload' && item.uri === job.uri)) return;
    next = [...list, job];
  } else {
    next = [...list, job];
  }
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
}

async function uploadAttachmentOnline(file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type
  } as unknown as Blob);
  const res = await api.post('/api/gestao-os/upload-attachment', form);
  return parseJson(res) as Promise<{ url: string; name?: string; mimeType?: string }>;
}

async function hydrateLocalMedia<T>(value: T): Promise<T> {
  if (typeof value === 'string') {
    if (!isLocalMediaUrl(value)) return value;
    const map = await readUrlMap();
    if (map[value]) return map[value] as T;
    const name = value.split('/').pop() || `foto-${Date.now()}.jpg`;
    const uploaded = await uploadAttachmentOnline({
      uri: value,
      name,
      type: 'image/jpeg'
    });
    if (!uploaded?.url) throw new Error('URL da foto não retornada');
    await rememberUploadedUrl(value, uploaded.url);
    return uploaded.url as T;
  }
  if (Array.isArray(value)) {
    const next = [];
    for (const item of value) next.push(await hydrateLocalMedia(item));
    return next as T;
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      next[key] = await hydrateLocalMedia(nested);
    }
    return next as T;
  }
  return value;
}

export async function syncGestaoOsOfflineQueue() {
  const list = await readJson<OfflineJob[]>(OFFLINE_QUEUE_KEY, []);
  if (!list.length) return { synced: 0, remaining: 0 };
  const remaining: OfflineJob[] = [];
  let synced = 0;
  const ordered = [
    ...list.filter((job) => job.type === 'upload'),
    ...list.filter((job) => job.type === 'patch'),
    ...list.filter((job) => job.type === 'create'),
    ...list.filter((job) => job.type === 'transition')
  ];
  for (const job of ordered) {
    try {
      if (job.type === 'upload') {
        const uploaded = await uploadAttachmentOnline({
          uri: job.uri,
          name: job.name,
          type: job.mimeType
        });
        if (uploaded?.url) await rememberUploadedUrl(job.uri, uploaded.url);
      } else if (job.type === 'patch') {
        await patchWorkOrderOnline(job.id, await hydrateLocalMedia(job.body));
        await clearGestaoOsLocalDraft(job.id);
      } else if (job.type === 'transition') {
        await transitionWorkOrderOnline(job.id, await hydrateLocalMedia(job.body));
        await clearGestaoOsLocalDraft(job.id);
      } else {
        await createWorkOrderOnline(await hydrateLocalMedia(job.input));
      }
      synced += 1;
    } catch {
      remaining.push(job);
    }
  }
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  return { synced, remaining: remaining.length };
}

async function transitionWorkOrderOnline(id: string, body: Record<string, unknown>) {
  const companyId = await getCompanyId();
  const res = await api.post(`/api/gestao-os/${id}/transition`, {
    ...body,
    companyId: companyId || undefined
  });
  return parseJson(res);
}

export async function transitionWorkOrder(id: string, body: Record<string, unknown>) {
  const hydrated = await hydrateLocalMedia(body).catch(() => body);
  try {
    const result = await transitionWorkOrderOnline(id, hydrated);
    await clearGestaoOsLocalDraft(id);
    return result;
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueueOffline({ type: 'transition', id, body: hydrated });
      throw new Error('Sem rede. A OS foi gravada no aparelho e será sincronizada depois.');
    }
    throw err;
  }
}

async function patchWorkOrderOnline(id: string, body: Record<string, unknown>) {
  const companyId = await getCompanyId();
  const res = await api.patch(`/api/gestao-os/${id}`, {
    ...body,
    companyId: companyId || undefined
  });
  return parseJson(res);
}

export async function patchWorkOrder(id: string, body: Record<string, unknown>) {
  const hydrated = await hydrateLocalMedia(body).catch(() => body);
  try {
    return await patchWorkOrderOnline(id, hydrated);
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueueOffline({ type: 'patch', id, body: hydrated });
      throw new Error('Sem rede. Checklist e fotos ficaram no aparelho e serão enviados depois.');
    }
    throw err;
  }
}

async function createWorkOrderOnline(input: Record<string, unknown>) {
  const companyId = await getCompanyId();
  const res = await api.post('/api/gestao-os', { ...input, companyId: companyId || undefined });
  return parseJson(res);
}

export async function uploadGestaoOsAttachment(file: {
  uri: string;
  name: string;
  type: string;
}) {
  try {
    const uploaded = await uploadAttachmentOnline(file);
    if (uploaded?.url) await rememberUploadedUrl(file.uri, uploaded.url);
    return uploaded;
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueueOffline({
        type: 'upload',
        uri: file.uri,
        name: file.name,
        mimeType: file.type
      });
      return { url: file.uri };
    }
    throw err;
  }
}

export async function resolveAssetQr(token: string) {
  const { qs, headers } = await withCompany();
  const sep = qs ? '&' : '?';
  const res = await api.get(
    `/api/gestao-os/cadastros/qr/resolve${qs}${sep}token=${encodeURIComponent(token)}`,
    { headers }
  );
  return parseJson(res);
}

export async function createWorkOrderFromQr(input: {
  category: string;
  description: string;
  buildingId?: string;
  sectorId?: string;
  placeId?: string;
  assetId?: string;
  origin?: string;
}) {
  try {
    return await createWorkOrderOnline(input);
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueueOffline({ type: 'create', input });
      throw new Error('Sem rede. O chamado foi gravado no aparelho e será sincronizado depois.');
    }
    throw err;
  }
}
