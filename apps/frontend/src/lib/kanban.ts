import api from '@/lib/api';
import type { KanbanLabelPreset } from '@/components/kanban/kanbanLabels';

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface KanbanCardLabel {
  color: string;
  text: string;
}

export interface KanbanCardMember {
  userId: string;
  name: string;
  profilePhotoUrl: string | null;
  avatarColor: string;
}

export interface KanbanCard {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  startDate: string | null;
  endDate: string | null;
  assignee: string;
  assigneeUserId?: string | null;
  assigneeProfilePhotoUrl?: string | null;
  assigneeColor: string;
  members?: KanbanCardMember[];
  progress: number;
  totalTasks: number;
  completedTasks: number;
  checklistEnabled: boolean;
  attachmentsEnabled: boolean;
  /** Presente no payload do quadro para abrir o modal sem esperar o fetch do card. */
  checklistItems?: KanbanChecklistItem[];
  labels: KanbanCardLabel[];
  attachments: number;
  comments: number;
  createdAt: string;
  completedAt?: string | null;
  workHours?: number | null;
}

export interface KanbanCardCostPerson {
  userId: string;
  name: string;
  hourlyRate: number | null;
  cost: number | null;
  hasEmployeeRecord: boolean;
}

export interface KanbanCardCost {
  hours: number;
  periodStart: string;
  periodEnd: string;
  monthlyWorkHours: number;
  totalCost: number;
  hasMissingSalary: boolean;
  people: KanbanCardCostPerson[];
}

export function isKanbanCompletedColumn(title: string): boolean {
  const t = title.trim().toLowerCase();
  return t === 'completed' || t === 'concluído' || t === 'concluido';
}

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  cards: KanbanCard[];
  limit?: number;
}

export interface KanbanBoard {
  id: string;
  name: string;
  slug: string;
  department: string;
  departmentKey: string;
  isCustom?: boolean;
  isOwner?: boolean;
  canManageShares?: boolean;
  canWrite?: boolean;
  labelPresets?: KanbanLabelPreset[];
  columns: KanbanColumn[];
}

export interface KanbanBoardSummary {
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
  canManageShares: boolean;
  sharedWithMe: boolean;
}

export interface KanbanBoardShare {
  id: string;
  userId: string;
  permission: 'READ' | 'WRITE';
  user: {
    id: string;
    name: string;
    email: string;
    profilePhotoUrl: string | null;
  };
}

export async function fetchKanbanBoards(): Promise<KanbanBoardSummary[]> {
  const res = await api.get('/kanban/boards');
  return res.data.data;
}

export async function createKanbanBoard(name: string): Promise<KanbanBoardSummary> {
  const res = await api.post('/kanban/boards', { name });
  return res.data.data;
}

export async function updateKanbanBoard(boardId: string, name: string): Promise<KanbanBoardSummary> {
  const res = await api.patch(`/kanban/boards/${boardId}`, { name });
  return res.data.data;
}

export async function deleteKanbanBoard(boardId: string): Promise<{ departmentKey: string }> {
  const res = await api.delete(`/kanban/boards/${boardId}`);
  return res.data.data;
}

export async function fetchKanbanBoardShares(boardId: string): Promise<KanbanBoardShare[]> {
  const res = await api.get(`/kanban/boards/${boardId}/shares`);
  return res.data.data;
}

export async function addKanbanBoardShare(
  boardId: string,
  userId: string,
  permission: 'READ' | 'WRITE' = 'WRITE',
): Promise<KanbanBoardShare> {
  const res = await api.post(`/kanban/boards/${boardId}/shares`, { userId, permission });
  return res.data.data;
}

export async function updateKanbanBoardShare(
  boardId: string,
  userId: string,
  permission: 'READ' | 'WRITE',
): Promise<KanbanBoardShare> {
  const res = await api.patch(`/kanban/boards/${boardId}/shares/${userId}`, { permission });
  return res.data.data;
}

export async function removeKanbanBoardShare(boardId: string, userId: string): Promise<void> {
  await api.delete(`/kanban/boards/${boardId}/shares/${userId}`);
}

