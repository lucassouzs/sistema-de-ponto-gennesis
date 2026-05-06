'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import {
  MessageSquare,
  Phone,
  Clock,
  FileText,
  ChevronRight,
  User,
  Bot,
  Paperclip,
  Loader2,
  ArrowLeft,
  AlertCircle,
  Trash2,
  FileCheck,
  HelpCircle,
  MoreHorizontal,
  LayoutList,
  UserCircle,
  Hash,
  Calendar,
  FileType
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ConversationSummary {
  id: string;
  phone: string;
  name?: string | null;
  flowStatus: string;
  status: string;
  attendantRequested?: boolean;
  attendantInProgress?: boolean;
  updatedAt: string;
  createdAt: string;
  messageCount: number;
  submissionCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

interface Message {
  id: string;
  role: string;
  content: string;
  mediaUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  createdAt: string;
}

interface Submission {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  fileUrl?: string | null;
  fileName?: string | null;
  status: string;
  medicalCertificateId?: string | null;
  createdAt: string;
}

/** Payload do fluxo de atestado (enviado no submission MEDICAL_CERTIFICATE) */
interface AtestadoPayload {
  name?: string | null;
  forWhom?: 'SELF' | 'OTHER' | null;
  requesterSector?: string | null;
  costCenterId?: string | null;
  costCenterCode?: string | null;
  costCenterName?: string | null;
  atestadoType?: string | null;
  atestadoTypeLabel?: string | null;
  atestadoOtherType?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  numeroDias?: number | null;
  fileReceived?: boolean;
  fileNote?: string | null;
}

interface ConversationDetail {
  id: string;
  phone: string;
  flowStatus: string;
  currentStep: string | null;
  status: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  submissions: Submission[];
}

function formatPhone(phone: string) {
  const n = phone.replace(/\D/g, '');
  if (n.length === 11) return n.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (n.length === 10) return n.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return phone;
}

function getFileHref(url: string | null | undefined): string {
  if (!url) return '#';
  return absoluteUploadUrl(url) || '#';
}

type TabFiltro = 'todas' | 'atestados' | 'duvidas' | 'outros';

const ATESTADO_FLOW_STEPS = [
  'ATESTADO_ASK_FOR_WHOM',
  'ATESTADO_ASK_PERSON_NAME',
  'ATESTADO_ASK_REQUESTER_SECTOR',
  'ATESTADO_ASK_COST_CENTER',
  'ATESTADO_ASK_TYPE',
  'ATESTADO_ASK_OTHER_TYPE',
  'ATESTADO_ASK_START_DATE',
  'ATESTADO_ASK_END_DATE',
  'ATESTADO_ASK_DAYS',
  'ATESTADO_ASK_FILE',
  'ATESTADO_COMPLETE'
];

function getCategoriaConversa(flowStatus: string): TabFiltro {
  const status = (flowStatus || 'MENU').toUpperCase();
  if (ATESTADO_FLOW_STEPS.includes(status)) return 'atestados';
  if (status === 'DUVIDAS') return 'duvidas';
  return 'outros';
}

function filtrarPorAba(conversas: ConversationSummary[], aba: TabFiltro): ConversationSummary[] {
  if (aba === 'todas') return conversas;
  return conversas.filter((c) => getCategoriaConversa(c.flowStatus) === aba);
}

function isAtestadoPayload(p: unknown): p is AtestadoPayload {
  return p !== null && typeof p === 'object' && !Array.isArray(p);
}

function LinhaDado({
  icon: Icon,
  label,
  value
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
}) {
  const display = value?.trim() || '—';
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5 break-words">{display}</p>
      </div>
    </div>
  );
}

const ABAS: { id: TabFiltro; label: string; icon: React.ElementType }[] = [
  { id: 'todas', label: 'Todas', icon: LayoutList },
  { id: 'atestados', label: 'Atestados', icon: FileCheck },
  { id: 'duvidas', label: 'Dúvidas', icon: HelpCircle },
  { id: 'outros', label: 'Outros', icon: MoreHorizontal }
];

