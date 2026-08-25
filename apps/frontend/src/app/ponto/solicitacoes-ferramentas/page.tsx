'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Banknote,
  Building2,
  CheckCircle,
  Clock,
  Eye,
  Search,
  Wrench,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Loading } from '@/components/ui/Loading';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import {
  cadastroListClasses,
  getListTableRowClassName,
  RowActionMenuCell,
  RowActionMenuPortal,
  type RowActionMenuExtraItem,
} from '@/components/ui/RowActionMenu';
import { ListRowNavigableLabel } from '@/components/ui/listTableUi';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { useLogout } from '@/hooks/useLogout';
import { authService } from '@/lib/auth';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import {
  formatToolRentalDemand,
  formatToolRentalLogistics,
  formatToolRentalPriority,
  formatToolRentalStatus,
  toolRentalStatusBadgeClass,
  type ToolRentalDemandType,
  type ToolRentalLogisticsMode,
  type ToolRentalPriority,
  type ToolRentalRequestStatus,
} from '@/lib/toolRentalLabels';
import { buildToolRentalTimeline, type ToolRentalTimelineEvent } from '@/lib/toolRentalTimeline';
import {
  DpRequestHistoryModalTabs,
  DpRequestHistoryTimeline,
  type DpRequestHistoryModalTab,
} from '@/lib/dpRequestHistoryModal';

type ToolRentalRequest = {
  id: string;
  code: string;
  polo: string;
  contrato: string;
  obra: string;
  titulo: string;
  equipamento: string;
  demandType: ToolRentalDemandType;
  logisticsMode?: ToolRentalLogisticsMode;
  priority: ToolRentalPriority;
  status: ToolRentalRequestStatus;
  periodoInicio: string;
  periodoFim: string;
  linkSugestao?: string | null;
  supplierName?: string | null;
  ocMirrorUrl?: string | null;
  ocMirrorName?: string | null;
  paymentProofUrl?: string | null;
  paymentProofName?: string | null;
  suppliesApprovalComment?: string | null;
  suppliesRejectionReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  suppliesApprovedAt?: string | null;
  assignedUser?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  suppliesApprovedBy?: { id: string; name: string } | null;
  events?: ToolRentalTimelineEvent[];
};

type StatusFilter =
  | 'OPEN'
  | 'SUPPLIER_RELATION'
  | 'AWAITING_PAYMENT'
  | 'COMPLETED'
  | 'ALL';

function formatDateOnly(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-gray-100 py-2.5 last:border-0 sm:grid-cols-[10rem_1fr] sm:gap-4 dark:border-gray-700/80">
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="break-words text-sm font-medium text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  );
}

