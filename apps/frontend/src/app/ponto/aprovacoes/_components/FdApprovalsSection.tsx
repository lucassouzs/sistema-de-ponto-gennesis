'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, FileText, Filter, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { textMatchesSearch } from '@/lib/normalizeSearchText';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { usePermissions } from '@/hooks/usePermissions';
import { formatCurrencyDisplay, type FichaDemandaApprovalRecord } from '@/lib/fichaDemandaApproval';
import { listTableRowClasses, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  ApprovalPhaseStatCards,
  DEFAULT_APPROVAL_PHASE_CARDS,
  fetchApprovalPhaseCounts,
} from './ApprovalPhaseStatCards';
import {
  APPROVAL_STATUS_COLUMN_TITLE,
  ApprovalStatusBadge,
  fdToApprovalStatus,
} from './ApprovalStatusBadge';

const FD_PHASES = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const;
type FdPhaseFilter = (typeof FD_PHASES)[number];

const FD_PHASE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'PENDING', label: 'Aguardando aprovação' },
  { value: 'APPROVED', label: 'Aprovadas' },
  { value: 'REJECTED', label: 'Canceladas' },
  { value: 'ALL', label: 'Todos' },
]);

const FD_PHASE_SUBTITLE: Record<FdPhaseFilter, string> = {
  PENDING: 'Pendentes de decisão do gestor do contrato',
  APPROVED: 'Fichas já aprovadas',
  REJECTED: 'Fichas canceladas',
  ALL: 'Todas as fichas da sua área',
};

