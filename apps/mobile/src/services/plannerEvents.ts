import api from './api';
import { readApiData, readApiJson } from './http';

export type PlannerEvent = {
  id: string;
  userId: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  color: string;
};

export type PlannerEventInput = {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  color?: string;
  ownerId?: string;
};

export type PlannerAgendaPermission = 'OWNER' | 'READ' | 'WRITE';

export type PlannerAgenda = {
  ownerId: string;
  name: string;
  email: string;
  profilePhotoUrl: string | null;
  permission: PlannerAgendaPermission;
  isMine: boolean;
};

export type PlannerEventsMeta = {
  ownerId: string;
  permission: PlannerAgendaPermission;
  canWrite: boolean;
  isOwner: boolean;
};

export async function fetchPlannerAgendas(): Promise<PlannerAgenda[]> {
  const res = await api.get('/api/planner-events/agendas');
  return (await readApiData<PlannerAgenda[]>(res)) || [];
}

export async function fetchPlannerEvents(
  from: Date,
  to: Date,
  ownerId?: string,
): Promise<{ events: PlannerEvent[]; meta: PlannerEventsMeta | null }> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  if (ownerId) params.set('ownerId', ownerId);
  const res = await api.get(`/api/planner-events?${params.toString()}`);
  const json = await readApiJson<{ data?: PlannerEvent[]; meta?: PlannerEventsMeta }>(res);
  return {
    events: json.data || [],
    meta: json.meta || null,
  };
}

export async function createPlannerEvent(input: PlannerEventInput): Promise<PlannerEvent> {
  const res = await api.post('/api/planner-events', input);
  return readApiData<PlannerEvent>(res);
}

export async function updatePlannerEvent(
  id: string,
  input: Partial<PlannerEventInput>,
): Promise<PlannerEvent> {
  const res = await api.patch(`/api/planner-events/${id}`, input);
  return readApiData<PlannerEvent>(res);
}

export async function deletePlannerEvent(id: string): Promise<void> {
  const res = await api.delete(`/api/planner-events/${id}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || 'Falha ao excluir evento');
  }
}

export const EVENT_COLORS = ['#ce3736', '#2563eb', '#16a34a', '#ca8a04', '#7c3aed', '#0891b2'];
