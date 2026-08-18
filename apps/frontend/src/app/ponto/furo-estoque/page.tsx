'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Filter, MoreVertical, PackageX, RotateCcw, Search, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { getListTableRowClassName, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import toast from 'react-hot-toast';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { formatRmListDisplayId } from '@/app/ponto/gerenciar-materiais/_lib/rmListDisplay';
import { formatOcListDisplayId } from '@/components/oc/ocListDisplay';
import { usePermissions } from '@/hooks/usePermissions';
import { resolveLockedUnbCostCenterId } from '@/lib/unbBranding';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

const FURO_STATUS_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'ABERTO', label: 'Aberto' },
  { value: 'RESOLVIDO', label: 'Resolvido' },
  { value: 'ALL', label: 'Todos' },
]);

const FURO_MONTH_FILTER_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos' },
  ...Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return {
      value: String(month),
      label: new Date(0, i).toLocaleString('pt-BR', { month: 'long' }),
    };
  }),
]);

const CATEGORIES = [
  'ACABAMENTO',
  'ADMINISTRATIVO',
  'ALVENARIA',
  'COBERTURA',
  'COMUNICAÇÃO VISUAL',
  'ELÉTRICA',
  'EPI',
  'FERRAMENTAS',
  'GASES MEDICINAIS',
  'HIDRÁULICA',
  'IMPERMEABILIZAÇÃO',
  'INCÊNDIO',
  'MARCENARIA',
  'MARMORARIA',
  'MATERIAL DE EXPEDIENTE',
  'PAISAGISMO',
  'PINTURA',
  'REFRIGERAÇÃO',
  'SERRALHERIA',
  'TELECOMUNICAÇÕES',
  'VIDRAÇARIA'
] as const;

const ITEMS_PER_PAGE = 12;

type ShortfallStatus = 'ABERTO' | 'RESOLVIDO';

