'use client';

import React from 'react';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { clsx } from 'clsx';

const navButtonClass =
  'inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-100 sm:px-3';

const iconNavButtonClass =
  'inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg border border-gray-200 bg-white px-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-100';

function pageButtonClass(isActive: boolean) {
  return clsx(
    'inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg px-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-red-600 text-white shadow-sm ring-1 ring-red-600/20'
      : 'border border-gray-200 bg-white text-gray-600 shadow-sm hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700'
  );
}

function getVisiblePageNumbers(currentPage: number, totalPages: number): number[] {
  const windowSize = Math.min(5, totalPages);
  return Array.from({ length: windowSize }, (_, i) => {
    if (totalPages <= 5) return i + 1;
    if (currentPage <= 3) return i + 1;
    if (currentPage >= totalPages - 2) return totalPages - 4 + i;
    return currentPage - 2 + i;
  });
}

type ListPaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Exibe botões de primeira/última página (padrão: true). */
  showEdges?: boolean;
};

export function ListPagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
  showEdges = true
}: ListPaginationProps) {
  if (totalPages <= 1) return null;

  const visible = getVisiblePageNumbers(currentPage, totalPages);
  const showLeftEllipsis = visible[0] > 1;
  const showRightEllipsis = visible[visible.length - 1] < totalPages;

  return (
    <nav
      className={clsx(
        className ?? cadastroListClasses.pagination,
        'flex flex-wrap items-center justify-center gap-1.5 sm:gap-2'
      )}
      aria-label="Paginação"
    >
      {showEdges ? (
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className={iconNavButtonClass}
          aria-label="Primeira página"
          title="Primeira página"
        >
          «
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
        disabled={currentPage === 1}
        className={navButtonClass}
        aria-label="Página anterior"
      >
        Anterior
      </button>

      {showLeftEllipsis ? (
        <>
          <button
            type="button"
            onClick={() => onPageChange(1)}
            className={pageButtonClass(false)}
            aria-label="Página 1"
          >
            1
          </button>
          <span className="px-1 text-sm text-gray-400 select-none" aria-hidden>
            …
          </span>
        </>
      ) : null}

      {visible.map((pageNumber) => (
        <button
          key={pageNumber}
          type="button"
          onClick={() => onPageChange(pageNumber)}
          className={pageButtonClass(pageNumber === currentPage)}
          aria-current={pageNumber === currentPage ? 'page' : undefined}
          aria-label={`Página ${pageNumber}`}
        >
          {pageNumber}
        </button>
      ))}

      {showRightEllipsis ? (
        <>
          <span className="px-1 text-sm text-gray-400 select-none" aria-hidden>
            …
          </span>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            className={pageButtonClass(false)}
            aria-label={`Página ${totalPages}`}
          >
            {totalPages}
          </button>
        </>
      ) : null}

      <button
        type="button"
        onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
        disabled={currentPage === totalPages}
        className={navButtonClass}
        aria-label="Próxima página"
      >
        Próxima
      </button>

      {showEdges ? (
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className={iconNavButtonClass}
          aria-label="Última página"
          title="Última página"
        >
          »
        </button>
      ) : null}
    </nav>
  );
}
