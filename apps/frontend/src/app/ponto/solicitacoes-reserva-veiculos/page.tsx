'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Car, CheckCircle, Clock, FileText, Filter, MoreVertical, Search, Users, X, XCircle, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { DateTimePickerField } from '@/components/ui/DateTimePickerField';
import {
  VehicleInspectionLaudoField,
  isBlankInspectionLaudo
} from '@/components/ui/VehicleInspectionLaudoField';
import api from '@/lib/api';
import { formatPlacaDisplay } from '@/lib/brazilianVehiclePlate';
import {
  formatVehicleReservationStatus,
  vehicleReservationStatusBadgeClass,
  defaultReturnDatetimeLocalValue,
  type VehicleReservationStatus
} from '@/lib/vehicleReservationLabels';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
  rowActionMenuButtonClass
} from '@/components/ui/listTableUi';

type VehicleOption = {
  id: string;
  code: string;
  marcaVeic?: string | null;
  modeloVeic: string;
  placaVeic: string;
  inUse?: boolean;
  activeReservation?: {
    id: string;
    code: string | null;
    solicitante?: string | null;
    motorista?: string | null;
  } | null;
};

type VehicleReservation = {
  id: string;
  code: string;
  solicitante: string;
  motorista: string;
  atividade: string;
  localDestino: string;
  dataUsoInicio: string;
  dataUsoFim: string;
  periodoUso: string[];
  polo?: string | null;
  contrato?: string | null;
  assinatura: string;
  status: VehicleReservationStatus;
  observacaoCapacidadeVeiculo?: string | null;
  suppliesApprovalComment?: string | null;
  suppliesRejectionReason?: string | null;
  suppliesApprovedAt?: string | null;
  devolucaoAt?: string | null;
  baixaObservacao?: string | null;
  baixaFotoUrl?: string | null;
  baixaAssinatura?: string | null;
  baixaReportedAt?: string | null;
  vehicle?: VehicleOption;
  createdBy?: { id: string; name: string } | null;
  suppliesApprovedBy?: { id: string; name: string } | null;
  baixaReportedBy?: { id: string; name: string } | null;
  vistoriaAt?: string | null;
  vistoriaLaudoUrl?: string | null;
  vistoriaLaudoFileName?: string | null;
  vistoriaReportedAt?: string | null;
  vistoriaReportedBy?: { id: string; name: string } | null;
};

const ITEMS_PER_PAGE = 20;

type SuppliesCardFilter = 'all' | 'pending' | 'IN_USE' | 'CONCLUDED' | 'CANCELLED';

type DetailStatusFilter = 'ALL' | 'SUPPLIES_QUEUE' | VehicleReservationStatus;

const DETAIL_STATUS_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'ALL', label: 'Todos do card selecionado' },
  { value: 'SUPPLIES_QUEUE', label: 'Aguardando e Aguardando vistoria' },
  { value: 'PENDING_SUPPLIES', label: 'Aguardando' },
  { value: 'APPROVED', label: 'Em uso' },
  { value: 'COMPLETED', label: 'Aguardando vistoria' },
  { value: 'INSPECTED', label: 'Vistoriadas' },
  { value: 'REJECTED', label: 'Rejeitadas' },
  { value: 'CANCELLED', label: 'Canceladas' },
]);

const DEFAULT_CARD_FILTER: SuppliesCardFilter = 'pending';

const SUPPLIES_CARD_LIST_CONFIG: Record<
  SuppliesCardFilter,
  {
    title: string;
    subtitle: string;
    Icon: LucideIcon;
    iconBg: string;
    iconColor: string;
  }
