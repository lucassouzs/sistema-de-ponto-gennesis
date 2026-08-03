'use client';

import React from 'react';

export type AgendaSurfaceMode = 'planner' | 'tasks';

export function AgendaModeSwitcher({
  mode,
  onChange,
}: {
  mode: AgendaSurfaceMode;
  onChange: (next: AgendaSurfaceMode) => void;
}) {
  const itemClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
      active
        ? 'bg-white font-medium text-red-600 shadow-sm dark:bg-gray-600 dark:text-red-400'
        : 'font-normal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
    }`;

  return (
    <div
      className="inline-flex shrink-0 items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
      role="group"
      aria-label="Alternar Agenda e Tarefas"
    >
      <button
        type="button"
        onClick={() => onChange('planner')}
        title="Agenda"
        aria-label="Agenda"
        aria-pressed={mode === 'planner'}
        className={itemClass(mode === 'planner')}
      >
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
      </button>
      <button
        type="button"
        onClick={() => onChange('tasks')}
        title="Tarefas"
        aria-label="Tarefas"
        aria-pressed={mode === 'tasks'}
        className={itemClass(mode === 'tasks')}
      >
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
      </button>
    </div>
  );
}