type ShortfallRow = {
  id: string;
  orderNumber: string;
  status: ShortfallStatus;
  engineeringLabel: string;
  unit: string | null;
  orderedQty: unknown;
  receivedQty: unknown;
  gapQty: unknown;
  resolvedAt: string | null;
  resolvedBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  costCenter: { id: string; code: string; name: string } | null;
  constructionMaterial: { id: string; name: string; unit: string; category: string | null };
  purchaseOrder: {
    id: string;
    orderNumber: string;
    orderDate: string;
    supplier: { id: string; name: string } | null;
    materialRequest: {
      requestNumber: string;
      costCenter: { id: string; code: string; name: string } | null;
    } | null;
  };
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function shortfallCostCenterName(row: ShortfallRow): string {
  const cc = row.purchaseOrder.materialRequest?.costCenter || row.costCenter;
  return cc?.name || '—';
}

export default function FuroEstoquePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isUnbUser, unbCostCenterIds } = usePermissions();
  const [filtersCostCenterId, setFiltersCostCenterId] = useState('');
  const [filtersCategory, setFiltersCategory] = useState('');
  const [filtersMonth, setFiltersMonth] = useState('');
  const [filtersYear, setFiltersYear] = useState('');
  const [filtersSearch, setFiltersSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ABERTO' | 'RESOLVIDO' | 'ALL'>('ABERTO');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [listCurrentPage, setListCurrentPage] = useState(1);
  const [detail, setDetail] = useState<ShortfallRow | null>(null);

  const isFiltersExpanded =
    Boolean(filtersCostCenterId || filtersCategory || filtersMonth || filtersYear || filtersSearch) ||
    statusFilter !== 'ABERTO';

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetail(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail]);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: costCentersData } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: async () => {
      const res = await api.get('/cost-centers');
      return res.data;
    }
  });

  const costCenters = Array.isArray(costCentersData?.data)
    ? costCentersData.data
    : Array.isArray(costCentersData)
      ? costCentersData
      : [];

  const lockedUnbCostCenterId = useMemo(() => {
    if (!isUnbUser) return null;
    return resolveLockedUnbCostCenterId(costCenters, unbCostCenterIds);
  }, [isUnbUser, costCenters, unbCostCenterIds]);

  useEffect(() => {
    if (!lockedUnbCostCenterId) return;
    setFiltersCostCenterId(lockedUnbCostCenterId);
  }, [lockedUnbCostCenterId]);

  const { data: shortfallsRes, isLoading: loadingShortfalls } = useQuery({
    queryKey: [
      'stock-shortfalls',
      filtersCostCenterId,
      filtersCategory,
      filtersMonth,
      filtersYear,
      filtersSearch,
      statusFilter
    ],
    queryFn: async () => {
      const res = await api.get('/stock/shortfalls', {
        params: {
          costCenterId: filtersCostCenterId || undefined,
          category: filtersCategory || undefined,
          month: filtersMonth || undefined,
          year: filtersYear || undefined,
          search: filtersSearch.trim() || undefined,
          status: statusFilter,
          limit: 300
        }
      });
      return res.data;
    }
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/stock/shortfalls/${id}/resolve`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-shortfalls'] });
      queryClient.invalidateQueries({ queryKey: ['stock-shortfalls-pending-count'] });
      setDetail(null);
      toast.success('Furo encerrado como Resolvido.');
    },
    onError: (e: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(e.response?.data?.message || e.message || 'Erro ao encerrar')
  });

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const costCenterFilterOptions = useMemo(() => {
    const mapped = costCenters.map((cc: { id: string; name: string }) => ({
      value: cc.id,
      label: cc.name,
      searchText: cc.name,
    }));
    if (lockedUnbCostCenterId) {
      return mapped.filter((opt: { value: string }) => opt.value === lockedUnbCostCenterId);
    }
    return [{ value: '', label: 'Todos', searchText: 'Todos' }, ...mapped];
  }, [costCenters, lockedUnbCostCenterId]);

  const categoryFilterOptions = useMemo(
    () => [
      { value: '', label: 'Todas', searchText: 'Todas' },
      ...CATEGORIES.map((cat) => ({ value: cat, label: cat, searchText: cat })),
    ],
    []
  );

  const yearFilterOptions = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => ({
        value: String(year),
        label: String(year),
      })),
    []
  );
  const rows: ShortfallRow[] = shortfallsRes?.data || [];

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));
  const startIndex = (listCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedRows = useMemo(
    () => rows.slice(startIndex, endIndex),
    [rows, startIndex, endIndex]
  );
  const startItem = totalRows === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(endIndex, totalRows);

  const clearFilters = () => {
    setFiltersCostCenterId(lockedUnbCostCenterId || '');
    setFiltersCategory('');
    setFiltersMonth('');
    setFiltersYear(String(new Date().getFullYear()));
    setFiltersSearch('');
    setStatusFilter('ABERTO');
    setListCurrentPage(1);
  };

  useEffect(() => {
    setListCurrentPage(1);
  }, [filtersCostCenterId, filtersCategory, filtersMonth, filtersYear, filtersSearch, statusFilter]);

  useEffect(() => {
    if (listCurrentPage > totalPages) {
      setListCurrentPage(totalPages);
    }
  }, [listCurrentPage, totalPages]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/furo-estoque">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Furo de estoque</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Materiais ainda não totalmente recebidos após entrada parcial na OC.
            </p>
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <PackageX className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Furos de estoque</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Pendências de recebimento por ordem de compra e material
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  {isFiltersExpanded && (
                    <button
                      type="button"
                      onClick={() => {
                        setFiltersCostCenterId(lockedUnbCostCenterId || '');
                        setFiltersCategory('');
                        setFiltersMonth('');
                        setFiltersYear('');
                        setFiltersSearch('');
                        setStatusFilter('ABERTO');
                      }}
                      className="flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Limpar filtros"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  )}
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={filtersSearch}
                      onChange={(e) => setFiltersSearch(e.target.value)}
                      placeholder="Pesquisar OC, material..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {filtersSearch && (
                      <button
                        type="button"
                        onClick={() => setFiltersSearch('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFiltersModalOpen(true)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    aria-label="Abrir filtro"
                    title="Filtro"
                  >
                    <Filter className="h-4 w-4" />
                  </button>
                </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingShortfalls ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 dark:text-gray-400">Carregando furos...</p>
                </div>
              ) : totalRows === 0 ? (
                <div className="text-center py-8">
                  <PackageX className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhum furo encontrado</p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                    Ajuste os filtros para exibir outras pendências
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {startItem} a {endItem} de {totalRows} furos
                    </span>
                    <span>
                      Página {listCurrentPage} de {totalPages}
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            OC
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Material
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Categoria
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Centro de Custo
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Pedido
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Recebido
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Falta
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Unidade de medida
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Situação
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {paginatedRows.map((row) => (
                          <tr
                            key={row.id}
                            onClick={() => setDetail(row)}
                            className={getListTableRowClassName(true)}
                          >
                            <td className="px-3 sm:px-6 py-3 text-sm whitespace-nowrap">
                              <ListRowNavigableLabel className="font-medium">
                                {formatOcListDisplayId(row.orderNumber)}
                              </ListRowNavigableLabel>
                            </td>
                            <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {row.constructionMaterial.name}
                            </td>
                            <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {row.constructionMaterial.category || '—'}
                            </td>
                            <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {shortfallCostCenterName(row)}
                            </td>
                            <td className="px-3 sm:px-6 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                              {num(row.orderedQty).toLocaleString('pt-BR')}
                            </td>
                            <td className="px-3 sm:px-6 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                              {num(row.receivedQty).toLocaleString('pt-BR')}
                            </td>
                            <td className="px-3 sm:px-6 py-3 text-sm text-right font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
                              {num(row.gapQty).toLocaleString('pt-BR')}
                            </td>
                            <td className="px-3 sm:px-6 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                              {row.unit || row.constructionMaterial.unit || '—'}
                            </td>
                            <td className="px-3 sm:px-6 py-3 text-center">
                              <span
                                className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium ${
                                  row.status === 'ABERTO'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                                }`}
                              >
                                {row.status === 'ABERTO' ? 'Aberto' : 'Resolvido'}
                              </span>
                            </td>
                            <td className="px-3 sm:px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setDetail(row)}
                                className={rowActionMenuButtonClass(false)}
                                aria-label="Ver detalhes"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setListCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={listCurrentPage === 1}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() => setListCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                        disabled={listCurrentPage === totalPages}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        Próxima
                      </button>
                    </div>
                  )}
                </>
              )}
            </CardContent>

            {isFiltersModalOpen && (
              <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
                <div className="absolute inset-0 bg-black/40" onClick={() => setIsFiltersModalOpen(false)} />
                <div className="relative mx-4 w-full max-w-2xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
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
                  <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Centro de Custo
                        </label>
                        <StringSingleSelectDropdown
                          value={filtersCostCenterId}
                          onChange={setFiltersCostCenterId}
                          options={costCenterFilterOptions}
                          allowEmpty={false}
                          disabled={Boolean(lockedUnbCostCenterId)}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Categoria
                        </label>
                        <StringSingleSelectDropdown
                          value={filtersCategory}
                          onChange={setFiltersCategory}
                          options={categoryFilterOptions}
                          allowEmpty={false}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Mês
                        </label>
                        <StringSingleSelectDropdown
                          value={filtersMonth}
                          onChange={setFiltersMonth}
                          options={FURO_MONTH_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Ano
                        </label>
                        <StringSingleSelectDropdown
                          value={filtersYear}
                          onChange={setFiltersYear}
                          options={yearFilterOptions}
                          allowEmpty={false}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Situação
                        </label>
                        <StringSingleSelectDropdown
                          value={statusFilter}
                          onChange={(v) => setStatusFilter(v as typeof statusFilter)}
                          options={FURO_STATUS_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={clearFilters}
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
            )}
          </Card>

          {detail && (
            <AppModalOverlay
              className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/50"
              role="dialog"
              aria-modal="true"
            >
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Fechar"
                onClick={() => setDetail(null)}
              />
              <div className="relative z-10 w-full max-w-lg max-h-[min(90vh,32rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 pr-2">
                    Detalhe do furo — {formatOcListDisplayId(detail.orderNumber)}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setDetail(null)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 space-y-3 text-sm text-gray-800 dark:text-gray-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Situação</span>
                      <p className="font-medium">{detail.status === 'ABERTO' ? 'Aberto' : 'Resolvido'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Fornecedor</span>
                      <p className="font-medium">{detail.purchaseOrder.supplier?.name || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Requisição (RM)</span>
                      <p className="font-medium">
                        {formatRmListDisplayId(detail.purchaseOrder.materialRequest?.requestNumber)}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Centro de custo</span>
                      <p className="font-medium">{shortfallCostCenterName(detail)}</p>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Material (estoque)</span>
                      <span className="font-medium">{detail.constructionMaterial.name}</span>
                    </p>
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Descrição na OC</span>
                      <span>{detail.engineeringLabel}</span>
                    </p>
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Categoria</span>
                      <span>{detail.constructionMaterial.category || '—'}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">Pedido</span>
                        <span className="font-semibold">{num(detail.orderedQty).toLocaleString('pt-BR')}</span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">Recebido</span>
                        <span className="font-semibold">{num(detail.receivedQty).toLocaleString('pt-BR')}</span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">Falta</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          {num(detail.gapQty).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">Unidade de medida</span>
                        <span>{detail.unit || detail.constructionMaterial.unit || '—'}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Atualizado em {new Date(detail.updatedAt).toLocaleString('pt-BR')}
                    </p>
                    {detail.status === 'RESOLVIDO' && (
                      <p className="text-xs text-gray-600 dark:text-gray-300">
                        Resolvido em{' '}
                        {detail.resolvedAt ? new Date(detail.resolvedAt).toLocaleString('pt-BR') : '—'}
                        {detail.resolvedBy ? ` por ${detail.resolvedBy.name}` : ''}
                      </p>
                    )}
                  </div>
                  {detail.status === 'ABERTO' && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex justify-end">
                      <button
                        type="button"
                        disabled={resolveMutation.isPending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              'Encerrar este furo como Resolvido? Use quando a pendência foi tratada (ex.: acordo com fornecedor ou ajuste manual).'
                            )
                          ) {
                            return;
                          }
                          resolveMutation.mutate(detail.id);
                        }}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {resolveMutation.isPending ? 'Salvando…' : 'Encerrar como Resolvido'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </AppModalOverlay>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
