import type { KanbanBoard } from '@/lib/kanban';

const STORAGE_PREFIX = 'kanban-board-cache:v4:';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWrite: { key: string; board: KanbanBoard } | null = null;

/** Remove campos pesados antes de gravar no sessionStorage (importações grandes). */
function slimBoardForCache(board: KanbanBoard): KanbanBoard {
  return {
    ...board,
    columns: board.columns.map((col) => ({
      ...col,
      cards: col.cards.map((card) => {
        const desc = String(card.description ?? '');
        return {
          ...card,
          checklistItems: undefined,
          description: desc.length > 240 ? `${desc.slice(0, 240)}…` : desc,
          members: (card.members ?? []).slice(0, 4),
        };
      }),
    })),
  };
}

export function readKanbanBoardCache(departmentKey: string): KanbanBoard | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + departmentKey);
    if (!raw) return undefined;
    return JSON.parse(raw) as KanbanBoard;
  } catch {
    return undefined;
  }
}

export function writeKanbanBoardCache(departmentKey: string, board: KanbanBoard): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_PREFIX + departmentKey, JSON.stringify(slimBoardForCache(board)));
  } catch {
    /* quota ou modo privado */
  }
}

/** Evita JSON.stringify síncrono a cada tecla (ex.: título do card). */
export function writeKanbanBoardCacheDebounced(
  departmentKey: string,
  board: KanbanBoard,
  delayMs = 450,
): void {
  pendingWrite = { key: departmentKey, board };
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (!pendingWrite) return;
    writeKanbanBoardCache(pendingWrite.key, pendingWrite.board);
    pendingWrite = null;
  }, delayMs);
}

export function flushKanbanBoardCacheWrite(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (!pendingWrite) return;
  writeKanbanBoardCache(pendingWrite.key, pendingWrite.board);
  pendingWrite = null;
}

export function patchKanbanBoardCacheCard(
  departmentKey: string,
  card: KanbanBoard['columns'][number]['cards'][number],
  columnId: string,
): void {
  const cached = readKanbanBoardCache(departmentKey);
  if (!cached) return;

  let changed = false;
  const columns = cached.columns.map((col) => {
    const without = col.cards.filter((c) => c.id !== card.id);
    if (col.id === columnId) {
      changed = true;
      return { ...col, cards: [card, ...without] };
    }
    if (without.length !== col.cards.length) {
      changed = true;
      return { ...col, cards: without };
    }
    return col;
  });

  if (changed) {
    writeKanbanBoardCache(departmentKey, { ...cached, columns });
  }
}
