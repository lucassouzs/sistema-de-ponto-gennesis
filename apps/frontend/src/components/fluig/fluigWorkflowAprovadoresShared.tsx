'use client';

import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { CheckCircle2, Clock, Download, FileText, Filter, RotateCcw, Search, X, type LucideIcon, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { CadastroListEmpty, CadastroListSummary } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
} from '@/components/ui/listTableUi';
import api from '@/lib/api';
import {
  aggregateWorkflowByApprover,
  buildFluigWorkflowProcessViewUrl,
  buildWorkflowRowKeyMap,
  FLUIG_WORKFLOW_APPROVAL_DATASET_G3,
  FLUIG_WORKFLOW_APPROVAL_DATASET_G5,
  formatWorkflowApprovalDateDisplay,
  formatFluigBudgetFieldDisplay,
  isWorkflowApprovalDateInRange,
  compareWorkflowApprovalDateDesc,
  formatWorkflowValorDisplay,
  parseWorkflowApprovalRows,
  getWorkflowSectorsForDataset,
  SECTOR_TABLE_HEADERS,
  isWorkflowStagePaid,
  type WorkflowApproverRequestRef,
  type WorkflowSector,
} from '@/lib/fluigWorkflowApproval';
import { ListPagination } from '@/components/ui/ListPagination';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { ExpandableText } from '@/components/ui/ExpandableText';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import * as XLSX from 'xlsx';

export const FLUIG_WORKFLOW_DATASETS = [
  { id: FLUIG_WORKFLOW_APPROVAL_DATASET_G3, label: 'G3' },
  { id: FLUIG_WORKFLOW_APPROVAL_DATASET_G5, label: 'G5' },
] as const;

export const APPROVERS_LIST_PAGE_SIZE = 20;
export const APPROVER_REQUESTS_PAGE_SIZE = 15;

export type ApproverRequestFilter = 'all' | 'approved' | 'pending';

export type ApproverStageFilter = 'all' | WorkflowSector;

export type ApproverPaidFilter = 'all' | 'paid' | 'unpaid';

const PAID_FILTER_OPTIONS: { value: ApproverPaidFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'paid', label: 'Pagas' },
  { value: 'unpaid', label: 'Não pagas' },
];

function buildApproverStageFilterOptions(datasetId: string): { value: ApproverStageFilter; label: string }[] {
  return [
    { value: 'all', label: 'Todas as etapas' },
    ...getWorkflowSectorsForDataset(datasetId).map((sector) => ({
      value: sector,
      label: SECTOR_TABLE_HEADERS[sector],
    })),
  ];
}

export type ApproverRequestListItem = WorkflowApproverRequestRef & {
  disposition: 'approved' | 'pending';
};

const ACTIONS_COL_TH =
  'w-[4%] min-w-[3.5rem] whitespace-nowrap px-2 py-4 text-center align-middle text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-3';
const ACTIONS_COL_TD =
  'w-[4%] min-w-[3.5rem] whitespace-nowrap px-2 py-3 text-center align-middle sm:px-3';
const ID_COL_TH =
  'w-[1%] whitespace-nowrap px-3 py-4 text-center align-middle text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-4';
const ID_COL_TD =
  'w-[1%] whitespace-nowrap px-3 py-4 text-center align-middle text-sm font-mono font-medium text-gray-900 dark:text-gray-100 sm:px-4';

const LIST_BADGE =
  'inline-flex h-6 items-center justify-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold leading-none';
const LIST_BADGE_APPROVED =
  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
const LIST_BADGE_PENDING =
  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
const LIST_BADGE_UNPAID =
  'bg-gray-100 text-gray-700 dark:bg-gray-500/25 dark:text-gray-300';

export const APPROVER_FILTER_LIST_CONFIG: Record<
  ApproverRequestFilter,
  {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyHint: string;
    Icon: LucideIcon;
    iconBg: string;
    iconColor: string;
  }
