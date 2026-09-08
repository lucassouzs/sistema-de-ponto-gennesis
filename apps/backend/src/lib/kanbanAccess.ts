import { isGennecyBotUser } from './gennecyBotUser';
import { prisma } from './prisma';

/** Quadro demo antigo — não deve aparecer nem ser acessível. */
export const KANBAN_LEGACY_DEPARTMENT_KEY = 'LEGADO';

/**
 * Quadro compartilhado só para quem tem centro de custo UNB no cadastro.
 * Não é o setor do funcionário — chave fixa institucional.
 */
export const KANBAN_UNB_DEPARTMENT_KEY = 'UNB';
export const KANBAN_UNB_DEPARTMENT_LABEL = 'UNB';

/** Prefixo de departmentKey para quadros criados manualmente. */
export const KANBAN_CUSTOM_KEY_PREFIX = 'CUSTOM_';

export function isCustomKanbanBoardKey(key: string): boolean {
  return key.toUpperCase().startsWith(KANBAN_CUSTOM_KEY_PREFIX);
}

export function resolveKanbanBoardKeyParam(param: string): string {
  if (isCustomKanbanBoardKey(param)) return param;
  return param
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function isKanbanHiddenPickerUser(user: {
  name?: string | null;
  email?: string | null;
  employee?: { position?: string | null } | null;
}): boolean {
  if (isGennecyBotUser(user)) return true;
  return (user.employee?.position ?? '').trim().toLowerCase() === 'administrador';
}

export async function userIsAdministrator(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employee: { select: { position: true } } },
  });
  return (user?.employee?.position || '').toLowerCase() === 'administrador';
}
