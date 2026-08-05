'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CheckCircle,
  ClipboardList,
  Clock,
  Eye,
  Filter,
  LayoutList,
  Loader2,
  MoreVertical,
  Search,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
  rowActionMenuButtonClass,
} from '@/components/ui/listTableUi';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { usePermissions } from '@/hooks/usePermissions';
import type { MaterialRequest } from '@/app/ponto/gerenciar-materiais/_lib/types';
import {
  getPriorityInfo,
  materialItemLabel,
  rmContractDisplay,
  rmOsDisplay,
  rmSolicitante,
} from '@/app/ponto/gerenciar-materiais/_lib/display';
import { formatRmListDisplayId } from '@/app/ponto/gerenciar-materiais/_lib/rmListDisplay';
import { matchesMaterialRequestSearch, normalizeFluxSearch } from '@/app/ponto/gerenciar-materiais/_lib/search';
import {
  ApprovalPhaseStatCards,
  type ApprovalPhaseStatCard,
} from './ApprovalPhaseStatCards';
import {
  APPROVAL_STATUS_COLUMN_TITLE,
  ApprovalStatusBadge,
  rmToApprovalStatus,
} from './ApprovalStatusBadge';

type RmPhaseFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

const RM_PHASES = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const;

const RM_PHASE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'APPROVED', label: 'Aprovadas' },
  { value: 'REJECTED', label: 'Canceladas' },
  { value: 'ALL', label: 'Todos' },
]);

const RM_STAT_CARDS: ApprovalPhaseStatCard<RmPhaseFilter>[] = [
  {
    filter: 'PENDING',
    label: 'Pendentes',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    Icon: Clock,
  },
  {
    filter: 'APPROVED',
    label: 'Aprovadas',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
  },
  {
    filter: 'REJECTED',
    label: 'Canceladas',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: XCircle,
  },
  {
    filter: 'ALL',
    label: 'Todos',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: LayoutList,
  },
];

const RM_PHASE_SUBTITLE: Record<RmPhaseFilter, string> = {
  PENDING: 'Aguardando sua aprovação',
  APPROVED: 'Requisições aprovadas',
  REJECTED: 'Requisições canceladas',
  ALL: 'Todas as requisições',
};

const cellPad = 'px-2 sm:px-3 py-3';
const cellPadTh = 'px-2 sm:px-3 py-4';
const rmColCls = 'w-[4%] min-w-[3rem] max-w-[4.5rem]';
const actionColCls = 'w-[4%] min-w-[3rem] max-w-[4.5rem]';
const thTextCls = `${cellPadTh} text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`;
const thCenterCls = `${cellPadTh} text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap`;
const rmThCls = `${thCenterCls} ${rmColCls} !pl-2 sm:!pl-3 !pr-1`;
const rmTdCls = `${cadastroListClasses.tdMono} ${rmColCls} text-center !pl-2 sm:!pl-3 !pr-1`;
const tdTextCls = `${cellPad} text-center text-sm text-gray-700 dark:text-gray-300 min-w-0`;
const tdMutedCls = `${cellPad} text-center text-sm text-gray-600 dark:text-gray-400 min-w-0`;
const tdCenterCls = `${cellPad} text-center text-sm min-w-0`;
const actionThCls = `${cadastroListClasses.thRight} ${actionColCls} !pl-1 !pr-2 sm:!pr-3`;
const actionTdCls = `${actionColCls} !pl-1 !pr-2 sm:!pr-3 py-3 align-middle`;
const RM_ACTION_MENU_WIDTH_PX = 224;
const MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';
const MENU_ITEM_BORDER_CLASS = `${MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`;

