'use client';

import React, { useMemo, useState } from 'react';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import { useRouter } from 'next/navigation';
import {
  CheckCircle,
  Clock,
  FileText,
  Filter,
  RotateCcw,
  Search,
  Users,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { getListTableRowClassName, ListRowNavigableLabel, listTableRowClasses } from '@/components/ui/listTableUi';
import { RowActionMenuCell, RowActionMenuPortal } from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { buildDpRequestTimeline } from '@/lib/dpRequestTimeline';
import { DpRequestDetailsPreview } from '@/lib/dpRequestDetailsPreview';
import { DP_SOLICITACOES_NO_FOCUS_CLS, formatIsoDateRangeToBr } from '@/lib/dpSolicitacoesUi';
import {
  ADM_TST_MAY_SEND_FEEDBACK_STATUSES,
  ADM_TST_STATUS_LABELS,
  buildAdmTstFeedbackSelectOptions,
  buildAdmTstStatusFilterOptions,
  getAdmTstStatusLabel,
  getAdmTstStatusRowBadge,
  isAdmTstFlowStatus,
} from '@/lib/dpRequestAdmTstUi';
import { buildDpFeedbackSelectOptions, buildDpStatusFilterOptions } from '@/lib/dpRequestDpUi';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  DpRequestHistoryMetaCard,
  DpRequestHistoryModalFooter,
  DpRequestHistoryModalTabs,
  DpRequestHistorySectionCard,
  DpRequestHistoryTimeline,
  type DpRequestHistoryMetaField,
} from '@/lib/dpRequestHistoryModal';

type DpUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type DpRequestStatus =
  | 'WAITING_MANAGER'
  | 'IN_REVIEW_DP'
  | 'IN_FINANCEIRO'
  | 'WAITING_RETURN'
  | 'WAITING_RETURN_ACCOUNTING'
  | 'WAITING_RETURN_ADM_TST'
  | 'WAITING_RETURN_ENGINEERING'
  | 'WAITING_SUPPLIES'
  | 'WAITING_PAYMENT'
  | 'CONCLUDED'
  | 'CANCELLED';

/** Valores permitidos ao salvar feedback do DP (próxima etapa). */
type DpDpFeedbackNextStatus =
  | 'IN_REVIEW_DP'
  | 'IN_FINANCEIRO'
  | 'WAITING_RETURN'
  | 'WAITING_RETURN_ACCOUNTING'
  | 'WAITING_RETURN_ADM_TST'
  | 'WAITING_RETURN_ENGINEERING'
  | 'WAITING_SUPPLIES'
  | 'WAITING_PAYMENT'
  | 'CONCLUDED'
  | 'CANCELLED';
type DpRequestType =
  | 'ADMISSAO'
  | 'ADVERTENCIA_SUSPENSAO'
  | 'ALTERACAO_FUNCAO_SALARIO'
  | 'ATESTADO_MEDICO'
  | 'BENEFICIOS_VIAGEM'
  | 'FERIAS'
  | 'HORA_EXTRA'
  | 'OUTRAS_SOLICITACOES'
  | 'RESCISAO'
  | 'RETIFICACAO_ALOCACAO'
  | 'ADM_VIAGENS'
  | 'ADM_EPI_FARDAMENTO'
  | 'ADM_MANUTENCAO_ESCRITORIO'
  | 'ADM_MATERIAL_ESCRITORIO'
  | 'ADM_INFORMATICA'
  | 'ADM_TREINAMENTOS_NR'
  | 'ADM_ASOS';

type DpContractSummary = { id: string; number: string; name: string };

type DpRequest = {
  id: string;
  displayNumber?: number;
  title: string;
  status: DpRequestStatus;
  urgency: DpUrgency;
  requestType: DpRequestType;
  prazoInicio: string;
  prazoFim: string;
  sectorSolicitante: string;
  solicitanteNome: string;
  solicitanteEmail: string;
  contractId?: string | null;
  contract?: DpContractSummary | null;
  company?: string | null;
  polo?: string | null;
  managerApprovalComment?: string | null;
  managerRejectionReason?: string | null;
  managerApprovedAt?: string | null;
  dpFeedback?: string | null;
  dpFeedbackAt?: string | null;
  dpResponsibleNote?: string | null;
  requesterReturnComment?: string | null;
  requesterReturnedAt?: string | null;
  dpConclusionComment?: string | null;
  dpConcludedAt?: string | null;
  createdAt: string;
  details?: Record<string, unknown> | null;
  statusHistory?: unknown;
  employee?: { costCenter?: string | null } | null;
};

