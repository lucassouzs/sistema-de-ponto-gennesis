'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CheckCircle,
  Clock,
  Eye,
  Fuel,
  Plus,
  Search,
  Users,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Modal, useModalRequestClose } from '@/components/ui/Modal';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
  getListTableRowClassName,
  ListRowNavigableLabel,
} from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import {
  VehicleReturnPhotoField,
  isBlankVehiclePhoto,
} from '@/components/ui/VehicleReturnPhotoField';
import { formatPlacaDisplay } from '@/lib/brazilianVehiclePlate';
import { toPersonSelectOptions } from '@/lib/personSelectOptions';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';

type FuelVehicleType = 'PRIVATE' | 'COMPANY';
type VehicleUsageType = 'FROTA' | 'PARTICULAR';

type FuelRefuelStatus =
  | 'PENDING_MANAGER'
  | 'PENDING_SUPPLIES'
  | 'AWAITING_REFUEL'
  | 'COMPLETED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

type FuelRefuelDeadlineUnit = 'HOURS' | 'DAYS';
type FuelTankLevelAfter = 'RESERVE' | 'QUARTER' | 'HALF' | 'THREE_QUARTERS' | 'FULL';

type FuelRequestRow = {
  id: string;
  displayNumber: number;
  refuelDate: string;
  requestedAt?: string | null;
  createdAt?: string | null;
  route: string;
  driverName: string;
  vehiclePlate: string;
  vehicleDescription?: string | null;
  vehicleType: FuelVehicleType;
  status: FuelRefuelStatus;
  satelliteCityCode?: string | null;
  satelliteCityName?: string | null;
  costCenter?: string | null;
  contract?: {
    id: string;
    name: string;
    number?: string | null;
  } | null;
  observations?: string | null;
  gasStation?: {
    id: string;
    name: string;
    address?: string | null;
  } | null;
  refuelDeadlineAt?: string | null;
  refuelDeadlineAmount?: number | null;
  refuelDeadlineUnit?: FuelRefuelDeadlineUnit | null;
  suppliesApprovalComment?: string | null;
  odometerKm?: number | null;
  tankLevelAfter?: FuelTankLevelAfter | null;
  litersRefueled?: number | string | null;
  pricePerLiter?: number | string | null;
  refuelReportObservations?: string | null;
  receiptPhotoViewUrl?: string | null;
  receiptPhotoUrl?: string | null;
  receiptPhotoName?: string | null;
};

type ReportFormState = {
  odometerKm: string;
  tankLevelAfter: FuelTankLevelAfter | '';
  litersRefueled: string;
  pricePerLiter: string;
  receiptPhoto: string;
  observations: string;
};

type SatelliteCity = {
  code: string;
  stateCode: string;
  name: string;
  stationCount?: number;
};

type FleetVehicle = {
  id: string;
  code?: string | null;
  marcaVeic?: string | null;
  modeloVeic?: string | null;
  placaVeic: string;
  polo?: string | null;
  contrato?: string | null;
  responsavel?: string | null;
  frotaPartic?: VehicleUsageType | null;
};

type DriverOption = {
  id: string;
  name: string;
  cpf: string;
  cpfDigits?: string;
  costCenter: string | null;
  profilePhotoUrl?: string | null;
};

type FormState = {
  refuelDate: string;
  route: string;
  stateCode: string;
  satelliteCityCode: string;
  contractId: string;
  driverUserId: string;
  driverNamePreview: string;
  driverCpfPreview: string;
  driverCostCenterPreview: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleDescription: string;
  vehicleType: FuelVehicleType | '';
  dashboardPhoto: string;
  observations: string;
};

type CardFilter = 'all' | 'analysis' | 'awaiting_refuel' | 'concluded' | 'cancelled';

