'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  Filter,
  PackageCheck,
  Plus,
  Search,
  Truck,
  X,
  AlertTriangle,
  CalendarPlus,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { formatRmListDisplayId } from '@/app/ponto/gerenciar-materiais/_lib/rmListDisplay';
import {
  formatCurrencyInputBrFromNumber,
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';
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
  type DeliveryTypeValue,
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
  contractId: string | null;
  currentStatus: CurrentStatusValue;
  paymentStatus: PaymentStatusValue;
  supplierId: string | null;
  supplierName: string | null;
  purchaseOrderId: string | null;
  orderValue: string | number | null;
  expectedDelivery: string | null;
  actualDelivery: string | null;
  totalPaid: string | number | null;
  stockShortfallType: StockShortfallTypeValue | null;
  rmNumber: string | null;
  deliveryType: string | null;
  observations: string | null;
  finalStatus: FinalStatusValue;
  receivedByEngineering: boolean;
  receivedAt: string | null;
  createdAt: string;
  supplier: { id: string; code: string; name: string } | null;
  purchaseOrder: { id: string; orderNumber: string; status: string } | null;
  creator: { id: string; name: string };
  receivedByUser: { id: string; name: string } | null;
  contractRecord: { id: string; name: string; number: string } | null;
};

type FormState = {
  polo: PoloValue;
  movementId: string;
  movementNumber: string;
  contractId: string;
  currentStatus: CurrentStatusValue;
  paymentStatus: PaymentStatusValue;
  supplierId: string;
  purchaseOrderId: string;
  orderValue: string;
  expectedDelivery: string;
  totalPaid: string;
  rmNumber: string;
  deliveryType: string;
  observations: string;
};

const EMPTY_FORM: FormState = {
  polo: 'DF',
  movementId: '',
  movementNumber: '',
  contractId: '',
  currentStatus: 'APROVADO_SUPRIMENTOS',
  paymentStatus: 'AGUARDANDO_PAGAMENTO',
  supplierId: '',
  purchaseOrderId: '',
  orderValue: '',
  expectedDelivery: '',
  totalPaid: '',
  rmNumber: '',
  deliveryType: '',
  observations: '',
};

const ITEMS_PER_PAGE = 12;

type ViewFilter = 'all' | 'awaiting' | 'received' | 'overdue';

function getListHeaderConfig(viewFilter: ViewFilter) {
  switch (viewFilter) {
    case 'awaiting':
      return {
        Icon: PackageCheck,
        iconBg: 'bg-amber-100 dark:bg-amber-900/30',
        iconColor: 'text-amber-600 dark:text-amber-400',
        title: 'Entregas Pendentes',
        subtitle: 'Exibindo entregas com recebimento de engenharia pendente',
      };
    case 'received':
      return {
        Icon: CheckCircle2,
        iconBg: 'bg-green-100 dark:bg-green-900/30',
        iconColor: 'text-green-600 dark:text-green-400',
        title: 'Entregas Recebidas',
        subtitle: 'Exibindo entregas já confirmadas pela engenharia',
      };
    case 'overdue':
      return {
        Icon: AlertTriangle,
        iconBg: 'bg-red-100 dark:bg-red-900/30',
        iconColor: 'text-red-600 dark:text-red-400',
        title: 'Entregas Atrasadas',
        subtitle: 'Exibindo entregas com previsão vencida',
      };
    default:
      return {
        Icon: Truck,
        iconBg: 'bg-blue-100 dark:bg-blue-900/30',
        iconColor: 'text-blue-600 dark:text-blue-400',
        title: 'Entregas em Andamento',
        subtitle: 'Listagem completa de entregas de material',
      };
  }
}

const NO_FOCUS =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0';

const fieldClassName = `w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm ${NO_FOCUS}`;

const currencyFieldClassName = `${fieldClassName} text-right tabular-nums`;

type ContractForDelivery = {
  id: string;
  name: string;
  costCenterId?: string;
  costCenter?: { id: string; code?: string; name?: string } | null;
};

