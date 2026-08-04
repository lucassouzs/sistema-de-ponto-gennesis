'use client';

import React from 'react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

export type AgendaSurfaceMode = 'planner' | 'tasks';

export function AgendaModeSwitcher({
  mode,
  onChange,
}: {
  mode: AgendaSurfaceMode;
  onChange: (next: AgendaSurfaceMode) => void;
}) {
  return (
    <SegmentedControl
      value={mode}
      onChange={onChange}
      aria-label="Alternar Agenda e Tarefas"
      options={[
        {
          value: 'planner',
          title: 'Agenda',
          ariaLabel: 'Agenda',
          label: (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
                <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
              </svg>
              Agenda
            </>
          ),
        },
        {
          value: 'tasks',
          title: 'Tarefas',
          ariaLabel: 'Tarefas',
          label: (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              Tarefas
            </>
          ),
        },
      ]}
    />
  );
}