> = {
  all: {
    title: 'Todas as Solicitações',
    subtitle: 'Aprovadas e pendentes deste aprovador no grupo selecionado',
    emptyTitle: 'Nenhuma solicitação neste grupo',
    emptyHint: 'Não há registros para este aprovador no grupo selecionado.',
    Icon: FileText,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  approved: {
    title: 'Solicitações Aprovadas',
    subtitle: 'Processos que esta pessoa já aprovou',
    emptyTitle: 'Nenhuma aprovação registrada',
    emptyHint: 'Esta pessoa ainda não aprovou solicitações neste grupo.',
    Icon: CheckCircle2,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  pending: {
    title: 'Solicitações Pendentes',
    subtitle: 'Processos aguardando ação desta pessoa',
    emptyTitle: 'Nenhuma pendência',
    emptyHint: 'Não há solicitações aguardando ação desta pessoa neste grupo.',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
};

export function FluigDatasetToggle({
  activeTab,
  onChange,
  availableTabs,
}: {
  activeTab: number;
  onChange: (index: number) => void;
  /** Índices dos datasets disponíveis (0 = G3, 1 = G5). Omitir = ambos. */
  availableTabs?: number[];
}) {
  const tabs = availableTabs ?? FLUIG_WORKFLOW_DATASETS.map((_, index) => index);
  if (tabs.length <= 1) return null;

  const activeId =
    FLUIG_WORKFLOW_DATASETS[activeTab]?.id ?? FLUIG_WORKFLOW_DATASETS[tabs[0]]?.id;
  if (!activeId) return null;

  return (
    <div className="flex justify-center">
      <SegmentedControl
        aria-label="Datasets Fluig"
        className="h-auto [&>button]:px-5 [&>button]:py-2 [&>button]:font-medium"
        pillClassName="bg-white shadow-sm dark:bg-gray-900"
        value={activeId}
        onChange={(next) => {
          const idx = FLUIG_WORKFLOW_DATASETS.findIndex((dataset) => dataset.id === next);
          if (idx >= 0) onChange(idx);
        }}
        options={tabs.map((idx) => {
          const { id, label } = FLUIG_WORKFLOW_DATASETS[idx];
          return { value: id, label };
        })}
      />
    </div>
  );
}

export function useFluigWorkflowApprovalDatasets(options?: {
  approverNameKey?: string;
  enabled?: boolean;
}) {
  const approverNameKey = options?.approverNameKey?.trim() || undefined;
  const enabled = options?.enabled !== false;

  const datasetQueries = useQueries({
    queries: FLUIG_WORKFLOW_DATASETS.map(({ id }) => ({
      queryKey: ['fluig-workflow-approval', id],
      queryFn: async () => {
        const res = await api.post(`/fluig/datasets/${encodeURIComponent(id)}/data`, {}, {
          timeout: 130000,
        });
        return res.data;
      },
      staleTime: 7 * 60 * 1000,
      enabled,
    })),
  });

  const parsedRowsByDataset = useMemo(() => {
    return FLUIG_WORKFLOW_DATASETS.map(({ id }, index) => {
      const content = datasetQueries[index]?.data?.data?.content;
      const values = (content?.values ?? []) as Record<string, unknown>[];
      const columns = (content?.columns ?? (values[0] ? Object.keys(values[0]) : [])) as string[];
      const { rows } = parseWorkflowApprovalRows(values, columns, id);
      return rows;
    });
  }, [datasetQueries[0]?.data, datasetQueries[1]?.data]);

  const bucketsByDataset = useMemo(() => {
    return parsedRowsByDataset.map((rows) =>
      aggregateWorkflowByApprover(rows, {
        summariesOnly: !approverNameKey,
        nameKeyFilter: approverNameKey,
      })
    );
  }, [parsedRowsByDataset, approverNameKey]);

  const rowKeyMapsByDataset = useMemo(() => {
    if (!approverNameKey) return [null, null] as const;
    return parsedRowsByDataset.map((rows) => buildWorkflowRowKeyMap(rows));
  }, [parsedRowsByDataset, approverNameKey]);

  const isLoading = enabled && datasetQueries.some((query) => query.isLoading);
  const isFetching = enabled && datasetQueries.some((query) => query.isFetching);
  const hasError = datasetQueries.some((query) => query.isError);
  const errorMessage =
    (datasetQueries.find((query) => query.error)?.error as {
      response?: { data?: { message?: string } };
    })?.response?.data?.message ?? 'Não foi possível carregar os dados do Fluig.';

  return {
    datasetQueries,
    parsedRowsByDataset,
    rowKeyMapsByDataset,
    bucketsByDataset,
    g3Buckets: bucketsByDataset[0] ?? [],
    g5Buckets: bucketsByDataset[1] ?? [],
    g3Rows: parsedRowsByDataset[0] ?? [],
    g5Rows: parsedRowsByDataset[1] ?? [],
    isLoading,
    isFetching,
    hasError,
    errorMessage,
  };
}

export function buildApproverListItems(
  filter: ApproverRequestFilter,
  approvedRequests: WorkflowApproverRequestRef[],
  pendingRequests: WorkflowApproverRequestRef[]
): ApproverRequestListItem[] {
  if (filter === 'approved') {
    return approvedRequests
      .map((item) => ({ ...item, disposition: 'approved' as const }))
      .sort((a, b) => compareWorkflowApprovalDateDesc(a.approvedAt, b.approvedAt));
  }
  if (filter === 'pending') {
    return pendingRequests.map((item) => ({ ...item, disposition: 'pending' as const }));
  }
  const combined = new Array<ApproverRequestListItem>(
    approvedRequests.length + pendingRequests.length
  );
  let index = 0;
  for (const item of approvedRequests) {
    combined[index++] = { ...item, disposition: 'approved' };
  }
  for (const item of pendingRequests) {
    combined[index++] = { ...item, disposition: 'pending' };
  }
  return combined;
}

function matchesApproverRequestSearch(item: ApproverRequestListItem, term: string): boolean {
  if (!term) return true;
  if (item.processId.toLowerCase().includes(term)) return true;
  if (item.title.toLowerCase().includes(term)) return true;
  if (item.currentStage?.toLowerCase().includes(term)) return true;
  const valorLabel = formatWorkflowValorDisplay(item.valor);
  if (valorLabel !== '—' && valorLabel.toLowerCase().includes(term)) return true;
  if (item.valor?.toLowerCase().includes(term)) return true;
  const centroCustoLabel = formatFluigBudgetFieldDisplay(item.centroCusto);
  if (centroCustoLabel?.toLowerCase().includes(term)) return true;
  const statusWord = item.disposition === 'approved' ? 'aprovado' : 'pendente';
  return statusWord.includes(term);
}

function matchesApprovalPeriod(
  item: ApproverRequestListItem,
  fromIso: string,
  toIso: string
): boolean {
  if (!fromIso && !toIso) return true;
  if (item.disposition !== 'approved') return false;
  return isWorkflowApprovalDateInRange(item.approvedAt, fromIso, toIso);
}

function matchesApprovalStage(item: ApproverRequestListItem, stageFilter: ApproverStageFilter): boolean {
  if (stageFilter === 'all') return true;
  return item.sector === stageFilter;
}

function matchesCurrentStageFilter(item: ApproverRequestListItem, currentStageFilter: string): boolean {
  if (!currentStageFilter) return true;
  return (item.currentStage?.trim() || '') === currentStageFilter;
}

function matchesPaidFilter(
  item: ApproverRequestListItem,
  paidFilter: ApproverPaidFilter,
  datasetId: string
): boolean {
  if (paidFilter === 'all') return true;
  const paid = isWorkflowStagePaid(item.currentStage, datasetId);
  return paidFilter === 'paid' ? paid : !paid;
}

const EMPTY_APPROVED: WorkflowApproverRequestRef[] = [];
const EMPTY_PENDING: WorkflowApproverRequestRef[] = [];

function handleApprovalPeriodFromChange(
  value: string,
  periodTo: string,
  setPeriodFrom: (value: string) => void,
  setPeriodTo: (value: string) => void
) {
  setPeriodFrom(value);
  if (value && periodTo && value > periodTo) setPeriodTo(value);
}

function handleApprovalPeriodToChange(
  value: string,
  periodFrom: string,
  setPeriodFrom: (value: string) => void,
  setPeriodTo: (value: string) => void
) {
  setPeriodTo(value);
  if (value && periodFrom && periodFrom > value) setPeriodFrom(value);
}

function slugifyExportName(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'solicitacoes'
  );
}

function exportApproverRequestsToXlsx({
  items,
  datasetId,
  listTitle,
  exportName,
  showPaidColumn,
  showApprovalDateColumn,
}: {
  items: ApproverRequestListItem[];
  datasetId: string;
  listTitle: string;
  exportName?: string;
  showPaidColumn: boolean;
  showApprovalDateColumn: boolean;
}) {
  if (!items.length) return;

  const headers = [
    'ID',
    'Título',
    'Centro de Custo',
    'Status',
    'Etapa atual',
    ...(showPaidColumn ? ['Pagamento'] : []),
    'Valor',
    ...(showApprovalDateColumn ? ['Data de aprovação'] : []),
    'Etapa de aprovação',
  ];

  const rows = items.map((item) => {
    const isApproved = item.disposition === 'approved';
    const paid = isWorkflowStagePaid(item.currentStage, datasetId);
    return [
      item.processId,
      item.title,
      formatFluigBudgetFieldDisplay(item.centroCusto) ?? '',
      isApproved ? 'Aprovado' : 'Pendente',
      item.currentStage?.trim() ?? '',
      ...(showPaidColumn ? [paid ? 'Pago' : 'Não pago'] : []),
      formatWorkflowValorDisplay(item.valor) === '—' ? '' : formatWorkflowValorDisplay(item.valor),
      ...(showApprovalDateColumn
        ? [isApproved ? formatWorkflowApprovalDateDisplay(item.approvedAt) : '']
        : []),
      item.sectorLabel,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Solicitações');

  const datasetLabel =
    FLUIG_WORKFLOW_DATASETS.find((item) => item.id === datasetId)?.label ?? 'fluig';
  const date = new Date().toISOString().slice(0, 10);
  const parts = [
    slugifyExportName(exportName || listTitle),
    slugifyExportName(listTitle),
    slugifyExportName(datasetLabel),
    date,
  ];
  XLSX.writeFile(wb, `${parts.join('-')}.xlsx`);
}

export const FilteredApproverRequestList = React.memo(function FilteredApproverRequestList({
  filter,
  datasetId,
  approvedRequests,
  pendingRequests,
  onRowClick,
  exportName,
}: {
  filter: ApproverRequestFilter;
  datasetId: string;
  approvedRequests: WorkflowApproverRequestRef[];
  pendingRequests: WorkflowApproverRequestRef[];
  onRowClick?: (item: ApproverRequestListItem) => void;
  exportName?: string;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [stageFilter, setStageFilter] = useState<ApproverStageFilter>('all');
  const [currentStageFilter, setCurrentStageFilter] = useState('');
  const [paidFilter, setPaidFilter] = useState<ApproverPaidFilter>('all');
  const [filterCentroCusto, setFilterCentroCusto] = useState('');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const stageFilterOptions = useMemo(
    () => buildApproverStageFilterOptions(datasetId),
    [datasetId]
  );
  const deferredSearch = useDeferredValue(search);
  const deferredPeriodFrom = useDeferredValue(periodFrom);
  const deferredPeriodTo = useDeferredValue(periodTo);
  const deferredStageFilter = useDeferredValue(stageFilter);
  const deferredCurrentStageFilter = useDeferredValue(currentStageFilter);
  const deferredPaidFilter = useDeferredValue(paidFilter);
  const deferredCentroCusto = useDeferredValue(filterCentroCusto);
  const hasPeriodFilter = Boolean(periodFrom || periodTo);
  const hasStageFilter = stageFilter !== 'all';
  const hasCurrentStageFilter = Boolean(currentStageFilter);
  const hasPaidFilter = paidFilter !== 'all';
  const hasCentroCustoFilter = Boolean(filterCentroCusto);
  const showPaidColumn = datasetId !== FLUIG_WORKFLOW_APPROVAL_DATASET_G3;
  const hasActiveModalFilter =
    hasPeriodFilter ||
    hasStageFilter ||
    hasCurrentStageFilter ||
    (showPaidColumn && hasPaidFilter) ||
    hasCentroCustoFilter;
  const showApprovalDateColumn = filter !== 'pending';
  const showPeriodFilterFields = filter !== 'pending';

  const listHeader = APPROVER_FILTER_LIST_CONFIG[filter];
  const ListHeaderIcon = listHeader.Icon;

  const stableApproved = approvedRequests.length > 0 ? approvedRequests : EMPTY_APPROVED;
  const stablePending = pendingRequests.length > 0 ? pendingRequests : EMPTY_PENDING;

  const items = useMemo(
    () => buildApproverListItems(filter, stableApproved, stablePending),
    [filter, stableApproved, stablePending]
  );

  const centroCustoFilterOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of items) {
      const display = formatFluigBudgetFieldDisplay(item.centroCusto);
      if (display) values.add(display);
    }
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
      .map((value) => ({ value, label: value }));
  }, [items]);

  const currentStageFilterOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of items) {
      const stage = item.currentStage?.trim();
      if (stage) values.add(stage);
    }
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
      .map((value) => ({ value, label: value }));
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (term && !matchesApproverRequestSearch(item, term)) return false;
      if (!matchesApprovalStage(item, deferredStageFilter)) return false;
      if (!matchesCurrentStageFilter(item, deferredCurrentStageFilter)) return false;
      if (showPaidColumn && !matchesPaidFilter(item, deferredPaidFilter, datasetId)) return false;
      if (!matchesApprovalPeriod(item, deferredPeriodFrom, deferredPeriodTo)) return false;
      if (
        deferredCentroCusto &&
        formatFluigBudgetFieldDisplay(item.centroCusto) !== deferredCentroCusto
      ) {
        return false;
      }
      return true;
    });
  }, [
    items,
    deferredSearch,
    deferredStageFilter,
    deferredCurrentStageFilter,
    deferredPaidFilter,
    deferredPeriodFrom,
    deferredPeriodTo,
    deferredCentroCusto,
    datasetId,
    showPaidColumn,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / APPROVER_REQUESTS_PAGE_SIZE));

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * APPROVER_REQUESTS_PAGE_SIZE;
    return filteredItems.slice(start, start + APPROVER_REQUESTS_PAGE_SIZE);
  }, [filteredItems, page]);

  useEffect(() => {
    setPage(1);
  }, [
    filter,
    deferredSearch,
    deferredStageFilter,
    deferredCurrentStageFilter,
    deferredPaidFilter,
    deferredPeriodFrom,
    deferredPeriodTo,
    deferredCentroCusto,
  ]);

  useEffect(() => {
    setSearch('');
    setPeriodFrom('');
    setPeriodTo('');
    setStageFilter('all');
    setCurrentStageFilter('');
    setPaidFilter('all');
    setFilterCentroCusto('');
    setIsFiltersModalOpen(false);
  }, [filter]);

  useEffect(() => {
    if (stageFilter !== 'all' && !stageFilterOptions.some((option) => option.value === stageFilter)) {
      setStageFilter('all');
    }
  }, [datasetId, stageFilter, stageFilterOptions]);

  useEffect(() => {
    if (!showPaidColumn && paidFilter !== 'all') {
      setPaidFilter('all');
    }
  }, [showPaidColumn, paidFilter]);

  useEffect(() => {
    if (
      filterCentroCusto &&
      !centroCustoFilterOptions.some((option) => option.value === filterCentroCusto)
    ) {
      setFilterCentroCusto('');
    }
  }, [filterCentroCusto, centroCustoFilterOptions]);

  useEffect(() => {
    if (
      currentStageFilter &&
      !currentStageFilterOptions.some((option) => option.value === currentStageFilter)
    ) {
      setCurrentStageFilter('');
    }
  }, [currentStageFilter, currentStageFilterOptions]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const listStart =
    filteredItems.length === 0 ? 0 : (page - 1) * APPROVER_REQUESTS_PAGE_SIZE + 1;
  const listEnd =
    filteredItems.length === 0
      ? 0
      : Math.min(page * APPROVER_REQUESTS_PAGE_SIZE, filteredItems.length);

  return (
    <Card className={cadastroListClasses.card}>
      <CardHeader className={cadastroListClasses.cardHeader}>
        <div className={cadastroListClasses.cardHeaderRow}>
          <div className={cadastroListClasses.cardHeaderIconRow}>
            <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
              <ListHeaderIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`} />
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
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  role="searchbox"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar ID, título, etapa..."
                  autoComplete="off"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
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
                className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  hasActiveModalFilter
                    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Abrir filtro"
                title={hasActiveModalFilter ? 'Filtro (ativo)' : 'Filtro'}
              >
                <Filter className="h-4 w-4" />
                {hasActiveModalFilter ? (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                ) : null}
              </button>
              <button
                type="button"
                onClick={() =>
                  exportApproverRequestsToXlsx({
                    items: filteredItems,
                    datasetId,
                    listTitle: listHeader.title,
                    exportName,
                    showPaidColumn,
                    showApprovalDateColumn,
                  })
                }
                disabled={filteredItems.length === 0}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                aria-label="Exportar solicitações filtradas"
                title="Exportar solicitações filtradas"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className={cadastroListClasses.cardContent}>
        {filteredItems.length === 0 ? (
          <CadastroListEmpty
            icon={ListHeaderIcon}
            title={
              search || hasActiveModalFilter
                ? 'Nenhuma solicitação encontrada'
                : listHeader.emptyTitle
            }
            hint={
              search || hasActiveModalFilter
                ? 'Ajuste a busca ou os filtros para ver outros resultados.'
                : listHeader.emptyHint
            }
          />
        ) : (
          <>
            <CadastroListSummary
              startItem={listStart}
              endItem={listEnd}
              total={filteredItems.length}
              itemLabel="solicitação"
              itemLabelPlural="solicitações"
              currentPage={page}
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
                    <th className={cadastroListClasses.th}>Título</th>
                    <th className={cadastroListClasses.thCenter}>Centro de Custo</th>
                    <th className={cadastroListClasses.thCenter}>Status</th>
                    <th className={cadastroListClasses.thCenter}>Etapa atual</th>
                    {showPaidColumn ? (
                      <th className={cadastroListClasses.thCenter}>Pagamento</th>
                    ) : null}
                    <th className={cadastroListClasses.thCenter}>Valor</th>
                    {showApprovalDateColumn ? (
                      <th className={cadastroListClasses.thCenter}>Data de aprovação</th>
                    ) : null}
                    <th className={ACTIONS_COL_TH}>Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                  {paginatedItems.map((item) => {
                    const isApproved = item.disposition === 'approved';
                    const isNavigable = Boolean(onRowClick);
                    const isPaid = showPaidColumn
                      ? isWorkflowStagePaid(item.currentStage, datasetId)
                      : false;
                    return (
                      <tr
                        key={`${item.rowKey}-${item.sector}-${item.disposition}`}
                        className={getListTableRowClassName(isNavigable)}
                        onClick={isNavigable ? () => onRowClick?.(item) : undefined}
                        onKeyDown={
                          isNavigable
                            ? (event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  onRowClick?.(item);
                                }
                              }
                            : undefined
                        }
                        tabIndex={isNavigable ? 0 : undefined}
                        role={isNavigable ? 'button' : undefined}
                      >
                        <td className={ID_COL_TD}>
                          {isNavigable ? (
                            <ListRowNavigableLabel className="font-mono font-medium">
                              {item.processId}
                            </ListRowNavigableLabel>
                          ) : (
                            item.processId
                          )}
                        </td>
                        <td className={`${cadastroListClasses.td} max-w-xl`}>
                          <ExpandableText text={item.title} />
                        </td>
                        <td
                          className={`${cadastroListClasses.tdCenter} max-w-[14rem] truncate`}
                          title={formatFluigBudgetFieldDisplay(item.centroCusto) ?? undefined}
                        >
                          {formatFluigBudgetFieldDisplay(item.centroCusto) || '—'}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          <span
                            className={`${LIST_BADGE} ${
                              isApproved ? LIST_BADGE_APPROVED : LIST_BADGE_PENDING
                            }`}
                          >
                            {isApproved ? 'Aprovado' : 'Pendente'}
                          </span>
                        </td>
                        <td
                          className={`${cadastroListClasses.tdCenter} max-w-[16rem] truncate`}
                          title={item.currentStage || undefined}
                        >
                          {item.currentStage?.trim() || '—'}
                        </td>
                        {showPaidColumn ? (
                          <td className={cadastroListClasses.tdCenter}>
                            <span
                              className={`${LIST_BADGE} ${
                                isPaid ? LIST_BADGE_APPROVED : LIST_BADGE_UNPAID
                              }`}
                              title={item.currentStage || undefined}
                            >
                              {isPaid ? 'Pago' : 'Não pago'}
                            </span>
                          </td>
                        ) : null}
                        <td
                          className={`${cadastroListClasses.tdCenter} whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100`}
                        >
                          {formatWorkflowValorDisplay(item.valor)}
                        </td>
                        {showApprovalDateColumn ? (
                          <td
                            className={`${cadastroListClasses.tdCenter} whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-300`}
                            title={
                              isApproved
                                ? `Aprovação ${item.sectorLabel}${item.approvedAt ? `: ${item.approvedAt}` : ''}`
                                : undefined
                            }
                          >
                            {isApproved ? formatWorkflowApprovalDateDisplay(item.approvedAt) : '—'}
                          </td>
                        ) : null}
                        <td className={ACTIONS_COL_TD}>
                          <div className="flex justify-center">
                            <a
                            href={buildFluigWorkflowProcessViewUrl(item.processId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                            aria-label={`Abrir processo ${item.processId} no Fluig`}
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
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              className={cadastroListClasses.pagination}
            />
          </>
        )}
      </CardContent>

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
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Etapa atual
                  </label>
                  <StringSingleSelectDropdown
                    value={currentStageFilter}
                    onChange={setCurrentStageFilter}
                    options={currentStageFilterOptions}
                    allowEmpty
                    emptyOptionLabel="Todas as etapas"
                    placeholder="Todas as etapas"
                    searchPlaceholder="Pesquisar..."
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Etapa de aprovação
                  </label>
                  <StringSingleSelectDropdown
                    value={stageFilter}
                    onChange={(value) => setStageFilter(value as ApproverStageFilter)}
                    options={stageFilterOptions}
                    allowEmpty={false}
                    placeholder="Todas as etapas"
                    searchPlaceholder="Pesquisar..."
                  />
                </div>
                {showPaidColumn ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Pagamento
                    </label>
                    <StringSingleSelectDropdown
                      value={paidFilter}
                      onChange={(value) => setPaidFilter(value as ApproverPaidFilter)}
                      options={PAID_FILTER_OPTIONS}
                      allowEmpty={false}
                      placeholder="Todas"
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
                {showPeriodFilterFields ? (
                  <div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Aprovação (de)
                        </label>
                        <DatePickerField
                          value={periodFrom}
                          onChange={(value) =>
                            handleApprovalPeriodFromChange(value, periodTo, setPeriodFrom, setPeriodTo)
                          }
                          placeholder="dd/mm/aaaa"
                          noFocusRing
                          aria-label="Data inicial da aprovação"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Aprovação (até)
                        </label>
                        <DatePickerField
                          value={periodTo}
                          onChange={(value) =>
                            handleApprovalPeriodToChange(value, periodFrom, setPeriodFrom, setPeriodTo)
                          }
                          placeholder="dd/mm/aaaa"
                          noFocusRing
                          aria-label="Data final da aprovação"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setPeriodFrom('');
                  setPeriodTo('');
                  setStageFilter('all');
                  setCurrentStageFilter('');
                  setPaidFilter('all');
                  setFilterCentroCusto('');
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
    </Card>
  );
});
