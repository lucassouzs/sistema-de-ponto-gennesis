'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Check, Eye, Filter, Fuel, MoreVertical, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { FuelRequestPhoto } from '@/components/fuel/FuelRequestPhoto';
import { hasFuelStoredPhoto, resolveFuelPhotoSrc } from '@/lib/resolveMediaUrl';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { usePermissions } from '@/hooks/usePermissions';
import {
  ListRowNavigableLabel,
  getListTableRowClassName,
  rowActionMenuButtonClass,
} from '@/components/ui/listTableUi';
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
  fuelToApprovalStatus,
} from './ApprovalStatusBadge';

const FUEL_PHASES = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const;
type FuelPhaseFilter = (typeof FUEL_PHASES)[number];

const FUEL_PHASE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'PENDING', label: 'Aguardando aprovação' },
  { value: 'APPROVED', label: 'Aprovadas' },
  { value: 'REJECTED', label: 'Canceladas' },
  { value: 'ALL', label: 'Todos' },
]);

const FUEL_PHASE_SUBTITLE: Record<FuelPhaseFilter, string> = {
  PENDING: 'Aguardando aprovação do gestor',
  APPROVED: 'Já aprovadas e encaminhadas',
  REJECTED: 'Canceladas pelo gestor',
  ALL: 'Todas as solicitações particulares',
};

const FUEL_ACTION_MENU_WIDTH_PX = 224;
const MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';
const MENU_ITEM_BORDER_CLASS = `${MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`;

type FuelVehicleType = 'PRIVATE' | 'COMPANY';
type FuelRefuelStatus =
  | 'PENDING_MANAGER'
  | 'PENDING_SUPPLIES'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

type FuelRefuelRequest = {
  id: string;
  displayNumber: number;
  requestedAt: string;
  refuelDate: string;
  route: string;
  driverName: string;
  vehiclePlate: string;
  vehicleDescription?: string | null;
  vehicleType?: FuelVehicleType | null;
  observations?: string | null;
  status: FuelRefuelStatus;
  dashboardPhotoUrl?: string | null;
  dashboardPhotoKey?: string | null;
  dashboardPhotoViewUrl?: string | null;
  dashboardPhotoName?: string | null;
  costCenter?: string | null;
  requester: { id: string; name: string; email: string };
  contract?: { id: string; name: string; number: string } | null;
};

function fuelContractLabel(row: {
  costCenter?: string | null;
  contract?: { number?: string; name?: string } | null;
}): string {
  if (row.costCenter?.trim()) return row.costCenter.trim();
  if (row.contract?.number && row.contract?.name) {
    return `${row.contract.number} — ${row.contract.name}`;
  }
  return row.contract?.number || row.contract?.name || '—';
}

const VEHICLE_TYPE_LABELS: Record<FuelVehicleType, string> = {
  PRIVATE: 'Particular',
  COMPANY: 'Frota / empresa',
};

