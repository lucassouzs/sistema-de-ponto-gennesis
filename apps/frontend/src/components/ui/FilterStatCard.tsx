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
  subtitle?: string;
  size?: 'md' | 'sm';
  onClick?: () => void;
};

export function FilterStatCard({
  label,
  count,
  icon: Icon,
  iconBg,
  iconColor,
  isActive = false,
  loading = false,
  subtitle,
  size = 'md',
  onClick,
}: FilterStatCardProps) {
  const clickable = typeof onClick === 'function';
  const compact = size === 'sm';

  return (
    <Card
      className={clsx(
        clickable && 'cursor-pointer transition-colors',
        isActive && 'bg-gray-50 dark:bg-gray-800/80'
      )}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? isActive : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <CardContent className={compact ? 'p-3 sm:p-4' : 'p-4 sm:p-6'}>
        <div className="flex items-center">
          <div
            className={clsx(
              'flex-shrink-0 rounded-lg',
              compact ? 'p-2' : 'p-2 sm:p-3',
              iconBg
            )}
          >
            <Icon
              className={clsx(compact ? 'h-5 w-5' : 'h-5 w-5 sm:h-6 sm:w-6', iconColor)}
            />
          </div>
          <div className={clsx('min-w-0 flex-1', compact ? 'ml-3' : 'ml-3 sm:ml-4')}>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
              {label}
            </p>
            <p
              className={clsx(
                'mt-1 font-bold tabular-nums text-gray-900 dark:text-gray-100',
                compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'
              )}
            >
              {loading ? (
                <span
                  className="mt-1 inline-block h-6 w-12 animate-pulse rounded-md bg-gray-200/90 dark:bg-gray-700/70 sm:h-7"
                  aria-hidden
                />
              ) : (
                count
              )}
            </p>
            {subtitle ? (
              <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