const STATUS_LABELS: Record<FuelRefuelStatus, string> = {
  PENDING_MANAGER: 'Aguardando aprovação',
  PENDING_SUPPLIES: 'Aguardando Suprimentos',
  AWAITING_REFUEL: 'Abastecimento Liberado',
  COMPLETED: 'Concluída',
  APPROVED: 'Aguardando Suprimentos',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

const STATUS_BADGE: Record<FuelRefuelStatus, string> = {
  PENDING_MANAGER: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  PENDING_SUPPLIES: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  AWAITING_REFUEL: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  CANCELLED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const VEHICLE_TYPE_LABELS: Record<FuelVehicleType, string> = {
  PRIVATE: 'Particular',
  COMPANY: 'Frota',
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

function todayInputValue() {
  return format(new Date(), 'yyyy-MM-dd');
}

function EMPTY_FORM(): FormState {
  return {
    refuelDate: todayInputValue(),
    route: '',
    stateCode: '',
    satelliteCityCode: '',
    contractId: '',
    driverUserId: '',
    driverNamePreview: '',
    driverCpfPreview: '',
    driverCostCenterPreview: '',
    vehicleId: '',
    vehiclePlate: '',
    vehicleDescription: '',
    vehicleType: '',
    dashboardPhoto: '',
    observations: '',
  };
}

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

function formatVehicleLabel(vehicle: FleetVehicle): string {
  return formatPlacaDisplay(vehicle.placaVeic);
}

function formatVehicleModel(vehicle: FleetVehicle): string {
  const marca = vehicle.marcaVeic?.trim();
  const modelo = vehicle.modeloVeic?.trim();
  if (marca && modelo) return `${marca} ${modelo}`;
  return modelo || marca || '—';
}

function mapFrotaParticToFuelType(frotaPartic?: VehicleUsageType | null): FuelVehicleType {
  return frotaPartic === 'PARTICULAR' ? 'PRIVATE' : 'COMPANY';
}

const FUEL_FORM_LABEL_CLS =
  'mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400';

function FuelCreateFormHeader({
  disabled,
  onClose,
}: {
  disabled?: boolean;
  onClose: () => void;
}) {
  const requestClose = useModalRequestClose();
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-2">
      <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
        Nova solicitação de combustível
      </h3>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (requestClose) requestClose();
          else onClose();
        }}
        className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function FuelCreateFormFooter({
  isPending,
  onSubmit,
}: {
  isPending: boolean;
  onSubmit: () => void;
}) {
  const requestClose = useModalRequestClose();
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700">
      <button
        type="button"
        disabled={isPending}
        onClick={() => requestClose?.()}
        className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
      >
        Cancelar
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={onSubmit}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
      >
        {isPending ? 'Enviando…' : 'Enviar solicitação'}
      </button>
    </div>
  );
}

function FormSection({
  title,
  description,
  headerRight,
  children,
}: {
  title: string;
  description?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
            {title}
          </h4>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {description}
            </p>
          ) : null}
        </div>
        {headerRight}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function formatDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'dd/MM/yyyy', { locale: ptBR });
}

function formatDateTimeParts(value?: string | null): { date: string; time: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    date: format(date, 'dd/MM/yyyy', { locale: ptBR }),
    time: format(date, 'HH:mm', { locale: ptBR }),
  };
}

function formatRefuelDeadline(
  amount?: number | null,
  unit?: FuelRefuelDeadlineUnit | null,
  deadlineAt?: string | null,
): string {
  if (!amount || !unit) return '—';
  const unitLabel =
    unit === 'HOURS' ? (amount === 1 ? 'hora' : 'horas') : amount === 1 ? 'dia' : 'dias';
  const base = `${amount} ${unitLabel}`;
  if (!deadlineAt) return base;
  return `${base} (até ${format(new Date(deadlineAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })})`;
}

function formatRefuelDeadlineLines(
  amount?: number | null,
  unit?: FuelRefuelDeadlineUnit | null,
  deadlineAt?: string | null,
): { amountLabel: string; dateLabel: string | null; timeLabel: string | null } | null {
  if (!amount || !unit) return null;
  const unitLabel =
    unit === 'HOURS' ? (amount === 1 ? 'hora' : 'horas') : amount === 1 ? 'dia' : 'dias';
  const parts = formatDateTimeParts(deadlineAt);
  return {
    amountLabel: `${amount} ${unitLabel}`,
    dateLabel: parts?.date ?? null,
    timeLabel: parts?.time ?? null,
  };
}

/** Célula centralizada que quebra linha (evita overflow entre colunas com table-auto). */
const tdCenterWrap =
  'max-w-[11rem] px-2 py-3 text-center text-sm text-gray-900 dark:text-gray-100 sm:px-3';
const thCenterCompact =
  'px-2 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-3';

function isAnalysisStatus(status: FuelRefuelStatus): boolean {
  return (
    status === 'PENDING_MANAGER' ||
    status === 'PENDING_SUPPLIES' ||
    status === 'APPROVED'
  );
}

function isAwaitingRefuelStatus(status: FuelRefuelStatus): boolean {
  return status === 'AWAITING_REFUEL';
}

