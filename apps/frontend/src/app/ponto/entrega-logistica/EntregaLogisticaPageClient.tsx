'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CheckCircle,
  ClipboardCheck,
  Clock,
  FileText,
  Paperclip,
  Search,
  Truck,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { fetchEmployeeSelectOptions } from '@/lib/employeeSelectOptions';
import { FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
  listTableRowClasses,
} from '@/components/ui/listTableUi';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  type RowActionMenuExtraItem,
} from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import {
  isBlankVehiclePhoto,
  VehicleReturnPhotoField,
} from '@/components/ui/VehicleReturnPhotoField';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import api from '@/lib/api';

type RequestStatus = 'PENDING' | 'COMPLETED';
type DeliveryOutcome = 'DELIVERED' | 'PARTIAL' | 'NOT_DELIVERED';
type CardFilter = 'all' | 'pending' | 'completed';

type InvoiceAttachment = {
  url: string;
  name: string;
};

type CompletionData = {
  id: string;
  receivingLocation: string;
  receivingResponsible: string;
  receivedAt: string;
  deliveryOutcome: DeliveryOutcome;
  locationPhotoUrl: string;
  observations?: string | null;
  completer: { id: string; name: string; email: string };
  invoiceAttachments: Array<{ id: string; attachmentUrl: string; attachmentName?: string | null }>;
};

type UrgencyValue = 'NORMAL' | 'URGENT';

type LogisticsRow = {
  id: string;
  displayNumber: number;
  status: RequestStatus;
  requestedAt?: string;
  urgency?: UrgencyValue;
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
  creator?: { id: string; name: string; email: string } | null;
  contract?: { id: string; name: string; number: string } | null;
  costCenter?: { id: string; code: string; name: string } | null;
  purchaseOrder?: { id: string; orderNumber: string } | null;
  supplier?: { id: string; code: string; name: string } | null;
  completion?: CompletionData | null;
};

type FinalizeFormState = {
  receivingLocation: string;
  receivingResponsible: string;
  deliveryOutcome: DeliveryOutcome;
  locationPhoto: string;
  observations: string;
  invoiceAttachments: InvoiceAttachment[];
};

const ITEMS_PER_PAGE = 12;

const DELIVERY_OUTCOME_OPTIONS = [
  { value: 'DELIVERED', label: 'Entregue' },
  { value: 'PARTIAL', label: 'Entrega parcial' },
  { value: 'NOT_DELIVERED', label: 'Não entregue' },
] as const;

function emptyFinalizeForm(): FinalizeFormState {
  return {
    receivingLocation: '',
    receivingResponsible: '',
    deliveryOutcome: 'DELIVERED',
    locationPhoto: '',
    observations: '',
    invoiceAttachments: [],
  };
}