function formatDateTime(iso?: string | null) {
  return formatDateTimeBr(iso, '—');
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '0 min';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}min`);
  return parts.join(' ');
}

const STATUS_LABELS: Record<DpRequestStatus, string> = {
  WAITING_MANAGER: 'Aguardando aprovação',
  IN_REVIEW_DP: 'Em análise',
  IN_FINANCEIRO: 'No financeiro',
  WAITING_RETURN: 'Pendência colaborador',
  WAITING_RETURN_ACCOUNTING: 'Pendência contábil',
  WAITING_RETURN_ADM_TST: 'Pendência ADM/TST',
  WAITING_RETURN_ENGINEERING: 'Pendência engenharia',
  WAITING_SUPPLIES: 'Aguardando setor de suprimentos',
  WAITING_PAYMENT: 'Aguardando pagamento',
  CONCLUDED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

const STATUS_ROW_BADGE: Record<DpRequestStatus, string> = {
  WAITING_MANAGER: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  IN_REVIEW_DP: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  IN_FINANCEIRO: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  WAITING_RETURN: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  WAITING_RETURN_ACCOUNTING: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  WAITING_RETURN_ADM_TST: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  WAITING_RETURN_ENGINEERING: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  WAITING_SUPPLIES: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  WAITING_PAYMENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  CONCLUDED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const DP_FEEDBACK_SELECT_OPTIONS = buildDpFeedbackSelectOptions();
const ADM_TST_FEEDBACK_SELECT_OPTIONS = buildAdmTstFeedbackSelectOptions();
const DP_STATUS_FILTER_OPTIONS = buildDpStatusFilterOptions();
const ADM_TST_STATUS_FILTER_OPTIONS = buildAdmTstStatusFilterOptions();

const CAN_DP_SEND_FEEDBACK: DpRequestStatus[] = [
  'IN_REVIEW_DP',
  'IN_FINANCEIRO',
  'WAITING_RETURN',
  'WAITING_RETURN_ACCOUNTING',
  'WAITING_RETURN_ADM_TST',
  'WAITING_RETURN_ENGINEERING',
];

const CAN_ADM_TST_SEND_FEEDBACK: DpRequestStatus[] = [...ADM_TST_MAY_SEND_FEEDBACK_STATUSES];

const URGENCY_LABELS: Record<DpUrgency, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

const URGENCY_ROW_BADGE: Record<DpUrgency, string> = {
  LOW: 'text-yellow-800 dark:text-yellow-300',
  MEDIUM: 'text-yellow-800 dark:text-yellow-300',
  HIGH: 'text-red-700 dark:text-red-300',
  URGENT: 'text-red-700 dark:text-red-300',
};

const TYPE_LABELS: Record<DpRequestType, string> = {
  ADMISSAO: 'Admissão',
  ADVERTENCIA_SUSPENSAO: 'Medida disciplinar',
  ALTERACAO_FUNCAO_SALARIO: 'Alteração de função/salário',
  ATESTADO_MEDICO: 'Atestado médico',
  BENEFICIOS_VIAGEM: 'Benefícios de viagem',
  FERIAS: 'Férias',
  HORA_EXTRA: 'Hora extra',
  OUTRAS_SOLICITACOES: 'Outras solicitações',
  RESCISAO: 'Rescisão',
  RETIFICACAO_ALOCACAO: 'Retificação de alocação',
  ADM_VIAGENS: 'Viagens',
  ADM_EPI_FARDAMENTO: "EPI's e fardamento",
  ADM_MANUTENCAO_ESCRITORIO: 'Manutenção do escritório',
  ADM_MATERIAL_ESCRITORIO: 'Material de escritório',
  ADM_INFORMATICA: 'Informática',
  ADM_TREINAMENTOS_NR: "Treinamentos e NR's",
  ADM_ASOS: "ASO's",
};

const DP_URGENCY_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todas' },
  ...(Object.keys(URGENCY_LABELS) as DpUrgency[]).map((u) => ({
    value: u,
    label: URGENCY_LABELS[u],
  })),
]);

const DP_TYPE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos' },
  ...(Object.keys(TYPE_LABELS) as DpRequestType[])
    .filter((t) => !t.startsWith('ADM_'))
    .slice()
    .sort((a, b) => TYPE_LABELS[a].localeCompare(TYPE_LABELS[b], 'pt-BR'))
    .map((t) => ({ value: t, label: TYPE_LABELS[t] })),
]);

const ADM_TST_TYPE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos' },
  ...(Object.keys(TYPE_LABELS) as DpRequestType[])
    .filter((t) => t.startsWith('ADM_'))
    .slice()
    .sort((a, b) => TYPE_LABELS[a].localeCompare(TYPE_LABELS[b], 'pt-BR'))
    .map((t) => ({ value: t, label: TYPE_LABELS[t] })),
]);

export type GerenciarSolicitacoesScope = 'DP' | 'ADM_TST';

const MANAGE_SCOPE_CONFIG: Record<
  GerenciarSolicitacoesScope,
  {
    route: string;
    apiPath: string;
    queryKeyPrefix: string;
    pageTitle: string;
    pageSubtitle: string;
    pendingListSubtitle: string;
    concludedListSubtitle: string;
    typeFilterOptions: ReturnType<typeof labeledToSelectOptions>;
    statusFilterOptions: ReturnType<typeof labeledToSelectOptions>;
    feedbackSelectOptions: typeof DP_FEEDBACK_SELECT_OPTIONS;
    canSendFeedbackStatuses: DpRequestStatus[];
  }
> = {
  DP: {
    route: '/ponto/gerenciar-solicitacoes-gerais',
    apiPath: '/solicitacoes-dp/gerenciar',
    queryKeyPrefix: 'dp-manage-dp',
    pageTitle: 'Gerenciar Solicitações',
    pageSubtitle: 'Registre retornos e altere etapas após a aprovação do gestor.',
    pendingListSubtitle: 'Solicitações em tramitação após a aprovação do gestor.',
    concludedListSubtitle: 'Histórico de solicitações finalizadas pelo DP.',
    typeFilterOptions: DP_TYPE_FILTER_OPTIONS,
    statusFilterOptions: DP_STATUS_FILTER_OPTIONS,
    feedbackSelectOptions: DP_FEEDBACK_SELECT_OPTIONS,
    canSendFeedbackStatuses: CAN_DP_SEND_FEEDBACK,
  },
  ADM_TST: {
    route: '/ponto/gerenciar-solicitacoes-adm-tst',
    apiPath: '/solicitacoes-dp/gerenciar-adm-tst',
    queryKeyPrefix: 'dp-manage-adm-tst',
    pageTitle: 'Gerenciar Solicitações',
    pageSubtitle: 'Registre retornos e altere etapas das solicitações administrativas.',
    pendingListSubtitle: 'Solicitações ADM/TST em tramitação.',
    concludedListSubtitle: 'Histórico de solicitações ADM/TST finalizadas.',
    typeFilterOptions: ADM_TST_TYPE_FILTER_OPTIONS,
    statusFilterOptions: ADM_TST_STATUS_FILTER_OPTIONS,
    feedbackSelectOptions: ADM_TST_FEEDBACK_SELECT_OPTIONS,
    canSendFeedbackStatuses: CAN_ADM_TST_SEND_FEEDBACK,
  },
};

type ManageCardFilter = 'all' | 'pending' | 'CONCLUDED' | 'CANCELLED';

const MANAGE_CARD_LIST_CONFIG: Record<
  ManageCardFilter,
  {
    title: string;
    subtitle: string;
    Icon: LucideIcon;
    iconBg: string;
    iconColor: string;
  }
> = {
  all: {
    title: 'Todas as Solicitações',
    subtitle: 'Registre retornos e altere etapas no detalhe de cada solicitação.',
    Icon: Users,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  pending: {
    title: 'Solicitações Pendentes',
    subtitle: 'Solicitações em tramitação após a aprovação do gestor.',
    Icon: Clock,
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  CONCLUDED: {
    title: 'Solicitações Finalizadas',
    subtitle: 'Histórico de solicitações finalizadas pelo DP.',
    Icon: CheckCircle,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  CANCELLED: {
    title: 'Solicitações Canceladas',
    subtitle: 'Histórico de solicitações canceladas.',
    Icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
};

const MANAGE_STAT_CARDS: {
  filter: ManageCardFilter;
  label: string;
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
  countKey: keyof { total: number; pending: number; concluded: number; cancelled: number };
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
    filter: 'CONCLUDED',
    label: 'Finalizadas',
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

export function GerenciarSolicitacoesGeraisPage({
  scope = 'DP',
}: {
  scope?: GerenciarSolicitacoesScope;
}) {
  const scopeConfig = MANAGE_SCOPE_CONFIG[scope];
  const queryClient = useQueryClient();

  const [cardFilter, setCardFilter] = useState<ManageCardFilter>('pending');
  const [activeStatus, setActiveStatus] = useState<'all' | Exclude<DpRequestStatus, 'WAITING_MANAGER'>>('all');
  const [filterUrgency, setFilterUrgency] = useState<'all' | DpUrgency>('all');
  const [filterRequestType, setFilterRequestType] = useState<'all' | DpRequestType>('all');
  const [filterContractId, setFilterContractId] = useState<'all' | string>('all');
  const [search, setSearch] = useState('');
  const [dpFeedback, setDpFeedback] = useState<Record<string, string>>({});
  const [dpNextStatus, setDpNextStatus] = useState<Record<string, DpDpFeedbackNextStatus>>({});
  const [dpCancellationReason, setDpCancellationReason] = useState<Record<string, string>>({});
  const [historyRequest, setHistoryRequest] = useState<DpRequest | null>(null);
  const [historyModalTab, setHistoryModalTab] = useState<'detalhes' | 'timeline'>('detalhes');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);

  const openHistoryRequest = (r: DpRequest) => {
    setHistoryModalTab('detalhes');
    setHistoryRequest(r);
  };

  const closeHistoryRequest = () => {
    setHistoryRequest(null);
    setHistoryModalTab('detalhes');
  };

  const router = useRouter();
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });
  const user = userData?.data;
  const saverName = (user?.name || '').trim();

  const detailPayrollMonthYear = React.useMemo(() => {
    const src = historyRequest?.createdAt;
    if (!src) {
      const n = new Date();
      return { month: n.getMonth() + 1, year: n.getFullYear() };
    }
    const d = new Date(src);
    if (Number.isNaN(d.getTime())) {
      const n = new Date();
      return { month: n.getMonth() + 1, year: n.getFullYear() };
    }
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }, [historyRequest?.createdAt]);

  const { data: payrollEmpForDetail } = useQuery({
    queryKey: [
      'payroll-employees-gerenciar-dp-detalhe',
      detailPayrollMonthYear.month,
      detailPayrollMonthYear.year,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        month: String(detailPayrollMonthYear.month),
        year: String(detailPayrollMonthYear.year),
        limit: '500',
        page: '1',
      });
      const res = await api.get(`/payroll/employees?${params.toString()}`);
      return (res.data?.data?.employees ?? []) as { id: string; name: string }[];
    },
    enabled: !loadingUser && !!historyRequest,
  });

  const employeeNameByIdForDetail = React.useMemo(() => {
    const list = payrollEmpForDetail ?? [];
    return new Map(list.map((e) => [e.id, e.name]));
  }, [payrollEmpForDetail]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: resp, isLoading: loadingList } = useQuery({
    queryKey: [scopeConfig.queryKeyPrefix, cardFilter],
    queryFn: async () => {
      const statusParam = cardFilter === 'pending' || cardFilter === 'all' ? 'all' : cardFilter;
      const res = await api.get(scopeConfig.apiPath, { params: { status: statusParam } });
      let data = (res.data?.data ?? []) as DpRequest[];
      if (cardFilter === 'pending') {
        data = data.filter((r) => r.status !== 'CONCLUDED' && r.status !== 'CANCELLED');
      }
      return data;
    },
    enabled: !loadingUser,
  });

  const { data: statsResp, isLoading: loadingStats } = useQuery({
    queryKey: [scopeConfig.queryKeyPrefix, 'stats'],
    queryFn: async () => {
      const res = await api.get(scopeConfig.apiPath, { params: { status: 'all' } });
      return res.data?.data ?? [];
    },
    enabled: !loadingUser,
  });

  const requests = (resp as DpRequest[]) || [];

  const manageStats = useMemo(() => {
    const list = (statsResp as DpRequest[]) || [];
    const concluded = list.filter((r) => r.status === 'CONCLUDED').length;
    const cancelled = list.filter((r) => r.status === 'CANCELLED').length;
    const pending = list.length - concluded - cancelled;
    return { total: list.length, pending, concluded, cancelled };
  }, [statsResp]);

  const contractFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of requests) {
      const id = r.contractId ?? r.contract?.id;
      const name = r.contract?.name?.trim();
      if (id && name) map.set(id, name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [requests]);

  const contractFilterSelectOptions = useMemo(
    () => [
      { value: 'all', label: 'Todos', searchText: 'Todos' },
      ...contractFilterOptions.map(([id, name]) => ({
        value: id,
        label: name,
        searchText: name,
      })),
    ],
    [contractFilterOptions]
  );

  const filteredRequests = requests.filter((r) => {
    if (activeStatus !== 'all' && r.status !== activeStatus) return false;
    if (filterUrgency !== 'all' && r.urgency !== filterUrgency) return false;
    if (filterRequestType !== 'all' && r.requestType !== filterRequestType) return false;
    if (filterContractId !== 'all') {
      const cid = r.contractId ?? r.contract?.id ?? '';
      if (cid !== filterContractId) return false;
    }
    const qRaw = search.trim();
    if (!qRaw) return true;
    const qLower = qRaw.toLowerCase();
    if (r.displayNumber != null) {
      if (String(r.displayNumber) === qRaw) return true;
      if (/^\d+$/.test(qRaw) && r.displayNumber === Number(qRaw)) return true;
    }
    return r.id.toLowerCase() === qLower;
  });

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(filteredRequests);

  const getCostCenterLabel = (r: DpRequest): string | null => {
    const fromDetails = typeof r.details?.costCenter === 'string' ? r.details.costCenter.trim() : '';
    if (fromDetails) return fromDetails;
    const fromEmployee = typeof r.employee?.costCenter === 'string' ? r.employee.costCenter.trim() : '';
    return fromEmployee || null;
  };

  const getContratoColunaLabel = (r: DpRequest): string => {
    if (r.requestType === 'ATESTADO_MEDICO') return getCostCenterLabel(r) || '—';
    return r.contract?.name ?? '—';
  };

  const statusLabelsForScope = useMemo(
    () =>
      scope === 'ADM_TST'
        ? { ...STATUS_LABELS, ...ADM_TST_STATUS_LABELS }
        : STATUS_LABELS,
    [scope]
  );

  const buildTimeline = (r: DpRequest) =>
    buildDpRequestTimeline(r, statusLabelsForScope, formatDuration);

  const getStatusLabel = (status: DpRequestStatus) => {
    if (scope === 'ADM_TST' && isAdmTstFlowStatus(status)) {
      return getAdmTstStatusLabel(status);
    }
    return STATUS_LABELS[status];
  };

  const getStatusRowBadge = (status: DpRequestStatus) => {
    if (scope === 'ADM_TST' && isAdmTstFlowStatus(status)) {
      return getAdmTstStatusRowBadge(status);
    }
    return STATUS_ROW_BADGE[status];
  };

  const feedbackMutation = useMutation({
    mutationFn: async ({
      id,
      feedback,
      nextStatus,
      responsibleNote,
      cancellationReason,
    }: {
      id: string;
      feedback: string;
      nextStatus: DpDpFeedbackNextStatus;
      responsibleNote?: string;
      cancellationReason?: string;
    }) => {
      const res = await api.put(`/solicitacoes-dp/${id}/dp-feedback`, {
        feedback,
        nextStatus,
        responsibleNote: responsibleNote?.trim() || undefined,
        cancellationReason: cancellationReason?.trim() || undefined,
      });
      return res.data?.data as DpRequest;
    },
    onSuccess: async (_, vars) => {
      toast.success('Feedback registrado');
      cancelRowDraft(vars.id);
      closeHistoryRequest();
      await queryClient.invalidateQueries({ queryKey: [scopeConfig.queryKeyPrefix] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || err?.message || 'Erro'),
  });

  const cancelRowDraft = (id: string) => {
    setDpFeedback((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
    setDpNextStatus((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
    setDpCancellationReason((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
  };

  const submitDpFeedback = (r: DpRequest) => {
    const feedback = (dpFeedback[r.id] || '').trim();
    if (!feedback) {
      toast.error('Preencha as observações');
      return;
    }
    const nextStatus = (dpNextStatus[r.id] ?? r.status) as DpDpFeedbackNextStatus;
    const cancellationReason =
      nextStatus === 'CANCELLED' ? (dpCancellationReason[r.id] || '').trim() : undefined;
    if (nextStatus === 'CANCELLED' && !cancellationReason) {
      toast.error('Informe o motivo do cancelamento');
      return;
    }
    feedbackMutation.mutate({
      id: r.id,
      feedback,
      nextStatus,
      responsibleNote: saverName || undefined,
      cancellationReason,
    });
  };

  const buildHistoryMetaFields = (r: DpRequest): DpRequestHistoryMetaField[] => [
    {
      label: 'Nº da solicitação',
      value: r.displayNumber != null ? String(r.displayNumber) : '—',
    },
    {
      label: 'Tipo',
      value: TYPE_LABELS[r.requestType] ?? r.requestType,
    },
    {
      label: 'Status',
      value: (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getStatusRowBadge(r.status)}`}
        >
          {getStatusLabel(r.status)}
        </span>
      ),
    },
    { label: 'Solicitante', value: r.solicitanteNome },
    { label: 'Contrato', value: r.contract?.name ?? '—' },
    {
      label: 'Prazo',
      value: formatIsoDateRangeToBr(r.prazoInicio, r.prazoFim),
    },
    { label: 'Criada em', value: formatDateTime(r.createdAt) },
    ...(scope === 'ADM_TST'
      ? []
      : [{ label: 'Aprovada em', value: formatDateTime(r.managerApprovedAt) }]),
    { label: 'Finalizada em', value: formatDateTime(r.dpConcludedAt) },
  ];

  const selectCardFilter = (filter: ManageCardFilter) => {
    setCardFilter(filter);
    setActiveStatus('all');
  };

  const listHeader = MANAGE_CARD_LIST_CONFIG[cardFilter];
  const ListHeaderIcon = listHeader.Icon;
  const listSubtitle =
    cardFilter === 'pending'
      ? scopeConfig.pendingListSubtitle
      : cardFilter === 'CONCLUDED'
        ? scopeConfig.concludedListSubtitle
        : listHeader.subtitle;
  const hasActiveModalFilter =
    activeStatus !== 'all' ||
    filterUrgency !== 'all' ||
    filterRequestType !== 'all' ||
    filterContractId !== 'all';

  const hideTableColumns = !loadingList && filteredRequests.length === 0;

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route={scopeConfig.route}>
      <MainLayout userRole={'EMPLOYEE'} userName={user?.name || ''} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              {scopeConfig.pageTitle}
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              {scopeConfig.pageSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 2xl:grid-cols-4">
            {MANAGE_STAT_CARDS.map((card) => (
              <FilterStatCard
                key={card.filter}
                label={card.label}
                count={manageStats[card.countKey]}
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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                    <ListHeaderIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {listHeader.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{listSubtitle}</p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por ID..."
                      className={`h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-10 text-sm font-medium text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${DP_SOLICITACOES_NO_FOCUS_CLS}`}
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        aria-label="Limpar busca"
                        title="Limpar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFiltersModalOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasActiveModalFilter
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={hasActiveModalFilter ? 'Filtro (ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveModalFilter ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingList ? (
                <Loading message="Carregando solicitações..." />
              ) : (
                <>
                  {!hideTableColumns && (
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {filteredRequests.length === 0 ? 0 : 1} a {filteredRequests.length} de{' '}
                      {filteredRequests.length} solicitações
                    </span>
                    <span>Página 1 de 1</span>
                  </div>
                  )}
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      {!hideTableColumns && (
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            ID
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Tipo
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Urgência
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Contrato
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Prazo
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Solicitante
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Status
                          </th>
                          <th className={listTableRowClasses.actionTh}>Ação</th>
                        </tr>
                      </thead>
                      )}
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredRequests.map((r) => {
                          return (
                            <tr
                              key={r.id}
                              onClick={() => openHistoryRequest(r)}
                              className={getListTableRowClassName(true)}
                            >
                              <td className="px-3 sm:px-6 py-3 align-middle text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                                <ListRowNavigableLabel className="font-medium tabular-nums">
                                  {r.displayNumber ?? '—'}
                                </ListRowNavigableLabel>
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300">
                                {TYPE_LABELS[r.requestType] ?? r.requestType}
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle text-center">
                                <span
                                  className={`inline-flex items-center justify-center text-xs font-medium ${URGENCY_ROW_BADGE[r.urgency]}`}
                                >
                                  {URGENCY_LABELS[r.urgency]}
                                </span>
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300 max-w-[220px]">
                                {getContratoColunaLabel(r)}
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                {formatIsoDateRangeToBr(r.prazoInicio, r.prazoFim)}
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300">
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="font-medium text-gray-900 dark:text-gray-100">
                                    {r.solicitanteNome || '—'}
                                  </span>
                                  {r.sectorSolicitante?.trim() ? (
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      {r.sectorSolicitante}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle text-center">
                                <span
                                  className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium ${getStatusRowBadge(r.status)}`}
                                >
                                  {getStatusLabel(r.status)}
                                </span>
                              </td>
                              <RowActionMenuCell
                                isOpen={isRowMenuOpen(r.id)}
                                onToggle={(e) =>
                                  toggleRowActionMenu(r.id, e.currentTarget as HTMLButtonElement)
                                }
                              />
                            </tr>
                          );
                        })}
                        {filteredRequests.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-6 py-10 text-center">
                              <ListHeaderIcon
                                className={`mx-auto mb-3 h-10 w-10 ${listHeader.iconColor} opacity-60`}
                                aria-hidden
                                strokeWidth={1.25}
                              />
                              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                Nenhuma solicitação encontrada
                              </p>
                              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Ajuste os filtros ou aguarde novas solicitações.
                              </p>
                            </td>
                          </tr>
                        )}
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
                      extraItems={[
                        {
                          label: 'Ver detalhes',
                          onClick: () => openHistoryRequest(rowForActionMenu),
                          icon: (
                            <FileText className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                          ),
                        },
                      ]}
                    />
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          {isFiltersModalOpen && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40" onClick={() => setIsFiltersModalOpen(false)} />
              <div className="relative mx-4 w-full max-w-3xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
                  <button
                    type="button"
                    onClick={() => setIsFiltersModalOpen(false)}
                    className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    aria-label="Fechar filtros"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Status
                        </label>
                        <SingleSelectSearchDropdown
                          value={activeStatus}
                          onChange={(v) =>
                            setActiveStatus(v as 'all' | Exclude<DpRequestStatus, 'WAITING_MANAGER'>)
                          }
                          options={scopeConfig.statusFilterOptions}
                          allowEmpty={false}
                          placeholder="Todos"
                          searchPlaceholder="Pesquisar..."
                          noFocusRing
                          className={DP_SOLICITACOES_NO_FOCUS_CLS}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Urgência
                        </label>
                        <StringSingleSelectDropdown
                          value={filterUrgency}
                          onChange={(v) => setFilterUrgency(v as 'all' | DpUrgency)}
                          options={DP_URGENCY_FILTER_OPTIONS}
                          allowEmpty={false}
                          className={DP_SOLICITACOES_NO_FOCUS_CLS}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo</label>
                        <StringSingleSelectDropdown
                          value={filterRequestType}
                          onChange={(v) => setFilterRequestType(v as 'all' | DpRequestType)}
                          options={scopeConfig.typeFilterOptions}
                          allowEmpty={false}
                          className={DP_SOLICITACOES_NO_FOCUS_CLS}
                        />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Contrato
                        </label>
                        <StringSingleSelectDropdown
                          value={filterContractId}
                          onChange={(v) => setFilterContractId(v as 'all' | string)}
                          options={contractFilterSelectOptions}
                          allowEmpty={false}
                          className={DP_SOLICITACOES_NO_FOCUS_CLS}
                        />
                        {contractFilterOptions.length === 0 && (
                          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                            Nenhum contrato na lista atual — altere o status ou aguarde novas solicitações.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveStatus('all');
                      setFilterUrgency('all');
                      setFilterRequestType('all');
                      setFilterContractId('all');
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Limpar filtros
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFiltersModalOpen(false)}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <Modal
          isOpen={!!historyRequest}
          onClose={closeHistoryRequest}
          title="Solicitação"
          size="lg"
        >
          {historyRequest && (
            <div className="space-y-5">
              <DpRequestHistoryModalTabs
                activeTab={historyModalTab}
                onTabChange={setHistoryModalTab}
              />

              {historyModalTab === 'detalhes' ? (
                <div className="space-y-4">
                  <DpRequestHistoryMetaCard fields={buildHistoryMetaFields(historyRequest)} />

                  <DpRequestDetailsPreview
                    requestType={historyRequest.requestType}
                    details={historyRequest.details}
                    employeeNameById={employeeNameByIdForDetail}
                  />

                  {scopeConfig.canSendFeedbackStatuses.includes(historyRequest.status) ? (
                    <DpRequestHistorySectionCard
                      title={scope === 'ADM_TST' ? 'Feedback ADM/TST' : 'Registrar feedback'}
                    >
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                            Observações *
                          </label>
                          <textarea
                            value={dpFeedback[historyRequest.id] || ''}
                            onChange={(e) =>
                              setDpFeedback((p) => ({ ...p, [historyRequest.id]: e.target.value }))
                            }
                            placeholder="Digite as observações..."
                            className={`w-full min-h-[100px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${DP_SOLICITACOES_NO_FOCUS_CLS}`}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                            Feedback *
                          </label>
                          <SingleSelectSearchDropdown
                            value={dpNextStatus[historyRequest.id] ?? historyRequest.status}
                            onChange={(value) =>
                              setDpNextStatus((p) => ({
                                ...p,
                                [historyRequest.id]: value as DpDpFeedbackNextStatus,
                              }))
                            }
                            options={scopeConfig.feedbackSelectOptions}
                            allowEmpty={false}
                            placeholder="Selecione o feedback..."
                            searchPlaceholder="Pesquisar..."
                            noFocusRing
                          />
                        </div>
                        {(dpNextStatus[historyRequest.id] ?? historyRequest.status) === 'CANCELLED' ? (
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                              Motivo do cancelamento *
                            </label>
                            <textarea
                              value={dpCancellationReason[historyRequest.id] || ''}
                              onChange={(e) =>
                                setDpCancellationReason((p) => ({
                                  ...p,
                                  [historyRequest.id]: e.target.value,
                                }))
                              }
                              placeholder="Informe o motivo do cancelamento..."
                              className={`w-full min-h-[88px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${DP_SOLICITACOES_NO_FOCUS_CLS}`}
                            />
                          </div>
                        ) : null}
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          Data de registro: ao salvar, será {formatDateTime(new Date().toISOString())}
                        </p>
                      </div>
                    </DpRequestHistorySectionCard>
                  ) : null}

                  <DpRequestHistoryModalFooter>
                    <Button type="button" variant="outline" onClick={closeHistoryRequest}>
                      Fechar
                    </Button>
                    {scopeConfig.canSendFeedbackStatuses.includes(historyRequest.status) ? (
                      <Button
                        type="button"
                        onClick={() => submitDpFeedback(historyRequest)}
                        disabled={feedbackMutation.isPending}
                      >
                        {feedbackMutation.isPending ? 'Salvando...' : 'Salvar'}
                      </Button>
                    ) : null}
                  </DpRequestHistoryModalFooter>
                </div>
              ) : (
                <div className="space-y-4">
                  <DpRequestHistoryTimeline
                    steps={buildTimeline(historyRequest)}
                    formatDateTime={formatDateTime}
                  />
                  <DpRequestHistoryModalFooter>
                    <Button type="button" variant="outline" onClick={closeHistoryRequest}>
                      Fechar
                    </Button>
                  </DpRequestHistoryModalFooter>
                </div>
              )}
            </div>
          )}
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}

export default function LegacyGerenciarSolicitacoesDpPage() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace('/ponto/gerenciar-solicitacoes-gerais');
  }, [router]);
  return <Loading message="Redirecionando..." fullScreen size="lg" />;
}

