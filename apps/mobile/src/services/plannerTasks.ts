import api from './api';
import { readApiData } from './http';

export type PlannerTask = {
  id: string;
  userId: string;
  listId: string;
  title: string;
  notes: string;
  completed: boolean;
  starred: boolean;
  dueDate: string | null;
  position: number;
  completedAt?: string | null;
};

export type PlannerTaskList = {
  id: string;
  userId: string;
  title: string;
  position: number;
  tasks: PlannerTask[];
};

export type PlannerTaskInput = {
  title: string;
  listId?: string;
  notes?: string;
  dueDate?: string | null;
  starred?: boolean;
  completed?: boolean;
  position?: number;
};

export async function fetchPlannerTaskLists(): Promise<PlannerTaskList[]> {
  const res = await api.get('/api/planner-tasks/lists');
  return (await readApiData<PlannerTaskList[]>(res)) || [];
}

export async function fetchPlannerTasks(params?: {
  from?: Date;
  to?: Date;
  withDue?: boolean;
  includeCompleted?: boolean;
  listId?: string;
}): Promise<PlannerTask[]> {
  const q = new URLSearchParams();
  if (params?.from) q.set('from', params.from.toISOString());
  if (params?.to) q.set('to', params.to.toISOString());
  if (params?.withDue) q.set('withDue', '1');
  if (params?.includeCompleted === false) q.set('includeCompleted', '0');
  if (params?.listId) q.set('listId', params.listId);
  const qs = q.toString();
  const res = await api.get(`/api/planner-tasks${qs ? `?${qs}` : ''}`);
  return (await readApiData<PlannerTask[]>(res)) || [];
}

export async function createPlannerTaskList(title: string): Promise<PlannerTaskList> {
  const res = await api.post('/api/planner-tasks/lists', { title });
  return readApiData<PlannerTaskList>(res);
}

export async function updatePlannerTaskList(
  id: string,
  input: { title?: string; position?: number },
): Promise<PlannerTaskList> {
  const res = await api.patch(`/api/planner-tasks/lists/${id}`, input);
  return readApiData<PlannerTaskList>(res);
}

export async function deletePlannerTaskList(id: string): Promise<void> {
  const res = await api.delete(`/api/planner-tasks/lists/${id}`);
  await readApiData(res).catch(() => undefined);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || 'Falha ao excluir lista');
  }
}

export async function createPlannerTask(input: PlannerTaskInput): Promise<PlannerTask> {
  const res = await api.post('/api/planner-tasks', input);
  return readApiData<PlannerTask>(res);
}

export async function updatePlannerTask(
  id: string,
  input: Partial<PlannerTaskInput>,
): Promise<PlannerTask> {
  const res = await api.patch(`/api/planner-tasks/${id}`, input);
  return readApiData<PlannerTask>(res);
}

export async function deletePlannerTask(id: string): Promise<void> {
  const res = await api.delete(`/api/planner-tasks/${id}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || 'Falha ao excluir tarefa');
  }
}

export function toDateInputValue(value?: string | Date | null): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) {
    const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function toTimeInputValue(value?: string | Date | null): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mi}`;
}
