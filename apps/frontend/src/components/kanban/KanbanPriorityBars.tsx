'use client';

import { clsx } from 'clsx';
import type { Priority } from '@/lib/kanban';
import { KANBAN_PRIORITY_CONFIG } from './kanbanPriority';

export function KanbanPriorityBars({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  const { bars: activeBars, barColor } = KANBAN_PRIORITY_CONFIG[priority];

  return (
    <div className={clsx('flex items-end gap-0.5 h-3.5 shrink-0', className)} aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={clsx(
            'w-[3px] rounded-sm',
            i <= activeBars ? barColor : 'bg-gray-300 dark:bg-gray-600',
          )}
          style={{ height: `${6 + i * 2}px` }}
        />
      ))}
    </div>
  );
}
