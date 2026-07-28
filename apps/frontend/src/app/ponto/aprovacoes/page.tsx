'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { getListTableRowClassName, listTableRowClasses, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { Check, Download, Eye, FileText, Filter, MoreVertical, Wrench, Search, X, CheckCircle, Clock, LayoutList, XCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import {
  exportEspelhoNfPdf,
  fmtEspelhoBrl,
  parseEspelhoBrCurrencyToNumber,
  type EspelhoFederalRates
} from '@/lib/exportEspelhoNfLayout';
import {
  type EspelhoApprovalStatus,
  resolveEspelhoApprovalStatus,
  updateEspelhoApprovalStatus
} from '@/lib/espelhoNfApproval';
import { OcApprovalsSection } from './_components/OcApprovalsSection';
import { FdApprovalsSection } from './_components/FdApprovalsSection';
import { FuelApprovalsSection } from './_components/FuelApprovalsSection';
import { RmApprovalsSection } from './_components/RmApprovalsSection';
import {
  AprovacoesTabsNav,
  type AprovacaoTabId,
} from './_components/AprovacoesTabsNav';
import {
  ApprovalPhaseStatCards,
  DEFAULT_APPROVAL_PHASE_CARDS,
  fetchApprovalPhaseCounts,
  type ApprovalPhaseStatCard,
} from './_components/ApprovalPhaseStatCards';
import {
  APPROVAL_STATUS_COLUMN_TITLE,
  ApprovalStatusBadge,
  dpToApprovalStatus,
  espelhoToApprovalStatus,
} from './_components/ApprovalStatusBadge';
import { useApprovalNotificationCounts } from '@/hooks/useApprovalNotificationCounts';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

const DP_PHASES = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const;
type DpPhaseFilter = (typeof DP_PHASES)[number];

const DP_PHASE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'APPROVED', label: 'Aprovadas' },
  { value: 'REJECTED', label: 'Canceladas' },
  { value: 'ALL', label: 'Todos' },
]);

const DP_PHASE_SUBTITLE: Record<DpPhaseFilter, string> = {
  PENDING: 'Pendentes de aprovação',
  APPROVED: 'Já aprovadas pelo gestor',
  REJECTED: 'Canceladas pelo gestor',
  ALL: 'Todas as solicitações da sua área',
};

const ESPELHO_PHASE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'ALL', label: 'Todos os status' },
  { value: 'PENDING_APPROVAL', label: 'Pendentes' },
  { value: 'SENT_FOR_CORRECTION', label: 'Correção' },
  { value: 'APPROVED', label: 'Aprovados' },
  { value: 'CANCELLED', label: 'Cancelados' },
]);

type EspelhoPhaseFilter =
  | 'ALL'
  | 'PENDING_APPROVAL'
  | 'SENT_FOR_CORRECTION'
  | 'APPROVED'
  | 'CANCELLED';

const ESPELHO_STAT_CARDS: ApprovalPhaseStatCard<EspelhoPhaseFilter>[] = [
  {
    filter: 'PENDING_APPROVAL',
    label: 'Pendentes',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    Icon: Clock,
  },
  {
    filter: 'APPROVED',
    label: 'Aprovados',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
  },
  {
    filter: 'CANCELLED',
    label: 'Cancelados',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: XCircle,
  },
  {
    filter: 'ALL',
    label: 'Todos',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: LayoutList,
  },
];

const ESPELHO_PHASE_SUBTITLE: Record<EspelhoPhaseFilter, string> = {
  PENDING_APPROVAL: 'Pendentes de aprovação',
  SENT_FOR_CORRECTION: 'Enviados para correção',
  APPROVED: 'Espelhos aprovados',
  CANCELLED: 'Espelhos cancelados',
  ALL: 'Todos os espelhos',
};

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
type EspelhoApprovalItem = {
  id: string;
  takerName: string;
  measurementRef: string;
  measurementAmount: string;
  dueDate: string;
  status: EspelhoApprovalStatus;
  mirror: any;
};
type EspelhoApprovalsData = {
  items: EspelhoApprovalItem[];
  providers: any[];
  takers: any[];
  bankAccounts: any[];
  taxCodes: any[];
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
  company?: string | null;
  polo?: string | null;
  managerApprovalComment?: string | null;
  managerRejectionReason?: string | null;
  createdAt?: string;
  details?: Record<string, unknown> | null;
  employee?: { costCenter?: string | null } | null;
};

