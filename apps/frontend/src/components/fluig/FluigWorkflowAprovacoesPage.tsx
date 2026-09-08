'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, ExternalLink, FileText, Filter, HelpCircle, RotateCcw, Search, X, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { CadastroListEmpty, CadastroListLoading, CadastroListSummary } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
} from '@/components/ui/listTableUi';
import api from '@/lib/api';
import {
  countWorkflowSummary,
  buildFluigWorkflowProcessViewUrl,
  FLUIG_WORKFLOW_APPROVAL_DATASET_G3,
  FLUIG_WORKFLOW_APPROVAL_DATASET_G5,
  getWorkflowSectorsForDataset,
  formatFluigBudgetFieldDisplay,
  isWorkflowApprovalDateInRange,
  listWorkflowDistinctFieldOptions,
  parseWorkflowApprovalRows,
  SECTOR_TABLE_HEADERS,
  type ParsedWorkflowRow,
} from '@/lib/fluigWorkflowApproval';
import { ApprovalStepCell } from '@/components/fluig/fluigWorkflowStepStatus';
import { FluigWorkflowRequestDetailModal } from '@/components/fluig/FluigWorkflowRequestDetailModal';
import { ListPagination } from '@/components/ui/ListPagination';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { ExpandableText } from '@/components/ui/ExpandableText';

const ITEMS_PER_PAGE = 25;

const ACTIONS_COL_TH =
  'w-[4%] min-w-[3.5rem] whitespace-nowrap px-2 py-4 text-center align-middle text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-3';
const ACTIONS_COL_TD =
  'w-[4%] min-w-[3.5rem] whitespace-nowrap px-2 py-3 text-center align-middle sm:px-3';
const ID_COL_TH =
  'w-[1%] whitespace-nowrap px-3 py-4 text-center align-middle text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-4';
const ID_COL_TD =
  'w-[1%] whitespace-nowrap px-3 py-4 text-center align-middle text-sm font-mono font-medium text-gray-900 dark:text-gray-100 sm:px-4';

const DATASETS = [
  { id: FLUIG_WORKFLOW_APPROVAL_DATASET_G3, label: 'G3' },
  { id: FLUIG_WORKFLOW_APPROVAL_DATASET_G5, label: 'G5' },
] as const;

type CardFilter = 'all' | 'approved' | 'compras' | 'tecnico' | 'diretoria' | 'other';