function isCancelledStatus(status: FuelRefuelStatus): boolean {
  return status === 'CANCELLED' || status === 'REJECTED';
}

function fuelContractLabel(row: {
  costCenter?: string | null;
  contract?: { number?: string | null; name?: string | null } | null;
}): string {
  if (row.contract?.name?.trim()) return row.contract.name.trim();
  if (row.costCenter?.trim()) {
    const label = row.costCenter.trim();
    const parts = label.split(/\s*[—–-]\s*/).map((p) => p.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : label;
  }
  if (row.contract?.number?.trim()) return row.contract.number.trim();
  return '—';
}

const CARD_LIST_CONFIG: Record<
  CardFilter,
  { title: string; subtitle: string; Icon: LucideIcon; iconBg: string; iconColor: string }
> = {
  all: {
    title: 'Meus Abastecimentos',
    subtitle: 'Visão geral das suas solicitações de abastecimento.',
    Icon: Users,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  analysis: {
    title: 'Em Análise',
    subtitle: 'Aguardando aprovação ou Suprimentos.',
    Icon: Clock,
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  awaiting_refuel: {
    title: 'Liberado',
    subtitle: 'Posto definido — abasteça e informe.',
    Icon: Fuel,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  concluded: {
    title: 'Concluídas',
    subtitle: 'Abastecimentos finalizados.',
    Icon: CheckCircle,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  cancelled: {
    title: 'Canceladas',
    subtitle: 'Solicitações encerradas sem abastecimento.',
    Icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
};

const STAT_CARDS: {
  filter: CardFilter;
  label: string;
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
  countKey: 'total' | 'analysis' | 'awaitingRefuel' | 'concluded' | 'cancelled';
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
    label: 'Em Análise',
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
    filter: 'concluded',
    label: 'Concluídas',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
    countKey: 'concluded',
  },
  {
    filter: 'cancelled',
    label: 'Canceladas',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: XCircle,
    countKey: 'cancelled',
  },
];

const ITEMS_PER_PAGE = 20;

export default function SolicitarCombustivelPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [detailRequest, setDetailRequest] = useState<FuelRequestRow | null>(null);
  const [reportTarget, setReportTarget] = useState<FuelRequestRow | null>(null);
  const [reportForm, setReportForm] = useState<ReportFormState>(EMPTY_REPORT_FORM);

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

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const currentUserId =
    typeof userData?.data?.id === 'string' ? userData.data.id : '';

  const { data: allRows = [], isLoading: loadingList } = useQuery({
    queryKey: ['fuel-refuel-requests-mine'],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests/mine');
      return (res.data?.data || []) as FuelRequestRow[];
    },
    enabled: !loadingUser,
  });

  const { data: citiesPayload } = useQuery({
    queryKey: ['fuel-satellite-cities'],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests/satellite-cities');
      return res.data?.data as { states: string[]; cities: SatelliteCity[] };
    },
    enabled: showForm,
    staleTime: 5 * 60 * 1000,
  });

  const { data: contractsRes } = useQuery({
    queryKey: ['contracts-for-fuel-request'],
    queryFn: async () =>
      (await api.get('/contracts', { params: { limit: 500, page: 1 } })).data,
    enabled: showForm,
    staleTime: 10 * 60 * 1000,
  });

  const contractSelectOptions = useMemo(
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

  const { data: driverOptions = [], isLoading: loadingDrivers } = useQuery({
    queryKey: ['fuel-request-driver-options'],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests/driver-options');
      return (res.data?.data || []) as DriverOption[];
    },
    enabled: showForm,
    staleTime: 10 * 60 * 1000,
  });

  const { data: fleetVehicles = [], isLoading: loadingVehicles } = useQuery({
    queryKey: ['fuel-request-fleet-vehicles'],
    queryFn: async () => {
      const res = await api.get('/vehicles', {
        params: { isActive: 'true', limit: 100, page: 1 },
      });
      return (res.data?.data || []) as FleetVehicle[];
    },
    enabled: showForm,
    staleTime: 10 * 60 * 1000,
  });

  const driverSelectOptions = useMemo(
    () =>
      toPersonSelectOptions(
        driverOptions.map((d) => ({
          value: d.id,
          name: d.name,
          cpf: d.cpf,
          profilePhotoUrl: d.profilePhotoUrl,
          extraSearchText: d.costCenter || undefined,
        })),
      ),
    [driverOptions],
  );

  useEffect(() => {
    if (!showForm || driverOptions.length === 0) return;
    setFormData((f) => {
      if (f.driverUserId) {
        const selected = driverOptions.find((d) => d.id === f.driverUserId);
        if (!selected || f.driverNamePreview) return f;
        return {
          ...f,
          driverNamePreview: selected.name,
          driverCpfPreview: selected.cpf || '',
          driverCostCenterPreview: selected.costCenter || '',
        };
      }
      const me = currentUserId
        ? driverOptions.find((d) => d.id === currentUserId)
        : undefined;
      if (!me) return f;
      return {
        ...f,
        driverUserId: me.id,
        driverNamePreview: me.name,
        driverCpfPreview: me.cpf || '',
        driverCostCenterPreview: me.costCenter || '',
      };
    });
  }, [showForm, driverOptions, currentUserId]);

  const vehicleOptions = useMemo(
    () =>
      fleetVehicles.map((v) => {
        const model = formatVehicleModel(v);
        const plate = formatVehicleLabel(v);
        return {
          value: v.id,
          label: plate,
          description: model !== '—' ? model : undefined,
          searchText: `${plate} ${model}`.replace(/[^a-zA-Z0-9]/g, ' '),
        };
      }),
    [fleetVehicles],
  );
  const citiesForState = useMemo(() => {
    const cities = citiesPayload?.cities || [];
    if (!formData.stateCode) return cities;
    return cities.filter((c) => c.stateCode === formData.stateCode);
  }, [citiesPayload?.cities, formData.stateCode]);

  const stats = useMemo(() => {
    const analysis = allRows.filter((r) => isAnalysisStatus(r.status)).length;
    const awaitingRefuel = allRows.filter((r) => isAwaitingRefuelStatus(r.status)).length;
    const concluded = allRows.filter((r) => r.status === 'COMPLETED').length;
    const cancelled = allRows.filter((r) => isCancelledStatus(r.status)).length;
    return { total: allRows.length, analysis, awaitingRefuel, concluded, cancelled };
  }, [allRows]);

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (cardFilter === 'analysis') rows = rows.filter((r) => isAnalysisStatus(r.status));
    else if (cardFilter === 'awaiting_refuel') {
      rows = rows.filter((r) => isAwaitingRefuelStatus(r.status));
    } else if (cardFilter === 'concluded') rows = rows.filter((r) => r.status === 'COMPLETED');
    else if (cardFilter === 'cancelled') rows = rows.filter((r) => isCancelledStatus(r.status));

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const hay = `${r.displayNumber} ${r.route} ${r.driverName} ${r.vehiclePlate} ${r.vehicleDescription || ''} ${r.costCenter || ''} ${r.contract?.name || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return rows;
  }, [allRows, cardFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const pageRows = filteredRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const listRange = getCadastroListRange(page, ITEMS_PER_PAGE, filteredRows.length);
  const listHeader = CARD_LIST_CONFIG[cardFilter];
  const isListEmpty = !loadingList && pageRows.length === 0;
  const showStationDeadlineColumns = cardFilter !== 'analysis';

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(pageRows);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, cardFilter]);

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post('/fuel-refuel-requests', payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Solicitação registrada');
      setShowForm(false);
      setFormData(EMPTY_FORM());
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests-mine'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao registrar solicitação';
      toast.error(msg);
    },
  });

  const reportMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      body: Record<string, unknown>;
    }) => {
      const res = await api.post(`/fuel-refuel-requests/${payload.id}/report`, payload.body);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Abastecimento informado');
      setReportTarget(null);
      setReportForm(EMPTY_REPORT_FORM());
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests-mine'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao informar abastecimento';
      toast.error(msg);
    },
  });

  const openCreateForm = () => {
    setFormData(EMPTY_FORM());
    setShowForm(true);
  };

  const openReportForm = (row: FuelRequestRow) => {
    setDetailRequest(null);
    setReportForm(EMPTY_REPORT_FORM());
    setReportTarget(row);
  };

  const openDetail = (row: FuelRequestRow) => {
    closeRowActionMenu();
    setDetailRequest(row);
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

  const submitForm = () => {
    if (!formData.refuelDate) {
      toast.error('Informe a data do abastecimento');
      return;
    }
    if (formData.route.trim().length < 2) {
      toast.error('Informe a rota');
      return;
    }
    if (!formData.satelliteCityCode) {
      toast.error('Selecione a cidade');
      return;
    }
    if (!formData.contractId) {
      toast.error('Selecione o contrato');
      return;
    }
    if (!formData.driverUserId) {
      toast.error('Selecione o condutor');
      return;
    }
    if (!formData.vehicleId || !formData.vehiclePlate.trim()) {
      toast.error('Selecione o veículo pela placa');
      return;
    }
    if (!formData.vehicleType) {
      toast.error('Veículo sem tipo cadastrado (frota/particular)');
      return;
    }
    if (isBlankVehiclePhoto(formData.dashboardPhoto)) {
      toast.error('Envie a foto do painel');
      return;
    }

    createMutation.mutate({
      refuelDate: formData.refuelDate,
      route: formData.route.trim(),
      satelliteCityCode: formData.satelliteCityCode,
      contractId: formData.contractId,
      vehiclePlate: formData.vehiclePlate.trim().toUpperCase(),
      vehicleDescription: formData.vehicleDescription.trim() || undefined,
      vehicleType: formData.vehicleType,
      dashboardPhotoBase64: formData.dashboardPhoto,
      observations: formData.observations.trim() || undefined,
      driverUserId: formData.driverUserId,
    });
  };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/solicitar-combustivel">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/solicitar-combustivel">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Abastecimento
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Frota vai direto ao Suprimentos; particular passa pelo gestor antes.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {STAT_CARDS.map((card) => (
              <FilterStatCard
                key={card.filter}
                label={card.label}
                count={stats[card.countKey]}
                icon={card.Icon}
                iconBg={card.iconBg}
                iconColor={card.iconColor}
                isActive={cardFilter === card.filter}
                loading={loadingList}
                onClick={() => setCardFilter(card.filter)}
              />
            ))}
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                    <listHeader.Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {listHeader.title}
                    </h3>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                      {listHeader.subtitle}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className="relative min-w-[220px] flex-1 sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar por ID, rota, placa, condutor..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
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
                    <span>Nova solicitação</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {loadingList ? (
                <CadastroListLoading message="Carregando solicitações..." />
              ) : isListEmpty ? (
                <CadastroListEmpty
                  icon={Fuel}
                  title="Nenhuma solicitação encontrada"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : cardFilter === 'all'
                        ? 'Clique em Nova solicitação para pedir combustível'
                        : 'Nenhuma solicitação neste filtro'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={listRange.startItem}
                    endItem={listRange.endItem}
                    total={filteredRows.length}
                    itemLabel="solicitação"
                    itemLabelPlural="solicitações"
                    currentPage={page}
                    totalPages={totalPages}
                  />
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={`${cadastroListClasses.th} w-12 whitespace-nowrap`}>ID</th>
                          <th className={`${cadastroListClasses.th} min-w-[7rem]`}>Rota</th>
                          <th className={`${thCenterCompact} whitespace-nowrap`}>Data</th>
                          <th className={thCenterCompact}>Condutor</th>
                          <th className={`${thCenterCompact} whitespace-nowrap`}>Veículo</th>
                          <th className={thCenterCompact}>Contrato</th>
                          {showStationDeadlineColumns ? (
                            <>
                              <th className={thCenterCompact}>Posto</th>
                              <th className={thCenterCompact}>Prazo</th>
                            </>
                          ) : null}
                          <th className={`${thCenterCompact} whitespace-nowrap`}>Status</th>
                          <th className={`${thCenterCompact} w-14`}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {pageRows.map((row, index) => {
                          const deadlineLines = formatRefuelDeadlineLines(
                            row.refuelDeadlineAmount,
                            row.refuelDeadlineUnit,
                            row.refuelDeadlineAt,
                          );
                          return (
                          <tr
                            key={row.id}
                            onClick={() => openDetail(row)}
                            className={getListTableRowClassName(true)}
                          >
                            <td className={cadastroListClasses.tdMono}>
                              <ListRowNavigableLabel className="font-mono font-medium">
                                {formatCadastroListId(String(row.displayNumber), listRange.startItem + index)}
                              </ListRowNavigableLabel>
                            </td>
                            <td className={`${cadastroListClasses.td} break-words`}>{row.route}</td>
                            <td className={`${cadastroListClasses.tdCenter} px-2 sm:px-3`}>
                              {(() => {
                                const dateSource =
                                  row.requestedAt || row.createdAt || row.refuelDate;
                                const parts = formatDateTimeParts(dateSource);
                                if (!parts) return '—';
                                return (
                                  <div className="leading-snug">
                                    <p>{parts.date}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {parts.time}
                                    </p>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className={tdCenterWrap}>
                              <span className="block break-words leading-snug">{row.driverName}</span>
                            </td>
                            <td className={`${cadastroListClasses.tdCenter} px-2 sm:px-3`}>
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
                            <td className={tdCenterWrap}>
                              <span className="block break-words leading-snug">
                                {fuelContractLabel(row)}
                              </span>
                            </td>
                            {showStationDeadlineColumns ? (
                              <>
                                <td className={tdCenterWrap}>
                                  {row.gasStation ? (
                                    <div className="space-y-0.5 break-words text-center leading-snug">
                                      <p className="font-medium text-gray-900 dark:text-gray-100">
                                        {row.gasStation.name}
                                      </p>
                                      {row.gasStation.address ? (
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          {row.gasStation.address}
                                        </p>
                                      ) : null}
                                      {row.suppliesApprovalComment ? (
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          {row.suppliesApprovalComment}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 dark:text-gray-500">—</span>
                                  )}
                                </td>
                                <td className={tdCenterWrap}>
                                  {deadlineLines ? (
                                    <div className="leading-snug">
                                      <p className="font-medium text-gray-900 dark:text-gray-100">
                                        {deadlineLines.amountLabel}
                                      </p>
                                      {deadlineLines.dateLabel ? (
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          {deadlineLines.dateLabel}
                                        </p>
                                      ) : null}
                                      {deadlineLines.timeLabel ? (
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          {deadlineLines.timeLabel}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 dark:text-gray-500">—</span>
                                  )}
                                </td>
                              </>
                            ) : null}
                            <td className={`${cadastroListClasses.tdCenter} px-2 sm:px-3`}>
                              <span
                                className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[row.status]}`}
                              >
                                {STATUS_LABELS[row.status] || row.status}
                              </span>
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(row.id)}
                              onToggle={(e) => toggleRowActionMenu(row.id, e.currentTarget)}
                              align="center"
                            />
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {rowActionMenu && rowForActionMenu ? (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      onEdit={() => {}}
                      hideDefaultActions
                      extraItems={[
                        {
                          label: 'Ver detalhes',
                          onClick: () => openDetail(rowForActionMenu),
                          icon: (
                            <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                          ),
                        },
                      ]}
                    />
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Modal
          isOpen={Boolean(detailRequest)}
          onClose={() => setDetailRequest(null)}
          title={
            detailRequest
              ? `Solicitação #${detailRequest.displayNumber}`
              : 'Detalhes da solicitação'
          }
          size="lg"
        >
          {detailRequest ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Status</span>
                  <p className="mt-0.5">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[detailRequest.status]}`}
                    >
                      {STATUS_LABELS[detailRequest.status]}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Data</span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {formatDateLabel(detailRequest.refuelDate)}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <span className="font-medium text-gray-500 dark:text-gray-400">Rota</span>
                  <p className="text-gray-900 dark:text-gray-100">{detailRequest.route}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Condutor</span>
                  <p className="text-gray-900 dark:text-gray-100">{detailRequest.driverName}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Veículo</span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {detailRequest.vehiclePlate}
                    {detailRequest.vehicleType
                      ? ` — ${VEHICLE_TYPE_LABELS[detailRequest.vehicleType]}`
                      : ''}
                  </p>
                </div>
                {detailRequest.gasStation ? (
                  <div className="sm:col-span-2">
                    <span className="font-medium text-gray-500 dark:text-gray-400">
                      Posto liberado
                    </span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {detailRequest.gasStation.name}
                      {detailRequest.gasStation.address
                        ? ` — ${detailRequest.gasStation.address}`
                        : ''}
                    </p>
                  </div>
                ) : null}
                {detailRequest.refuelDeadlineAmount ? (
                  <div className="sm:col-span-2">
                    <span className="font-medium text-gray-500 dark:text-gray-400">
                      Prazo para abastecer
                    </span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {formatRefuelDeadline(
                        detailRequest.refuelDeadlineAmount,
                        detailRequest.refuelDeadlineUnit,
                        detailRequest.refuelDeadlineAt,
                      )}
                    </p>
                  </div>
                ) : null}
                {detailRequest.suppliesApprovalComment ? (
                  <div className="sm:col-span-2">
                    <span className="font-medium text-gray-500 dark:text-gray-400">
                      Observação do Suprimentos
                    </span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {detailRequest.suppliesApprovalComment}
                    </p>
                  </div>
                ) : null}
                {detailRequest.observations ? (
                  <div className="sm:col-span-2">
                    <span className="font-medium text-gray-500 dark:text-gray-400">
                      Observações
                    </span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {detailRequest.observations}
                    </p>
                  </div>
                ) : null}
              </div>

              {detailRequest.status === 'COMPLETED' && detailRequest.tankLevelAfter ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800/50 dark:bg-green-950/20">
                  <span className="font-medium text-green-800 dark:text-green-200">
                    Dados do abastecimento
                  </span>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {detailRequest.odometerKm != null ? (
                      <div>
                        <span className="text-xs text-gray-500">Hodômetro</span>
                        <p>{detailRequest.odometerKm.toLocaleString('pt-BR')} km</p>
                      </div>
                    ) : null}
                    <div>
                      <span className="text-xs text-gray-500">Tanque</span>
                      <p>{TANK_LEVEL_LABELS[detailRequest.tankLevelAfter]}</p>
                    </div>
                    {detailRequest.litersRefueled != null ? (
                      <div>
                        <span className="text-xs text-gray-500">Litros</span>
                        <p>
                          {Number(detailRequest.litersRefueled).toLocaleString('pt-BR', {
                            minimumFractionDigits: 3,
                            maximumFractionDigits: 3,
                          })}
                        </p>
                      </div>
                    ) : null}
                    {detailRequest.pricePerLiter != null ? (
                      <div>
                        <span className="text-xs text-gray-500">Valor por litro</span>
                        <p>
                          {Number(detailRequest.pricePerLiter).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  {detailRequest.refuelReportObservations ? (
                    <p className="mt-2 text-sm">{detailRequest.refuelReportObservations}</p>
                  ) : null}
                </div>
              ) : null}

              {detailRequest.status === 'AWAITING_REFUEL' ? (
                <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => openReportForm(detailRequest)}
                    className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Informar abastecimento
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </Modal>

        <Modal
          isOpen={showForm}
          onClose={() => {
            if (createMutation.isPending) return;
            setShowForm(false);
          }}
          size="lg"
          showCloseButton={false}
          scrollContent={false}
          contentClassName="!p-0"
          confirmBeforeClose
        >
          <FuelCreateFormHeader
            disabled={createMutation.isPending}
            onClose={() => setShowForm(false)}
          />
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <FormSection title="Abastecimento">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={FUEL_FORM_LABEL_CLS}>
                    Data do abastecimento *
                  </label>
                  <DatePickerField
                    value={formData.refuelDate}
                    onChange={(refuelDate) => setFormData((f) => ({ ...f, refuelDate }))}
                  />
                </div>
                <div>
                  <label className={FUEL_FORM_LABEL_CLS}>
                    Rota *
                  </label>
                  <input
                    type="text"
                    value={formData.route}
                    onChange={(e) => setFormData((f) => ({ ...f, route: e.target.value }))}
                    className={FORM_FIELD_INPUT_CLS}
                    placeholder="Descreva a rota do abastecimento"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={FUEL_FORM_LABEL_CLS}>
                    Estado *
                  </label>
                  <SingleSelectSearchDropdown
                    value={formData.stateCode}
                    onChange={(stateCode) =>
                      setFormData((f) => ({
                        ...f,
                        stateCode,
                        satelliteCityCode: '',
                      }))
                    }
                    options={(citiesPayload?.states || ['DF', 'GO']).map((s) => ({
                      value: s,
                      label: s,
                    }))}
                    placeholder="Selecione DF ou GO"
                  />
                </div>
                <div>
                  <label className={FUEL_FORM_LABEL_CLS}>
                    Cidade *
                  </label>
                  <SingleSelectSearchDropdown
                    value={formData.satelliteCityCode}
                    onChange={(satelliteCityCode) =>
                      setFormData((f) => ({ ...f, satelliteCityCode }))
                    }
                    options={citiesForState.map((c) => ({
                      value: c.code,
                      label: c.name,
                      searchText: c.name,
                    }))}
                    placeholder={
                      formData.stateCode
                        ? citiesForState.length
                          ? 'Selecione a cidade'
                          : 'Nenhuma cidade neste estado'
                        : 'Selecione o estado antes'
                    }
                    emptyOptionsMessage="Nenhuma cidade disponível neste estado."
                    disabled={!formData.stateCode}
                  />
                </div>
              </div>
              <div>
                <label className={FUEL_FORM_LABEL_CLS}>
                  Contrato *
                </label>
                <SingleSelectSearchDropdown
                  value={formData.contractId}
                  onChange={(contractId) => setFormData((f) => ({ ...f, contractId }))}
                  options={contractSelectOptions}
                  placeholder="Selecione o contrato"
                  searchPlaceholder="Pesquisar contrato..."
                  emptyOptionsMessage="Nenhum contrato disponível."
                />
              </div>
            </FormSection>

            <FormSection title="Condutor">
              <div>
                <label className={FUEL_FORM_LABEL_CLS}>
                  Colaborador *
                </label>
                <SingleSelectSearchDropdown
                  value={formData.driverUserId}
                  onChange={(driverUserId) => {
                    const selected = driverOptions.find((d) => d.id === driverUserId);
                    if (!selected) {
                      setFormData((f) => ({
                        ...f,
                        driverUserId: '',
                        driverNamePreview: '',
                        driverCpfPreview: '',
                        driverCostCenterPreview: '',
                      }));
                      return;
                    }
                    setFormData((f) => ({
                      ...f,
                      driverUserId,
                      driverNamePreview: selected.name,
                      driverCpfPreview: selected.cpf || '',
                      driverCostCenterPreview: selected.costCenter || '',
                    }));
                  }}
                  options={driverSelectOptions}
                  placeholder={
                    loadingDrivers ? 'Carregando colaboradores…' : 'Digite o nome para buscar'
                  }
                  searchPlaceholder="Nome ou CPF…"
                  disabled={loadingDrivers}
                />
              </div>
            </FormSection>

            <FormSection title="Veículo">
              <div>
                <label className={FUEL_FORM_LABEL_CLS}>
                  Buscar por placa *
                </label>
                <SingleSelectSearchDropdown
                  value={formData.vehicleId}
                  onChange={(vehicleId) => {
                    const selected = fleetVehicles.find((v) => v.id === vehicleId);
                    if (!selected) {
                      setFormData((f) => ({
                        ...f,
                        vehicleId: '',
                        vehiclePlate: '',
                        vehicleDescription: '',
                        vehicleType: '',
                      }));
                      return;
                    }
                    const modelo = [selected.marcaVeic, selected.modeloVeic]
                      .filter(Boolean)
                      .join(' ')
                      .trim();
                    setFormData((f) => ({
                      ...f,
                      vehicleId,
                      vehiclePlate: formatPlacaDisplay(selected.placaVeic),
                      vehicleDescription: modelo,
                      vehicleType: mapFrotaParticToFuelType(selected.frotaPartic),
                    }));
                  }}
                  options={vehicleOptions}
                  placeholder={
                    loadingVehicles ? 'Carregando veículos…' : 'Digite a placa para buscar'
                  }
                  searchPlaceholder="Placa…"
                  disabled={loadingVehicles}
                />
              </div>
            </FormSection>

            <FormSection title="Painel e observações">
              <div>
                <label className={FUEL_FORM_LABEL_CLS}>
                  Foto do painel *
                </label>
                <VehicleReturnPhotoField
                  value={formData.dashboardPhoto}
                  onChange={(dashboardPhoto) => setFormData((f) => ({ ...f, dashboardPhoto }))}
                  emptyLabel="Tocar para fotografar o painel"
                  photoAlt="Foto do painel"
                />
              </div>
              <div>
                <label className={FUEL_FORM_LABEL_CLS}>
                  Observações
                </label>
                <textarea
                  value={formData.observations}
                  onChange={(e) => setFormData((f) => ({ ...f, observations: e.target.value }))}
                  className={FORM_FIELD_TEXTAREA_CLS}
                  placeholder="Opcional"
                />
              </div>
            </FormSection>
          </div>

          <FuelCreateFormFooter
            isPending={createMutation.isPending}
            onSubmit={submitForm}
          />
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

              <FormSection title="Dados do abastecimento">
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
              </FormSection>

              <FormSection title="Cupom e observações">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Foto do cupom fiscal *
                  </label>
                  <VehicleReturnPhotoField
                    value={reportForm.receiptPhoto}
                    onChange={(receiptPhoto) => setReportForm((f) => ({ ...f, receiptPhoto }))}
                    emptyLabel="Tocar para fotografar o cupom"
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
              </FormSection>

              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  disabled={reportMutation.isPending}
                  onClick={() => setReportTarget(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={reportMutation.isPending}
                  onClick={submitReportForm}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {reportMutation.isPending ? 'Enviando…' : 'Confirmar abastecimento'}
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
