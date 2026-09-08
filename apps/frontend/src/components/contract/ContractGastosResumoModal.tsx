'use client';

import React, { useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import {
  groupGastosNaturezaModalRows,
  type GastosNaturezaAggRow
} from '@/app/ponto/contratos/controle-geral/buildQueryGastosRows';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(value));
}

function signedValueClassName(value: number): string {
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-600 dark:text-gray-400';
}

type ContractGastosResumoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  naturezaRows: readonly GastosNaturezaAggRow[];
};

export function ContractGastosResumoModal({
  isOpen,
  onClose,
  title,
  naturezaRows
}: ContractGastosResumoModalProps) {
  const grouped = useMemo(() => groupGastosNaturezaModalRows(naturezaRows), [naturezaRows]);

  const total = useMemo(
    () => naturezaRows.reduce((sum, row) => sum + row.total, 0),
    [naturezaRows]
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg" scrollContent={false}>
      {naturezaRows.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Nenhum gasto encontrado para este período.
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
          <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Categoria
                </th>
                <th className="min-w-[10.5rem] shrink-0 px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              {grouped.dfcTrees.map((dfcTree) => (
                <React.Fragment key={dfcTree.rootKey}>
                  <tr className="bg-gray-50 font-medium dark:bg-gray-800/50">
                    <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100">
                      {dfcTree.rootLabel}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right text-sm tabular-nums font-semibold whitespace-nowrap ${signedValueClassName(dfcTree.rootSubtotal)}`}
                    >
                      {formatCurrency(dfcTree.rootSubtotal)}
                    </td>
                  </tr>
                  {dfcTree.branches.map((branch) => (
                    <React.Fragment key={`${dfcTree.rootKey}:${branch.branchKey}`}>
                      {branch.label !== dfcTree.rootLabel ? (
                        <tr className="bg-gray-50/80 dark:bg-gray-800/40">
                          <td
                            className="px-4 py-2 text-sm font-medium text-gray-800 dark:text-gray-200"
                            style={{ paddingLeft: 32 }}
                          >
                            {branch.label}
                          </td>
                          <td
                            className={`px-4 py-2 text-right text-sm tabular-nums font-semibold whitespace-nowrap ${signedValueClassName(branch.subtotal)}`}
                          >
                            {formatCurrency(branch.subtotal)}
                          </td>
                        </tr>
                      ) : null}
                      {branch.leafGroups.map((group) => (
                        <tr key={group.leafBlockId} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/30">
                          <td
                            className="px-4 py-2 text-sm text-gray-800 dark:text-gray-200"
                            style={{ paddingLeft: branch.label !== dfcTree.rootLabel ? 48 : 32 }}
                          >
                            {group.leafLabel}
                          </td>
                          <td
                            className={`px-4 py-2 text-right text-sm tabular-nums font-medium whitespace-nowrap ${signedValueClassName(group.subtotal)}`}
                          >
                            {formatCurrency(group.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
              {grouped.ungrouped.map((row) => (
                <tr key={row.natureza} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-sm text-gray-800 dark:text-gray-200">{row.natureza}</td>
                  <td
                    className={`px-4 py-2 text-right text-sm tabular-nums font-medium whitespace-nowrap ${signedValueClassName(row.total)}`}
                  >
                    {formatCurrency(row.total)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold dark:border-gray-600 dark:bg-gray-800/70">
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">Total</td>
                <td
                  className={`px-4 py-3 text-right text-sm tabular-nums whitespace-nowrap ${signedValueClassName(total)}`}
                >
                  {formatCurrency(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