export function FdApprovalsSection() {
  const queryClient = useQueryClient();
  const { canAccessDpApproverPages } = usePermissions();
  const canApproveFd = canAccessDpApproverPages;

  const [searchFd, setSearchFd] = useState('');
  const [fdPhase, setFdPhase] = useState<FdPhaseFilter>('PENDING');
  const [isFdFiltersOpen, setIsFdFiltersOpen] = useState(false);
  const [detailFd, setDetailFd] = useState<FichaDemandaApprovalRecord | null>(null);
  const [managerComment, setManagerComment] = useState<Record<string, string>>({});

  const { data: fdResp, isLoading: loadingFd, isError: fdError } = useQuery({
    queryKey: ['approvals', 'fd', fdPhase],
    queryFn: async () => {
      const res = await api.get(`/demand-sheet-approvals/aprovacoes?phase=${fdPhase}`);
      return (res.data?.data ?? []) as FichaDemandaApprovalRecord[];
    },
    enabled: canApproveFd,
  });

  const { data: fdPhaseCounts, isLoading: loadingFdCounts } = useQuery({
    queryKey: ['approvals', 'fd', 'phase-counts'],
    queryFn: () => fetchApprovalPhaseCounts('/demand-sheet-approvals/aprovacoes', FD_PHASES),
    enabled: canApproveFd,
    staleTime: 30_000,
  });

  const fdList = fdResp ?? [];

  const fdFiltered = useMemo(() => {
    const q = searchFd.trim();
    if (!q) return fdList;
    return fdList.filter((r) => {
      return (
        textMatchesSearch(r.codFichaDemanda, q) ||
        textMatchesSearch(r.codigoPedido, q) ||
        textMatchesSearch(r.contratoNome, q) ||
        textMatchesSearch(r.solicitanteNome, q) ||
        textMatchesSearch(r.obra, q)
      );
    });
  }, [fdList, searchFd]);

  const approveMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const comment = managerComment[id] || '';
      const res = await api.put(`/demand-sheet-approvals/${id}/manager-approve`, { comment });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Ficha de demanda aprovada.');
      setDetailFd(null);
      void queryClient.invalidateQueries({ queryKey: ['approvals', 'fd'] });
      void queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao aprovar ficha');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const comment = managerComment[id] || '';
      const res = await api.put(`/demand-sheet-approvals/${id}/manager-reject`, { comment });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Ficha de demanda cancelada.');
      setDetailFd(null);
      void queryClient.invalidateQueries({ queryKey: ['approvals', 'fd'] });
      void queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao reprovar ficha');
    },
  });

  if (!canApproveFd) {
    return null;
  }

  return (
    <>
      <div className="space-y-6">
        <ApprovalPhaseStatCards
          cards={DEFAULT_APPROVAL_PHASE_CARDS}
          activeFilter={fdPhase}
          counts={fdPhaseCounts ?? {}}
          loading={loadingFdCounts}
          onSelect={setFdPhase}
        />
      <Card className="w-full">
        <CardHeader className="border-b-0 pb-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-3">
              {(() => {
                const activeCard =
                  DEFAULT_APPROVAL_PHASE_CARDS.find((c) => c.filter === fdPhase) ??
                  DEFAULT_APPROVAL_PHASE_CARDS[0];
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
                        {FD_PHASE_SUBTITLE[fdPhase]}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={searchFd}
                  onChange={(e) => setSearchFd(e.target.value)}
                  placeholder="Buscar por código FD, pedido, contrato..."
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                {searchFd ? (
                  <button
                    type="button"
                    onClick={() => setSearchFd('')}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setIsFdFiltersOpen(true)}
                className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  fdPhase !== 'PENDING'
                    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Abrir filtro"
                title={fdPhase !== 'PENDING' ? 'Filtro (status ativo)' : 'Filtro'}
              >
                <Filter className="h-4 w-4" />
                {fdPhase !== 'PENDING' ? (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                ) : null}
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingFd ? (
            <Loading message="Carregando fichas de demanda..." />
          ) : fdError ? (
            <div className="py-8 text-center text-sm text-red-600 dark:text-red-400">
              Não foi possível carregar as fichas de demanda. Recarregue a página ou tente novamente.
            </div>
          ) : fdFiltered.length === 0 ? (
            <div className="py-8 text-center">
              <ClipboardCheck className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" aria-hidden />
              <p className="text-gray-500 dark:text-gray-400">Nenhuma ficha pendente de aprovação.</p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <span>
                  Mostrando 1 a {fdFiltered.length} de {fdFiltered.length} fichas
                </span>
                <span>Página 1 de 1</span>
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
                        {APPROVAL_STATUS_COLUMN_TITLE}
                      </th>
                      <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {fdFiltered.map((r) => (
                      <tr
                        key={r.id}
                        className={listTableRowClasses.tr}
                      >
                        <td className="px-3 py-3 align-middle text-sm sm:px-6">
                          <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">{r.codFichaDemanda}</span>
                        </td>
                        <td
                          className="max-w-[200px] truncate px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6"
                          title={r.contratoNome}
                        >
                          {r.contratoNome}
                        </td>
                        <td
                          className="max-w-[160px] truncate px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6"
                          title={r.obra}
                        >
                          {r.obra}
                        </td>
                        <td className="px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                          {r.solicitanteNome}
                        </td>
                        <td className="px-3 py-3 align-middle text-right text-sm tabular-nums text-gray-900 dark:text-gray-100 sm:px-6">
                          {formatCurrencyDisplay(r.faturamentoEstimado)}
                        </td>
                        <td className="px-3 py-3 align-middle text-center sm:px-6">
                          <ApprovalStatusBadge kind={fdToApprovalStatus(r.status)} />
                        </td>
                        <td className="px-3 py-3 align-middle text-center sm:px-6">
                          <div className="flex justify-center">
                            <button
                              type="button"
                              onClick={() => setDetailFd(r)}
                              className={rowActionMenuButtonClass(false)}
                              title="Ver detalhes"
                              aria-label="Ver detalhes da ficha"
                            >
                              <FileText className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      </div>

      <Modal
        isOpen={!!detailFd}
        onClose={() => setDetailFd(null)}
        title="Detalhes da Ficha de Demanda"
        size="lg"
      >
        {detailFd ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cód. ficha de demanda</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detailFd.codFichaDemanda}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Código do pedido</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detailFd.codigoPedido}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Contrato</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detailFd.contratoNome}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Obra</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detailFd.obra}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Solicitante</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detailFd.solicitanteNome}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Polo</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detailFd.polo}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Faturamento estimado</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatCurrencyDisplay(detailFd.faturamentoEstimado)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Custo estimado</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatCurrencyDisplay(detailFd.custoEstimado)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Num. mov. RM</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detailFd.numMovRm}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">ID mov. RM</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detailFd.idMovRm}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Observação</p>
              <p className="text-gray-900 dark:text-gray-100">{detailFd.observacao}</p>
            </div>

            {detailFd.status === 'WAITING_MANAGER' ? (
              <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Decisão</h3>
                <div className="space-y-3">
                  <Input
                    value={managerComment[detailFd.id] || ''}
                    onChange={(e) =>
                      setManagerComment((p) => ({ ...p, [detailFd.id]: e.target.value }))
                    }
                    placeholder="Comentário (opcional)"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button type="button" variant="outline" onClick={() => setDetailFd(null)}>
                      Fechar
                    </Button>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="error"
                        onClick={() => rejectMutation.mutate({ id: detailFd.id })}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                      >
                        {rejectMutation.isPending ? 'Rejeitando…' : 'Rejeitar'}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => approveMutation.mutate({ id: detailFd.id })}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                      >
                        {approveMutation.isPending ? 'Aprovando…' : 'Aprovar'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                <Button type="button" variant="outline" onClick={() => setDetailFd(null)}>
                  Fechar
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={isFdFiltersOpen} onClose={() => setIsFdFiltersOpen(false)} title="Filtro — Fichas de Demanda" size="sm">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
          <StringSingleSelectDropdown
            value={fdPhase}
            onChange={(value) => setFdPhase(value as FdPhaseFilter)}
            options={FD_PHASE_FILTER_OPTIONS}
            allowEmpty={false}
            className="w-full"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsFdFiltersOpen(false)}>
              Fechar
            </Button>
            <Button type="button" onClick={() => setIsFdFiltersOpen(false)}>
              Aplicar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
