'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { getListTableRowClassName, ListRowNavigableLabel, listTableRowClasses, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { RowActionMenuCell, RowActionMenuPortal } from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import { ArrowLeft, ChevronRight, ClipboardList, FileText, Filter, MailPlus, MoreVertical, Plus, RotateCcw, Search, Users, X, type LucideIcon } from 'lucide-react';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { ButtonSeg, DpSolicitacaoTypeFields, type DpFormRequestType } from './DpSolicitacaoTypeFields';
import {
  AdmTstSolicitacaoTypeFields,
  ADM_TYPE_LABELS,
  isDepartamentoPessoalSector,
  type AdmFormRequestType,
} from './AdmTstSolicitacaoTypeFields';
import { getInitialSolicitacaoDetails } from './dpSolicitacaoInitialDetails';
import { usePermissions } from '@/hooks/usePermissions';
import { buildDpRequestTimeline } from '@/lib/dpRequestTimeline';
import { DpRequestDetailsPreview } from '@/lib/dpRequestDetailsPreview';
import { DP_SOLICITACOES_NO_FOCUS_CLS, formatIsoDateRangeToBr } from '@/lib/dpSolicitacoesUi';
import {
  ADM_TST_STATUS_LABELS,
  buildAdmTstStatusFilterOptions,
  getAdmTstStatusLabel,
  getAdmTstStatusRowBadge,
  isAdmTstFlowStatus,
} from '@/lib/dpRequestAdmTstUi';
import {
  DpRequestHistoryMetaCard,
  DpRequestHistoryModalFooter,
  DpRequestHistoryModalTabs,
  DpRequestHistorySectionCard,
  DpRequestHistoryTimeline,
  type DpRequestHistoryMetaField,
} from '@/lib/dpRequestHistoryModal';
import { COMPANIES_LIST } from '@/constants/payrollFilters';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

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
type DpRequestType = DpFormRequestType | AdmFormRequestType;
type CreateTargetDepartment = 'DP' | 'ADM_TST' | null;

const CREATE_TARGET_DEPARTMENT_LABELS: Record<'DP' | 'ADM_TST', string> = {
  DP: 'Departamento Pessoal',
  ADM_TST: 'ADM/TST',
};

const CREATE_TARGET_DEPARTMENT_OPTIONS: Array<{
  value: 'DP' | 'ADM_TST';
  label: string;
  icon: LucideIcon;
}> = [
  {
    value: 'DP',
    label: CREATE_TARGET_DEPARTMENT_LABELS.DP,
    icon: Users,
  },
  {
    value: 'ADM_TST',
    label: CREATE_TARGET_DEPARTMENT_LABELS.ADM_TST,
    icon: ClipboardList,
  },
];

const createTargetDepartmentButtonCls =
  'group flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-[border-color,background-color,box-shadow] hover:border-red-300 hover:bg-red-50/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/35 dark:border-gray-600 dark:bg-gray-800/70 dark:hover:border-red-700/70 dark:hover:bg-red-950/25';

type DpContractSummary = { id: string; number: string; name: string };
type DpCostCenterSummary = {
  id: string;
  name: string;
  code?: string | null;
  company?: string | null;
  polo?: string | null;
};

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
  costCenterId?: string | null;
  costCenter?: DpCostCenterSummary | null;
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

