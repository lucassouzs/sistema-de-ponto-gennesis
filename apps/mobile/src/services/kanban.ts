import api from './api';
import { readApiData } from './http';

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export type KanbanCardLabel = { color: string; text: string };

export type KanbanCard = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  startDate: string | null;
  endDate: string | null;
  assignee: string;
  progress: number;
  totalTasks: number;
  completedTasks: number;
  checklistEnabled?: boolean;
  labels: KanbanCardLabel[];
  attachments: number;
  comments: number;
  createdAt: string;
  completedAt?: string | null;
  checklistItems?: KanbanChecklistItem[];
};

export type KanbanColumn = {
  id: string;
  title: string;
  color: string;
  cards: KanbanCard[];
  limit?: number;
};

export type KanbanLabelPreset = { color: string; name: string };

export const DEFAULT_KANBAN_LABEL_PRESETS: KanbanLabelPreset[] = [
  { color: '#FF78CB', name: 'DP/RH' },
  { color: '#00C2E0', name: 'Sistema' },
  { color: '#FF9F1A', name: 'Engenharia' },
  { color: '#F2D600', name: 'Suprimentos' },
  { color: '#C377E0', name: 'Contratos e Licitações' },
  { color: '#51E898', name: 'Projetos' },
  { color: '#EB5A46', name: 'Diretoria/Auditoria' },
  { color: '#344563', name: 'Geral' },
];

export type KanbanBoard = {
  id: string;
  name: string;
  slug: string;
  department: string;
  departmentKey: string;
  isCustom?: boolean;
  isOwner?: boolean;
  canWrite?: boolean;
  labelPresets?: KanbanLabelPreset[];
  columns: KanbanColumn[];
};

export type KanbanBoardSummary = {
  id: string;
  name: string;
  slug: string;
  departmentKey: string;
  department: string;
  columnCount: number;
  updatedAt: string;
  isOwnDepartment: boolean;
  isCustom: boolean;
  isOwner: boolean;
  sharedWithMe: boolean;
};

export type KanbanChecklistItem = {
  id: string;
  title: string;
  isDone: boolean;
  position: number;
  dueDate: string | null;
};

export type KanbanCardComment = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string };
};

export type KanbanCardAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploader?: { id: string; name: string };
};

export const KANBAN_LINK_MIME_TYPE = 'text/x-kanban-link';

export function isKanbanLinkAttachment(mimeType: string): boolean {
  return mimeType === KANBAN_LINK_MIME_TYPE;
}

export type KanbanCardDetail = KanbanCard & {
  columnId: string;
  columnTitle: string;
  columnColor: string;
  checklistItems: KanbanChecklistItem[];
  commentsList: KanbanCardComment[];
  attachmentsList: KanbanCardAttachment[];
};

export async function fetchKanbanBoards(): Promise<KanbanBoardSummary[]> {
  const res = await api.get('/api/kanban/boards');
  return (await readApiData<KanbanBoardSummary[]>(res)) || [];
}

export async function createKanbanBoard(name: string): Promise<KanbanBoardSummary> {
  const res = await api.post('/api/kanban/boards', { name });
  return readApiData<KanbanBoardSummary>(res);
}

export async function fetchKanbanBoard(departmentKey?: string): Promise<KanbanBoard> {
  const q = departmentKey
    ? `?departmentKey=${encodeURIComponent(departmentKey)}`
    : '';
  const res = await api.get(`/api/kanban/board${q}`);
  const data = await readApiData<KanbanBoard>(res);
  return {
    ...data,
    labelPresets:
      Array.isArray(data.labelPresets) && data.labelPresets.length > 0
        ? data.labelPresets
        : [...DEFAULT_KANBAN_LABEL_PRESETS],
  };
}

export async function createKanbanCard(payload: {
  columnId: string;
  title: string;
  description?: string;
  priority?: Priority;
  insertAt?: 'top' | 'bottom';
}): Promise<KanbanCard> {
  const res = await api.post('/api/kanban/cards', payload);
  return readApiData<KanbanCard>(res);
}

export async function createKanbanColumn(payload: {
  title: string;
  color: string;
  boardId?: string;
  cardLimit?: number;
}): Promise<KanbanColumn> {
  const res = await api.post('/api/kanban/columns', payload);
  return readApiData<KanbanColumn>(res);
}

export async function updateKanbanCard(
  id: string,
  payload: {
    title?: string;
    description?: string;
    priority?: Priority;
    labels?: KanbanCardLabel[];
    startDate?: string | null;
    endDate?: string | null;
    checklistEnabled?: boolean;
    completedAt?: string | null;
    archivedAt?: string | null;
  },
): Promise<KanbanCard> {
  const res = await api.patch(`/api/kanban/cards/${id}`, payload);
  return readApiData<KanbanCard>(res);
}

export async function moveKanbanCard(
  id: string,
  payload: { columnId: string; position: number },
): Promise<{ id: string; columnId: string; position: number }> {
  const res = await api.patch(`/api/kanban/cards/${id}/move`, payload);
  return readApiData(res);
}

export async function deleteKanbanCard(id: string): Promise<void> {
  const res = await api.delete(`/api/kanban/cards/${id}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || 'Falha ao excluir card');
  }
}

export async function fetchKanbanCard(id: string): Promise<KanbanCardDetail> {
  const res = await api.get(`/api/kanban/cards/${id}`);
  const data = await readApiData<KanbanCardDetail>(res);
  return {
    ...data,
    checklistItems: data.checklistItems ?? [],
    commentsList: data.commentsList ?? [],
    attachmentsList: data.attachmentsList ?? [],
    labels: data.labels ?? [],
  };
}

export async function createChecklistItem(cardId: string, title: string) {
  const res = await api.post(`/api/kanban/cards/${cardId}/checklist-items`, { title });
  return readApiData<{ item: KanbanChecklistItem; card: KanbanCardDetail }>(res);
}

export async function updateChecklistItem(
  id: string,
  payload: { title?: string; isDone?: boolean },
) {
  const res = await api.patch(`/api/kanban/checklist-items/${id}`, payload);
  return readApiData<{ item: KanbanChecklistItem; card: KanbanCardDetail }>(res);
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const res = await api.delete(`/api/kanban/checklist-items/${id}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || 'Falha ao excluir item');
  }
}

export async function createKanbanComment(cardId: string, content: string) {
  const res = await api.post(`/api/kanban/cards/${cardId}/comments`, { content });
  return readApiData<KanbanCardComment>(res);
}

export async function uploadKanbanAttachments(
  cardId: string,
  files: Array<{ uri: string; name: string; type: string }>,
): Promise<KanbanCardDetail> {
  const form = new FormData();
  for (const file of files) {
    form.append('attachments', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);
  }
  const res = await api.post(`/api/kanban/cards/${cardId}/attachments`, form);
  return readApiData<KanbanCardDetail>(res);
}

export async function addKanbanLinkAttachment(
  cardId: string,
  payload: { url: string; displayName?: string },
): Promise<KanbanCardDetail> {
  const res = await api.post(`/api/kanban/cards/${cardId}/attachments/link`, payload);
  return readApiData<KanbanCardDetail>(res);
}

export async function deleteKanbanAttachment(id: string): Promise<KanbanCardDetail> {
  const res = await api.delete(`/api/kanban/attachments/${id}`);
  return readApiData<KanbanCardDetail>(res);
}

export function isKanbanCompletedColumn(title: string): boolean {
  const t = title.trim().toLowerCase();
  return t === 'completed' || t === 'concluído' || t === 'concluido';
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
};