function outcomeLabel(value: DeliveryOutcome) {
  return DELIVERY_OUTCOME_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function urgencyLabel(value?: UrgencyValue | null) {
  return value === 'URGENT' ? 'Urgente' : 'Normal';
}

function deliveryStatusCell(row: LogisticsRow) {
  if (row.status === 'COMPLETED' && row.completion) {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-200">
        {outcomeLabel(row.completion.deliveryOutcome)}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
      Pendente
    </span>
  );
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
    subtitle: 'Aguardando registro de recebimento no local.',
    Icon: Clock,
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  completed: {
    title: 'Solicitações finalizadas',
    subtitle: 'Entregas logísticas já registradas no local.',
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

const thBase =
  'px-3 py-3 align-middle text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap sm:px-4';
const thLeftClass = `${thBase} text-left`;
const thCenterClass = `${thBase} text-center`;
const tdBase = 'px-3 py-3 align-middle text-sm text-gray-900 dark:text-gray-100 sm:px-4';
const tdLeftClass = `${tdBase} text-left`;
const tdCenterClass = `${tdBase} text-center whitespace-nowrap`;
const tdTruncateLeftClass = `${tdLeftClass} truncate`;
const tdTruncateCenterClass = `${tdCenterClass} truncate`;

const TABLE_COLUMNS = [
  { key: 'id', label: 'ID', align: 'center' as const, width: 'w-[6%]' },
  { key: 'supplier', label: 'Fornecedor', align: 'left' as const, width: 'w-[24%]' },
  { key: 'oc', label: 'OC', align: 'center' as const, width: 'w-[10%]' },
  { key: 'contract', label: 'Contrato', align: 'center' as const, width: 'w-[12%]' },
  { key: 'driver', label: 'Motorista', align: 'center' as const, width: 'w-[18%]' },
  { key: 'status', label: 'Status', align: 'center' as const, width: 'w-[12%]' },
  { key: 'value', label: 'Valor', align: 'center' as const, width: 'w-[10%]' },
];

function cardFilterToStatus(filter: CardFilter): string | undefined {
  if (filter === 'pending') return 'PENDING';
  if (filter === 'completed') return 'COMPLETED';
  return undefined;
}

export default function EntregaLogisticaPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [cardFilter, setCardFilter] = useState<CardFilter>('pending');
  const [listPage, setListPage] = useState(1);
  const [detailRow, setDetailRow] = useState<LogisticsRow | null>(null);
  const [finalizeRow, setFinalizeRow] = useState<LogisticsRow | null>(null);
  const [finalizeForm, setFinalizeForm] = useState<FinalizeFormState>(emptyFinalizeForm);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

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
    queryKey: ['contracts-for-entrega-logistica'],
    queryFn: async () => (await api.get('/contracts', { params: { limit: 500, page: 1 } })).data,
    enabled: Boolean(finalizeRow),
  });

  const { data: employeesRes } = useQuery({
    queryKey: ['employees-for-entrega-logistica'],
    queryFn: fetchEmployeeSelectOptions,
    enabled: Boolean(finalizeRow),
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
          value: c.name,
          label: c.name,
          searchText: `${c.number ?? ''} ${c.name}`,
        }),
      ),
    [contractsRes],
  );

  const employeeOptions = useMemo(
    () =>
      (employeesRes ?? []).map((employee) => ({
        value: employee.name,
        label: employee.name,
        searchText: employee.name,
      })),
    [employeesRes],
  );

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));
  const paginatedRows = rows.slice((listPage - 1) * ITEMS_PER_PAGE, listPage * ITEMS_PER_PAGE);
  const startItem = totalRows === 0 ? 0 : (listPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(listPage * ITEMS_PER_PAGE, totalRows);
  const isListEmpty = !loadingList && totalRows === 0;

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(paginatedRows);

  useEffect(() => {
    setListPage(1);
  }, [search, cardFilter]);

  useEffect(() => {
    if (listPage > totalPages) setListPage(totalPages);
  }, [listPage, totalPages]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/auth/login');
  };

  const finalizeMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const res = await api.post(`/logistics-delivery-requests/${id}/finalize`, body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logistics-delivery-requests'] });
      queryClient.invalidateQueries({ queryKey: ['logistics-delivery-pending-count'] });
      toast.success('Solicitação finalizada com sucesso!');
      setFinalizeRow(null);
      setFinalizeForm(emptyFinalizeForm());
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || error?.message || 'Erro ao finalizar';
      toast.error(msg);
    },
  });

  const openFinalizeModal = (row: LogisticsRow) => {
    closeRowActionMenu();
    setFinalizeRow(row);
    setFinalizeForm(emptyFinalizeForm());
  };

  const buildRowExtraMenuItems = (row: LogisticsRow): RowActionMenuExtraItem[] => {
    if (row.status === 'PENDING') {
      return [
        {
          label: 'Finalizar solicitação',
          onClick: () => openFinalizeModal(row),
          icon: (
            <ClipboardCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ),
        },
      ];
    }
    if (row.status === 'COMPLETED') {
      return [
        {
          label: 'Ver detalhes',
          onClick: () => {
            closeRowActionMenu();
            setDetailRow(row);
          },
          icon: <FileText className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />,
        },
      ];
    }
    return [];
  };

  const handleUploadInvoice = async (file: File) => {
    if (!file) return;
    setUploadingInvoice(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/logistics-delivery-requests/upload-attachment', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploaded = res.data?.data;
      if (!uploaded?.url) throw new Error('Upload inválido');
      setFinalizeForm((current) => ({
        ...current,
        invoiceAttachments: [
          ...current.invoiceAttachments,
          { url: uploaded.url, name: uploaded.originalName || file.name },
        ],
      }));
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Erro no upload';
      toast.error(msg);
    } finally {
      setUploadingInvoice(false);
      if (invoiceInputRef.current) invoiceInputRef.current.value = '';
    }
  };

  const handleSubmitFinalize = (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalizeRow) return;
    if (!finalizeForm.receivingLocation.trim()) {
      return toast.error('Selecione o local de recebimento');
    }
    if (!finalizeForm.receivingResponsible.trim()) {
      return toast.error('Selecione o responsável pelo recebimento');
    }
    if (isBlankVehiclePhoto(finalizeForm.locationPhoto)) {
      return toast.error('Fotografe o local de recebimento');
    }

    finalizeMutation.mutate({
      id: finalizeRow.id,
      body: {
        receivingLocation: finalizeForm.receivingLocation.trim(),
        receivingResponsible: finalizeForm.receivingResponsible.trim(),
        deliveryOutcome: finalizeForm.deliveryOutcome,
        locationPhoto: finalizeForm.locationPhoto,
        observations: finalizeForm.observations.trim() || undefined,
        receivedAt: new Date().toISOString(),
        invoiceAttachments: finalizeForm.invoiceAttachments,
      },
    });
  };

  const listHeader = LIST_CONFIG[cardFilter];
  const HeaderIcon = listHeader.Icon;

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/entrega-logistica">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Entrega da Logística
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Registre o recebimento das solicitações de entrega logística criadas pelo Suprimentos
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
                </div>
            </CardHeader>
            <CardContent>
              {loadingList ? (
                <div className="py-8 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="loading-spinner h-6 w-6" />
                    <span className="text-gray-600 dark:text-gray-400">
                      Carregando solicitações...
                    </span>
                  </div>
                </div>
              ) : isListEmpty ? (
                <div className="py-8 text-center">
                  <Truck className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="text-gray-600 dark:text-gray-400">
                    {cardFilter === 'pending'
                      ? 'Nenhuma solicitação pendente'
                      : cardFilter === 'completed'
                        ? 'Nenhuma solicitação finalizada'
                        : 'Nenhuma solicitação encontrada'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Mostrando {startItem} a {endItem} de {totalRows}{' '}
                      {totalRows === 1 ? 'solicitação' : 'solicitações'}
                    </span>
                    <span>
                      Página {listPage} de {totalPages}
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table className="w-full min-w-[52rem] table-fixed text-sm">
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
                            <td className={tdCenterClass}>{row.purchaseOrderNumber ?? '—'}</td>
                            <td
                              className={tdTruncateCenterClass}
                              title={row.contract?.name ?? undefined}
                            >
                              {row.contract?.name ?? '—'}
                            </td>
                            <td className={tdCenterClass}>{row.driverName ?? '—'}</td>
                            <td className={tdCenterClass}>{deliveryStatusCell(row)}</td>
                            <td className={tdCenterClass}>{formatMoney(row.value)}</td>
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
                      onEdit={() => {}}
                      onDelete={() => {}}
                      hideDefaultActions
                      extraItems={buildRowExtraMenuItems(rowForActionMenu)}
                    />
                  ) : null}

                  {totalPages > 1 ? (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        disabled={listPage <= 1}
                        onClick={() => setListPage((p) => Math.max(1, p - 1))}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-gray-600"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        disabled={listPage >= totalPages}
                        onClick={() => setListPage((p) => Math.min(totalPages, p + 1))}
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
          isOpen={Boolean(finalizeRow)}
          onClose={() => {
            if (finalizeMutation.isPending) return;
            setFinalizeRow(null);
            setFinalizeForm(emptyFinalizeForm());
          }}
          title={`Finalizar solicitação #${finalizeRow?.displayNumber ?? ''}`}
          size="lg"
        >
          {finalizeRow ? (
            <form onSubmit={handleSubmitFinalize} className="space-y-4">
              <div>
                <label className={labelCls}>Local de recebimento *</label>
                <SingleSelectSearchDropdown
                  options={contractOptions}
                  value={finalizeForm.receivingLocation}
                  onChange={(receivingLocation) =>
                    setFinalizeForm((current) => ({ ...current, receivingLocation }))
                  }
                  placeholder="Selecione o contrato"
                  disabled={finalizeMutation.isPending}
                />
              </div>

              <div>
                <label className={labelCls}>Responsável pelo recebimento *</label>
                <StringSingleSelectDropdown
                  options={employeeOptions}
                  value={finalizeForm.receivingResponsible}
                  onChange={(receivingResponsible) =>
                    setFinalizeForm((current) => ({ ...current, receivingResponsible }))
                  }
                  placeholder="Selecione o responsável"
                  disabled={finalizeMutation.isPending}
                />
              </div>

              <div>
                <label className={labelCls}>Entrega *</label>
                <StringSingleSelectDropdown
                  options={DELIVERY_OUTCOME_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                  value={finalizeForm.deliveryOutcome}
                  onChange={(deliveryOutcome) =>
                    setFinalizeForm((current) => ({
                      ...current,
                      deliveryOutcome: deliveryOutcome as DeliveryOutcome,
                    }))
                  }
                  placeholder="Selecione o resultado"
                  disabled={finalizeMutation.isPending}
                />
              </div>

              <div>
                <label className={labelCls}>Foto do local *</label>
                <VehicleReturnPhotoField
                  value={finalizeForm.locationPhoto}
                  onChange={(locationPhoto) =>
                    setFinalizeForm((current) => ({ ...current, locationPhoto }))
                  }
                  disabled={finalizeMutation.isPending}
                  emptyLabel="Tocar para fotografar o local"
                  photoAlt="Foto do local"
                />
              </div>

              <div>
                <label className={labelCls}>Observações</label>
                <textarea
                  value={finalizeForm.observations}
                  onChange={(e) =>
                    setFinalizeForm((current) => ({ ...current, observations: e.target.value }))
                  }
                  rows={3}
                  className={FORM_FIELD_TEXTAREA_CLS}
                  placeholder="Opcional"
                  disabled={finalizeMutation.isPending}
                />
              </div>

              <div>
                <label className={labelCls}>Anexar nota fiscal</label>
                <input
                  ref={invoiceInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  disabled={finalizeMutation.isPending || uploadingInvoice}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUploadInvoice(file);
                  }}
                />
                <button
                  type="button"
                  disabled={finalizeMutation.isPending || uploadingInvoice}
                  onClick={() => invoiceInputRef.current?.click()}
                  className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white text-gray-500 transition-colors hover:border-red-400 hover:bg-red-50/40 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-red-500 dark:hover:bg-red-950/20 dark:hover:text-red-400"
                >
                  <Upload className="h-6 w-6" />
                  <span className="text-sm font-medium">
                    {uploadingInvoice ? 'Enviando...' : 'Anexar NF (PDF ou imagem)'}
                  </span>
                </button>
                {finalizeForm.invoiceAttachments.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {finalizeForm.invoiceAttachments.map((item, index) => (
                      <li
                        key={`${item.url}-${index}`}
                        className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900/50"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Paperclip className="h-4 w-4 shrink-0 text-gray-400" />
                          {item.name}
                        </span>
                        <button
                          type="button"
                          disabled={finalizeMutation.isPending}
                          onClick={() =>
                            setFinalizeForm((current) => ({
                              ...current,
                              invoiceAttachments: current.invoiceAttachments.filter(
                                (_, i) => i !== index,
                              ),
                            }))
                          }
                          className="text-red-600 hover:text-red-700"
                        >
                          Remover
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  disabled={finalizeMutation.isPending}
                  onClick={() => {
                    setFinalizeRow(null);
                    setFinalizeForm(emptyFinalizeForm());
                  }}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 dark:border-red-700 dark:text-red-300"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={finalizeMutation.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {finalizeMutation.isPending ? 'Salvando...' : 'Finalizar solicitação'}
                </button>
              </div>
            </form>
          ) : null}
        </Modal>

        <Modal
          isOpen={Boolean(detailRow)}
          onClose={() => setDetailRow(null)}
          title={detailRow ? `Solicitação #${detailRow.displayNumber}` : 'Detalhes da solicitação'}
          size="lg"
        >
          {detailRow ? (
            <div className="space-y-6">
              <DetailSection title="Solicitação">
                <DetailField label="ID">{detailRow.displayNumber}</DetailField>
                <DetailField label="Status">{deliveryStatusCell(detailRow)}</DetailField>
                <DetailField label="Data e hora">
                  {formatDateTimeBr(detailRow.requestedAt, '—')}
                </DetailField>
                <DetailField label="Urgência">{urgencyLabel(detailRow.urgency)}</DetailField>
                <DetailField label="Registrado por" className="sm:col-span-2">
                  {detailValue(detailRow.creator?.name || detailRow.creator?.email)}
                </DetailField>
              </DetailSection>

              <DetailSection title="Contrato e pedidos">
                <DetailField label="Contrato">{detailValue(detailRow.contract?.name)}</DetailField>
                <DetailField label="Número da OS">
                  {detailValue(detailRow.serviceOrderNumber)}
                </DetailField>
                <DetailField label="Número da OC">
                  {detailValue(
                    detailRow.purchaseOrderNumber ?? detailRow.purchaseOrder?.orderNumber,
                  )}
                </DetailField>
                <DetailField label="ID movimento">{detailValue(detailRow.movementId)}</DetailField>
              </DetailSection>

              <DetailSection title="Fornecedor e material">
                <DetailField label="Fornecedor" className="sm:col-span-2">
                  {detailValue(detailRow.supplier?.name)}
                </DetailField>
                <DetailField label="Motorista">{detailValue(detailRow.driverName)}</DetailField>
                <DetailField label="Valor">
                  <span className="tabular-nums">{formatMoney(detailRow.value)}</span>
                </DetailField>
                <DetailField label="Insumo" className="sm:col-span-2">
                  {detailValue(detailRow.materialName)}
                </DetailField>
                <DetailField label="Anexo" className="sm:col-span-2">
                  {detailRow.materialAttachmentUrl ? (
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
                  )}
                </DetailField>
                <DetailField label="Previsão de entrega">
                  {formatDateBr(detailRow.expectedDelivery)}
                </DetailField>
              </DetailSection>

              {(detailRow.history?.trim() || detailRow.observations?.trim()) ? (
                <section className="space-y-4">
                  {detailRow.history?.trim() ? (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Histórico
                      </h3>
                      <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
                        {detailRow.history.trim()}
                      </p>
                    </div>
                  ) : null}
                  {detailRow.observations?.trim() ? (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Observações
                      </h3>
                      <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
                        {detailRow.observations.trim()}
                      </p>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {detailRow.completion ? (
                <>
                  <DetailSection title="Finalização">
                    <DetailField label="Local de recebimento">
                      {detailValue(detailRow.completion.receivingLocation)}
                    </DetailField>
                    <DetailField label="Responsável pelo recebimento">
                      {detailValue(detailRow.completion.receivingResponsible)}
                    </DetailField>
                    <DetailField label="Data e hora do recebimento">
                      {formatDateTimeBr(detailRow.completion.receivedAt, '—')}
                    </DetailField>
                    <DetailField label="Entrega">
                      {outcomeLabel(detailRow.completion.deliveryOutcome)}
                    </DetailField>
                    <DetailField label="Finalizado por">
                      {detailValue(detailRow.completion.completer.name)}
                    </DetailField>
                    {detailRow.completion.observations?.trim() ? (
                      <DetailField label="Observações da finalização" className="sm:col-span-2">
                        <span className="whitespace-pre-wrap">
                          {detailRow.completion.observations.trim()}
                        </span>
                      </DetailField>
                    ) : null}
                    {detailRow.completion.locationPhotoUrl ? (
                      <DetailField label="Foto do local" className="sm:col-span-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={absoluteUploadUrl(detailRow.completion.locationPhotoUrl)}
                          alt="Foto do local"
                          className="max-h-64 rounded-lg border border-gray-200 object-contain dark:border-gray-700"
                        />
                      </DetailField>
                    ) : null}
                    {detailRow.completion.invoiceAttachments.length > 0 ? (
                      <DetailField label="Notas fiscais" className="sm:col-span-2">
                        <ul className="space-y-1">
                          {detailRow.completion.invoiceAttachments.map((nf) => (
                            <li key={nf.id}>
                              <a
                                href={absoluteUploadUrl(nf.attachmentUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-red-600 hover:underline dark:text-red-400"
                              >
                                {nf.attachmentName ?? 'Nota fiscal'}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </DetailField>
                    ) : null}
                  </DetailSection>
                </>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setDetailRow(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-300"
                >
                  Fechar
                </button>
                {detailRow.status === 'PENDING' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailRow(null);
                      openFinalizeModal(detailRow);
                    }}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    Finalizar solicitação
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