const DP_TYPE_LABELS: Record<DpFormRequestType, string> = {
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

const TYPE_LABELS: Record<DpRequestType, string> = {
  ...DP_TYPE_LABELS,
  ...ADM_TYPE_LABELS,
};

function getRequestDestinationLabel(requestType: DpRequestType): string {
  return requestType.startsWith('ADM_')
    ? CREATE_TARGET_DEPARTMENT_LABELS.ADM_TST
    : CREATE_TARGET_DEPARTMENT_LABELS.DP;
}

function isAdmTstRequestType(requestType: DpRequestType): boolean {
  return requestType.startsWith('ADM_');
}

function getRequestContratoLabel(r: {
  costCenter?: { name?: string | null; code?: string | null } | null;
  contract?: { name?: string | null } | null;
}): string {
  return r.costCenter?.name?.trim() || r.costCenter?.code?.trim() || r.contract?.name?.trim() || '—';
}

type DestinationCardFilter = 'all' | 'DP' | 'ADM_TST';

const DESTINATION_LIST_CONFIG: Record<
  DestinationCardFilter,
  {
    title: string;
    subtitle: string;
    Icon: LucideIcon;
    iconBg: string;
    iconColor: string;
  }
> = {
  all: {
    title: 'Minhas Solicitações',
    subtitle: 'Suas solicitações e as dos centros de custo liberados para você.',
    Icon: MailPlus,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  DP: {
    title: 'Departamento Pessoal',
    subtitle: 'Solicitações enviadas ao Departamento Pessoal.',
    Icon: Users,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
  ADM_TST: {
    title: 'ADM/TST',
    subtitle: 'Solicitações enviadas ao ADM/TST.',
    Icon: ClipboardList,
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
  },
};

const DESTINATION_STAT_CARDS: {
  filter: DestinationCardFilter;
  label: string;
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
  countKey: keyof { total: number; dp: number; admTst: number };
}[] = [
  {
    filter: 'all',
    label: 'Registros',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: MailPlus,
    countKey: 'total',
  },
  {
    filter: 'DP',
    label: 'Departamento Pessoal',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: Users,
    countKey: 'dp',
  },
  {
    filter: 'ADM_TST',
    label: 'ADM/TST',
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    Icon: ClipboardList,
    countKey: 'admTst',
  },
];

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

async function attachOptionalDocumentosToItems(
  items: Record<string, unknown>[],
  files: Record<number, File>
) {
  const out = [...items];
  for (let i = 0; i < out.length; i++) {
    const file = files[i];
    if (!file) continue;
    out[i] = { ...out[i], anexoDocumento: await fileToDpAttachment(file) };
  }
  return out;
}

function setIndexedFileState(
  setFiles: React.Dispatch<React.SetStateAction<Record<number, File>>>,
  setNames: React.Dispatch<React.SetStateAction<Record<number, string>>>,
  index: number,
  file: File | null
) {
  setFiles((prev) => {
    const next = { ...prev };
    if (file) next[index] = file;
    else delete next[index];
    return next;
  });
  setNames((prev) => {
    const next = { ...prev };
    if (file) next[index] = file.name;
    else delete next[index];
    return next;
  });
}

const STATUS_LABELS: Record<DpRequestStatus, string> = {
  WAITING_MANAGER: 'Aguardando aprovação',
  IN_REVIEW_DP: 'Em análise',
  IN_FINANCEIRO: 'No financeiro',
  WAITING_RETURN: 'Sua pendência',
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

const SENSITIVE_DP_REQUEST_TYPES = ['RESCISAO', 'ALTERACAO_FUNCAO_SALARIO'] as const;

const inputFieldCls =
  `border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${DP_SOLICITACOES_NO_FOCUS_CLS}`;

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

function resolveCostCenterPoloRegion(costCenter?: {
  polo?: string | null;
  name?: string | null;
  code?: string | null;
}): 'DF' | 'GO' | null {
  const fromPolo = mapCostCenterPoloToFormPolo(costCenter?.polo);
  if (fromPolo === 'DF' || fromPolo === 'GO') return fromPolo;

  const combined = [costCenter?.name, costCenter?.code]
    .map((v) =>
      (v ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
    )
    .filter(Boolean)
    .join(' ');

  if (!combined) return null;
  if (/\bDF\b/.test(combined) || combined.includes('BRASILIA') || combined.includes('DISTRITO FEDERAL')) {
    return 'DF';
  }
  if (/\bGO\b/.test(combined) || combined.includes('GOIAS')) {
    return 'GO';
  }
  return null;
}

function isDpFormPolo(v: string): v is (typeof DP_POLO_OPTIONS)[number] {
  return (DP_POLO_OPTIONS as readonly string[]).includes(v);
}

export function SolicitacoesGeraisPage() {
  const queryClient = useQueryClient();
  const { canCreateSensitiveDpRequestType, isLoading: loadingPerms } = usePermissions();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createTargetDepartment, setCreateTargetDepartment] = useState<CreateTargetDepartment>(null);
  const [historyRequest, setHistoryRequest] = useState<DpRequest | null>(null);
  const [historyModalTab, setHistoryModalTab] = useState<'detalhes' | 'timeline'>('detalhes');
  const historyFeedbackText = React.useMemo(
    () => (historyRequest ? getDpHistoryFeedbackText(historyRequest) : null),
    [historyRequest]
  );
  const [returnComment, setReturnComment] = useState<Record<string, string>>({});

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
  const employee = user?.employee;

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: costCentersResp } = useQuery({
    queryKey: ['solicitacoes-dp-centros-custo'],
    queryFn: async () => {
      const res = await api.get('/solicitacoes-dp/centros-custo-elegiveis');
      return res.data?.data ?? [];
    },
  });

  const eligibleCostCenters = (costCentersResp ?? []) as Array<{
    id: string;
    name: string;
    code?: string;
    company?: string | null;
    polo?: string | null;
    contractIds?: string[];
  }>;

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
      return (res.data?.data?.employees ?? []) as Array<{
        id: string;
        name: string;
        cpf?: string;
        profilePhotoUrl?: string | null;
        department?: string;
        position?: string;
        company?: string | null;
        polo?: string | null;
        costCenter?: string | null;
        birthDate?: string | null;
      }>;
    },
    enabled: !loadingUser,
  });
  const payrollEmployees = payrollEmpResp ?? [];

  const employeeNameByIdForDetail = React.useMemo(
    () => new Map(payrollEmployees.map((e) => [e.id, e.name])),
    [payrollEmployees]
  );

  const [details, setDetails] = useState<Record<string, unknown>>({});
  const [atestadoFiles, setAtestadoFiles] = useState<Record<number, File>>({});
  const [horaExtraFiles, setHoraExtraFiles] = useState<Record<number, File>>({});
  const [admissaoDocumentoFiles, setAdmissaoDocumentoFiles] = useState<Record<number, File>>({});
  const [rescisaoDocumentoFiles, setRescisaoDocumentoFiles] = useState<Record<number, File>>({});
  const [atestadoFileNames, setAtestadoFileNames] = useState<Record<number, string>>({});
  const [horaExtraFileNames, setHoraExtraFileNames] = useState<Record<number, string>>({});
  const [admissaoDocumentoFileNames, setAdmissaoDocumentoFileNames] = useState<Record<number, string>>(
    {}
  );
  const [rescisaoDocumentoFileNames, setRescisaoDocumentoFileNames] = useState<Record<number, string>>(
    {}
  );

  const patchDetails = (p: Record<string, unknown>) => setDetails((d) => ({ ...d, ...p }));

  const [form, setForm] = useState<{
    urgency: DpUrgency;
    requestType: DpRequestType | '';
    prazoInicio: string;
    prazoFim: string;
    costCenterId: string;
    company: string;
    polo: string;
  }>({
    urgency: 'MEDIUM',
    requestType: '',
    prazoInicio: '',
    prazoFim: '',
    costCenterId: '',
    company: '',
    polo: '',
  });

  const resetCreateForm = () => {
    setCreateTargetDepartment(null);
    setForm((p) => ({
      ...p,
      requestType: '',
      prazoInicio: '',
      prazoFim: '',
      costCenterId: '',
      company: '',
      polo: '',
    }));
    setDetails({});
    setAtestadoFiles({});
    setHoraExtraFiles({});
    setAdmissaoDocumentoFiles({});
    setRescisaoDocumentoFiles({});
    setAtestadoFileNames({});
    setHoraExtraFileNames({});
    setAdmissaoDocumentoFileNames({});
    setRescisaoDocumentoFileNames({});
  };

  const closeCreateModal = () => {
    resetCreateForm();
    setIsCreateModalOpen(false);
  };

  const backToDepartmentSelection = () => {
    setCreateTargetDepartment(null);
    setForm((p) => ({ ...p, requestType: '', prazoInicio: '', prazoFim: '' }));
    setDetails({});
    setAtestadoFiles({});
    setHoraExtraFiles({});
    setAdmissaoDocumentoFiles({});
    setRescisaoDocumentoFiles({});
    setAtestadoFileNames({});
    setHoraExtraFileNames({});
    setAdmissaoDocumentoFileNames({});
    setRescisaoDocumentoFileNames({});
  };

  const selectedCostCenterId = form.costCenterId;

  const selectableRequestTypeEntries = React.useMemo(() => {
    if (!createTargetDepartment) return [];
    const source =
      createTargetDepartment === 'ADM_TST'
        ? (Object.entries(ADM_TYPE_LABELS) as [AdmFormRequestType, string][])
        : (Object.entries(DP_TYPE_LABELS) as [DpFormRequestType, string][]);
    return source.filter(([k]) => {
      if (createTargetDepartment === 'ADM_TST') {
        if (k === 'ADM_ASOS') {
          return isDepartamentoPessoalSector(employee?.department);
        }
        return true;
      }
      if (createTargetDepartment !== 'DP') return true;
      if ((SENSITIVE_DP_REQUEST_TYPES as readonly string[]).includes(k)) {
        const selected = eligibleCostCenters.find((c) => c.id === selectedCostCenterId);
        return canCreateSensitiveDpRequestType(selectedCostCenterId, selected?.contractIds);
      }
      return true;
    });
  }, [
    createTargetDepartment,
    selectedCostCenterId,
    canCreateSensitiveDpRequestType,
    employee?.department,
    eligibleCostCenters,
  ]);

  React.useEffect(() => {
    if (form.requestType === 'ADM_ASOS' && !isDepartamentoPessoalSector(employee?.department)) {
      setForm((p) => ({ ...p, requestType: '' }));
      setDetails({});
    }
  }, [form.requestType, employee?.department]);

  React.useEffect(() => {
    if (loadingPerms) return;
    if (
      (form.requestType === 'RESCISAO' || form.requestType === 'ALTERACAO_FUNCAO_SALARIO') &&
      !canCreateSensitiveDpRequestType(
        selectedCostCenterId,
        eligibleCostCenters.find((c) => c.id === selectedCostCenterId)?.contractIds
      )
    ) {
      setForm((p) => ({ ...p, requestType: '', prazoInicio: '', prazoFim: '' }));
      setDetails({});
    }
  }, [
    selectedCostCenterId,
    form.requestType,
    canCreateSensitiveDpRequestType,
    loadingPerms,
    eligibleCostCenters,
  ]);

  useEffect(() => {
    if (form.requestType !== 'ADVERTENCIA_SUSPENSAO') return;
    setDetails((d) => {
      const medidas = Array.isArray(d.medidas) ? (d.medidas as Record<string, unknown>[]) : [];
      if (!medidas.length || medidas[0]?.punicao) return d;
      return {
        ...d,
        medidas: [{ ...medidas[0], punicao: 'ADVERTENCIA' }, ...medidas.slice(1)],
      };
    });
  }, [form.requestType]);

  useEffect(() => {
    if (form.requestType !== 'ADM_VIAGENS') return;
    setDetails((d) => {
      const viagens = Array.isArray(d.viagens) ? (d.viagens as Record<string, unknown>[]) : [];
      if (!viagens.length || viagens[0]?.pedagio) return d;
      return {
        ...d,
        viagens: [{ ...viagens[0], pedagio: 'NAO' }, ...viagens.slice(1)],
      };
    });
  }, [form.requestType]);

  const [myStatusFilter, setMyStatusFilter] = useState<'all' | DpRequestStatus>('all');
  const [destinationFilter, setDestinationFilter] = useState<DestinationCardFilter>('all');
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

  const { data: statsResp, isLoading: loadingStats } = useQuery({
    queryKey: ['dp-my-requests', 'stats'],
    queryFn: async () => {
      const res = await api.get('/solicitacoes-dp/minhas', { params: { status: 'all' } });
      return res.data?.data ?? [];
    },
    enabled: !loadingUser,
  });

  const myRequests = (myResp as DpRequest[]) || [];

  const destinationStats = React.useMemo(() => {
    const list = (statsResp as DpRequest[]) || [];
    const admTst = list.filter((r) => isAdmTstRequestType(r.requestType)).length;
    const dp = list.length - admTst;
    return { total: list.length, dp, admTst };
  }, [statsResp]);

  const handleDestinationFilter = (filter: DestinationCardFilter) => {
    setDestinationFilter(filter);
    setMyStatusFilter('all');
    setFilterUrgency('all');
    setFilterRequestType('all');
    setFilterContractId('all');
    setMySearch('');
  };

  const contractFilterOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of myRequests) {
      const id = r.costCenterId ?? r.costCenter?.id ?? r.contractId ?? r.contract?.id;
      const name = getRequestContratoLabel(r);
      if (id && name && name !== '—') map.set(id, name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [myRequests]);

  const requestTypeSelectOptions = React.useMemo<MultiSelectSearchOption[]>(
    () =>
      selectableRequestTypeEntries.map(([value, label]) => ({
        value,
        label,
        searchText: label,
      })),
    [selectableRequestTypeEntries]
  );

  const contractSelectOptions = React.useMemo<MultiSelectSearchOption[]>(
    () =>
      eligibleCostCenters.map((c) => ({
        value: c.id,
        label: c.name,
        searchText: [c.name, c.code].filter(Boolean).join(' '),
      })),
    [eligibleCostCenters]
  );

  const companySelectOptions = React.useMemo<MultiSelectSearchOption[]>(() => {
    const items = COMPANIES_LIST.map((c) => ({ value: c, label: c, searchText: c }));
    if (form.company && !COMPANIES_LIST.includes(form.company)) {
      return [{ value: form.company, label: form.company, searchText: form.company }, ...items];
    }
    return items;
  }, [form.company]);

  const selectedCostCenter = React.useMemo(
    () => eligibleCostCenters.find((x) => x.id === selectedCostCenterId),
    [eligibleCostCenters, selectedCostCenterId]
  );

  const costCenterPoloRegion = React.useMemo(
    () =>
      resolveCostCenterPoloRegion({
        polo: selectedCostCenter?.polo,
        name: selectedCostCenter?.name,
        code: selectedCostCenter?.code,
      }),
    [selectedCostCenter]
  );

  const showPoloField = costCenterPoloRegion !== null;

  const poloSelectOptions = React.useMemo<MultiSelectSearchOption[]>(() => {
    if (!costCenterPoloRegion) return [];
    return [{ value: costCenterPoloRegion, label: costCenterPoloRegion, searchText: costCenterPoloRegion }];
  }, [costCenterPoloRegion]);

  const myStatusFilterOptions = React.useMemo<MultiSelectSearchOption[]>(() => {
    if (destinationFilter === 'ADM_TST') {
      return buildAdmTstStatusFilterOptions();
    }
    const dpStatuses = (Object.entries(STATUS_LABELS) as [DpRequestStatus, string][]).filter(
      ([value]) => value !== 'WAITING_MANAGER'
    );
    return [
      { value: 'all', label: 'Todos' },
      ...dpStatuses.map(([value, label]) => ({
        value,
        label,
        searchText: label,
      })),
    ];
  }, [destinationFilter]);

  const filterUrgencyOptions = React.useMemo<MultiSelectSearchOption[]>(
    () => [
      { value: 'all', label: 'Todas' },
      ...(Object.keys(URGENCY_LABELS) as DpUrgency[]).map((value) => ({
        value,
        label: URGENCY_LABELS[value],
        searchText: URGENCY_LABELS[value],
      })),
    ],
    []
  );

  const filterRequestTypeOptions = React.useMemo<MultiSelectSearchOption[]>(
    () => [
      { value: 'all', label: 'Todos' },
      ...(Object.keys(TYPE_LABELS) as DpRequestType[])
        .slice()
        .sort((a, b) => TYPE_LABELS[a].localeCompare(TYPE_LABELS[b], 'pt-BR'))
        .map((value) => ({
          value,
          label: TYPE_LABELS[value],
          searchText: TYPE_LABELS[value],
        })),
    ],
    []
  );

  const filterContractSelectOptions = React.useMemo<MultiSelectSearchOption[]>(
    () => [
      { value: 'all', label: 'Todos' },
      ...contractFilterOptions.map(([id, name]) => ({
        value: id,
        label: name,
        searchText: name,
      })),
    ],
    [contractFilterOptions]
  );

  const handleContractChange = (id: string) => {
    if (!id) {
      setForm((p) => ({ ...p, costCenterId: '', company: '', polo: '' }));
      return;
    }
    const center = eligibleCostCenters.find((x) => x.id === id);
    const poloRegion = resolveCostCenterPoloRegion({
      polo: center?.polo,
      name: center?.name,
      code: center?.code,
    });
    setForm((p) => ({
      ...p,
      costCenterId: id,
      company: center?.company?.trim() ?? '',
      polo: poloRegion ?? '',
    }));
  };

  const filteredMyRequests = myRequests.filter((r) => {
    if (destinationFilter === 'DP' && isAdmTstRequestType(r.requestType)) return false;
    if (destinationFilter === 'ADM_TST' && !isAdmTstRequestType(r.requestType)) return false;
    if (filterUrgency !== 'all' && r.urgency !== filterUrgency) return false;
    if (filterRequestType !== 'all' && r.requestType !== filterRequestType) return false;
    if (filterContractId !== 'all') {
      const cid = r.costCenterId ?? r.costCenter?.id ?? r.contractId ?? r.contract?.id ?? '';
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

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(filteredMyRequests);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.requestType) throw new Error('Selecione o tipo de solicitação');
      if (!form.costCenterId) throw new Error('Selecione o contrato');

      if (!form.prazoInicio || !form.prazoFim) {
        throw new Error('Informe o prazo (início e fim) em que o DP deve dar retorno sobre a solicitação');
      }

      const d: Record<string, unknown> = { ...details };

      if (form.requestType === 'ATESTADO_MEDICO') {
        const atestados = Array.isArray(d.atestados)
          ? ([...(d.atestados as Record<string, unknown>[])] as Record<string, unknown>[])
          : [];
        if (!atestados.length) throw new Error('Informe ao menos um atestado');
        for (let i = 0; i < atestados.length; i++) {
          const file = atestadoFiles[i];
          if (!file) throw new Error(`Anexe o atestado do item ${i + 1}`);
          atestados[i] = {
            ...atestados[i],
            anexoAtestado: await fileToDpAttachment(file),
          };
        }
        d.atestados = atestados;
      }
      if (form.requestType === 'HORA_EXTRA') {
        const horasExtras = Array.isArray(d.horasExtras)
          ? ([...(d.horasExtras as Record<string, unknown>[])] as Record<string, unknown>[])
          : [];
        if (!horasExtras.length) throw new Error('Informe ao menos uma solicitação de hora extra');
        for (let i = 0; i < horasExtras.length; i++) {
          const file = horaExtraFiles[i];
          if (!file) throw new Error(`Anexe a autorização de hora extra do item ${i + 1}`);
          horasExtras[i] = {
            ...horasExtras[i],
            anexoAutorizacao: await fileToDpAttachment(file),
          };
        }
        d.horasExtras = horasExtras;
      }
      if (form.requestType === 'ADMISSAO') {
        const candidatos = Array.isArray(d.candidatos)
          ? ([...(d.candidatos as Record<string, unknown>[])] as Record<string, unknown>[])
          : [];
        if (!candidatos.length) throw new Error('Informe ao menos um candidato');
        d.candidatos = await attachOptionalDocumentosToItems(candidatos, admissaoDocumentoFiles);
      }
      if (form.requestType === 'RESCISAO') {
        const rescisoes = Array.isArray(d.rescisoes)
          ? ([...(d.rescisoes as Record<string, unknown>[])] as Record<string, unknown>[])
          : [];
        if (!rescisoes.length) throw new Error('Informe ao menos uma rescisão');
        d.rescisoes = await attachOptionalDocumentosToItems(rescisoes, rescisaoDocumentoFiles);
      }
      const payload: Record<string, unknown> = {
        urgency: form.urgency,
        requestType: form.requestType,
        costCenterId: form.costCenterId,
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
      toast.success('Solicitação criada com sucesso!');
      await queryClient.invalidateQueries({ queryKey: ['dp-my-requests'] });
      closeCreateModal();
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

  const getStatusLabel = (r: DpRequest) => {
    if (isAdmTstRequestType(r.requestType) && isAdmTstFlowStatus(r.status)) {
      return getAdmTstStatusLabel(r.status);
    }
    return STATUS_LABELS[r.status] ?? r.status;
  };

  const getStatusRowBadge = (r: DpRequest) => {
    if (isAdmTstRequestType(r.requestType) && isAdmTstFlowStatus(r.status)) {
      return getAdmTstStatusRowBadge(r.status);
    }
    return STATUS_ROW_BADGE[r.status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  };

  const buildTimeline = (r: DpRequest) => {
    const labels = isAdmTstRequestType(r.requestType)
      ? { ...STATUS_LABELS, ...ADM_TST_STATUS_LABELS }
      : STATUS_LABELS;
    return buildDpRequestTimeline(r, labels, formatDuration);
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
      label: 'Destino',
      value: getRequestDestinationLabel(r.requestType),
    },
    {
      label: 'Status',
      value: (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getStatusRowBadge(r)}`}
        >
          {getStatusLabel(r)}
        </span>
      ),
    },
    { label: 'Setor', value: r.sectorSolicitante || '—' },
    { label: 'Contrato', value: getRequestContratoLabel(r) },
    {
      label: 'Período de atendimento',
      value: formatIsoDateRangeToBr(r.prazoInicio, r.prazoFim),
    },
    { label: 'Criada em', value: formatDateTime(r.createdAt) },
    ...(isAdmTstRequestType(r.requestType)
      ? []
      : [{ label: 'Aprovada em', value: formatDateTime(r.managerApprovedAt) }]),
    { label: 'Finalizada em', value: formatDateTime(r.dpConcludedAt) },
  ];

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/solicitacoes-gerais">
        <MainLayout userRole={'EMPLOYEE'} userName={user?.name || ''} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  const listHeader = DESTINATION_LIST_CONFIG[destinationFilter];
  const ListHeaderIcon = listHeader.Icon;

  return (
    <ProtectedRoute route="/ponto/solicitacoes-gerais">
      <MainLayout userRole={'EMPLOYEE'} userName={user?.name || ''} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Solicitações Internas
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Crie e acompanhe pedidos para Departamento Pessoal e ADM/TST
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {DESTINATION_STAT_CARDS.map((card) => (
              <FilterStatCard
                key={card.filter}
                label={card.label}
                count={destinationStats[card.countKey]}
                icon={card.Icon}
                iconBg={card.iconBg}
                iconColor={card.iconColor}
                isActive={destinationFilter === card.filter}
                loading={loadingStats}
                onClick={() => handleDestinationFilter(card.filter)}
              />
            ))}
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                    <ListHeaderIcon className={`h-5 w-5 sm:w-6 sm:h-6 ${listHeader.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {listHeader.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{listHeader.subtitle}</p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={mySearch}
                      onChange={(e) => setMySearch(e.target.value)}
                      placeholder="Buscar por ID..."
                      className={`h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-10 text-sm font-medium text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${DP_SOLICITACOES_NO_FOCUS_CLS}`}
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
                      setIsCreateModalOpen(true);
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
              <div className="space-y-4">
                  {loadingMy ? (
                    <CadastroListLoading message="Carregando solicitações…" />
                  ) : myRequests.length === 0 ? (
                    <div className="py-10 text-center">
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
                  ) : filteredMyRequests.length === 0 ? (
                    <div className="py-10 text-center">
                      <ListHeaderIcon
                        className={`mx-auto mb-3 h-10 w-10 ${listHeader.iconColor} opacity-60`}
                        aria-hidden
                        strokeWidth={1.25}
                      />
                      <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        Nenhuma solicitação encontrada
                      </p>
                      <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
                        {destinationFilter !== 'all' &&
                        !mySearch.trim() &&
                        myStatusFilter === 'all' &&
                        filterUrgency === 'all' &&
                        filterRequestType === 'all' &&
                        filterContractId === 'all'
                          ? `Não há solicitações enviadas ao ${listHeader.title} ainda.`
                          : 'Ajuste os filtros ou aguarde novas solicitações.'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                        <span>
                          Mostrando 1 a {filteredMyRequests.length} de {myRequests.length} solicitações
                          {mySearch.trim() ||
                          myStatusFilter !== 'all' ||
                          filterUrgency !== 'all' ||
                          filterRequestType !== 'all' ||
                          filterContractId !== 'all' ? (
                            <span className="text-gray-500 dark:text-gray-500"> · filtro ativo</span>
                          ) : null}
                        </span>
                        <span>Página 1 de 1</span>
                      </div>
                      <div className="table-scroll">
                        <table className="w-full text-sm">
                          <thead className="border-b border-gray-200 dark:border-gray-700">
                            <tr>
                              <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                ID
                              </th>
                              <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Solicitante
                              </th>
                              <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Contrato
                              </th>
                              <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Urgência
                              </th>
                              <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Tipo
                              </th>
                              {destinationFilter === 'all' ? (
                                <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                  Destino
                                </th>
                              ) : null}
                              <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Período de atendimento
                              </th>
                              <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Status
                              </th>
                              <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Criado em
                              </th>
                              <th className={listTableRowClasses.actionTh}>Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                            {filteredMyRequests.map((r) => (
                                <tr
                                  key={r.id}
                                  onClick={() => openHistoryRequest(r)}
                                  className={getListTableRowClassName(true)}
                                >
                                  <td className="px-3 py-3 align-middle text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                                    <ListRowNavigableLabel className="font-medium tabular-nums">
                                      {r.displayNumber ?? '—'}
                                    </ListRowNavigableLabel>
                                  </td>
                                  <td className="max-w-[180px] truncate px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                                    {r.solicitanteNome || '—'}
                                  </td>
                                  <td className="max-w-[200px] px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300">
                                    {getRequestContratoLabel(r)}
                                  </td>
                                  <td className="px-3 py-3 align-middle text-center">
                                    <span
                                      className={`inline-flex items-center justify-center text-xs font-medium ${URGENCY_ROW_BADGE[r.urgency]}`}
                                    >
                                      {URGENCY_LABELS[r.urgency]}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 align-middle text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {TYPE_LABELS[r.requestType] ?? r.requestType}
                                  </td>
                                  {destinationFilter === 'all' ? (
                                    <td className="whitespace-nowrap px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300">
                                      {getRequestDestinationLabel(r.requestType)}
                                    </td>
                                  ) : null}
                                  <td className="whitespace-nowrap px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300">
                                    {formatIsoDateRangeToBr(r.prazoInicio, r.prazoFim)}
                                  </td>
                                  <td className="px-3 py-3 align-middle text-center">
                                    <span
                                      className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium ${getStatusRowBadge(r)}`}
                                    >
                                      {getStatusLabel(r)}
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300">
                                    {formatDateTime(r.createdAt)}
                                  </td>
                                  {r.status === 'WAITING_RETURN' ? (
                                    <td
                                      className={`${listTableRowClasses.actionTd} text-right`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="ml-auto max-w-[280px] space-y-2 text-left">
                                        <div className="flex justify-end">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleRowActionMenu(r.id, e.currentTarget as HTMLButtonElement);
                                            }}
                                            className={rowActionMenuButtonClass(isRowMenuOpen(r.id))}
                                            aria-label="Menu de ações"
                                            aria-expanded={isRowMenuOpen(r.id)}
                                            aria-haspopup="menu"
                                          >
                                            <MoreVertical className="h-4 w-4" />
                                          </button>
                                        </div>
                                        <textarea
                                          value={returnComment[r.id] || ''}
                                          onChange={(e) =>
                                            setReturnComment((p) => ({ ...p, [r.id]: e.target.value }))
                                          }
                                          placeholder="Digite seu retorno para o DP..."
                                          className={`w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-h-[88px] ${DP_SOLICITACOES_NO_FOCUS_CLS}`}
                                        />
                                        <Button
                                          size="sm"
                                          onClick={() => requesterReturnMutation.mutate({ id: r.id })}
                                          disabled={requesterReturnMutation.isPending}
                                        >
                                          {requesterReturnMutation.isPending ? 'Enviando...' : 'Responder ao DP'}
                                        </Button>
                                      </div>
                                    </td>
                                  ) : (
                                    <RowActionMenuCell
                                      isOpen={isRowMenuOpen(r.id)}
                                      onToggle={(e) =>
                                        toggleRowActionMenu(r.id, e.currentTarget as HTMLButtonElement)
                                      }
                                    />
                                  )}
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
                </div>
            </CardContent>
          </Card>
        </div>

        <Modal
          isOpen={isCreateModalOpen}
          onClose={closeCreateModal}
          scrollContent={!!createTargetDepartment}
          title={
            createTargetDepartment ? (
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={backToDepartmentSelection}
                  className="shrink-0 rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h3 className="min-w-0 truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Nova solicitação - {CREATE_TARGET_DEPARTMENT_LABELS[createTargetDepartment]}
                </h3>
              </div>
            ) : (
              'Nova solicitação'
            )
          }
          size={createTargetDepartment ? 'xl' : 'md'}
          contentOverflowVisible
          elevated
        >
          {!createTargetDepartment ? (
            <div className="space-y-5">
              <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                Selecione o destino da solicitação
              </p>
              <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
                {CREATE_TARGET_DEPARTMENT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setCreateTargetDepartment(option.value);
                        setForm((p) => ({ ...p, requestType: '', prazoInicio: '', prazoFim: '' }));
                        setDetails({});
                      }}
                      className={createTargetDepartmentButtonCls}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-100 transition-colors group-hover:bg-red-200 dark:bg-red-950/55 dark:group-hover:bg-red-900/45">
                        <Icon className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{option.label}</p>
                      </div>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-red-500/40 transition-colors group-hover:text-red-500 dark:text-red-400/40 dark:group-hover:text-red-400"
                        aria-hidden
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
          <form
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void createMutation.mutate();
            }}
          >
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-800 dark:text-gray-200">
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:col-span-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Início do prazo *
                </label>
                <DatePickerField
                  value={form.prazoInicio}
                  onChange={(prazoInicio) => setForm((p) => ({ ...p, prazoInicio }))}
                  placeholder="dd/mm/aaaa"
                  noFocusRing
                  aria-label="Início do prazo"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Fim do prazo *
                </label>
                <DatePickerField
                  value={form.prazoFim}
                  onChange={(prazoFim) => setForm((p) => ({ ...p, prazoFim }))}
                  placeholder="dd/mm/aaaa"
                  noFocusRing
                  aria-label="Fim do prazo"
                />
              </div>
            </div>

            <div
              className={`grid grid-cols-1 gap-4 md:col-span-2 ${
                showPoloField ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
              }`}
            >
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-medium">Contrato *</label>
                <SingleSelectSearchDropdown
                  value={form.costCenterId}
                  onChange={handleContractChange}
                  options={contractSelectOptions}
                  allowEmpty
                  placeholder="Selecionar contrato..."
                  searchPlaceholder="Pesquisar..."
                  noFocusRing
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-medium">Empresa</label>
                <SingleSelectSearchDropdown
                  value={form.company}
                  onChange={(company) => setForm((p) => ({ ...p, company }))}
                  options={companySelectOptions}
                  allowEmpty
                  placeholder="Selecione a empresa..."
                  searchPlaceholder="Pesquisar..."
                  noFocusRing
                />
              </div>
              {showPoloField ? (
                <div className="min-w-0">
                  <label className="mb-1 block text-sm font-medium">Polo</label>
                  <SingleSelectSearchDropdown
                    value={isDpFormPolo(form.polo) ? form.polo : costCenterPoloRegion ?? ''}
                    onChange={(polo) => setForm((p) => ({ ...p, polo }))}
                    options={poloSelectOptions}
                    allowEmpty={false}
                    placeholder="Selecione o polo..."
                    searchPlaceholder="Pesquisar..."
                    noFocusRing
                  />
                </div>
              ) : null}
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Tipo de solicitação *</label>
              <SingleSelectSearchDropdown
                value={form.requestType}
                onChange={(rt) => {
                  setForm((p) => ({
                    ...p,
                    requestType: rt as DpRequestType | '',
                  }));
                  setDetails(
                    getInitialSolicitacaoDetails(rt as DpFormRequestType | AdmFormRequestType)
                  );
                  setAtestadoFiles({});
                  setHoraExtraFiles({});
                  setAdmissaoDocumentoFiles({});
                  setRescisaoDocumentoFiles({});
                  setAtestadoFileNames({});
                  setHoraExtraFileNames({});
                  setAdmissaoDocumentoFileNames({});
                  setRescisaoDocumentoFileNames({});
                }}
                options={requestTypeSelectOptions}
                allowEmpty
                placeholder="Selecione o tipo..."
                searchPlaceholder="Pesquisar..."
                noFocusRing
              />
            </div>

            {createTargetDepartment === 'DP' ? (
              <DpSolicitacaoTypeFields
                requestType={form.requestType as DpFormRequestType | ''}
                details={details}
                patchDetails={patchDetails}
                employees={payrollEmployees}
                onAtestadoFile={(index, f) => {
                  setIndexedFileState(setAtestadoFiles, setAtestadoFileNames, index, f);
                }}
                onHoraExtraFile={(index, f) => {
                  setIndexedFileState(setHoraExtraFiles, setHoraExtraFileNames, index, f);
                }}
                onAdmissaoDocumentoFile={(index, f) => {
                  setIndexedFileState(
                    setAdmissaoDocumentoFiles,
                    setAdmissaoDocumentoFileNames,
                    index,
                    f
                  );
                }}
                onRescisaoDocumentoFile={(index, f) => {
                  setIndexedFileState(
                    setRescisaoDocumentoFiles,
                    setRescisaoDocumentoFileNames,
                    index,
                    f
                  );
                }}
                atestadoFileNames={atestadoFileNames}
                horaExtraFileNames={horaExtraFileNames}
                admissaoDocumentoFileNames={admissaoDocumentoFileNames}
                rescisaoDocumentoFileNames={rescisaoDocumentoFileNames}
              />
            ) : (
              <AdmTstSolicitacaoTypeFields
                requestType={form.requestType as AdmFormRequestType | ''}
                details={details}
                patchDetails={patchDetails}
                employees={payrollEmployees}
              />
            )}

            <div className="flex justify-end gap-3 md:col-span-2">
              <Button type="button" variant="outline" onClick={closeCreateModal}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Enviando...' : 'Enviar solicitação'}
              </Button>
            </div>
          </form>
          )}
        </Modal>

        {isFiltersModalOpen && (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
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
                        value={myStatusFilter}
                        onChange={(value) => setMyStatusFilter(value as 'all' | DpRequestStatus)}
                        options={myStatusFilterOptions}
                        allowEmpty={false}
                        placeholder="Todos"
                        searchPlaceholder="Pesquisar..."
                        noFocusRing
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Urgência
                      </label>
                      <SingleSelectSearchDropdown
                        value={filterUrgency}
                        onChange={(value) => setFilterUrgency(value as 'all' | DpUrgency)}
                        options={filterUrgencyOptions}
                        allowEmpty={false}
                        placeholder="Todas"
                        searchPlaceholder="Pesquisar..."
                        noFocusRing
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo</label>
                      <SingleSelectSearchDropdown
                        value={filterRequestType}
                        onChange={(value) => setFilterRequestType(value as 'all' | DpRequestType)}
                        options={filterRequestTypeOptions}
                        allowEmpty={false}
                        placeholder="Todos"
                        searchPlaceholder="Pesquisar..."
                        noFocusRing
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Contrato
                      </label>
                      <SingleSelectSearchDropdown
                        value={filterContractId}
                        onChange={(value) => setFilterContractId(value as 'all' | string)}
                        options={filterContractSelectOptions}
                        allowEmpty={false}
                        placeholder="Todos"
                        searchPlaceholder="Pesquisar..."
                        noFocusRing
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
          </AppModalOverlay>
        )}

        <Modal
          isOpen={!!historyRequest}
          onClose={closeHistoryRequest}
          title="Histórico da solicitação"
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

                  {historyFeedbackText ? (
                    <DpRequestHistorySectionCard
                      title={
                        historyRequest.requestType.startsWith('ADM_')
                          ? 'Feedback ADM/TST'
                          : 'Feedback do DP'
                      }
                    >
                      <p className="whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">
                        {historyFeedbackText}
                      </p>
                    </DpRequestHistorySectionCard>
                  ) : null}

                  <DpRequestHistoryModalFooter>
                    <Button type="button" variant="outline" onClick={closeHistoryRequest}>
                      Fechar
                    </Button>
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

export default function LegacySolicitacoesDpPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/ponto/solicitacoes-gerais');
  }, [router]);
  return <Loading message="Redirecionando..." fullScreen size="lg" />;
}