export function RmApprovalsSection() {
  const queryClient = useQueryClient();
  const { canApproveMaterialRequests, gestorScopedCostCenterIds, user } = usePermissions();
  const currentUserId = user?.id ?? '';

  const [searchTerm, setSearchTerm] = useState('');
  const [rmPhase, setRmPhase] = useState<RmPhaseFilter>('PENDING');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState<MaterialRequest | null>(null);
  const [approveTarget, setApproveTarget] = useState<MaterialRequest | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<MaterialRequest | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MaterialRequest | null>(null);
  const [actionMenu, setActionMenu] = useState<{
    requestId: string;
    top: number;
    left: number;
  } | null>(null);

  const { data: requestsData, isLoading } = useQuery({
    queryKey: ['approvals', 'material-requests', rmPhase, currentUserId],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '200', summary: '1' };
      if (rmPhase !== 'ALL') {
        params.status = rmPhase;
      }
      const res = await api.get('/material-requests', { params });
      return (res.data?.data ?? []) as MaterialRequest[];
    },
    enabled: canApproveMaterialRequests,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: rmPhaseCounts, isLoading: loadingRmCounts } = useQuery({
    queryKey: ['approvals', 'material-requests', 'phase-counts', currentUserId],
    queryFn: async () => {
      const results = await Promise.all(
        RM_PHASES.map(async (phase) => {
          const params: Record<string, string> = { limit: '200', summary: '1' };
          if (phase !== 'ALL') {
            params.status = phase;
          }
          const res = await api.get('/material-requests', { params });
          const data = res.data?.data;
          const list = Array.isArray(data) ? (data as MaterialRequest[]) : [];
          return [phase, list.length] as const;
        }),
      );
      return Object.fromEntries(results) as Record<RmPhaseFilter, number>;
    },
    enabled: canApproveMaterialRequests,
    staleTime: 30_000,
  });

  const requests = requestsData ?? [];

  const filteredRequests = useMemo(() => {
    const normalized = normalizeFluxSearch(searchTerm);
    let list = requests;
    if (gestorScopedCostCenterIds !== undefined) {
      const allowed = new Set(gestorScopedCostCenterIds);
      list = list.filter((r) => {
        const ccId = r.costCenter?.id;
        return ccId ? allowed.has(ccId) : false;
      });
    }
    if (!normalized) return list;
    return list.filter((r) => matchesMaterialRequestSearch(r, normalized));
  }, [requests, searchTerm, gestorScopedCostCenterIds]);

  const requestForMenu = useMemo(() => {
    if (!actionMenu) return null;
    return filteredRequests.find((r) => r.id === actionMenu.requestId) ?? null;
  }, [actionMenu, filteredRequests]);

  useEffect(() => {
    if (actionMenu && !requestForMenu) {
      setActionMenu(null);
    }
  }, [actionMenu, requestForMenu]);

  const invalidateRmQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['approvals', 'material-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['material-request-detail'] }),
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'], refetchType: 'all' }),
      queryClient.invalidateQueries({ queryKey: ['material-requests'], refetchType: 'all' }),
      queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] }),
    ]);
  };

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-requests/${id}/status`, { status: 'APPROVED' });
      return res.data;
    },
    onSuccess: async () => {
      toast.success('Requisição aprovada.');
      setApproveTarget(null);
      setDetailRequest(null);
      await invalidateRmQueries();
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Erro ao aprovar requisição');
    },
  });

  const correctionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-requests/${id}/status`, { status: 'IN_REVIEW' });
      return res.data;
    },
    onSuccess: async () => {
      toast.success('Requisição enviada para correção.');
      setCorrectionTarget(null);
      setDetailRequest(null);
      await invalidateRmQueries();
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Erro ao enviar para correção');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-requests/${id}/status`, { status: 'CANCELLED' });
      return res.data;
    },
    onSuccess: async () => {
      toast.success('Requisição cancelada.');
      setCancelTarget(null);
      setDetailRequest(null);
      await invalidateRmQueries();
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Erro ao cancelar requisição');
    },
  });

  /** Abre na hora com o dado da lista; itens completos entram em background (igual OC). */
  const openRequestDetail = (request: MaterialRequest) => {
    setDetailRequest(request);
    void queryClient.prefetchQuery({
      queryKey: ['material-request-detail', request.id],
      queryFn: async () => {
        const res = await api.get(`/material-requests/${request.id}`);
        return (res.data?.data ?? res.data) as MaterialRequest;
      },
      staleTime: 60_000,
    });
  };

  const { data: detailFresh, isFetching: isFetchingDetail } = useQuery({
    queryKey: ['material-request-detail', detailRequest?.id],
    queryFn: async () => {
      const res = await api.get(`/material-requests/${detailRequest!.id}`);
      return (res.data?.data ?? res.data) as MaterialRequest;
    },
    enabled: !!detailRequest?.id,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!detailFresh || detailFresh.id !== detailRequest?.id) return;
    setDetailRequest(detailFresh);
  }, [detailFresh, detailRequest?.id]);

  if (!canApproveMaterialRequests) {
    return null;
  }

  return (
    <>
      <div className="space-y-6">
        <ApprovalPhaseStatCards
          cards={RM_STAT_CARDS}
          activeFilter={rmPhase}
          counts={rmPhaseCounts ?? {}}
          loading={loadingRmCounts}
          onSelect={setRmPhase}
        />
      <Card className="w-full scroll-mt-4" id="secao-rm-aprovacoes">
        <CardHeader className="border-b-0 pb-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-3">
              {(() => {
                const activeCard =
                  RM_STAT_CARDS.find((c) => c.filter === rmPhase) ?? RM_STAT_CARDS[0];
                const PhaseIcon = activeCard.Icon;
                return (
                  <>
                    <div className={`rounded-lg p-2 sm:p-3 ${activeCard.iconBg}`}>
                      <PhaseIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${activeCard.iconColor}`} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {activeCard.label}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {RM_PHASE_SUBTITLE[rmPhase]}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por RM, OS, contrato, solicitante..."
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setIsFiltersOpen(true)}
                className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  rmPhase !== 'PENDING'
                    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Abrir filtro"
                title={rmPhase !== 'PENDING' ? 'Filtro (status ativo)' : 'Filtro'}
              >
                <Filter className="h-4 w-4" />
                {rmPhase !== 'PENDING' ? (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                ) : null}
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loading message="Carregando requisições..." />
          ) : filteredRequests.length === 0 ? (
            <div className="py-8 text-center">
              <ClipboardList className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
              <p className="text-gray-500 dark:text-gray-400">
                {searchTerm.trim()
                  ? 'Nenhuma requisição corresponde à busca'
                  : rmPhase === 'APPROVED'
                    ? 'Nenhuma requisição aprovada'
                    : rmPhase === 'REJECTED'
                      ? 'Nenhuma requisição cancelada'
                      : rmPhase === 'ALL'
                        ? 'Nenhuma requisição encontrada'
                        : 'Nenhuma requisição pendente de aprovação'}
              </p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className={`${cadastroListClasses.table} text-sm`}>
                <colgroup>
                  <col className="w-[4%]" />
                  <col className="w-[14%]" />
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                  <col className="w-[32%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                  <col className="w-[4%]" />
                </colgroup>
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th scope="col" className={rmThCls}>
                      RM
                    </th>
                    <th className={thTextCls}>Solicitante</th>
                    <th className={thCenterCls}>OS</th>
                    <th className={thTextCls}>Contrato</th>
                    <th className={thTextCls}>Descrição</th>
                    <th className={thCenterCls}>Prioridade</th>
                    <th className={thCenterCls}>{APPROVAL_STATUS_COLUMN_TITLE}</th>
                    <th scope="col" className={actionThCls}>
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                  {filteredRequests.map((request) => {
                    const priorityInfo = getPriorityInfo(request.priority);

                    return (
                      <tr
                        key={request.id}
                        onClick={() => void openRequestDetail(request)}
                        className={getListTableRowClassName(true)}
                      >
                        <td
                          className={rmTdCls}
                          title={request.requestNumber || undefined}
                        >
                          <ListRowNavigableLabel className="font-medium">
                            {formatRmListDisplayId(request.requestNumber)}
                          </ListRowNavigableLabel>
                        </td>
                        <td className={tdTextCls}>
                          <span className="block truncate">
                            {rmSolicitante(request)?.name || '—'}
                          </span>
                        </td>
                        <td className={tdTextCls} title={rmOsDisplay(request)}>
                          <span className="block truncate">{rmOsDisplay(request)}</span>
                        </td>
                        <td className={tdTextCls} title={rmContractDisplay(request)}>
                          <span className="line-clamp-2">{rmContractDisplay(request)}</span>
                        </td>
                        <td className={tdMutedCls}>
                          <span className="line-clamp-2" title={request.description || ''}>
                            {request.description || '—'}
                          </span>
                        </td>
                        <td className={tdCenterCls}>
                          <span className={`text-xs font-medium whitespace-nowrap ${priorityInfo.color}`}>
                            {priorityInfo.label}
                          </span>
                        </td>
                        <td className={tdCenterCls}>
                          <ApprovalStatusBadge kind={rmToApprovalStatus(request.status)} />
                        </td>
                        <td className={actionTdCls} onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActionMenu((prev) => {
                                  if (prev?.requestId === request.id) return null;
                                  let left = rect.right - RM_ACTION_MENU_WIDTH_PX;
                                  left = Math.max(
                                    8,
                                    Math.min(left, window.innerWidth - RM_ACTION_MENU_WIDTH_PX - 8)
                                  );
                                  return { requestId: request.id, top: rect.bottom + 4, left };
                                });
                              }}
                              className={rowActionMenuButtonClass(actionMenu?.requestId === request.id)}
                              aria-label="Menu de ações"
                              aria-expanded={actionMenu?.requestId === request.id}
                              aria-haspopup="menu"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      {detailRequest && (
        <Modal isOpen onClose={() => setDetailRequest(null)} title="Detalhes da Requisição" size="lg">
          <div className="space-y-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Número</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatRmListDisplayId(detailRequest.requestNumber) ||
                    `#${detailRequest.id.slice(0, 8)}`}
                </p>
              </div>
              {isFetchingDetail ? (
                <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Atualizando…
                </span>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Solicitante</p>
              <p className="text-gray-900 dark:text-gray-100">
                {rmSolicitante(detailRequest)?.name || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Centro de Custo</p>
              <p className="text-gray-900 dark:text-gray-100">{detailRequest.costCenter?.name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Descrição</p>
              <p className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                {detailRequest.description || '—'}
              </p>
            </div>
            <div>
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Itens</p>
              <ul className="space-y-1 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                {detailRequest.items?.map((item) => (
                  <li key={item.id} className="text-gray-800 dark:text-gray-200">
                    {materialItemLabel(item)} — {item.quantity} {item.unit}
                  </li>
                ))}
                {(!detailRequest.items || detailRequest.items.length === 0) &&
                  (isFetchingDetail ? (
                    <li className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Carregando itens…
                    </li>
                  ) : (
                    <li className="text-gray-500 dark:text-gray-400">Nenhum item</li>
                  ))}
              </ul>
            </div>
          </div>
        </Modal>
      )}

      {approveTarget && (
        <Modal isOpen onClose={() => setApproveTarget(null)} title="Aprovar Requisição de Material" size="md">
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
            Confirmar aprovação da RM{' '}
            <strong>{formatRmListDisplayId(approveTarget.requestNumber)}</strong>?
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setApproveTarget(null)}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => approveMutation.mutate(approveTarget.id)}
              disabled={approveMutation.isPending}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {approveMutation.isPending ? 'Aprovando...' : 'Aprovar'}
            </button>
          </div>
        </Modal>
      )}

      {correctionTarget && (
        <Modal
          isOpen
          onClose={() => setCorrectionTarget(null)}
          title="Enviar para Correção RM"
          size="md"
        >
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
            O solicitante poderá ajustar a requisição e reenviá-la para análise.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setCorrectionTarget(null)}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => correctionMutation.mutate(correctionTarget.id)}
              disabled={correctionMutation.isPending}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {correctionMutation.isPending ? 'Enviando...' : 'Enviar para correção'}
            </button>
          </div>
        </Modal>
      )}

      {cancelTarget && (
        <Modal isOpen onClose={() => setCancelTarget(null)} title="Cancelar Requisição" size="md">
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
            A RM ficará como <strong>Cancelada</strong> e sairá do fluxo de análise. Confirma?
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => cancelMutation.mutate(cancelTarget.id)}
              disabled={cancelMutation.isPending}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
            </button>
          </div>
        </Modal>
      )}

      <Modal isOpen={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} title="Filtros" size="md">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Status
            </label>
            <StringSingleSelectDropdown
              value={rmPhase}
              onChange={(v) => setRmPhase(v as RmPhaseFilter)}
              options={RM_PHASE_FILTER_OPTIONS}
              allowEmpty={false}
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setRmPhase('PENDING')}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Limpar filtros
            </button>
            <button
              type="button"
              onClick={() => setIsFiltersOpen(false)}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300"
            >
              Aplicar
            </button>
          </div>
        </div>
      </Modal>

      <ActionMenuOverlay
        open={!!actionMenu && !!requestForMenu}
        onClose={() => setActionMenu(null)}
        top={actionMenu?.top ?? 0}
        left={actionMenu?.left ?? 0}
      >
        {requestForMenu ? (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setActionMenu(null);
                void openRequestDetail(requestForMenu);
              }}
              className={MENU_ITEM_CLASS}
            >
              <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span>Ver detalhes</span>
            </button>
            {requestForMenu.status === 'PENDING' && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionMenu(null);
                    setApproveTarget(requestForMenu);
                  }}
                  className={MENU_ITEM_BORDER_CLASS}
                >
                  <CheckCircle className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                  <span>Aprovar requisição</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionMenu(null);
                    setCorrectionTarget(requestForMenu);
                  }}
                  className={MENU_ITEM_BORDER_CLASS}
                >
                  <Wrench className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                  <span>Enviar para correção RM</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionMenu(null);
                    setCancelTarget(requestForMenu);
                  }}
                  className={MENU_ITEM_BORDER_CLASS}
                >
                  <Ban className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>Cancelar requisição</span>
                </button>
              </>
            )}
            {requestForMenu.status === 'IN_REVIEW' && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionMenu(null);
                  setCancelTarget(requestForMenu);
                }}
                className={MENU_ITEM_BORDER_CLASS}
              >
                <Ban className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>Cancelar requisição</span>
              </button>
            )}
          </>
        ) : null}
      </ActionMenuOverlay>
    </>
  );
}
