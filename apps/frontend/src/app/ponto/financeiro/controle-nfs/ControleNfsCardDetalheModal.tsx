'use client';

import React, { useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { formatCurrencyTotal } from './controleNfsCurrency';
import {
  findControleNfsCardMetric,
  type ControleNfsCardMetricKey
} from './controleNfsCardMetrics';
import type { ControleNfsTotalsSummary } from './controleNfsTypes';

type ControleNfsCardDetalheModalProps = {
  isOpen: boolean;
  onClose: () => void;
  metricKey: ControleNfsCardMetricKey | null;
  summary: ControleNfsTotalsSummary | undefined;
  onSelectContract?: (tabKey: string) => void;
};

type DetalheRow = {
  tabKey: string;
  label: string;
  value: number;
  share: number;
};

function buildDetalheRows(
  summary: ControleNfsTotalsSummary | undefined,
  metricKey: ControleNfsCardMetricKey | null
): DetalheRow[] {
  if (!summary || !metricKey) return [];

  const metric = findControleNfsCardMetric(metricKey);
  const total = metric.getTotal(summary);
  const rows = summary.byTab
    .map((tab) => ({
      tabKey: tab.tabKey,
      label: tab.label,
      value: metric.getTabValue(tab),
      share: total > 0 ? (metric.getTabValue(tab) / total) * 100 : 0
    }))
    .filter((row) => row.value !== 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'pt-BR'));

  return rows;
}

export function ControleNfsCardDetalheModal({
  isOpen,
  onClose,
  metricKey,
  summary,
  onSelectContract
}: ControleNfsCardDetalheModalProps) {
  const metric = metricKey ? findControleNfsCardMetric(metricKey) : null;
  const rows = useMemo(() => buildDetalheRows(summary, metricKey), [summary, metricKey]);
  const total = metric && summary ? metric.getTotal(summary) : 0;

  return (
    <Modal
      isOpen={isOpen && metricKey != null}
      onClose={onClose}
      title={metric ? `${metric.title} — detalhes por contrato` : 'Detalhes'}
      size="xl"
      closeOnOverlayClick
    >
      {metric && summary ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
            <p className="text-sm text-gray-600 dark:text-gray-400">{metric.subtitle}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {formatCurrencyTotal(total)}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {summary.tabCount} contrato(s) no filtro · {metric.getTabsWithData(summary)} com
              lançamentos
            </p>
          </div>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhum lançamento encontrado para esta métrica com os filtros atuais.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {rows.length} contrato(s) com valor nesta métrica.
                {onSelectContract ? ' Clique em um contrato para abrir a aba correspondente.' : null}
              </p>

              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="max-h-[min(420px,50vh)] overflow-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/90">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Contrato
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Valor
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          % do total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {rows.map((row) => (
                        <tr
                          key={row.tabKey}
                          className={
                            onSelectContract
                              ? 'cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40'
                              : undefined
                          }
                          onClick={
                            onSelectContract
                              ? () => {
                                  onSelectContract(row.tabKey);
                                  onClose();
                                }
                              : undefined
                          }
                        >
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                            {row.label}
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-900 dark:text-gray-100">
                            {formatCurrencyTotal(row.value)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-500 dark:text-gray-400">
                            {row.share.toLocaleString('pt-BR', {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1
                            })}
                            %
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-gray-50 dark:bg-gray-900/90">
                      <tr>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          Total
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                          {formatCurrencyTotal(total)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-gray-500 dark:text-gray-400">
                          100%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
