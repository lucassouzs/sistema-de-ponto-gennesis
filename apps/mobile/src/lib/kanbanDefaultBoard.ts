import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_PREFIX = 'kanban-default-board:';

const storage = {
  getItem: async (key: string) => {
    if (Platform.OS === 'web') {
      return Promise.resolve(localStorage.getItem(key));
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
};

export async function getKanbanDefaultBoard(
  userId: string | undefined | null,
): Promise<string | null> {
  if (!userId) return null;
  try {
    return await storage.getItem(`${STORAGE_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

export async function saveKanbanDefaultBoard(
  userId: string,
  departmentKey: string,
): Promise<void> {
  try {
    await storage.setItem(`${STORAGE_PREFIX}${userId}`, departmentKey);
  } catch {
    // ignore
  }
}

type DefaultBoardCandidate = {
  departmentKey: string;
  isOwnDepartment?: boolean;
};

/** Padrão implícito: quadro do setor. Só muda se o usuário salvar outro. */
export async function resolveKanbanDefaultBoard(
  userId: string | undefined | null,
  boards: DefaultBoardCandidate[],
): Promise<string | null> {
  if (!boards.length) return null;

  const saved = await getKanbanDefaultBoard(userId);
  if (saved && boards.some((b) => b.departmentKey === saved)) {
    return saved;
  }

  const ownDept = boards.find((b) => b.isOwnDepartment);
  return ownDept?.departmentKey ?? boards[0]?.departmentKey ?? null;
}
