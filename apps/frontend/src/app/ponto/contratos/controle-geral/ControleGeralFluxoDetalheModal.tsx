'use client';

import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { QueryGastosDetailRow } from './buildQueryGastosRows';
import type { NfsContractTotals } from './buildFaturamentoByContractLookup';
import type { RecebidoMensalByGastosContractEntry } from './recebidoMensalTypes';
import { ControleGeralGastosFluxoCharts } from './ControleGeralGastosFluxoCharts';
import { summarizeControleGeralGastosFluxo, type ControleGeralFluxoRowSnapshot } from './controleGeralGastosFluxo';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function FluxoStatCards({
  totalSaida,
  totalEntrada,
  totalValor
}: {
  totalSaida: number;
  totalEntrada: number;
  totalValor: number;
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/30">
      <div className="grid grid-cols-1 divide-y divide-gray-200 dark:divide-gray-700 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="min-w-0 px-4 py-3.5 sm:px-5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Gastos</p>
          <p className="mt-1 truncate text-base font-semibold tabular-nums text-red-600 sm:text-lg dark:text-red-400">
            {formatCurrency(totalSaida)}
          </p>
        </div>
        <div className="min-w-0 px-4 py-3.5 sm:px-5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Recebido</p>
          <p className="mt-1 truncate text-base font-semibold tabular-nums text-green-600 sm:text-lg dark:text-green-400">
            {formatCurrency(totalEntrada)}
          </p>
        </div>
        <div className="min-w-0 px-4 py-3.5 sm:px-5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Lucro líquido</p>
          <p
            className={`mt-1 truncate text-base font-semibold tabular-nums sm:text-lg ${
              totalValor >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatCurrency(totalValor)}
          </p>
        </div>
      </div>
    </div>
  );
}

type ControleGeralFluxoDetalheModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  contractName: string | null;
  rows: QueryGastosDetailRow[];
  recebidoMensal?: RecebidoMensalByGastosContractEntry[];
  nfsTotals?: NfsContractTotals;
  /** Totais da linha selecionada na tabela (prioridade sobre recálculo da série). */
  rowSnapshot?: ControleGeralFluxoRowSnapshot;
  titleSuffix?: string;
  loadingRecebido?: boolean;
};

export function ControleGeralFluxoDetalheModal({
  isOpen,
  onClose,
  title,
  rows,
  recebidoMensal = [],
  nfsTotals,
  rowSnapshot,
  titleSuffix,
  loadingRecebido = false
}: ControleGeralFluxoDetalheModalProps) {
  const fluxoInput = useMemo(
    () => ({ gastosRows: rows, recebidoMensal }),
    [rows, recebidoMensal]
  );

  const stats = useMemo(
    () => summarizeControleGeralGastosFluxo(fluxoInput, nfsTotals, rowSnapshot),
    [fluxoInput, nfsTotals, rowSnapshot]
  );

  const gastosMonthCount = useMemo(() => {
    const keys = new Set<string>();
    for (const row of rows) {
      keys.add(`${row.year}-${String(row.month).padStart(2, '0')}`);
    }
    return keys.size;
  }, [rows]);

  if (!isOpen) return null;

  const hasData = rows.length > 0 || recebidoMensal.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl" closeOnOverlayClick>
      <FluxoStatCards
        totalSaida={stats.totalSaida}
        totalEntrada={stats.totalEntrada}
        totalValor={stats.totalValor}
      />

      {loadingRecebido ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando recebidos das NF&apos;s...
        </div>
      ) : !hasData ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Nenhum dado encontrado para este contrato e filtros selecionados.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            {gastosMonthCount} mês(es) de apuração com gastos · {recebidoMensal.length} mês(es) com
            recebimentos na coluna Recebido das NF&apos;s.
          </p>
          <ControleGeralGastosFluxoCharts input={fluxoInput} titleSuffix={titleSuffix} />
        </>
      )}
    </Modal>
  );
}