export default function ConversasWhatsAppPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [painelTab, setPainelTab] = useState<'atendimentos' | 'atestados'>('atendimentos');
  const [atendimentoTab, setAtendimentoTab] = useState<'aguardando' | 'andamento' | 'encerradas'>('aguardando');
  const [atestadoTab, setAtestadoTab] = useState<'pendentes' | 'finalizados'>('pendentes');
  const [isEndingConversation, setIsEndingConversation] = useState(false);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: listData, isLoading: loadingList } = useQuery({
    queryKey: ['whatsapp-conversations'],
    queryFn: async () => {
      const res = await api.get('/whatsapp/conversations');
      return res.data;
    },
    // Sobrescreve o padrão global (staleTime 5min + refetchOnWindowFocus false) para a lista aparecer quase em tempo real.
    staleTime: 0,
    refetchOnWindowFocus: true,
    // Nova conversa / contadores: polling curto enquanto a aba do navegador está visível.
    refetchInterval: () => {
      if (typeof document === 'undefined') return false;
      return document.hidden ? false : 2000;
    }
  });

  const { data: detailData, isLoading: loadingDetail } = useQuery({
    queryKey: ['whatsapp-conversation', selectedId],
    queryFn: async () => {
      if (!selectedId) return null;
      const res = await api.get(`/whatsapp/conversations/${selectedId}`);
      return res.data;
    },
    enabled: !!selectedId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    // Mensagens do cliente chegam pelo webhook; polling mantém o chat em tempo quase real.
    refetchInterval: (query) => {
      if (typeof document !== 'undefined' && document.hidden) return false;
      const body = query.state.data as { data?: ConversationDetail } | undefined;
      const status = body?.data?.status;
      if (status === undefined || status === 'PENDING') return 2000;
      return false;
    }
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    window.location.href = '/auth/login';
  };

  const conversations: ConversationSummary[] = listData?.data ?? [];
  const aguardandoAtendimento = conversations.filter((c) => c.status === 'PENDING' && !!c.attendantRequested);
  const atendimentoEmAndamento = conversations.filter((c) => c.status === 'PENDING' && !!c.attendantInProgress);
  const conversasEncerradas = conversations.filter((c) => c.status === 'COMPLETED' || c.status === 'CANCELLED');

  const conversasFiltradas =
    atendimentoTab === 'aguardando'
      ? aguardandoAtendimento
      : atendimentoTab === 'andamento'
        ? atendimentoEmAndamento
        : conversasEncerradas;
  const conversasAtestadoBase = conversations.filter(
    (c) => getCategoriaConversa(c.flowStatus) === 'atestados' || c.submissionCount > 0
  );
  const atestadosPendentes = conversasAtestadoBase.filter((c) => c.status === 'PENDING');
  const atestadosFinalizados = conversasAtestadoBase.filter((c) => c.status !== 'PENDING');
  const conversasAtestadoFiltradas = atestadoTab === 'pendentes' ? atestadosPendentes : atestadosFinalizados;
  const conversasVisiveis = painelTab === 'atendimentos' ? conversasFiltradas : conversasAtestadoFiltradas;
  const detail: ConversationDetail | null = detailData?.data ?? null;
  const isLoading = loadingUser || loadingList;
  const showLegacyData = painelTab === 'atestados';

  /** Categoria da conversa selecionada (para acompanhar aba só quando o status mudar na mesma conversa, ex. após refetch). */
  const lastSelectedIdForCategoryRef = useRef<string | null>(null);
  const selectedConversationCategoryKeyRef = useRef<string | null>(null);

  const tabForConversation = (c: ConversationSummary) =>
    c.status === 'PENDING' && !!c.attendantInProgress
      ? 'andamento'
      : c.status === 'PENDING' && !!c.attendantRequested
        ? 'aguardando'
        : 'encerradas';

  const conversationBelongsToTab = (
    c: ConversationSummary,
    tab: 'aguardando' | 'andamento' | 'encerradas'
  ) => tabForConversation(c) === tab;

  const handleAtendimentoTabChange = (tab: 'aguardando' | 'andamento' | 'encerradas') => {
    setAtendimentoTab(tab);
    if (!selectedId) return;
    const selected = conversations.find((x) => x.id === selectedId);
    if (!selected || !conversationBelongsToTab(selected, tab)) {
      setSelectedId(null);
    }
  };

  const handlePainelTabChange = (tab: 'atendimentos' | 'atestados') => {
    setPainelTab(tab);
    setSelectedId(null);
  };

  useEffect(() => {
    if (!selectedId) {
      lastSelectedIdForCategoryRef.current = null;
      selectedConversationCategoryKeyRef.current = null;
      return;
    }

    const selected = conversations.find((c) => c.id === selectedId);
    if (!selected) {
      setSelectedId(null);
      lastSelectedIdForCategoryRef.current = null;
      selectedConversationCategoryKeyRef.current = null;
      return;
    }

    const categoryKey = `${selected.status}:${String(!!selected.attendantRequested)}:${String(!!selected.attendantInProgress)}`;
    const sameSelection = lastSelectedIdForCategoryRef.current === selectedId;
    const prevKey = selectedConversationCategoryKeyRef.current;

    if (sameSelection && prevKey !== null && prevKey !== categoryKey) {
      setAtendimentoTab(tabForConversation(selected));
    }

    lastSelectedIdForCategoryRef.current = selectedId;
    selectedConversationCategoryKeyRef.current = categoryKey;
  }, [selectedId, conversations]);

  useEffect(() => {
    // Garante que o admin veja as mensagens mais recentes.
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [selectedId, detail?.messages?.length]);

  const getAtestadoName = (source: unknown): string | null => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const maybe = (source as any).name;
    if (typeof maybe !== 'string') return null;
    const v = maybe.trim();
    return v ? v : null;
  };

  const headerName = (() => {
    if (!detail) return null;
    const payloadAny = detail.payload as any;
    const payloadName =
      typeof payloadAny?.name === 'string' && payloadAny.name.trim()
        ? payloadAny.name.trim()
        : typeof payloadAny?.requesterName === 'string' && payloadAny.requesterName.trim()
          ? payloadAny.requesterName.trim()
          : typeof payloadAny?.waProfileName === 'string' && payloadAny.waProfileName.trim()
            ? payloadAny.waProfileName.trim()
            : null;
    if (payloadName) return payloadName;

    if (!showLegacyData) return null;
    if (payloadAny?.attendantRequested || payloadAny?.attendantInProgress) return null;

    const fromInProgress = detail.payload ? getAtestadoName(detail.payload) : null;
    if (fromInProgress) return fromInProgress;
    const certificateSubmissions = detail.submissions.filter((s) => s.type === 'MEDICAL_CERTIFICATE');
    if (certificateSubmissions.length === 0) return null;
    const last = certificateSubmissions[certificateSubmissions.length - 1];
    return last?.payload ? getAtestadoName(last.payload) : null;
  })();

  const handleRemoveConversation = async () => {
    if (!selectedId) return;
    if (!confirm('Tem certeza que deseja remover esta conversa?')) return;

    try {
      await api.delete(`/whatsapp/conversations/${selectedId}`);
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
    } catch (error) {
      console.error('Erro ao remover conversa:', error);
      alert('Erro ao remover a conversa.');
    }
  };

  const handleEndConversation = async () => {
    if (!selectedId) return;
    if (!confirm('Tem certeza que deseja encerrar esta conversa?')) return;

    try {
      setIsEndingConversation(true);
      await api.post(`/whatsapp/conversations/${selectedId}/end`);
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
    } catch (error) {
      console.error('Erro ao encerrar conversa:', error);
      alert('Erro ao encerrar a conversa.');
    } finally {
      setIsEndingConversation(false);
    }
  };

  const handleSendManualMessage = async () => {
    if (!selectedId) return;
    const content = replyText.trim();
    if (!content || isSending) return;

    try {
      setIsSending(true);
      await api.post(`/whatsapp/conversations/${selectedId}/messages`, { content });
      setReplyText('');
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-conversation', selectedId] });
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      alert('Erro ao enviar mensagem.');
    } finally {
      setIsSending(false);
    }
  };

  if (loadingUser) {
    return (
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={handleLogout}>
        <Loading />
      </MainLayout>
    );
  }

  return (
    <MainLayout
      userRole="EMPLOYEE"
      userName={userData?.data?.name ?? ''}
      onLogout={handleLogout}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Título e subtítulo centralizados */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            Central de Atendimentos
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
            {painelTab === 'atendimentos'
              ? 'Encaminhe, acompanhe e encerre conversas com atendente humano.'
              : 'Acompanhe os envios de atestado e os documentos recebidos.'}
          </p>
        </div>

        {/* Alternância de painel */}
        <div className="flex flex-wrap justify-center gap-2 p-1 bg-gray-100 dark:bg-gray-800/60 rounded-xl w-fit mx-auto">
          <button
            type="button"
            onClick={() => handlePainelTabChange('atendimentos')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              painelTab === 'atendimentos'
                ? 'bg-red-600 text-white dark:bg-red-500'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            Atendimentos
          </button>
          <button
            type="button"
            onClick={() => handlePainelTabChange('atestados')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              painelTab === 'atestados'
                ? 'bg-red-600 text-white dark:bg-red-500'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <FileCheck className="w-4 h-4 shrink-0" />
            Atestados
          </button>
        </div>

        {/* Filtros por etapa */}
        <div className="flex flex-wrap justify-center gap-2 p-1 bg-gray-100 dark:bg-gray-800/60 rounded-xl w-fit mx-auto">
          {painelTab === 'atendimentos' ? (
            <>
              <button
                type="button"
                onClick={() => handleAtendimentoTabChange('aguardando')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  atendimentoTab === 'aguardando'
                    ? 'bg-blue-600 text-white dark:bg-blue-500'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <HelpCircle className="w-4 h-4 shrink-0" />
                Aguardando atendente
                <span className={`ml-1 min-w-[1.25rem] text-center text-xs rounded-full px-1.5 ${atendimentoTab === 'aguardando' ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
                  {aguardandoAtendimento.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleAtendimentoTabChange('andamento')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  atendimentoTab === 'andamento'
                    ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <Clock className="w-4 h-4 shrink-0" />
                Em atendimento
                <span className={`ml-1 min-w-[1.25rem] text-center text-xs rounded-full px-1.5 ${atendimentoTab === 'andamento' ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
                  {atendimentoEmAndamento.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleAtendimentoTabChange('encerradas')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  atendimentoTab === 'encerradas'
                    ? 'bg-green-600 text-white dark:bg-green-500'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <FileCheck className="w-4 h-4 shrink-0" />
                Encerradas
                <span className={`ml-1 min-w-[1.25rem] text-center text-xs rounded-full px-1.5 ${atendimentoTab === 'encerradas' ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
                  {conversasEncerradas.length}
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAtestadoTab('pendentes')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  atestadoTab === 'pendentes'
                    ? 'bg-amber-600 text-white dark:bg-amber-500'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <Clock className="w-4 h-4 shrink-0" />
                Pendentes
                <span className={`ml-1 min-w-[1.25rem] text-center text-xs rounded-full px-1.5 ${atestadoTab === 'pendentes' ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
                  {atestadosPendentes.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAtestadoTab('finalizados')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  atestadoTab === 'finalizados'
                    ? 'bg-green-600 text-white dark:bg-green-500'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <FileCheck className="w-4 h-4 shrink-0" />
                Finalizados
                <span className={`ml-1 min-w-[1.25rem] text-center text-xs rounded-full px-1.5 ${atestadoTab === 'finalizados' ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
                  {atestadosFinalizados.length}
                </span>
              </button>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Lista de conversas (filtrada pela aba) */}
          <Card className="lg:col-span-1 shadow-sm">
            <CardHeader className="p-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {painelTab === 'atendimentos'
                  ? atendimentoTab === 'aguardando'
                    ? 'Aguardando atendente'
                    : atendimentoTab === 'andamento'
                      ? 'Em atendimento'
                      : 'Encerradas'
                  : atestadoTab === 'pendentes'
                    ? 'Atestados pendentes'
                    : 'Atestados finalizados'}
              </h2>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-gray-500" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">Carregando...</span>
                </div>
              ) : conversasVisiveis.length === 0 ? (
                <div className="py-10 px-6 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-700/60 mb-4">
                    <AlertCircle className="w-7 h-7 text-gray-500 dark:text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {painelTab === 'atendimentos'
                      ? atendimentoTab === 'aguardando'
                        ? 'Nenhuma conversa aguardando atendimento'
                        : atendimentoTab === 'andamento'
                          ? 'Nenhuma conversa em atendimento'
                          : 'Nenhuma conversa finalizada'
                      : atestadoTab === 'pendentes'
                        ? 'Nenhum atestado pendente'
                        : 'Nenhum atestado finalizado'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-[240px] mx-auto">
                    {painelTab === 'atendimentos'
                      ? atendimentoTab === 'encerradas'
                        ? 'Quando a conversa for concluída ou cancelada, ela aparece aqui.'
                        : 'Quando alguém solicitar atendimento humano, aparecerá aqui.'
                      : 'Quando houver envio de atestado pelo chatbot, ele aparecerá aqui.'}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[calc(100vh-20rem)] overflow-y-auto">
                  {conversasVisiveis.map((c) => {
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(c.id)}
                          className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-l-4 border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                            selectedId === c.id
                              ? 'bg-red-50 dark:bg-red-900/20 border-l-red-600 dark:border-l-red-500'
                              : ''
                          }`}
                        >
                          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 shrink-0">
                            {painelTab === 'atestados' ? (
                              <FileCheck className="w-4 h-4 text-red-600 dark:text-red-400" />
                            ) : c.attendantRequested ? (
                              <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            ) : c.attendantInProgress ? (
                              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            ) : c.status === 'COMPLETED' ? (
                              <FileCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                {c.name ? c.name : formatPhone(c.phone)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">
                              {c.lastMessage || 'Sem mensagens'}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              {c.lastMessageAt
                                ? format(new Date(c.lastMessageAt), "dd/MM/yyyy HH:mm", { locale: ptBR })
                                : format(new Date(c.updatedAt), "dd/MM/yyyy", { locale: ptBR })}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {c.status === 'PENDING' ? (
                                c.attendantRequested ? (
                                  <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                                    Aguardando atendente
                                  </span>
                                ) : c.attendantInProgress ? (
                                  <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200">
                                    Em atendimento
                                  </span>
                                ) : null
                              ) : null}
                              {c.status !== 'PENDING' && (
                                <span
                                  className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                                    c.status === 'COMPLETED'
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                      : c.status === 'CANCELLED'
                                        ? 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-200'
                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                  }`}
                                >
                                  {c.status === 'COMPLETED'
                                    ? 'Concluído'
                                    : c.status === 'CANCELLED'
                                      ? 'Encerrado'
                                      : c.status}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500 shrink-0" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Detalhe da conversa */}
          <div className="lg:col-span-2 min-h-[320px]">
            {!selectedId ? (
              <Card className="h-full min-h-[320px] flex items-center justify-center shadow-sm">
                <div className="text-center py-12 px-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-700/60 mb-4">
                    <MessageSquare className="w-8 h-8 text-gray-500 dark:text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Selecione uma conversa</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-[280px] mx-auto">
                    {painelTab === 'atendimentos'
                      ? 'Para ver as mensagens e tratar o atendimento humano.'
                      : 'Para ver os dados e os arquivos do atestado enviado.'}
                  </p>
                </div>
              </Card>
            ) : loadingDetail ? (
              <Card className="min-h-[320px] flex flex-col items-center justify-center gap-3 shadow-sm">
                <Loader2 className="w-10 h-10 animate-spin text-gray-400 dark:text-gray-500" />
                <span className="text-sm text-gray-500 dark:text-gray-400">Carregando conversa...</span>
              </Card>
            ) : detail ? (
              <Card className="shadow-sm">
                <CardHeader className="border-b border-gray-200 dark:border-gray-700 pb-3">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="lg:hidden flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-2 px-1 py-1 -ml-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" /> Voltar
                  </button>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 shrink-0">
                        <Phone className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {headerName ?? formatPhone(detail.phone)}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {formatPhone(detail.phone)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {painelTab === 'atendimentos' && detail.payload && (detail.payload as any).attendantRequested ? (
                        <span className="text-xs px-2 py-1 rounded-md shrink-0 font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                          Aguardando atendente
                        </span>
                      ) : painelTab === 'atendimentos' && detail.payload && (detail.payload as any).attendantInProgress ? (
                        <span className="text-xs px-2 py-1 rounded-md shrink-0 font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200">
                          Em atendimento
                        </span>
                      ) : null}
                      {detail.status !== 'PENDING' && (
                        <span
                          className={`text-xs px-2 py-1 rounded-md shrink-0 font-medium ${
                            detail.status === 'COMPLETED'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : detail.status === 'CANCELLED'
                                ? 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-200'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                          }`}
                        >
                          {detail.status === 'COMPLETED'
                            ? 'Concluído'
                            : detail.status === 'CANCELLED'
                              ? 'Encerrado'
                              : detail.status}
                        </span>
                      )}
                      {painelTab === 'atendimentos' && detail.status === 'PENDING' && (
                        <button
                          type="button"
                          onClick={handleEndConversation}
                          disabled={isEndingConversation}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white transition-colors"
                        >
                          <AlertCircle className="w-4 h-4" />
                          Encerrar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleRemoveConversation}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remover
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 space-y-6">
                  {detail.status === 'PENDING' && detail.payload && (detail.payload as any).attendantRequested ? (
                    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 flex items-start gap-3">
                      <AlertCircle className="w-4 h-4 text-blue-700 dark:text-blue-300 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Aguardando atendente</p>
                        <p className="text-sm text-blue-800 dark:text-blue-200 mt-1 break-words">
                          A pessoa solicitou atendimento. A conversa foi mantida aberta para o atendente responder no sistema.
                        </p>
                      </div>
                    </div>
                  ) : detail.status === 'PENDING' && detail.payload && (detail.payload as any).attendantInProgress ? (
                    <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 p-4 flex items-start gap-3">
                      <AlertCircle className="w-4 h-4 text-indigo-700 dark:text-indigo-300 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">Em atendimento</p>
                        <p className="text-sm text-indigo-800 dark:text-indigo-200 mt-1 break-words">
                          O atendimento humano foi iniciado. Use a conversa abaixo para continuar o atendimento.
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {/* Dados estruturados (atestados) — em destaque primeiro */}
                  {showLegacyData &&
                    detail.submissions.filter((s) => s.type === 'MEDICAL_CERTIFICATE').length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-red-600 dark:text-red-400" />
                        Dados do atestado
                      </h3>
                      <div className="space-y-4">
                        {detail.submissions
                          .filter((s) => s.type === 'MEDICAL_CERTIFICATE')
                          .map((s, idx) => {
                            const p = s.payload as AtestadoPayload | undefined;
                            const isPayload = isAtestadoPayload(p);
                            return (
                              <div
                                key={s.id}
                                className="rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-800/50"
                              >
                                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between flex-wrap gap-2 bg-gray-50 dark:bg-gray-800">
                                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {detail.submissions.filter((x) => x.type === 'MEDICAL_CERTIFICATE').length > 1
                                      ? `Atestado #${idx + 1}`
                                      : 'Atestado médico'}
                                  </span>
                                  <span
                                    className={`text-xs px-2 py-1 rounded-md ${
                                      s.status === 'PENDING'
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                        : s.status === 'PROCESSED' || s.status === 'APPROVED'
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                        : 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                                    }`}
                                  >
                                    {s.status === 'PENDING' ? 'Pendente' : s.status === 'PROCESSED' || s.status === 'APPROVED' ? 'Processado' : s.status}
                                  </span>
                                </div>
                                <div className="p-4 space-y-0">
                                  {isPayload ? (
                                    <>
                                      <LinhaDado icon={UserCircle} label="Nome completo" value={p.name} />
                                          <LinhaDado
                                            icon={UserCircle}
                                            label="Para quem"
                                            value={
                                              p.forWhom === 'SELF'
                                                ? 'Você'
                                                : p.forWhom === 'OTHER'
                                                  ? 'Outra pessoa'
                                                  : null
                                            }
                                          />
                                      {p.requesterSector && (
                                        <LinhaDado
                                          icon={Hash}
                                          label="Setor solicitante"
                                          value={p.requesterSector ?? null}
                                        />
                                      )}
                                          <LinhaDado
                                            icon={Hash}
                                            label="Centro de custo/contrato"
                                            value={
                                              p.costCenterCode
                                                ? `${p.costCenterCode}${p.costCenterName ? ` - ${p.costCenterName}` : ''}`
                                                : null
                                            }
                                          />
                                      <LinhaDado
                                        icon={FileType}
                                        label="Tipo de atestado"
                                        value={p.atestadoTypeLabel ?? p.atestadoType ?? null}
                                      />
                                          {p.atestadoOtherType && (
                                            <LinhaDado
                                              icon={FileType}
                                              label="Tipo específico (Outros)"
                                              value={p.atestadoOtherType}
                                            />
                                          )}
                                      <LinhaDado icon={Calendar} label="Data início" value={p.dataInicio ?? null} />
                                      <LinhaDado icon={Calendar} label="Data fim" value={p.dataFim ?? null} />
                                      <LinhaDado icon={Hash} label="Número de dias" value={p.numeroDias != null ? String(p.numeroDias) : null} />
                                      {(s.fileUrl || s.fileName) && (
                                        <div className="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                                          <Paperclip className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
                                          <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                              Arquivo do atestado
                                            </p>
                                            {s.fileUrl ? (
                                              <a
                                                href={getFileHref(s.fileUrl)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 mt-1 text-sm text-red-600 dark:text-red-400 hover:underline"
                                              >
                                                {s.fileName || 'Ver arquivo'}
                                              </a>
                                            ) : (
                                              <p className="text-sm text-gray-900 dark:text-gray-100 mt-1 break-all">
                                                {s.fileName || 'Arquivo recebido'}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                      <div className="flex items-start gap-3 py-2">
                                        <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                            Data do envio
                                          </p>
                                          <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
                                            {format(new Date(s.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                          </p>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="py-2 text-sm text-gray-500 dark:text-gray-400">
                                        Dados não disponíveis neste formato.
                                      </div>
                                      {(s.fileUrl || s.fileName) && (
                                        <>
                                          {s.fileUrl ? (
                                            <a
                                              href={getFileHref(s.fileUrl)}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 text-sm text-red-600 dark:text-red-400 hover:underline"
                                            >
                                              <Paperclip className="w-4 h-4" />
                                              {s.fileName || 'Ver arquivo'}
                                            </a>
                                          ) : (
                                            <div className="mt-2 text-sm text-gray-900 dark:text-gray-100 break-all">
                                              {s.fileName || 'Arquivo recebido'}
                                            </div>
                                          )}
                                        </>
                                      )}
                                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                                        <Clock className="w-3 h-3 inline mr-1" />
                                        {format(new Date(s.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                      </p>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Outros envios (não atestado) */}
                  {showLegacyData &&
                    detail.submissions.filter((s) => s.type !== 'MEDICAL_CERTIFICATE').length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        Outros envios
                      </h3>
                      <div className="space-y-2">
                        {detail.submissions
                          .filter((s) => s.type !== 'MEDICAL_CERTIFICATE')
                          .map((s) => (
                            <div
                              key={s.id}
                              className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 bg-gray-50 dark:bg-gray-700/30"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.type}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {format(new Date(s.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                </span>
                              </div>
                              {s.payload && typeof s.payload === 'object' && Object.keys(s.payload).length > 0 && (
                                <pre className="text-xs text-gray-600 dark:text-gray-400 mt-2 overflow-x-auto whitespace-pre-wrap break-words">
                                  {JSON.stringify(s.payload, null, 2)}
                                </pre>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Dados em preenchimento (payload da conversa sem submission ainda) */}
                  {showLegacyData &&
                    detail.payload &&
                    typeof detail.payload === 'object' &&
                    Object.keys(detail.payload).length > 0 &&
                    detail.submissions.filter((s) => s.type === 'MEDICAL_CERTIFICATE').length === 0 && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                          <FileCheck className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                          Dados informados (em andamento)
                        </h3>
                        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-4 bg-gray-50 dark:bg-gray-800/30">
                          {isAtestadoPayload(detail.payload as Record<string, unknown>) && (
                            <div className="space-y-0">
                              <LinhaDado icon={UserCircle} label="Nome completo" value={(detail.payload as AtestadoPayload).name} />
                              <LinhaDado
                                icon={UserCircle}
                                label="Para quem"
                                value={
                                  (detail.payload as AtestadoPayload).forWhom === 'SELF'
                                    ? 'Você'
                                    : (detail.payload as AtestadoPayload).forWhom === 'OTHER'
                                      ? 'Outra pessoa'
                                      : null
                                }
                              />
                              {(detail.payload as AtestadoPayload).requesterSector && (
                                <LinhaDado
                                  icon={Hash}
                                  label="Setor solicitante"
                                  value={(detail.payload as AtestadoPayload).requesterSector ?? null}
                                />
                              )}
                              <LinhaDado
                                icon={Hash}
                                label="Centro de custo/contrato"
                                value={
                                  (detail.payload as AtestadoPayload).costCenterCode
                                    ? `${(detail.payload as AtestadoPayload).costCenterCode}${(detail.payload as AtestadoPayload).costCenterName ? ` - ${(detail.payload as AtestadoPayload).costCenterName}` : ''}`
                                    : null
                                }
                              />
                              <LinhaDado
                                icon={FileType}
                                label="Tipo de atestado"
                                value={(detail.payload as AtestadoPayload).atestadoTypeLabel ?? (detail.payload as AtestadoPayload).atestadoType ?? null}
                              />
                              {(detail.payload as AtestadoPayload).atestadoOtherType && (
                                <LinhaDado
                                  icon={FileType}
                                  label="Tipo específico (Outros)"
                                  value={(detail.payload as AtestadoPayload).atestadoOtherType ?? undefined}
                                />
                              )}
                              <LinhaDado icon={Calendar} label="Data início" value={(detail.payload as AtestadoPayload).dataInicio ?? null} />
                              <LinhaDado icon={Calendar} label="Data fim" value={(detail.payload as AtestadoPayload).dataFim ?? null} />
                              <LinhaDado
                                icon={Hash}
                                label="Número de dias"
                                value={(detail.payload as AtestadoPayload).numeroDias != null ? String((detail.payload as AtestadoPayload).numeroDias) : null}
                              />
                            </div>
                          )}
                          {!isAtestadoPayload(detail.payload as Record<string, unknown>) && (
                            <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(detail.payload, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    )}

                  {/* Conversa (mensagens) */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-gray-500 dark:text-gray-400" /> Conversa
                    </h3>
                    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2">
                      {detail.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-xl px-3 py-2.5 ${
                              m.role === 'user'
                                ? 'bg-red-600 text-white dark:bg-red-500'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                            }`}
                          >
                            <div className="flex items-center gap-2 text-xs opacity-80 mb-1">
                              {m.role === 'user' ? (
                                <User className="w-3 h-3 shrink-0" />
                              ) : (
                                <Bot className="w-3 h-3 shrink-0" />
                              )}
                              <span className="font-medium text-gray-600 dark:text-gray-300">
                                {m.role === 'user' ? 'Cliente' : 'Sistema'}
                              </span>
                              <span>
                                {format(new Date(m.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                            {(m.mediaUrl || m.content === '[Arquivo enviado]') && (
                              m.mediaUrl ? (
                                <a
                                  href={getFileHref(m.mediaUrl)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 mt-2 text-xs underline"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  {m.fileName || 'Anexo'}
                                </a>
                              ) : (
                                <div className="inline-flex items-center gap-1 mt-2 text-xs opacity-80">
                                  <Paperclip className="w-3 h-3" />
                                  <span>{m.fileName || 'Arquivo enviado'}</span>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>

                    {painelTab === 'atendimentos' && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSendManualMessage();
                      }}
                      className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 items-end"
                    >
                      <div className="flex-1">
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder={
                            detail.status === 'PENDING'
                              ? 'Digite uma mensagem para a pessoa...'
                              : 'Conversa encerrada — não é possível enviar novas mensagens.'
                          }
                          disabled={detail.status !== 'PENDING' || isSending}
                          className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-gray-200 resize-none disabled:opacity-60 disabled:cursor-not-allowed"
                          rows={1}
                          style={{ minHeight: 42, maxHeight: 120 }}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={detail.status !== 'PENDING' || !replyText.trim() || isSending}
                        className="px-4 py-2.5 bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                      >
                        {isSending ? 'Enviando...' : 'Enviar'}
                      </button>
                    </form>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="min-h-[320px] flex items-center justify-center shadow-sm">
                <div className="text-center py-8 px-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Conversa não encontrada</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Tente selecionar outra conversa.</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