const FILTER_CARDS: {
  filter: CardFilter;
  label: string;
  countKey: keyof ReturnType<typeof countWorkflowSummary>;
  Icon: typeof FileText;
  iconBg: string;
  iconColor: string;
}[] = [
  {
    filter: 'all',
    label: 'Total',
    countKey: 'total',
    Icon: FileText,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    filter: 'approved',
    label: 'Aprovadas',
    countKey: 'fullyApproved',
    Icon: CheckCircle2,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  {
    filter: 'compras',
    label: 'Pend. Compras',
    countKey: 'pendingCompras',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    filter: 'tecnico',
    label: 'Pend. Gestor',
    countKey: 'pendingTecnico',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    filter: 'diretoria',
    label: 'Pend. Diretoria',
    countKey: 'pendingDiretoria',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
];

const WORKFLOW_CARD_LIST_CONFIG: Record<
  CardFilter,
  {
    title: string;
    subtitle: string;
    Icon: LucideIcon;
    iconBg: string;
    iconColor: string;
  }
> = {
  all: {
    title: 'Todas as solicitações',
    subtitle: 'Processos G3 e G5 em todas as etapas',
    Icon: FileText,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  approved: {
    title: 'Solicitações aprovadas',
    subtitle: 'Processos que já concluíram o fluxo de aprovação',
    Icon: CheckCircle2,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  compras: {
    title: 'Pendências em Compras',
    subtitle: 'Aguardando aprovação do setor de compras',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  tecnico: {
    title: 'Pendências em Gestor',
    subtitle: 'Aguardando aprovação do gestor',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  diretoria: {
    title: 'Pendências em Diretoria',
    subtitle: 'Aguardando aprovação da diretoria',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  other: {
    title: 'Outras pendências',
    subtitle: 'Pendências fora das etapas principais',
    Icon: HelpCircle,
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    iconColor: 'text-slate-600 dark:text-slate-400',
  },
};

function handleCreationPeriodFromChange(
  value: string,
  periodTo: string,
  setPeriodFrom: (value: string) => void,
  setPeriodTo: (value: string) => void
) {
  setPeriodFrom(value);
  if (value && periodTo && value > periodTo) setPeriodTo(value);
}

function handleCreationPeriodToChange(
  value: string,
  periodFrom: string,
  setPeriodFrom: (value: string) => void,
  setPeriodTo: (value: string) => void
) {
  setPeriodTo(value);
  if (value && periodFrom && periodFrom > value) setPeriodFrom(value);
}

export function FluigWorkflowAprovacoesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState('');
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [listPage, setListPage] = useState(1);
  const [detailRow, setDetailRow] = useState<ParsedWorkflowRow | null>(null);
  const [filterNatureza, setFilterNatureza] = useState('');
  const [filterCentroCusto, setFilterCentroCusto] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);

  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const user = userData?.data ?? { name: 'Usuário', role: 'EMPLOYEE' as const };

  const datasetQueries = useQueries({
    queries: DATASETS.map(({ id }) => ({
      queryKey: ['fluig-workflow-approval', id],
      queryFn: async () => {
        const res = await api.post(`/fluig/datasets/${encodeURIComponent(id)}/data`, {}, {
          timeout: 130000,
        });
        return res.data;
      },
      staleTime: 7 * 60 * 1000,
    })),
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const activeQuery = datasetQueries[activeTab];
  const datasetId = DATASETS[activeTab]?.id ?? DATASETS[0].id;
  const content = activeQuery?.data?.data?.content;
  const values = (content?.values ?? []) as Record<string, unknown>[];
  const columns = (content?.columns ?? (values[0] ? Object.keys(values[0]) : [])) as string[];

  const { rows } = useMemo(
    () => parseWorkflowApprovalRows(values, columns, datasetId),
    [values, columns, datasetId]
  );

  const summary = useMemo(() => countWorkflowSummary(rows), [rows]);

  const visibleSectors = useMemo(() => getWorkflowSectorsForDataset(datasetId), [datasetId]);
  const showNaturezaColumn = datasetId === FLUIG_WORKFLOW_APPROVAL_DATASET_G5;

  const visibleFilterCards = useMemo(
    () =>
      FILTER_CARDS.filter((card) => {
        if (card.filter === 'other') return false;
        if (card.filter === 'compras' && !visibleSectors.includes('compras')) return false;
        return true;
      }),
    [visibleSectors]
  );

  const listHeader = WORKFLOW_CARD_LIST_CONFIG[cardFilter];
  const ListHeaderIcon = listHeader.Icon;

  const naturezaFilterOptions = useMemo(
    () => (showNaturezaColumn ? listWorkflowDistinctFieldOptions(rows, 'naturezaOrcamentaria') : []),
    [rows, showNaturezaColumn]
  );
  const centroCustoFilterOptions = useMemo(
    () => listWorkflowDistinctFieldOptions(rows, 'centroCusto'),
    [rows]
  );

  const hasPeriodFilter = Boolean(periodFrom || periodTo);
  const hasNaturezaFilter = showNaturezaColumn && Boolean(filterNatureza);
  const hasCentroCustoFilter = Boolean(filterCentroCusto);
  const hasActiveModalFilter = hasPeriodFilter || hasNaturezaFilter || hasCentroCustoFilter;

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (cardFilter === 'approved' && !row.fullyApproved) return false;
      if (cardFilter === 'compras' && row.currentPendingSector !== 'compras') return false;
      if (cardFilter === 'tecnico' && row.currentPendingSector !== 'tecnico') return false;
      if (cardFilter === 'diretoria' && row.currentPendingSector !== 'diretoria') return false;
      if (cardFilter === 'other' && (row.fullyApproved || row.currentPendingSector)) return false;

      if (
        hasNaturezaFilter &&
        formatFluigBudgetFieldDisplay(row.naturezaOrcamentaria) !== filterNatureza
      ) {
        return false;
      }
      if (
        filterCentroCusto &&
        formatFluigBudgetFieldDisplay(row.centroCusto) !== filterCentroCusto
      ) {
        return false;
      }
      if (hasPeriodFilter && !isWorkflowApprovalDateInRange(row.createdAt, periodFrom, periodTo)) {
        return false;
      }

      if (!term) return true;
      const hay = [
        row.processId,
        row.title,
        row.filial ?? '',
        formatFluigBudgetFieldDisplay(row.naturezaOrcamentaria) ?? '',
        formatFluigBudgetFieldDisplay(row.centroCusto) ?? '',
        row.currentStage ?? '',
        row.currentPendingWith ?? '',
        ...row.steps.flatMap((s) => [s.approver ?? '', s.pendingWith ?? '', s.detail ?? '']),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(term);
    });
  }, [
    rows,
    search,
    cardFilter,
    filterNatureza,
    filterCentroCusto,
    periodFrom,
    periodTo,
    hasPeriodFilter,
    hasNaturezaFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));

  const paginatedRows = useMemo(() => {
    const start = (listPage - 1) * ITEMS_PER_PAGE;
    return filteredRows.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRows, listPage]);

  useEffect(() => {
    setListPage(1);
  }, [search, cardFilter, activeTab, filterNatureza, filterCentroCusto, periodFrom, periodTo]);

  useEffect(() => {
    setFilterNatureza('');
    setFilterCentroCusto('');
    setPeriodFrom('');
    setPeriodTo('');
    setIsFiltersModalOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!showNaturezaColumn) {
      setFilterNatureza('');
    }
  }, [showNaturezaColumn]);

  useEffect(() => {
    if (filterNatureza && !naturezaFilterOptions.some((option) => option.value === filterNatureza)) {
      setFilterNatureza('');
    }
    if (filterCentroCusto && !centroCustoFilterOptions.some((option) => option.value === filterCentroCusto)) {
      setFilterCentroCusto('');
    }
  }, [filterNatureza, filterCentroCusto, naturezaFilterOptions, centroCustoFilterOptions]);

  useEffect(() => {
    if (!visibleSectors.includes('compras') && cardFilter === 'compras') {
      setCardFilter('all');
    }
  }, [visibleSectors, cardFilter]);

  useEffect(() => {
    if (listPage > totalPages) setListPage(totalPages);
  }, [listPage, totalPages]);

  const listStart =
    filteredRows.length === 0 ? 0 : (listPage - 1) * ITEMS_PER_PAGE + 1;
  const listEnd =
    filteredRows.length === 0
      ? 0
      : Math.min(listPage * ITEMS_PER_PAGE, filteredRows.length);

  const isLoading = datasetQueries.some((q) => q.isLoading);
  const isFetching = datasetQueries.some((q) => q.isFetching);
  const hasError = datasetQueries.some((q) => q.isError);
  const errorMessage =
    (datasetQueries.find((q) => q.error)?.error as { response?: { data?: { message?: string } } })
      ?.response?.data?.message ?? 'Não foi possível carregar os dados do Fluig.';

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['fluig-workflow-approval'] });
  };

  return (
    <ProtectedRoute route="/ponto/fluig/aprovacoes-workflow">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Fluig - Aprovações
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Status de aprovação
            </p>
          </div>

          <div className="flex justify-center">
            <div className="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
              {DATASETS.map(({ id, label }, idx) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveTab(idx);
                    setCardFilter('all');
                    setListPage(1);
                  }}
                  className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${
                    activeTab === idx
                      ? 'bg-white text-red-600 shadow-sm dark:bg-gray-900 dark:text-red-400'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {hasError && !isLoading ? (
            <Card className="w-full">
              <CardContent className="py-10 text-center">
                <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
                <Button type="button" className="mt-4" onClick={refetch}>
                  Tentar novamente
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div
                className={`grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 ${
                  visibleFilterCards.length >= 5
                    ? '2xl:grid-cols-5'
                    : visibleFilterCards.length === 4
                      ? '2xl:grid-cols-4'
                      : '2xl:grid-cols-3'
                }`}
              >
                {visibleFilterCards.map((card) => (
                  <FilterStatCard
                    key={card.filter}
                    label={card.label}
                    count={summary[card.countKey]}
                    icon={card.Icon}
                    iconBg={card.iconBg}
                    iconColor={card.iconColor}
                    isActive={cardFilter === card.filter}
                    loading={isLoading || isFetching}
                    onClick={() => setCardFilter(card.filter)}
                  />
                ))}
              </div>

              <Card className={cadastroListClasses.card}>
                <CardHeader className={cadastroListClasses.cardHeader}>
                  <div className={cadastroListClasses.cardHeaderRow}>
                    <div className={cadastroListClasses.cardHeaderIconRow}>
                      <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                        <ListHeaderIcon
                          className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`}
                        />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {listHeader.title}
                        </h3>
                        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                          {listHeader.subtitle}
                        </p>
                      </div>
                    </div>
                    <div className={cadastroListClasses.cardToolbar}>
                      <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                        <input
                          type="text"
                          role="searchbox"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Buscar ID, título, aprovador..."
                          autoComplete="off"
                          disabled={isLoading}
                          className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                        {search ? (
                          <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                            aria-label="Limpar busca"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsFiltersModalOpen(true)}
                        disabled={isLoading}
                        className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          hasActiveModalFilter
                            ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                        }`}
                        aria-label="Abrir filtros"
                        title={hasActiveModalFilter ? 'Filtro (ativo)' : 'Filtro'}
                      >
                        <Filter className="h-4 w-4" />
                        {hasActiveModalFilter ? (
                          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                        ) : null}
                      </button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className={cadastroListClasses.cardContent}>
                  {isLoading ? (
                    <CadastroListLoading message="Carregando solicitações do Fluig..." />
                  ) : filteredRows.length === 0 ? (
                    <CadastroListEmpty
                      icon={ListHeaderIcon}
                      title="Nenhuma solicitação encontrada"
                      hint={
                        search || hasActiveModalFilter
                          ? 'Ajuste a busca ou os filtros para ver outros resultados.'
                          : 'Ajuste os filtros ou a busca para ver outros resultados.'
                      }
                    />
                  ) : (
                    <>
                      <CadastroListSummary
                        startItem={listStart}
                        endItem={listEnd}
                        total={filteredRows.length}
                        itemLabel="solicitação"
                        itemLabelPlural="solicitações"
                        currentPage={listPage}
                        totalPages={totalPages}
                      />
                      <div className="table-scroll">
                        <table className="w-full text-sm">
                          <colgroup>
                            <col className="w-[1%]" />
                          </colgroup>
                          <thead className="border-b border-gray-200 dark:border-gray-700">
                            <tr>
                              <th className={ID_COL_TH}>ID</th>
                              <th className={cadastroListClasses.th}>Título da solicitação</th>
                              {showNaturezaColumn ? (
                                <th className={cadastroListClasses.thCenter}>Natureza orçamentária</th>
                              ) : null}
                              <th className={cadastroListClasses.thCenter}>Centro de custo</th>
                              {visibleSectors.map((sector) => (
                                <th key={sector} className={cadastroListClasses.thCenter}>
                                  {SECTOR_TABLE_HEADERS[sector]}
                                </th>
                              ))}
                              <th className={ACTIONS_COL_TH}>Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                            {paginatedRows.map((row) => {
                              const naturezaLabel = formatFluigBudgetFieldDisplay(row.naturezaOrcamentaria);
                              const centroCustoLabel = formatFluigBudgetFieldDisplay(row.centroCusto);
                              return (
                              <tr
                                key={row.rowKey}
                                className={getListTableRowClassName(true)}
                                onClick={() => setDetailRow(row)}
                              >
                                <td className={ID_COL_TD}>
                                  <ListRowNavigableLabel className="font-mono font-medium">
                                    {row.processId}
                                  </ListRowNavigableLabel>
                                </td>
                                <td className={`${cadastroListClasses.td} max-w-xl`}>
                                  <ExpandableText text={row.title} />
                                </td>
                                {showNaturezaColumn ? (
                                  <td
                                    className={`${cadastroListClasses.tdCenter} max-w-[10rem] truncate`}
                                    title={naturezaLabel || undefined}
                                  >
                                    {naturezaLabel || '—'}
                                  </td>
                                ) : null}
                                <td
                                  className={`${cadastroListClasses.tdCenter} max-w-[10rem] truncate`}
                                  title={centroCustoLabel || undefined}
                                >
                                  {centroCustoLabel || '—'}
                                </td>
                                {visibleSectors.map((sector) => {
                                  const step = row.steps.find((s) => s.sector === sector)!;
                                  return (
                                    <td key={sector} className={cadastroListClasses.tdCenter}>
                                      <ApprovalStepCell step={step} />
                                    </td>
                                  );
                                })}
                                <td className={ACTIONS_COL_TD}>
                                  <div className="flex justify-center">
                                    <a
                                      href={buildFluigWorkflowProcessViewUrl(row.processId)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(event) => event.stopPropagation()}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                                      aria-label={`Abrir processo ${row.processId} no Fluig`}
                                      title="Abrir no Fluig"
                                    >
                                      <ExternalLink className="h-4 w-4" aria-hidden />
                                    </a>
                                  </div>
                                </td>
                              </tr>
                            );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <ListPagination
                        currentPage={listPage}
                        totalPages={totalPages}
                        onPageChange={setListPage}
                        className={cadastroListClasses.pagination}
                      />
                    </>
                  )}
                </CardContent>
              </Card>

              {isFiltersModalOpen ? (
                <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black/40"
                    onClick={() => setIsFiltersModalOpen(false)}
                    aria-hidden
                  />
                  <div className="relative mx-4 w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-gray-800">
                    <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
                      <button
                        type="button"
                        onClick={() => setIsFiltersModalOpen(false)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                        aria-label="Fechar filtros"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="px-5 py-4">
                      <div className="space-y-4">
                        {showNaturezaColumn ? (
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                              Natureza orçamentária
                            </label>
                            <StringSingleSelectDropdown
                              value={filterNatureza}
                              onChange={setFilterNatureza}
                              options={naturezaFilterOptions}
                              allowEmpty
                              emptyOptionLabel="Todas as naturezas"
                              placeholder="Todas as naturezas"
                              searchPlaceholder="Pesquisar..."
                            />
                          </div>
                        ) : null}
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Centro de custo
                          </label>
                          <StringSingleSelectDropdown
                            value={filterCentroCusto}
                            onChange={setFilterCentroCusto}
                            options={centroCustoFilterOptions}
                            allowEmpty
                            emptyOptionLabel="Todos os centros de custo"
                            placeholder="Todos os centros de custo"
                            searchPlaceholder="Pesquisar..."
                          />
                        </div>
                        <div>
                          <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                            Período em que a solicitação foi criada.
                          </p>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Criação (de)
                              </label>
                              <DatePickerField
                                value={periodFrom}
                                onChange={(value) =>
                                  handleCreationPeriodFromChange(value, periodTo, setPeriodFrom, setPeriodTo)
                                }
                                placeholder="dd/mm/aaaa"
                                noFocusRing
                                aria-label="Data inicial de criação"
                              />
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Criação (até)
                              </label>
                              <DatePickerField
                                value={periodTo}
                                onChange={(value) =>
                                  handleCreationPeriodToChange(value, periodFrom, setPeriodFrom, setPeriodTo)
                                }
                                placeholder="dd/mm/aaaa"
                                noFocusRing
                                aria-label="Data final de criação"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => {
                          setFilterNatureza('');
                          setFilterCentroCusto('');
                          setPeriodFrom('');
                          setPeriodTo('');
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Limpar filtros
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsFiltersModalOpen(false)}
                        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                </AppModalOverlay>
              ) : null}
            </>
          )}
        </div>

        <FluigWorkflowRequestDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
      </MainLayout>
    </ProtectedRoute>
  );
}
