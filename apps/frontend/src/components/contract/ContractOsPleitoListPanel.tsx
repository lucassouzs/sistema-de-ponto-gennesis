'use client';

import React, { useMemo } from 'react';
import { formatOsSePastaOrDash } from '@/lib/formatOsSePasta';
import { pleitoStatusReadOnlySpanClass } from '@/lib/pleitoStatusStyles';
import { getOsEtiquetaAbertura, type BillingForOsCheck } from '@/lib/pleitoOsExport';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';

export type ContractOsPleitoRow = {
  id: string;
  divSe: string | null;
  folderNumber: string | null;
  serviceDescription: string;
  budget: string | null;
  budgetStatus: string | null;
  executionStatus: string | null;
  billingRequest?: number | null;
  endDate: string | null;
};

type ContractOsPleitoListPanelProps = {
  pleitos: ContractOsPleitoRow[];
  billings: BillingForOsCheck[];
  emptyMessage?: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function ContractOsPleitoListPanel({
  pleitos,
  billings,
  emptyMessage = 'Nenhuma ordem de serviço para exibir.',
}: ContractOsPleitoListPanelProps) {
  const rows = useMemo(() => pleitos, [pleitos]);

  if (rows.length === 0) {
    return <p className="py-6 text-center text-gray-500 dark:text-gray-400">{emptyMessage}</p>;
  }

  return (
    <div className="table-scroll rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className={`${cadastroListClasses.th} whitespace-nowrap`}>ID</th>
            <th className={cadastroListClasses.th}>Descrição</th>
            <th className={cadastroListClasses.thCenter}>Status Orçamento</th>
            <th className={cadastroListClasses.thCenter}>Status Execução</th>
            <th className={cadastroListClasses.thNumeric}>Orçamento</th>
            <th className={cadastroListClasses.thNumeric}>Valor pleiteado</th>
            <th className={cadastroListClasses.thCenter}>Fat. (%)</th>
            <th className={cadastroListClasses.thCenter}>Etiqueta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {rows.map((p) => {
            const osSe = (p.divSe || '').trim();
            const acumulado = billings
              .filter((b) => (b.serviceOrder || '').trim() === osSe)
              .reduce((sum, b) => sum + b.grossValue, 0);
            const orcamentoPleito = p.budget ? Number(p.budget) : 0;
            const statusFaturamentoPct =
              orcamentoPleito > 0 ? (acumulado / orcamentoPleito) * 100 : null;
            const osEtiqueta = getOsEtiquetaAbertura(p, billings);
            const valorPleiteado = p.billingRequest != null ? Number(p.billingRequest) : 0;
            return (
              <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <td className={`${cadastroListClasses.tdMono} align-middle`}>
                  {formatOsSePastaOrDash(p.divSe, p.folderNumber)}
                </td>
                <td className={`${cadastroListClasses.tdTruncate} align-middle`} title={p.serviceDescription}>
                  <span className="block truncate">{p.serviceDescription || '—'}</span>
                </td>
                <td className={`${cadastroListClasses.tdCenter} align-middle`}>
                  <span className={pleitoStatusReadOnlySpanClass('budget', p.budgetStatus)}>
                    {p.budgetStatus || '—'}
                  </span>
                </td>
                <td className={`${cadastroListClasses.tdCenter} align-middle`}>
                  <span className={pleitoStatusReadOnlySpanClass('execution', p.executionStatus)}>
                    {p.executionStatus || '—'}
                  </span>
                </td>
                <td className={`${cadastroListClasses.tdNumeric} align-middle`}>
                  {p.budget ? formatCurrency(Number(p.budget)) : '—'}
                </td>
                <td className={`${cadastroListClasses.tdNumeric} align-middle`}>
                  {valorPleiteado > 0 ? formatCurrency(valorPleiteado) : '—'}
                </td>
                <td className={`${cadastroListClasses.tdCenter} align-middle`}>
                  {statusFaturamentoPct != null ? `${statusFaturamentoPct.toFixed(1)}%` : '—'}
                </td>
                <td className={`${cadastroListClasses.tdCenter} align-middle whitespace-nowrap`}>
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                    {osEtiqueta}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
        {rows.length} ordem(ns) de serviço
      </p>
    </div>
  );
}
