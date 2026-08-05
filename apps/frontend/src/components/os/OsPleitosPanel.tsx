'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  Edit2,
  ExternalLink,
  Filter,
  Search,
  Trash2,
  X,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { Loading } from '@/components/ui/Loading';
import { PleitoFormModal } from '@/components/pleito/PleitoFormModal';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses
} from '@/components/ui/RowActionMenu';
import { listTableRowClasses } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { pleitoStatusReadOnlySpanClass } from '@/lib/pleitoStatusStyles';
import { formatOsSePastaOrDash } from '@/lib/formatOsSePasta';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { STATUS_ORCAMENTO_OPCOES, MESES, type PleitoFormData } from '@/lib/pleitoForm';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import type { OsTab, OsPleitoListItem } from './osFluxTypes';
import {
  EMBEDDED_OS_TAB_META,
  filterPleitosBySearch,
  filterPleitosByTab,
  formatBudgetCurrency,
  formatDateBr,
  getOsEtiquetaFromPleito,
  getOsFaturamentoPct,
  prepareOsFluxList,
  osEtiquetaBadgeClass
} from './osFluxUtils';

const ITEMS_PER_PAGE = 20;

const ANO_ATUAL = new Date().getFullYear();
const ANOS_FILTRO = Array.from({ length: 16 }, (_, i) => ANO_ATUAL - 6 + i);

const FILTER_MONTH_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos' },
  ...MESES.map((m) => ({ value: m.value, label: m.label }))
]);
const FILTER_YEAR_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos' },
  ...ANOS_FILTRO.map((y) => ({ value: String(y), label: String(y) }))
]);
const FILTER_BUDGET_STATUS_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos' },
  ...STATUS_ORCAMENTO_OPCOES.map((op) => ({ value: op, label: op }))
]);
const FILTER_PENDING_BILLING_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos' },
  { value: 'sim', label: 'Com valor pendente' },
  { value: 'nao', label: 'Sem pendência' }
]);

export type { OsTab, OsPleitoListItem };

export interface OsPleitosPanelProps {
  embedded?: boolean;
  hideTabs?: boolean;
  hideSearch?: boolean;
  activeTab?: OsTab;
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
}

function buildPaginationPageNumbers(currentPage: number, totalPages: number): number[] {
  const windowSize = Math.min(5, totalPages);
  return Array.from({ length: windowSize }, (_, i) => {
    if (totalPages <= 5) return i + 1;
    if (currentPage <= 3) return i + 1;
    if (currentPage >= totalPages - 2) return totalPages - 4 + i;
    return currentPage - 2 + i;
  });
}

