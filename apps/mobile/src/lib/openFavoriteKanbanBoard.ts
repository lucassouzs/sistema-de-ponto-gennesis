import type { QueryClient } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { fetchKanbanBoards, type KanbanBoardSummary } from '../services/kanban';
import { resolveKanbanDefaultBoard } from './kanbanDefaultBoard';

type Nav = NativeStackNavigationProp<RootStackParamList>;

async function loadBoards(queryClient?: QueryClient): Promise<KanbanBoardSummary[]> {
  if (queryClient) {
    return queryClient.fetchQuery({
      queryKey: ['kanban-boards'],
      queryFn: fetchKanbanBoards,
      staleTime: 3 * 60 * 1000,
    });
  }
  return fetchKanbanBoards();
}

/** Abre direto o quadro favorito (estrelinha), sem passar pela lista. */
export async function openFavoriteKanbanBoard(
  navigation: Nav,
  userId: string | undefined | null,
  queryClient?: QueryClient,
): Promise<void> {
  try {
    const boards = await loadBoards(queryClient);
    const key = await resolveKanbanDefaultBoard(userId, boards);
    const title = boards.find((b) => b.departmentKey === key)?.department;
    navigation.navigate('KanbanBoard', {
      departmentKey: key ?? undefined,
      title: title || undefined,
    });
  } catch {
    navigation.navigate('KanbanBoard', {});
  }
}