export async function fetchKanbanBoard(departmentKey?: string): Promise<KanbanBoard> {
  const res = await api.get('/kanban/board', {
    params: departmentKey ? { departmentKey } : undefined,
  });
  return res.data.data;
}

export type KanbanArchivedCard = KanbanCard & {
  columnId: string;
  columnTitle: string;
  columnColor?: string;
  archivedAt: string | null;
};

export async function fetchKanbanArchivedCards(
  departmentKey?: string,
): Promise<KanbanArchivedCard[]> {
  const res = await api.get('/kanban/board/archived-cards', {
    params: departmentKey ? { departmentKey } : undefined,
  });
  return (res.data.data ?? []) as KanbanArchivedCard[];
}

/** Baixa o quadro atual como JSON compatível com Trello. */
export async function exportKanbanBoardTrello(departmentKey?: string): Promise<{
  filename: string;
  payload: unknown;
}> {
  const res = await api.get('/kanban/board/export-trello', {
    params: departmentKey ? { departmentKey } : undefined,
  });
  const disposition = String(res.headers?.['content-disposition'] || '');
  const match = disposition.match(/filename="([^"]+)"/i);
  const filename = match?.[1] || 'tasks-trello-export.json';
  return { filename, payload: res.data };
}

export type KanbanTrelloImportResult = {
  columnsCreated: number;
  cardsCreated: number;
  boardName: string;
};

/** Importa JSON estilo Trello no quadro atual. */
export async function importKanbanBoardTrello(options: {
  board: unknown;
  departmentKey?: string;
  replace?: boolean;
  memberMap?: Record<string, string>;
}): Promise<KanbanTrelloImportResult> {
  // Quadros grandes do Trello passam fácil de 30s (timeout padrão do axios).
  // Timeout maior alinhado ao import por coluna no backend.
  const res = await api.post(
    '/kanban/board/import-trello',
    {
      board: options.board,
      departmentKey: options.departmentKey,
      replace: !!options.replace,
      memberMap: options.memberMap,
    },
    { timeout: 10 * 60 * 1000 },
  );
  return res.data.data;
}

export async function updateKanbanBoardLabelPresets(
  presets: KanbanLabelPreset[],
  departmentKey?: string,
  options?: { colorRemaps?: Array<{ from: string; to: string }> },
): Promise<KanbanLabelPreset[]> {
  const res = await api.patch('/kanban/board/label-presets', {
    presets,
    ...(departmentKey ? { departmentKey } : {}),
    ...(options?.colorRemaps?.length ? { colorRemaps: options.colorRemaps } : {}),
  });
  return res.data.data;
}

/** Aplica troca de cor de etiquetas em todos os cards do cache do quadro. */
export function remapLabelsInBoardCache(
  board: KanbanBoard | undefined,
  presets: KanbanLabelPreset[],
  colorRemaps?: Array<{ from: string; to: string }>,
): KanbanBoard | undefined {
  if (!board) return board;

  const remapMap = new Map(
    (colorRemaps ?? []).map((r) => [r.from.trim().toLowerCase(), r.to] as const),
  );
  const presetByColor = new Map(
    presets.map((p) => [p.color.trim().toLowerCase(), p] as const),
  );

  // Também detecta remaps por nome (mesmo critério do backend).
  const oldPresets = board.labelPresets ?? [];
  for (const old of oldPresets) {
    const colorKept = presets.some(
      (p) => p.color.toLowerCase() === old.color.toLowerCase(),
    );
    if (colorKept) continue;
    const byName = presets.find(
      (p) => p.name.trim().toLowerCase() === old.name.trim().toLowerCase(),
    );
    if (!byName) continue;
    if (!remapMap.has(old.color.toLowerCase())) {
      remapMap.set(old.color.toLowerCase(), byName.color);
    }
  }

  let changed = remapMap.size > 0;
  const columns = board.columns.map((col) => {
    const cards = col.cards.map((card) => {
      if (!card.labels?.length) return card;
      let cardChanged = false;
      const labels = card.labels.map((l) => {
        const to = remapMap.get(l.color.trim().toLowerCase());
        if (to) {
          cardChanged = true;
          const preset = presetByColor.get(to.toLowerCase());
          return { color: to, text: preset?.name ?? l.text };
        }
        const preset = presetByColor.get(l.color.trim().toLowerCase());
        if (preset && preset.name !== l.text) {
          cardChanged = true;
          return { color: preset.color, text: preset.name };
        }
        return l;
      });
      if (!cardChanged) return card;
      changed = true;
      return { ...card, labels };
    });
    return { ...col, cards };
  });

  if (!changed && board.labelPresets === presets) return board;
  return { ...board, labelPresets: presets, columns };
}

