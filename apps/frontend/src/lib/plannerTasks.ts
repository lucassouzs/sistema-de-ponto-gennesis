import api from '@/lib/api';

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
  createdAt?: string;
  updatedAt?: string;
};

export type PlannerTaskList = {
  id: string;
  userId: string;
  title: string;
  position: number;
  createdAt?: string;
  updatedAt?: string;
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

export type PlannerTaskListInput = {
  title: string;
  position?: number;
};

export async function fetchPlannerTaskLists(): Promise<PlannerTaskList[]> {
  const res = await api.get('/planner-tasks/lists');
  return (res.data?.data || []) as PlannerTaskList[];
}

export async function createPlannerTaskList(
  input: PlannerTaskListInput
): Promise<PlannerTaskList> {
  const res = await api.post('/planner-tasks/lists', input);
  return res.data.data as PlannerTaskList;
}

export async function updatePlannerTaskList(
  id: string,
  input: Partial<PlannerTaskListInput>
): Promise<PlannerTaskList> {
  const res = await api.patch(`/planner-tasks/lists/${id}`, input);
  return res.data.data as PlannerTaskList;
}

export async function deletePlannerTaskList(id: string): Promise<void> {
  await api.delete(`/planner-tasks/lists/${id}`);
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
  const res = await api.get(`/planner-tasks${qs ? `?${qs}` : ''}`);
  return (res.data?.data || []) as PlannerTask[];
}

export async function createPlannerTask(input: PlannerTaskInput): Promise<PlannerTask> {
  const res = await api.post('/planner-tasks', input);
  return res.data.data as PlannerTask;
}

export async function updatePlannerTask(
  id: string,
  input: Partial<PlannerTaskInput>
): Promise<PlannerTask> {
  const res = await api.patch(`/planner-tasks/${id}`, input);
  return res.data.data as PlannerTask;
}

export async function deletePlannerTask(id: string): Promise<void> {
  await api.delete(`/planner-tasks/${id}`);
}

/** YYYY-MM-DD local a partir de Date ou ISO. */
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

/** HH:mm local a partir de Date ou ISO. */
export function toTimeInputValue(value?: string | Date | null): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mi}`;
}

/** Junta data (YYYY-MM-DD) + hora (HH:mm) em ISO local serializado. */
export function combineDateAndTime(
  dateStr: string | null | undefined,
  timeStr?: string | null
): string | null {
  const date = String(dateStr || '').trim();
  if (!date) return null;
  const time = String(timeStr || '').trim() || '09:00';
  return `${date}T${time}`;
}

export function isSameDateOnly(a: Date, dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) {
    const m = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return false;
    return (
      a.getFullYear() === Number(m[1]) &&
      a.getMonth() + 1 === Number(m[2]) &&
      a.getDate() === Number(m[3])
    );
  }
  return (
    a.getFullYear() === d.getFullYear() &&
    a.getMonth() === d.getMonth() &&
    a.getDate() === d.getDate()
  );
}
