'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CheckCircle,
  Clock,
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
import { Modal } from '@/components/ui/Modal';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { cadastroListClasses, listTableRowClasses } from '@/components/ui/RowActionMenu';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import {
  VehicleReturnPhotoField,
  isBlankVehiclePhoto,
} from '@/components/ui/VehicleReturnPhotoField';
import { formatPlacaDisplay } from '@/lib/brazilianVehiclePlate';

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

type FuelRequestRow = {
  id: string;
  displayNumber: number;
  refuelDate: string;
  route: string;
  driverName: string;
  vehiclePlate: string;
  vehicleType: FuelVehicleType;
  status: FuelRefuelStatus;
  satelliteCityCode?: string | null;
  satelliteCityName?: string | null;
  costCenter?: string | null;
  observations?: string | null;
};

type SatelliteCity = {
  code: string;
  stateCode: string;
  name: string;
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
};

type FormState = {
  refuelDate: string;
  route: string;
  stateCode: string;
  satelliteCityCode: string;
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

type CardFilter = 'all' | 'pending' | 'concluded' | 'cancelled';

const STATUS_LABELS: Record<FuelRefuelStatus, string> = {
  PENDING_MANAGER: 'Aguardando gestor',
  PENDING_SUPPLIES: 'Aguardando Suprimentos',
  AWAITING_REFUEL: 'Aguardando abastecimento',
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
  COMPANY: 'Frota / empresa',
};

const fieldClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

function todayInputValue() {
  return format(new Date(), 'yyyy-MM-dd');
}

function EMPTY_FORM(): FormState {
  return {
    refuelDate: todayInputValue(),
    route: '',
    stateCode: '',
    satelliteCityCode: '',
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

function formatVehicleLabel(vehicle: FleetVehicle): string {
  return formatPlacaDisplay(vehicle.placaVeic);
}

function formatVehicleModel(vehicle: FleetVehicle): string {
  const marca = vehicle.marcaVeic?.trim();
  const modelo = vehicle.modeloVeic?.trim();
  if (marca && modelo) return `${marca} ${modelo}`;
  return modelo || marca || '—';
}

function formatFrotaParticLabel(value?: VehicleUsageType | null): string {
  if (value === 'FROTA') return 'Frota';
  if (value === 'PARTICULAR') return 'Particular';
  return '—';
}

function formatContratoLabel(value?: string | null): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '—';
  const withoutCode = trimmed.replace(/^\d+(?:\.\d+)+\s*[-–—]\s*/, '').trim();
  return withoutCode || trimmed;
}

function mapFrotaParticToFuelType(frotaPartic?: VehicleUsageType | null): FuelVehicleType {
  return frotaPartic === 'PARTICULAR' ? 'PRIVATE' : 'COMPANY';
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-900/40">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
      {children}
    </section>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-100/90 px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-950/60 dark:text-gray-300">
        {value || '—'}
      </div>
    </div>
  );
}

function formatDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'dd/MM/yyyy', { locale: ptBR });
}

function isPendingStatus(status: FuelRefuelStatus): boolean {
  return (
    status === 'PENDING_MANAGER' ||
    status === 'PENDING_SUPPLIES' ||
    status === 'AWAITING_REFUEL' ||
    status === 'APPROVED'
  );
}

function isCancelledStatus(status: FuelRefuelStatus): boolean {
  return status === 'CANCELLED' || status === 'REJECTED';
}

const CARD_LIST_CONFIG: Record<
  CardFilter,
  { title: string; subtitle: string; Icon: LucideIcon; iconBg: string; iconColor: string }