export type KanbanBoardCardChecklistPatch = Pick<
  KanbanCard,
  'completedTasks' | 'totalTasks' | 'progress' | 'checklistEnabled'
> & {
  checklistItems?: KanbanChecklistItem[];
};

/** Atualiza contadores de checklist de um card no cache do board (sem refetch). */
export function patchCardInBoardCache(
  board: KanbanBoard | undefined,
  cardId: string,
  patch: KanbanBoardCardChecklistPatch,
): KanbanBoard | undefined {
  if (!board) return board;

  let changed = false;
  const columns = board.columns.map((col) => {
    let colChanged = false;
    const cards = col.cards.map((card) => {
      if (card.id !== cardId) return card;
      const nextItems = patch.checklistItems ?? card.checklistItems;
      const itemsUnchanged =
        patch.checklistItems === undefined ||
        (card.checklistItems === patch.checklistItems);
      if (
        card.completedTasks === patch.completedTasks &&
        card.totalTasks === patch.totalTasks &&
        card.progress === patch.progress &&
        card.checklistEnabled === patch.checklistEnabled &&
        itemsUnchanged
      ) {
        return card;
      }
      colChanged = true;
      changed = true;
      return {
        ...card,
        completedTasks: patch.completedTasks,
        totalTasks: patch.totalTasks,
        progress: patch.progress,
        checklistEnabled: patch.checklistEnabled,
        ...(patch.checklistItems !== undefined ? { checklistItems: nextItems } : {}),
      };
    });
    return colChanged ? { ...col, cards } : col;
  });

  return changed ? { ...board, columns } : board;
}

/** Insere um card no cache do board (ex.: após copiar), sem refetch do quadro inteiro. */
export function insertCardIntoBoardCache(
  board: KanbanBoard | undefined,
  columnId: string,
  card: KanbanCard,
  atTop = true,
): KanbanBoard | undefined {
  if (!board) return board;

  return {
    ...board,
    columns: board.columns.map((col) => {
      if (col.id !== columnId) return col;
      const withoutDup = col.cards.filter((c) => c.id !== card.id);
      const cards = atTop ? [card, ...withoutDup] : [...withoutDup, card];
      return { ...col, cards };
    }),
  };
}

/** IDs temporários gerados no cliente antes da API confirmar (criação/cópia). */
export function isOptimisticKanbanCardId(cardId: string | undefined | null): boolean {
  if (!cardId) return false;
  return cardId.startsWith('optimistic-') && !cardId.startsWith('optimistic-checklist-');
}

/** IDs temporários de itens de checklist antes da API confirmar. */
export function isOptimisticKanbanChecklistItemId(id: string | undefined | null): boolean {
  if (!id) return false;
  return id.startsWith('optimistic-checklist-');
}

export function buildOptimisticNewCard(title: string, tempId: string): KanbanCard {
  return {
    id: tempId,
    title,
    description: '',
    priority: 'medium',
    startDate: null,
    endDate: null,
    assignee: 'Sem responsável',
    assigneeUserId: null,
    assigneeProfilePhotoUrl: null,
    assigneeColor: '#9CA3AF',
    members: [],
    progress: 0,
    totalTasks: 0,
    completedTasks: 0,
    checklistEnabled: false,
    attachmentsEnabled: false,
    labels: [],
    attachments: 0,
    comments: 0,
    createdAt: new Date().toISOString(),
    completedAt: null,
    workHours: null,
  };
}

