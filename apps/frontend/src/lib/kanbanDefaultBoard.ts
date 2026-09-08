const STORAGE_PREFIX = 'kanban-default-board:';

export function getKanbanDefaultBoard(userId: string | undefined | null): string | null {
  if (!userId || typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

export function saveKanbanDefaultBoard(userId: string, departmentKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, departmentKey);
  } catch {
    // ignore quota / private mode
  }
}

export function clearKanbanDefaultBoard(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${userId}`);
  } catch {
    // ignore
  }
}

type DefaultBoardCandidate = {
  departmentKey: string;
  isOwnDepartment?: boolean;
};

/** Padrão implícito: quadro do setor. Só muda se o usuário salvar outro em localStorage. */
export function resolveKanbanDefaultBoard(
  userId: string | undefined | null,
  boards: DefaultBoardCandidate[],
): string | null {
  if (!boards.length) return null;

  const saved = getKanbanDefaultBoard(userId);
  if (saved && boards.some((b) => b.departmentKey === saved)) {
    return saved;
  }

  const ownDept = boards.find((b) => b.isOwnDepartment);
  return ownDept?.departmentKey ?? boards[0]?.departmentKey ?? null;
}
