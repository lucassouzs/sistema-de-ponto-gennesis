'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { Card, CardContent } from '@/components/ui/Card';

type FilterStatCardProps = {
  label: string;
  count: number | string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  isActive?: boolean;
  loading?: boolean;
  onClick: () => void;
};

export function FilterStatCard({
  label,
  count,
  icon: Icon,
  iconBg,
  iconColor,
  isActive = false,
  loading = false,
  onClick,
}: FilterStatCardProps) {
  return (
    <Card
      className={clsx(
        'cursor-pointer transition-shadow hover:shadow-md',
        isActive && 'bg-gray-50 shadow-md dark:bg-gray-800/80'
      )}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center">
          <div className={clsx('flex-shrink-0 rounded-lg p-2 sm:p-3', iconBg)}>
            <Icon className={clsx('h-5 w-5 sm:h-6 sm:w-6', iconColor)} />
          </div>
          <div className="ml-3 min-w-0 flex-1 sm:ml-4">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">
              {loading ? '—' : count}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
