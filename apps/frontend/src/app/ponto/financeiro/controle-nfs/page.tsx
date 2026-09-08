'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import api from '@/lib/api';
import { ControleNfsTabNav } from './ControleNfsTabNav';
import { ControleNfsTable } from './ControleNfsTable';
import { ControleNfsCardsFilterPanel } from './ControleNfsCardsFilterPanel';
import { ControleNfsCardDetalheModal } from './ControleNfsCardDetalheModal';
import { ControleNfsTotalsCard } from './ControleNfsTotalsCard';
import { CONTROLE_NFS_CARD_METRICS, type ControleNfsCardMetricKey } from './controleNfsCardMetrics';
import { CONTROLE_NFS_TABS } from './controleNfsTabs';
import {
  buildControleNfsTotalsQueryParams,
  createDefaultControleNfsCardsFilter
} from './controleNfsCardsFilter';
import {
  CONTROLE_NFS_SPREADSHEET_URL,
  type ControleNfsCardsFilterState,
  type ControleNfsSheetData,
  type ControleNfsTotalsSummary
} from './controleNfsTypes';

function ControleNfsPageContent() {
  const [activeTab, setActiveTab] = useState(CONTROLE_NFS_TABS[0]?.key ?? 'bbgo');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredCount, setFilteredCount] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [cardsFilter, setCardsFilter] = useState<ControleNfsCardsFilterState>(
    createDefaultControleNfsCardsFilter
  );
  const [cardDetalheMetric, setCardDetalheMetric] = useState<ControleNfsCardMetricKey | null>(
    null
  );

  useEffect(() => {
    setSearchQuery('');
    setFilteredCount(0);
  }, [activeTab]);

  const activeTabMeta = useMemo(
    () => CONTROLE_NFS_TABS.find((tab) => tab.key === activeTab),
    [activeTab]
  );

  const sheetName = activeTabMeta?.sheetName ?? '';

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['controle-nfs', sheetName, refreshNonce],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: ControleNfsSheetData }>(
        '/controle-nfs/sheet-data',
        {
          params: {
            sheetName,
            ...(refreshNonce > 0 ? { refresh: 1 } : {})
          }
        }
      );
      return response.data.data;
    },
    enabled: Boolean(sheetName),
    staleTime: 5 * 60 * 1000
  });

  const {
    data: totalsSummary,
    isLoading: isTotalsLoading,
    isFetching: isTotalsFetching
  } = useQuery({
    queryKey: ['controle-nfs', 'totals-summary', cardsFilter, refreshNonce],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: ControleNfsTotalsSummary }>(
        '/controle-nfs/summary/totals',
        {
          params: buildControleNfsTotalsQueryParams(cardsFilter, refreshNonce > 0)
        }
      );
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000
  });

  const cardTotals = totalsSummary;
  const cardsDisabled = cardsFilter.tabKeys.length === 0;

  const handleRefresh = () => {
    setRefreshNonce((value) => value + 1);
  };

  const isRefreshing = isFetching || isTotalsFetching;

  const fetchedAtLabel = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : null;

  const displayRowCount = data ? filteredCount : 0;

  return (
    <MainLayout userRole="EMPLOYEE" userName="">
      <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30">
                <FileSpreadsheet className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Controle de NF&apos;s
                </h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Dados integrados da planilha Relatório de Custos, por contrato e aba.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={CONTROLE_NFS_SPREADSHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Abrir planilha
            </a>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              Atualizar
            </button>
          </div>
        </div>

        <ControleNfsCardsFilterPanel
          filter={cardsFilter}
          onFilterChange={setCardsFilter}
        />

        {cardsFilter.tabKeys.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            Selecione ao menos um contrato no filtro dos cards para exibir os totais.
          </p>
        ) : null}

        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONTROLE_NFS_CARD_METRICS.map((metric) => (
            <ControleNfsTotalsCard
              key={metric.key}
              metric={metric}
              summary={cardTotals}
              isLoading={isTotalsLoading}
              disabled={cardsDisabled}
              onOpenDetalhe={() => setCardDetalheMetric(metric.key)}
            />
          ))}
        </div>

        <ControleNfsCardDetalheModal
          isOpen={cardDetalheMetric != null}
          onClose={() => setCardDetalheMetric(null)}
          metricKey={cardDetalheMetric}
          summary={cardTotals}
          onSelectContract={setActiveTab}
        />

        {totalsSummary?.fetchedAt ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Totais consolidados em{' '}
            {new Date(totalsSummary.fetchedAt).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        ) : null}

        <ControleNfsTabNav
          tabs={CONTROLE_NFS_TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar na aba atual..."
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none ring-red-500 focus:ring-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isLoading
                  ? 'Carregando...'
                  : `${displayRowCount.toLocaleString('pt-BR')} de ${(data?.rowCount ?? 0).toLocaleString('pt-BR')} linhas`}
                {fetchedAtLabel ? ` · Atualizado em ${fetchedAtLabel}` : null}
              </p>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                Carregando dados da planilha...
              </div>
            ) : isError ? (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="font-medium text-red-800 dark:text-red-300">
                    Erro ao carregar a aba selecionada
                  </p>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                    {(error as Error)?.message || 'Tente novamente em instantes.'}
                  </p>
                </div>
              </div>
            ) : data && data.headers.length > 0 ? (
              <ControleNfsTable
                key={sheetName}
                headers={data.headers}
                rows={data.rows}
                searchQuery={searchQuery}
                onFilteredCountChange={setFilteredCount}
              />
            ) : (
              <div className="py-12 text-center text-gray-500 dark:text-gray-400">
                A aba selecionada não possui dados para exibir.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

export default function ControleNfsPage() {
  return (
    <ProtectedRoute route="/ponto/financeiro/controle-nfs">
      <ControleNfsPageContent />
    </ProtectedRoute>
  );
}
