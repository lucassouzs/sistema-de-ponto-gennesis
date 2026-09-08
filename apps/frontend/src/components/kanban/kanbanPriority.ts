import type { Priority } from '@/lib/kanban';

export const KANBAN_PRIORITY_CONFIG: Record<
  Priority,
  { label: string; bars: number; barColor: string }
> = {
  low: { label: 'Baixa', bars: 1, barColor: 'bg-emerald-500' },
  medium: { label: 'Média', bars: 2, barColor: 'bg-amber-500' },
  high: { label: 'Alta', bars: 3, barColor: 'bg-orange-500' },
  critical: { label: 'Urgente', bars: 4, barColor: 'bg-red-500' },
};

export const KANBAN_PRIORITY_ORDER: Priority[] = ['low', 'medium', 'high', 'critical'];
