'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Check,
  CheckCircle,
  Clock,
  Eye,
  FileText,
  Filter,
  Fuel,
  MoreVertical,
  Pencil,
  Search,
  Users,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListEmpty, CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import api from '@/lib/api';
import { hasFuelStoredPhoto, resolveFuelPhotoSrc } from '@/lib/resolveMediaUrl';
import { FuelRequestPhoto } from '@/components/fuel/FuelRequestPhoto';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
  listTableRowClasses,
  rowActionMenuButtonClass,
} from '@/components/ui/listTableUi';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { usePermissions } from '@/hooks/usePermissions';
import {
  VehicleReturnPhotoField,
  isBlankVehiclePhoto,
} from '@/components/ui/VehicleReturnPhotoField';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';

type FuelVehicleType = 'PRIVATE' | 'COMPANY';
type FuelTankLevelAfter = 'RESERVE' | 'QUARTER' | 'HALF' | 'THREE_QUARTERS' | 'FULL';

type FuelRefuelStatus =
  | 'PENDING_MANAGER'
  | 'PENDING_SUPPLIES'
  | 'AWAITING_REFUEL'
  | 'COMPLETED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

type SuppliesCardFilter = 'all' | 'analysis' | 'awaiting_refuel' | 'CONCLUDED' | 'CANCELLED';

type DetailStatusFilter = 'ALL' | 'SUPPLIES_QUEUE' | FuelRefuelStatus;

const DETAIL_STATUS_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'ALL', label: 'Todos do card selecionado' },
  { value: 'SUPPLIES_QUEUE', label: 'Pendentes e Liberado' },
  { value: 'PENDING_SUPPLIES', label: 'Pendente' },
  { value: 'AWAITING_REFUEL', label: 'Liberado' },
  { value: 'PENDING_MANAGER', label: 'Aguardando aprovação' },
  { value: 'COMPLETED', label: 'Concluídas' },
  { value: 'REJECTED', label: 'Rejeitadas' },
  { value: 'CANCELLED', label: 'Canceladas' },
]);

const DEFAULT_CARD_FILTER: SuppliesCardFilter = 'all';