const searchInputClassName = `h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${NO_FOCUS}`;

function toInputDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function rowToForm(row: MaterialDeliveryRow): FormState {
  return {
    polo: row.polo,
    movementId: row.movementId ?? '',
    movementNumber: row.movementNumber ?? '',
    contractId: row.contractId ?? '',
    currentStatus: row.currentStatus,
    paymentStatus: row.paymentStatus,
    supplierId: row.supplierId ?? '',
    purchaseOrderId: row.purchaseOrderId ?? '',
    orderValue: formatCurrencyInputBrFromNumber(row.orderValue),
    expectedDelivery: toInputDate(row.expectedDelivery),
    totalPaid: formatCurrencyInputBrFromNumber(row.totalPaid),
    rmNumber: row.rmNumber ?? '',
    deliveryType: normalizeDeliveryType(row.deliveryType),
    observations: row.observations ?? '',
  };
}

function contractLabel(row: MaterialDeliveryRow): string {
  return row.contractRecord?.name ?? '—';
}

function deliveryTypeLabel(value: string | null | undefined): string {
  const normalized = normalizeDeliveryType(value);
  if (!normalized) return '—';
  return DELIVERY_TYPE_OPTIONS.find((o) => o.value === normalized)?.label ?? '—';
}

const thBase =
  'px-3 sm:px-6 py-3 align-middle text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap';
const thLeftClass = `${thBase} text-left`;
const thCenterClass = `${thBase} text-center`;
const tdBase = 'px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300';
const tdLeftClass = `${tdBase} text-left`;
const tdCenterClass = `${tdBase} text-center`;
const tdTruncateCenterClass = `${tdCenterClass} truncate`;
const tdPillClass = `${tdCenterClass}`;

