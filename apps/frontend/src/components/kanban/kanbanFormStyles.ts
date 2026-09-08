/** Classes alinhadas aos formulários do sistema (ex.: materiais, contratos). */
export const kanbanLabel =
  'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2';

/** Sem anel de foco — evita borda vermelha/azul “bugada” nos campos da modal. */
export const kanbanFieldFocus =
  'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0';

export const kanbanInput =
  `w-full min-w-0 box-border px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 ${kanbanFieldFocus}`;

/** Campo numérico sem setas do navegador. */
export const kanbanInputNumber =
  `${kanbanInput} [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;

export const kanbanTextarea = `${kanbanInput} resize-none min-h-[88px]`;

export const kanbanSelect = kanbanInput;

/** Rótulos em português para colunas padrão do quadro. */
export function kanbanColumnStatus(columnTitle: string): { label: string; badgeClass: string } {
  const map: Record<string, { label: string; badgeClass: string }> = {
    Completed: { label: 'Concluído', badgeClass: 'bg-[#5c7a52] text-white' },
    Active: { label: 'Em andamento', badgeClass: 'bg-teal-600 text-white' },
    Planned: { label: 'Planejado', badgeClass: 'bg-gray-500 dark:bg-gray-600 text-white' },
  };
  return (
    map[columnTitle] ?? {
      label: columnTitle,
      badgeClass: 'bg-gray-500 dark:bg-gray-600 text-white',
    }
  );
}

export function kanbanColumnLabel(title: string): string {
  const labels: Record<string, string> = {
    Planned: 'Planejado',
    Active: 'Em andamento',
    Completed: 'Concluído',
  };
  return labels[title] ?? title;
}

import { KANBAN_PRIORITY_CONFIG, KANBAN_PRIORITY_ORDER } from './kanbanPriority';

export const PRIORITY_OPTIONS = KANBAN_PRIORITY_ORDER.map((value) => ({
  value,
  label: KANBAN_PRIORITY_CONFIG[value].label,
}));
