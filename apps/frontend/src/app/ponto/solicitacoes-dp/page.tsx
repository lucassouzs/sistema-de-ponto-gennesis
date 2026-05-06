'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ClipboardList, Eye, Filter, Loader2, Plus, RotateCcw, Search, X } from 'lucide-react';
import { ButtonSeg, DpSolicitacaoTypeFields, type DpFormRequestType } from './DpSolicitacaoTypeFields';
import { usePermissions } from '@/hooks/usePermissions';
import { buildDpRequestTimeline } from '@/lib/dpRequestTimeline';
import { COMPANIES_LIST } from '@/constants/payrollFilters';

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
type DpRequestType = DpFormRequestType;

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
  createdAt: string;
  managerApprovedAt?: string | null;
  managerApprovalComment?: string | null;
  managerRejectionReason?: string | null;
  dpFeedback?: string | null;
  dpFeedbackAt?: string | null;
  dpResponsibleNote?: string | null;
  requesterReturnComment?: string | null;
  requesterReturnedAt?: string | null;
  dpConclusionComment?: string | null;
  dpConcludedAt?: string | null;
  details?: Record<string, unknown> | null;
  statusHistory?: unknown;
};

/** Texto único de feedback no histórico: usa o feedback do DP; conclusão só se não houver feedback (evita duplicar o mesmo texto). */
function getDpHistoryFeedbackText(r: DpRequest): string | null {
  const fb = (r.dpFeedback ?? '').trim();
  const conc = (r.dpConclusionComment ?? '').trim();
  if (fb) return fb;
  if (conc) return conc;
  return null;
}

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

async function fileToDpAttachment(file: File) {
  const max = 2 * 1024 * 1024;
  if (file.size > max) throw new Error('Arquivo deve ter no máximo 2 MB');
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = fr.result as string;
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    fr.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    fr.readAsDataURL(file);
  });
  return { fileName: file.name, mimeType: file.type || 'application/octet-stream', dataBase64 };
}