const STATUS_LABELS: Record<DpRequestStatus, string> = {
  WAITING_MANAGER: 'Aguardando aprovação do gestor',
  IN_REVIEW_DP: 'Em análise (DP)',
  IN_FINANCEIRO: 'No financeiro',
  WAITING_RETURN: 'Pendência colaborador',
  WAITING_RETURN_ACCOUNTING: 'Pendência contábil',
  WAITING_RETURN_ADM_TST: 'Pendência ADM/TST',
  WAITING_RETURN_ENGINEERING: 'Pendência engenharia',
  CONCLUDED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

/** Rótulos legíveis para chaves comuns em `details` (formulário por tipo). */
const DETAIL_KEY_LABELS: Record<string, string> = {
  employeeId: 'Colaborador',
  employeeIds: 'Colaboradores',
  costCenter: 'Centro de custo',
  punicao: 'Punição',
  motivo: 'Motivo',
  observacao: 'Observação',
  observacoes: 'Observações',
  setor: 'Setor',
  dataInicial: 'Data inicial',
  dataFinal: 'Data final',
  quantidadeNomeFuncaoContato: 'Qtd. / nome / função / contato',
  funcaoNomeQuantidadeContato: 'Função / nome / qtd. / contato',
  quantidade: 'Quantidade',
  candidatos: 'Candidatos',
  medidas: 'Medidas disciplinares',
  ferias: 'Férias',
  rescisoes: 'Rescisões',
  alteracoes: 'Alterações',
  atestados: 'Atestados',
  retificacoes: 'Retificações',
  horasExtras: 'Horas extras',
  viagensBeneficio: 'Viagens (benefício)',
  viagens: 'Viagens',
  itens: 'Itens',
  motivoContratacao: 'Motivo da contratação',
  funcaoSalarioAntigo: 'Função/salário (anterior)',
  funcaoSalarioNovo: 'Função/salário (novo)',
  justificativa: 'Justificativa',
  tipoAviso: 'Tipo de aviso',
  tipoRescisao: 'Tipo de rescisão',
  destinoViagem: 'Destino (viagem)',
  periodo: 'Período',
  horas: 'Horas',
  valor: 'Valor',
  descricao: 'Descrição',
};

function formatDateTime(iso?: string | null) {
  return formatDateTimeBr(iso, '—');
}

function humanizeDetailKey(key: string): string {
  if (DETAIL_KEY_LABELS[key]) return DETAIL_KEY_LABELS[key];
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

function formatDetailValue(val: unknown): string {
  if (val == null) return '';
  if (Array.isArray(val)) {
    if (val.length === 0) return '';
    return val.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function formatDetailEntryValue(
  key: string,
  v: unknown,
  employeeNameById?: Map<string, string>,
  parentDetails?: Record<string, unknown>
): string {
  if (employeeNameById && key === 'employeeId' && typeof v === 'string') {
    const id = v.trim();
    if (!id) return '';
    const name = employeeNameById.get(id);
    return (name ?? id).trim();
  }
  if (employeeNameById && key === 'employeeIds' && Array.isArray(v)) {
    const parts = v
      .map((x) => {
        const id = String(x).trim();
        if (!id) return '';
        return employeeNameById.get(id) ?? id;
      })
      .filter(Boolean);
    return parts.join(', ');
  }
  if (key === 'candidatos' && Array.isArray(v)) {
    const legacyMotivo = String(parentDetails?.motivoContratacao ?? '').trim();
    const legacySetor = String(parentDetails?.setor ?? '').trim();
    const legacyObservacao = String(parentDetails?.observacao ?? '').trim();
    return v
      .map((item, index) => {
        if (!item || typeof item !== 'object') return '';
        const row = item as Record<string, unknown>;
        const nome = String(row.nome ?? '—').trim() || '—';
        const funcao = String(row.funcao ?? '—').trim() || '—';
        const contato = String(row.contato ?? '—').trim() || '—';
        const motivo = String(row.motivoContratacao ?? legacyMotivo).trim() || '—';
        const setor = String(row.setor ?? legacySetor).trim() || '—';
        const observacao = String(row.observacao ?? legacyObservacao).trim();
        const obsPart = observacao ? ` — Obs.: ${observacao}` : '';
        const docRaw = row.anexoDocumento;
        const docName =
          docRaw && typeof docRaw === 'object'
            ? String((docRaw as Record<string, unknown>).fileName ?? '').trim()
            : '';
        const docPart = docName ? ` — Anexo: ${docName}` : '';
        return `${index + 1}. ${nome} — ${funcao} — ${contato} — Motivo: ${motivo} — Setor: ${setor}${obsPart}${docPart}`;
      })
      .filter(Boolean)
      .join('\n');
  }
  if (key === 'medidas' && Array.isArray(v)) {
    return v
      .map((item, index) => {
        if (!item || typeof item !== 'object') return '';
        const row = item as Record<string, unknown>;
        const employeeId = String(row.employeeId ?? '').trim();
        const nome = employeeId
          ? employeeNameById?.get(employeeId) ?? employeeId
          : '—';
        const punicaoRaw = String(row.punicao ?? '').trim();
        const punicao =
          punicaoRaw === 'ADVERTENCIA'
            ? 'Advertência'
            : punicaoRaw === 'SUSPENSAO'
              ? 'Suspensão'
              : punicaoRaw || '—';
        const motivo = String(row.motivo ?? '—').trim() || '—';
        return `${index + 1}. ${nome} — ${punicao} — ${motivo}`;
      })
      .filter(Boolean)
      .join('\n');
  }
  if (key === 'rescisoes' && Array.isArray(v)) {
    return v
      .map((item, index) => {
        if (!item || typeof item !== 'object') return '';
        const row = item as Record<string, unknown>;
        const employeeId = String(row.employeeId ?? '').trim();
        const nome = employeeId
          ? employeeNameById?.get(employeeId) ?? employeeId
          : '—';
        const tipoAviso = String(row.tipoAviso ?? '').trim();
        const tipoRescisao = String(row.tipoRescisao ?? '').trim();
        const motivo = String(row.motivo ?? '').trim();
        const observacoes = String(row.observacoes ?? '').trim();
        const parts = [tipoAviso, tipoRescisao, motivo].filter(Boolean);
        const docRaw = row.anexoDocumento;
        const docName =
          docRaw && typeof docRaw === 'object'
            ? String((docRaw as Record<string, unknown>).fileName ?? '').trim()
            : '';
        let text = `${index + 1}. ${nome}`;
        if (parts.length) text += ` — ${parts.join(' — ')}`;
        if (observacoes) text += ` — ${observacoes}`;
        if (docName) text += ` — Anexo: ${docName}`;
        return text;
      })
      .filter(Boolean)
      .join('\n');
  }
  const employeeArrayKeys = [
    'ferias',
    'alteracoes',
    'atestados',
    'retificacoes',
    'horasExtras',
    'viagensBeneficio',
    'viagens',
    'itens',
  ];
  if (employeeArrayKeys.includes(key) && Array.isArray(v)) {
    return v
      .map((item, index) => {
        if (!item || typeof item !== 'object') return '';
        const row = item as Record<string, unknown>;
        const employeeId = String(row.employeeId ?? '').trim();
        const nome = employeeId
          ? employeeNameById?.get(employeeId) ?? employeeId
          : '—';
        return `${index + 1}. ${nome}`;
      })
      .filter(Boolean)
      .join('\n');
  }
  return formatDetailValue(v);
}

function buildDetailRows(
  details: Record<string, unknown> | null | undefined,
  employeeNameById?: Map<string, string>
): { key: string; label: string; value: string }[] {
  if (!details || typeof details !== 'object') return [];
  const rows: { key: string; label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(details)) {
    if (k === 'anexoAtestado') continue;
    if (
      (k === 'motivoContratacao' || k === 'setor' || k === 'observacao') &&
      Array.isArray(details.candidatos) &&
      details.candidatos.length > 0
    ) {
      continue;
    }
    const value = formatDetailEntryValue(k, v, employeeNameById, details).trim();
    if (!value) continue;
    rows.push({ key: k, label: humanizeDetailKey(k), value });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

function extractAtestadoAttachment(
  details: Record<string, unknown> | null | undefined
): { fileName: string; mimeType: string; previewUrl: string } | null {
  if (!details || typeof details !== 'object') return null;
  const raw = (details as any).anexoAtestado;
  if (!raw || typeof raw !== 'object') return null;
  const fileName = String(raw.fileName || 'atestado').trim() || 'atestado';
  const mimeType = String(raw.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
  const fileUrl = String(raw.fileUrl || '').trim();
  if (fileUrl) return { fileName, mimeType, previewUrl: fileUrl };
  const dataBase64 = String(raw.dataBase64 || '').trim();
  if (!dataBase64) return null;
  return { fileName, mimeType, previewUrl: `data:${mimeType};base64,${dataBase64}` };
}

function getDetailString(details: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!details || typeof details !== 'object') return null;
  const v = (details as any)[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function formatYmd(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
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
  ADM_VIAGENS: 'Viagens',
  ADM_EPI_FARDAMENTO: "EPI's e fardamento",
  ADM_MANUTENCAO_ESCRITORIO: 'Manutenção do escritório',
  ADM_MATERIAL_ESCRITORIO: 'Material de escritório',
  ADM_INFORMATICA: 'Informática',
  ADM_TREINAMENTOS_NR: "Treinamentos e NR's",
  ADM_ASOS: "ASO's",
};
const ESPELHO_ACTION_MENU_WIDTH_PX = 224;
const ESPELHO_MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';
const ESPELHO_MENU_ITEM_BORDER_CLASS = `${ESPELHO_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`;
const DP_ACTION_MENU_WIDTH_PX = 224;
const DP_MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';
const DP_MENU_ITEM_BORDER_CLASS = `${DP_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`;
const espelhoCellPad = 'px-2 sm:px-3 py-3';
const espelhoCellPadTh = 'px-2 sm:px-3 py-4';
const espelhoActionColCls = 'w-[4%] min-w-[3rem] max-w-[4.5rem]';
const espelhoThTextCls = `${espelhoCellPadTh} text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400`;
const espelhoThLeftCls = `${espelhoCellPadTh} text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 !pl-2 sm:!pl-3`;
const espelhoThCenterCls = `${espelhoThTextCls} whitespace-nowrap`;
const espelhoTdTextCls = `${espelhoCellPad} text-center text-sm text-gray-700 dark:text-gray-300 min-w-0`;
const espelhoTdRefCls = `${espelhoCellPad} text-left text-sm text-gray-600 dark:text-gray-400 min-w-0 !pl-2 sm:!pl-3`;
const espelhoTdCenterCls = `${espelhoCellPad} text-center text-sm min-w-0`;
const espelhoActionThCls = `${cadastroListClasses.thRight} ${espelhoActionColCls} !pl-1 !pr-2 sm:!pr-3`;
const espelhoActionTdCls = `${espelhoActionColCls} !pl-1 !pr-2 sm:!pr-3 py-3 align-middle`;

export default function AprovacoesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  /** Fase do bloco «Solicitações»: pendentes (padrão), aprovadas, canceladas ou todas. */
  const [searchDp, setSearchDp] = useState('');
  const [dpPhase, setDpPhase] = useState<DpPhaseFilter>('PENDING');
  const [isDpFiltersOpen, setIsDpFiltersOpen] = useState(false);
  /** Busca + filtro de status do bloco «Espelhos da Nota Fiscal». */
  const [searchEspelho, setSearchEspelho] = useState('');
  const [isEspelhoFiltersOpen, setIsEspelhoFiltersOpen] = useState(false);
  const [managerComment, setManagerComment] = useState<Record<string, string>>({});
  const [managerCancellationReason, setManagerCancellationReason] = useState<Record<string, string>>({});
  const [managerRejectingId, setManagerRejectingId] = useState<string | null>(null);
  const [detailRequest, setDetailRequest] = useState<DpRequest | null>(null);
  const [espelhoPhase, setEspelhoPhase] = useState<EspelhoPhaseFilter>('PENDING_APPROVAL');
  const [espelhoActionMenu, setEspelhoActionMenu] = useState<{
    mirrorId: string;
    top: number;
    left: number;
  } | null>(null);
  const [dpActionMenu, setDpActionMenu] = useState<{
    requestId: string;
    top: number;
    left: number;
  } | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<{
    fileName: string;
    mimeType: string;
    previewUrl: string;
  } | null>(null);

  const downloadAttachment = async (att: { fileName: string; previewUrl: string }) => {
    try {
      const res = await fetch(att.previewUrl, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error('download failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = att.fileName || 'atestado';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      toast.error('Não foi possível baixar o anexo agora.');
    }
  };

  const { canAccessDpApproverPages, canApproveEspelhoNf, canApproveOc, canApproveFuel, canApproveMaterialRequests } =
    usePermissions();
  const canApproveDp = canAccessDpApproverPages;
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const initialTab: AprovacaoTabId =
    tabFromUrl === 'dp' ||
    tabFromUrl === 'espelho' ||
    tabFromUrl === 'fd' ||
    tabFromUrl === 'fuel' ||
    tabFromUrl === 'rm' ||
    tabFromUrl === 'oc'
      ? tabFromUrl
      : 'dp';
  const [activeTab, setActiveTab] = useState<AprovacaoTabId>(initialTab);
  const { counts: approvalCounts } = useApprovalNotificationCounts();

  useEffect(() => {
    if (
      tabFromUrl === 'dp' ||
      tabFromUrl === 'espelho' ||
      tabFromUrl === 'fd' ||
      tabFromUrl === 'fuel' ||
      tabFromUrl === 'rm' ||
      tabFromUrl === 'oc'
    ) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });
  const user = userData?.data;

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: dpResp, isLoading: loadingDp } = useQuery({
    queryKey: ['approvals', 'dp', dpPhase],
    queryFn: async () => {
      const res = await api.get(`/solicitacoes-dp/aprovacoes?phase=${dpPhase}`);
      return (res.data?.data ?? []) as DpRequest[];
    },
    enabled: !loadingUser && canApproveDp && activeTab === 'dp',
  });

  const { data: dpPhaseCounts, isLoading: loadingDpCounts } = useQuery({
    queryKey: ['approvals', 'dp', 'phase-counts'],
    queryFn: () => fetchApprovalPhaseCounts('/solicitacoes-dp/aprovacoes', DP_PHASES),
    enabled: !loadingUser && canApproveDp && activeTab === 'dp',
    staleTime: 30_000,
  });
  const { data: espelhoResp, isLoading: loadingEspelhoApprovals } = useQuery({
    queryKey: ['approvals', 'espelho-nf'],
    enabled: !loadingUser && canApproveEspelhoNf && activeTab === 'espelho',
    queryFn: async () => {
      const res = await api.get('/espelho-nf/bootstrap');
      const data = res.data?.data || {};
      const mirrors = Array.isArray(data.mirrors) ? data.mirrors : [];
      const providers = Array.isArray(data.providers) ? data.providers : [];
      const takers = Array.isArray(data.takers) ? data.takers : [];
      const bankAccounts = Array.isArray(data.bankAccounts) ? data.bankAccounts : [];
      const taxCodes = Array.isArray(data.taxCodes) ? data.taxCodes : [];
      const takerById = new Map(
        takers.map((t: any) => [
          String(t.id ?? ''),
          String(t.corporateName || t.name || '').trim()
        ])
      );
      const parsed: EspelhoApprovalItem[] = mirrors.map((m: any) => ({
        id: String(m.id ?? ''),
        takerName: String(m.takerName || takerById.get(String(m.takerId ?? '')) || '').trim(),
        measurementRef: String(m.measurementRef ?? ''),
        measurementAmount: String(m.measurementAmount ?? ''),
        dueDate: String(m.dueDate ?? ''),
        status: resolveEspelhoApprovalStatus(String(m.id ?? ''), String(m.approvalStatus ?? '')),
        mirror: m
      }));
      return {
        items: parsed,
        providers,
        takers,
        bankAccounts,
        taxCodes
      } as EspelhoApprovalsData;
    },
  });

  const dpRequests = (dpResp as DpRequest[]) || [];
  const espelhoData = (espelhoResp as EspelhoApprovalsData | undefined) ?? {
    items: [],
    providers: [],
    takers: [],
    bankAccounts: [],
    taxCodes: []
  };
  const espelhoApprovals = espelhoData.items;

  const detailPayrollMonthYear = React.useMemo(() => {
    const src = detailRequest?.createdAt;
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
  }, [detailRequest?.createdAt]);

  const { data: payrollEmpForDetail } = useQuery({
    queryKey: [
      'payroll-employees-aprovacoes-detalhe',
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
    enabled: !loadingUser && canApproveDp && !!detailRequest,
  });

  const employeeNameByIdForDetail = React.useMemo(() => {
    const list = payrollEmpForDetail ?? [];
    return new Map(list.map((e) => [e.id, e.name]));
  }, [payrollEmpForDetail]);

  const detailModalRows = React.useMemo(
    () => (detailRequest ? buildDetailRows(detailRequest.details, employeeNameByIdForDetail) : []),
    [detailRequest, employeeNameByIdForDetail]
  );
  const detailAttachment = React.useMemo(
    () => (detailRequest ? extractAtestadoAttachment(detailRequest.details) : null),
    [detailRequest]
  );

  const getCostCenterLabel = (r: DpRequest): string | null => {
    const fromDetails =
      typeof r.details?.costCenter === 'string' ? r.details.costCenter.trim() : '';
    if (fromDetails) return fromDetails;
    const fromEmployee = typeof r.employee?.costCenter === 'string' ? r.employee.costCenter.trim() : '';
    return fromEmployee || null;
  };

  const getContratoColunaLabel = (r: DpRequest): string => {
    if (r.requestType === 'ATESTADO_MEDICO') return getCostCenterLabel(r) || '—';
    return r.contract?.name ?? '—';
  };

  const detailInfoRows = React.useMemo(() => {
    if (!detailRequest) return [] as Array<{ key: string; label: string; value: string }>;
    const rows: Array<{ key: string; label: string; value: string }> = [];
    const seen = new Set<string>();
    const push = (key: string, label: string, value?: string | null) => {
      const v = String(value ?? '').trim();
      if (!v || seen.has(key)) return;
      seen.add(key);
      rows.push({ key, label, value: v });
    };

    push('status', 'Status', STATUS_LABELS[detailRequest.status] ?? detailRequest.status);
    push('urgency', 'Urgência', URGENCY_LABELS[detailRequest.urgency]);
    push('tipo', 'Tipo', TYPE_LABELS[detailRequest.requestType] ?? detailRequest.requestType);
    push('criadaEm', 'Criada em', formatDateTime(detailRequest.createdAt));
    push('prazoInicio', 'Prazo (início)', formatYmd(detailRequest.prazoInicio));
    push('prazoFim', 'Prazo (fim)', formatYmd(detailRequest.prazoFim));
    push('centroCusto', 'Centro de custo', getCostCenterLabel(detailRequest));
    push('empresa', 'Empresa', detailRequest.company ?? null);
    push('polo', 'Polo', detailRequest.polo ?? null);
    if (!getCostCenterLabel(detailRequest)) {
      const contrato = `${detailRequest.contract?.name ?? ''}${
        detailRequest.contract?.number ? ` (${detailRequest.contract.number})` : ''
      }`.trim();
      push('contrato', 'Contrato', contrato || '—');
    }
    push('solicitante', 'Solicitante', detailRequest.solicitanteNome);
    push('setor', 'Setor', detailRequest.sectorSolicitante || '—');
    push('login', 'Login', detailRequest.solicitanteEmail || '—');

    // Ordem pedida: data inicial acima de data final.
    push('dataInicial', 'Data inicial', getDetailString(detailRequest.details, 'dataInicial'));
    push('dataFinal', 'Data final', getDetailString(detailRequest.details, 'dataFinal'));
    push('numeroDias', 'Número de dias', getDetailString(detailRequest.details, 'numeroDias'));
    push(
      'colaborador',
      'Colaborador',
      getDetailString(detailRequest.details, 'employeeId')
        ? formatDetailEntryValue('employeeId', getDetailString(detailRequest.details, 'employeeId')!, employeeNameByIdForDetail)
        : null
    );

    detailModalRows.forEach((row) => {
      if (['costCenter', 'dataInicial', 'dataFinal', 'numeroDias', 'employeeId'].includes(row.key)) return;
      push(`details_${row.key}`, row.label, row.value);
    });

    return rows;
  }, [detailRequest, detailModalRows, employeeNameByIdForDetail]);

  const dpFiltered = useMemo(() => {
    const q = searchDp.trim().toLowerCase();
    if (!q) return dpRequests;
    return dpRequests.filter((r) => {
      if (r.displayNumber != null && String(r.displayNumber).includes(q)) return true;
      return r.id.toLowerCase().includes(q);
    });
  }, [dpRequests, searchDp]);

  const espelhoFiltered = useMemo(() => {
    const q = searchEspelho.trim().toLowerCase();
    const byPhase =
      espelhoPhase === 'ALL'
        ? espelhoApprovals
        : espelhoApprovals.filter((m) => m.status === espelhoPhase);
    if (!q) return byPhase;
    return byPhase.filter((m) => {
      const title = `${m.takerName} ${m.measurementRef} ${m.measurementAmount} ${m.id}`.toLowerCase();
      return title.includes(q);
    });
  }, [espelhoApprovals, espelhoPhase, searchEspelho]);

  const espelhoPhaseCounts = useMemo(() => {
    const counts: Record<EspelhoPhaseFilter, number> = {
      ALL: espelhoApprovals.length,
      PENDING_APPROVAL: 0,
      SENT_FOR_CORRECTION: 0,
      APPROVED: 0,
      CANCELLED: 0,
    };
    for (const item of espelhoApprovals) {
      counts[item.status] = (counts[item.status] ?? 0) + 1;
    }
    return counts;
  }, [espelhoApprovals]);

  const espelhoForActionMenu = useMemo(
    () => espelhoFiltered.find((m) => m.id === espelhoActionMenu?.mirrorId) ?? null,
    [espelhoFiltered, espelhoActionMenu?.mirrorId]
  );

  const dpForActionMenu = useMemo(
    () => dpFiltered.find((r) => r.id === dpActionMenu?.requestId) ?? null,
    [dpFiltered, dpActionMenu?.requestId]
  );

  useEffect(() => {
    setEspelhoActionMenu(null);
  }, [activeTab, espelhoPhase, searchEspelho]);

  useEffect(() => {
    setDpActionMenu(null);
  }, [activeTab, dpPhase, searchDp]);

  const approvalTabs = useMemo(() => {
    const tabs: { id: AprovacaoTabId; label: string; count: number }[] = [];
    if (canApproveDp) {
      tabs.push({
        id: 'dp',
        label: 'Solicitações',
        count: approvalCounts.dp,
      });
    }
    if (canApproveEspelhoNf) {
      tabs.push({
        id: 'espelho',
        label: 'Espelhos da NF',
        count: approvalCounts.espelho,
      });
    }
    if (canApproveDp) {
      tabs.push({
        id: 'fd',
        label: 'Fichas de Demanda',
        count: approvalCounts.fd,
      });
    }
    if (canApproveFuel) {
      tabs.push({
        id: 'fuel',
        label: 'Combustível',
        count: approvalCounts.fuel,
      });
    }
    if (canApproveMaterialRequests) {
      tabs.push({
        id: 'rm',
        label: 'Requisições de Materiais',
        count: approvalCounts.rm,
      });
    }
    if (canApproveOc) {
      tabs.push({
        id: 'oc',
        label: 'Ordens de Compra',
        count: approvalCounts.oc,
      });
    }
    return tabs;
  }, [canApproveDp, canApproveEspelhoNf, canApproveFuel, canApproveMaterialRequests, canApproveOc, approvalCounts]);

  useEffect(() => {
    if (approvalTabs.length === 0) return;
    if (!approvalTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(approvalTabs[0].id);
    }
  }, [approvalTabs, activeTab]);

  const approveMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const comment = managerComment[id] || '';
      const res = await api.put(`/solicitacoes-dp/${id}/manager-approve`, { comment });
      return res.data?.data as DpRequest;
    },
    onSuccess: async (_, variables) => {
      toast.success('Solicitação aprovada');
      setDetailRequest((cur) => (cur?.id === variables.id ? null : cur));
      await queryClient.invalidateQueries({ queryKey: ['approvals', 'dp'] });
      await queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || err?.message || 'Erro'),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, cancellationReason }: { id: string; cancellationReason: string }) => {
      const res = await api.put(`/solicitacoes-dp/${id}/manager-reject`, { cancellationReason });
      return res.data?.data as DpRequest;
    },
    onSuccess: async (_, variables) => {
      toast.success('Solicitação cancelada');
      setManagerRejectingId(null);
      setManagerCancellationReason((p) => {
        const n = { ...p };
        delete n[variables.id];
        return n;
      });
      setDetailRequest((cur) => (cur?.id === variables.id ? null : cur));
      await queryClient.invalidateQueries({ queryKey: ['approvals', 'dp'] });
      await queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || err?.message || 'Erro'),
  });

  const closeDetailModal = () => {
    setDetailRequest(null);
    setManagerRejectingId(null);
  };

  const handleManagerRejectClick = (id: string) => {
    if (managerRejectingId !== id) {
      setManagerRejectingId(id);
      return;
    }
    const reason = (managerCancellationReason[id] || '').trim();
    if (!reason) {
      toast.error('Informe o motivo do cancelamento');
      return;
    }
    rejectMutation.mutate({ id, cancellationReason: reason });
  };
  const applyEspelhoDecision = async (
    mirrorId: string,
    status: EspelhoApprovalStatus,
    successMessage: string
  ) => {
    updateEspelhoApprovalStatus(mirrorId, status);
    toast.success(successMessage);
    await queryClient.invalidateQueries({ queryKey: ['approvals', 'espelho-nf'] });
    await queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
  };
  const handleDownloadEspelhoPdf = (item: EspelhoApprovalItem) => {
    const fallbackFederal: EspelhoFederalRates = {
      cofins: '0',
      csll: '0',
      inss: '0',
      irpj: '0',
      pis: '0'
    };
    let federal = fallbackFederal;
    try {
      const raw = localStorage.getItem('espelho-nf-federal-tax-rates');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<EspelhoFederalRates>;
        federal = {
          cofins: String(parsed?.cofins ?? '0'),
          csll: String(parsed?.csll ?? '0'),
          inss: String(parsed?.inss ?? '0'),
          irpj: String(parsed?.irpj ?? '0'),
          pis: String(parsed?.pis ?? '0')
        };
      }
    } catch {
      federal = fallbackFederal;
    }
    exportEspelhoNfPdf(
      item.mirror,
      espelhoData.providers,
      espelhoData.takers,
      espelhoData.bankAccounts,
      espelhoData.taxCodes,
      federal
    );
    toast.success('PDF do espelho gerado.');
  };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/aprovacoes">
      <MainLayout userRole={'EMPLOYEE'} userName={user?.name || ''} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Aprovações</h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Analise e decida sobre as solicitações pendentes da sua área
            </p>
          </div>

          {approvalTabs.length > 0 ? (
            <AprovacoesTabsNav
              tabs={approvalTabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              Você não tem permissão para aprovar itens nesta tela.
            </div>
          )}

          {canApproveDp && activeTab === 'dp' && (
          <div className="space-y-6">
            <ApprovalPhaseStatCards
              cards={DEFAULT_APPROVAL_PHASE_CARDS}
              activeFilter={dpPhase}
              counts={dpPhaseCounts ?? {}}
              loading={loadingDpCounts}
              onSelect={setDpPhase}
            />
          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  {(() => {
                    const activeCard =
                      DEFAULT_APPROVAL_PHASE_CARDS.find((c) => c.filter === dpPhase) ??
                      DEFAULT_APPROVAL_PHASE_CARDS[0];
                    const PhaseIcon = activeCard.Icon;
                    return (
                      <>
                        <div className={`rounded-lg p-2 sm:p-3 ${activeCard.iconBg}`}>
                          <PhaseIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${activeCard.iconColor}`} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {activeCard.label}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {DP_PHASE_SUBTITLE[dpPhase]}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={searchDp}
                      onChange={(e) => setSearchDp(e.target.value)}
                      placeholder="Buscar por Nº ou ID..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchDp && (
                      <button
                        type="button"
                        onClick={() => setSearchDp('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDpFiltersOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      dpPhase !== 'PENDING'
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={dpPhase !== 'PENDING' ? 'Filtro (status ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {dpPhase !== 'PENDING' && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    )}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!canApproveDp ? (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Você não tem permissão para aprovar solicitações do Departamento Pessoal.
                </div>
              ) : loadingDp ? (
                <Loading message="Carregando aprovações..." />
              ) : dpFiltered.length === 0 ? (
                <div className="py-8 text-center">
                  <FileText className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" aria-hidden />
                  <p className="text-gray-500 dark:text-gray-400">Nenhuma aprovação pendente.</p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando 1 a {dpFiltered.length} de {dpFiltered.length} solicitações
                    </span>
                    <span>Página 1 de 1</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Nº
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
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {APPROVAL_STATUS_COLUMN_TITLE}
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {dpFiltered.map((r) => (
                          <tr
                            key={r.id}
                            onClick={() => setDetailRequest(r)}
                            className={getListTableRowClassName(true)}
                          >
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm tabular-nums">
                              <ListRowNavigableLabel className="font-medium">{r.displayNumber ?? '—'}</ListRowNavigableLabel>
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-center">
                              <span
                                className={`inline-flex items-center justify-center text-xs font-medium ${URGENCY_ROW_BADGE[r.urgency]}`}
                              >
                                {URGENCY_LABELS[r.urgency]}
                              </span>
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm font-medium text-gray-900 dark:text-gray-100">
                              {TYPE_LABELS[r.requestType] ?? r.requestType}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 max-w-[220px]">
                              {getContratoColunaLabel(r)}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                              {formatYmd(r.prazoInicio)}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                              {formatYmd(r.prazoFim)}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                              <div className="font-medium text-gray-900 dark:text-gray-100">{r.solicitanteNome}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{r.sectorSolicitante}</div>
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-center">
                              <ApprovalStatusBadge kind={dpToApprovalStatus(r.status)} />
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setDpActionMenu((prev) => {
                                      if (prev?.requestId === r.id) return null;
                                      let left = rect.right - DP_ACTION_MENU_WIDTH_PX;
                                      left = Math.max(
                                        8,
                                        Math.min(left, window.innerWidth - DP_ACTION_MENU_WIDTH_PX - 8)
                                      );
                                      return { requestId: r.id, top: rect.bottom + 4, left };
                                    });
                                  }}
                                  className={rowActionMenuButtonClass(dpActionMenu?.requestId === r.id)}
                                  aria-label="Menu de ações"
                                  aria-expanded={dpActionMenu?.requestId === r.id}
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
                </>
              )}
            </CardContent>
          </Card>
          </div>
          )}

          {dpActionMenu &&
            dpForActionMenu &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                className="fixed inset-0"
                style={{ zIndex: 2101 }}
                onClick={() => setDpActionMenu(null)}
              >
                <div
                  role="menu"
                  className="absolute w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                  style={{ top: dpActionMenu.top, left: dpActionMenu.left }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDpActionMenu(null);
                      setDetailRequest(dpForActionMenu);
                    }}
                    className={DP_MENU_ITEM_CLASS}
                  >
                    <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span>Ver detalhes</span>
                  </button>
                  {dpForActionMenu.status === 'WAITING_MANAGER' && (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDpActionMenu(null);
                          approveMutation.mutate({ id: dpForActionMenu.id });
                        }}
                        className={DP_MENU_ITEM_BORDER_CLASS}
                      >
                        <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span>Aprovar solicitação</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDpActionMenu(null);
                          setDetailRequest(dpForActionMenu);
                          setManagerRejectingId(dpForActionMenu.id);
                        }}
                        className={DP_MENU_ITEM_BORDER_CLASS}
                      >
                        <X className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                        <span>Cancelar solicitação</span>
                      </button>
                    </>
                  )}
                </div>
              </div>,
              document.body
            )}

          {canApproveEspelhoNf && activeTab === 'espelho' && (
          <div className="space-y-6">
            <ApprovalPhaseStatCards
              cards={ESPELHO_STAT_CARDS}
              activeFilter={espelhoPhase}
              counts={espelhoPhaseCounts}
              loading={loadingEspelhoApprovals}
              onSelect={setEspelhoPhase}
              columnsClassName="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4"
            />
          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  {(() => {
                    const activeCard =
                      ESPELHO_STAT_CARDS.find((c) => c.filter === espelhoPhase) ??
                      ESPELHO_STAT_CARDS[0];
                    const PhaseIcon = activeCard.Icon;
                    return (
                      <>
                        <div className={`rounded-lg p-2 sm:p-3 ${activeCard.iconBg}`}>
                          <PhaseIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${activeCard.iconColor}`} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {activeCard.label}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {ESPELHO_PHASE_SUBTITLE[espelhoPhase]}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={searchEspelho}
                      onChange={(e) => setSearchEspelho(e.target.value)}
                      placeholder="Buscar por tomador, medição ou ID..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchEspelho && (
                      <button
                        type="button"
                        onClick={() => setSearchEspelho('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEspelhoFiltersOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      espelhoPhase !== 'PENDING_APPROVAL'
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={espelhoPhase !== 'PENDING_APPROVAL' ? 'Filtro (status ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {espelhoPhase !== 'PENDING_APPROVAL' && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    )}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingEspelhoApprovals ? (
                <Loading message="Carregando espelhos..." />
              ) : espelhoFiltered.length === 0 ? (
                <div className="py-8 text-center">
                  <FileText className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" aria-hidden />
                  <p className="text-gray-500 dark:text-gray-400">Nenhum espelho neste filtro.</p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando 1 a {espelhoFiltered.length} de {espelhoFiltered.length} espelhos
                    </span>
                    <span>Página 1 de 1</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className={`${cadastroListClasses.table} text-sm`}>
                      <colgroup>
                        <col className="w-[34%]" />
                        <col className="w-[22%]" />
                        <col className="w-[14%]" />
                        <col className="w-[14%]" />
                        <col className="w-[12%]" />
                        <col className="w-[4%]" />
                      </colgroup>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={espelhoThLeftCls}>Referência</th>
                          <th className={espelhoThTextCls}>Tomador</th>
                          <th className={espelhoThCenterCls}>Medição</th>
                          <th className={espelhoThCenterCls}>Vencimento</th>
                          <th className={espelhoThCenterCls}>{APPROVAL_STATUS_COLUMN_TITLE}</th>
                          <th scope="col" className={espelhoActionThCls}>
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {espelhoFiltered.map((m) => {
                          const med = parseEspelhoBrCurrencyToNumber(m.measurementAmount);
                          const medTxt = med !== null ? fmtEspelhoBrl(med) : '—';
                          const takerName = m.takerName || 'Tomador não informado';
                          const measurementRef = m.measurementRef?.trim() || '—';
                          return (
                            <tr key={m.id} className={listTableRowClasses.tr} title={m.id}>
                              <td className={espelhoTdRefCls}>
                                <span className="line-clamp-2" title={measurementRef}>
                                  {measurementRef}
                                </span>
                              </td>
                              <td className={espelhoTdTextCls} title={takerName}>
                                <span className="line-clamp-2 font-medium text-gray-900 dark:text-gray-100">
                                  {takerName}
                                </span>
                              </td>
                              <td className={espelhoTdCenterCls}>
                                <span className="font-medium tabular-nums text-gray-800 dark:text-gray-200 whitespace-nowrap">
                                  {medTxt}
                                </span>
                              </td>
                              <td className={`${espelhoTdCenterCls} tabular-nums text-gray-700 dark:text-gray-300`}>
                                {m.dueDate ? formatYmd(m.dueDate) : '—'}
                              </td>
                              <td className={espelhoTdCenterCls}>
                                <ApprovalStatusBadge kind={espelhoToApprovalStatus(m.status)} />
                              </td>
                              <td className={espelhoActionTdCls}>
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setEspelhoActionMenu((prev) => {
                                        if (prev?.mirrorId === m.id) return null;
                                        let left = rect.right - ESPELHO_ACTION_MENU_WIDTH_PX;
                                        left = Math.max(
                                          8,
                                          Math.min(left, window.innerWidth - ESPELHO_ACTION_MENU_WIDTH_PX - 8)
                                        );
                                        return { mirrorId: m.id, top: rect.bottom + 4, left };
                                      });
                                    }}
                                    className={rowActionMenuButtonClass(espelhoActionMenu?.mirrorId === m.id)}
                                    aria-label="Menu de ações do espelho"
                                    aria-expanded={espelhoActionMenu?.mirrorId === m.id}
                                    aria-haspopup="menu"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          </div>
          )}

          {espelhoActionMenu &&
            espelhoForActionMenu &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                className="fixed inset-0"
                style={{ zIndex: 2101 }}
                onClick={() => setEspelhoActionMenu(null)}
              >
                <div
                  role="menu"
                  className="absolute w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                  style={{ top: espelhoActionMenu.top, left: espelhoActionMenu.left }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEspelhoActionMenu(null);
                      void applyEspelhoDecision(
                        espelhoForActionMenu.id,
                        'APPROVED',
                        'Espelho aprovado.'
                      );
                    }}
                    className={ESPELHO_MENU_ITEM_CLASS}
                  >
                    <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Aprovar espelho</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEspelhoActionMenu(null);
                      void applyEspelhoDecision(
                        espelhoForActionMenu.id,
                        'SENT_FOR_CORRECTION',
                        'Espelho enviado para correção.'
                      );
                    }}
                    className={ESPELHO_MENU_ITEM_BORDER_CLASS}
                  >
                    <Wrench className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                    <span>Enviar para correção</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEspelhoActionMenu(null);
                      void applyEspelhoDecision(
                        espelhoForActionMenu.id,
                        'CANCELLED',
                        'Espelho cancelado.'
                      );
                    }}
                    className={ESPELHO_MENU_ITEM_BORDER_CLASS}
                  >
                    <X className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>Cancelar espelho</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEspelhoActionMenu(null);
                      handleDownloadEspelhoPdf(espelhoForActionMenu);
                    }}
                    className={ESPELHO_MENU_ITEM_BORDER_CLASS}
                  >
                    <Download className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-300" />
                    <span>Baixar PDF</span>
                  </button>
                </div>
              </div>,
              document.body
            )}

          {canApproveDp && activeTab === 'fd' && <FdApprovalsSection />}

          {canApproveFuel && activeTab === 'fuel' && <FuelApprovalsSection />}

          {canApproveMaterialRequests && activeTab === 'rm' && <RmApprovalsSection />}

          {canApproveOc && activeTab === 'oc' && <OcApprovalsSection />}

          <Modal
            isOpen={!!detailRequest}
            onClose={closeDetailModal}
            title={
              detailRequest
                ? `Solicitação`
                : 'Detalhes'
            }
            size="lg"
          >
            {detailRequest && (
              <div className="space-y-6">
                {detailInfoRows.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Informações
                    </h3>
                    <div className="max-h-[240px] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <dl className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
                        {detailInfoRows.map((row) => (
                          <div key={row.key} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-4">
                            <dt className="font-medium text-gray-700 dark:text-gray-300">{row.label}</dt>
                            <dd className="whitespace-pre-wrap break-words text-gray-600 dark:text-gray-400">
                              {row.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </div>
                ) : null}

                {detailAttachment ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Anexo do atestado</h3>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                          {detailAttachment.fileName}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{detailAttachment.mimeType}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setAttachmentPreview(detailAttachment)}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Ver anexo"
                          aria-label="Ver anexo"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void downloadAttachment(detailAttachment)}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Baixar anexo"
                          aria-label="Baixar anexo"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Decisão</h3>
                  <div className="space-y-3">
                    <Input
                      value={managerComment[detailRequest.id] || ''}
                      onChange={(e) =>
                        setManagerComment((p) => ({ ...p, [detailRequest.id]: e.target.value }))
                      }
                      placeholder="Comentário (opcional)"
                    />
                    {managerRejectingId === detailRequest.id ? (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Motivo do cancelamento *
                        </label>
                        <textarea
                          value={managerCancellationReason[detailRequest.id] || ''}
                          onChange={(e) =>
                            setManagerCancellationReason((p) => ({
                              ...p,
                              [detailRequest.id]: e.target.value,
                            }))
                          }
                          placeholder="Informe o motivo do cancelamento..."
                          className="w-full min-h-[88px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button type="button" variant="outline" onClick={closeDetailModal}>
                        Fechar
                      </Button>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="error"
                          onClick={() => handleManagerRejectClick(detailRequest.id)}
                          disabled={
                            approveMutation.isPending ||
                            rejectMutation.isPending ||
                            detailRequest.status !== 'WAITING_MANAGER'
                          }
                        >
                          {rejectMutation.isPending
                            ? 'Cancelando…'
                            : managerRejectingId === detailRequest.id
                              ? 'Confirmar cancelamento'
                              : 'Cancelar'}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => approveMutation.mutate({ id: detailRequest.id })}
                          disabled={
                            approveMutation.isPending ||
                            rejectMutation.isPending ||
                            detailRequest.status !== 'WAITING_MANAGER'
                          }
                        >
                          {approveMutation.isPending ? 'Aprovando…' : 'Aprovar'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Modal>

          {attachmentPreview && (
            <div
              className="app-modal-overlay fixed inset-0 z-[2200] flex items-center justify-center bg-black/85 p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Visualizar anexo do atestado"
              onClick={() => setAttachmentPreview(null)}
            >
              <button
                type="button"
                onClick={() => setAttachmentPreview(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="max-w-[92vw] max-h-[88vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                {attachmentPreview.mimeType.toLowerCase().includes('pdf') ? (
                  <iframe
                    title={attachmentPreview.fileName}
                    src={attachmentPreview.previewUrl}
                    className="w-[min(92vw,980px)] h-[85vh] rounded-xl bg-white"
                  />
                ) : (
                  <img
                    src={attachmentPreview.previewUrl}
                    alt={attachmentPreview.fileName}
                    className="max-w-full max-h-[85vh] object-contain rounded-xl"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
            </div>
          )}

          {/* Modal de Filtros — bloco «Solicitações» */}
          <Modal
            isOpen={isDpFiltersOpen}
            onClose={() => setIsDpFiltersOpen(false)}
            title="Filtros"
            size="md"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Status
                </label>
                <StringSingleSelectDropdown
                  value={dpPhase}
                  onChange={(v) => setDpPhase(v as DpPhaseFilter)}
                  options={DP_PHASE_FILTER_OPTIONS}
                  allowEmpty={false}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setDpPhase('PENDING')}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={() => setIsDpFiltersOpen(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </Modal>

          {/* Modal de Filtros — bloco «Espelhos da Nota Fiscal» */}
          <Modal
            isOpen={isEspelhoFiltersOpen}
            onClose={() => setIsEspelhoFiltersOpen(false)}
            title="Filtros"
            size="md"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Status
                </label>
                <StringSingleSelectDropdown
                  value={espelhoPhase}
                  onChange={(v) => setEspelhoPhase(v as EspelhoPhaseFilter)}
                  options={ESPELHO_PHASE_FILTER_OPTIONS}
                  allowEmpty={false}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setEspelhoPhase('PENDING_APPROVAL')}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={() => setIsEspelhoFiltersOpen(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </Modal>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
