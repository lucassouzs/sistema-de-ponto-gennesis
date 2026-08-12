'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Filter, PackageCheck, Search, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';
import api from '@/lib/api';
import { RowActionMenuCell } from '@/components/ui/RowActionMenu';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { getListTableRowClassName, listTableRowClasses, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import toast from 'react-hot-toast';
import { formatRmListDisplayId } from '@/app/ponto/gerenciar-materiais/_lib/rmListDisplay';
import {
  CURRENT_STATUS_OPTIONS,
  DELIVERY_TYPE_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  POLO_OPTIONS,
  formatCurrency,
  formatDate,
  isDeliveryDateOverdue,
  normalizeDeliveryType,
  shortfallTypeLabel,
  statusBadge,
  type CurrentStatusValue,
  type FinalStatusValue,
  type PaymentStatusValue,
  type PoloValue,
  type StockShortfallTypeValue,
} from '@/components/suprimentos/materialDeliveryLabels';

type MaterialDeliveryRow = {
  id: string;
  deliveryNumber: string;
  polo: PoloValue;
  movementId: string | null;
  movementNumber: string | null;
  currentStatus: CurrentStatusValue;
  paymentStatus: PaymentStatusValue;
  supplierName: string | null;
  purchaseOrderId: string | null;
  orderValue: string | number | null;
  expectedDelivery: string | null;
  totalPaid: string | number | null;
  stockShortfallType: StockShortfallTypeValue | null;
  rmNumber: string | null;
  deliveryType: string | null;
  observations: string | null;
  finalStatus: FinalStatusValue;
  receivedByEngineering: boolean;
  receivedAt: string | null;
  supplier: { id: string; code: string; name: string } | null;
  purchaseOrder: { id: string; orderNumber: string; status: string } | null;
  receivedByUser: { id: string; name: string } | null;
  contractRecord: { id: string; name: string; number: string } | null;
};

type ViewTab = 'pending' | 'received';

function getListHeaderConfig(viewTab: ViewTab) {
  if (viewTab === 'received') {
    return {
      Icon: CheckCircle2,
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      iconColor: 'text-green-600 dark:text-green-400',
      title: 'Entregas Recebidas',
      subtitle: 'Exibindo entregas já confirmadas pela engenharia',
    };
  }
  return {
    Icon: PackageCheck,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    title: 'Entregas Pendentes',
    subtitle: 'Exibindo entregas com recebimento de engenharia pendente',
  };
}

const ITEMS_PER_PAGE = 12;

const ENGINEERING_RECEIPT_STATUS = {
  received: {
    label: 'Recebido',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  },
  pending: {
    label: 'Pendente',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  },
} as const;

const NO_FOCUS =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0';

const searchInputClassName = `h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${NO_FOCUS}`;

const thBase =
  'px-3 sm:px-6 py-3 align-middle text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap';
const thLeftClass = `${thBase} text-left`;
const thCenterClass = `${thBase} text-center`;
const tdBase = 'px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300';
const tdLeftClass = `${tdBase} text-left`;
const tdCenterClass = `${tdBase} text-center`;
const tdTruncateCenterClass = `${tdCenterClass} truncate`;
const tdPillClass = `${tdCenterClass}`;

function supplierLabel(row: MaterialDeliveryRow): string {
  return row.supplier?.name ?? row.supplierName ?? '—';
}

function contractLabel(row: MaterialDeliveryRow): string {
  return row.contractRecord?.name ?? '—';
}

function deliveryTypeLabel(value: string | null | undefined): string {
  const normalized = normalizeDeliveryType(value);
  if (!normalized) return '—';
  return DELIVERY_TYPE_OPTIONS.find((o) => o.value === normalized)?.label ?? '—';
}

function StatusPill({
  value,
  options,
}: {
  value: string;
  options: readonly { value: string; label: string; className: string }[];
}) {
  const badge = statusBadge(value, options);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function DetailField({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  );
}

export default function RecebimentoEntregasPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [poloFilter, setPoloFilter] = useState('');
  const [viewTab, setViewTab] = useState<ViewTab>('pending');
  const [listCurrentPage, setListCurrentPage] = useState(1);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [detailRowId, setDetailRowId] = useState<string | null>(null);
  const [confirmRow, setConfirmRow] = useState<MaterialDeliveryRow | null>(null);

  const closeDetailModal = () => setDetailRowId(null);

  const poloSelectOptions = useMemo(
    () => POLO_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
  );

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const { data: summaryRes } = useQuery({
    queryKey: ['material-deliveries-summary-recebimento'],
    queryFn: async () => {
      const res = await api.get('/material-deliveries/summary', {
        params: { forRecebimento: 'true' },
      });
      return res.data;
    },
  });

  const { data: listRes, isLoading: loadingList } = useQuery({
    queryKey: ['material-deliveries-recebimento', search, poloFilter, viewTab],
    queryFn: async () => {
      const res = await api.get('/material-deliveries', {
        params: {
          search: search.trim() || undefined,
          polo: poloFilter || undefined,
          awaitingEngineering: viewTab === 'pending' ? 'true' : undefined,
          receivedByEngineering: viewTab === 'received' ? 'true' : undefined,
          forRecebimento: 'true',
          limit: 300,
        },
      });
      return res.data;
    },
  });

  const items: MaterialDeliveryRow[] = listRes?.data ?? [];
  const detailRow = useMemo(
    () => (detailRowId ? items.find((row) => row.id === detailRowId) ?? null : null),
    [items, detailRowId]
  );
  const summary = summaryRes?.data ?? { awaitingEngineering: 0, delivered: 0 };
  const listHeader = useMemo(() => getListHeaderConfig(viewTab), [viewTab]);
  const ListHeaderIcon = listHeader.Icon;

  const totalRows = items.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));
  const startIndex = (listCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );
  const startItem = totalRows === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(endIndex, totalRows);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu<MaterialDeliveryRow>(paginatedItems);

  useEffect(() => {
    setListCurrentPage(1);
  }, [search, poloFilter, viewTab]);

  useEffect(() => {
    if (listCurrentPage > totalPages) {
      setListCurrentPage(totalPages);
    }
  }, [listCurrentPage, totalPages]);

  const receiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-deliveries/${id}/receive`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-recebimento'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary-recebimento'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-recebimento-pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary'] });
      toast.success('Recebimento confirmado');
      closeDetailModal();
      setConfirmRow(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao confirmar recebimento');
    },
  });

  const clearFilters = () => {
    setPoloFilter('');
    setSearch('');
    setViewTab('pending');
    setListCurrentPage(1);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/recebimento-entregas">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-8">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Recebimento de Entregas
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Confirme o recebimento de material na obra. Esta tela é exclusiva para a engenharia.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            <FilterStatCard
              label="Pendentes"
              count={summary.awaitingEngineering}
              icon={PackageCheck}
              iconBg="bg-amber-100 dark:bg-amber-900/30"
              iconColor="text-amber-600 dark:text-amber-400"
              isActive={viewTab === 'pending'}
              onClick={() => setViewTab('pending')}
            />
            <FilterStatCard
              label="Recebidas"
              count={summary.delivered}
              icon={CheckCircle2}
              iconBg="bg-green-100 dark:bg-green-900/30"
              iconColor="text-green-600 dark:text-green-400"
              isActive={viewTab === 'received'}
              onClick={() => setViewTab('received')}
            />
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 sm:p-3 rounded-lg ${listHeader.iconBg}`}>
                    <ListHeaderIcon className={`w-5 h-5 sm:w-6 sm:h-6 ${listHeader.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {listHeader.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{listHeader.subtitle}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar ID, contrato, fornecedor, OC..."
                      className={searchInputClassName}
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFiltersOpen(true)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    aria-label="Abrir filtro"
                    title="Filtro"
                  >
                    <Filter className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingList ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 dark:text-gray-400">Carregando entregas...</p>
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    {viewTab === 'pending'
                      ? 'Nenhuma entrega com recebimento pendente'
                      : 'Nenhuma entrega recebida encontrada'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                    {viewTab === 'pending'
                      ? 'Quando o material chegar na obra, confirme o recebimento aqui'
                      : 'Ajuste os filtros para ver outras entregas'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {startItem} a {endItem} de {totalRows} entrega
                      {totalRows !== 1 ? 's' : ''}
                    </span>
                    <span>
                      Página {listCurrentPage} de {totalPages}
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={thLeftClass}>ID</th>
                          <th className={thCenterClass}>N° RM</th>
                          <th className={thCenterClass}>ID Mov</th>
                          <th className={thCenterClass}>Nº Mov</th>
                          <th className={thCenterClass}>Contrato</th>
                          <th className={thCenterClass}>Recebimento engenharia</th>
                          <th className={thCenterClass}>Previsão</th>
                          {viewTab === 'pending' ? (
                            <th className={listTableRowClasses.actionTh}>Ação</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {paginatedItems.map((row) => {
                          const isOverdue =
                            !row.receivedByEngineering &&
                            row.currentStatus !== 'ENTREGUE' &&
                            row.currentStatus !== 'CANCELADO' &&
                            isDeliveryDateOverdue(row.expectedDelivery);
                          const receipt = row.receivedByEngineering
                            ? ENGINEERING_RECEIPT_STATUS.received
                            : ENGINEERING_RECEIPT_STATUS.pending;

                          return (
                            <tr
                              key={row.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setDetailRowId(row.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setDetailRowId(row.id);
                                }
                              }}
                              className={getListTableRowClassName(
                                true,
                                isOverdue ? 'bg-red-50/60 dark:bg-red-950/20' : undefined
                              )}
                            >
                              <td className={`${tdLeftClass} whitespace-nowrap`}>
                                <ListRowNavigableLabel className="font-medium">
                                  {row.deliveryNumber}
                                </ListRowNavigableLabel>
                              </td>
                              <td className={`${tdCenterClass} whitespace-nowrap`}>
                                {formatRmListDisplayId(row.rmNumber)}
                              </td>
                              <td className={`${tdCenterClass} whitespace-nowrap`}>{row.movementId ?? '—'}</td>
                              <td className={`${tdCenterClass} whitespace-nowrap`}>{row.movementNumber ?? '—'}</td>
                              <td className={tdCenterClass} title={`${contractLabel(row)} · ${row.polo}`}>
                                <span className="inline-flex flex-col items-center gap-0.5">
                                  <span className="max-w-[160px] truncate">{contractLabel(row)}</span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{row.polo}</span>
                                </span>
                              </td>
                              <td className={tdPillClass}>
                                <div className="flex justify-center">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${receipt.className}`}
                                  >
                                    {receipt.label}
                                  </span>
                                </div>
                              </td>
                              <td className={`${tdCenterClass} whitespace-nowrap`}>
                                {row.expectedDelivery ? (
                                  <span>
                                    {formatDate(row.expectedDelivery)}
                                    {isOverdue && (
                                      <span className="ml-1 text-xs font-medium text-red-600 dark:text-red-400">
                                        atrasada
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">—</span>
                                )}
                              </td>
                              {viewTab === 'pending' ? (
                                !row.receivedByEngineering ? (
                                  <RowActionMenuCell
                                    align="center"
                                    isOpen={isRowMenuOpen(row.id)}
                                    onToggle={(e) =>
                                      toggleRowActionMenu(row.id, e.currentTarget as HTMLButtonElement)
                                    }
                                  />
                                ) : (
                                  <td className={`${listTableRowClasses.actionTd} text-center`}>
                                    <span className="text-xs text-gray-400">—</span>
                                  </td>
                                )
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {rowActionMenu &&
                    rowForActionMenu &&
                    viewTab === 'pending' &&
                    !rowForActionMenu.receivedByEngineering && (
                      <ActionMenuOverlay
                        open
                        onClose={closeRowActionMenu}
                        top={rowActionMenu.top}
                        left={rowActionMenu.left}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          disabled={receiveMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            closeRowActionMenu();
                            setConfirmRow(rowForActionMenu);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                          <span>Confirmar recebimento</span>
                        </button>
                      </ActionMenuOverlay>
                    )}

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
          </Card>
        </div>

        <Modal isOpen={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} title="Filtros">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Situação</label>
              <div className="flex gap-2">
                <ButtonSeg
                  active={viewTab === 'pending'}
                  onClick={() => setViewTab('pending')}
                  label="Pendentes"
                />
                <ButtonSeg
                  active={viewTab === 'received'}
                  onClick={() => setViewTab('received')}
                  label="Recebidas"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Polo</label>
              <SingleSelectSearchDropdown
                value={poloFilter}
                onChange={setPoloFilter}
                options={poloSelectOptions}
                placeholder="Todos"
                emptyOptionLabel="Todos"
                noFocusRing
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  clearFilters();
                  setIsFiltersOpen(false);
                }}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersOpen(false)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white"
              >
                Aplicar
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={Boolean(detailRow)}
          onClose={closeDetailModal}
          title={detailRow ? `Entrega ${detailRow.deliveryNumber}` : 'Detalhes da entrega'}
          size="lg"
        >
          {detailRow ? (
            <div className="space-y-6">
              <DetailSection title="Identificação">
                <DetailField label="N° RM">{formatRmListDisplayId(detailRow.rmNumber)}</DetailField>
                <DetailField label="ID Mov">{detailRow.movementId || '—'}</DetailField>
                <DetailField label="Nº Mov">{detailRow.movementNumber || '—'}</DetailField>
                <DetailField label="Contrato">{contractLabel(detailRow)}</DetailField>
                <DetailField label="Polo">{detailRow.polo}</DetailField>
                <DetailField label="Fornecedor" className="sm:col-span-2">
                  {supplierLabel(detailRow)}
                </DetailField>
                <DetailField label="Status atual">
                  <StatusPill value={detailRow.currentStatus} options={CURRENT_STATUS_OPTIONS} />
                </DetailField>
                <DetailField label="Pagamento">
                  {statusBadge(detailRow.paymentStatus, PAYMENT_STATUS_OPTIONS).label}
                </DetailField>
                <DetailField label="Valor OC">
                  <span className="tabular-nums">{formatCurrency(detailRow.orderValue)}</span>
                </DetailField>
                <DetailField label="Valor total pago">
                  <span className="tabular-nums">{formatCurrency(detailRow.totalPaid)}</span>
                </DetailField>
              </DetailSection>

              <DetailSection title="Entrega">
                <DetailField label="Previsão de entrega">
                  {detailRow.expectedDelivery ? (
                    <span>
                      {formatDate(detailRow.expectedDelivery)}
                      {isDeliveryDateOverdue(detailRow.expectedDelivery) &&
                        !detailRow.receivedByEngineering &&
                        detailRow.currentStatus !== 'ENTREGUE' &&
                        detailRow.currentStatus !== 'CANCELADO' && (
                          <span className="ml-1 text-xs font-medium text-red-600 dark:text-red-400">
                            atrasada
                          </span>
                        )}
                    </span>
                  ) : (
                    '—'
                  )}
                </DetailField>
                <DetailField label="Tipo de entrega">
                  {deliveryTypeLabel(detailRow.deliveryType)}
                </DetailField>
                <DetailField label="Recebimento engenharia">
                  {(() => {
                    const receipt = detailRow.receivedByEngineering
                      ? ENGINEERING_RECEIPT_STATUS.received
                      : ENGINEERING_RECEIPT_STATUS.pending;
                    return (
                      <span className="inline-flex flex-col gap-1">
                        <span
                          className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${receipt.className}`}
                        >
                          {receipt.label}
                        </span>
                        {detailRow.receivedByEngineering && detailRow.receivedByUser?.name ? (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            por {detailRow.receivedByUser.name}
                            {detailRow.receivedAt ? ` · ${formatDate(detailRow.receivedAt)}` : ''}
                          </span>
                        ) : null}
                      </span>
                    );
                  })()}
                </DetailField>
                <DetailField label="Furo estoque">
                  {detailRow.stockShortfallType
                    ? shortfallTypeLabel(detailRow.stockShortfallType)
                    : '—'}
                </DetailField>
              </DetailSection>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Observações
                </h3>
                <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                  {detailRow.observations || '—'}
                </p>
              </section>

              <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={closeDetailModal}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : null}
        </Modal>

        <Modal
          isOpen={Boolean(confirmRow)}
          onClose={() => setConfirmRow(null)}
          confirmBeforeClose={false}
      title="Confirmar recebimento"
        >
          {confirmRow ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Confirma que o material da entrega <strong>#{confirmRow.deliveryNumber}</strong>{' '}
                foi recebido na obra?
              </p>
              <dl className="grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-4 text-sm dark:bg-gray-800/50 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">N° RM</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {formatRmListDisplayId(confirmRow.rmNumber)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">ID Mov</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {confirmRow.movementId ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">Contrato</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {contractLabel(confirmRow)} ({confirmRow.polo})
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">Nº Mov</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {confirmRow.movementNumber ?? '—'}
                  </dd>
                </div>
              </dl>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmRow(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => receiveMutation.mutate(confirmRow.id)}
                  disabled={receiveMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {receiveMutation.isPending ? 'Confirmando...' : 'Confirmar recebimento'}
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
