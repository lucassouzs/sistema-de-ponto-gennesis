'use client';

import React, { useMemo, useState } from 'react';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import {
  CheckCircle,
  ClipboardList,
  Clock,
  FileText,
  Filter,
  RotateCcw,
  Search,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { buildDpRequestTimeline } from '@/lib/dpRequestTimeline';

type DpUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type DpRequestStatus =
  | 'WAITING_MANAGER'
  | 'IN_REVIEW_DP'
  | 'IN_FINANCEIRO'
  | 'WAITING_RETURN'
  | 'WAITING_RETURN_ACCOUNTING'
  | 'WAITING_RETURN_ADM_TST'
  | 'WAITING_RETURN_ENGINEERING'
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
  | 'RETIFICACAO_ALOCACAO';

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
};

function formatYmd(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
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
  CONCLUDED: 'Concluída',
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
  CONCLUDED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const DP_FEEDBACK_NEXT_OPTIONS: { value: DpDpFeedbackNextStatus; label: string }[] = [
  { value: 'IN_REVIEW_DP', label: 'Em análise' },
  { value: 'IN_FINANCEIRO', label: 'No financeiro' },
  { value: 'WAITING_RETURN_ACCOUNTING', label: 'Pendência contábil' },
  { value: 'WAITING_RETURN', label: 'Pendência colaborador' },
  { value: 'WAITING_RETURN_ADM_TST', label: 'Pendência ADM/TST' },
  { value: 'WAITING_RETURN_ENGINEERING', label: 'Pendência engenharia' },
  { value: 'CONCLUDED', label: 'Concluída' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

const CAN_DP_SEND_FEEDBACK: DpRequestStatus[] = [
  'IN_REVIEW_DP',
  'IN_FINANCEIRO',
  'WAITING_RETURN',
  'WAITING_RETURN_ACCOUNTING',
  'WAITING_RETURN_ADM_TST',
  'WAITING_RETURN_ENGINEERING',
];

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
};

const LIST_TABLE_ACTION_ICON_CLASS =
  'inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors';

export function GerenciarSolicitacoesGeraisPage() {
  const queryClient = useQueryClient();

  const [activeStatus, setActiveStatus] = useState<'all' | Exclude<DpRequestStatus, 'WAITING_MANAGER'>>('all');
  const [filterUrgency, setFilterUrgency] = useState<'all' | DpUrgency>('all');
  const [filterRequestType, setFilterRequestType] = useState<'all' | DpRequestType>('all');
  const [filterContractId, setFilterContractId] = useState<'all' | string>('all');
  const [search, setSearch] = useState('');
  const [dpFeedback, setDpFeedback] = useState<Record<string, string>>({});
  const [dpNextStatus, setDpNextStatus] = useState<Record<string, DpDpFeedbackNextStatus>>({});
  const [historyRequest, setHistoryRequest] = useState<DpRequest | null>(null);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);

  const router = useRouter();
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });
  const user = userData?.data;
  const saverName = (user?.name || '').trim();

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: resp, isLoading: loadingList } = useQuery({
    queryKey: ['dp-manage', activeStatus],
    queryFn: async () => {
      const res = await api.get('/solicitacoes-dp/gerenciar', { params: { status: activeStatus } });
      return res.data?.data ?? [];
    },
    enabled: !loadingUser,
  });

  const { data: statsResp, isLoading: loadingStats } = useQuery({
    queryKey: ['dp-manage', 'stats'],
    queryFn: async () => {
      const res = await api.get('/solicitacoes-dp/gerenciar', { params: { status: 'all' } });
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

  const filteredRequests = requests.filter((r) => {
    if (filterUrgency !== 'all' && r.urgency !== filterUrgency) return false;
    if (filterRequestType !== 'all' && r.requestType !== filterRequestType) return false;
    if (filterContractId !== 'all') {
      const cid = r.contractId ?? r.contract?.id ?? '';
      if (cid !== filterContractId) return false;
    }
    const qRaw = search.trim();
    if (!qRaw) return true;
    const qLower = qRaw.toLowerCase();
    // Só ID: número exibido (igualdade exata, aceita "01" → 1) ou UUID completo — nunca substring no UUID.
    if (r.displayNumber != null) {
      if (String(r.displayNumber) === qRaw) return true;
      if (/^\d+$/.test(qRaw) && r.displayNumber === Number(qRaw)) return true;
    }
    return r.id.toLowerCase() === qLower;
  });

  const buildTimeline = (r: DpRequest) => buildDpRequestTimeline(r, STATUS_LABELS, formatDuration);

  const feedbackMutation = useMutation({
    mutationFn: async ({
      id,
      feedback,
      nextStatus,
      responsibleNote,
    }: {
      id: string;
      feedback: string;
      nextStatus: DpDpFeedbackNextStatus;
      responsibleNote?: string;
    }) => {
      const res = await api.put(`/solicitacoes-dp/${id}/dp-feedback`, {
        feedback,
        nextStatus,
        responsibleNote: responsibleNote?.trim() || undefined,
      });
      return res.data?.data as DpRequest;
    },
    onSuccess: async (_, vars) => {
      toast.success('Feedback registrado');
      cancelRowDraft(vars.id);
      setHistoryRequest(null);
      await queryClient.invalidateQueries({ queryKey: ['dp-manage'] });
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
  };

  const submitDpFeedback = (r: DpRequest) => {
    const feedback = (dpFeedback[r.id] || '').trim();
    if (!feedback) {
      toast.error('Preencha o feedback');
      return;
    }
    const nextStatus = (dpNextStatus[r.id] ?? r.status) as DpDpFeedbackNextStatus;
    feedbackMutation.mutate({
      id: r.id,
      feedback,
      nextStatus,
      responsibleNote: saverName || undefined,
    });
  };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/gerenciar-solicitacoes-gerais">
      <MainLayout userRole={'EMPLOYEE'} userName={user?.name || ''} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Gerenciar Solicitações
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Registre retornos e altere etapas após a aprovação do gestor.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30 sm:h-12 sm:w-12">
                    <Users className="h-5 w-5 text-blue-600 dark:text-blue-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">Registros</p>
                    <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">
                      {loadingStats ? '—' : manageStats.total}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/30 sm:h-12 sm:w-12">
                    <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">Pendentes</p>
                    <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">
                      {loadingStats ? '—' : manageStats.pending}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30 sm:h-12 sm:w-12">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">Concluídas</p>
                    <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">
                      {loadingStats ? '—' : manageStats.concluded}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30 sm:h-12 sm:w-12">
                    <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">Canceladas</p>
                    <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">
                      {loadingStats ? '—' : manageStats.cancelled}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Solicitações em tramitação
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Registre retornos e altere etapas no detalhe de cada solicitação.
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por ID..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-10 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
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
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    aria-label="Abrir filtro"
                    title="Filtro"
                  >
                    <Filter className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingList ? (
                <Loading message="Carregando solicitações..." />
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {filteredRequests.length === 0 ? 0 : 1} a {filteredRequests.length} de{' '}
                      {filteredRequests.length} solicitações
                    </span>
                    <span>Página 1 de 1</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            ID
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Urgência
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Tipo
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Contrato
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Prazo início
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Prazo fim
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Solicitante
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredRequests.map((r) => {
                          return (
                            <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                              <td className="px-3 sm:px-6 py-3 align-middle text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                                {r.displayNumber ?? '—'}
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle text-center">
                                <span
                                  className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_ROW_BADGE[r.status]}`}
                                >
                                  {STATUS_LABELS[r.status]}
                                </span>
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle text-center">
                                <span
                                  className={`inline-flex items-center justify-center text-xs font-medium ${URGENCY_ROW_BADGE[r.urgency]}`}
                                >
                                  {URGENCY_LABELS[r.urgency]}
                                </span>
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                                {TYPE_LABELS[r.requestType] ?? r.requestType}
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 max-w-[220px]">
                                {r.contract?.name ?? '—'}
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                                {formatYmd(r.prazoInicio)}
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                                {formatYmd(r.prazoFim)}
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle text-sm font-medium text-gray-900 dark:text-gray-100">
                                {r.solicitanteNome}
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle text-right">
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => setHistoryRequest(r)}
                                    title="Ver detalhes e histórico"
                                    aria-label="Ver detalhes e histórico"
                                    className={LIST_TABLE_ACTION_ICON_CLASS}
                                  >
                                    <FileText className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredRequests.length === 0 && (
                          <tr>
                            <td colSpan={9} className="px-6 py-10 text-center">
                              <ClipboardList
                                className="mx-auto mb-3 h-10 w-10 text-gray-400 dark:text-gray-500"
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
                </>
              )}
            </CardContent>
          </Card>

          {isFiltersModalOpen && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center">
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
                        <select
                          value={activeStatus}
                          onChange={(e) =>
                            setActiveStatus(e.target.value as 'all' | Exclude<DpRequestStatus, 'WAITING_MANAGER'>)
                          }
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        >
                          <option value="all">Todos</option>
                          <option value="IN_REVIEW_DP">Em análise</option>
                          <option value="IN_FINANCEIRO">No financeiro</option>
                          <option value="WAITING_RETURN_ACCOUNTING">Pendência contábil</option>
                          <option value="WAITING_RETURN">Pendência colaborador</option>
                          <option value="WAITING_RETURN_ADM_TST">Pendência ADM/TST</option>
                          <option value="WAITING_RETURN_ENGINEERING">Pendência engenharia</option>
                          <option value="CONCLUDED">Concluída</option>
                          <option value="CANCELLED">Cancelada</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Urgência
                        </label>
                        <select
                          value={filterUrgency}
                          onChange={(e) => setFilterUrgency(e.target.value as 'all' | DpUrgency)}
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        >
                          <option value="all">Todas</option>
                          {(Object.keys(URGENCY_LABELS) as DpUrgency[]).map((u) => (
                            <option key={u} value={u}>
                              {URGENCY_LABELS[u]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo</label>
                        <select
                          value={filterRequestType}
                          onChange={(e) => setFilterRequestType(e.target.value as 'all' | DpRequestType)}
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        >
                          <option value="all">Todos</option>
                          {(Object.keys(TYPE_LABELS) as DpRequestType[])
                            .slice()
                            .sort((a, b) => TYPE_LABELS[a].localeCompare(TYPE_LABELS[b], 'pt-BR'))
                            .map((t) => (
                              <option key={t} value={t}>
                                {TYPE_LABELS[t]}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Contrato
                        </label>
                        <select
                          value={filterContractId}
                          onChange={(e) => setFilterContractId(e.target.value as 'all' | string)}
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        >
                          <option value="all">Todos</option>
                          {contractFilterOptions.map(([id, name]) => (
                            <option key={id} value={id}>
                              {name}
                            </option>
                          ))}
                        </select>
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
          onClose={() => setHistoryRequest(null)}
          title="Solicitação"
          size="lg"
        >
          {historyRequest && (
            <div className="max-h-[min(85vh,720px)] space-y-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">Tipo:</span>{' '}
                  {TYPE_LABELS[historyRequest.requestType] ?? historyRequest.requestType}
                </div>
                <div>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">Status atual:</span>{' '}
                  {STATUS_LABELS[historyRequest.status]}
                </div>
                <div>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">Criada em:</span>{' '}
                  {formatDateTime(historyRequest.createdAt)}
                </div>
                <div>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">Aprovada em:</span>{' '}
                  {formatDateTime(historyRequest.managerApprovedAt)}
                </div>
                <div>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">Concluída em:</span>{' '}
                  {formatDateTime(historyRequest.dpConcludedAt)}
                </div>
                <div className="sm:col-span-2">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">Contrato:</span>{' '}
                  {historyRequest.contract?.name ?? '—'}
                </div>
                <div>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">Solicitante:</span>{' '}
                  {historyRequest.solicitanteNome}
                </div>
                <div>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">Prazo:</span>{' '}
                  {formatYmd(historyRequest.prazoInicio)} à {formatYmd(historyRequest.prazoFim)}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Timeline</h3>
                <div className="space-y-2">
                  {buildTimeline(historyRequest).map((step) => {
                    const noteWithoutResponsible = (step.note || '')
                      .split(/\r?\n/)
                      .filter((line) => !/^\s*respons[aá]vel\s*:/i.test(line))
                      .join('\n')
                      .trim();
                    return (
                      <div key={step.key} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
                        <div className="flex justify-between gap-3">
                          <div className="min-w-0">
                            <span className="font-medium">{step.title}</span>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {step.from === step.to ? (
                                formatDateTime(new Date(step.from).toISOString())
                              ) : (
                                <>
                                  {formatDateTime(new Date(step.from).toISOString())}
                                  {' → '}
                                  {step.isOngoing
                                    ? 'Em andamento'
                                    : formatDateTime(new Date(step.to).toISOString())}
                                </>
                              )}
                            </div>
                            {step.actorName ? (
                              <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                <span className="font-medium text-gray-700 dark:text-gray-200">Responsável:</span>{' '}
                                {step.actorName}
                              </div>
                            ) : null}
                            {noteWithoutResponsible ? (
                              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap break-words">
                                <span className="font-medium text-gray-700 dark:text-gray-300">Obs.:</span> {noteWithoutResponsible}
                              </div>
                            ) : null}
                          </div>
                          {step.from !== step.to && (
                            <span className="text-gray-600 dark:text-gray-400 my-auto whitespace-nowrap shrink-0">
                              {step.leadTime}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {CAN_DP_SEND_FEEDBACK.includes(historyRequest.status) ? (
                <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Feedback *</h3>
                  <textarea
                    value={dpFeedback[historyRequest.id] || ''}
                    onChange={(e) => setDpFeedback((p) => ({ ...p, [historyRequest.id]: e.target.value }))}
                    placeholder="Digite o feedback..."
                    className="w-full min-h-[100px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Próxima etapa *
                    </label>
                    <select
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      value={dpNextStatus[historyRequest.id] ?? historyRequest.status}
                      onChange={(e) =>
                        setDpNextStatus((p) => ({
                          ...p,
                          [historyRequest.id]: e.target.value as DpDpFeedbackNextStatus,
                        }))
                      }
                    >
                      {DP_FEEDBACK_NEXT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Data de registro: ao salvar, será {formatDateTime(new Date().toISOString())}
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setHistoryRequest(null)}>
                      Fechar
                    </Button>
                    <Button
                      type="button"
                      onClick={() => submitDpFeedback(historyRequest)}
                      disabled={feedbackMutation.isPending}
                    >
                      {feedbackMutation.isPending ? 'Salvando...' : 'Salvar'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                  <Button type="button" variant="outline" onClick={() => setHistoryRequest(null)}>
                    Fechar
                  </Button>
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

