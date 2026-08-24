'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, FileText, Filter, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { ListPagination } from '@/components/ui/ListPagination';
import { FichaDemandaPurchaseStatusModal } from '@/components/suprimentos/FichaDemandaPurchaseStatusModal';
import api from '@/lib/api';
import { getListTableRowClassName, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import {
  fdPurchaseStatusBadgeClass,
  formatCurrencyDisplay,
  purchaseStatusLabel,
  type DemandSheetPurchaseStatus,
  type FichaDemandaApprovalRecord,
} from '@/lib/fichaDemandaApproval';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

const ITEMS_PER_PAGE = 20;

type PurchaseStatusFilter = 'ALL' | 'NONE' | DemandSheetPurchaseStatus;

const PURCHASE_STATUS_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'ALL', label: 'Todos' },
  { value: 'NONE', label: 'Sem status' },
  { value: 'WAREHOUSE_DF', label: 'Almoxarifado DF' },
  { value: 'WAREHOUSE_GO', label: 'Almoxarifado GO' },
  { value: 'FULLY_FULFILLED_BY_STOCK', label: 'Atendida totalmente pelo estoque' },
  { value: 'PARTIALLY_FULFILLED_BY_STOCK', label: 'Atendida parcialmente pelo estoque' },
  { value: 'PURCHASE_REQUEST', label: 'Solicitação de compra' },
  { value: 'SUPPLIES', label: 'Suprimentos' },
  { value: 'FINISHED', label: 'Finalizado' },
]);

export default function FdsAprovadasPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<PurchaseStatusFilter>('ALL');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<FichaDemandaApprovalRecord | null>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const { data: listData, isLoading: loadingList } = useQuery({
    queryKey: ['demand-sheet-approvals', 'aprovadas-compras', searchTerm, purchaseStatusFilter],
    queryFn: async () => {
      const res = await api.get('/demand-sheet-approvals/aprovadas-compras', {
        params: {
          search: searchTerm || undefined,
          purchaseStatus: purchaseStatusFilter !== 'ALL' ? purchaseStatusFilter : undefined,
        },
      });
      return (res.data?.data || []) as FichaDemandaApprovalRecord[];
    },
    enabled: !loadingUser,
  });

  const records = listData || [];
  const totalFiltered = records.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = records.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const startItem = totalFiltered === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(startIndex + ITEMS_PER_PAGE, totalFiltered);
  const isListEmpty = !loadingList && totalFiltered === 0;
  const hasActiveFilter = purchaseStatusFilter !== 'ALL';

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, purchaseStatusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      purchaseStatus,
    }: {
      id: string;
      purchaseStatus: DemandSheetPurchaseStatus;
    }) => {
      const res = await api.patch(`/demand-sheet-approvals/${id}/purchase-status`, {
        purchaseStatus,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Status de compras atualizado.');
      setSelectedRecord(null);
      void queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao atualizar status');
    },
  });

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/fds-aprovadas">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              FD&apos;s Aprovadas
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Fichas de demanda aprovadas pelo gestor. O compras define o status de atendimento.
            </p>
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <ClipboardCheck className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      FD&apos;s Aprovadas
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Atualize o status de compras de cada ficha
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="search"
                      placeholder="Buscar por código FD, pedido, contrato..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFiltersOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasActiveFilter
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={hasActiveFilter ? 'Filtro (status ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilter ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingList ? (
                <div className="py-8 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="loading-spinner h-6 w-6" />
                    <span className="text-gray-600 dark:text-gray-400">Carregando fichas...</span>
                  </div>
                </div>
              ) : isListEmpty ? (
                <div className="py-8 text-center">
                  <ClipboardCheck className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhuma ficha aprovada encontrada</p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {startItem} a {endItem} de {totalFiltered}{' '}
                      {totalFiltered === 1 ? 'ficha' : 'fichas'}
                    </span>
                    <span>
                      Página {currentPage} de {totalPages}
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Cód. FD
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Contrato
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Obra
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Solicitante
                          </th>
                          <th className="px-3 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Faturamento
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Status compras
                          </th>
                          <th className="min-w-[7rem] px-3 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {paginatedRows.map((row) => (
                          <tr
                            key={row.id}
                            onClick={() => setSelectedRecord(row)}
                            className={getListTableRowClassName(true)}
                          >
                            <td className="px-3 py-4 sm:px-6">
                              <ListRowNavigableLabel className="font-medium">{row.codFichaDemanda}</ListRowNavigableLabel>
                            </td>
                            <td
                              className="max-w-[220px] truncate px-3 py-4 text-gray-900 dark:text-gray-100 sm:px-6"
                              title={row.contratoNome}
                            >
                              {row.contratoNome}
                            </td>
                            <td className="px-3 py-4 text-gray-900 dark:text-gray-100 sm:px-6">
                              {row.obra}
                            </td>
                            <td className="px-3 py-4 text-gray-900 dark:text-gray-100 sm:px-6">
                              {row.solicitanteNome}
                            </td>
                            <td className="px-3 py-4 text-right tabular-nums text-gray-900 dark:text-gray-100 sm:px-6">
                              {formatCurrencyDisplay(row.faturamentoEstimado)}
                            </td>
                            <td className="px-3 py-4 text-center sm:px-6">
                              <span
                                className={`inline-flex max-w-[220px] rounded-full px-2.5 py-0.5 text-xs font-semibold ${fdPurchaseStatusBadgeClass(row.purchaseStatus)}`}
                                title={purchaseStatusLabel(row.purchaseStatus)}
                              >
                                {purchaseStatusLabel(row.purchaseStatus)}
                              </span>
                            </td>
                            <td className="px-3 py-4 text-right sm:px-6" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setSelectedRecord(row)}
                                className={rowActionMenuButtonClass(false)}
                                aria-label="Atualizar status de compras"
                              >
                                <FileText className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ListPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <FichaDemandaPurchaseStatusModal
          record={selectedRecord}
          isOpen={!!selectedRecord}
          isSaving={updateStatusMutation.isPending}
          onClose={() => setSelectedRecord(null)}
          onSave={(purchaseStatus) => {
            if (!selectedRecord) return;
            updateStatusMutation.mutate({ id: selectedRecord.id, purchaseStatus });
          }}
        />

        <Modal
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          title="Filtros — FD's Aprovadas"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Status de compras
              </label>
              <StringSingleSelectDropdown
                value={purchaseStatusFilter}
                onChange={(value) => setPurchaseStatusFilter(value as PurchaseStatusFilter)}
                options={PURCHASE_STATUS_FILTER_OPTIONS}
                allowEmpty={false}
                className="w-full"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setPurchaseStatusFilter('ALL')}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Aplicar
              </button>
            </div>
          </div>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