const FUEL_SUPPLIES_ACTION_MENU_WIDTH_PX = 224;
const MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';
const MENU_ITEM_BORDER_CLASS = `${MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`;

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
    title: 'Todas as solicitações',
    subtitle: 'Todas as solicitações de abastecimento.',
    Icon: Users,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  analysis: {
    title: 'Pendentes',
    subtitle: 'Aguardando liberação do posto.',
    Icon: Clock,
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  awaiting_refuel: {
    title: 'Liberado',
    subtitle: 'Posto definido — colaborador pode abastecer.',
    Icon: Fuel,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  CONCLUDED: {
    title: 'Concluídas',
    subtitle: 'Solicitações finalizadas.',
    Icon: CheckCircle,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  CANCELLED: {
    title: 'Canceladas',
    subtitle: 'Solicitações canceladas ou rejeitadas.',
    Icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
};

const SUPPLIES_STAT_CARDS: {
  filter: SuppliesCardFilter;
  label: string;
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
  countKey: keyof {
    total: number;
    analysis: number;
    awaitingRefuel: number;
    concluded: number;
    cancelled: number;
  };
}[] = [
  {
    filter: 'all',
    label: 'Todas',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: Users,
    countKey: 'total',
  },
  {
    filter: 'analysis',
    label: 'Pendentes',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    Icon: Clock,
    countKey: 'analysis',
  },
  {
    filter: 'awaiting_refuel',
    label: 'Liberado',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    Icon: Fuel,
    countKey: 'awaitingRefuel',
  },
  {
    filter: 'CONCLUDED',
    label: 'Concluídas',
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

function cardFilterToApiParam(filter: SuppliesCardFilter): string | undefined {
  if (filter === 'all') return undefined;
  if (filter === 'analysis') return 'PENDING_MANAGER,PENDING_SUPPLIES,APPROVED';
  if (filter === 'awaiting_refuel') return 'AWAITING_REFUEL';
  if (filter === 'CONCLUDED') return 'COMPLETED';
  return 'CANCELLED,REJECTED';
}

function isFuelAnalysisStatus(status: FuelRefuelStatus): boolean {
  return (
    status === 'PENDING_MANAGER' ||
    status === 'PENDING_SUPPLIES' ||
    status === 'APPROVED'
  );
}

function isFuelAwaitingRefuelStatus(status: FuelRefuelStatus): boolean {
  return status === 'AWAITING_REFUEL';
}

function isFuelSuppliesQueueStatus(status: FuelRefuelStatus): boolean {
  return isFuelAnalysisStatus(status) || isFuelAwaitingRefuelStatus(status);
}

function matchesDetailStatusFilter(status: FuelRefuelStatus, filter: DetailStatusFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'SUPPLIES_QUEUE') return isFuelSuppliesQueueStatus(status);
  return status === filter;
}

type FuelRefuelDeadlineUnit = 'HOURS' | 'DAYS';

type FuelAdministrativeRegion = {
  id: string;
  code: string;
  name: string;
  stateCode?: string;
};

type FuelGasStation = {
  id: string;
  displayNumber: number;
  cityCode: string;
  name: string;
  address?: string | null;
};

type FuelRefuelRequest = {
  id: string;
  displayNumber: number;
  requestedAt: string;
  refuelDate: string;
  route: string;
  satelliteCityCode?: string | null;
  administrativeRegion?: FuelAdministrativeRegion | null;
  gasStation?: FuelGasStation | null;
  refuelDeadlineAt?: string | null;
  refuelDeadlineAmount?: number | null;
  refuelDeadlineUnit?: FuelRefuelDeadlineUnit | null;
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
  managerApprovedAt?: string | null;
  managerApprovalComment?: string | null;
  managerRejectionReason?: string | null;
  suppliesApprovedAt?: string | null;
  suppliesApprovalComment?: string | null;
  suppliesRejectionReason?: string | null;
  odometerKm?: number | null;
  tankLevelAfter?: FuelTankLevelAfter | null;
  litersRefueled?: string | number | null;
  pricePerLiter?: string | number | null;
  refuelReportObservations?: string | null;
  receiptPhotoUrl?: string | null;
  receiptPhotoKey?: string | null;
  receiptPhotoViewUrl?: string | null;
  receiptPhotoName?: string | null;
  refuelReportedAt?: string | null;
  costCenter?: string | null;
  requester: { id: string; name: string; email: string };
  contract?: {
    id: string;
    name: string;
    number: string;
    costCenter?: { code?: string | null; name?: string | null } | null;
  } | null;
  managerApprover?: { id: string; name: string } | null;
  suppliesApprover?: { id: string; name: string } | null;
};

const TANK_LEVEL_OPTIONS: Array<{ value: FuelTankLevelAfter; label: string }> = [
  { value: 'RESERVE', label: 'Reserva' },
  { value: 'QUARTER', label: '1/4 do tanque' },
  { value: 'HALF', label: '1/2 do tanque' },
  { value: 'THREE_QUARTERS', label: '3/4 do tanque' },
  { value: 'FULL', label: 'Tanque cheio' },
];

const TANK_LEVEL_LABELS: Record<FuelTankLevelAfter, string> = Object.fromEntries(
  TANK_LEVEL_OPTIONS.map((o) => [o.value, o.label]),
) as Record<FuelTankLevelAfter, string>;

type ReportFormState = {
  odometerKm: string;
  tankLevelAfter: FuelTankLevelAfter | '';
  litersRefueled: string;
  pricePerLiter: string;
  receiptPhoto: string;
  observations: string;
};

function EMPTY_REPORT_FORM(): ReportFormState {
  return {
    odometerKm: '',
    tankLevelAfter: '',
    litersRefueled: '',
    pricePerLiter: '',
    receiptPhoto: '',
    observations: '',
  };
}

function parseBrDecimal(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '');
  if (!cleaned) return null;
  if (cleaned.includes(',')) {
    const n = Number(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const VEHICLE_TYPE_LABELS: Record<FuelVehicleType, string> = {
  PRIVATE: 'Particular',
  COMPANY: 'Frota',
};

const STATUS_LABELS: Record<FuelRefuelStatus, string> = {
  PENDING_MANAGER: 'Aguardando aprovação',
  PENDING_SUPPLIES: 'Pendente',
  AWAITING_REFUEL: 'Liberado',
  COMPLETED: 'Concluída',
  APPROVED: 'Pendente',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

const STATUS_BADGE: Record<FuelRefuelStatus, string> = {
  PENDING_MANAGER:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  PENDING_SUPPLIES:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  AWAITING_REFUEL:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  COMPLETED:
    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  APPROVED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  CANCELLED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const ITEMS_PER_PAGE = 20;

function extractContractDisplayName(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s*[—–-]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return trimmed;
  if (/^\d+\/\d+/.test(parts[0])) return parts.slice(1).join(' — ');
  return parts[parts.length - 1];
}

function fuelContractLabel(row: {
  costCenter?: string | null;
  contract?: { number?: string; name?: string } | null;
}): string {
  const name = row.contract?.name?.trim();
  const number = row.contract?.number?.trim();
  if (name) return extractContractDisplayName(name);
  if (row.costCenter?.trim()) return extractContractDisplayName(row.costCenter.trim());
  if (number) return number;
  return '—';
}

function fuelContractShortName(row: {
  contract?: { number?: string; name?: string } | null;
}): string {
  return row.contract?.name?.trim() || row.contract?.number?.trim() || '';
}

function fuelRefuelTotalValue(
  liters: string | number | null | undefined,
  pricePerLiter: string | number | null | undefined,
): number | null {
  if (liters == null || pricePerLiter == null) return null;
  const litersNum = Number(liters);
  const priceNum = Number(pricePerLiter);
  if (!Number.isFinite(litersNum) || !Number.isFinite(priceNum)) return null;
  return litersNum * priceNum;
}

const DEADLINE_UNIT_OPTIONS = labeledToSelectOptions([
  { value: 'HOURS', label: 'Horas' },
  { value: 'DAYS', label: 'Dias' },
]);

function formatRefuelDeadline(
  amount?: number | null,
  unit?: FuelRefuelDeadlineUnit | null,
  deadlineAt?: string | null,
): string {
  if (!amount || !unit) return '—';
  const unitLabel = unit === 'HOURS' ? (amount === 1 ? 'hora' : 'horas') : amount === 1 ? 'dia' : 'dias';
  const base = `${amount} ${unitLabel}`;
  if (!deadlineAt) return base;
  return `${base} (até ${format(new Date(deadlineAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })})`;
}

export default function SolicitacoesCombustivelPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdministrator } = usePermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const [cardFilter, setCardFilter] = useState<SuppliesCardFilter>(DEFAULT_CARD_FILTER);
  const [detailStatusFilter, setDetailStatusFilter] = useState<DetailStatusFilter>('ALL');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<FuelRefuelRequest | null>(null);
  const [suppliesComment, setSuppliesComment] = useState('');
  const [approveGasStationId, setApproveGasStationId] = useState('');
  const [adminEditing, setAdminEditing] = useState(false);
  const [editContractId, setEditContractId] = useState('');
  const [refuelDeadlineAmount, setRefuelDeadlineAmount] = useState('24');
  const [refuelDeadlineUnit, setRefuelDeadlineUnit] = useState<FuelRefuelDeadlineUnit>('HOURS');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [reportTarget, setReportTarget] = useState<FuelRefuelRequest | null>(null);
  const [reportForm, setReportForm] = useState<ReportFormState>(EMPTY_REPORT_FORM);
  const [actionMenu, setActionMenu] = useState<{
    requestId: string;
    top: number;
    left: number;
  } | null>(null);

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

  const { data: statsData, isLoading: loadingStats } = useQuery({
    queryKey: ['fuel-refuel-requests-supplies', 'stats'],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests');
      return (res.data?.data || []) as FuelRefuelRequest[];
    },
    enabled: !loadingUser,
    staleTime: 0,
  });

  const {
    data: listData,
    isLoading: loadingList,
    isError: listError,
    refetch: refetchList,
  } = useQuery({
    queryKey: ['fuel-refuel-requests-supplies', searchTerm, cardFilter],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests', {
        params: {
          search: searchTerm || undefined,
          status: cardFilterToApiParam(cardFilter),
        },
      });
      return (res.data?.data || []) as FuelRefuelRequest[];
    },
    enabled: !loadingUser,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const approveMutation = useMutation({
    mutationFn: async ({
      id,
      gasStationId,
      amount,
      unit,
    }: {
      id: string;
      gasStationId: string;
      amount: number;
      unit: FuelRefuelDeadlineUnit;
    }) => {
      const res = await api.put(`/fuel-refuel-requests/${id}/supplies-approve`, {
        comment: suppliesComment.trim() || undefined,
        gasStationId,
        refuelDeadlineAmount: amount,
        refuelDeadlineUnit: unit,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação atendida. O colaborador foi notificado no WhatsApp.');
      setSelected(null);
      setSuppliesComment('');
      setApproveGasStationId('');
      setRefuelDeadlineAmount('24');
      setRefuelDeadlineUnit('HOURS');
      setShowRejectForm(false);
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests-supplies'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-supplies-pending-count'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao aprovar solicitação');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.put(`/fuel-refuel-requests/${id}/supplies-reject`, {
        reason: rejectReason.trim(),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação rejeitada. O colaborador foi notificado na Gennecy.');
      setSelected(null);
      setRejectReason('');
      setShowRejectForm(false);
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests-supplies'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-supplies-pending-count'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao rejeitar solicitação');
    },
  });

  const adminUpdateMutation = useMutation({
    mutationFn: async ({ id, contractId }: { id: string; contractId: string }) => {
      const res = await api.put(`/fuel-refuel-requests/${id}/admin-update`, { contractId });
      return res.data?.data as FuelRefuelRequest;
    },
    onSuccess: (updated) => {
      toast.success('Solicitação atualizada');
      setSelected(updated);
      setAdminEditing(false);
      setApproveGasStationId('');
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests-supplies'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-gas-stations-by-contract'] });
    },
    onError: (err: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Erro ao atualizar solicitação',
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/fuel-refuel-requests/${id}/cancel`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação cancelada');
      setSelected(null);
      setShowCancelConfirm(false);
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests-supplies'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-supplies-pending-count'] });
    },
    onError: (err: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Erro ao cancelar solicitação',
      );
    },
  });

  const reportMutation = useMutation({
    mutationFn: async (payload: { id: string; body: Record<string, unknown> }) => {
      const res = await api.post(`/fuel-refuel-requests/${payload.id}/report`, payload.body);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Abastecimento informado');
      setReportTarget(null);
      setReportForm(EMPTY_REPORT_FORM());
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests-supplies'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-supplies-pending-count'] });
    },
    onError: (err: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Erro ao informar abastecimento',
      );
    },
  });

  const contractId = selected?.contract?.id;
  const costCenterLabel = selected?.costCenter || selected?.contract?.name || '';

  const canAdminEditSelected =
    isAdministrator &&
    (selected?.status === 'PENDING_SUPPLIES' || selected?.status === 'PENDING_MANAGER');

  const { data: contractsRes } = useQuery({
    queryKey: ['contracts-for-fuel-admin-edit'],
    queryFn: async () =>
      (await api.get('/fuel-refuel-requests/contracts')).data,
    enabled: adminEditing && canAdminEditSelected,
    staleTime: 10 * 60 * 1000,
  });

  const contractEditOptions = useMemo(
    () =>
      ((contractsRes?.data ?? []) as Array<{ id: string; name: string; number?: string }>).map(
        (c) => ({
          value: c.id,
          label: c.name,
          searchText: `${c.name} ${c.number ?? ''}`,
        }),
      ),
    [contractsRes],
  );

  const { data: gasStations = [], isLoading: loadingGasStations } = useQuery({
    queryKey: ['fuel-gas-stations-by-contract', contractId, costCenterLabel],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests/gas-stations', {
        params: {
          contractId: contractId || undefined,
          costCenter: costCenterLabel || undefined,
        },
      });
      return (res.data?.data || []) as FuelGasStation[];
    },
    enabled: Boolean(
      selected?.status === 'PENDING_SUPPLIES' && (contractId || costCenterLabel),
    ),
    staleTime: 5 * 60 * 1000,
  });

  const gasStationSelectOptions = useMemo<MultiSelectSearchOption[]>(
    () =>
      gasStations.map((station) => ({
        value: station.id,
        label: station.name,
        description: station.address?.trim() || undefined,
        searchText: [station.name, station.address, String(station.displayNumber)]
          .filter(Boolean)
          .join(' '),
      })),
    [gasStations],
  );

  const records = useMemo(
    () =>
      (listData || []).filter((row) => matchesDetailStatusFilter(row.status, detailStatusFilter)),
    [listData, detailStatusFilter],
  );

  const suppliesStats = useMemo(() => {
    const list = statsData || [];
    const analysis = list.filter((row) => isFuelAnalysisStatus(row.status)).length;
    const awaitingRefuel = list.filter((row) => isFuelAwaitingRefuelStatus(row.status)).length;
    const concluded = list.filter((row) => row.status === 'COMPLETED').length;
    const cancelled = list.filter(
      (row) => row.status === 'CANCELLED' || row.status === 'REJECTED',
    ).length;
    return { total: list.length, analysis, awaitingRefuel, concluded, cancelled };
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

  const requestForMenu = useMemo(() => {
    if (!actionMenu) return null;
    return records.find((r) => r.id === actionMenu.requestId) ?? null;
  }, [actionMenu, records]);

  const openRequestDetail = (row: FuelRefuelRequest, opts?: { reject?: boolean; cancel?: boolean }) => {
    setActionMenu(null);
    setSelected(row);
    setShowRejectForm(!!opts?.reject);
    setShowCancelConfirm(!!opts?.cancel);
    if (!opts?.reject) setRejectReason('');
    setAdminEditing(false);
    setEditContractId(row.contract?.id || '');
  };

  const openReportForm = (row: FuelRefuelRequest) => {
    setActionMenu(null);
    setSelected(null);
    setShowCancelConfirm(false);
    setReportForm(EMPTY_REPORT_FORM());
    setReportTarget(row);
  };

  const submitReportForm = () => {
    if (!reportTarget) return;
    const odometerKm = Number(reportForm.odometerKm.replace(/\D/g, ''));
    if (!Number.isFinite(odometerKm) || odometerKm <= 0) {
      toast.error('Informe o hodômetro em km');
      return;
    }
    if (!reportForm.tankLevelAfter) {
      toast.error('Selecione o nível do tanque');
      return;
    }
    const litersRefueled = parseBrDecimal(reportForm.litersRefueled);
    if (litersRefueled == null || litersRefueled <= 0) {
      toast.error('Informe os litros abastecidos');
      return;
    }
    const pricePerLiter = parseBrDecimal(reportForm.pricePerLiter);
    if (pricePerLiter == null || pricePerLiter <= 0) {
      toast.error('Informe o valor por litro');
      return;
    }
    if (isBlankVehiclePhoto(reportForm.receiptPhoto)) {
      toast.error('Envie a foto do cupom fiscal');
      return;
    }

    reportMutation.mutate({
      id: reportTarget.id,
      body: {
        odometerKm,
        tankLevelAfter: reportForm.tankLevelAfter,
        litersRefueled,
        pricePerLiter,
        receiptPhotoBase64: reportForm.receiptPhoto,
        observations: reportForm.observations.trim() || undefined,
      },
    });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, cardFilter, detailStatusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (actionMenu && !requestForMenu) {
      setActionMenu(null);
    }
  }, [actionMenu, requestForMenu]);

  useEffect(() => {
    if (selected?.status === 'PENDING_SUPPLIES') {
      setApproveGasStationId('');
      setSuppliesComment('');
      setRefuelDeadlineAmount('24');
      setRefuelDeadlineUnit('HOURS');
    }
  }, [selected?.id, selected?.status]);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/solicitacoes-combustivel">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/solicitacoes-combustivel">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Fila de Abastecimento
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Acompanhe e atenda as solicitações de combustível.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
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
                      placeholder="Buscar por ID, rota, condutor, placa, contrato..."
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
                <CadastroListLoading message="Carregando solicitações..." />
              ) : listError ? (
                <div className="py-8 text-center">
                  <p className="text-gray-600 dark:text-gray-400">
                    Não foi possível carregar as solicitações.
                  </p>
                  <button
                    type="button"
                    onClick={() => void refetchList()}
                    className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : isListEmpty ? (
                <CadastroListEmpty
                  icon={ListHeaderIcon}
                  title="Nenhuma solicitação encontrada"
                  hint={
                    cardFilter === 'all' || cardFilter === 'analysis'
                      ? 'Colaboradores podem solicitar em Abastecimento ou via Conversas → Gennecy → opção 1'
                      : undefined
                  }
                />
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {startItem} a {endItem} de {totalFiltered}{' '}
                      {totalFiltered === 1 ? 'solicitação' : 'solicitações'}
                    </span>
                    <span>
                      Página {currentPage} de {totalPages}
                    </span>
                  </div>
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={`${cadastroListClasses.th} w-[7%]`}>ID</th>
                          <th className={`${cadastroListClasses.th} w-[18%]`}>Solicitante</th>
                          <th className={`${cadastroListClasses.thCenter} w-[12%]`}>Data abast.</th>
                          <th className={`${cadastroListClasses.thCenter} w-[14%]`}>Contrato</th>
                          <th className={`${cadastroListClasses.thCenter} w-[14%]`}>Veículo</th>
                          <th className={`${cadastroListClasses.thCenter} w-[10%]`}>Tipo</th>
                          <th className={`${cadastroListClasses.thCenter} w-[13%]`}>Status</th>
                          <th className={listTableRowClasses.actionTh}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {paginatedRows.map((row) => (
                          <tr
                            key={row.id}
                            onClick={() => openRequestDetail(row)}
                            className={getListTableRowClassName(true)}
                          >
                            <td className={cadastroListClasses.tdMono}>
                              <ListRowNavigableLabel className="font-medium">
                                {row.displayNumber}
                              </ListRowNavigableLabel>
                            </td>
                            <td className={`${cadastroListClasses.tdTruncate} truncate`} title={row.requester.name}>
                              {row.requester.name}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              <div className="leading-snug">
                                <p>
                                  {format(new Date(row.requestedAt || row.refuelDate), 'dd/MM/yyyy', {
                                    locale: ptBR,
                                  })}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {format(new Date(row.requestedAt || row.refuelDate), 'HH:mm', {
                                    locale: ptBR,
                                  })}
                                </p>
                              </div>
                            </td>
                            <td
                              className={`${cadastroListClasses.tdCenter} truncate`}
                              title={fuelContractLabel(row)}
                            >
                              {fuelContractLabel(row)}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              <div className="leading-snug">
                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                  {row.vehiclePlate}
                                </p>
                                {row.vehicleDescription?.trim() ? (
                                  <p
                                    className="truncate text-xs text-gray-500 dark:text-gray-400"
                                    title={row.vehicleDescription}
                                  >
                                    {row.vehicleDescription.trim()}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {row.vehicleType
                                ? VEHICLE_TYPE_LABELS[row.vehicleType]
                                : '—'}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[row.status]}`}
                              >
                                {STATUS_LABELS[row.status]}
                              </span>
                            </td>
                            <td
                              className={listTableRowClasses.actionTd}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setActionMenu((prev) => {
                                      if (prev?.requestId === row.id) return null;
                                      let left = rect.right - FUEL_SUPPLIES_ACTION_MENU_WIDTH_PX;
                                      left = Math.max(
                                        8,
                                        Math.min(
                                          left,
                                          window.innerWidth - FUEL_SUPPLIES_ACTION_MENU_WIDTH_PX - 8,
                                        ),
                                      );
                                      return { requestId: row.id, top: rect.bottom + 4, left };
                                    });
                                  }}
                                  className={rowActionMenuButtonClass(actionMenu?.requestId === row.id)}
                                  aria-label="Menu de ações"
                                  aria-expanded={actionMenu?.requestId === row.id}
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
                onClick={() => openRequestDetail(requestForMenu)}
                className={MENU_ITEM_CLASS}
              >
                <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>Ver detalhes</span>
              </button>
              {requestForMenu.status === 'PENDING_SUPPLIES' ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openRequestDetail(requestForMenu)}
                    className={MENU_ITEM_BORDER_CLASS}
                  >
                    <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Atender solicitação</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openRequestDetail(requestForMenu, { reject: true })}
                    className={MENU_ITEM_BORDER_CLASS}
                  >
                    <X className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>Rejeitar</span>
                  </button>
                </>
              ) : null}
              {requestForMenu.status === 'AWAITING_REFUEL' ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openReportForm(requestForMenu)}
                    className={MENU_ITEM_BORDER_CLASS}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Informar abastecimento</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openRequestDetail(requestForMenu, { cancel: true })}
                    className={MENU_ITEM_BORDER_CLASS}
                  >
                    <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>Cancelar</span>
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </ActionMenuOverlay>

        <Modal
          isOpen={!!selected}
          onClose={() => {
            setSelected(null);
            setSuppliesComment('');
            setApproveGasStationId('');
            setRejectReason('');
            setShowRejectForm(false);
            setShowCancelConfirm(false);
            setAdminEditing(false);
            setEditContractId('');
          }}
          title={`Solicitação ${selected?.displayNumber ?? ''}`}
          size="lg"
        >
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Solicitante</span>
                  <p className="text-gray-900 dark:text-gray-100">{selected.requester.name}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Solicitado em</span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {format(new Date(selected.requestedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">
                    Data para abastecer
                  </span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {format(new Date(selected.refuelDate), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Status</span>
                  <p className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[selected.status]}`}
                    >
                      {STATUS_LABELS[selected.status]}
                    </span>
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <span className="font-medium text-gray-500 dark:text-gray-400">Rota</span>
                  <p className="text-gray-900 dark:text-gray-100">{selected.route}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">
                    Região administrativa
                  </span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {selected.administrativeRegion
                      ? `${selected.administrativeRegion.name}${
                          selected.administrativeRegion.stateCode
                            ? ` (${selected.administrativeRegion.stateCode})`
                            : ''
                        }`
                      : '—'}
                  </p>
                </div>
                {selected.gasStation ? (
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">
                      Posto liberado
                    </span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {selected.gasStation.name}
                      {selected.gasStation.address ? ` — ${selected.gasStation.address}` : ''}
                    </p>
                  </div>
                ) : null}
                {selected.refuelDeadlineAmount ? (
                  <div className="sm:col-span-2">
                    <span className="font-medium text-gray-500 dark:text-gray-400">
                      Prazo para abastecer
                    </span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {formatRefuelDeadline(
                        selected.refuelDeadlineAmount,
                        selected.refuelDeadlineUnit,
                        selected.refuelDeadlineAt,
                      )}
                    </p>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-500 dark:text-gray-400">Contrato</span>
                    {canAdminEditSelected && !adminEditing ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditContractId(selected.contract?.id || '');
                          setAdminEditing(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                    ) : null}
                  </div>
                  {adminEditing && canAdminEditSelected ? (
                    <div className="space-y-2">
                      <SingleSelectSearchDropdown
                        value={editContractId}
                        onChange={setEditContractId}
                        options={contractEditOptions}
                        allowEmpty={false}
                        placeholder="Selecionar contrato..."
                        searchPlaceholder="Pesquisar contrato..."
                        disabled={adminUpdateMutation.isPending}
                        noFocusRing
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={adminUpdateMutation.isPending}
                          onClick={() => {
                            setAdminEditing(false);
                            setEditContractId(selected.contract?.id || '');
                          }}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            adminUpdateMutation.isPending ||
                            !editContractId ||
                            editContractId === selected.contract?.id
                          }
                          onClick={() =>
                            adminUpdateMutation.mutate({
                              id: selected.id,
                              contractId: editContractId,
                            })
                          }
                        >
                          {adminUpdateMutation.isPending ? 'Salvando…' : 'Salvar contrato'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">
                      {fuelContractLabel(selected)}
                    </p>
                  )}
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Condutor</span>
                  <p className="text-gray-900 dark:text-gray-100">{selected.driverName}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Veículo</span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {selected.vehiclePlate}
                    {selected.vehicleDescription ? ` — ${selected.vehicleDescription}` : ''}
                  </p>
                </div>
                {selected.vehicleType ? (
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Tipo</span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {VEHICLE_TYPE_LABELS[selected.vehicleType]}
                    </p>
                  </div>
                ) : null}
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">
                    Aprovação do gestor
                  </span>
                  {selected.vehicleType === 'COMPANY' ? (
                    <p className="text-gray-900 dark:text-gray-100">
                      Não se aplica (frota — vai direto ao Suprimentos)
                    </p>
                  ) : selected.status === 'PENDING_MANAGER' ? (
                    <p className="text-gray-900 dark:text-gray-100">Aguardando aprovação</p>
                  ) : selected.managerApprover ? (
                    <p className="text-gray-900 dark:text-gray-100">
                      {selected.managerApprover.name}
                      {selected.managerApprovedAt
                        ? ` — ${format(new Date(selected.managerApprovedAt), 'dd/MM/yyyy HH:mm', {
                            locale: ptBR,
                          })}`
                        : ''}
                    </p>
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">—</p>
                  )}
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">
                    Liberação do posto
                  </span>
                  {selected.suppliesApprover ? (
                    <p className="text-gray-900 dark:text-gray-100">
                      {selected.suppliesApprover.name}
                      {selected.suppliesApprovedAt
                        ? ` — ${format(new Date(selected.suppliesApprovedAt), 'dd/MM/yyyy HH:mm', {
                            locale: ptBR,
                          })}`
                        : ''}
                    </p>
                  ) : selected.status === 'PENDING_SUPPLIES' || selected.status === 'APPROVED' ? (
                    <p className="text-gray-900 dark:text-gray-100">
                      Aguardando liberação do Suprimentos
                    </p>
                  ) : selected.status === 'PENDING_MANAGER' ? (
                    <p className="text-gray-900 dark:text-gray-100">
                      Aguardando aprovação do gestor
                    </p>
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">—</p>
                  )}
                </div>
                {selected.observations ? (
                  <div className="sm:col-span-2">
                    <span className="font-medium text-gray-500 dark:text-gray-400">Observações</span>
                    <p className="text-gray-900 dark:text-gray-100">{selected.observations}</p>
                  </div>
                ) : null}
              </div>

              {hasFuelStoredPhoto(selected.dashboardPhotoUrl, selected.dashboardPhotoKey) ? (() => {
                const panelPhotoUrl = resolveFuelPhotoSrc(
                  selected.dashboardPhotoViewUrl,
                  selected.dashboardPhotoUrl,
                );
                if (!panelPhotoUrl) return null;
                return (
                  <FuelRequestPhoto
                    src={panelPhotoUrl}
                    alt={selected.dashboardPhotoName || 'Painel'}
                    label="Foto do painel"
                    fileName={selected.dashboardPhotoName}
                  />
                );
              })() : null}

              {selected.managerApprovalComment || selected.managerRejectionReason ? (
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                  <span className="font-medium text-gray-500 dark:text-gray-400">
                    Parecer do gestor
                  </span>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">
                    {selected.managerApprovalComment || selected.managerRejectionReason}
                  </p>
                </div>
              ) : null}

              {selected.suppliesApprovalComment || selected.suppliesRejectionReason ? (
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                  <span className="font-medium text-gray-500 dark:text-gray-400">
                    Parecer do Suprimentos
                  </span>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">
                    {selected.suppliesApprovalComment || selected.suppliesRejectionReason}
                  </p>
                </div>
              ) : null}

              {selected.status === 'COMPLETED' ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800/50 dark:bg-green-950/20">
                  <span className="font-medium text-green-800 dark:text-green-200">
                    Dados do abastecimento
                  </span>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {selected.odometerKm != null ? (
                      <div>
                        <span className="text-xs text-gray-500">Hodômetro</span>
                        <p>{selected.odometerKm.toLocaleString('pt-BR')} km</p>
                      </div>
                    ) : null}
                    {selected.tankLevelAfter ? (
                      <div>
                        <span className="text-xs text-gray-500">Tanque após abastecimento</span>
                        <p>{TANK_LEVEL_LABELS[selected.tankLevelAfter]}</p>
                      </div>
                    ) : null}
                    {selected.litersRefueled != null ? (
                      <div>
                        <span className="text-xs text-gray-500">Litros</span>
                        <p>
                          {Number(selected.litersRefueled).toLocaleString('pt-BR', {
                            minimumFractionDigits: 3,
                            maximumFractionDigits: 3,
                          })}
                        </p>
                      </div>
                    ) : null}
                    {selected.pricePerLiter != null ? (
                      <div>
                        <span className="text-xs text-gray-500">Valor por litro</span>
                        <p>
                          {Number(selected.pricePerLiter).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </p>
                      </div>
                    ) : null}
                    {fuelRefuelTotalValue(selected.litersRefueled, selected.pricePerLiter) != null ? (
                      <div>
                        <span className="text-xs text-gray-500">Valor total</span>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                          {fuelRefuelTotalValue(
                            selected.litersRefueled,
                            selected.pricePerLiter,
                          )!.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  {selected.refuelReportObservations ? (
                    <p className="mt-2 text-sm">{selected.refuelReportObservations}</p>
                  ) : null}
                  {hasFuelStoredPhoto(selected.receiptPhotoUrl, selected.receiptPhotoKey) ? (() => {
                    const receiptPhotoUrl = resolveFuelPhotoSrc(
                      selected.receiptPhotoViewUrl,
                      selected.receiptPhotoUrl,
                    );
                    if (!receiptPhotoUrl) return null;
                    return (
                      <FuelRequestPhoto
                        src={receiptPhotoUrl}
                        alt={selected.receiptPhotoName || 'Cupom fiscal'}
                        label="Cupom fiscal"
                        fileName={selected.receiptPhotoName}
                        compact
                      />
                    );
                  })() : null}
                </div>
              ) : null}

              {selected.status === 'AWAITING_REFUEL' ? (
                <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                  {!showCancelConfirm ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowCancelConfirm(true)}
                        disabled={cancelMutation.isPending || reportMutation.isPending}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        onClick={() => openReportForm(selected)}
                        disabled={cancelMutation.isPending || reportMutation.isPending}
                      >
                        Informar abastecimento
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Cancelar esta solicitação liberada? O colaborador não poderá mais
                        abastecer neste posto.
                      </p>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowCancelConfirm(false)}
                          disabled={cancelMutation.isPending}
                        >
                          Voltar
                        </Button>
                        <Button
                          type="button"
                          variant="error"
                          onClick={() => cancelMutation.mutate(selected.id)}
                          disabled={cancelMutation.isPending}
                        >
                          {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {selected.status === 'PENDING_SUPPLIES' ? (
                <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                  {!showRejectForm ? (
                    <>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Libere o abastecimento informando um posto do contrato da solicitação e o
                        prazo para o solicitante ir ao posto.
                      </p>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Posto para abastecimento *
                        </label>
                        <SingleSelectSearchDropdown
                          value={approveGasStationId}
                          onChange={setApproveGasStationId}
                          options={gasStationSelectOptions}
                          disabled={
                            loadingGasStations ||
                            approveMutation.isPending ||
                            (!contractId && !costCenterLabel)
                          }
                          allowEmpty={false}
                          placeholder={
                            !contractId && !costCenterLabel
                              ? 'Solicitação sem contrato'
                              : loadingGasStations
                                ? 'Carregando postos...'
                                : 'Selecionar posto do contrato...'
                          }
                          searchPlaceholder="Pesquisar posto..."
                          emptyOptionsMessage={
                            fuelContractShortName(selected)
                              ? `Nenhum posto vinculado ao contrato ${fuelContractShortName(selected)}. Vincule em Cadastros > Postos de Combustível.`
                              : 'Nenhum posto vinculado a este contrato.'
                          }
                          noFocusRing
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          label="Prazo para abastecer *"
                          type="number"
                          min={1}
                          max={365}
                          value={refuelDeadlineAmount}
                          onChange={(e) => setRefuelDeadlineAmount(e.target.value)}
                          placeholder="Ex.: 24"
                          className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Unidade do prazo *
                          </label>
                          <StringSingleSelectDropdown
                            value={refuelDeadlineUnit}
                            onChange={(value) =>
                              setRefuelDeadlineUnit(value as FuelRefuelDeadlineUnit)
                            }
                            options={DEADLINE_UNIT_OPTIONS}
                            allowEmpty={false}
                            className="w-full"
                          />
                        </div>
                      </div>
                      <Input
                        label="Observação (opcional)"
                        value={suppliesComment}
                        onChange={(e) => setSuppliesComment(e.target.value)}
                        placeholder="Mensagem enviada ao colaborador no WhatsApp"
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
                            const amount = Number(refuelDeadlineAmount);
                            if (!approveGasStationId) {
                              return toast.error('Selecione o posto para abastecimento');
                            }
                            if (!Number.isFinite(amount) || amount < 1) {
                              return toast.error('Informe o prazo para abastecer');
                            }
                            approveMutation.mutate({
                              id: selected.id,
                              gasStationId: approveGasStationId,
                              amount,
                              unit: refuelDeadlineUnit,
                            });
                          }}
                          disabled={
                            approveMutation.isPending ||
                            !approveGasStationId ||
                            !refuelDeadlineAmount.trim()
                          }
                        >
                          {approveMutation.isPending ? 'Atendendo...' : 'Atender solicitação'}
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
                          onClick={() => rejectMutation.mutate(selected.id)}
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
          )}
        </Modal>

        <Modal
          isOpen={Boolean(reportTarget)}
          onClose={() => {
            if (reportMutation.isPending) return;
            setReportTarget(null);
          }}
          title={
            reportTarget
              ? `Informar abastecimento — #${reportTarget.displayNumber}`
              : 'Informar abastecimento'
          }
          size="lg"
        >
          {reportTarget ? (
            <div className="space-y-5">
              <section className="space-y-2 text-sm">
                <p className="text-gray-600 dark:text-gray-400">
                  Informando em nome de{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {reportTarget.requester.name}
                  </span>
                  .
                </p>
                {reportTarget.gasStation ? (
                  <p className="text-gray-900 dark:text-gray-100">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Posto:</span>{' '}
                    {reportTarget.gasStation.name}
                    {reportTarget.gasStation.address
                      ? ` — ${reportTarget.gasStation.address}`
                      : ''}
                  </p>
                ) : null}
                {reportTarget.refuelDeadlineAmount ? (
                  <p className="text-gray-900 dark:text-gray-100">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Prazo:</span>{' '}
                    {formatRefuelDeadline(
                      reportTarget.refuelDeadlineAmount,
                      reportTarget.refuelDeadlineUnit,
                      reportTarget.refuelDeadlineAt,
                    )}
                  </p>
                ) : null}
                <p className="text-gray-600 dark:text-gray-400">
                  {reportTarget.vehiclePlate} · {reportTarget.route}
                </p>
              </section>

              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <h4 className="mb-4 border-b border-gray-200 pb-3 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-50">
                  Dados do abastecimento
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Hodômetro (km) *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={reportForm.odometerKm}
                      onChange={(e) =>
                        setReportForm((f) => ({
                          ...f,
                          odometerKm: e.target.value.replace(/\D/g, ''),
                        }))
                      }
                      className={FORM_FIELD_INPUT_CLS}
                      placeholder="Ex.: 45230"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Tanque após abastecimento *
                    </label>
                    <SingleSelectSearchDropdown
                      value={reportForm.tankLevelAfter}
                      onChange={(tankLevelAfter) =>
                        setReportForm((f) => ({
                          ...f,
                          tankLevelAfter: tankLevelAfter as FuelTankLevelAfter | '',
                        }))
                      }
                      options={TANK_LEVEL_OPTIONS.map((opt) => ({
                        value: opt.value,
                        label: opt.label,
                      }))}
                      placeholder="Selecione…"
                      allowEmpty={false}
                      disableSearch
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Litros abastecidos *
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={reportForm.litersRefueled}
                      onChange={(e) =>
                        setReportForm((f) => ({ ...f, litersRefueled: e.target.value }))
                      }
                      className={FORM_FIELD_INPUT_CLS}
                      placeholder="Ex.: 45,500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Valor por litro (R$) *
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={reportForm.pricePerLiter}
                      onChange={(e) =>
                        setReportForm((f) => ({ ...f, pricePerLiter: e.target.value }))
                      }
                      className={FORM_FIELD_INPUT_CLS}
                      placeholder="Ex.: 5,89"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <h4 className="mb-4 border-b border-gray-200 pb-3 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-50">
                  Cupom e observações
                </h4>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Foto do cupom fiscal *
                    </label>
                    <VehicleReturnPhotoField
                      value={reportForm.receiptPhoto}
                      onChange={(receiptPhoto) => setReportForm((f) => ({ ...f, receiptPhoto }))}
                      emptyLabel="Clique para enviar o cupom fiscal"
                      photoAlt="Cupom fiscal"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Observações
                    </label>
                    <textarea
                      value={reportForm.observations}
                      onChange={(e) =>
                        setReportForm((f) => ({ ...f, observations: e.target.value }))
                      }
                      className={FORM_FIELD_TEXTAREA_CLS}
                      placeholder="Opcional"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <Button
                  type="button"
                  variant="outline"
                  disabled={reportMutation.isPending}
                  onClick={() => setReportTarget(null)}
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  disabled={reportMutation.isPending}
                  onClick={submitReportForm}
                >
                  {reportMutation.isPending ? 'Enviando…' : 'Confirmar abastecimento'}
                </Button>
              </div>
            </div>
          ) : null}
        </Modal>

        <Modal
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          title="Filtros — Fila de Abastecimento"
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
