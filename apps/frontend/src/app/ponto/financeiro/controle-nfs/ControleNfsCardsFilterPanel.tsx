'use client';

import React, { useState } from 'react';
import { Filter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { ControleNfsFiltrosModal } from './ControleNfsFiltrosModal';
import {
  cardsFilterSummaryLabel,
  hasActiveControleNfsCardsFilter
} from './controleNfsCardsFilter';
import type { ControleNfsCardsFilterState } from './controleNfsTypes';

type ControleNfsCardsFilterPanelProps = {
  filter: ControleNfsCardsFilterState;
  onFilterChange: (filter: ControleNfsCardsFilterState) => void;
  disabled?: boolean;
};

export function ControleNfsCardsFilterPanel({
  filter,
  onFilterChange,
  disabled = false
}: ControleNfsCardsFilterPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const filterIsActive = hasActiveControleNfsCardsFilter(filter);

  const handleApply = (draft: ControleNfsCardsFilterState) => {
    onFilterChange(draft);
    setModalOpen(false);
  };

  return (
    <>
      <Card className="border-gray-200 dark:border-gray-700">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Filtro dos cards
              </p>
              <p className="mt-0.5 truncate text-sm text-gray-600 dark:text-gray-400">
                {cardsFilterSummaryLabel(filter)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={disabled}
              className={`relative inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                filterIsActive
                  ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}
              aria-label="Abrir filtros dos cards"
            >
              <Filter className="h-4 w-4" aria-hidden />
              Filtros
              {filterIsActive ? (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
              ) : null}
            </button>
          </div>
        </CardContent>
      </Card>

      <ControleNfsFiltrosModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onApply={handleApply}
        applied={filter}
        disabled={disabled}
      />
    </>
  );
}
