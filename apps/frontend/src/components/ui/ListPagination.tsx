'use client';

import React from 'react';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';

const navButtonClass =
  'px-2.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors sm:px-3 sm:py-2 sm:text-sm';

function pageButtonClass(isActive: boolean) {
  return `min-w-[2.25rem] px-2.5 py-1.5 text-xs font-medium rounded-md sm:min-w-0 sm:px-3 sm:py-2 sm:text-sm ${
    isActive
      ? 'bg-red-600 text-white'
      : 'text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
  } transition-colors`;
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
};

export function ListPagination({
  currentPage,
  totalPages,
  onPageChange,
  className
}: ListPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={className ?? cadastroListClasses.pagination}>
      <button
        type="button"
        onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
        disabled={currentPage === 1}
        className={navButtonClass}
      >
        Anterior
      </button>
      {getVisiblePageNumbers(currentPage, totalPages).map((pageNumber) => (
        <button
          key={pageNumber}
          type="button"
          onClick={() => onPageChange(pageNumber)}
          className={pageButtonClass(pageNumber === currentPage)}
          aria-current={pageNumber === currentPage ? 'page' : undefined}
        >
          {pageNumber}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
        disabled={currentPage === totalPages}
        className={navButtonClass}
      >
        Próxima
      </button>
    </div>
  );
}