export function OsPleitosPanel({
  embedded = false,
  hideTabs = false,
  hideSearch = false,
  activeTab: activeTabProp = 'orcamento',
  searchTerm = '',
  onSearchChange
}: OsPleitosPanelProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeTab = hideTabs ? activeTabProp : activeTabProp;

  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filterContractId, setFilterContractId] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterLot, setFilterLot] = useState('');
  const [filterBudgetStatus, setFilterBudgetStatus] = useState('');
  const [filterPendingBilling, setFilterPendingBilling] = useState<'sim' | 'nao' | ''>('');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [pleitoToEdit, setPleitoToEdit] = useState<{
    pleito: PleitoFormData & { id: string };
    contractId: string;
    contractDisplay?: string;
  } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const effectiveSearchTerm = onSearchChange ? searchTerm : internalSearchTerm;
  const setEffectiveSearchTerm = (value: string) => {
    if (onSearchChange) onSearchChange(value);
    else setInternalSearchTerm(value);
  };

  const hasActiveOsFilters = Boolean(
    filterContractId ||
      filterMonth ||
      filterYear ||
      filterLot.trim() ||
      filterBudgetStatus ||
      filterPendingBilling
  );

  const clearOsFilters = () => {
    setFilterContractId('');
    setFilterMonth('');
    setFilterYear('');
    setFilterLot('');
    setFilterBudgetStatus('');
    setFilterPendingBilling('');
    setCurrentPage(1);
  };

  const { data: contractsListData } = useQuery({
    queryKey: ['contracts-list-os-filters'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500, page: 1 } });
      return res.data;
    }
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ['pleitos', 'list-full'],
    queryFn: async () => {
      const res = await api.get('/pleitos', { params: { limit: 500, page: 1 } });
      return res.data;
    }
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/pleitos/${id}`, { params: { excluirOrdemServico: true } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pleitos', 'list-full'] });
      setDeleteId(null);
      toast.success('Ordem de serviço excluída.');
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message || 'Erro ao excluir')
  });

  const allPleitos = useMemo(
    () => prepareOsFluxList((listData?.data || []) as OsPleitoListItem[]),
    [listData]
  );

  const contractsForFilter = (contractsListData?.data || []) as Array<{
    id: string;
    name: string;
    number: string;
  }>;

  const contractFilterOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: '', label: 'Todos' },
        ...contractsForFilter.map((c) => ({
          value: c.id,
          label: c.number ? `${c.number} — ${c.name}` : c.name
        }))
      ]),
    [contractsForFilter]
  );

  const filteredPleitos = useMemo(() => {
    let result = filterPleitosByTab(allPleitos, activeTab);
    result = filterPleitosBySearch(result, effectiveSearchTerm);

    if (filterContractId) {
      result = result.filter((p) => p.updatedContract?.id === filterContractId);
    }
    if (filterMonth) {
      const raw = filterMonth.padStart(2, '0');
      const n = parseInt(raw, 10);
      result = result.filter((p) => {
        const m = p.creationMonth;
        if (!m) return false;
        const pn = parseInt(String(m).replace(/\D/g, ''), 10);
        return String(pn).padStart(2, '0') === raw || String(pn) === String(n);
      });
    }
    if (filterYear) {
      const y = Number(filterYear);
      result = result.filter((p) => p.creationYear === y);
    }
    if (filterLot.trim()) {
      const lot = filterLot.trim().toLowerCase();
      result = result.filter((p) => (p.lot || '').toLowerCase().includes(lot));
    }
    if (filterBudgetStatus) {
      result = result.filter((p) => p.budgetStatus === filterBudgetStatus);
    }
    if (filterPendingBilling === 'sim') {
      result = result.filter((p) => Number(p.billingRequest || 0) > 0);
    } else if (filterPendingBilling === 'nao') {
      result = result.filter((p) => !p.billingRequest || Number(p.billingRequest) <= 0);
    }

    return result;
  }, [
    allPleitos,
    activeTab,
    effectiveSearchTerm,
    filterContractId,
    filterMonth,
    filterYear,
    filterLot,
    filterBudgetStatus,
    filterPendingBilling
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredPleitos.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * ITEMS_PER_PAGE;
  const displayedRows = filteredPleitos.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  const totalFiltered = filteredPleitos.length;
  const startItem = totalFiltered === 0 ? 0 : startIdx + 1;
  const endItem = totalFiltered === 0 ? 0 : Math.min(safePage * ITEMS_PER_PAGE, totalFiltered);

  const {
    rowActionMenu,
    rowForActionMenu: pleitoForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen
  } = useRowActionMenu(filteredPleitos);

  const isIntegratedFlux = embedded && hideTabs;
  const integratedMeta = isIntegratedFlux ? EMBEDDED_OS_TAB_META[activeTab] : null;

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, effectiveSearchTerm, filterContractId, filterMonth, filterYear, filterLot, filterBudgetStatus, filterPendingBilling]);

  const handleEditSuccess = () => {
    setPleitoToEdit(null);
    queryClient.invalidateQueries({ queryKey: ['pleitos', 'list-full'] });
  };

  const openEdit = (p: OsPleitoListItem) => {
    const contractId = p.updatedContract?.id ?? p.updatedContractId ?? null;
    if (!contractId) {
      toast.error('Esta OS não está vinculada a um contrato.');
      return;
    }
    setPleitoToEdit({
      pleito: { ...(p as unknown as PleitoFormData), id: p.id },
      contractId,
      contractDisplay: p.updatedContract
        ? `${p.updatedContract.name}${p.updatedContract.number ? ` — nº ${p.updatedContract.number}` : ''}`
        : undefined
    });
  };

  if (isLoading && allPleitos.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <Loading message="Carregando ordens de serviço..." size="md" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="w-full">
        <CardHeader className="border-b-0 pb-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-3">
              <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                <ClipboardList className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {integratedMeta?.title ?? 'Ordens de serviço'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {integratedMeta?.subtitle ?? 'Acompanhamento e controle das ordens de serviço'}
                </p>
              </div>
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              {!hideSearch && (
                <div className="relative min-w-[240px] flex-1 sm:w-[300px] sm:max-w-md sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    inputMode="search"
                    autoComplete="off"
                    placeholder="Buscar OS, descrição, contrato..."
                    value={effectiveSearchTerm}
                    onChange={(e) => setEffectiveSearchTerm(e.target.value)}
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                  {effectiveSearchTerm ? (
                    <button
                      type="button"
                      onClick={() => setEffectiveSearchTerm('')}
                      aria-label="Limpar busca"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              )}
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(true)}
                className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  hasActiveOsFilters
                    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Abrir filtros"
                title={hasActiveOsFilters ? 'Filtros ativos' : 'Filtros'}
              >
                <Filter className="h-4 w-4" />
                {hasActiveOsFilters ? (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                ) : null}
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {totalFiltered === 0 ? (
            <div className="py-8 text-center">
              <ClipboardList className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
              <p className="text-gray-600 dark:text-gray-400">Nenhuma ordem de serviço nesta fase</p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                {effectiveSearchTerm.trim() || hasActiveOsFilters
                  ? 'Tente ajustar a busca ou os filtros'
                  : 'As OS são cadastradas no módulo de Contratos'}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Mostrando {startItem} a {endItem} de {totalFiltered}{' '}
                  {totalFiltered === 1 ? 'ordem de serviço' : 'ordens de serviço'}
                </span>
                <span>
                  Página {safePage} de {totalPages}
                </span>
              </div>

              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className={`${cadastroListClasses.th} whitespace-nowrap align-middle`}>ID</th>
                      <th className={`${cadastroListClasses.thCenter} align-middle`}>Contrato</th>
                      <th className={`${cadastroListClasses.th} align-middle`}>Descrição</th>
                      <th className={`${cadastroListClasses.thCenter} align-middle`}>Status orçamento</th>
                      <th className={`${cadastroListClasses.thCenter} align-middle`}>Status execução</th>
                      <th className={`${cadastroListClasses.thCenter} align-middle whitespace-nowrap`}>
                        Faturamento (%)
                      </th>
                      <th className={`${cadastroListClasses.thCenter} align-middle whitespace-nowrap`}>
                        Data término
                      </th>
                      <th className={`${cadastroListClasses.thCenter} align-middle whitespace-nowrap`}>
                        Etiqueta
                      </th>
                      <th className={`${cadastroListClasses.thNumeric} align-middle`}>Orçamento</th>
                      <th className={`${listTableRowClasses.actionTh} align-middle`}>Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {displayedRows.map((p) => {
                      const etiqueta = getOsEtiquetaFromPleito(p);
                      const fatPct = getOsFaturamentoPct(p);
                      const contractId = p.updatedContract?.id ?? p.updatedContractId ?? null;
                      return (
                        <tr key={p.id} className={listTableRowClasses.tr}>
                          <td className={`${cadastroListClasses.tdMono} align-middle`}>
                            {formatOsSePastaOrDash(p.divSe, p.folderNumber)}
                          </td>
                          <td
                            className={`${cadastroListClasses.tdCenter} align-middle`}
                            title={p.updatedContract?.name || ''}
                          >
                            <span className="inline-block max-w-[14rem] truncate text-gray-900 dark:text-gray-100">
                              {p.updatedContract?.name ||
                                contractsForFilter.find((c) => c.id === contractId)?.name ||
                                '—'}
                            </span>
                          </td>
                          <td
                            className={`${cadastroListClasses.tdTruncate} align-middle`}
                            title={p.serviceDescription}
                          >
                            <span className="block truncate">{p.serviceDescription || '—'}</span>
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} align-middle`}>
                            <span
                              className={pleitoStatusReadOnlySpanClass('budget', p.budgetStatus)}
                              title={p.budgetStatus || ''}
                            >
                              {p.budgetStatus || '—'}
                            </span>
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} align-middle`}>
                            <span
                              className={pleitoStatusReadOnlySpanClass('execution', p.executionStatus)}
                              title={p.executionStatus || ''}
                            >
                              {p.executionStatus || '—'}
                            </span>
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} align-middle tabular-nums`}>
                            {fatPct != null ? `${fatPct.toFixed(1).replace('.', ',')}%` : '—'}
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} align-middle`}>
                            {formatDateBr(p.endDate)}
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} align-middle`}>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${osEtiquetaBadgeClass(etiqueta)}`}
                            >
                              {etiqueta}
                            </span>
                          </td>
                          <td
                            className={`${cadastroListClasses.tdNumeric} align-middle font-medium text-gray-900 dark:text-gray-100`}
                          >
                            {formatBudgetCurrency(p.budget)}
                          </td>
                          <RowActionMenuCell
                            isOpen={isRowMenuOpen(p.id)}
                            onToggle={(e) => toggleRowActionMenu(p.id, e.currentTarget)}
                          />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rowActionMenu && pleitoForActionMenu ? (
                  <RowActionMenuPortal
                    menu={rowActionMenu}
                    onClose={closeRowActionMenu}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    hideDefaultActions
                    extraItems={[
                      {
                        label: 'Editar',
                        onClick: () => {
                          closeRowActionMenu();
                          openEdit(pleitoForActionMenu);
                        },
                        icon: (
                          <Edit2 className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                        )
                      },
                      ...(pleitoForActionMenu.updatedContract?.id || pleitoForActionMenu.updatedContractId
                        ? [
                            {
                              label: 'Ver no contrato',
                              onClick: () => {
                                closeRowActionMenu();
                                const id =
                                  pleitoForActionMenu.updatedContract?.id ??
                                  pleitoForActionMenu.updatedContractId;
                                if (id) router.push(`/ponto/contratos/${id}`);
                              },
                              icon: (
                                <ExternalLink className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-400" />
                              )
                            }
                          ]
                        : []),
                      {
                        label: 'Excluir',
                        onClick: () => {
                          closeRowActionMenu();
                          setDeleteId(pleitoForActionMenu.id);
                        },
                        icon: (
                          <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                        )
                      }
                    ]}
                  />
                ) : null}
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:mt-6">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((pg) => Math.max(1, pg - 1))}
                    disabled={safePage === 1}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                  >
                    Anterior
                  </button>
                  {buildPaginationPageNumbers(safePage, totalPages).map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setCurrentPage(pageNumber)}
                      className={`rounded-md px-3 py-2 text-sm font-medium ${
                        pageNumber === safePage
                          ? 'bg-red-600 text-white'
                          : 'border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCurrentPage((pg) => Math.min(totalPages, pg + 1))}
                    disabled={safePage === totalPages}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                  >
                    Próxima
                  </button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Modal isOpen={isFiltersModalOpen} onClose={() => setIsFiltersModalOpen(false)} title="Filtros" size="lg">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Contrato
            </label>
            <StringSingleSelectDropdown
              value={filterContractId}
              onChange={setFilterContractId}
              options={contractFilterOptions}
              allowEmpty={false}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Mês de criação
            </label>
            <StringSingleSelectDropdown
              value={filterMonth}
              onChange={setFilterMonth}
              options={FILTER_MONTH_OPTIONS}
              allowEmpty={false}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Ano de criação
            </label>
            <StringSingleSelectDropdown
              value={filterYear}
              onChange={setFilterYear}
              options={FILTER_YEAR_OPTIONS}
              allowEmpty={false}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Lote
            </label>
            <input
              type="text"
              value={filterLot}
              onChange={(e) => setFilterLot(e.target.value)}
              placeholder="Contém..."
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Status orçamento
            </label>
            <StringSingleSelectDropdown
              value={filterBudgetStatus}
              onChange={setFilterBudgetStatus}
              options={FILTER_BUDGET_STATUS_OPTIONS}
              allowEmpty={false}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Pendente faturamento
            </label>
            <StringSingleSelectDropdown
              value={filterPendingBilling}
              onChange={(v) => setFilterPendingBilling((v as 'sim' | 'nao' | '') || '')}
              options={FILTER_PENDING_BILLING_OPTIONS}
              allowEmpty={false}
            />
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={clearOsFilters}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Limpar filtros
          </button>
          <button
            type="button"
            onClick={() => setIsFiltersModalOpen(false)}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            Aplicar
          </button>
        </div>
      </Modal>

      {pleitoToEdit?.contractId ? (
        <PleitoFormModal
          contractId={pleitoToEdit.contractId}
          contractDisplay={pleitoToEdit.contractDisplay}
          pleitoToEdit={pleitoToEdit.pleito}
          onClose={() => setPleitoToEdit(null)}
          onSuccess={handleEditSuccess}
        />
      ) : null}

      {deleteId && (
        <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black/50">
          <div className="absolute inset-0" onClick={() => setDeleteId(null)} />
          <div className="relative mx-4 max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <div className="mb-3 flex justify-center">
              <AlertCircle className="h-10 w-10 text-red-500" />
            </div>
            <p className="mb-4 text-center text-gray-700 dark:text-gray-300">
              Excluir esta ordem de serviço?
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm dark:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteId)}
                disabled={deleteMut.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {deleteMut.isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
