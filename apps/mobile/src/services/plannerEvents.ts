import api from './api';
import { readApiData, readApiJson } from './http';

export type PlannerEventAttendee = {
  id: string;
  name: string;
  email: string;
  profilePhotoUrl: string | null;
};

export type PlannerEventIcon =
  | 'meeting'
  | 'phone'
  | 'chart'
  | 'star'
  | 'check'
  | 'plane'
  | 'coffee'
  | 'users'
  | 'map-pin'
  | 'briefcase';

export type PlannerEvent = {
  id: string;
  userId: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  color: string;
  icon?: string | null;
  attendees?: PlannerEventAttendee[];
  googleEventId?: string | null;
  ataFileName?: string | null;
  ataFileUrl?: string | null;
  ataFileKey?: string | null;
  ataFileSize?: number | null;
  ataMimeType?: string | null;
  createdAt?: string;
  updatedAt?: string;
  href?: string | null;
  source?: 'planner' | 'gestao-os' | 'gestao-os-plan';
  workOrderId?: string;
  planId?: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
};

export type PlannerEventInput = {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  color?: string;
  icon?: string | null;
  attendeeIds?: string[];
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

export type KanbanPickerUser = {
  id: string;
  name: string;
  email: string;
  profilePhotoUrl?: string | null;
};

/** Mesmas cores da agenda web. */
export const EVENT_COLORS = [
  '#3B82F6',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#A855F7',
  '#06B6D4',
  '#EC4899',
];

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

export async function uploadPlannerEventAta(
  id: string,
  file: { uri: string; name: string; type: string },
): Promise<PlannerEvent> {
  const form = new FormData();
  form.append('ata', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as any);
  const res = await api.post(`/api/planner-events/${id}/ata`, form);
  return readApiData<PlannerEvent>(res);
}

export async function deletePlannerEventAta(id: string): Promise<PlannerEvent> {
  const res = await api.delete(`/api/planner-events/${id}/ata`);
  return readApiData<PlannerEvent>(res);
}

export async function fetchKanbanPickerUsers(): Promise<KanbanPickerUser[]> {
  const res = await api.get('/api/kanban/picker-users');
  return (await readApiData<KanbanPickerUser[]>(res)) || [];
}
