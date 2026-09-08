'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { clsx } from 'clsx';
import type { Priority } from '@/lib/kanban';
import { KANBAN_PRIORITY_CONFIG, KANBAN_PRIORITY_ORDER } from './kanbanPriority';
import { KanbanPriorityBars } from './KanbanPriorityBars';

export interface KanbanPriorityPickerProps {
  value: Priority;
  onChange: (priority: Priority) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function KanbanPriorityPicker({
  value,
  onChange,
  disabled,
  className,
}: KanbanPriorityPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = KANBAN_PRIORITY_CONFIG[value];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  async function select(p: Priority) {
    setOpen(false);
    if (p !== value) await onChange(p);
  }

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600',
          'bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200',
          'hover:border-gray-300 dark:hover:border-gray-500 transition-colors',
          disabled && 'opacity-50 pointer-events-none',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Prioridade"
      >
        <KanbanPriorityBars priority={value} />
        <span className="font-medium whitespace-nowrap">{current.label}</span>
        <ChevronDown
          className={clsx('w-4 h-4 text-gray-400 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-1 z-[1100] min-w-[10.5rem] py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg"
        >
          {KANBAN_PRIORITY_ORDER.map((p) => {
            const cfg = KANBAN_PRIORITY_CONFIG[p];
            const selected = p === value;
            return (
              <li key={p} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => select(p)}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                    selected
                      ? 'bg-gray-50 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40',
                  )}
                >
                  <KanbanPriorityBars priority={p} />
                  <span className="flex-1 font-medium">{cfg.label}</span>
                  {selected && <Check className="w-4 h-4 text-red-600 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
