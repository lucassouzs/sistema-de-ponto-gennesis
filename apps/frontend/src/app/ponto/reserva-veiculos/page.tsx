'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Car, CheckCircle, ClipboardCheck, Clock, Eye, FileText, Plus, Search, Users, X, XCircle, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId,
  getCadastroListRange
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
  getListTableRowClassName,
  ListRowNavigableLabel,
  type RowActionMenuExtraItem
} from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { SignatureField, isBlankSignature } from '@/components/ui/SignatureField';
import {
  VehicleReturnPhotoField,
  isBlankVehiclePhoto
} from '@/components/ui/VehicleReturnPhotoField';
import { DateTimePickerField } from '@/components/ui/DateTimePickerField';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';
import { POLO_OPTIONS } from '@/components/suprimentos/materialDeliveryLabels';
import { useCostCenters } from '@/hooks/useCostCenters';
import { formatPlacaDisplay } from '@/lib/brazilianVehiclePlate';
import {
  defaultReturnDatetimeLocalValue,
  defaultUsoDatetimeLocalValue,
  formatVehicleReservationStatus,
  vehicleReservationStatusBadgeClass,
  type VehicleReservationStatus
} from '@/lib/vehicleReservationLabels';
import toast from 'react-hot-toast';
import api from '@/lib/api';

type DriverSelectOption = {
  id: string;
  name: string;
  cpf: string;
};

type VehicleOption = {
  id: string;
  code: string;
  marcaVeic?: string | null;
  modeloVeic: string;
  placaVeic: string;
};

type VehicleReservation = {
  id: string;
  code: string;
  solicitante: string;
  motorista: string;
  vehicleId?: string | null;
  observacaoCapacidadeVeiculo?: string | null;
  atividade: string;
  localDestino: string;
  dataUsoInicio: string;
  dataUsoFim: string;
  polo?: string | null;
  contrato?: string | null;
  assinatura: string;
  status: VehicleReservationStatus;
  createdAt?: string | null;
  suppliesApprovalComment?: string | null;
  suppliesRejectionReason?: string | null;
  createdBy?: { id: string; name: string } | null;
  vehicle?: VehicleOption;
  vistoriaAt?: string | null;
  vistoriaLaudoUrl?: string | null;
  vistoriaLaudoFileName?: string | null;
  vistoriaReportedBy?: { id: string; name: string } | null;
};

type ReturnFormState = {
  devolucaoAt: string;
  baixaFoto: string;
  baixaObservacao: string;
  baixaAssinatura: string;
};

const EMPTY_RETURN_FORM = (): ReturnFormState => ({
  devolucaoAt: defaultReturnDatetimeLocalValue(),
  baixaFoto: '',
  baixaObservacao: '',
  baixaAssinatura: ''
});

type ReservationFormState = {
  motorista: string;
  observacaoCapacidadeVeiculo: string;
  atividade: string;
  localDestino: string;
  dataUsoInicio: string;
  dataUsoFim: string;
  polo: string;
  contrato: string;
};

const EMPTY_FORM = (): ReservationFormState => ({
  motorista: '',
  observacaoCapacidadeVeiculo: '',
  atividade: '',
  localDestino: '',
  dataUsoInicio: defaultUsoDatetimeLocalValue(8, 0),
  dataUsoFim: defaultUsoDatetimeLocalValue(17, 0),
  polo: '',
  contrato: ''
});

const fieldClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

function formatVehicleLabel(vehicle: VehicleOption): string {
  const placa = formatPlacaDisplay(vehicle.placaVeic);
  const modelo = [vehicle.marcaVeic, vehicle.modeloVeic].filter(Boolean).join(' ').trim();
  return modelo ? `${placa} · ${modelo}` : placa;
}

function formatDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'dd/MM/yyyy HH:mm', { locale: ptBR });
}

function formatDateOnlyLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'dd/MM/yyyy', { locale: ptBR });
}

function formatTimeOnlyLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'HH:mm', { locale: ptBR });
}

function formatDateTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'dd/MM/yyyy HH:mm:ss', { locale: ptBR });
}

function UsoPeriodLabel({ inicio, fim }: { inicio: string; fim: string }) {
  const start = new Date(inicio);
  const end = new Date(fim);
  const startValid = !Number.isNaN(start.getTime());
  const endValid = !Number.isNaN(end.getTime());

  if (!startValid) {
    return <span className="whitespace-nowrap">—</span>;
  }

  if (endValid && isSameDay(start, end) && inicio !== fim) {
    return (
      <>
        <span className="whitespace-nowrap">{formatDateOnlyLabel(inicio)}</span>
        <span className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
          {formatTimeOnlyLabel(inicio)} às {formatTimeOnlyLabel(fim)}
        </span>
      </>
    );
  }

  return (
    <>
      <span className="whitespace-nowrap">{formatDateLabel(inicio)}</span>
      {fim !== inicio ? (
        <span className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
          até {formatDateLabel(fim)}
        </span>
      ) : null}
    </>
  );
}

type ReservationCardFilter = 'all' | 'pending' | 'IN_USE' | 'CONCLUDED' | 'CANCELLED';

const DEFAULT_CARD_FILTER: ReservationCardFilter = 'all';

const RESERVATION_CARD_LIST_CONFIG: Record<
  ReservationCardFilter,
  {
    title: string;
    subtitle: string;
    Icon: LucideIcon;
    iconBg: string;
    iconColor: string;
  }