> = {
  all: {
    title: 'Todas as Solicitações de Reserva',
    subtitle: 'Todas as reservas de veículos registradas no sistema.',
    Icon: Users,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400'
  },
  pending: {
    title: 'Solicitações Pendentes',
    subtitle: 'Aguardando aprovação ou vistoria do Suprimentos.',
    Icon: Clock,
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400'
  },
  IN_USE: {
    title: 'Reservas Em Uso',
    subtitle: 'Veículos aprovados e em utilização.',
    Icon: Car,
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600 dark:text-purple-400'
  },
  CONCLUDED: {
    title: 'Solicitações Vistoriadas',
    subtitle: 'Reservas vistoriadas e finalizadas.',
    Icon: CheckCircle,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400'
  },
  CANCELLED: {
    title: 'Solicitações Canceladas',
    subtitle: 'Reservas canceladas ou rejeitadas.',
    Icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400'
  }
};

const SUPPLIES_STAT_CARDS: {
  filter: SuppliesCardFilter;
  label: string;
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
  countKey: keyof { total: number; pending: number; inUse: number; concluded: number; cancelled: number };
}[] = [
  {
    filter: 'all',
    label: 'Registros',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: Users,
    countKey: 'total'
  },
  {
    filter: 'pending',
    label: 'Pendentes',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    Icon: Clock,
    countKey: 'pending'
  },
  {
    filter: 'IN_USE',
    label: 'Em Uso',
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600 dark:text-purple-400',
    Icon: Car,
    countKey: 'inUse'
  },
  {
    filter: 'CONCLUDED',
    label: 'Vistoriadas',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
    countKey: 'concluded'
  },
  {
    filter: 'CANCELLED',
    label: 'Canceladas',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: XCircle,
    countKey: 'cancelled'
  }
];

function cardFilterToApiParam(filter: SuppliesCardFilter): string | undefined {
  if (filter === 'all') return undefined;
  if (filter === 'pending') return 'PENDING_SUPPLIES,COMPLETED';
  if (filter === 'IN_USE') return 'APPROVED';
  if (filter === 'CONCLUDED') return 'INSPECTED';
  return 'CANCELLED,REJECTED';
}

function matchesDetailStatusFilter(
  status: VehicleReservationStatus,
  filter: DetailStatusFilter
): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'SUPPLIES_QUEUE') {
    return status === 'PENDING_SUPPLIES' || status === 'COMPLETED';
  }
  return status === filter;
}

function formatVehicleLabel(vehicle?: VehicleOption | null): string {
  if (!vehicle) return 'A definir';
  const placa = formatPlacaDisplay(vehicle.placaVeic);
  const modelo = [vehicle.marcaVeic, vehicle.modeloVeic].filter(Boolean).join(' ').trim();
  return modelo ? `${placa} · ${modelo}` : placa;
}

function formatVehicleSelectLabel(vehicle: VehicleOption): string {
  const placa = formatPlacaDisplay(vehicle.placaVeic);
  const modelo = [vehicle.marcaVeic, vehicle.modeloVeic].filter(Boolean).join(' ').trim();
  return modelo ? `${placa} · ${modelo}` : placa;
}

function formatDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'dd/MM/yyyy HH:mm', { locale: ptBR });
}

function formatDateTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'dd/MM/yyyy HH:mm:ss', { locale: ptBR });
}

export default function SolicitacoesReservaVeiculosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [cardFilter, setCardFilter] = useState<SuppliesCardFilter>(DEFAULT_CARD_FILTER);
  const [detailStatusFilter, setDetailStatusFilter] = useState<DetailStatusFilter>('ALL');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<VehicleReservation | null>(null);
  const [suppliesComment, setSuppliesComment] = useState('');
  const [approveVehicleId, setApproveVehicleId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [vistoriaAt, setVistoriaAt] = useState(defaultReturnDatetimeLocalValue());
  const [vistoriaLaudo, setVistoriaLaudo] = useState('');
  const [vistoriaLaudoFileName, setVistoriaLaudoFileName] = useState('');

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
    }
  });

  const { data: statsData, isLoading: loadingStats } = useQuery({
    queryKey: ['vehicle-reservations-supplies', 'stats'],
    queryFn: async () => {
      const res = await api.get('/vehicle-reservations', { params: { limit: 500, page: 1 } });
      return (res.data?.data || []) as VehicleReservation[];
    },
    enabled: !loadingUser,
    staleTime: 0
  });

  const { data: listData, isLoading: loadingList, isError: listError, refetch: refetchList } = useQuery({
    queryKey: ['vehicle-reservations-supplies', searchTerm, cardFilter],
    queryFn: async () => {
      const res = await api.get('/vehicle-reservations', {
        params: {
          search: searchTerm || undefined,
          status: cardFilterToApiParam(cardFilter),
          limit: 100,
          page: 1
        }
      });
      return (res.data?.data || []) as VehicleReservation[];
    },
    enabled: !loadingUser,
    staleTime: 0,
    refetchOnMount: 'always'
  });

  const refreshReservationQueries = (updated?: VehicleReservation | null) => {
    if (updated?.id) {
      queryClient.setQueryData(['vehicle-reservation-detail', updated.id], updated);
    }
    // Só invalidar listas: o cache de `vehicle-reservations` no app do colaborador
    // usa `{ data, pagination }`, não um array — um `.map` ali quebrava o onSuccess
    // e disparava o toast de erro mesmo com a vistoria já salva.
    void queryClient.invalidateQueries({ queryKey: ['vehicle-reservation-detail'] });
    void queryClient.invalidateQueries({ queryKey: ['vehicle-reservations'] });
    void queryClient.invalidateQueries({ queryKey: ['vehicle-reservations-supplies'] });
    void queryClient.invalidateQueries({ queryKey: ['vehicle-reservation-supplies-pending-count'] });
    void queryClient.invalidateQueries({ queryKey: ['vehicle-reservation-supplies-vehicles'] });
    void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  };

  const approveMutation = useMutation({
    mutationFn: async ({ id, vehicleId }: { id: string; vehicleId: string }) => {
      const res = await api.put(`/vehicle-reservations/${id}/supplies-approve`, {
        vehicleId,
        comment: suppliesComment.trim() || undefined
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('Reserva aprovada com sucesso.');
      setSelected(null);
      setSuppliesComment('');
      setApproveVehicleId('');
      setShowRejectForm(false);
      refreshReservationQueries((data?.data as VehicleReservation | undefined) ?? null);
    },
    onError: (err: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Erro ao aprovar reserva');
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.put(`/vehicle-reservations/${id}/supplies-reject`, {
        reason: rejectReason.trim()
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('Reserva rejeitada.');
      setSelected(null);
      setRejectReason('');
      setShowRejectForm(false);
      refreshReservationQueries((data?.data as VehicleReservation | undefined) ?? null);
    },
    onError: (err: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Erro ao rejeitar reserva');
    }
  });

  const inspectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.put(`/vehicle-reservations/${id}/submit-inspection`, {
        vistoriaAt,
        vistoriaLaudo,
        vistoriaLaudoFileName: vistoriaLaudoFileName || undefined
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('Vistoria registrada com sucesso.');
      setSelected(null);
      setVistoriaAt(defaultReturnDatetimeLocalValue());
      setVistoriaLaudo('');
      setVistoriaLaudoFileName('');
      refreshReservationQueries((data?.data as VehicleReservation | undefined) ?? null);
    },
    onError: (err: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Erro ao registrar vistoria');
    }
  });

  const { data: selectedDetail, isLoading: loadingSelectedDetail } = useQuery({
    queryKey: ['vehicle-reservation-detail', selected?.id],
    queryFn: async () => {
      const res = await api.get(`/vehicle-reservations/${selected!.id}`);
      return res.data?.data as VehicleReservation;
    },
    enabled: Boolean(selected?.id),
    staleTime: 0,
    refetchOnMount: 'always'
  });

  const { data: vehiclesData, isLoading: loadingVehicles } = useQuery({
    queryKey: ['vehicle-reservation-supplies-vehicles'],
    queryFn: async () => {
      const res = await api.get('/vehicles', {
        params: { isActive: 'true', limit: 100, page: 1 }
      });
      return (res.data?.data || []) as VehicleOption[];
    },
    enabled: Boolean(
      selected?.status === 'PENDING_SUPPLIES' &&
        (!selectedDetail || selectedDetail.status === 'PENDING_SUPPLIES')
    ),
    staleTime: 30 * 1000
  });

  const vehicleSelectOptions = useMemo<MultiSelectSearchOption[]>(
    () =>
      (vehiclesData || []).map((vehicle) => {
        const inUse = Boolean(vehicle.inUse);
        const who =
          vehicle.activeReservation?.motorista ||
          vehicle.activeReservation?.solicitante ||
          null;
        return {
          value: vehicle.id,
          label: formatVehicleSelectLabel(vehicle),
          searchText: [
            vehicle.placaVeic,
            vehicle.marcaVeic,
            vehicle.modeloVeic,
            vehicle.code,
            inUse ? 'em uso' : 'disponível'
          ]
            .filter(Boolean)
            .join(' '),
          disabled: inUse,
          statusSegments: inUse
            ? [
                {
                  text: who ? `Em uso — ${who}` : 'Em uso',
                  className: 'text-violet-600 dark:text-violet-300'
                }
              ]
            : [
                {
                  text: 'Disponível',
                  className: 'text-emerald-600 dark:text-emerald-300'
                }
              ]
        };
      }),
    [vehiclesData]
  );

  const selectedFromList = useMemo(
    () => (selected?.id ? listData?.find((row) => row.id === selected.id) : undefined),
    [listData, selected?.id]
  );

  // Prefer list/detail status over a stale modal snapshot so actions disappear right after approve.
  const selectedReservation = useMemo(() => {
    if (!selected) return null;
    const base = selectedDetail ?? selectedFromList ?? selected;
    const candidates = [
      selectedDetail?.status,
      selectedFromList?.status,
      selected.status
    ].filter((status): status is VehicleReservationStatus => Boolean(status));
    // After approve, list can be fresh while detail cache is still PENDING — never keep approve UI.
    const status =
      candidates.includes('PENDING_SUPPLIES') &&
      candidates.some((value) => value !== 'PENDING_SUPPLIES')
        ? candidates.find((value) => value !== 'PENDING_SUPPLIES')!
        : (candidates[0] ?? selected.status);
    return { ...base, status };
  }, [selected, selectedDetail, selectedFromList]);

  useEffect(() => {
    if (!selected?.id || !selectedFromList) return;
    if (selectedFromList.status !== selected.status) {
      setSelected(selectedFromList);
    }
  }, [selected?.id, selected?.status, selectedFromList]);

  const records = useMemo(
    () =>
      (listData || []).filter((row) => matchesDetailStatusFilter(row.status, detailStatusFilter)),
    [listData, detailStatusFilter]
  );

  const suppliesStats = useMemo(() => {
    const list = statsData || [];
    const pending = list.filter(
      (r) => r.status === 'PENDING_SUPPLIES' || r.status === 'COMPLETED'
    ).length;
    const inUse = list.filter((r) => r.status === 'APPROVED').length;
    const concluded = list.filter((r) => r.status === 'INSPECTED').length;
    const cancelled = list.filter(
      (r) => r.status === 'CANCELLED' || r.status === 'REJECTED'
    ).length;
    return { total: list.length, pending, inUse, concluded, cancelled };
  }, [statsData]);

  const listHeader = SUPPLIES_CARD_LIST_CONFIG[cardFilter];
  const ListHeaderIcon = listHeader.Icon;

  const selectCardFilter = (filter: SuppliesCardFilter) => {
    setCardFilter(filter);
    setDetailStatusFilter('ALL');
  };
  const totalFiltered = records.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = records.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const startItem = totalFiltered === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(startIndex + ITEMS_PER_PAGE, totalFiltered);
  const isListEmpty = !loadingList && !listError && totalFiltered === 0;
  const hasActiveFilter = detailStatusFilter !== 'ALL';

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, cardFilter, detailStatusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (selected?.status === 'COMPLETED') {
      setVistoriaAt(defaultReturnDatetimeLocalValue());
      setVistoriaLaudo('');
      setVistoriaLaudoFileName('');
    }
    if (selected?.status === 'PENDING_SUPPLIES') {
      setApproveVehicleId('');
      setSuppliesComment('');
      setShowRejectForm(false);
      setRejectReason('');
    }
  }, [selected?.id, selected?.status]);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/solicitacoes-reserva-veiculos">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Reservas de Veículos
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Fila do Suprimentos: analise e aprove ou rejeite solicitações de uso da frota.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 2xl:grid-cols-5">
            {SUPPLIES_STAT_CARDS.map((card) => (
              <FilterStatCard
                key={card.filter}
                label={card.label}
                count={suppliesStats[card.countKey]}
                icon={card.Icon}
                iconBg={card.iconBg}
                iconColor={card.iconColor}
                isActive={cardFilter === card.filter}
                loading={loadingStats}
                onClick={() => selectCardFilter(card.filter)}
              />
            ))}
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                    <ListHeaderIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {listHeader.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{listHeader.subtitle}</p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="search"
                      placeholder="Buscar por solicitante, motorista, placa..."
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
                    <span className="text-gray-600 dark:text-gray-400">Carregando reservas...</span>
                  </div>
                </div>
              ) : listError ? (
                <div className="py-8 text-center">
                  <p className="text-gray-600 dark:text-gray-400">Não foi possível carregar as reservas.</p>
                  <button
                    type="button"
                    onClick={() => void refetchList()}
                    className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : isListEmpty ? (
                <div className="py-8 text-center">
                  <ListHeaderIcon
                    className={`mx-auto mb-4 h-12 w-12 ${listHeader.iconColor} opacity-60`}
                  />
                  <p className="text-gray-600 dark:text-gray-400">Nenhuma reserva encontrada</p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {startItem} a {endItem} de {totalFiltered}{' '}
                      {totalFiltered === 1 ? 'reserva' : 'reservas'}
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
                            ID
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Solicitante
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Uso
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Veículo / Motorista
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Contrato
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Status
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
                            onClick={() => {
                              setSelected(row);
                              setShowRejectForm(false);
                              setSuppliesComment('');
                              setApproveVehicleId('');
                              setRejectReason('');
                            }}
                            className={getListTableRowClassName(true)}
                          >
                            <td className="px-3 py-4 sm:px-6">
                              <ListRowNavigableLabel className="font-medium">{row.code}</ListRowNavigableLabel>
                            </td>
                            <td className="px-3 py-4 text-gray-900 dark:text-gray-100 sm:px-6">
                              {row.solicitante}
                            </td>
                            <td className="px-3 py-4 text-center text-gray-900 dark:text-gray-100 sm:px-6">
                              <div className="inline-flex flex-col items-center gap-0.5 leading-tight">
                                <span className="whitespace-nowrap">
                                  {formatDateLabel(row.dataUsoInicio)}
                                </span>
                                {row.dataUsoFim !== row.dataUsoInicio ? (
                                  <span className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                    até {formatDateLabel(row.dataUsoFim)}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-4 text-center text-gray-900 dark:text-gray-100 sm:px-6">
                              <div>{formatVehicleLabel(row.vehicle)}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{row.motorista}</div>
                            </td>
                            <td className="max-w-[180px] truncate px-3 py-4 text-center text-gray-900 dark:text-gray-100 sm:px-6">
                              {row.contrato || '—'}
                            </td>
                            <td className="px-3 py-4 text-center sm:px-6">
                              <span
                                className={`inline-flex max-w-[220px] whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${vehicleReservationStatusBadgeClass(row.status)}`}
                              >
                                {formatVehicleReservationStatus(row.status)}
                              </span>
                            </td>
                            <td
                              className="px-3 py-4 text-right sm:px-6"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setSelected(row);
                                  setShowRejectForm(false);
                                  setSuppliesComment('');
                                  setApproveVehicleId('');
                                  setRejectReason('');
                                }}
                                className={rowActionMenuButtonClass(false)}
                                aria-label="Ver detalhes da reserva"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 ? (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-gray-600"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-gray-600"
                      >
                        Próxima
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Modal
          isOpen={!!selected}
          onClose={() => {
            setSelected(null);
            setShowRejectForm(false);
            setSuppliesComment('');
            setApproveVehicleId('');
            setRejectReason('');
          }}
          title={`Reserva #${selected?.code ?? ''}`}
          size="lg"
        >
          {selectedReservation ? (
            <div className="space-y-4">
              {loadingSelectedDetail ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Carregando detalhes...</p>
              ) : null}
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Solicitante</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedReservation.solicitante}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Motorista</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedReservation.motorista}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Status</dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${vehicleReservationStatusBadgeClass(selectedReservation.status)}`}
                    >
                      {formatVehicleReservationStatus(selectedReservation.status)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Veículo</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {formatVehicleLabel(selectedReservation.vehicle)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Contrato</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedReservation.contrato || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Polo</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedReservation.polo || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Início do uso</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {formatDateLabel(selectedReservation.dataUsoInicio)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Fim do uso</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {formatDateLabel(selectedReservation.dataUsoFim)}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-gray-500 dark:text-gray-400">Atividade</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedReservation.atividade}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-gray-500 dark:text-gray-400">Local de destino</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedReservation.localDestino}
                  </dd>
                </div>
                {selectedReservation.observacaoCapacidadeVeiculo ? (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500 dark:text-gray-400">
                      Observações
                    </dt>
                    <dd className="font-medium text-gray-900 dark:text-gray-100">
                      {selectedReservation.observacaoCapacidadeVeiculo}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {selectedReservation.assinatura ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Assinatura da solicitação
                  </p>
                  <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-600">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedReservation.assinatura}
                      alt="Assinatura do solicitante"
                      className="mx-auto max-h-32 w-full object-contain"
                    />
                  </div>
                </div>
              ) : null}

              {selectedReservation.suppliesApprovalComment ? (
                <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-200">
                  Observação da aprovação: {selectedReservation.suppliesApprovalComment}
                </p>
              ) : null}

              {selectedReservation.suppliesRejectionReason ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
                  Motivo da rejeição: {selectedReservation.suppliesRejectionReason}
                </p>
              ) : null}

              {(selectedReservation.status === 'COMPLETED' ||
                selectedReservation.status === 'INSPECTED') ? (
                <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Devolução do veículo
                  </h3>
                  <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">Data e hora da devolução</dt>
                      <dd className="font-medium text-gray-900 dark:text-gray-100">
                        {selectedReservation.devolucaoAt
                          ? formatDateTimeLabel(selectedReservation.devolucaoAt)
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">Registrado por</dt>
                      <dd className="font-medium text-gray-900 dark:text-gray-100">
                        {selectedReservation.baixaReportedBy?.name || '—'}
                      </dd>
                    </div>
                    {selectedReservation.baixaObservacao ? (
                      <div className="sm:col-span-2">
                        <dt className="text-gray-500 dark:text-gray-400">Observação</dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100">
                          {selectedReservation.baixaObservacao}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  {selectedReservation.baixaFotoUrl ? (
                    <div>
                      <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        Foto do veículo
                      </p>
                      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-600">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selectedReservation.baixaFotoUrl}
                          alt="Foto do veículo na devolução"
                          className="mx-auto max-h-48 w-full object-contain"
                        />
                      </div>
                    </div>
                  ) : null}
                  {selectedReservation.baixaAssinatura ? (
                    <div>
                      <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        Assinatura da devolução
                      </p>
                      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-600">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selectedReservation.baixaAssinatura}
                          alt="Assinatura da devolução"
                          className="mx-auto max-h-32 w-full object-contain"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedReservation.status === 'COMPLETED' ? (
                <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Vistoria do veículo
                  </h3>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Data e hora da vistoria *
                    </label>
                    <DateTimePickerField
                      value={vistoriaAt}
                      onChange={setVistoriaAt}
                      placeholder="dd/mm/aaaa hh:mm"
                      aria-label="Data e hora da vistoria"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Laudo de vistoria *
                    </label>
                    <VehicleInspectionLaudoField
                      value={vistoriaLaudo}
                      fileName={vistoriaLaudoFileName}
                      onChange={(value, name) => {
                        setVistoriaLaudo(value);
                        setVistoriaLaudoFileName(name);
                      }}
                      disabled={inspectionMutation.isPending}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => {
                        if (!vistoriaAt) return toast.error('Informe a data e hora da vistoria');
                        if (isBlankInspectionLaudo(vistoriaLaudo)) {
                          return toast.error('Anexe o laudo de vistoria');
                        }
                        inspectionMutation.mutate(selectedReservation.id);
                      }}
                      disabled={inspectionMutation.isPending}
                    >
                      {inspectionMutation.isPending ? 'Salvando...' : 'Salvar vistoria'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {selectedReservation.status === 'INSPECTED' ? (
                <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Vistoria do veículo
                  </h3>
                  <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">Data e hora da vistoria</dt>
                      <dd className="font-medium text-gray-900 dark:text-gray-100">
                        {selectedReservation.vistoriaAt
                          ? formatDateTimeLabel(selectedReservation.vistoriaAt)
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">Registrado por</dt>
                      <dd className="font-medium text-gray-900 dark:text-gray-100">
                        {selectedReservation.vistoriaReportedBy?.name || '—'}
                      </dd>
                    </div>
                  </dl>
                  {selectedReservation.vistoriaLaudoUrl ? (
                    <a
                      href={selectedReservation.vistoriaLaudoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <FileText className="h-4 w-4" />
                      {selectedReservation.vistoriaLaudoFileName || 'Abrir laudo de vistoria'}
                    </a>
                  ) : null}
                </div>
              ) : null}

              {selectedReservation.status === 'PENDING_SUPPLIES' ? (
                <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                  {!showRejectForm ? (
                    <>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Veículo disponibilizado *
                        </label>
                        <SingleSelectSearchDropdown
                          value={approveVehicleId}
                          onChange={setApproveVehicleId}
                          options={vehicleSelectOptions}
                          disabled={loadingVehicles || approveMutation.isPending}
                          allowEmpty={false}
                          placeholder={
                            loadingVehicles
                              ? 'Carregando veículos...'
                              : 'Selecionar veículo da frota...'
                          }
                          searchPlaceholder="Pesquisar por placa, modelo ou status..."
                          emptyOptionsMessage="Nenhum veículo ativo cadastrado."
                          noFocusRing
                        />
                        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                          Veículos em uso aparecem bloqueados até a devolução.
                        </p>
                      </div>
                      <Input
                        label="Observação (opcional)"
                        value={suppliesComment}
                        onChange={(e) => setSuppliesComment(e.target.value)}
                        placeholder="Mensagem sobre a aprovação"
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowRejectForm(true)}
                          disabled={approveMutation.isPending}
                        >
                          Rejeitar
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            if (!approveVehicleId) {
                              return toast.error('Selecione o veículo disponibilizado');
                            }
                            approveMutation.mutate({
                              id: selectedReservation.id,
                              vehicleId: approveVehicleId
                            });
                          }}
                          disabled={approveMutation.isPending || !approveVehicleId}
                        >
                          {approveMutation.isPending ? 'Aprovando...' : 'Aprovar'}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Input
                        label="Motivo da rejeição"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Informe o motivo"
                        required
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowRejectForm(false)}
                          disabled={rejectMutation.isPending}
                        >
                          Voltar
                        </Button>
                        <Button
                          type="button"
                          variant="error"
                          onClick={() => rejectMutation.mutate(selectedReservation.id)}
                          disabled={rejectMutation.isPending || !rejectReason.trim()}
                        >
                          {rejectMutation.isPending ? 'Rejeitando...' : 'Confirmar rejeição'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </Modal>

        <Modal
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          title="Filtros — Reservas de Veículos"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Status
              </label>
              <StringSingleSelectDropdown
                value={detailStatusFilter}
                onChange={(value) => setDetailStatusFilter(value as DetailStatusFilter)}
                options={DETAIL_STATUS_FILTER_OPTIONS}
                allowEmpty={false}
                className="w-full"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <Button type="button" variant="outline" onClick={() => setIsFiltersOpen(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