function SolicitacoesFerramentasPage() {
  const queryClient = useQueryClient();
  const handleLogout = useLogout();
  const user = authService.getUser();

  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('OPEN');
  const [selected, setSelected] = useState<ToolRentalRequest | null>(null);
  const [detailTab, setDetailTab] = useState<DpRequestHistoryModalTab>('detalhes');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['tool-rental-requests-supplies'] });
    queryClient.invalidateQueries({ queryKey: ['tool-rental-supplies-summary'] });
    queryClient.invalidateQueries({ queryKey: ['tool-rental-supplies-pending-count'] });
  };

  const closeDetail = () => {
    setSelected(null);
    setDetailTab('detalhes');
    setShowReject(false);
    setRejectReason('');
  };

  const { data: listData, isLoading } = useQuery({
    queryKey: ['tool-rental-requests-supplies', searchTerm, page, statusFilter],
    queryFn: async () => {
      const res = await api.get('/tool-rental-requests', {
        params: {
          search: searchTerm || undefined,
          page,
          limit: 20,
          scope: 'all',
          status: statusFilter === 'ALL' ? undefined : statusFilter,
        },
      });
      return res.data;
    },
  });

  const { data: summaryData } = useQuery({
    queryKey: ['tool-rental-supplies-summary'],
    queryFn: async () => {
      const res = await api.get('/tool-rental-requests/supplies-summary');
      return (
        res.data?.data ?? {
          open: 0,
          supplierRelation: 0,
          awaitingPayment: 0,
          completed: 0,
          total: 0,
        }
      );
    },
  });

  const toSupplierMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/tool-rental-requests/${id}/to-supplier-relation`, {});
    },
    onSuccess: () => {
      toast.success('Encaminhada para Relação com o Fornecedor');
      closeDetail();
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Falha ao encaminhar');
    },
  });

  const toPaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/tool-rental-requests/${id}/to-awaiting-payment`, {});
    },
    onSuccess: () => {
      toast.success('Encaminhada para Aguardando Pagamento');
      closeDetail();
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Falha ao avançar etapa');
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/tool-rental-requests/${id}/complete`, {});
    },
    onSuccess: () => {
      toast.success('Solicitação finalizada');
      closeDetail();
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Falha ao finalizar');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.put(`/tool-rental-requests/${id}/supplies-reject`, { reason });
    },
    onSuccess: () => {
      toast.success('Solicitação rejeitada');
      closeDetail();
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Falha ao rejeitar');
    },
  });

  const busy =
    toSupplierMutation.isPending ||
    toPaymentMutation.isPending ||
    completeMutation.isPending ||
    rejectMutation.isPending;

  const rows: ToolRentalRequest[] = listData?.data ?? [];
  const total = listData?.pagination?.total ?? 0;
  const listRange = getCadastroListRange(page, 20, total);

  const {
    rowActionMenu,
    rowForActionMenu,
    isRowMenuOpen,
    toggleRowActionMenu,
    closeRowActionMenu,
  } = useRowActionMenu(rows);

  const openDetail = (row: ToolRentalRequest) => {
    setDetailTab('detalhes');
    setSelected(row);
    setShowReject(false);
  };

  const buildRowMenuItems = (row: ToolRentalRequest): RowActionMenuExtraItem[] => [
    {
      label:
        row.status === 'OPEN' ||
        row.status === 'SUPPLIER_RELATION' ||
        row.status === 'AWAITING_PAYMENT'
          ? 'Atender'
          : 'Ver detalhes',
      icon: <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />,
      onClick: () => openDetail(row),
    },
  ];

  const stats = useMemo(
    () => [
      {
        filter: 'OPEN' as StatusFilter,
        label: 'Abertas',
        value: summaryData?.open ?? 0,
        Icon: Clock,
        iconBg: 'bg-amber-100 dark:bg-amber-900/30',
        iconColor: 'text-amber-600 dark:text-amber-400',
      },
      {
        filter: 'SUPPLIER_RELATION' as StatusFilter,
        label: 'Relação fornecedor',
        value: summaryData?.supplierRelation ?? 0,
        Icon: Building2,
        iconBg: 'bg-blue-100 dark:bg-blue-900/30',
        iconColor: 'text-blue-600 dark:text-blue-400',
      },
      {
        filter: 'AWAITING_PAYMENT' as StatusFilter,
        label: 'Aguardando pagamento',
        value: summaryData?.awaitingPayment ?? 0,
        Icon: Banknote,
        iconBg: 'bg-violet-100 dark:bg-violet-900/30',
        iconColor: 'text-violet-600 dark:text-violet-400',
      },
      {
        filter: 'COMPLETED' as StatusFilter,
        label: 'Finalizadas',
        value: summaryData?.completed ?? 0,
        Icon: CheckCircle,
        iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
      },
    ],
    [summaryData]
  );

  if (!user) return <Loading />;

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
            Pedidos de Ferramentas
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
            Acompanhe o fluxo após a SC: relação com fornecedor, pagamento e finalização
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 2xl:grid-cols-4">
          {stats.map((stat) => (
            <FilterStatCard
              key={stat.filter}
              label={stat.label}
              count={stat.value}
              icon={stat.Icon}
              iconBg={stat.iconBg}
              iconColor={stat.iconColor}
              isActive={statusFilter === stat.filter}
              onClick={() => {
                setStatusFilter(stat.filter);
                setPage(1);
              }}
            />
          ))}
        </div>

        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <div className={cadastroListClasses.cardHeaderIconRow}>
                <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                  <Wrench className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                    Fila de atendimento
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Avance as etapas do atendimento
                  </p>
                </div>
              </div>
              <div className={cadastroListClasses.cardToolbar}>
                <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Buscar título, obra, equipamento…"
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            <CadastroListSummary
              startItem={listRange.startItem}
              endItem={listRange.endItem}
              total={total}
              itemLabel="solicitação"
              itemLabelPlural="solicitações"
              currentPage={page}
              totalPages={listRange.totalPages}
            />
            {isLoading ? (
              <CadastroListLoading message="Carregando solicitações..." />
            ) : rows.length === 0 ? (
              <CadastroListEmpty
                icon={Wrench}
                title="Nenhuma solicitação neste filtro"
                hint="Ajuste o filtro ou aguarde novas solicitações da Engenharia."
              />
            ) : (
              <div className="table-scroll">
                <table className={cadastroListClasses.table}>
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className={cadastroListClasses.th}>ID</th>
                      <th className={cadastroListClasses.th}>Solicitação</th>
                      <th className={cadastroListClasses.thCenter}>Tipo</th>
                      <th className={cadastroListClasses.thCenter}>Polo</th>
                      <th className={cadastroListClasses.thCenter}>Prioridade</th>
                      <th className={cadastroListClasses.thCenter}>Período</th>
                      <th className={cadastroListClasses.thCenter}>Status</th>
                      <th className={cadastroListClasses.thRight}>Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                    {rows.map((row, index) => (
                      <tr
                        key={row.id}
                        className={getListTableRowClassName(true)}
                        onClick={() => openDetail(row)}
                      >
                        <td className={cadastroListClasses.tdMono}>
                          <ListRowNavigableLabel className="font-mono font-medium">
                            {formatCadastroListId(row.code, listRange.startItem + index)}
                          </ListRowNavigableLabel>
                        </td>
                        <td className={cadastroListClasses.tdTruncate}>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                              {row.titulo}
                            </p>
                            <p className="truncate text-xs text-gray-500">
                              {row.obra}
                              {row.logisticsMode
                                ? ` · ${formatToolRentalLogistics(row.logisticsMode)}`
                                : ''}
                            </p>
                          </div>
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatToolRentalDemand(row.demandType)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>{row.polo}</td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatToolRentalPriority(row.priority)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatDateOnly(row.periodoInicio)} – {formatDateOnly(row.periodoFim)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${toolRentalStatusBadgeClass(row.status)}`}
                          >
                            {formatToolRentalStatus(row.status)}
                          </span>
                        </td>
                        <RowActionMenuCell
                          isOpen={isRowMenuOpen(row.id)}
                          onToggle={(e) => toggleRowActionMenu(row.id, e.currentTarget)}
                        />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {rowActionMenu && rowForActionMenu ? (
              <RowActionMenuPortal
                menu={rowActionMenu}
                onClose={closeRowActionMenu}
                onEdit={() => {}}
                hideDefaultActions
                extraItems={buildRowMenuItems(rowForActionMenu)}
              />
            ) : null}
            <ListPagination
              currentPage={page}
              totalPages={listRange.totalPages}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>

        <Modal
          isOpen={!!selected}
          onClose={() => {
            if (busy) return;
            closeDetail();
          }}
          title={selected ? `Solicitação #${selected.code}` : 'Solicitação'}
          size="lg"
        >
          {selected ? (
            <div className="space-y-5">
              <DpRequestHistoryModalTabs activeTab={detailTab} onTabChange={setDetailTab} />

              {detailTab === 'timeline' ? (
                <DpRequestHistoryTimeline
                  steps={buildToolRentalTimeline(selected)}
                  formatDateTime={formatDateTime}
                />
              ) : (
                <>
                  <dl>
                    <DetailRow label="Título" value={selected.titulo} />
                    <DetailRow label="Tipo" value={formatToolRentalDemand(selected.demandType)} />
                    <DetailRow
                      label="Modalidade"
                      value={
                        selected.logisticsMode
                          ? formatToolRentalLogistics(selected.logisticsMode)
                          : '—'
                      }
                    />
                    <DetailRow label="Prioridade" value={formatToolRentalPriority(selected.priority)} />
                    <DetailRow label="Polo" value={selected.polo} />
                    <DetailRow label="Contrato" value={selected.contrato} />
                    <DetailRow label="Obra" value={selected.obra} />
                    <DetailRow label="Equipamento" value={selected.equipamento} />
                    <DetailRow
                      label="Período"
                      value={`${formatDateOnly(selected.periodoInicio)} – ${formatDateOnly(selected.periodoFim)}`}
                    />
                    <DetailRow
                      label="Solicitante"
                      value={selected.createdBy?.name || selected.assignedUser?.name || '—'}
                    />
                    <DetailRow label="Fornecedor" value={selected.supplierName || '—'} />
                    <DetailRow
                      label="Status"
                      value={
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${toolRentalStatusBadgeClass(selected.status)}`}
                        >
                          {formatToolRentalStatus(selected.status)}
                        </span>
                      }
                    />
                    {selected.ocMirrorUrl ? (
                      <DetailRow
                        label="Espelho OC"
                        value={
                          <a
                            href={resolveApiMediaUrl(selected.ocMirrorUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-red-600 underline dark:text-red-400"
                          >
                            {selected.ocMirrorName || 'Abrir arquivo'}
                          </a>
                        }
                      />
                    ) : null}
                    {selected.paymentProofUrl ? (
                      <DetailRow
                        label="Comprovante"
                        value={
                          <a
                            href={resolveApiMediaUrl(selected.paymentProofUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-red-600 underline dark:text-red-400"
                          >
                            {selected.paymentProofName || 'Abrir arquivo'}
                          </a>
                        }
                      />
                    ) : null}
                    {selected.suppliesRejectionReason ? (
                      <DetailRow label="Rejeição" value={selected.suppliesRejectionReason} />
                    ) : null}
                  </dl>

                  {showReject ? (
                    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
                      <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                        Motivo da rejeição
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        placeholder="Descreva o motivo…"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowReject(false);
                            setRejectReason('');
                          }}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium dark:border-gray-600"
                        >
                          Voltar
                        </button>
                        <button
                          type="button"
                          disabled={busy || !rejectReason.trim()}
                          onClick={() =>
                            rejectMutation.mutate({ id: selected.id, reason: rejectReason.trim() })
                          }
                          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          Confirmar rejeição
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {!showReject && selected.status === 'OPEN' ? (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => setShowReject(true)}
                        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        Rejeitar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => toSupplierMutation.mutate(selected.id)}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        Encaminhar p/ Relação com Fornecedor
                      </button>
                    </div>
                  ) : null}

                  {!showReject && selected.status === 'SUPPLIER_RELATION' ? (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => setShowReject(true)}
                        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        Rejeitar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => toPaymentMutation.mutate(selected.id)}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        Encaminhar p/ Aguardando Pagamento
                      </button>
                    </div>
                  ) : null}

                  {!showReject && selected.status === 'AWAITING_PAYMENT' ? (
                    <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => completeMutation.mutate(selected.id)}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        Finalizar solicitação
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </Modal>
      </div>
    </MainLayout>
  );
}

export default function Page() {
  return (
    <ProtectedRoute route="/ponto/solicitacoes-ferramentas">
      <SolicitacoesFerramentasPage />
    </ProtectedRoute>
  );
}
