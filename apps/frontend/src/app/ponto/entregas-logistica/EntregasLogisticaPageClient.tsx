'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Search, Truck, Upload, X, Paperclip, CheckCircle, Clock, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { Modal } from '@/components/ui/Modal';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { ConstructionMaterialSearchDropdown } from '@/components/suprimentos/ConstructionMaterialSearchDropdown';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';
import { fetchEmployeeSelectOptions } from '@/lib/employeeSelectOptions';
import { toPersonSelectOptions } from '@/lib/personSelectOptions';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import {
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';
import { getListTableRowClassName, ListRowNavigableLabel, listTableRowClasses } from '@/components/ui/listTableUi';
import { RowActionMenuCell, RowActionMenuPortal } from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import api from '@/lib/api';

type UrgencyValue = 'NORMAL' | 'URGENT';
type RequestStatus = 'PENDING' | 'COMPLETED';
type DeliveryOutcome = 'DELIVERED' | 'PARTIAL' | 'NOT_DELIVERED';
type CardFilter = 'all' | 'pending' | 'completed';

type CompletionData = {
  deliveryOutcome: DeliveryOutcome;
};

type LogisticsRow = {
  id: string;
  displayNumber: number;
  status: RequestStatus;
  requestedAt: string;
  urgency: UrgencyValue;
  movementId: string;
  value: string | number;
  driverName?: string | null;
  materialName?: string | null;
  expectedDelivery?: string | null;
  history?: string | null;
  observations?: string | null;
  serviceOrderNumber?: string | null;
  purchaseOrderNumber?: string | null;
  materialAttachmentUrl?: string | null;
  materialAttachmentName?: string | null;
  creator: { id: string; name: string; email: string };
  contract?: { id: string; name: string; number: string } | null;
  costCenter?: { id: string; code: string; name: string } | null;
  purchaseOrder?: { id: string; orderNumber: string } | null;
  supplier?: { id: string; code: string; name: string } | null;
  completion?: CompletionData | null;
};

type FormState = {
  urgency: UrgencyValue;
  contractId: string;
  serviceOrderNumber: string;
  purchaseOrderNumber: string;
  movementId: string;
  supplierId: string;
  driverName: string;
  materialId: string;
  materialName: string;
  materialAttachmentUrl: string;
  materialAttachmentName: string;
  value: string;
  history: string;
  observations: string;
  expectedDelivery: string;
};

const ITEMS_PER_PAGE = 12;

const DELIVERY_OUTCOME_OPTIONS = [
  { value: 'DELIVERED', label: 'Entregue' },
  { value: 'PARTIAL', label: 'Entrega parcial' },
  { value: 'NOT_DELIVERED', label: 'Não entregue' },
] as const;

function outcomeLabel(value: DeliveryOutcome) {
  return DELIVERY_OUTCOME_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function deliveryStatusCell(row: LogisticsRow) {
  if (row.status === 'COMPLETED') {
    const label = row.completion
      ? outcomeLabel(row.completion.deliveryOutcome)
      : 'Finalizada';
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-200">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
      Pendente
    </span>
  );
}

function emptyForm(): FormState {
  return {
    urgency: 'NORMAL',
    contractId: '',
    serviceOrderNumber: '',
    purchaseOrderNumber: '',
    movementId: '',
    supplierId: '',
    driverName: '',
    materialId: '',
    materialName: '',
    materialAttachmentUrl: '',
    materialAttachmentName: '',
    value: '',
    history: '',
    observations: '',
    expectedDelivery: '',
  };
}

function urgencyLabel(value: UrgencyValue) {
  return value === 'URGENT' ? 'Urgente' : 'Normal';
}

function urgencyBadgeClass(value: UrgencyValue) {
  return value === 'URGENT'
    ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200';
}

function formatMoney(value: string | number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBr(iso?: string | null) {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '—';
  }
}

function detailValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '—';
}

const labelCls = 'mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300';
const detailLabelCls = 'font-medium text-gray-700 dark:text-gray-300';
const detailValueCls = 'break-words text-gray-600 dark:text-gray-400';

const thBase =
  'px-3 py-3 align-middle text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap sm:px-4';
const thLeftClass = `${thBase} text-left`;
const thCenterClass = `${thBase} text-center`;
const tdBase = 'px-3 py-3 align-middle text-sm text-gray-900 dark:text-gray-100 sm:px-4';
const tdLeftClass = `${tdBase} text-left`;
const tdCenterClass = `${tdBase} text-center whitespace-nowrap`;
const tdTruncateLeftClass = `${tdLeftClass} truncate`;

const TABLE_COLUMNS = [
  { key: 'id', label: 'ID', align: 'center' as const, width: 'w-[5%]' },
  { key: 'supplier', label: 'Fornecedor', align: 'left' as const, width: 'w-[20%]' },
  { key: 'urgency', label: 'Urgência', align: 'center' as const, width: 'w-[8%]' },
  { key: 'oc', label: 'OC', align: 'center' as const, width: 'w-[8%]' },
  { key: 'movement', label: 'ID Mov.', align: 'center' as const, width: 'w-[9%]' },
  { key: 'driver', label: 'Motorista', align: 'center' as const, width: 'w-[14%]' },
  { key: 'status', label: 'Status', align: 'center' as const, width: 'w-[10%]' },
  { key: 'value', label: 'Valor', align: 'center' as const, width: 'w-[9%]' },
  { key: 'forecast', label: 'Previsão', align: 'center' as const, width: 'w-[9%]' },
];

const LIST_CONFIG: Record<
  CardFilter,
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
    subtitle: 'Visão geral das entregas logísticas registradas pelo Suprimentos.',
    Icon: Users,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  pending: {
    title: 'Solicitações pendentes',
    subtitle: 'Aguardando finalização pela Logística.',
    Icon: Clock,
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  completed: {
    title: 'Solicitações finalizadas',
    subtitle: 'Entregas logísticas já registradas pela Logística.',
    Icon: CheckCircle,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
};

const STAT_CARDS: {
  filter: CardFilter;
  label: string;
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
  countKey: keyof { total: number; pending: number; completed: number };
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
    filter: 'completed',
    label: 'Finalizadas',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
    countKey: 'completed',
  },
];

function cardFilterToStatus(filter: CardFilter): string | undefined {
  if (filter === 'pending') return 'PENDING';
  if (filter === 'completed') return 'COMPLETED';
  return undefined;
}

export default function EntregasLogisticaPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [listPage, setListPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<LogisticsRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const { data: userRes, isLoading: loadingUser } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });
  const user = userRes?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const statusFilter = cardFilterToStatus(cardFilter);

  const { data: statsRes, isLoading: loadingStats } = useQuery({
    queryKey: ['logistics-delivery-requests', 'stats'],
    queryFn: async () => {
      const res = await api.get('/logistics-delivery-requests', { params: { limit: 500 } });
      return res.data;
    },
  });

  const { data: listRes, isLoading: loadingList } = useQuery({
    queryKey: ['logistics-delivery-requests', search, statusFilter],
    queryFn: async () => {
      const res = await api.get('/logistics-delivery-requests', {
        params: {
          search: search.trim() || undefined,
          status: statusFilter,
          limit: 500,
        },
      });
      return res.data;
    },
  });

  const { data: contractsRes } = useQuery({
    queryKey: ['contracts-for-logistics'],
    queryFn: async () => (await api.get('/contracts', { params: { limit: 500, page: 1 } })).data,
    enabled: modalOpen,
  });

  const { data: suppliersRes } = useQuery({
    queryKey: ['suppliers-for-logistics'],
    queryFn: async () =>
      (await api.get('/suppliers', { params: { isActive: true, limit: 500 } })).data,
    enabled: modalOpen,
  });

  const { data: driversRes } = useQuery({
    queryKey: ['drivers-for-logistics'],
    queryFn: fetchEmployeeSelectOptions,
    enabled: modalOpen,
  });

  const rows: LogisticsRow[] = listRes?.data ?? [];

  const deliveryStats = useMemo(() => {
    const list = (statsRes?.data ?? []) as LogisticsRow[];
    const completed = list.filter((r) => r.status === 'COMPLETED').length;
    const pending = list.filter((r) => r.status === 'PENDING').length;
    return { total: list.length, pending, completed };
  }, [statsRes]);

  const contractOptions = useMemo(
    () =>
      ((contractsRes?.data ?? []) as Array<{ id: string; name: string; number?: string }>).map(
        (c) => ({
          value: c.id,
          label: c.name,
          searchText: `${c.number ?? ''} ${c.name}`,
        })
      ),
    [contractsRes]
  );

  const supplierOptions = useMemo(
    () =>
      ((suppliersRes?.data ?? []) as Array<{ id: string; name: string; code?: string }>).map(
        (s) => ({
          value: s.id,
          label: s.name,
          searchText: `${s.code ?? ''} ${s.name}`,
        })
      ),
    [suppliersRes]
  );

  const driverOptions = useMemo(
    () =>
      toPersonSelectOptions(
        (driversRes ?? []).map((d) => ({
          value: d.name,
          name: d.name,
          cpf: d.cpf,
          profilePhotoUrl: d.profilePhotoUrl,
        }))
      ),
    [driversRes]
  );

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));
  const startIndex = (listPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = rows.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const startItem = totalRows === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(startIndex + ITEMS_PER_PAGE, totalRows);
  const isListEmpty = !loadingList && totalRows === 0;

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(paginatedRows);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  useEffect(() => {
    setListPage(1);
  }, [search, cardFilter]);

  useEffect(() => {
    if (listPage > totalPages) setListPage(totalPages);
  }, [listPage, totalPages]);

  const openCreate = () => {
    setDetailRow(null);
    closeRowActionMenu();
    setEditingId(null);
    setForm(emptyForm());
    setAttachmentFile(null);
    setModalOpen(true);
  };

  const openEdit = (row: LogisticsRow) => {
    setDetailRow(null);
    closeRowActionMenu();
    setEditingId(row.id);
    setForm({
      urgency: row.urgency,
      contractId: row.contract?.id ?? '',
      serviceOrderNumber: row.serviceOrderNumber ?? '',
      purchaseOrderNumber: row.purchaseOrderNumber ?? row.purchaseOrder?.orderNumber ?? '',
      movementId: row.movementId,
      supplierId: row.supplier?.id ?? '',
      driverName: row.driverName ?? '',
      materialId: '',
      materialName: row.materialName ?? '',
      materialAttachmentUrl: row.materialAttachmentUrl ?? '',
      materialAttachmentName: row.materialAttachmentName ?? '',
      value: maskCurrencyInputBrOrEmpty(String(row.value)),
      history: row.history ?? '',
      observations: row.observations ?? '',
      expectedDelivery: row.expectedDelivery ? row.expectedDelivery.slice(0, 10) : '',
    });
    setAttachmentFile(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setAttachmentFile(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let materialAttachmentUrl = form.materialAttachmentUrl;
      let materialAttachmentName = form.materialAttachmentName;

      if (attachmentFile) {
        setUploadingAttachment(true);
        try {
          const fd = new FormData();
          fd.append('file', attachmentFile);
          const uploadRes = await api.post('/logistics-delivery-requests/upload-attachment', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          materialAttachmentUrl = uploadRes.data?.data?.url ?? '';
          materialAttachmentName = uploadRes.data?.data?.originalName ?? attachmentFile.name;
        } finally {
          setUploadingAttachment(false);
        }
      }

      const parsedValue = parseCurrencyInputBr(form.value);
      if (!form.movementId.trim()) throw new Error('ID movimento é obrigatório');
      if (!form.purchaseOrderNumber.trim()) throw new Error('Número da OC é obrigatório');
      if (parsedValue === null || parsedValue <= 0) throw new Error('Valor é obrigatório');

      const payload: Record<string, unknown> = {
        urgency: form.urgency,
        contractId: form.contractId || null,
        serviceOrderId: null,
        serviceOrderNumber: form.serviceOrderNumber.trim() || null,
        purchaseOrderNumber: form.purchaseOrderNumber.trim(),
        movementId: form.movementId.trim(),
        supplierId: form.supplierId || null,
        driverName: form.driverName || null,
        materialId: form.materialId || null,
        materialName: form.materialName || null,
        materialAttachmentUrl: materialAttachmentUrl || null,
        materialAttachmentName: materialAttachmentName || null,
        value: parsedValue,
        history: form.history || null,
        observations: form.observations || null,
        expectedDelivery: form.expectedDelivery
          ? new Date(`${form.expectedDelivery}T12:00:00`).toISOString()
          : null,
      };

      if (editingId) {
        return api.patch(`/logistics-delivery-requests/${editingId}`, payload);
      }
      return api.post('/logistics-delivery-requests', {
        ...payload,
        requestedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logistics-delivery-requests'] });
      queryClient.invalidateQueries({ queryKey: ['logistics-delivery-pending-count'] });
      toast.success(editingId ? 'Solicitação atualizada!' : 'Solicitação registrada!');
      setDetailRow(null);
      closeModal();
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || error?.message || 'Erro ao salvar';
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/logistics-delivery-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logistics-delivery-requests'] });
      queryClient.invalidateQueries({ queryKey: ['logistics-delivery-pending-count'] });
      toast.success('Solicitação excluída!');
      setDeleteId(null);
      setDetailRow(null);
      closeRowActionMenu();
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || error?.message || 'Erro ao excluir';
      toast.error(msg);
    },
  });

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  const listHeader = LIST_CONFIG[cardFilter];
  const HeaderIcon = listHeader.Icon;

  return (
    <ProtectedRoute route="/ponto/entregas-logistica">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Entregas Logística
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Registre e acompanhe solicitações de entrega logística
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {STAT_CARDS.map((card) => (
              <FilterStatCard
                key={card.filter}
                label={card.label}
                count={deliveryStats[card.countKey]}
                icon={card.Icon}
                iconBg={card.iconBg}
                iconColor={card.iconColor}
                isActive={cardFilter === card.filter}
                loading={loadingStats}
                onClick={() => setCardFilter(card.filter)}
              />
            ))}
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                    <HeaderIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {listHeader.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {listHeader.subtitle}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar OC, ID movimento, fornecedor, motorista..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={openCreate}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Nova solicitação
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingList ? (
                <CadastroListLoading message="Carregando solicitações..." />
              ) : isListEmpty ? (
                <div className="py-8 text-center">
                  <Truck className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhuma solicitação encontrada</p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
                    Clique em Nova solicitação para registrar a primeira entrega logística
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {startItem} a {endItem} de {totalRows}{' '}
                      {totalRows === 1 ? 'solicitação' : 'solicitações'}
                    </span>
                    <span>
                      Página {listPage} de {totalPages}
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table className="w-full min-w-[60rem] table-fixed text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          {TABLE_COLUMNS.map((col) => (
                            <th
                              key={col.key}
                              className={`${col.align === 'center' ? thCenterClass : thLeftClass} ${col.width}`}
                            >
                              {col.label}
                            </th>
                          ))}
                          <th className={listTableRowClasses.actionTh}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {paginatedRows.map((row) => (
                          <tr
                            key={row.id}
                            className={getListTableRowClassName(true)}
                            onClick={() => {
                              closeRowActionMenu();
                              setDetailRow(row);
                            }}
                          >
                            <td className={tdCenterClass}>
                              <ListRowNavigableLabel className="font-medium">
                                {row.displayNumber}
                              </ListRowNavigableLabel>
                            </td>
                            <td
                              className={tdTruncateLeftClass}
                              title={row.supplier?.name ?? undefined}
                            >
                              {row.supplier?.name ?? '—'}
                            </td>
                            <td className={tdCenterClass}>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${urgencyBadgeClass(row.urgency)}`}
                              >
                                {urgencyLabel(row.urgency)}
                              </span>
                            </td>
                            <td className={tdCenterClass}>
                              {row.purchaseOrderNumber ?? row.purchaseOrder?.orderNumber ?? '—'}
                            </td>
                            <td className={tdCenterClass}>{row.movementId}</td>
                            <td className={tdCenterClass}>{row.driverName ?? '—'}</td>
                            <td className={tdCenterClass}>{deliveryStatusCell(row)}</td>
                            <td className={tdCenterClass}>{formatMoney(row.value)}</td>
                            <td className={tdCenterClass}>
                              {formatDateBr(row.expectedDelivery)}
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(row.id)}
                              onToggle={(e) =>
                                toggleRowActionMenu(row.id, e.currentTarget as HTMLButtonElement)
                              }
                            />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rowActionMenu && rowForActionMenu ? (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      onEdit={() => openEdit(rowForActionMenu)}
                      onDelete={() => setDeleteId(rowForActionMenu.id)}
                    />
                  ) : null}
                  <ListPagination
                    currentPage={listPage}
                    totalPages={totalPages}
                    onPageChange={setListPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Modal
          isOpen={!!detailRow}
          onClose={() => setDetailRow(null)}
          title={detailRow ? `Solicitação ${detailRow.displayNumber}` : 'Detalhes da solicitação'}
          size="2xl"
        >
          {detailRow ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                <dl className="divide-y divide-gray-100 text-sm dark:divide-gray-700">
                  {[
                    { label: 'ID', value: String(detailRow.displayNumber) },
                    { label: 'Data e hora', value: formatDateTimeBr(detailRow.requestedAt, '—') },
                    { label: 'Urgência', value: urgencyLabel(detailRow.urgency) },
                    { label: 'Status', value: deliveryStatusCell(detailRow) },
                    { label: 'Contrato', value: detailValue(detailRow.contract?.name) },
                    { label: 'Número da OS', value: detailValue(detailRow.serviceOrderNumber) },
                    {
                      label: 'Número da OC',
                      value: detailValue(
                        detailRow.purchaseOrderNumber ?? detailRow.purchaseOrder?.orderNumber
                      ),
                    },
                    { label: 'ID movimento', value: detailValue(detailRow.movementId) },
                    { label: 'Fornecedor', value: detailValue(detailRow.supplier?.name) },
                    { label: 'Motorista', value: detailValue(detailRow.driverName) },
                    { label: 'Insumo', value: detailValue(detailRow.materialName) },
                    {
                      label: 'Anexo',
                      value: detailRow.materialAttachmentUrl ? (
                        <a
                          href={absoluteUploadUrl(detailRow.materialAttachmentUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-red-600 hover:underline dark:text-red-400"
                        >
                          {detailRow.materialAttachmentName || 'Abrir anexo'}
                        </a>
                      ) : (
                        '—'
                      ),
                    },
                    { label: 'Valor', value: formatMoney(detailRow.value) },
                    {
                      label: 'Previsão de entrega',
                      value: formatDateBr(detailRow.expectedDelivery),
                    },
                    { label: 'Histórico', value: detailValue(detailRow.history) },
                    { label: 'Observações', value: detailValue(detailRow.observations) },
                    {
                      label: 'Registrado por',
                      value: detailValue(detailRow.creator?.name || detailRow.creator?.email),
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4"
                    >
                      <dt className={detailLabelCls}>{item.label}</dt>
                      <dd className={detailValueCls}>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setDetailRow(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(detailRow)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Editar
                </button>
              </div>
            </div>
          ) : null}
        </Modal>

        <Modal
          isOpen={!!deleteId}
          onClose={() => setDeleteId(null)}
          confirmBeforeClose={false}
      title="Excluir solicitação"
        >
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Tem certeza que deseja excluir esta solicitação logística? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteId(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </Modal>

        <Modal
          isOpen={modalOpen}
          onClose={closeModal}
          title={editingId ? 'Editar solicitação logística' : 'Nova solicitação logística'}
          size="2xl"
        >
          <form id="logistics-delivery-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Urgência</label>
                <div className="flex gap-2">
                  <ButtonSeg
                    active={form.urgency === 'NORMAL'}
                    onClick={() => setForm((p) => ({ ...p, urgency: 'NORMAL' }))}
                    label="Normal"
                  />
                  <ButtonSeg
                    active={form.urgency === 'URGENT'}
                    onClick={() => setForm((p) => ({ ...p, urgency: 'URGENT' }))}
                    label="Urgente"
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Contrato</label>
                <SingleSelectSearchDropdown
                  value={form.contractId}
                  onChange={(contractId) =>
                    setForm((p) => ({
                      ...p,
                      contractId,
                    }))
                  }
                  options={contractOptions}
                  placeholder="Selecione o contrato"
                  searchPlaceholder="Pesquisar contrato..."
                />
              </div>

              <div>
                <label className={labelCls}>Número da OS</label>
                <input
                  type="text"
                  value={form.serviceOrderNumber}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, serviceOrderNumber: e.target.value }))
                  }
                  className={FORM_FIELD_INPUT_CLS}
                  placeholder="Digite o número ou nome da OS"
                />
              </div>
              <div>
                <label className={labelCls}>Número da OC *</label>
                <input
                  type="text"
                  value={form.purchaseOrderNumber}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, purchaseOrderNumber: e.target.value }))
                  }
                  className={FORM_FIELD_INPUT_CLS}
                  placeholder="Digite o número da OC"
                  required
                />
              </div>

              <div>
                <label className={labelCls}>ID movimento *</label>
                <input
                  type="text"
                  value={form.movementId}
                  onChange={(e) => setForm((p) => ({ ...p, movementId: e.target.value }))}
                  className={FORM_FIELD_INPUT_CLS}
                  placeholder="Digite o ID movimento"
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Fornecedor</label>
                <SingleSelectSearchDropdown
                  value={form.supplierId}
                  onChange={(supplierId) => setForm((p) => ({ ...p, supplierId }))}
                  options={supplierOptions}
                  placeholder="Selecione o fornecedor"
                  searchPlaceholder="Pesquisar fornecedor..."
                />
              </div>

              <div>
                <label className={labelCls}>Motorista</label>
                <StringSingleSelectDropdown
                  value={form.driverName}
                  onChange={(driverName) => setForm((p) => ({ ...p, driverName }))}
                  options={driverOptions}
                  placeholder="Selecione o motorista"
                  searchPlaceholder="Pesquisar motorista..."
                />
              </div>
              <div>
                <label className={labelCls}>Insumo</label>
                <ConstructionMaterialSearchDropdown
                  value={form.materialId}
                  selectedLabel={form.materialName}
                  onChange={(materialId, material) =>
                    setForm((p) => ({
                      ...p,
                      materialId,
                      materialName: material.name,
                    }))
                  }
                  placeholder="Digite para buscar insumo..."
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls}>Anexar insumo</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)}
                />
                {attachmentFile || form.materialAttachmentName ? (
                  <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 dark:border-gray-600 dark:bg-gray-800">
                    <Paperclip className="h-4 w-4 shrink-0 text-gray-500" />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-gray-100">
                      {attachmentFile?.name ?? form.materialAttachmentName}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachmentFile(null);
                        setForm((p) => ({
                          ...p,
                          materialAttachmentUrl: '',
                          materialAttachmentName: '',
                        }));
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-sm text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900/40 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    <Upload className="h-8 w-8" />
                    Clique para anexar arquivo
                  </button>
                )}
              </div>

              <div>
                <label className={labelCls}>Valor R$ *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.value}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, value: maskCurrencyInputBrOrEmpty(e.target.value) }))
                  }
                  className={FORM_FIELD_INPUT_CLS}
                  placeholder="R$ 0,00"
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Previsão de entrega</label>
                <DatePickerField
                  value={form.expectedDelivery}
                  onChange={(expectedDelivery) =>
                    setForm((p) => ({ ...p, expectedDelivery }))
                  }
                  placeholder="dd/mm/aaaa"
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls}>Histórico</label>
                <textarea
                  value={form.history}
                  onChange={(e) => setForm((p) => ({ ...p, history: e.target.value }))}
                  className={FORM_FIELD_TEXTAREA_CLS}
                  placeholder="Registre o histórico da solicitação..."
                  rows={2}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Observações</label>
                <textarea
                  value={form.observations}
                  onChange={(e) => setForm((p) => ({ ...p, observations: e.target.value }))}
                  className={FORM_FIELD_TEXTAREA_CLS}
                  placeholder="Informe observações adicionais..."
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Fechar
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending || uploadingAttachment}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {saveMutation.isPending || uploadingAttachment ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
