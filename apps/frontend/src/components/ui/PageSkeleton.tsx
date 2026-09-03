import React from 'react';
import { clsx } from 'clsx';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';

const boneClass = 'animate-pulse rounded-md bg-gray-200/90 dark:bg-gray-700/70';

export function SkeletonBone({ className }: { className?: string }) {
  return <div className={clsx(boneClass, className)} aria-hidden />;
}

export type PageSkeletonVariant = 'page' | 'list' | 'form' | 'compact';

type PageSkeletonProps = {
  variant?: PageSkeletonVariant;
  /** Linhas da tabela (list/page). */
  rows?: number;
  /** Cards de resumo no topo (page). */
  cards?: number;
  className?: string;
  label?: string;
};

function StatCards({ count }: { count: number }) {
  return (
    <div
      className={clsx(
        'grid grid-cols-2 gap-3 sm:gap-4',
        count >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} padding="none">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <SkeletonBone className="h-11 w-11 shrink-0 rounded-lg sm:h-12 sm:w-12" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <SkeletonBone className="h-3.5 w-20" />
                <SkeletonBone className="h-7 w-16" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TableRows({ rows }: { rows: number }) {
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex items-center gap-3 px-3 py-3.5 sm:gap-4 sm:px-6"
        >
          <SkeletonBone className="h-4 w-10 shrink-0" />
          <SkeletonBone className="h-4 min-w-0 flex-1" />
          <SkeletonBone className="hidden h-4 w-24 sm:block" />
          <SkeletonBone className="hidden h-4 w-20 md:block" />
          <SkeletonBone className="hidden h-4 w-16 lg:block" />
          <SkeletonBone className="h-8 w-8 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function ListCard({ rows, withToolbar = true }: { rows: number; withToolbar?: boolean }) {
  return (
    <Card padding="none" className="overflow-hidden">
      {withToolbar ? (
        <CardHeader className="!border-b-0 pb-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <SkeletonBone className="h-10 w-10 shrink-0 rounded-lg sm:h-12 sm:w-12" />
              <div className="space-y-2">
                <SkeletonBone className="h-5 w-36" />
                <SkeletonBone className="h-3.5 w-28" />
              </div>
            </div>
            <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
              <SkeletonBone className="h-10 min-w-0 flex-1 sm:w-72 sm:flex-none" />
              <SkeletonBone className="h-10 w-10 shrink-0 rounded-lg" />
            </div>
          </div>
        </CardHeader>
      ) : null}
      <CardContent className={clsx('px-0 pb-0', withToolbar ? 'pt-2' : 'pt-0')}>
        <div className="px-3 sm:px-6">
          <SkeletonBone className="mb-3 h-4 w-48" />
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700/80">
          <TableRows rows={rows} />
        </div>
        <div className="flex items-center justify-center gap-2 border-t border-gray-100 px-4 py-4 dark:border-gray-700/80 sm:px-6">
          <SkeletonBone className="h-9 w-20 rounded-lg" />
          <SkeletonBone className="h-9 w-20 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-2">
        <SkeletonBone className="h-8 w-56 sm:w-72" />
        <SkeletonBone className="h-4 w-72 max-w-full" />
      </div>
      <Card padding="none">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="space-y-2">
                <SkeletonBone className="h-3.5 w-24" />
                <SkeletonBone className="h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <SkeletonBone className="h-3.5 w-28" />
            <SkeletonBone className="h-24 w-full rounded-lg" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <SkeletonBone className="h-10 w-24 rounded-lg" />
            <SkeletonBone className="h-10 w-36 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function PageSkeleton({
  variant = 'page',
  rows = 8,
  cards = 4,
  className,
  label = 'Carregando página',
}: PageSkeletonProps) {
  if (variant === 'compact') {
    return (
      <div
        className={clsx('flex flex-col items-center justify-center gap-3 py-10', className)}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={label}
      >
        <SkeletonBone className="h-4 w-40" />
        <SkeletonBone className="h-4 w-56" />
        <SkeletonBone className="h-4 w-32" />
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (variant === 'form') {
    return (
      <div className={className} role="status" aria-live="polite" aria-busy="true" aria-label={label}>
        <FormSkeleton />
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div className={className} role="status" aria-live="polite" aria-busy="true" aria-label={label}>
        <TableRows rows={rows} />
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  return (
    <div
      className={clsx('w-full space-y-6', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-2.5 pt-1">
        <SkeletonBone className="h-8 w-52 sm:h-9 sm:w-72" />
        <SkeletonBone className="h-4 w-72 max-w-[90%] sm:w-96" />
      </div>
      <StatCards count={cards} />
      <ListCard rows={rows} />
      <span className="sr-only">{label}</span>
    </div>
  );
}
