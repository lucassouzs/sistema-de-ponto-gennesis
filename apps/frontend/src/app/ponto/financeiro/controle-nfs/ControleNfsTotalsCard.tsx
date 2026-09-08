'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { formatCurrencyTotal } from './controleNfsCurrency';
import type { ControleNfsCardMetricConfig } from './controleNfsCardMetrics';
import type { ControleNfsTotalsSummary } from './controleNfsTypes';

type ControleNfsTotalsCardProps = {
  metric: ControleNfsCardMetricConfig;
  summary: ControleNfsTotalsSummary | undefined;
  isLoading: boolean;
  disabled?: boolean;
  onOpenDetalhe: () => void;
};

export function ControleNfsTotalsCard({
  metric,
  summary,
  isLoading,
  disabled = false,
  onOpenDetalhe
}: ControleNfsTotalsCardProps) {
  const Icon = metric.icon;
  const total = summary ? metric.getTotal(summary) : 0;
  const tabCount = summary?.tabCount ?? 0;
  const tabsWithData = summary ? metric.getTabsWithData(summary) : 0;

  return (
    <Card className={`${metric.cardClassName} h-full`}>
      <button
        type="button"
        className="h-full w-full text-left disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onOpenDetalhe}
        disabled={disabled || isLoading}
        aria-label={`Ver detalhes de ${metric.title}`}
      >
        <CardContent className="p-3 sm:p-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className={`shrink-0 rounded-md p-2 ${metric.iconWrapClassName}`}>
              <Icon className={`h-4 w-4 ${metric.iconClassName}`} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-600 dark:text-gray-400">
                {metric.title}
              </p>
              {isLoading ? (
                <div className="mt-0.5 flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  <span className="text-xs">Calculando...</span>
                </div>
              ) : (
                <p className="mt-0.5 truncate text-base font-bold tabular-nums tracking-tight text-gray-900 sm:text-lg dark:text-gray-100">
                  {formatCurrencyTotal(total)}
                </p>
              )}
              <p className="mt-1 truncate text-[11px] leading-tight text-gray-500 dark:text-gray-400">
                {tabCount} contratos · {tabsWithData} com lançamentos
              </p>
              <p className={`mt-0.5 text-[11px] font-medium ${metric.hintClassName}`}>
                Ver detalhes
              </p>
            </div>
          </div>
        </CardContent>
      </button>
    </Card>
  );
}