const STATUS_LABELS: Record<DpRequestStatus, string> = {
  WAITING_MANAGER: 'Aguardando aprovação',
  IN_REVIEW_DP: 'Em análise',
  IN_FINANCEIRO: 'No financeiro',
  WAITING_RETURN: 'Sua pendência',
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

/** Mesmo padrão visual do botão de ações em `EmployeeList` (quadrado 9×9 com borda). */
const LIST_TABLE_ACTION_ICON_CLASS =
  'inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors';

const SENSITIVE_DP_REQUEST_TYPES = ['RESCISAO', 'ALTERACAO_FUNCAO_SALARIO'] as const;

const selectFieldCls =
  'w-full px-3 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 appearance-none focus:!outline-none focus:!ring-2 focus:!ring-red-500 dark:focus:!ring-red-400 focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-red-500 dark:focus-visible:!ring-red-400';
const inputFieldCls =
  'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:!outline-none focus:!ring-2 focus:!ring-red-500 dark:focus:!ring-red-400 focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-red-500 dark:focus-visible:!ring-red-400';

/** Polos no formulário de solicitação DP (UF); alinha com o cadastro BRASÍLIA/GOIÁS → DF/GO. */
const DP_POLO_OPTIONS = ['DF', 'GO'] as const;

function mapCostCenterPoloToFormPolo(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const u = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (u === 'DF') return 'DF';
  if (u === 'GO') return 'GO';
  if (u === 'BRASILIA' || u.includes('BRASILIA')) return 'DF';
  if (u === 'GOIAS' || u.includes('GOIAS')) return 'GO';
  return '';
}

function isDpFormPolo(v: string): v is (typeof DP_POLO_OPTIONS)[number] {
  return (DP_POLO_OPTIONS as readonly string[]).includes(v);
}

export function SolicitacoesGeraisPage() {
  const queryClient = useQueryClient();
  const { canCreateSensitiveDpRequestType, isLoading: loadingPerms } = usePermissions();
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');
  const [historyRequest, setHistoryRequest] = useState<DpRequest | null>(null);
  const historyFeedbackText = React.useMemo(
    () => (historyRequest ? getDpHistoryFeedbackText(historyRequest) : null),
    [historyRequest]
  );
  const [returnComment, setReturnComment] = useState<Record<string, string>>({});
  const router = useRouter();

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const user = userData?.data;
  const employee = user?.employee;

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: contractsResp } = useQuery({
    queryKey: ['solicitacoes-dp-contratos-elegiveis'],
    queryFn: async () => {
      const res = await api.get('/solicitacoes-dp/contratos-elegiveis');
      return res.data?.data ?? [];
    },
  });

  const contracts = contractsResp || [];

  const payrollMonthYear = React.useMemo(() => {
    const n = new Date();
    return { month: n.getMonth() + 1, year: n.getFullYear() };
  }, []);

  const { data: payrollEmpResp } = useQuery({
    queryKey: ['payroll-employees-dp', payrollMonthYear.month, payrollMonthYear.year],
    queryFn: async () => {
      const params = new URLSearchParams({
        month: String(payrollMonthYear.month),
        year: String(payrollMonthYear.year),
        limit: '500',
        page: '1',
      });
      const res = await api.get(`/payroll/employees?${params.toString()}`);
      return (res.data?.data?.employees ?? []) as { id: string; name: string }[];
    },
    enabled: !loadingUser,
  });
  const payrollEmployees = payrollEmpResp ?? [];

  const [details, setDetails] = useState<Record<string, unknown>>({});
  const [multiEmpSearch, setMultiEmpSearch] = useState('');
  const [atestadoFile, setAtestadoFile] = useState<File | null>(null);
  const [horaExtraFile, setHoraExtraFile] = useState<File | null>(null);
  const [atestadoFileName, setAtestadoFileName] = useState('');
  const [horaExtraFileName, setHoraExtraFileName] = useState('');

  const patchDetails = (p: Record<string, unknown>) => setDetails((d) => ({ ...d, ...p }));

  const setSingleEmployeeId = (id: string) => {
    setDetails((d) => ({ ...d, employeeIds: id ? [id] : [] }));
  };

  const [form, setForm] = useState<{
    urgency: DpUrgency;
    requestType: DpRequestType | '';
    prazoInicio: string;
    prazoFim: string;
    contractId: string;
    company: string;
    polo: string;
  }>({
    urgency: 'MEDIUM',
    requestType: '',
    prazoInicio: '',
    prazoFim: '',
    contractId: '',
    company: '',
    polo: '',
  });

  const resetCreateForm = () => {
    setForm((p) => ({ ...p, requestType: '', prazoInicio: '', prazoFim: '' }));
    setDetails({});
    setAtestadoFile(null);
    setHoraExtraFile(null);
    setAtestadoFileName('');
    setHoraExtraFileName('');
    setMultiEmpSearch('');
  };

  const selectableRequestTypeEntries = React.useMemo(() => {
    return Object.entries(TYPE_LABELS).filter(([k]) => {
      if ((SENSITIVE_DP_REQUEST_TYPES as readonly string[]).includes(k)) {
        return canCreateSensitiveDpRequestType(form.contractId);
      }
      return true;
    });
  }, [form.contractId, canCreateSensitiveDpRequestType]);

  React.useEffect(() => {
    if (loadingPerms) return;
    if (
      (form.requestType === 'RESCISAO' || form.requestType === 'ALTERACAO_FUNCAO_SALARIO') &&
      !canCreateSensitiveDpRequestType(form.contractId)
    ) {
      setForm((p) => ({ ...p, requestType: '', prazoInicio: '', prazoFim: '' }));
      setDetails({});
    }
  }, [form.contractId, form.requestType, canCreateSensitiveDpRequestType, loadingPerms]);

  useEffect(() => {
    if (form.requestType !== 'ADVERTENCIA_SUSPENSAO') return;
    setDetails((d) => (d.punicao ? d : { ...d, punicao: 'ADVERTENCIA' }));
  }, [form.requestType]);

  const [myStatusFilter, setMyStatusFilter] = useState<'all' | DpRequestStatus>('all');
  const [filterUrgency, setFilterUrgency] = useState<'all' | DpUrgency>('all');
  const [filterRequestType, setFilterRequestType] = useState<'all' | DpRequestType>('all');
  const [filterContractId, setFilterContractId] = useState<'all' | string>('all');
  const [mySearch, setMySearch] = useState('');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);

  const { data: myResp, isLoading: loadingMy } = useQuery({
    queryKey: ['dp-my-requests', myStatusFilter],
    queryFn: async () => {
      const res = await api.get('/solicitacoes-dp/minhas', { params: { status: myStatusFilter } });
      return res.data?.data ?? [];
    },
    enabled: !loadingUser,
  });

  const myRequests = (myResp as DpRequest[]) || [];

  const contractFilterOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of myRequests) {
      const id = r.contractId ?? r.contract?.id;
      const name = r.contract?.name?.trim();
      if (id && name) map.set(id, name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [myRequests]);

  const filteredMyRequests = myRequests.filter((r) => {
    if (filterUrgency !== 'all' && r.urgency !== filterUrgency) return false;
    if (filterRequestType !== 'all' && r.requestType !== filterRequestType) return false;
    if (filterContractId !== 'all') {
      const cid = r.contractId ?? r.contract?.id ?? '';
      if (cid !== filterContractId) return false;
    }
    const qRaw = mySearch.trim();
    if (!qRaw) return true;
    const qLower = qRaw.toLowerCase();
    if (r.displayNumber != null) {
      if (String(r.displayNumber) === qRaw) return true;
      if (/^\d+$/.test(qRaw) && r.displayNumber === Number(qRaw)) return true;
    }
    return r.id.toLowerCase() === qLower;
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.requestType) throw new Error('Selecione o tipo de solicitação');
      if (!form.contractId) throw new Error('Selecione o contrato');

      if (!form.prazoInicio || !form.prazoFim) {
        throw new Error('Informe o prazo (início e fim) em que o DP deve dar retorno sobre a solicitação');
      }

      const d: Record<string, unknown> = { ...details };

      if (form.requestType === 'ATESTADO_MEDICO') {
        if (!atestadoFile) throw new Error('Anexe o atestado médico');
        d.anexoAtestado = await fileToDpAttachment(atestadoFile);
      }
      if (form.requestType === 'HORA_EXTRA') {
        if (!horaExtraFile) throw new Error('Anexe a autorização de hora extra');
        d.anexoAutorizacao = await fileToDpAttachment(horaExtraFile);
      }

      const payload: Record<string, unknown> = {
        urgency: form.urgency,
        requestType: form.requestType,
        contractId: form.contractId,
        company: form.company || undefined,
        polo: form.polo || undefined,
        details: d,
      };
      if (form.prazoInicio) payload.prazoInicio = form.prazoInicio;
      if (form.prazoFim) payload.prazoFim = form.prazoFim;

      const res = await api.post('/solicitacoes-dp', payload);
      return res.data?.data as DpRequest;
    },
    onSuccess: async () => {
      toast.success('Solicitação DP criada com sucesso!');
      await queryClient.invalidateQueries({ queryKey: ['dp-my-requests'] });
      resetCreateForm();
      setActiveTab('list');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Erro ao criar solicitação DP');
    },
  });

  const requesterReturnMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const comment = (returnComment[id] || '').trim();
      if (!comment) throw new Error('Escreva o retorno para o DP');
      const res = await api.put(`/solicitacoes-dp/${id}/requester-return`, { comment });
      return res.data?.data as DpRequest;
    },
    onSuccess: async () => {
      toast.success('Retorno enviado para o DP');
      await queryClient.invalidateQueries({ queryKey: ['dp-my-requests'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Erro ao enviar retorno');
    },
  });

  const buildTimeline = (r: DpRequest) => buildDpRequestTimeline(r, STATUS_LABELS, formatDuration);

  if (loadingUser) {
    return (
      <Loading message="Carregando..." fullScreen size="lg" />
    );
  }

  return (
    <ProtectedRoute route="/ponto/solicitacoes-gerais">
      <MainLayout userRole={'EMPLOYEE'} userName={user?.name || ''} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Solicitações Gerais
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Crie e acompanhe solicitações gerais
            </p>
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Solicitações Gerais</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Visualize, filtre e acompanhe o andamento das solicitações.
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={mySearch}
                      onChange={(e) => setMySearch(e.target.value)}
                      placeholder="Buscar por ID..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-10 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {mySearch ? (
                      <button
                        type="button"
                        onClick={() => setMySearch('')}
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
                  <button
                    type="button"
                    onClick={() => {
                      resetCreateForm();
                      setActiveTab('new');
                    }}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Nova solicitação</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activeTab === 'new' ? (
                <Modal
                  isOpen={true}
                  onClose={() => setActiveTab('list')}
                  title="Nova solicitação"
                  size="xl"
                >
                  <div className="max-h-[75vh] overflow-y-auto overflow-x-visible px-1 pt-1">
                    <form
                      className="grid grid-cols-1 gap-4 md:grid-cols-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void createMutation.mutate();
                      }}
                    >
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1 text-gray-800 dark:text-gray-200">
                      Urgência
                    </label>
                    <div className="flex gap-2">
                      <ButtonSeg
                        active={form.urgency === 'MEDIUM'}
                        onClick={() => setForm((p) => ({ ...p, urgency: 'MEDIUM' }))}
                        label="Normal"
                      />
                      <ButtonSeg
                        active={form.urgency === 'URGENT'}
                        onClick={() => setForm((p) => ({ ...p, urgency: 'URGENT' }))}
                        label="Urgente"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Tipo de solicitação *</label>
                    <select
                      className={selectFieldCls}
                      value={form.requestType}
                      onChange={(e) => {
                        const rt = (e.target.value === '' ? '' : e.target.value) as DpRequestType | '';
                        setForm((p) => ({ ...p, requestType: rt, prazoInicio: '', prazoFim: '' }));
                        setDetails({});
                        setAtestadoFile(null);
                        setHoraExtraFile(null);
                        setAtestadoFileName('');
                        setHoraExtraFileName('');
                        setMultiEmpSearch('');
                      }}
                    >
                      <option value="">Selecione o tipo...</option>
                      {selectableRequestTypeEntries.map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <DpSolicitacaoTypeFields
                    requestType={form.requestType}
                    details={details}
                    patchDetails={patchDetails}
                    employees={payrollEmployees}
                    multiEmpSearch={multiEmpSearch}
                    setMultiEmpSearch={setMultiEmpSearch}
                    setEmployeeId={setSingleEmployeeId}
                    onAtestadoFile={(f) => {
                      setAtestadoFile(f);
                      setAtestadoFileName(f?.name ?? '');
                    }}
                    onHoraExtraFile={(f) => {
                      setHoraExtraFile(f);
                      setHoraExtraFileName(f?.name ?? '');
                    }}
                    atestadoFileName={atestadoFileName}
                    horaExtraFileName={horaExtraFileName}
                  />

                  {form.requestType &&
                    (['FERIAS', 'ATESTADO_MEDICO', 'BENEFICIOS_VIAGEM'].includes(form.requestType) ||
                      form.requestType === 'RETIFICACAO_ALOCACAO') && (
                    <div className="md:col-span-2 rounded-lg border border-dashed border-gray-200 dark:border-gray-600 p-3 text-xs text-gray-600 dark:text-gray-400">
                      {['FERIAS', 'ATESTADO_MEDICO', 'BENEFICIOS_VIAGEM'].includes(form.requestType) ? (
                        <span>
                          As datas acima são o <strong>período</strong> (férias, atestado ou viagem). Abaixo, informe o{' '}
                          <strong>prazo</strong> em que o DP deve responder — são campos diferentes.
                        </span>
                      ) : (
                        <span>
                          A data de retificação acima não substitui o prazo de retorno do DP; preencha os campos abaixo.
                        </span>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-1">Início do prazo *</label>
                    <Input
                      type="date"
                      className={inputFieldCls}
                      value={form.prazoInicio}
                      onChange={(e) => setForm((p) => ({ ...p, prazoInicio: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Fim do prazo *</label>
                    <Input
                      type="date"
                      className={inputFieldCls}
                      value={form.prazoFim}
                      onChange={(e) => setForm((p) => ({ ...p, prazoFim: e.target.value }))}
                    />
                  </div>

                  <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="min-w-0">
                      <label className="block text-sm font-medium mb-1">Contrato *</label>
                      <select
                        className={selectFieldCls}
                        value={form.contractId}
                        onChange={(e) => {
                          const id = e.target.value;
                          if (!id) {
                            setForm((p) => ({ ...p, contractId: '', company: '', polo: '' }));
                            return;
                          }
                          const c = contracts.find((x: any) => x.id === id) as
                            | { costCenter?: { company?: string | null; polo?: string | null } }
                            | undefined;
                          const cc = c?.costCenter;
                          setForm((p) => ({
                            ...p,
                            contractId: id,
                            company: cc?.company?.trim() ?? '',
                            polo: mapCostCenterPoloToFormPolo(cc?.polo),
                          }));
                        }}
                      >
                        <option value="">Selecione...</option>
                        {contracts.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className="block text-sm font-medium mb-1">Empresa</label>
                      <select
                        className={selectFieldCls}
                        value={form.company}
                        onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
                      >
                        <option value="">Selecione...</option>
                        {form.company && !COMPANIES_LIST.includes(form.company) ? (
                          <option value={form.company}>{form.company}</option>
                        ) : null}
                        {COMPANIES_LIST.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className="block text-sm font-medium mb-1">Polo</label>
                      <select
                        className={selectFieldCls}
                        value={isDpFormPolo(form.polo) ? form.polo : ''}
                        onChange={(e) => setForm((p) => ({ ...p, polo: e.target.value }))}
                      >
                        <option value="">Selecione...</option>
                        {DP_POLO_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                      <div className="md:col-span-2 flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={() => setActiveTab('list')}>
                          Cancelar
                        </Button>
                        <Button type="submit" disabled={createMutation.isPending}>
                          {createMutation.isPending ? 'Enviando...' : 'Enviar solicitação'}
                        </Button>
                      </div>
                    </form>
                  </div>
                </Modal>
              ) : (
                <div className="space-y-4">
                  {loadingMy ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-600 dark:text-gray-400">
                      <Loader2 className="h-8 w-8 shrink-0 animate-spin text-red-600 dark:text-red-400" aria-hidden />
                      <span className="text-sm font-medium">Carregando solicitações…</span>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                        <span>
                          Mostrando {filteredMyRequests.length === 0 ? 0 : 1} a {filteredMyRequests.length} de{' '}
                          {myRequests.length} solicitações
                          {mySearch.trim() || myStatusFilter !== 'all' ? (
                            <span className="text-gray-500 dark:text-gray-500"> · filtro ativo</span>
                          ) : null}
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
                              <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Setor
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
                            {filteredMyRequests.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={10}
                                  className="px-6 py-10 text-center"
                                >
                                  {myRequests.length === 0 ? (
                                    <div className="py-1">
                                      <ClipboardList
                                        className="mx-auto mb-3 h-10 w-10 text-gray-400 dark:text-gray-500"
                                        aria-hidden
                                        strokeWidth={1.25}
                                      />
                                      <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                        Nenhuma solicitação ainda.
                                      </p>
                                      <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
                                        Use <span className="font-medium text-gray-700 dark:text-gray-300">Nova solicitação</span> acima para
                                        enviar um pedido e acompanhar o andamento nesta lista.
                                      </p>
                                    </div>
                                  ) : (
                                    <span className="text-sm text-gray-500 dark:text-gray-400">
                                      Nenhuma solicitação encontrada para essa busca.
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ) : (
                              filteredMyRequests.map((r) => (
                                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                  <td className="px-3 sm:px-6 py-3 align-middle text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                                    {r.displayNumber ?? '—'}
                                  </td>
                                  <td className="px-3 sm:px-6 py-3 align-middle text-center">
                                    <span
                                      className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_ROW_BADGE[r.status]}`}
                                    >
                                      {STATUS_LABELS[r.status] ?? r.status}
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
                                  <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 max-w-[280px]">
                                    {r.contract?.name ?? '—'}
                                  </td>
                                  <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                                    {formatYmd(r.prazoInicio)}
                                  </td>
                                  <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                                    {formatYmd(r.prazoFim)}
                                  </td>
                                  <td className="px-3 sm:px-6 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300">
                                    {r.sectorSolicitante}
                                  </td>
                                  <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                                    {r.solicitanteNome}
                                  </td>
                                  <td className="px-3 sm:px-6 py-3 align-middle text-right">
                                    {r.status === 'WAITING_RETURN' ? (
                                      <div className="ml-auto max-w-[280px] space-y-2 text-left">
                                        <div className="flex justify-end">
                                          <button
                                            type="button"
                                            onClick={() => setHistoryRequest(r)}
                                            title="Ver histórico"
                                            aria-label="Ver histórico"
                                            className={LIST_TABLE_ACTION_ICON_CLASS}
                                          >
                                            <Eye className="h-4 w-4 shrink-0" strokeWidth={2} />
                                          </button>
                                        </div>
                                        <textarea
                                          value={returnComment[r.id] || ''}
                                          onChange={(e) =>
                                            setReturnComment((p) => ({ ...p, [r.id]: e.target.value }))
                                          }
                                          placeholder="Digite seu retorno para o DP..."
                                          className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-h-[88px] focus:!outline-none focus:!ring-2 focus:!ring-red-500 dark:focus:!ring-red-400"
                                        />
                                        <Button
                                          size="sm"
                                          onClick={() => requesterReturnMutation.mutate({ id: r.id })}
                                          disabled={requesterReturnMutation.isPending}
                                        >
                                          {requesterReturnMutation.isPending ? 'Enviando...' : 'Responder ao DP'}
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="flex justify-end">
                                        <button
                                          type="button"
                                          onClick={() => setHistoryRequest(r)}
                                          title="Ver histórico"
                                          aria-label="Ver histórico"
                                          className={LIST_TABLE_ACTION_ICON_CLASS}
                                        >
                                          <Eye className="h-4 w-4 shrink-0" strokeWidth={2} />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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
                        value={myStatusFilter}
                        onChange={(e) => setMyStatusFilter(e.target.value as 'all' | DpRequestStatus)}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      >
                        <option value="all">Todos</option>
                        <option value="WAITING_MANAGER">Aguardando aprovação</option>
                        <option value="IN_REVIEW_DP">Em análise</option>
                        <option value="IN_FINANCEIRO">No financeiro</option>
                        <option value="WAITING_RETURN_ACCOUNTING">Pendência contábil</option>
                        <option value="WAITING_RETURN">Sua pendência</option>
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
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
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
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
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
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
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
                    setMyStatusFilter('all');
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

        <Modal
          isOpen={!!historyRequest}
          onClose={() => setHistoryRequest(null)}
          title="Histórico da solicitação"
          size="lg"
        >
          {historyRequest && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="font-semibold">Tipo:</span> {TYPE_LABELS[historyRequest.requestType] ?? historyRequest.requestType}
                </div>
                <div>
                  <span className="font-semibold">Status atual:</span>{' '}
                  {STATUS_LABELS[historyRequest.status] ?? historyRequest.status}
                </div>
                <div>
                  <span className="font-semibold">Criada em:</span> {formatDateTime(historyRequest.createdAt)}
                </div>
                <div>
                  <span className="font-semibold">Aprovada em:</span> {formatDateTime(historyRequest.managerApprovedAt)}
                </div>
                <div>
                  <span className="font-semibold">Concluída em:</span> {formatDateTime(historyRequest.dpConcludedAt)}
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
                      <div
                        key={step.key}
                        className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm"
                      >
                        <div className="flex justify-between gap-3">
                          <div className="min-w-0">
                            <span className="font-medium">{step.title}</span>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {step.from === step.to ? (
                                formatDateTime(new Date(step.from as number).toISOString())
                              ) : (
                                <>
                                  {formatDateTime(new Date(step.from as number).toISOString())}
                                  {' → '}
                                  {step.isOngoing
                                    ? 'Em andamento'
                                    : formatDateTime(new Date(step.to as number).toISOString())}
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

              {historyFeedbackText ? (
                <div className="space-y-2 text-sm">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Feedback</h3>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 whitespace-pre-wrap break-words text-gray-700 dark:text-gray-300">
                    {historyFeedbackText}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}

export default function LegacySolicitacoesDpPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/ponto/solicitacoes-gerais');
  }, [router]);
  return <Loading message="Redirecionando..." fullScreen size="lg" />;
}

