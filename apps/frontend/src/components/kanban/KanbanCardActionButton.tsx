'use client';

import React from 'react';
import { clsx } from 'clsx';

interface KanbanCardActionButtonProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
}

export function KanbanCardActionButton({
  icon,
  children,
  onClick,
  active,
  disabled,
  className,
  title,
}: KanbanCardActionButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
        className,
        disabled && 'opacity-50 cursor-not-allowed',
        active
          ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/80',
      )}
    >
      {icon ? (
        <span
          className={clsx(
            active ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400',
          )}
        >
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}