const ENGINEERING_RECEIPT_STATUS = {
  received: {
    label: 'Recebido',
    className:
      'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  },
  pending: {
    label: 'Pendente',
    className:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  },
} as const;

function StatusPill({
  value,
  options,
}: {
  value: string;
  options: readonly { value: string; label: string; className: string }[];
}) {
  const badge = statusBadge(value, options);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${badge.className}`}>
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

export default function ControleEntregasPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [poloFilter, setPoloFilter] = useState('');
  const [currentStatusFilter, setCurrentStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [listCurrentPage, setListCurrentPage] = useState(1);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaterialDeliveryRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailRowId, setDetailRowId] = useState<string | null>(null);
  const [expectedDeliveryEditId, setExpectedDeliveryEditId] = useState<string | null>(null);
  const [expectedDeliveryDraft, setExpectedDeliveryDraft] = useState('');
  const [deliveryTypeEditId, setDeliveryTypeEditId] = useState<string | null>(null);
  const [deliveryTypeDraft, setDeliveryTypeDraft] = useState<DeliveryTypeValue | ''>('');

  const closeDetailModal = () => {
    setDetailRowId(null);
    setExpectedDeliveryEditId(null);
    setExpectedDeliveryDraft('');
    setDeliveryTypeEditId(null);
    setDeliveryTypeDraft('');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const { data: summaryRes } = useQuery({
    queryKey: ['material-deliveries-summary'],
    queryFn: async () => {
      const res = await api.get('/material-deliveries/summary');
      return res.data;
    },
  });

  const { data: listRes, isLoading: loadingList } = useQuery({
    queryKey: [
      'material-deliveries',
      search,
      poloFilter,
      currentStatusFilter,
      paymentStatusFilter,
      viewFilter,
    ],
    queryFn: async () => {
      const res = await api.get('/material-deliveries', {
        params: {
          search: search.trim() || undefined,
          polo: poloFilter || undefined,
          currentStatus: currentStatusFilter || undefined,
          paymentStatus: paymentStatusFilter || undefined,
          awaitingEngineering: viewFilter === 'awaiting' ? 'true' : undefined,
          receivedByEngineering: viewFilter === 'received' ? 'true' : undefined,
          limit: 300,
        },
      });
      return res.data;
    },
  });

  const { data: suppliersRes } = useQuery({
    queryKey: ['suppliers-for-deliveries'],
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { isActive: true, limit: 500 } });
      return res.data;
    },
    enabled: showForm,
  });

  const { data: contractsRes } = useQuery({
    queryKey: ['contracts-for-deliveries'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500, page: 1 } });
      return res.data;
    },
    enabled: showForm,
  });

  const items: MaterialDeliveryRow[] = listRes?.data ?? [];
  const detailRow = useMemo(
    () => (detailRowId ? items.find((row) => row.id === detailRowId) ?? null : null),
    [items, detailRowId]
  );
  const summary = summaryRes?.data ?? { total: 0, awaitingEngineering: 0, delivered: 0, overdue: 0 };
  const listHeader = useMemo(() => getListHeaderConfig(viewFilter), [viewFilter]);
  const ListHeaderIcon = listHeader.Icon;
  const suppliers = suppliersRes?.data ?? [];
  const contracts = (contractsRes?.data ?? []) as ContractForDelivery[];

  const contractOptions = useMemo(
    () => contracts.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })),
    [contracts]
  );

  const supplierOptions = useMemo(
    () => suppliers.map((s: { id: string; name: string }) => ({ value: s.id, label: s.name })),
    [suppliers]
  );

  const currentStatusOptions = useMemo(
    () => CURRENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
  );

  const paymentStatusOptions = useMemo(
    () => PAYMENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
  );

  const poloSelectOptions = useMemo(
    () => POLO_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
  );

  const filteredItems = useMemo(() => {
    if (viewFilter !== 'overdue') return items;
    return items.filter((row) => {
      if (row.receivedByEngineering) return false;
      if (row.currentStatus === 'CANCELADO' || row.finalStatus === 'CANCELADO') return false;
      if (row.currentStatus === 'ENTREGUE') return false;
      return isDeliveryDateOverdue(row.expectedDelivery);
    });
  }, [items, viewFilter]);

  const totalRows = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));
  const startIndex = (listCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedItems = useMemo(
    () => filteredItems.slice(startIndex, endIndex),
    [filteredItems, startIndex, endIndex]
  );
  const startItem = totalRows === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(endIndex, totalRows);

  useEffect(() => {
    setListCurrentPage(1);
  }, [search, poloFilter, currentStatusFilter, paymentStatusFilter, viewFilter]);

  useEffect(() => {
    if (listCurrentPage > totalPages) {
      setListCurrentPage(totalPages);
    }
  }, [listCurrentPage, totalPages]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const selectedSupplier = suppliers.find(
        (s: { id: string; name: string }) => s.id === form.supplierId
      );
      const payload = {
        polo: form.polo,
        movementId: form.movementId,
        movementNumber: form.movementNumber,
        contractId: form.contractId || null,
        currentStatus: form.currentStatus,
        paymentStatus: form.paymentStatus,
        supplierId: form.supplierId || null,
        supplierName: selectedSupplier?.name ?? null,
        purchaseOrderId: form.purchaseOrderId || null,
        orderValue: parseCurrencyInputBr(form.orderValue),
        totalPaid: parseCurrencyInputBr(form.totalPaid),
        rmNumber: form.rmNumber,
        observations: form.observations,
        // Previsão e tipo de entrega são editados inline na listagem, não pelo modal.
      };
      if (editing) {
        const res = await api.patch(`/material-deliveries/${editing.id}`, payload);
        return res.data;
      }
      const res = await api.post('/material-deliveries', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary-recebimento'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-recebimento-pending-count'] });
      toast.success(editing ? 'Entrega atualizada' : 'Entrega registrada');
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao salvar entrega');
    },
  });

  const receiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-deliveries/${id}/receive`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary-recebimento'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-recebimento-pending-count'] });
      toast.success('Recebimento confirmado pela engenharia');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao confirmar recebimento');
    },
  });

  const updateExpectedDeliveryMutation = useMutation({
    mutationFn: async ({ id, expectedDelivery }: { id: string; expectedDelivery: string }) => {
      const res = await api.patch(`/material-deliveries/${id}`, { expectedDelivery });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary-recebimento'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-recebimento-pending-count'] });
      toast.success('Previsão de entrega salva');
      setExpectedDeliveryEditId(null);
      setExpectedDeliveryDraft('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao salvar previsão de entrega');
    },
  });

  const updateDeliveryTypeMutation = useMutation({
    mutationFn: async ({ id, deliveryType }: { id: string; deliveryType: DeliveryTypeValue }) => {
      const res = await api.patch(`/material-deliveries/${id}`, { deliveryType });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary-recebimento'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-recebimento-pending-count'] });
      toast.success('Tipo de entrega salvo');
      setDeliveryTypeEditId(null);
      setDeliveryTypeDraft('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao salvar tipo de entrega');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/material-deliveries/${id}`);
      return res.data;
    },
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['material-deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary-recebimento'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-recebimento-pending-count'] });
      toast.success('Entrega excluída');
      setDeleteId(null);
      if (detailRowId === deletedId) closeDetailModal();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao excluir');
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (row: MaterialDeliveryRow) => {
    setEditing(row);
    setForm(rowToForm(row));
    setShowForm(true);
  };

  const handleSupplierChange = (supplierId: string) => {
    setForm((prev) => ({ ...prev, supplierId }));
  };

  useEffect(() => {
    if (!showForm && !deleteId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showForm) {
          setShowForm(false);
          setEditing(null);
        }
        if (deleteId) setDeleteId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm, deleteId]);

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
    <ProtectedRoute route="/ponto/controle-entregas">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-8">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Controle de Entregas
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Acompanhe entregas de material e confirme o recebimento pela engenharia.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 2xl:grid-cols-4">
            <FilterStatCard
              label="Em andamento"
              count={summary.total}
              icon={Truck}
              iconBg="bg-blue-100 dark:bg-blue-900/30"
              iconColor="text-blue-600 dark:text-blue-400"
              isActive={viewFilter === 'all'}
              onClick={() => setViewFilter('all')}
            />
            <FilterStatCard
              label="Pendentes"
              count={summary.awaitingEngineering}
              icon={PackageCheck}
              iconBg="bg-amber-100 dark:bg-amber-900/30"
              iconColor="text-amber-600 dark:text-amber-400"
              isActive={viewFilter === 'awaiting'}
              onClick={() => setViewFilter('awaiting')}
            />
            <FilterStatCard
              label="Recebidas"
              count={summary.delivered}
              icon={CheckCircle2}
              iconBg="bg-green-100 dark:bg-green-900/30"
              iconColor="text-green-600 dark:text-green-400"
              isActive={viewFilter === 'received'}
              onClick={() => setViewFilter('received')}
            />
            <FilterStatCard
              label="Atrasadas"
              count={summary.overdue}
              icon={AlertTriangle}
              iconBg="bg-red-100 dark:bg-red-900/30"
              iconColor="text-red-600 dark:text-red-400"
              isActive={viewFilter === 'overdue'}
              onClick={() => setViewFilter('overdue')}
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
                  <button
                    type="button"
                    onClick={openCreate}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Nova entrega
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingList ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 dark:text-gray-400">Carregando entregas...</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhuma entrega encontrada</p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                    Ajuste os filtros ou clique em Nova entrega para cadastrar manualmente
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
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {paginatedItems.map((row) => {
                          const isOverdue =
                            !row.receivedByEngineering &&
                            row.currentStatus !== 'ENTREGUE' &&
                            row.currentStatus !== 'CANCELADO' &&
                            isDeliveryDateOverdue(row.expectedDelivery);

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
                              <td className={`${tdCenterClass} whitespace-nowrap`}>{row.movementId || '—'}</td>
                              <td className={`${tdCenterClass} whitespace-nowrap`}>{row.movementNumber || '—'}</td>
                              <td className={tdCenterClass} title={`${contractLabel(row)} · ${row.polo}`}>
                                <span className="inline-flex flex-col items-center gap-0.5">
                                  <span className="max-w-[160px] truncate">{contractLabel(row)}</span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{row.polo}</span>
                                </span>
                              </td>
                              <td className={tdPillClass}>
                                {(() => {
                                  const receipt = row.receivedByEngineering
                                    ? ENGINEERING_RECEIPT_STATUS.received
                                    : ENGINEERING_RECEIPT_STATUS.pending;
                                  return (
                                    <div className="flex justify-center">
                                      <span
                                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${receipt.className}`}
                                      >
                                        {receipt.label}
                                      </span>
                                    </div>
                                  );
                                })()}
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
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
                  {detailRow.supplier?.name || detailRow.supplierName || '—'}
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
                  {expectedDeliveryEditId === detailRow.id ? (
                    <div className="space-y-2">
                      <input
                        type="date"
                        value={expectedDeliveryDraft}
                        onChange={(e) => setExpectedDeliveryDraft(e.target.value)}
                        className={fieldClassName}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={
                            !expectedDeliveryDraft || updateExpectedDeliveryMutation.isPending
                          }
                          onClick={() =>
                            updateExpectedDeliveryMutation.mutate({
                              id: detailRow.id,
                              expectedDelivery: expectedDeliveryDraft,
                            })
                          }
                          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          disabled={updateExpectedDeliveryMutation.isPending}
                          onClick={() => {
                            setExpectedDeliveryEditId(null);
                            setExpectedDeliveryDraft('');
                          }}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : detailRow.expectedDelivery ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
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
                      <button
                        type="button"
                        onClick={() => {
                          setExpectedDeliveryEditId(detailRow.id);
                          setExpectedDeliveryDraft(toInputDate(detailRow.expectedDelivery));
                        }}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      >
                        Alterar
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setExpectedDeliveryEditId(detailRow.id);
                        setExpectedDeliveryDraft('');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-gray-600 dark:text-gray-200 dark:hover:border-blue-500 dark:hover:bg-blue-950/30"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" />
                      Adicionar previsão
                    </button>
                  )}
                </DetailField>
                <DetailField label="Tipo de entrega">
                  {deliveryTypeEditId === detailRow.id ? (
                    <div className="space-y-2">
                      <StringSingleSelectDropdown
                        value={deliveryTypeDraft}
                        onChange={(value) =>
                          setDeliveryTypeDraft(value as DeliveryTypeValue | '')
                        }
                        options={labeledToSelectOptions(DELIVERY_TYPE_OPTIONS)}
                        placeholder="Selecionar..."
                        className={fieldClassName}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!deliveryTypeDraft || updateDeliveryTypeMutation.isPending}
                          onClick={() =>
                            updateDeliveryTypeMutation.mutate({
                              id: detailRow.id,
                              deliveryType: deliveryTypeDraft as DeliveryTypeValue,
                            })
                          }
                          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          disabled={updateDeliveryTypeMutation.isPending}
                          onClick={() => {
                            setDeliveryTypeEditId(null);
                            setDeliveryTypeDraft('');
                          }}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : normalizeDeliveryType(detailRow.deliveryType) ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span>{deliveryTypeLabel(detailRow.deliveryType)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setDeliveryTypeEditId(detailRow.id);
                          setDeliveryTypeDraft(normalizeDeliveryType(detailRow.deliveryType));
                        }}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      >
                        Alterar
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setDeliveryTypeEditId(detailRow.id);
                        setDeliveryTypeDraft('');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-gray-600 dark:text-gray-200 dark:hover:border-blue-500 dark:hover:bg-blue-950/30"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      Adicionar tipo
                    </button>
                  )}
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
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          title="Filtros"
        >
          <div className="space-y-4">
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
            <div>
              <label className="block text-sm font-medium mb-1">Status atual</label>
              <SingleSelectSearchDropdown
                value={currentStatusFilter}
                onChange={setCurrentStatusFilter}
                options={currentStatusOptions}
                placeholder="Todos"
                emptyOptionLabel="Todos"
                noFocusRing
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Pagamento</label>
              <SingleSelectSearchDropdown
                value={paymentStatusFilter}
                onChange={setPaymentStatusFilter}
                options={paymentStatusOptions}
                placeholder="Todos"
                emptyOptionLabel="Todos"
                noFocusRing
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPoloFilter('');
                  setCurrentStatusFilter('');
                  setPaymentStatusFilter('');
                  setSearch('');
                  setViewFilter('all');
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
          isOpen={showForm}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          title={editing ? `Editar ${editing.deliveryNumber}` : 'Nova entrega'}
          size="lg"
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Polo *</label>
                <div className="flex gap-2">
                  {POLO_OPTIONS.map((o) => (
                    <ButtonSeg
                      key={o.value}
                      active={form.polo === o.value}
                      onClick={() => setForm((f) => ({ ...f, polo: o.value }))}
                      label={o.label}
                    />
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Contrato</label>
                <SingleSelectSearchDropdown
                  value={form.contractId}
                  onChange={(contractId) => setForm((f) => ({ ...f, contractId }))}
                  options={contractOptions}
                  allowEmpty={false}
                  placeholder="Selecionar contrato..."
                  noFocusRing
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">N° RM</label>
                <input
                  value={form.rmNumber}
                  onChange={(e) => setForm((f) => ({ ...f, rmNumber: e.target.value }))}
                  className={fieldClassName}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ID Mov</label>
                <input
                  value={form.movementId}
                  onChange={(e) => setForm((f) => ({ ...f, movementId: e.target.value }))}
                  className={fieldClassName}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nº Mov</label>
                <input
                  value={form.movementNumber}
                  onChange={(e) => setForm((f) => ({ ...f, movementNumber: e.target.value }))}
                  className={fieldClassName}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status atual</label>
                <SingleSelectSearchDropdown
                  value={form.currentStatus}
                  onChange={(currentStatus) =>
                    setForm((f) => ({ ...f, currentStatus: currentStatus as CurrentStatusValue }))
                  }
                  options={currentStatusOptions}
                  allowEmpty={false}
                  placeholder="Selecionar status..."
                  noFocusRing
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Pagamento</label>
                <SingleSelectSearchDropdown
                  value={form.paymentStatus}
                  onChange={(paymentStatus) =>
                    setForm((f) => ({ ...f, paymentStatus: paymentStatus as PaymentStatusValue }))
                  }
                  options={paymentStatusOptions}
                  allowEmpty={false}
                  placeholder="Selecionar pagamento..."
                  noFocusRing
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fornecedor</label>
                <SingleSelectSearchDropdown
                  value={form.supplierId}
                  onChange={handleSupplierChange}
                  options={supplierOptions}
                  allowEmpty={false}
                  placeholder="Selecionar fornecedor..."
                  noFocusRing
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor OC</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.orderValue}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, orderValue: maskCurrencyInputBrOrEmpty(e.target.value) }))
                  }
                  placeholder="R$ 0,00"
                  className={currencyFieldClassName}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor total pago</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.totalPaid}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, totalPaid: maskCurrencyInputBrOrEmpty(e.target.value) }))
                  }
                  placeholder="R$ 0,00"
                  className={currencyFieldClassName}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={form.observations}
                  onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
                  className={fieldClassName}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Salvando...' : editing ? 'Salvar alterações' : 'Registrar entrega'}
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={Boolean(deleteId)}
          onClose={() => setDeleteId(null)}
          confirmBeforeClose={false}
      title="Excluir entrega"
        >
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteId(null)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Excluir
            </button>
          </div>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