> = {
  all: {
    title: 'Minhas solicitações',
    subtitle: 'Acompanhe pedidos de abastecimento feitos por você.',
    Icon: Users,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  pending: {
    title: 'Solicitações pendentes',
    subtitle: 'Aguardando gestor, Suprimentos ou abastecimento.',
    Icon: Clock,
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  concluded: {
    title: 'Solicitações concluídas',
    subtitle: 'Abastecimentos finalizados.',
    Icon: CheckCircle,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  cancelled: {
    title: 'Canceladas / rejeitadas',
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
  countKey: 'total' | 'pending' | 'concluded' | 'cancelled';
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

  const driverInfo = formData.driverUserId
    ? {
        name: formData.driverNamePreview || '—',
        cpf: formData.driverCpfPreview || '—',
        costCenter: formData.driverCostCenterPreview || '—',
      }
    : null;

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
    staleTime: 30 * 60 * 1000,
  });

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
      driverOptions.map((d) => ({
        value: d.id,
        label: d.name,
        searchText: `${d.name} ${d.cpf || ''} ${d.costCenter || ''}`,
      })),
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

  const selectedVehicle = useMemo(
    () => fleetVehicles.find((v) => v.id === formData.vehicleId) ?? null,
    [fleetVehicles, formData.vehicleId],
  );

  const vehicleOptions = useMemo(
    () =>
      fleetVehicles.map((v) => ({
        value: v.id,
        label: formatVehicleLabel(v),
        searchText: formatPlacaDisplay(v.placaVeic).replace(/[^a-zA-Z0-9]/g, ''),
      })),
    [fleetVehicles],
  );
  const citiesForState = useMemo(() => {
    const cities = citiesPayload?.cities || [];
    if (!formData.stateCode) return cities;
    return cities.filter((c) => c.stateCode === formData.stateCode);
  }, [citiesPayload?.cities, formData.stateCode]);

  const stats = useMemo(() => {
    const pending = allRows.filter((r) => isPendingStatus(r.status)).length;
    const concluded = allRows.filter((r) => r.status === 'COMPLETED').length;
    const cancelled = allRows.filter((r) => isCancelledStatus(r.status)).length;
    return { total: allRows.length, pending, concluded, cancelled };
  }, [allRows]);

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (cardFilter === 'pending') rows = rows.filter((r) => isPendingStatus(r.status));
    else if (cardFilter === 'concluded') rows = rows.filter((r) => r.status === 'COMPLETED');
    else if (cardFilter === 'cancelled') rows = rows.filter((r) => isCancelledStatus(r.status));

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const hay = `${r.displayNumber} ${r.route} ${r.driverName} ${r.vehiclePlate} ${r.costCenter || ''}`.toLowerCase();
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

  const openCreateForm = () => {
    setFormData(EMPTY_FORM());
    setShowForm(true);
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
      toast.error('Selecione a cidade de abastecimento');
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
      vehiclePlate: formData.vehiclePlate.trim().toUpperCase(),
      vehicleDescription: formData.vehicleDescription.trim() || undefined,
      vehicleType: formData.vehicleType,
      dashboardPhotoBase64: formData.dashboardPhoto,
      observations: formData.observations.trim() || undefined,
      driverUserId: formData.driverUserId,
    });
  };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/solicitar-combustivel">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Solicitar Combustível
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Frota vai direto ao Suprimentos; particular passa pelo gestor antes.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STAT_CARDS.map((card) => (
              <FilterStatCard
                key={card.filter}
                label={card.label}
                count={stats[card.countKey]}
                icon={card.Icon}
                iconBg={card.iconBg}
                iconColor={card.iconColor}
                isActive={cardFilter === card.filter}
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
                  <div className="overflow-x-auto">
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>ID</th>
                          <th className={cadastroListClasses.th}>Data</th>
                          <th className={cadastroListClasses.th}>Rota</th>
                          <th className={cadastroListClasses.th}>Condutor</th>
                          <th className={cadastroListClasses.thCenter}>Placa</th>
                          <th className={cadastroListClasses.thCenter}>Tipo</th>
                          <th className={cadastroListClasses.thCenter}>Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {pageRows.map((row, index) => (
                          <tr key={row.id} className={listTableRowClasses.tr}>
                            <td className={cadastroListClasses.tdMono}>
                              {formatCadastroListId(String(row.displayNumber), listRange.startItem + index)}
                            </td>
                            <td className={cadastroListClasses.td}>{formatDateLabel(row.refuelDate)}</td>
                            <td className={cadastroListClasses.td}>{row.route}</td>
                            <td className={cadastroListClasses.td}>{row.driverName}</td>
                            <td className={cadastroListClasses.tdCenter}>{row.vehiclePlate}</td>
                            <td className={cadastroListClasses.tdCenter}>
                              {VEHICLE_TYPE_LABELS[row.vehicleType] || row.vehicleType}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              <span
                                className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[row.status]}`}
                              >
                                {STATUS_LABELS[row.status] || row.status}
                              </span>
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
          isOpen={showForm}
          onClose={() => {
            if (createMutation.isPending) return;
            setShowForm(false);
          }}
          title="Nova solicitação de combustível"
          size="lg"
        >
          <div className="space-y-4">
            <FormSection title="Abastecimento">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Data do abastecimento *
                  </label>
                  <DatePickerField
                    value={formData.refuelDate}
                    onChange={(refuelDate) => setFormData((f) => ({ ...f, refuelDate }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Rota *
                  </label>
                  <input
                    type="text"
                    value={formData.route}
                    onChange={(e) => setFormData((f) => ({ ...f, route: e.target.value }))}
                    className={fieldClassName}
                    placeholder="Ex.: Obra X → Escritório"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Cidade de abastecimento *
                  </label>
                  <SingleSelectSearchDropdown
                    value={formData.satelliteCityCode}
                    onChange={(satelliteCityCode) =>
                      setFormData((f) => ({ ...f, satelliteCityCode }))
                    }
                    options={citiesForState.map((c) => ({
                      value: c.code,
                      label: c.name,
                    }))}
                    placeholder={
                      formData.stateCode ? 'Selecione a cidade' : 'Selecione o estado antes'
                    }
                    disabled={!formData.stateCode}
                  />
                </div>
              </div>
            </FormSection>

            <FormSection title="Condutor">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
              {driverInfo ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <ReadOnlyField label="Nome" value={driverInfo.name} />
                  <ReadOnlyField label="CPF" value={driverInfo.cpf} />
                  <ReadOnlyField label="Centro de custo" value={driverInfo.costCenter} />
                </div>
              ) : null}
            </FormSection>

            <FormSection title="Veículo">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
              {selectedVehicle ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ReadOnlyField
                    label="Placa"
                    value={formatPlacaDisplay(selectedVehicle.placaVeic)}
                  />
                  <ReadOnlyField label="Modelo" value={formatVehicleModel(selectedVehicle)} />
                  <ReadOnlyField
                    label="Tipo"
                    value={formatFrotaParticLabel(selectedVehicle.frotaPartic)}
                  />
                  <ReadOnlyField label="Polo" value={selectedVehicle.polo?.trim() || '—'} />
                  <ReadOnlyField
                    label="Contrato"
                    value={formatContratoLabel(selectedVehicle.contrato)}
                  />
                  <ReadOnlyField
                    label="Responsável"
                    value={selectedVehicle.responsavel?.trim() || '—'}
                  />
                </div>
              ) : null}
            </FormSection>

            <FormSection title="Painel e observações">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Observações
                </label>
                <textarea
                  value={formData.observations}
                  onChange={(e) => setFormData((f) => ({ ...f, observations: e.target.value }))}
                  className={`${fieldClassName} min-h-[80px]`}
                  placeholder="Opcional"
                />
              </div>
            </FormSection>

            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={() => setShowForm(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={submitForm}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Enviando…' : 'Enviar solicitação'}
              </button>
            </div>
          </div>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
