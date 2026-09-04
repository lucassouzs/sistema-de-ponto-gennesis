import type { QueryClient } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { fetchKanbanBoards, type KanbanBoardSummary } from '../services/kanban';
import { resolveKanbanDefaultBoard } from './kanbanDefaultBoard';

type Nav = {
  navigate: NativeStackNavigationProp<RootStackParamList>['navigate'];
  getParent?: () => Nav | undefined;
  getState?: () => { routeNames?: string[] };
};

function navigateRoot(navigation: Nav, name: keyof RootStackParamList, params?: object) {
  let nav: Nav | undefined = navigation;
  for (let i = 0; i < 6; i++) {
    const names = nav?.getState?.()?.routeNames;
    if (names?.includes(name)) {
      (nav as any).navigate(name, params);
      return;
    }
    nav = nav?.getParent?.();
    if (!nav) break;
  }
  (navigation as any).navigate(name, params);
}

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

/** Abre o quadro favorito. Navega na hora; resolve o quadro na própria tela se precisar. */
export async function openFavoriteKanbanBoard(
  navigation: Nav,
  userId: string | undefined | null,
  queryClient?: QueryClient,
): Promise<void> {
  const cached = queryClient?.getQueryData<KanbanBoardSummary[]>(['kanban-boards']);
  if (cached?.length) {
    try {
      const key = await resolveKanbanDefaultBoard(userId, cached);
      const title = cached.find((b) => b.departmentKey === key)?.department;
      navigateRoot(navigation, 'KanbanBoard', {
        departmentKey: key ?? undefined,
        title: title || undefined,
      });
      return;
    } catch {
      // cai no fallback
    }
  }

  // Não espera a API: abre já e o KanbanBoard resolve o quadro padrão.
  navigateRoot(navigation, 'KanbanBoard', {});

  if (queryClient) {
    void queryClient.prefetchQuery({
      queryKey: ['kanban-boards'],
      queryFn: fetchKanbanBoards,
      staleTime: 3 * 60 * 1000,
    });
  }
}