> = {
  all: {
    title: 'Todas as reservas',
    subtitle: 'Visão geral das suas solicitações de uso da frota.',
    Icon: Users,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  pending: {
    title: 'Reservas pendentes',
    subtitle: 'Aguardando aprovação do Suprimentos ou vistoria.',
    Icon: Clock,
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  IN_USE: {
    title: 'Reservas em uso',
    subtitle: 'Veículos aprovados e em utilização.',
    Icon: Car,
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600 dark:text-purple-400',
  },
  CONCLUDED: {
    title: 'Reservas vistoriadas',
    subtitle: 'Reservas vistoriadas e finalizadas.',
    Icon: CheckCircle,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  CANCELLED: {
    title: 'Reservas canceladas',
    subtitle: 'Solicitações canceladas ou rejeitadas.',
    Icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
};

const RESERVATION_STAT_CARDS: {
  filter: ReservationCardFilter;
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
    countKey: 'total',
  },
  {
    filter: 'pending',
    label: 'Pendentes',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    Icon: Clock,
    countKey: 'pending',
  },
  {
    filter: 'IN_USE',
    label: 'Em Uso',
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600 dark:text-purple-400',
    Icon: Car,
    countKey: 'inUse',
  },
  {
    filter: 'CONCLUDED',
    label: 'Vistoriadas',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
    countKey: 'concluded',
  },
  {
    filter: 'CANCELLED',
    label: 'Canceladas',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: XCircle,
    countKey: 'cancelled',
  },
];

function cardFilterToApiParam(filter: ReservationCardFilter): string | undefined {
  if (filter === 'all') return undefined;
  if (filter === 'pending') return 'PENDING_SUPPLIES,COMPLETED';
  if (filter === 'IN_USE') return 'APPROVED';
  if (filter === 'CONCLUDED') return 'INSPECTED';
  return 'CANCELLED,REJECTED';
}

export default function ReservaVeiculosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [cardFilter, setCardFilter] = useState<ReservationCardFilter>(DEFAULT_CARD_FILTER);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [returnReservation, setReturnReservation] = useState<VehicleReservation | null>(null);
  const [inspectionReservation, setInspectionReservation] = useState<VehicleReservation | null>(null);
  const [detailReservation, setDetailReservation] = useState<VehicleReservation | null>(null);
  const [returnFormData, setReturnFormData] = useState<ReturnFormState>(EMPTY_RETURN_FORM);
  const [formData, setFormData] = useState<ReservationFormState>(EMPTY_FORM);
  const { costCenters, isLoading: loadingCostCenters } = useCostCenters();

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
    queryKey: ['vehicle-reservations', 'stats'],
    queryFn: async () => {
      const res = await api.get('/vehicle-reservations', { params: { limit: 500, page: 1 } });
      return (res.data?.data || []) as VehicleReservation[];
    },
    enabled: !loadingUser,
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ['vehicle-reservations', searchTerm, cardFilter, currentPage, itemsPerPage],
    queryFn: async () => {
      const res = await api.get('/vehicle-reservations', {
        params: {
          search: searchTerm || undefined,
          status: cardFilterToApiParam(cardFilter),
          page: currentPage,
          limit: itemsPerPage
        }
      });
      return res.data;
    }
  });

  const { data: employeeOptions = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ['vehicle-reservation-driver-options'],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests/driver-options');
      return (res.data?.data || []) as DriverSelectOption[];
    },
    enabled: showForm,
    staleTime: 10 * 60 * 1000
  });

  const reservations = (listData?.data || []) as VehicleReservation[];
  const pagination = listData?.pagination || {
    page: 1,
    limit: itemsPerPage,
    total: 0,
    totalPages: 1
  };

  const reservationStats = useMemo(() => {
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

  const listHeader = RESERVATION_CARD_LIST_CONFIG[cardFilter];
  const ListHeaderIcon = listHeader.Icon;

  const selectCardFilter = (filter: ReservationCardFilter) => {
    setCardFilter(filter);
  };

  const employeeSelectOptions = useMemo<MultiSelectSearchOption[]>(
    () =>
      employeeOptions.map((employee) => ({
        value: employee.name,
        label: employee.name,
        description: employee.cpf || undefined,
        searchText: `${employee.name} ${employee.cpf || ''}`
      })),
    [employeeOptions]
  );

  const selectedMotoristaCpf = useMemo(
    () => employeeOptions.find((employee) => employee.name === formData.motorista)?.cpf || '',
    [employeeOptions, formData.motorista]
  );

  const contractSelectOptions = useMemo<MultiSelectSearchOption[]>(
    () =>
      costCenters.map((center) => ({
        value: center.label,
        label: center.label,
        searchText: center.label
      })),
    [costCenters]
  );

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
    setRowActionMenu
  } = useRowActionMenu(reservations);

  const listRange = getCadastroListRange(
    pagination.page,
    pagination.limit,
    pagination.total
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, cardFilter]);

  const openCreateForm = () => {
    setFormData(EMPTY_FORM());
    setShowForm(true);
  };

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await api.post('/vehicle-reservations', body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-reservations-supplies'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-reservation-supplies-pending-count'] });
      setShowForm(false);
      setFormData(EMPTY_FORM());
      toast.success('Reserva enviada! Aguardando aprovação do Suprimentos.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao registrar reserva')
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/vehicle-reservations/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-reservations'] });
      setDeleteId(null);
      setRowActionMenu(null);
      toast.success('Reserva excluída com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir reserva')
  });

  const returnMutation = useMutation({
    mutationFn: async ({
      id,
      body
    }: {
      id: string;
      body: Record<string, unknown>;
    }) => {
      const res = await api.put(`/vehicle-reservations/${id}/submit-return`, body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-reservations-supplies'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-reservation-supplies-vehicles'] });
      setReturnReservation(null);
      setReturnFormData(EMPTY_RETURN_FORM());
      toast.success('Baixa registrada! Aguardando vistoria do Suprimentos.');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || 'Erro ao registrar baixa do veículo')
  });

  const openReturnModal = (reservation: VehicleReservation) => {
    setDetailReservation(null);
    setReturnReservation(reservation);
    setReturnFormData(EMPTY_RETURN_FORM());
  };

  const openInspectionModal = (reservation: VehicleReservation) => {
    setDetailReservation(null);
    setInspectionReservation(reservation);
  };

  const openDetail = (reservation: VehicleReservation) => {
    closeRowActionMenu();
    setDetailReservation(reservation);
  };

  const { data: inspectionDetail, isLoading: loadingInspectionDetail } = useQuery({
    queryKey: ['vehicle-reservation-detail', inspectionReservation?.id],
    queryFn: async () => {
      const res = await api.get(`/vehicle-reservations/${inspectionReservation!.id}`);
      return res.data?.data as VehicleReservation;
    },
    enabled: Boolean(inspectionReservation?.id)
  });

  const inspectionData = inspectionDetail ?? inspectionReservation;

  const userCanSubmitReturn = (reservation: VehicleReservation): boolean => {
    const userName = String(userData?.data?.name ?? '').trim().toLowerCase();
    const userId = String(userData?.data?.id ?? '');
    if (userData?.data?.isAdmin) return true;
    if (reservation.createdBy?.id && reservation.createdBy.id === userId) return true;
    const solicitante = reservation.solicitante.trim().toLowerCase();
    return userName.length > 0 && userName === solicitante;
  };

  const buildRowExtraMenuItems = (reservation: VehicleReservation): RowActionMenuExtraItem[] => {
    const items: RowActionMenuExtraItem[] = [
      {
        label: 'Ver detalhes',
        onClick: () => openDetail(reservation),
        icon: <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
      }
    ];

    if (reservation.status === 'APPROVED' && userCanSubmitReturn(reservation)) {
      items.push({
        label: 'Dar baixa',
        onClick: () => openReturnModal(reservation),
        icon: (
          <ClipboardCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )
      });
    }

    if (reservation.status === 'INSPECTED') {
      items.push({
        label: 'Ver vistoria',
        onClick: () => openInspectionModal(reservation),
        icon: <FileText className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      });
    }

    return items;
  };

  const handleSubmitReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnReservation) return;
    if (!returnFormData.devolucaoAt) {
      return toast.error('Informe a data e hora da devolução');
    }
    if (isBlankVehiclePhoto(returnFormData.baixaFoto)) {
      return toast.error('Fotografe o veículo');
    }
    if (isBlankSignature(returnFormData.baixaAssinatura)) {
      return toast.error('Assine a devolução');
    }

    returnMutation.mutate({
      id: returnReservation.id,
      body: {
        devolucaoAt: returnFormData.devolucaoAt,
        baixaFoto: returnFormData.baixaFoto,
        baixaObservacao: returnFormData.baixaObservacao.trim() || undefined,
        baixaAssinatura: returnFormData.baixaAssinatura
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const solicitante = userData?.data?.name ? String(userData.data.name).trim() : '';
    if (!solicitante) return toast.error('Não foi possível identificar o solicitante logado');
    if (!formData.motorista) return toast.error('Selecione o motorista');
    if (!formData.atividade.trim()) return toast.error('Informe a atividade');
    if (!formData.localDestino.trim()) return toast.error('Informe o local de destino');
    if (!formData.dataUsoInicio) return toast.error('Informe o início do uso');
    if (!formData.dataUsoFim) return toast.error('Informe o fim do uso');
    if (formData.dataUsoFim < formData.dataUsoInicio) {
      return toast.error('O fim do uso não pode ser anterior ao início');
    }

    createMutation.mutate({
      solicitante,
      motorista: formData.motorista,
      atividade: formData.atividade.trim(),
      localDestino: formData.localDestino.trim(),
      dataUsoInicio: formData.dataUsoInicio,
      dataUsoFim: formData.dataUsoFim,
      periodoUso: [],
      polo: formData.polo || undefined,
      contrato: formData.contrato || undefined,
      observacaoCapacidadeVeiculo: formData.observacaoCapacidadeVeiculo.trim() || undefined
    });
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const isListEmpty = !isLoading && reservations.length === 0;

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/reserva-veiculos">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Reserva de Veículos
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Solicite o uso de veículos da frota
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 2xl:grid-cols-5">
            {RESERVATION_STAT_CARDS.map((card) => (
              <FilterStatCard
                key={card.filter}
                label={card.label}
                count={reservationStats[card.countKey]}
                icon={card.Icon}
                iconBg={card.iconBg}
                iconColor={card.iconColor}
                isActive={cardFilter === card.filter}
                loading={loadingStats}
                onClick={() => selectCardFilter(card.filter)}
              />
            ))}
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                    <ListHeaderIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                      {listHeader.title}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {listHeader.subtitle}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
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
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Nova reserva</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isLoading ? (
                <CadastroListLoading message="Carregando reservas..." />
              ) : isListEmpty ? (
                <CadastroListEmpty
                  icon={Car}
                  title="Nenhuma reserva encontrada"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : cardFilter === 'all'
                        ? 'Clique em Nova reserva para solicitar um veículo'
                        : 'Nenhuma reserva neste filtro'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={listRange.startItem}
                    endItem={listRange.endItem}
                    total={pagination.total}
                    itemLabel="reserva"
                    itemLabelPlural="reservas"
                    currentPage={pagination.page}
                    totalPages={pagination.totalPages}
                  />
                  <div className="table-scroll">
                    <table className={cadastroListClasses.table}>
                      <colgroup>
                        <col className="w-[4%]" />
                        <col className="w-[18%]" />
                        <col className="w-[18%]" />
                        <col className="w-[10%]" />
                        <col className="w-[16%]" />
                        <col className="w-[14%]" />
                        <col className="w-[12%]" />
                        <col className="w-[4%]" />
                      </colgroup>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>ID</th>
                          <th className={cadastroListClasses.th}>Solicitante</th>
                          <th className={cadastroListClasses.th}>Motorista</th>
                          <th className={cadastroListClasses.thCenter}>Veículo</th>
                          <th className={cadastroListClasses.thCenter}>Uso</th>
                          <th className={cadastroListClasses.thCenter}>Contrato</th>
                          <th className={cadastroListClasses.thCenter}>Status</th>
                          <th className={cadastroListClasses.thRight}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {reservations.map((reservation, index) => (
                          <tr
                            key={reservation.id}
                            onClick={() => openDetail(reservation)}
                            className={getListTableRowClassName(true)}
                          >
                            <td className={cadastroListClasses.tdMono}>
                              <ListRowNavigableLabel className="font-mono font-medium">
                                {formatCadastroListId(
                                  reservation.code,
                                  listRange.startItem + index
                                )}
                              </ListRowNavigableLabel>
                            </td>
                            <td className={cadastroListClasses.tdTruncate}>
                              <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                                {reservation.solicitante}
                              </span>
                            </td>
                            <td className={cadastroListClasses.tdTruncate}>
                              <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                                {reservation.motorista}
                              </span>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {reservation.vehicle
                                ? formatPlacaDisplay(reservation.vehicle.placaVeic)
                                : reservation.status === 'PENDING_SUPPLIES'
                                  ? 'A definir'
                                  : '—'}
                            </td>
                            <td className={`${cadastroListClasses.tdCenter} !whitespace-normal`}>
                              <div className="inline-flex flex-col items-center gap-0.5 leading-tight">
                                <UsoPeriodLabel
                                  inicio={reservation.dataUsoInicio}
                                  fim={reservation.dataUsoFim}
                                />
                              </div>
                            </td>
                            <td
                              className={`${cadastroListClasses.tdCenter} max-w-0 truncate`}
                              title={reservation.contrato || undefined}
                            >
                              {reservation.contrato || '—'}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              <span
                                className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${vehicleReservationStatusBadgeClass(
                                  reservation.status || 'PENDING_SUPPLIES'
                                )}`}
                              >
                                {formatVehicleReservationStatus(
                                  reservation.status || 'PENDING_SUPPLIES'
                                )}
                              </span>
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(reservation.id)}
                              onToggle={(e) =>
                                toggleRowActionMenu(
                                  reservation.id,
                                  e.currentTarget as HTMLButtonElement
                                )
                              }
                            />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {rowActionMenu && rowForActionMenu && (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      onEdit={closeRowActionMenu}
                      editDisabled
                      extraItems={buildRowExtraMenuItems(rowForActionMenu as VehicleReservation)}
                      onDelete={() => setDeleteId((rowForActionMenu as VehicleReservation).id)}
                      deleteDisabled={
                        (rowForActionMenu as VehicleReservation).status !== 'PENDING_SUPPLIES'
                      }
                      deleteDisabledTitle="Somente reservas pendentes podem ser excluídas"
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Modal
            isOpen={Boolean(detailReservation)}
            onClose={() => setDetailReservation(null)}
            title={
              detailReservation
                ? `Reserva ${detailReservation.code}`
                : 'Detalhes da reserva'
            }
            size="lg"
          >
            {detailReservation ? (
              <div className="space-y-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Status</span>
                    <p className="mt-0.5">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${vehicleReservationStatusBadgeClass(
                          detailReservation.status
                        )}`}
                      >
                        {formatVehicleReservationStatus(detailReservation.status)}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Contrato</span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {detailReservation.contrato || '—'}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Solicitante</span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {detailReservation.solicitante}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Motorista</span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {detailReservation.motorista}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-medium text-gray-500 dark:text-gray-400">Atividade</span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {detailReservation.atividade}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-medium text-gray-500 dark:text-gray-400">
                      Local de destino
                    </span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {detailReservation.localDestino}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Início do uso</span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {formatDateLabel(detailReservation.dataUsoInicio)}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Fim do uso</span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {formatDateLabel(detailReservation.dataUsoFim)}
                    </p>
                  </div>
                  {detailReservation.polo ? (
                    <div>
                      <span className="font-medium text-gray-500 dark:text-gray-400">Polo</span>
                      <p className="text-gray-900 dark:text-gray-100">{detailReservation.polo}</p>
                    </div>
                  ) : null}
                  {detailReservation.observacaoCapacidadeVeiculo ? (
                    <div className="sm:col-span-2">
                      <span className="font-medium text-gray-500 dark:text-gray-400">
                        Observações
                      </span>
                      <p className="text-gray-900 dark:text-gray-100">
                        {detailReservation.observacaoCapacidadeVeiculo}
                      </p>
                    </div>
                  ) : null}
                </div>

                {detailReservation.vehicle ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800/50 dark:bg-emerald-950/20">
                    <span className="font-medium text-emerald-800 dark:text-emerald-200">
                      Veículo liberado
                    </span>
                    <p className="mt-1 text-gray-900 dark:text-gray-100">
                      {formatVehicleLabel(detailReservation.vehicle)}
                    </p>
                  </div>
                ) : null}

                {detailReservation.suppliesApprovalComment ? (
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                    <span className="font-medium text-gray-500 dark:text-gray-400">
                      Observação do Suprimentos
                    </span>
                    <p className="mt-1 text-gray-900 dark:text-gray-100">
                      {detailReservation.suppliesApprovalComment}
                    </p>
                  </div>
                ) : null}

                {detailReservation.suppliesRejectionReason ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800/50 dark:bg-red-950/20">
                    <span className="font-medium text-red-800 dark:text-red-200">
                      Motivo da rejeição
                    </span>
                    <p className="mt-1 text-gray-900 dark:text-gray-100">
                      {detailReservation.suppliesRejectionReason}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                  {detailReservation.status === 'INSPECTED' ? (
                    <button
                      type="button"
                      onClick={() => openInspectionModal(detailReservation)}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200"
                    >
                      Ver vistoria
                    </button>
                  ) : null}
                  {detailReservation.status === 'APPROVED' &&
                  userCanSubmitReturn(detailReservation) ? (
                    <button
                      type="button"
                      onClick={() => openReturnModal(detailReservation)}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Dar baixa
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </Modal>

          <Modal
            isOpen={showForm}
            onClose={() => {
              setShowForm(false);
              setFormData(EMPTY_FORM());
            }}
            title="Nova reserva de veículo"
            size="lg"
          >
            <form onSubmit={handleSubmit} className="space-y-5">
              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Pessoas
                </h3>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Motorista *
                  </label>
                  <SingleSelectSearchDropdown
                    value={formData.motorista}
                    onChange={(motorista) => setFormData((current) => ({ ...current, motorista }))}
                    options={employeeSelectOptions}
                    disabled={loadingEmployees}
                    allowEmpty={false}
                    placeholder={
                      loadingEmployees ? 'Carregando funcionários...' : 'Selecionar motorista...'
                    }
                    searchPlaceholder="Pesquisar por nome ou CPF..."
                    noFocusRing
                  />
                  {selectedMotoristaCpf ? (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      CPF: {selectedMotoristaCpf}
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Atividade
                </h3>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Atividade *
                  </label>
                  <input
                    type="text"
                    value={formData.atividade}
                    onChange={(e) =>
                      setFormData((current) => ({ ...current, atividade: e.target.value }))
                    }
                    className={fieldClassName}
                    placeholder="Descreva a atividade"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Local de destino *
                  </label>
                  <input
                    type="text"
                    value={formData.localDestino}
                    onChange={(e) =>
                      setFormData((current) => ({ ...current, localDestino: e.target.value }))
                    }
                    className={fieldClassName}
                    placeholder="Informe o destino"
                  />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Agenda
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Início do uso *
                    </label>
                    <DateTimePickerField
                      value={formData.dataUsoInicio}
                      onChange={(dataUsoInicio) =>
                        setFormData((current) => ({
                          ...current,
                          dataUsoInicio,
                          dataUsoFim:
                            current.dataUsoFim && current.dataUsoFim < dataUsoInicio
                              ? dataUsoInicio
                              : current.dataUsoFim
                        }))
                      }
                      placeholder="Selecione data e hora"
                      aria-label="Início do uso"
                      noFocusRing
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Fim do uso *
                    </label>
                    <DateTimePickerField
                      value={formData.dataUsoFim}
                      onChange={(dataUsoFim) =>
                        setFormData((current) => ({
                          ...current,
                          dataUsoFim:
                            current.dataUsoInicio && dataUsoFim < current.dataUsoInicio
                              ? current.dataUsoInicio
                              : dataUsoFim
                        }))
                      }
                      min={formData.dataUsoInicio || undefined}
                      placeholder="Selecione data e hora"
                      aria-label="Fim do uso"
                      noFocusRing
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Extras
                </h3>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Polo (opcional)
                  </label>
                  <div className="flex gap-2">
                    {POLO_OPTIONS.map((option) => (
                      <ButtonSeg
                        key={option.value}
                        active={formData.polo === option.value}
                        onClick={() =>
                          setFormData((current) => ({ ...current, polo: option.value }))
                        }
                        label={option.label}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Contrato (opcional)
                  </label>
                  <SingleSelectSearchDropdown
                    value={formData.contrato}
                    onChange={(contrato) => setFormData((current) => ({ ...current, contrato }))}
                    options={contractSelectOptions}
                    disabled={loadingCostCenters}
                    placeholder={
                      loadingCostCenters ? 'Carregando contratos...' : 'Selecionar contrato...'
                    }
                    searchPlaceholder="Pesquisar..."
                    emptyOptionsMessage="Nenhum contrato disponível."
                    noFocusRing
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Observações (opcional)
                  </label>
                  <textarea
                    value={formData.observacaoCapacidadeVeiculo}
                    onChange={(e) =>
                      setFormData((current) => ({
                        ...current,
                        observacaoCapacidadeVeiculo: e.target.value
                      }))
                    }
                    className={`${fieldClassName} min-h-[80px] resize-y`}
                    placeholder="Ex.: necessário veículo para 5 passageiros, com caçamba, etc. (opcional)"
                    rows={3}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    O veículo será definido pelo setor de Suprimentos ao atender a solicitação.
                  </p>
                </div>
              </section>

              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFormData(EMPTY_FORM());
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Salvando...' : 'Salvar reserva'}
                </button>
              </div>
            </form>
          </Modal>

          <Modal
            isOpen={Boolean(returnReservation)}
            onClose={() => {
              setReturnReservation(null);
              setReturnFormData(EMPTY_RETURN_FORM());
            }}
            title="Baixa da reserva de veículo"
            size="lg"
          >
            {returnReservation ? (
              <form onSubmit={handleSubmitReturn} className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Veículo{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {returnReservation.vehicle
                      ? formatVehicleLabel(returnReservation.vehicle)
                      : '—'}
                  </span>
                  {' · '}
                  Reserva {returnReservation.code}
                </p>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Data e hora da devolução *
                  </label>
                  <DateTimePickerField
                    value={returnFormData.devolucaoAt}
                    onChange={(devolucaoAt) =>
                      setReturnFormData((current) => ({ ...current, devolucaoAt }))
                    }
                    placeholder="dd/mm/aaaa hh:mm"
                    aria-label="Data e hora da devolução"
                    disabled={returnMutation.isPending}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Foto do veículo *
                  </label>
                  <VehicleReturnPhotoField
                    value={returnFormData.baixaFoto}
                    onChange={(baixaFoto) =>
                      setReturnFormData((current) => ({ ...current, baixaFoto }))
                    }
                    disabled={returnMutation.isPending}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Observação
                  </label>
                  <input
                    type="text"
                    value={returnFormData.baixaObservacao}
                    onChange={(e) =>
                      setReturnFormData((current) => ({
                        ...current,
                        baixaObservacao: e.target.value
                      }))
                    }
                    className={fieldClassName}
                    placeholder="Opcional"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Assinatura *
                  </label>
                  <SignatureField
                    value={returnFormData.baixaAssinatura}
                    onChange={(baixaAssinatura) =>
                      setReturnFormData((current) => ({ ...current, baixaAssinatura }))
                    }
                  />
                </div>

                <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => {
                      setReturnReservation(null);
                      setReturnFormData(EMPTY_RETURN_FORM());
                    }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={returnMutation.isPending}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {returnMutation.isPending ? 'Salvando...' : 'Salvar baixa'}
                  </button>
                </div>
              </form>
            ) : null}
          </Modal>

          <Modal
            isOpen={Boolean(inspectionReservation)}
            onClose={() => setInspectionReservation(null)}
            title="Vistoria do veículo"
            size="md"
          >
            {inspectionData ? (
              loadingInspectionDetail ? (
                <div className="py-6 text-center text-sm text-gray-600 dark:text-gray-400">
                  Carregando vistoria...
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Veículo{' '}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {inspectionData.vehicle
                        ? formatVehicleLabel(inspectionData.vehicle)
                        : '—'}
                    </span>
                    {' · '}
                    Reserva {inspectionData.code}
                  </p>
                  <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">Data e hora da vistoria</dt>
                      <dd className="font-medium text-gray-900 dark:text-gray-100">
                        {inspectionData.vistoriaAt
                          ? formatDateTimeLabel(inspectionData.vistoriaAt)
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">Registrado por</dt>
                      <dd className="font-medium text-gray-900 dark:text-gray-100">
                        {inspectionData.vistoriaReportedBy?.name || '—'}
                      </dd>
                    </div>
                  </dl>
                  {inspectionData.vistoriaLaudoUrl ? (
                    <a
                      href={inspectionData.vistoriaLaudoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <FileText className="h-4 w-4" />
                      {inspectionData.vistoriaLaudoFileName || 'Abrir laudo de vistoria'}
                    </a>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Laudo de vistoria não disponível.
                    </p>
                  )}
                  <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => setInspectionReservation(null)}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              )
            ) : null}
          </Modal>

          <Modal
            isOpen={Boolean(deleteId)}
            onClose={() => setDeleteId(null)}
            title="Excluir reserva"
            size="md"
          >
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Tem certeza que deseja excluir esta reserva? Esta ação não pode ser desfeita.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </Modal>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