/** Remove um card do cache do board (ex.: após excluir), sem refetch. */
export function removeCardFromBoardCache(
  board: KanbanBoard | undefined,
  cardId: string,
): KanbanBoard | undefined {
  if (!board) return board;

  let changed = false;
  const columns = board.columns.map((col) => {
    const cards = col.cards.filter((c) => c.id !== cardId);
    if (cards.length === col.cards.length) return col;
    changed = true;
    return { ...col, cards };
  });

  return changed ? { ...board, columns } : board;
}

/** Substitui um card temporário (cópia otimista) pelo card real retornado da API. */
export function replaceCardInBoardCache(
  board: KanbanBoard | undefined,
  tempId: string,
  card: KanbanCard,
): KanbanBoard | undefined {
  if (!board) return board;

  let changed = false;
  const columns = board.columns.map((col) => {
    const index = col.cards.findIndex((c) => c.id === tempId);
    if (index < 0) return col;
    changed = true;
    const cards = [...col.cards];
    cards[index] = card;
    return { ...col, cards };
  });

  return changed ? { ...board, columns } : board;
}

/** Converte detalhe do card (modal) para o formato exibido no quadro. */
export function kanbanDetailToBoardCard(detail: KanbanCardDetail): KanbanCard {
  const {
    columnId: _columnId,
    columnTitle: _columnTitle,
    columnColor: _columnColor,
    commentsList: _commentsList,
    attachmentsList: _attachmentsList,
    updatedAt: _updatedAt,
    ...card
  } = detail;
  return {
    ...card,
    checklistItems: detail.checklistItems,
  };
}

/**
 * Atualiza campos de um card no cache do quadro sem refetch.
 * Nunca repositiona/move entre colunas — isso é só via moveCardInBoardCache.
 * (Evita que sync de título/meta com columnId stale devolva o card ao lugar antigo.)
 */
export function syncCardOnBoardCache(
  board: KanbanBoard | undefined,
  card: KanbanCard,
  columnId: string,
): KanbanBoard | undefined {
  if (!board) return board;

  let sourceColumnId: string | null = null;
  for (const col of board.columns) {
    if (col.cards.some((c) => c.id === card.id)) {
      sourceColumnId = col.id;
      break;
    }
  }

  if (!sourceColumnId) {
    return insertCardIntoBoardCache(board, columnId, card, false);
  }

  let changed = false;
  const columns = board.columns.map((col) => {
    if (col.id !== sourceColumnId) return col;
    const cards = col.cards.map((c) => {
      if (c.id !== card.id) return c;
      changed = true;
      return {
        ...c,
        ...card,
        // Não apaga tarefas do board se a resposta da API não trouxe a lista.
        checklistItems: card.checklistItems ?? c.checklistItems,
      };
    });
    return changed ? { ...col, cards } : col;
  });
  return changed ? { ...board, columns } : board;
}