export function FuelApprovalsSection() {
  const queryClient = useQueryClient();
  const { canApproveFuel } = usePermissions();

  const [searchFuel, setSearchFuel] = useState('');
  const [fuelPhase, setFuelPhase] = useState<FuelPhaseFilter>('PENDING');
  const [isFuelFiltersOpen, setIsFuelFiltersOpen] = useState(false);
  const [detailFuel, setDetailFuel] = useState<FuelRefuelRequest | null>(null);
  const [managerComment, setManagerComment] = useState<Record<string, string>>({});
  const [actionMenu, setActionMenu] = useState<{
    requestId: string;
    top: number;
    left: number;
  } | null>(null);

  const { data: fuelResp, isLoading: loadingFuel, isError: fuelError } = useQuery({
    queryKey: ['approvals', 'fuel', fuelPhase],
    queryFn: async () => {
      const res = await api.get(`/fuel-refuel-requests/aprovacoes?phase=${fuelPhase}`);
      return (res.data?.data ?? []) as FuelRefuelRequest[];
    },
    enabled: canApproveFuel,
  });

  const { data: fuelPhaseCounts, isLoading: loadingFuelCounts } = useQuery({
    queryKey: ['approvals', 'fuel', 'phase-counts'],
    queryFn: () => fetchApprovalPhaseCounts('/fuel-refuel-requests/aprovacoes', FUEL_PHASES),
    enabled: canApproveFuel,
    staleTime: 30_000,
  });

  const fuelList = fuelResp ?? [];

  const fuelFiltered = useMemo(() => {
    const q = searchFuel.trim().toLowerCase();
    if (!q) return fuelList;
    return fuelList.filter((r) => {
      return (
        String(r.displayNumber).includes(q) ||
        r.route.toLowerCase().includes(q) ||
        r.driverName.toLowerCase().includes(q) ||
        r.vehiclePlate.toLowerCase().includes(q) ||
        r.requester.name.toLowerCase().includes(q) ||
        fuelContractLabel(r).toLowerCase().includes(q)
      );
    });
  }, [fuelList, searchFuel]);

  const requestForMenu = useMemo(() => {
    if (!actionMenu) return null;
    return fuelFiltered.find((r) => r.id === actionMenu.requestId) ?? null;
  }, [actionMenu, fuelFiltered]);

  useEffect(() => {
    if (actionMenu && !requestForMenu) {
      setActionMenu(null);
    }
  }, [actionMenu, requestForMenu]);

  const approveMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const comment = managerComment[id] || '';
      const res = await api.put(`/fuel-refuel-requests/${id}/manager-approve`, { comment });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação aprovada e encaminhada ao Suprimentos.');
      setDetailFuel(null);
      setActionMenu(null);
      void queryClient.invalidateQueries({ queryKey: ['approvals', 'fuel'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-supplies-pending-count'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao aprovar solicitação');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const comment = managerComment[id] || '';
      const res = await api.put(`/fuel-refuel-requests/${id}/manager-reject`, {
        reason: comment.trim() || 'Rejeitada pelo gestor',
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação de combustível rejeitada.');
      setDetailFuel(null);
      setActionMenu(null);
      void queryClient.invalidateQueries({ queryKey: ['approvals', 'fuel'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao rejeitar solicitação');
    },
  });

  if (!canApproveFuel) {
    return null;
  }

  return (
    <>
      <div className="space-y-6">
        <ApprovalPhaseStatCards
          cards={DEFAULT_APPROVAL_PHASE_CARDS}
          activeFilter={fuelPhase}
          counts={fuelPhaseCounts ?? {}}
          loading={loadingFuelCounts}
          onSelect={setFuelPhase}
        />
        <Card className="w-full">
          <CardHeader className="border-b-0 pb-1">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center space-x-3">
                {(() => {
                  const activeCard =
                    DEFAULT_APPROVAL_PHASE_CARDS.find((c) => c.filter === fuelPhase) ??
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
                          {FUEL_PHASE_SUBTITLE[fuelPhase]}
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    value={searchFuel}
                    onChange={(e) => setSearchFuel(e.target.value)}
                    placeholder="Buscar por nº, rota, placa, contrato..."
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                  {searchFuel ? (
                    <button
                      type="button"
                      onClick={() => setSearchFuel('')}
                      aria-label="Limpar busca"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setIsFuelFiltersOpen(true)}
                  className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    fuelPhase !== 'PENDING'
                      ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                  }`}
                  aria-label="Abrir filtro"
                  title={fuelPhase !== 'PENDING' ? 'Filtro (status ativo)' : 'Filtro'}
                >
                  <Filter className="h-4 w-4" />
                  {fuelPhase !== 'PENDING' ? (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                  ) : null}
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingFuel ? (
              <Loading message="Carregando solicitações de combustível..." />
            ) : fuelError ? (
              <div className="py-8 text-center text-sm text-red-600 dark:text-red-400">
                Não foi possível carregar as solicitações. Recarregue a página ou tente novamente.
              </div>
            ) : fuelFiltered.length === 0 ? (
              <div className="py-8 text-center">
                <Fuel className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" aria-hidden />
                <p className="text-gray-500 dark:text-gray-400">
                  Nenhuma solicitação de combustível neste filtro.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <span>
                    Mostrando 1 a {fuelFiltered.length} de {fuelFiltered.length} solicitações
                  </span>
                  <span>Página 1 de 1</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                          ID
                        </th>
                        <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                          Contrato
                        </th>
                        <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                          Data abast.
                        </th>
                        <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                          Veículo / Condutor
                        </th>
                        <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                          Solicitante
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
                      {fuelFiltered.map((r) => (
                        <tr
                          key={r.id}
                          className={getListTableRowClassName(true)}
                          onClick={() => setDetailFuel(r)}
                        >
                          <td className="px-3 py-3 align-middle text-sm tabular-nums sm:px-6">
                            <ListRowNavigableLabel className="font-medium">
                              {r.displayNumber}
                            </ListRowNavigableLabel>
                          </td>
                          <td
                            className="max-w-[200px] truncate px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6"
                            title={fuelContractLabel(r)}
                          >
                            {fuelContractLabel(r)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                            {format(new Date(r.refuelDate), 'dd/MM/yyyy', { locale: ptBR })}
                          </td>
                          <td className="px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                            <div>{r.vehiclePlate}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{r.driverName}</div>
                          </td>
                          <td className="px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                            {r.requester.name}
                          </td>
                          <td className="px-3 py-3 align-middle text-center sm:px-6">
                            <ApprovalStatusBadge kind={fuelToApprovalStatus(r.status)} />
                          </td>
                          <td
                            className="px-3 py-3 align-middle text-center sm:px-6"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex justify-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setActionMenu((prev) => {
                                    if (prev?.requestId === r.id) return null;
                                    let left = rect.right - FUEL_ACTION_MENU_WIDTH_PX;
                                    left = Math.max(
                                      8,
                                      Math.min(left, window.innerWidth - FUEL_ACTION_MENU_WIDTH_PX - 8),
                                    );
                                    return { requestId: r.id, top: rect.bottom + 4, left };
                                  });
                                }}
                                className={rowActionMenuButtonClass(actionMenu?.requestId === r.id)}
                                aria-label="Menu de ações"
                                aria-expanded={actionMenu?.requestId === r.id}
                                aria-haspopup="menu"
                              >
                                <MoreVertical className="h-4 w-4" />
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
                setDetailFuel(requestForMenu);
              }}
              className={MENU_ITEM_CLASS}
            >
              <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span>Ver detalhes</span>
            </button>
            {requestForMenu.status === 'PENDING_MANAGER' ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionMenu(null);
                    approveMutation.mutate({ id: requestForMenu.id });
                  }}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  className={MENU_ITEM_BORDER_CLASS}
                >
                  <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>Aprovar</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionMenu(null);
                    rejectMutation.mutate({ id: requestForMenu.id });
                  }}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  className={MENU_ITEM_BORDER_CLASS}
                >
                  <X className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>Rejeitar</span>
                </button>
              </>
            ) : null}
          </>
        ) : null}
      </ActionMenuOverlay>

      <Modal
        isOpen={!!detailFuel}
        onClose={() => setDetailFuel(null)}
        title={`Solicitação de combustível ${detailFuel?.displayNumber ?? ''}`}
        size="lg"
      >
        {detailFuel ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Solicitante</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detailFuel.requester.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Data para abastecer</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {format(new Date(detailFuel.refuelDate), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Contrato</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {fuelContractLabel(detailFuel)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Rota</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detailFuel.route}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Condutor</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detailFuel.driverName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Veículo</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {detailFuel.vehiclePlate}
                  {detailFuel.vehicleDescription ? ` — ${detailFuel.vehicleDescription}` : ''}
                </p>
              </div>
              {detailFuel.vehicleType ? (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Tipo</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {VEHICLE_TYPE_LABELS[detailFuel.vehicleType]}
                  </p>
                </div>
              ) : null}
            </div>
            {detailFuel.observations ? (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Observações</p>
                <p className="text-gray-900 dark:text-gray-100">{detailFuel.observations}</p>
              </div>
            ) : null}
            {hasFuelStoredPhoto(detailFuel.dashboardPhotoUrl, detailFuel.dashboardPhotoKey) ? (() => {
              const panelPhotoUrl = resolveFuelPhotoSrc(
                detailFuel.dashboardPhotoViewUrl,
                detailFuel.dashboardPhotoUrl,
              );
              if (!panelPhotoUrl) return null;
              return (
                <FuelRequestPhoto
                  src={panelPhotoUrl}
                  alt={detailFuel.dashboardPhotoName || 'Painel'}
                  label="Foto do painel"
                  fileName={detailFuel.dashboardPhotoName}
                />
              );
            })() : null}

            {detailFuel.status === 'PENDING_MANAGER' ? (
              <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Decisão</h3>
                <div className="space-y-3">
                  <Input
                    value={managerComment[detailFuel.id] || ''}
                    onChange={(e) =>
                      setManagerComment((p) => ({ ...p, [detailFuel.id]: e.target.value }))
                    }
                    placeholder="Comentário (opcional na aprovação; obrigatório na rejeição se vazio usa texto padrão)"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button type="button" variant="outline" onClick={() => setDetailFuel(null)}>
                      Fechar
                    </Button>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="error"
                        onClick={() => rejectMutation.mutate({ id: detailFuel.id })}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                      >
                        {rejectMutation.isPending ? 'Rejeitando…' : 'Rejeitar'}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => approveMutation.mutate({ id: detailFuel.id })}
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
                <Button type="button" variant="outline" onClick={() => setDetailFuel(null)}>
                  Fechar
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={isFuelFiltersOpen}
        onClose={() => setIsFuelFiltersOpen(false)}
        title="Filtro — Solicitações de Combustível"
        size="sm"
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
          <StringSingleSelectDropdown
            value={fuelPhase}
            onChange={(value) => setFuelPhase(value as FuelPhaseFilter)}
            options={FUEL_PHASE_FILTER_OPTIONS}
            allowEmpty={false}
            className="w-full"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsFuelFiltersOpen(false)}>
              Fechar
            </Button>
            <Button type="button" onClick={() => setIsFuelFiltersOpen(false)}>
              Aplicar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
