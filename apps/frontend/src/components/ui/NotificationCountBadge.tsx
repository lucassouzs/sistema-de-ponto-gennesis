'use client';

import React from 'react';

type NotificationCountBadgeProps = {
  count: number;
  className?: string;
  /** Badge sobre ícone do rail (igual ao chat) */
  rail?: boolean;
  /** Ao lado do título (sem empurrar para a direita) */
  inline?: boolean;
};

export function NotificationCountBadge({
  count,
  className = '',
  rail = false,
  inline = false,
}: NotificationCountBadgeProps) {
  if (count <= 0) return null;

  if (rail) {
    return (
      <span
        className={`pointer-events-none absolute -right-1 -top-1 z-[80] inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md bg-red-600 px-0.5 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white dark:ring-gray-900 ${className}`}
      >
        {count > 99 ? '99+' : count}
      </span>
    );
  }

  return (
    <span
      className={`${inline ? '' : 'ml-auto'} min-w-[18px] shrink-0 rounded-md border-2 border-transparent bg-red-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm inline-flex h-[18px] items-center justify-center ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