export function buildOptimisticCardCopy(
  source: KanbanCard,
  title: string,
  tempId: string,
  keep?: { copyLabels?: boolean; copyAttachments?: boolean },
): KanbanCard {
  const copyLabels = keep?.copyLabels !== false;
  const copyAttachments = keep?.copyAttachments !== false;
  return {
    ...source,
    id: tempId,
    title,
    labels: copyLabels ? source.labels : [],
    progress: source.checklistEnabled ? 0 : source.progress,
    completedTasks: source.checklistEnabled ? 0 : source.completedTasks,
    comments: 0,
    attachments: copyAttachments ? source.attachments : 0,
    attachmentsEnabled: copyAttachments ? source.attachmentsEnabled : false,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
}

/** Remove uma coluna do cache do board (ex.: após excluir), sem refetch. */
export function removeColumnFromBoardCache(
  board: KanbanBoard | undefined,
  columnId: string,
): KanbanBoard | undefined {
  if (!board) return board;

  const columns = board.columns.filter((col) => col.id !== columnId);
  return columns.length === board.columns.length ? board : { ...board, columns };
}

/** Insere uma coluna no cache do board (ex.: após criar), sem refetch. */
export function insertColumnIntoBoardCache(
  board: KanbanBoard | undefined,
  column: KanbanColumn,
  atEnd = true,
): KanbanBoard | undefined {
  if (!board) return board;

  const withoutDup = board.columns.filter((col) => col.id !== column.id);
  return {
    ...board,
    columns: atEnd ? [...withoutDup, column] : [column, ...withoutDup],
  };
}

export function buildOptimisticKanbanColumn(
  title: string,
  color: string,
  tempId: string,
  limit?: number,
): KanbanColumn {
  return {
    id: tempId,
    title,
    color,
    cards: [],
    ...(limit ? { limit } : {}),
  };
}

export function patchColumnInBoardCache(
  board: KanbanBoard | undefined,
  columnId: string,
  patch: Partial<Pick<KanbanColumn, 'title' | 'color' | 'limit'>>,
): KanbanBoard | undefined {
  if (!board) return board;

  let changed = false;
  const columns = board.columns.map((col) => {
    if (col.id !== columnId) return col;
    changed = true;
    return { ...col, ...patch };
  });

  return changed ? { ...board, columns } : board;
}

export async function createKanbanColumn(payload: {
  title: string;
  color: string;
  cardLimit?: number;
  boardId?: string;
}) {
  const res = await api.post('/kanban/columns', payload);
  return res.data.data as KanbanColumn;
}

export async function updateKanbanColumn(
  id: string,
  payload: { title?: string; color?: string; cardLimit?: number | null; position?: number },
) {
  const res = await api.patch(`/kanban/columns/${id}`, payload);
  return res.data.data as KanbanColumn;
}

export async function deleteKanbanColumn(id: string) {
  await api.delete(`/kanban/columns/${id}`);
}

export async function createKanbanCard(payload: {
  columnId: string;
  title: string;
  description?: string;
  priority?: Priority;
  startDate?: string | null;
  endDate?: string | null;
  labels?: KanbanCardLabel[];
  assigneeName?: string;
  assigneeUserId?: string | null;
  memberUserIds?: string[];
  totalTasks?: number;
  completedTasks?: number;
  insertAt?: 'top' | 'bottom';
}, options?: { timeout?: number }) {
  const res = await api.post('/kanban/cards', payload, {
    timeout: options?.timeout ?? 30_000,
  });
  return res.data.data as KanbanCard;
}

export async function addKanbanCardMember(cardId: string, userId: string) {
  const res = await api.post(`/kanban/cards/${cardId}/members`, { userId });
  return res.data.data as KanbanCardDetail;
}

export async function removeKanbanCardMember(cardId: string, userId: string) {
  const res = await api.delete(`/kanban/cards/${cardId}/members/${userId}`);
  return res.data.data as KanbanCardDetail;
}

const kanbanCardPatchChain = new Map<string, Promise<unknown>>();

/** Fila de move: coalescida (só a última posição importa) e independente do PATCH de meta. */
type KanbanCardMovePayload = { columnId: string; position: number };
type KanbanCardMoveResult = { id: string; columnId: string; position: number };
const kanbanCardMovePending = new Map<string, KanbanCardMovePayload>();
const kanbanCardMoveInflight = new Map<string, Promise<KanbanCardMoveResult>>();

/**
 * Serializa PATCH no mesmo card — evita race entre move (position/columnId) e
 * update de título/meta, que fazia o card voltar ou pular de posição.
 */
export async function updateKanbanCard(
  id: string,
  payload: {
    columnId?: string;
    title?: string;
    description?: string;
    priority?: Priority;
    startDate?: string | null;
    endDate?: string | null;
    labels?: KanbanCardLabel[];
    assigneeName?: string;
    assigneeUserId?: string | null;
    totalTasks?: number;
    completedTasks?: number;
    checklistEnabled?: boolean;
    attachmentsEnabled?: boolean;
    position?: number;
    workHours?: number | null;
    completedAt?: string | null;
    archivedAt?: string | null;
  },
  options?: { timeout?: number },
) {
  // Meta não pode correr em paralelo com move — sobrescrevia coluna/posição.
  const moveInflight = kanbanCardMoveInflight.get(id);
  if (moveInflight) {
    await moveInflight.catch(() => undefined);
  }

  const previous = kanbanCardPatchChain.get(id) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(async () => {
      const res = await api.patch(`/kanban/cards/${id}`, payload, {
        timeout: options?.timeout ?? 120_000,
      });
      return res.data.data as KanbanCard;
    });
  kanbanCardPatchChain.set(
    id,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

/**
 * Persiste só coluna/posição do card via endpoint leve.
 * Coalescia moves em sequência (só a última posição é enviada) e não espera PATCH de meta.
 */
export async function moveKanbanCard(
  id: string,
  payload: KanbanCardMovePayload,
  options?: { timeout?: number },
): Promise<KanbanCardMoveResult> {
  kanbanCardMovePending.set(id, payload);

  const existing = kanbanCardMoveInflight.get(id);
  if (existing) return existing;

  const run = (async () => {
    try {
      let last: KanbanCardMoveResult | undefined;
      while (kanbanCardMovePending.has(id)) {
        const latest = kanbanCardMovePending.get(id)!;
        kanbanCardMovePending.delete(id);
        const res = await api.patch(`/kanban/cards/${id}/move`, latest, {
          timeout: options?.timeout ?? 12_000,
        });
        last = res.data.data as KanbanCardMoveResult;
      }
      if (!last) throw new Error('Move do card cancelado');
      return last;
    } finally {
      kanbanCardMoveInflight.delete(id);
    }
  })();

  kanbanCardMoveInflight.set(id, run);
  return run;
}

export async function fetchKanbanCardCost(cardId: string): Promise<KanbanCardCost> {
  const res = await api.get(`/kanban/cards/${cardId}/cost`);
  return res.data.data as KanbanCardCost;
}

export async function deleteKanbanCard(id: string) {
  await api.delete(`/kanban/cards/${id}`);
}

export async function duplicateKanbanCard(
  id: string,
  payload?: {
    title?: string;
    columnId?: string;
    copyLabels?: boolean;
    copyAttachments?: boolean;
  },
  options?: { timeout?: number },
) {
  const res = await api.post(`/kanban/cards/${id}/duplicate`, payload ?? {}, {
    timeout: options?.timeout ?? 120_000,
  });
  return res.data.data as KanbanCard;
}

export interface KanbanChecklistItemAssignee {
  id: string;
  name: string;
  profilePhotoUrl: string | null;
  avatarColor: string;
}

export interface KanbanChecklistItem {
  id: string;
  cardId?: string;
  title: string;
  isDone: boolean;
  position: number;
  dueDate: string | null;
  assigneeUserId: string | null;
  assignee: KanbanChecklistItemAssignee | null;
}

export const KANBAN_LINK_MIME_TYPE = 'text/x-kanban-link';

export function isKanbanLinkAttachment(mimeType: string): boolean {
  return mimeType === KANBAN_LINK_MIME_TYPE;
}

export interface KanbanCardAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploader: { id: string; name: string };
}

export interface KanbanCardComment {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
    avatarColor: string;
  };
}

export interface KanbanCardDetail extends KanbanCard {
  columnId: string;
  columnTitle: string;
  columnColor: string;
  updatedAt?: string;
  checklistItems: KanbanChecklistItem[];
  commentsList: KanbanCardComment[];
  attachmentsList: KanbanCardAttachment[];
}

export function normalizeKanbanCardDetail(data: KanbanCardDetail): KanbanCardDetail {
  return {
    ...data,
    commentsList: data.commentsList ?? [],
    attachmentsList: data.attachmentsList ?? [],
    checklistItems: (data.checklistItems ?? []).map((item) => ({
      ...item,
      dueDate: item.dueDate ?? null,
      assigneeUserId: item.assigneeUserId ?? null,
      assignee: item.assignee ?? null,
    })),
  };
}

export const kanbanCardQueryKey = (cardId: string) => ['kanban-card', cardId] as const;

/**
 * Semear o cache do card com as tarefas já presentes no quadro,
 * para o modal abrir a checklist na hora (sem esperar o GET do card).
 * Marca o cache como stale para o fetch completo (comentários/anexos) seguir.
 */
export function seedKanbanCardCacheFromBoard(
  queryClient: {
    getQueryData: <T>(key: readonly unknown[]) => T | undefined;
    setQueryData: <T>(
      key: readonly unknown[],
      updater: T | ((old: T | undefined) => T),
      options?: { updatedAt?: number },
    ) => void;
  },
  card: KanbanCard,
  columnId: string,
  column?: { title: string; color: string },
): void {
  const key = kanbanCardQueryKey(card.id);
  const boardItems = Array.isArray(card.checklistItems) ? card.checklistItems : [];
  const existing = queryClient.getQueryData<KanbanCardDetail>(key);

  // Sempre alinha columnId com a posição atual no board (cache de detalhe pode estar velho).
  if (existing) {
    const columnChanged = existing.columnId !== columnId;
    const needsChecklistSeed =
      boardItems.length > 0 &&
      !(existing.checklistItems && existing.checklistItems.length > 0);
    if (!columnChanged && !needsChecklistSeed) return;

    const next: KanbanCardDetail = {
      ...existing,
      columnId,
      ...(column
        ? { columnTitle: column.title, columnColor: column.color }
        : {}),
      ...(needsChecklistSeed
        ? {
            checklistItems: boardItems,
            totalTasks: card.totalTasks,
            completedTasks: card.completedTasks,
            checklistEnabled: card.checklistEnabled,
            progress: card.progress,
          }
        : {}),
    };
    queryClient.setQueryData<KanbanCardDetail>(key, next, { updatedAt: 0 });
    return;
  }

  if (boardItems.length === 0) {
    return;
  }

  // updatedAt: 0 → continua stale e o prefetch/fetch busca comentários/anexos.
  queryClient.setQueryData<KanbanCardDetail>(
    key,
    boardCardToDetailPlaceholder(card, columnId, column),
    { updatedAt: 0 },
  );
}

/** Dados do board para exibir a modal antes do fetch completo (comentários, anexos). */
export function boardCardToDetailPlaceholder(
  card: KanbanCard,
  columnId: string,
  column?: { title: string; color: string },
): KanbanCardDetail {
  return normalizeKanbanCardDetail({
    ...card,
    members: card.members ?? [],
    labels: card.labels ?? [],
    columnId,
    columnTitle: column?.title ?? '',
    columnColor: column?.color ?? '',
    updatedAt: card.createdAt,
    checklistItems: Array.isArray(card.checklistItems) ? card.checklistItems : [],
    commentsList: [],
    attachmentsList: [],
  });
}

export async function fetchKanbanCard(id: string): Promise<KanbanCardDetail> {
  const res = await api.get(`/kanban/cards/${id}`);
  return normalizeKanbanCardDetail(res.data.data as KanbanCardDetail);
}

export async function createChecklistItem(cardId: string, title: string) {
  const res = await api.post(`/kanban/cards/${cardId}/checklist-items`, { title });
  return res.data.data as { item: KanbanChecklistItem; card: KanbanCardDetail };
}

export async function updateChecklistItem(
  id: string,
  payload: {
    title?: string;
    isDone?: boolean;
    assigneeUserId?: string | null;
    dueDate?: string | null;
  },
) {
  const res = await api.patch(`/kanban/checklist-items/${id}`, payload);
  return res.data.data as { item: KanbanChecklistItem; card: KanbanCardDetail };
}

export async function deleteChecklistItem(id: string) {
  await api.delete(`/kanban/checklist-items/${id}`);
}

export async function createKanbanComment(cardId: string, content: string) {
  const res = await api.post(`/kanban/cards/${cardId}/comments`, { content });
  return res.data.data as KanbanCardComment;
}

export async function deleteKanbanComment(id: string) {
  await api.delete(`/kanban/comments/${id}`);
}

export async function uploadKanbanAttachments(cardId: string, files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append('attachments', f));
  const res = await api.post(`/kanban/cards/${cardId}/attachments`, form);
  return res.data.data as KanbanCardDetail;
}

export async function addKanbanLinkAttachment(
  cardId: string,
  payload: { url: string; displayName?: string },
) {
  const res = await api.post(`/kanban/cards/${cardId}/attachments/link`, payload);
  return res.data.data as KanbanCardDetail;
}

export async function deleteKanbanAttachment(id: string) {
  const res = await api.delete(`/kanban/attachments/${id}`);
  return res.data.data as KanbanCardDetail;
}
