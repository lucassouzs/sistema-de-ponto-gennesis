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

/** Espelha `FilterStatCard`: Card (padding md) + Content `p-4 sm:p-6`. */
function StatCards({ count }: { count: number }) {
  return (
    <div
      className={clsx(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6',
        count >= 4 ? '2xl:grid-cols-4' : 'lg:grid-cols-3'
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center">
              {/* Mesmo envelope do ícone em FilterStatCard: p-2/p-3 + ícone 20/24px */}
              <SkeletonBone className="h-9 w-9 shrink-0 rounded-lg sm:h-12 sm:w-12" />
              <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                <SkeletonBone className="h-3.5 w-24 sm:h-4 sm:w-28" />
                <SkeletonBone className="mt-1 h-6 w-12 sm:h-7 sm:w-14" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Linhas de tabela. Sem padding horizontal extra: o Card pai já aplica
 * `p-4 sm:p-6` (igual às listas reais com `td` em `px-3`).
 */
function TableRows({ rows }: { rows: number }) {
  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-3 px-3 py-3">
          <SkeletonBone className="h-4 w-8 shrink-0" />
          <SkeletonBone className="h-4 min-w-0 flex-1" />
          <SkeletonBone className="hidden h-4 w-24 sm:block" />
          <SkeletonBone className="hidden h-4 w-20 md:block" />
          <SkeletonBone className="hidden h-4 w-28 lg:block" />
          <SkeletonBone className="h-8 w-8 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** Espelha o card de lista (header + content) das páginas de solicitações. */
function ListCard({ rows, withToolbar = true }: { rows: number; withToolbar?: boolean }) {
  return (
    <Card className="w-full">
      {withToolbar ? (
        <CardHeader className="border-b-0 pb-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-3">
              <SkeletonBone className="h-9 w-9 shrink-0 rounded-lg sm:h-12 sm:w-12" />
              <div className="min-w-0 space-y-2">
                <SkeletonBone className="h-5 w-40 sm:w-48" />
                <SkeletonBone className="h-3.5 w-56 max-w-full sm:w-64" />
              </div>
            </div>
            <div className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <SkeletonBone className="h-10 min-w-0 flex-1 basis-full rounded-lg sm:w-[280px] sm:flex-none sm:basis-auto" />
              <SkeletonBone className="h-10 w-10 shrink-0 rounded-lg" />
            </div>
          </div>
        </CardHeader>
      ) : null}
      <CardContent className={withToolbar ? undefined : 'pt-0'}>
        <div className="mb-2">
          <SkeletonBone className="h-4 w-56 max-w-full" />
        </div>
        <div className="table-scroll">
          <TableRows rows={rows} />
        </div>
      </CardContent>
    </Card>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <SkeletonBone className="mx-auto h-8 w-56 sm:h-9 sm:w-72" />
        <SkeletonBone className="mx-auto mt-2 h-4 w-72 max-w-[90%]" />
      </div>
      <Card>
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
      <div className="text-center">
        <SkeletonBone className="mx-auto h-8 w-52 sm:h-9 sm:w-72" />
        <SkeletonBone className="mx-auto mt-2 h-4 w-72 max-w-[90%] sm:w-96" />
      </div>
      <StatCards count={cards} />
      <ListCard rows={rows} />
      <span className="sr-only">{label}</span>
    </div>
  );
}
