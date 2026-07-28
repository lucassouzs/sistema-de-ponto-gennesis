'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Hand,
  Loader2,
  Maximize2,
  Minimize2,
  Info,
  Save,
  Search,
  Trash2,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import api from '@/lib/api';
import { exportLicitacaoAnalisePdf } from '@/lib/exportLicitacaoAnalisePdf';
import { LicitacaoChecklistEditor } from './LicitacaoChecklistEditor';
import { LicitacaoChecklistResumo } from './LicitacaoChecklistResumo';
import {
  LicitacaoNaoSeHabilitaPanel,
  type NaoSeHabilitaItem,
} from './LicitacaoNaoSeHabilitaPanel';
import { LicitacoesRegiaoPanel } from './LicitacoesRegiaoPanel';
import { BancoCatsPanel } from './BancoCatsPanel';
import { buildLicitacaoTituloDisplay } from './licitacaoDisplay';
import {
  emptyChecklistState,
  mergeChecklistFromSaved,
  serializeChecklistForSave,
  createUniqueChecklistItemId,
  buildChecklistResumo,
  LICITACAO_CHECKLIST,
  type ChecklistItemState,
  type ChecklistSectionDef,
} from './licitacaoChecklist';

const NOTEBOOK_LM_URL = 'https://notebooklm.google.com/';
const DRIVE_CATS_URL =
  'https://drive.google.com/drive/u/2/folders/16NH0gVAwbBV4_EMSCNUKiAE5pgKjZ9OW';
const NOTEBOOK_LM_LOGIN_EMAIL = 'contratos.licitacoesgennesis@gmail.com';

const LICITACAO_SELECTED_ID_KEY = 'licitacoes:selectedId';
const LICITACAO_VIEW_MODE_KEY = 'licitacoes:viewMode';
const AUTO_SAVE_MS = 60_000;

const BRASIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

type LicitacaoViewMode = 'analise' | 'arquivadas' | 'regioes' | 'banco-cats';

type LicitacaoArquivadaMotivo =
  | 'suspensa'
  | 'declinada'
  | 'encerrada'
  | 'em_andamento'
  | 'vencidas'
  | 'aguardando_aprovacao';

const ARQUIVADA_MOTIVO_OPTIONS: Array<{
  value: LicitacaoArquivadaMotivo;
  label: string;
  singular: string;
  confirm: string;
}> = [
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação', singular: 'Aguardando aprovação', confirm: 'aguardando aprovação' },
  { value: 'suspensa', label: 'Suspensas', singular: 'Suspensa', confirm: 'suspensa' },
  { value: 'declinada', label: 'Declinadas', singular: 'Declinada', confirm: 'declinada' },
  { value: 'encerrada', label: 'Encerradas', singular: 'Encerrada', confirm: 'encerrada' },
  { value: 'em_andamento', label: 'Em andamento', singular: 'Em andamento', confirm: 'em andamento' },
  { value: 'vencidas', label: 'Vencidas', singular: 'Vencida', confirm: 'vencida' },
];

function isArquivadaMotivoValue(value: unknown): value is LicitacaoArquivadaMotivo {
  return ARQUIVADA_MOTIVO_OPTIONS.some((item) => item.value === value);
}

function resolveArquivadaMotivo(
  lic: Pick<Licitacao, 'arquivadaMotivo' | 'analiseJson'>
): LicitacaoArquivadaMotivo | null {
  if (isArquivadaMotivoValue(lic.arquivadaMotivo)) return lic.arquivadaMotivo;
  const fromJson = lic.analiseJson?.arquivadaMotivo;
  if (isArquivadaMotivoValue(fromJson)) return fromJson;
  return null;
}

function arquivadaMotivoLabel(motivo?: LicitacaoArquivadaMotivo | null): string {
  const found = ARQUIVADA_MOTIVO_OPTIONS.find((item) => item.value === motivo);
  return found?.singular ?? 'Sem status';
}

function arquivadaMotivoConfirmLabel(motivo: LicitacaoArquivadaMotivo): string {
  const found = ARQUIVADA_MOTIVO_OPTIONS.find((item) => item.value === motivo);
  return found?.confirm ?? 'arquivada';
}

type LicitacaoDecisaoAnaliseFinal = 'participar' | 'participar_consorcio' | 'nao_participar';

const DECISAO_ANALISE_FINAL_OPTIONS: Array<{
  value: LicitacaoDecisaoAnaliseFinal;
  label: string;
}> = [
  { value: 'participar', label: 'Participar' },
  { value: 'participar_consorcio', label: 'Participar em consórcio' },
  { value: 'nao_participar', label: 'Não participar' },
];

function isDecisaoAnaliseFinalValue(value: unknown): value is LicitacaoDecisaoAnaliseFinal {
  return DECISAO_ANALISE_FINAL_OPTIONS.some((item) => item.value === value);
}

function decisaoAnaliseFinalButtonClass(
  value: LicitacaoDecisaoAnaliseFinal,
  active: boolean
): string {
  const base =
    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50';
  if (!active) {
    return `${base} border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800`;
  }
  switch (value) {
    case 'participar':
      return `${base} border-emerald-600 bg-emerald-600 text-white`;
    case 'participar_consorcio':
      return `${base} border-sky-600 bg-sky-600 text-white`;
    case 'nao_participar':
      return `${base} border-rose-600 bg-rose-600 text-white`;
  }
}

function resolveDecisaoAnaliseFinal(
  lic: Pick<Licitacao, 'analiseJson'>
): LicitacaoDecisaoAnaliseFinal | null {
  const fromJson = lic.analiseJson?.decisaoAnaliseFinal;
  return isDecisaoAnaliseFinalValue(fromJson) ? fromJson : null;
}

function decisaoAnaliseFinalLabel(decisao?: LicitacaoDecisaoAnaliseFinal | null): string | null {
  if (!decisao) return null;
  const found = DECISAO_ANALISE_FINAL_OPTIONS.find((item) => item.value === decisao);
  return found?.label ?? null;
}

function decisaoAnaliseFinalBadgeClass(
  decisao: LicitacaoDecisaoAnaliseFinal,
  active: boolean
): string {
  if (active) {
    switch (decisao) {
      case 'participar':
        return 'bg-emerald-400/30 text-white';
      case 'participar_consorcio':
        return 'bg-sky-400/30 text-white';
      case 'nao_participar':
        return 'bg-rose-400/30 text-white';
    }
  }
  switch (decisao) {
    case 'participar':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300';
    case 'participar_consorcio':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300';
    case 'nao_participar':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300';
  }
}

type LicitacaoRegiaoTab = {
  key: string;
  label: string;
  sheetName: string;
  count?: number;
};

type LicitacaoDocumento = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url?: string;
  storagePath?: string;
  createdAt: string;
};

type LicitacaoConversa = {
  pergunta: string;
  resposta: string;
  em: string;
};

type LicitacaoAnaliseJson = {
  ultimaExtracao?: Record<string, unknown> | null;
  historicoExtracoes?: Array<Record<string, unknown>>;
  conversas?: LicitacaoConversa[];
  resumoDocumentos?: string | null;
  analisePronta?: boolean;
  analiseProntaEm?: string | null;
  responsavelAnalise?: string | null;
  responsavelAnaliseId?: string | null;
  responsavelAnaliseEm?: string | null;
  analiseUsuario?: string | null;
  analiseUsuarioAtualizadaEm?: string | null;
  checklistAnalise?: Record<string, { checked: boolean; comentario: string }>;
  linkNotebookLm?: string | null;
  naoSeHabilita?: boolean;
  naoSeHabilitaItens?: NaoSeHabilitaItem[];
  indiceDocumentos?: Array<{ documentoId: string; nome: string }>;
  analiseManualFinalizada?: boolean;
  analiseManualFinalizadaEm?: string | null;
  arquivadaMotivo?: string | null;
  decisaoAnaliseFinal?: LicitacaoDecisaoAnaliseFinal | null;
  analiseFinalTexto?: string | null;
  origemRegiao?: {
    regiaoKey?: string | null;
    regiaoLabel?: string | null;
    estado?: string | null;
    rowSnapshot?: Record<string, string> | null;
  } | null;
};

type Licitacao = {
  id: string;
  titulo: string;
  tituloExibicao?: string | null;
  numeroProcesso: string | null;
  orgao: string | null;
  modalidade: string | null;
  status: string;
  objeto: string | null;
  valorEstimado: string | null;
  estado?: string | null;
  regiaoKey?: string | null;
  regiaoLabel?: string | null;
  vigenciaContrato: string | null;
  analiseJson: LicitacaoAnaliseJson | null;
  arquivada?: boolean;
  arquivadaEm?: string | null;
  arquivadaMotivo?: LicitacaoArquivadaMotivo | null;
  documentos: LicitacaoDocumento[];
  creator?: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

function formatDateOnly(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

function isAnaliseManualFinalizada(lic: Licitacao): boolean {
  return lic.analiseJson?.analiseManualFinalizada === true;
}

function parseResponsavelAnaliseIds(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of raw.split(/[,;|]/)) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function isAnaliseManualAssumida(lic: Licitacao): boolean {
  return parseResponsavelAnaliseIds(lic.analiseJson?.responsavelAnaliseId).length > 0;
}

function isLicitacaoEmAnaliseFinal(lic: Licitacao, inAnaliseFinalView = false): boolean {
  return lic.arquivada === true || inAnaliseFinalView;
}

function licitacaoStatusLabel(lic: Licitacao, inAnaliseFinalView = false): string {
  if (isLicitacaoEmAnaliseFinal(lic, inAnaliseFinalView)) {
    return arquivadaMotivoLabel(resolveArquivadaMotivo(lic));
  }
  if (isAnaliseManualFinalizada(lic)) return 'Análise finalizada';
  return isAnaliseManualAssumida(lic) ? 'Em análise' : 'Pendente análise';
}

function licitacaoStatusBadgeClass(
  lic: Licitacao,
  active: boolean,
  inAnaliseFinalView = false
): string {
  if (isLicitacaoEmAnaliseFinal(lic, inAnaliseFinalView)) {
    if (active) {
      return 'bg-white/20 text-white';
    }
    switch (resolveArquivadaMotivo(lic)) {
      case 'suspensa':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300';
      case 'declinada':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300';
      case 'encerrada':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
      case 'em_andamento':
        return 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300';
      case 'vencidas':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300';
      case 'aguardando_aprovacao':
        return 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300';
      default:
        return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';
    }
  }
  const finalizada = isAnaliseManualFinalizada(lic);
  const assumida = isAnaliseManualAssumida(lic);
  if (active) {
    return finalizada || assumida
      ? 'bg-white/20 text-white'
      : 'bg-white/15 text-red-50';
  }
  if (finalizada) {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300';
  }
  if (assumida) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300';
  }
  return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';
}

function tituloParaExibicao(lic: Licitacao | null | undefined, list: Licitacao[]): string {
  if (!lic) return '';
  const fromList = list.find((item) => item.id === lic.id);
  return buildLicitacaoTituloDisplay(fromList ?? lic);
}

function normalizeNotebookLmUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isValidNotebookLmUrl(value: string): boolean {
  const normalized = normalizeNotebookLmUrl(value);
  if (!normalized) return false;
  try {
    const url = new URL(normalized);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function LicitacoesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const loadedForLicitacaoIdRef = useRef<string | null>(null);
  const hasUserEditedRef = useRef(false);
  const prevChecklistSectionIdsKeyRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [search, setSearch] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [regiaoKey, setRegiaoKey] = useState('');
  const [planilhaRegiaoKey, setPlanilhaRegiaoKey] = useState('centro-oeste');
  const [estado, setEstado] = useState('');
  const [arquivadaMotivoFilter, setArquivadaMotivoFilter] = useState<LicitacaoArquivadaMotivo | ''>(
    ''
  );
  const [decisaoAnaliseFinalFilter, setDecisaoAnaliseFinalFilter] = useState<
    LicitacaoDecisaoAnaliseFinal | ''
  >('');
  const [listPanelExpanded, setListPanelExpanded] = useState(false);
  const [selectedId, setSelectedIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(LICITACAO_SELECTED_ID_KEY);
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [responsavelAnalise, setResponsavelAnalise] = useState('');
  const [linkNotebookLm, setLinkNotebookLm] = useState('');
  const [naoSeHabilita, setNaoSeHabilita] = useState(false);
  const [naoSeHabilitaItens, setNaoSeHabilitaItens] = useState<NaoSeHabilitaItem[]>([]);
  const [analiseUsuario, setAnaliseUsuario] = useState('');
  const [decisaoAnaliseFinal, setDecisaoAnaliseFinal] =
    useState<LicitacaoDecisaoAnaliseFinal | null>(null);
  const [analiseFinalTexto, setAnaliseFinalTexto] = useState('');
  const [checklistState, setChecklistState] = useState<Record<string, ChecklistItemState>>(
    () => emptyChecklistState()
  );
  const [viewMode, setViewModeState] = useState<LicitacaoViewMode>(() => {
    if (typeof window === 'undefined') return 'analise';
    const saved = sessionStorage.getItem(LICITACAO_VIEW_MODE_KEY);
    if (saved === 'regioes' || saved === 'arquivadas' || saved === 'banco-cats') return saved;
    return 'analise';
  });

  const setViewMode = useCallback((mode: LicitacaoViewMode) => {
    setViewModeState(mode);
    setListPanelExpanded(false);
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(LICITACAO_VIEW_MODE_KEY, mode);
  }, []);

  const isArquivadasView = viewMode === 'arquivadas';
  const showAnaliseLayout = viewMode === 'analise' || viewMode === 'arquivadas';

  useEffect(() => {
    if (!listPanelExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setListPanelExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [listPanelExpanded]);

  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIdState(id);
    if (typeof window === 'undefined') return;
    if (id) sessionStorage.setItem(LICITACAO_SELECTED_ID_KEY, id);
    else sessionStorage.removeItem(LICITACAO_SELECTED_ID_KEY);
  }, []);

  const analiseManualRef = useRef({
    responsavelAnalise: '',
    linkNotebookLm: '',
    analiseUsuario: '',
    decisaoAnaliseFinal: null as LicitacaoDecisaoAnaliseFinal | null,
    analiseFinalTexto: '',
    checklistState: {} as Record<string, ChecklistItemState>,
    naoSeHabilita: false,
    naoSeHabilitaItens: [] as NaoSeHabilitaItem[],
  });
  const selectedIdRef = useRef<string | null>(selectedId);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const { data: checklistTemplateQuery } = useQuery({
    queryKey: ['licitacao-checklist-template'],
    queryFn: async () => {
      try {
        const res = await api.get('/licitacoes/checklist-template');
        return {
          sections: (res.data?.data ?? LICITACAO_CHECKLIST) as ChecklistSectionDef[],
          canManage: Boolean(res.data?.canManage),
        };
      } catch {
        return {
          sections: LICITACAO_CHECKLIST,
          canManage: false,
        };
      }
    },
    retry: false,
  });

  const checklistSections = useMemo(
    () => checklistTemplateQuery?.sections ?? LICITACAO_CHECKLIST,
    [checklistTemplateQuery?.sections]
  );
  const checklistSectionIdsKey = useMemo(
    () => checklistSections.map((s) => s.id).join('|'),
    [checklistSections]
  );
  const canManageChecklistItems = checklistTemplateQuery?.canManage ?? false;

  const checklistResumo = useMemo(
    () => buildChecklistResumo(checklistSections, checklistState),
    [checklistSections, checklistState]
  );

  const { data: regiaoTabs = [], isLoading: loadingRegiaoTabs } = useQuery({
    queryKey: ['licitacoes-planilha-regioes'],
    queryFn: async () => {
      const res = await api.get('/licitacoes/planilha-regioes');
      return (res.data?.data ?? []) as LicitacaoRegiaoTab[];
    },
    staleTime: 30_000,
    refetchInterval: viewMode === 'regioes' ? 30_000 : false,
  });

  const { data: listRaw = [], isLoading: loadingList } = useQuery({
    queryKey: [
      'licitacoes',
      isArquivadasView ? 'arquivadas' : 'ativas',
      search,
      dataInicio,
      dataFim,
      regiaoKey,
      estado,
      isArquivadasView ? arquivadaMotivoFilter : '',
    ],
    queryFn: async () => {
      const params: Record<string, string> = {
        arquivada: isArquivadasView ? 'true' : 'false',
      };
      if (search.trim()) params.search = search.trim();
      if (dataInicio) params.dataInicio = dataInicio;
      if (dataFim) params.dataFim = dataFim;
      if (regiaoKey) params.regiaoKey = regiaoKey;
      if (estado) params.estado = estado;
      if (isArquivadasView && arquivadaMotivoFilter) {
        params.arquivadaMotivo = arquivadaMotivoFilter;
      }
      const res = await api.get('/licitacoes', { params });
      return (res.data?.data ?? []) as Licitacao[];
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    enabled: showAnaliseLayout,
  });

  // Somente arquivadas de fato (ação do usuário) entram na aba Arquivadas.
  const list = useMemo(
    () =>
      listRaw.filter((item) => {
        if (isArquivadasView) {
          if (item.arquivada !== true) return false;
          if (arquivadaMotivoFilter && resolveArquivadaMotivo(item) !== arquivadaMotivoFilter) {
            return false;
          }
          if (
            decisaoAnaliseFinalFilter &&
            resolveDecisaoAnaliseFinal(item) !== decisaoAnaliseFinalFilter
          ) {
            return false;
          }
          return true;
        }
        return item.arquivada !== true;
      }),
    [arquivadaMotivoFilter, decisaoAnaliseFinalFilter, isArquivadasView, listRaw]
  );

  const hasActiveFilters = Boolean(
    dataInicio ||
      dataFim ||
      regiaoKey ||
      estado ||
      arquivadaMotivoFilter ||
      decisaoAnaliseFinalFilter
  );
  const hasSearchOrFilters = Boolean(search.trim() || hasActiveFilters);

  const { data: selected, isLoading: loadingSelected } = useQuery({
    queryKey: ['licitacao', selectedId],
    queryFn: async () => {
      const res = await api.get(`/licitacoes/${selectedId}`);
      return res.data?.data as Licitacao;
    },
    enabled: !!selectedId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const display = useMemo(() => {
    if (!selected) return null;
    const fromList = list.find((item) => item.id === selected.id);
    if (!fromList) return selected;
    return {
      ...fromList,
      ...selected,
      estado: selected.estado ?? fromList.estado,
      regiaoKey: selected.regiaoKey ?? fromList.regiaoKey,
      regiaoLabel: selected.regiaoLabel ?? fromList.regiaoLabel,
      valorEstimado: selected.valorEstimado ?? fromList.valorEstimado,
      arquivadaMotivo: selected.arquivadaMotivo ?? fromList.arquivadaMotivo,
      analiseJson: {
        ...(fromList.analiseJson ?? {}),
        ...(selected.analiseJson ?? {}),
        origemRegiao:
          selected.analiseJson?.origemRegiao ?? fromList.analiseJson?.origemRegiao ?? null,
      },
    };
  }, [selected, list]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    if (!selectedId) {
      loadedForLicitacaoIdRef.current = null;
      prevChecklistSectionIdsKeyRef.current = null;
    }
  }, [selectedId]);

  useEffect(() => {
    analiseManualRef.current = {
      responsavelAnalise,
      linkNotebookLm,
      analiseUsuario,
      decisaoAnaliseFinal,
      analiseFinalTexto,
      checklistState,
      naoSeHabilita,
      naoSeHabilitaItens,
    };
  }, [
    responsavelAnalise,
    linkNotebookLm,
    analiseUsuario,
    decisaoAnaliseFinal,
    analiseFinalTexto,
    checklistState,
    naoSeHabilita,
    naoSeHabilitaItens,
  ]);

  useEffect(() => {
    if (!selectedId) {
      hasUserEditedRef.current = false;
      setResponsavelAnalise('');
      setLinkNotebookLm('');
      setNaoSeHabilita(false);
      setNaoSeHabilitaItens([]);
      setAnaliseUsuario('');
      setDecisaoAnaliseFinal(null);
      setAnaliseFinalTexto('');
      setChecklistState(emptyChecklistState(checklistSections));
      return;
    }
    if (!selected || selected.id !== selectedId) return;
    if (loadedForLicitacaoIdRef.current === selectedId) return;

    loadedForLicitacaoIdRef.current = selectedId;
    hasUserEditedRef.current = false;

    const savedResponsavelId = selected.analiseJson?.responsavelAnaliseId?.trim() ?? '';
    const savedResponsavel = selected.analiseJson?.responsavelAnalise?.trim() ?? '';
    // Só considera assumida se houver ID (clique em Assumir). Nome legado sozinho não trava.
    setResponsavelAnalise(savedResponsavelId ? savedResponsavel : '');
    analiseManualRef.current = {
      ...analiseManualRef.current,
      responsavelAnalise: savedResponsavelId ? savedResponsavel : '',
    };
    setLinkNotebookLm(selected.analiseJson?.linkNotebookLm ?? '');
    setNaoSeHabilita(selected.analiseJson?.naoSeHabilita === true);
    setNaoSeHabilitaItens(
      Array.isArray(selected.analiseJson?.naoSeHabilitaItens)
        ? selected.analiseJson.naoSeHabilitaItens
            .filter(
              (item): item is NaoSeHabilitaItem =>
                Boolean(item) &&
                typeof item.id === 'string' &&
                typeof item.title === 'string'
            )
            .map((item) => ({
              id: item.id,
              title: item.title,
              isDone: item.isDone === true,
            }))
        : []
    );
    setAnaliseUsuario(selected.analiseJson?.analiseUsuario ?? '');
    setDecisaoAnaliseFinal(
      isDecisaoAnaliseFinalValue(selected.analiseJson?.decisaoAnaliseFinal)
        ? selected.analiseJson.decisaoAnaliseFinal
        : null
    );
    setAnaliseFinalTexto(selected.analiseJson?.analiseFinalTexto ?? '');
    setChecklistState(
      mergeChecklistFromSaved(selected.analiseJson?.checklistAnalise, checklistSections)
    );
  }, [selectedId, selected, checklistSections]);

  useEffect(() => {
    if (!selectedId) {
      prevChecklistSectionIdsKeyRef.current = null;
      return;
    }
    if (prevChecklistSectionIdsKeyRef.current === null) {
      prevChecklistSectionIdsKeyRef.current = checklistSectionIdsKey;
      return;
    }
    if (prevChecklistSectionIdsKeyRef.current === checklistSectionIdsKey) return;
    prevChecklistSectionIdsKeyRef.current = checklistSectionIdsKey;

    setChecklistState((prev) => {
      const next = emptyChecklistState(checklistSections);
      let changed = false;
      for (const key of Object.keys(next)) {
        if (prev[key]) {
          next[key] = prev[key];
        } else {
          changed = true;
        }
      }
      if (!changed) return prev;
      return next;
    });
  }, [selectedId, checklistSectionIdsKey, checklistSections]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
    if (selectedId) void queryClient.invalidateQueries({ queryKey: ['licitacao', selectedId] });
  }, [queryClient, selectedId]);

  const updateChecklistTemplateMutation = useMutation({
    mutationFn: async (sections: ChecklistSectionDef[]) => {
      const res = await api.put('/licitacoes/checklist-template', { sections });
      return res.data?.data as ChecklistSectionDef[];
    },
    onSuccess: (sections) => {
      queryClient.setQueryData(['licitacao-checklist-template'], {
        sections,
        canManage: canManageChecklistItems,
      });
      setChecklistState((prev) => {
        const next = emptyChecklistState(sections);
        for (const key of Object.keys(next)) {
          if (prev[key]) next[key] = prev[key];
        }
        return next;
      });
      toast.success('Checklist atualizado');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao atualizar checklist');
    },
  });

  const handleAddChecklistItem = useCallback(
    async (sectionId: string, label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const next = checklistSections.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          items: [
            ...section.items,
            { id: createUniqueChecklistItemId(section, trimmed), label: trimmed },
          ],
        };
      });
      await updateChecklistTemplateMutation.mutateAsync(next);
    },
    [checklistSections, updateChecklistTemplateMutation]
  );

  const handleRemoveChecklistItem = useCallback(
    async (sectionId: string, itemId: string) => {
      const section = checklistSections.find((s) => s.id === sectionId);
      const item = section?.items.find((i) => i.id === itemId);
      if (!item) return;
      if (!window.confirm(`Excluir o item «${item.label}»?`)) return;
      const next = checklistSections.map((s) =>
        s.id !== sectionId ? s : { ...s, items: s.items.filter((i) => i.id !== itemId) }
      );
      await updateChecklistTemplateMutation.mutateAsync(next);
    },
    [checklistSections, updateChecklistTemplateMutation]
  );

  const saveAnaliseMutation = useMutation({
    mutationFn: async (opts?: { silent?: boolean }) => {
      const id = selectedIdRef.current;
      if (!id) throw new Error('Nenhuma licitação selecionada');
      const payload = analiseManualRef.current;
      const res = await api.patch(`/licitacoes/${id}/analise-manual`, {
        linkNotebookLm: payload.linkNotebookLm,
        analiseUsuario: payload.analiseUsuario,
        decisaoAnaliseFinal: payload.decisaoAnaliseFinal,
        analiseFinalTexto: payload.analiseFinalTexto,
        checklistAnalise: serializeChecklistForSave(payload.checklistState),
        naoSeHabilita: payload.naoSeHabilita,
        naoSeHabilitaItens: payload.naoSeHabilitaItens,
      });
      return { licitacao: res.data?.data as Licitacao, silent: opts?.silent ?? false, id };
    },
    onMutate: () => {
      setSaveStatus('saving');
    },
    onSuccess: ({ licitacao, silent, id }) => {
      queryClient.setQueryData(['licitacao', id], licitacao);
      setSaveStatus('saved');
      if (!silent) toast.success('Checklist e análise salvos');
      void queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setSaveStatus('error');
      toast.error(err.response?.data?.message ?? 'Erro ao salvar checklist');
    },
  });

  const saveAnaliseRef = useRef(saveAnaliseMutation.mutate);
  saveAnaliseRef.current = saveAnaliseMutation.mutate;

  const triggerSave = useCallback(() => {
    if (!selectedIdRef.current || !hasUserEditedRef.current) return;
    // Não reinicia o timer a cada tecla — salva no máximo a cada 60s.
    if (autoSaveTimerRef.current) return;
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      if (!selectedIdRef.current || !hasUserEditedRef.current) return;
      saveAnaliseRef.current({ silent: true });
    }, AUTO_SAVE_MS);
  }, []);

  const handleSaveAnaliseNow = useCallback(() => {
    if (!selectedIdRef.current) return;
    hasUserEditedRef.current = true;
    analiseManualRef.current = {
      responsavelAnalise,
      linkNotebookLm,
      analiseUsuario,
      decisaoAnaliseFinal,
      analiseFinalTexto,
      checklistState,
      naoSeHabilita,
      naoSeHabilitaItens,
    };
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    saveAnaliseMutation.mutate({ silent: false });
  }, [
    saveAnaliseMutation,
    responsavelAnalise,
    linkNotebookLm,
    analiseUsuario,
    decisaoAnaliseFinal,
    analiseFinalTexto,
    checklistState,
    naoSeHabilita,
    naoSeHabilitaItens,
  ]);

  const finalizarAnaliseMutation = useMutation({
    mutationFn: async () => {
      const id = selectedIdRef.current;
      if (!id) throw new Error('Nenhuma licitação selecionada');

      analiseManualRef.current = {
        responsavelAnalise,
        linkNotebookLm,
        analiseUsuario,
        decisaoAnaliseFinal,
        analiseFinalTexto,
        checklistState,
        naoSeHabilita,
        naoSeHabilitaItens,
      };
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      if (hasUserEditedRef.current) {
        await saveAnaliseMutation.mutateAsync({ silent: true });
        hasUserEditedRef.current = false;
      }

      const res = await api.patch(`/licitacoes/${id}/finalizar-analise`);
      return res.data?.data as Licitacao;
    },
    onSuccess: (licitacao) => {
      if (selectedId) {
        queryClient.setQueryData(['licitacao', selectedId], licitacao);
      }
      toast.success('Análise finalizada.');
      void queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao finalizar análise');
    },
  });

  const handleFinalizarAnalise = useCallback(() => {
    if (!selectedId || finalizarAnaliseMutation.isPending) return;
    if (!isValidNotebookLmUrl(linkNotebookLm)) {
      toast.error('Informe o link do caderno no Notebook LM para finalizar a análise.');
      return;
    }
    if (
      !window.confirm(
        'Finalizar a análise desta licitação? Você ainda poderá editar depois; o status voltará para "Em análise".'
      )
    ) {
      return;
    }
    finalizarAnaliseMutation.mutate();
  }, [finalizarAnaliseMutation, linkNotebookLm, selectedId]);

  const handleExportChecklistPdf = useCallback(async () => {
    if (!selected) return;

    setExportingPdf(true);
    try {
      const manual = analiseManualRef.current;
      const sections = buildChecklistResumo(checklistSections, manual.checklistState);
      const responsavel =
        manual.responsavelAnalise.trim() || userData?.data?.name?.trim() || '';

      await exportLicitacaoAnalisePdf({
        titulo: tituloParaExibicao(display ?? selected, list),
        responsavelAnalise: responsavel,
        linkNotebookLm: manual.linkNotebookLm,
        analiseUsuario: manual.analiseUsuario,
        naoSeHabilita: manual.naoSeHabilita,
        naoSeHabilitaItens: manual.naoSeHabilitaItens.map((item) => ({
          title: item.title,
          isDone: item.isDone,
        })),
        sections: sections.map((section) => ({
          title: section.title,
          items: section.items.map((item) => ({
            label: item.label,
            checked: item.checked,
            comentario: item.comentario,
          })),
        })),
      });

      toast.success('Checklist exportado em PDF.');
    } catch {
      toast.error('Erro ao gerar o PDF. Tente novamente.');
    } finally {
      setExportingPdf(false);
    }
  }, [checklistSections, display, list, selected, userData?.data?.name]);

  const updateChecklistItem = useCallback(
    (key: string, patch: Partial<ChecklistItemState>) => {
      hasUserEditedRef.current = true;
      setChecklistState((prev) => {
        const next = {
          ...prev,
          [key]: { ...(prev[key] ?? { checked: false, comentario: '' }), ...patch },
        };
        analiseManualRef.current = { ...analiseManualRef.current, checklistState: next };
        return next;
      });
      triggerSave();
    },
    [triggerSave]
  );

  const assumirAnaliseMutation = useMutation({
    mutationFn: async () => {
      const id = selectedIdRef.current;
      if (!id) throw new Error('Nenhuma licitação selecionada');
      const res = await api.patch(`/licitacoes/${id}/assumir-analise`);
      return {
        licitacao: res.data?.data as Licitacao,
        id,
        message: res.data?.message as string | undefined,
      };
    },
    onSuccess: ({ licitacao, id, message }) => {
      queryClient.setQueryData(['licitacao', id], licitacao);
      setResponsavelAnalise(licitacao.analiseJson?.responsavelAnalise?.trim() ?? '');
      analiseManualRef.current = {
        ...analiseManualRef.current,
        responsavelAnalise: licitacao.analiseJson?.responsavelAnalise?.trim() ?? '',
      };
      toast.success(message ?? 'Análise assumida com sucesso.');
      void queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Não foi possível assumir a análise.');
      void queryClient.invalidateQueries({ queryKey: ['licitacao', selectedId] });
      void queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
    },
  });

  const liberarAnaliseMutation = useMutation({
    mutationFn: async () => {
      const id = selectedIdRef.current;
      if (!id) throw new Error('Nenhuma licitação selecionada');
      const res = await api.patch(`/licitacoes/${id}/liberar-analise`);
      return {
        licitacao: res.data?.data as Licitacao,
        id,
        message: res.data?.message as string | undefined,
      };
    },
    onSuccess: ({ licitacao, id, message }) => {
      queryClient.setQueryData(['licitacao', id], licitacao);
      setResponsavelAnalise('');
      analiseManualRef.current = { ...analiseManualRef.current, responsavelAnalise: '' };
      toast.success(message ?? 'Análise liberada.');
      void queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Não foi possível liberar a análise.');
    },
  });

  const handleLinkNotebookLmChange = useCallback(
    (value: string) => {
      hasUserEditedRef.current = true;
      setLinkNotebookLm(value);
      analiseManualRef.current = { ...analiseManualRef.current, linkNotebookLm: value };
      triggerSave();
    },
    [triggerSave]
  );

  const handleNaoSeHabilitaChange = useCallback(
    (enabled: boolean) => {
      hasUserEditedRef.current = true;
      setNaoSeHabilita(enabled);
      analiseManualRef.current = { ...analiseManualRef.current, naoSeHabilita: enabled };
      triggerSave();
    },
    [triggerSave]
  );

  const handleNaoSeHabilitaItensChange = useCallback(
    (items: NaoSeHabilitaItem[]) => {
      hasUserEditedRef.current = true;
      setNaoSeHabilitaItens(items);
      analiseManualRef.current = { ...analiseManualRef.current, naoSeHabilitaItens: items };
      triggerSave();
    },
    [triggerSave]
  );

  const handleAnaliseUsuarioChange = useCallback(
    (value: string) => {
      hasUserEditedRef.current = true;
      setAnaliseUsuario(value);
      analiseManualRef.current = { ...analiseManualRef.current, analiseUsuario: value };
      triggerSave();
    },
    [triggerSave]
  );

  const handleDecisaoAnaliseFinal = useCallback((value: LicitacaoDecisaoAnaliseFinal) => {
    setDecisaoAnaliseFinal(value);
    analiseManualRef.current = { ...analiseManualRef.current, decisaoAnaliseFinal: value };
  }, []);

  const handleAnaliseFinalTextoChange = useCallback((value: string) => {
    setAnaliseFinalTexto(value);
    analiseManualRef.current = { ...analiseManualRef.current, analiseFinalTexto: value };
  }, []);

  const decisaoSalva = display ? resolveDecisaoAnaliseFinal(display) : null;
  const analiseFinalTextoSalva = display?.analiseJson?.analiseFinalTexto ?? '';
  const decisaoFinalDirty =
    decisaoAnaliseFinal !== decisaoSalva || analiseFinalTexto !== analiseFinalTextoSalva;

  const saveDecisaoFinalMutation = useMutation({
    mutationFn: async () => {
      const id = selectedIdRef.current;
      if (!id) throw new Error('Nenhuma licitação selecionada');
      if (!decisaoAnaliseFinal) throw new Error('Selecione uma decisão antes de salvar');
      const res = await api.patch(`/licitacoes/${id}/analise-manual`, {
        decisaoAnaliseFinal,
        analiseFinalTexto,
      });
      return { licitacao: res.data?.data as Licitacao, id };
    },
    onSuccess: ({ licitacao, id }) => {
      queryClient.setQueryData(['licitacao', id], licitacao);
      queryClient.setQueriesData<Licitacao[]>({ queryKey: ['licitacoes'] }, (old) => {
        if (!old) return old;
        return old.map((item) =>
          item.id === id
            ? {
                ...item,
                analiseJson: {
                  ...(item.analiseJson ?? {}),
                  ...(licitacao.analiseJson ?? {}),
                },
              }
            : item
        );
      });
      toast.success('Decisão salva com sucesso');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao salvar decisão');
    },
  });

  const handleSalvarDecisaoFinal = useCallback(() => {
    if (!selectedIdRef.current || !decisaoAnaliseFinal || !decisaoFinalDirty) return;
    saveDecisaoFinalMutation.mutate();
  }, [decisaoAnaliseFinal, decisaoFinalDirty, saveDecisaoFinalMutation]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/licitacoes/${id}`);
      return id;
    },
    onSuccess: (id) => {
      toast.success('Processo excluído da análise');
      if (selectedId === id) setSelectedId(null);
      queryClient.removeQueries({ queryKey: ['licitacao', id] });
      void queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      void queryClient.invalidateQueries({ queryKey: ['licitacoes-planilha-regioes'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao excluir');
    },
  });

  const arquivarMutation = useMutation({
    mutationFn: async ({
      id,
      motivo,
    }: {
      id: string;
      motivo: LicitacaoArquivadaMotivo;
    }) => {
      const res = await api.patch(`/licitacoes/${id}/arquivar`, { motivo });
      return {
        licitacao: res.data?.data as Licitacao,
        message: (res.data?.message as string | undefined) ?? 'Análise arquivada.',
      };
    },
    onSuccess: ({ licitacao, message }) => {
      toast.success(message);
      if (!isArquivadasView && selectedId === licitacao.id) {
        setSelectedId(null);
      }
      queryClient.removeQueries({ queryKey: ['licitacao', licitacao.id] });
      void queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao arquivar análise');
    },
  });

  const desarquivarMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/licitacoes/${id}/desarquivar`);
      return res.data?.data as Licitacao;
    },
    onSuccess: (licitacao) => {
      toast.success('Análise restaurada para a fila de processos.');
      if (selectedId === licitacao.id) setSelectedId(null);
      queryClient.removeQueries({ queryKey: ['licitacao', licitacao.id] });
      void queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao desarquivar análise');
    },
  });

  const handleAtualizarStatusAnalise = useCallback(
    (motivo: LicitacaoArquivadaMotivo) => {
      if (!selectedId || arquivarMutation.isPending) return;
      const atual = display ? resolveArquivadaMotivo(display) : null;
      if (atual === motivo) return;
      const confirmMessage = isArquivadasView
        ? `Alterar status para ${arquivadaMotivoConfirmLabel(motivo)}?`
        : `Definir status como ${arquivadaMotivoConfirmLabel(motivo)}? A análise sairá da lista de processos e ficará disponível em Análise final.`;
      if (!window.confirm(confirmMessage)) return;
      arquivarMutation.mutate({ id: selectedId, motivo });
    },
    [arquivarMutation, display, isArquivadasView, selectedId]
  );

  const handleDesarquivarAnalise = useCallback(() => {
    if (!selectedId || desarquivarMutation.isPending) return;
    if (
      !window.confirm(
        'Restaurar esta análise para a lista de processos a serem analisados?'
      )
    ) {
      return;
    }
    desarquivarMutation.mutate(selectedId);
  }, [desarquivarMutation, selectedId]);

  useEffect(() => {
    const flushPendingSave = () => {
      if (!selectedIdRef.current || !hasUserEditedRef.current) return;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      saveAnaliseRef.current({ silent: true });
    };
    window.addEventListener('beforeunload', flushPendingSave);
    return () => window.removeEventListener('beforeunload', flushPendingSave);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const currentUserId =
    typeof userData?.data?.id === 'string' ? userData.data.id : '';
  const isAdminUser =
    Boolean(userData?.data?.isAdmin) ||
    String(userData?.data?.employee?.position ?? '').toLowerCase() === 'administrador';

  const claimedIds = parseResponsavelAnaliseIds(display?.analiseJson?.responsavelAnaliseId);
  const claimedByName = claimedIds.length
    ? display?.analiseJson?.responsavelAnalise?.trim() || responsavelAnalise.trim() || ''
    : '';
  // Assumida somente após clique em «Assumir tarefa» (grava responsavelAnaliseId).
  const isClaimed = claimedIds.length > 0;
  const isClaimedByMe = Boolean(
    currentUserId && claimedIds.includes(currentUserId)
  );
  const isClaimedByOther = Boolean(isClaimed && !isClaimedByMe);
  const canEditAnaliseManual =
    !isArquivadasView &&
    !(display && isAnaliseManualFinalizada(display)) &&
    (isClaimedByMe || (isAdminUser && isClaimed));
  const canLiberarAnalise = isClaimed && (isClaimedByMe || isAdminUser);

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/licitacoes">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-4">
            <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <div className="text-center lg:col-start-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                  Licitações
                </h1>
                <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
                  Processos, checklist de análise manual e licitações por região.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 lg:col-start-3 lg:row-start-1 lg:justify-end">
                <span className="group/notebook-info relative shrink-0">
                  <button
                    type="button"
                    aria-describedby="notebook-lm-login-hint"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  >
                    <Info className="h-4 w-4" aria-hidden />
                  </button>
                  <span
                    id="notebook-lm-login-hint"
                    role="tooltip"
                    className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-max max-w-[16rem] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-left text-xs font-normal leading-relaxed text-gray-700 opacity-0 shadow-lg transition-opacity duration-150 invisible group-hover/notebook-info:visible group-hover/notebook-info:opacity-100 group-focus-within/notebook-info:visible group-focus-within/notebook-info:opacity-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                  >
                    Acesse com o e-mail {NOTEBOOK_LM_LOGIN_EMAIL}.
                  </span>
                </span>
                <a
                  href={NOTEBOOK_LM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                  Abrir Notebook LM
                </a>
              </div>
            </div>
          </header>

          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav
              className="-mb-px flex flex-wrap justify-center gap-x-4 gap-y-2 overflow-x-auto sm:gap-x-6"
              role="tablist"
              aria-label="Seções do módulo"
            >
              {(
                [
                  { id: 'analise' as const, label: 'Em Análise' },
                  { id: 'arquivadas' as const, label: 'Análise Final' },
                  { id: 'regioes' as const, label: 'Por Região' },
                  { id: 'banco-cats' as const, label: 'Banco CATs' },
                ] as const
              ).map((tab) => {
                const active = viewMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      if (tab.id === 'arquivadas') setSelectedId(null);
                      setViewMode(tab.id);
                    }}
                    className={`whitespace-nowrap rounded-t-lg border-b-2 px-2 py-2.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                      active
                        ? 'border-red-500 text-red-600 dark:border-red-400 dark:text-red-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {viewMode === 'banco-cats' ? (
            <div
              role="note"
              className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 gap-2.5">
                <Info
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
                  aria-hidden
                />
                <div className="min-w-0 space-y-1.5">
                  <p className="text-sm leading-relaxed text-amber-950 dark:text-amber-100">
                    A consulta de habilitação técnica é baseada no banco de dados das CAT&apos;s.
                    Caso sua busca não retorne o resultado desejado, complemente sua pesquisa nos
                    PDFs disponíveis no drive do setor de contratos.
                  </p>
                  <p className="text-sm leading-relaxed text-amber-950 dark:text-amber-100">
                    Atente-se para grafia de sua pesquisa, teste diferentes combinações de
                    palavras-chave.
                  </p>
                </div>
              </div>
              <a
                href={DRIVE_CATS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-50 dark:hover:bg-amber-950/80"
              >
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                Abrir drive das CATs
              </a>
            </div>
          ) : null}

          {viewMode === 'regioes' ? (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav
                className="-mb-px flex flex-wrap justify-center gap-x-1 gap-y-2 overflow-x-auto sm:gap-x-2"
                role="tablist"
                aria-label="Regiões"
              >
                {(loadingRegiaoTabs && regiaoTabs.length === 0
                  ? [
                      { key: 'centro-oeste', label: 'Região Centro-Oeste' },
                      { key: 'sudeste', label: 'Região Sudeste' },
                      { key: 'nordeste', label: 'Região Nordeste' },
                      { key: 'sul', label: 'Região Sul' },
                      { key: 'norte', label: 'Região Norte' },
                    ]
                  : regiaoTabs
                ).map((tab) => {
                  const active = tab.key === planilhaRegiaoKey;
                  const count =
                    typeof (tab as LicitacaoRegiaoTab).count === 'number'
                      ? (tab as LicitacaoRegiaoTab).count
                      : null;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setPlanilhaRegiaoKey(tab.key)}
                      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-2 py-2.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                        active
                          ? 'border-red-500 text-red-600 dark:border-red-400 dark:text-red-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      <span>{tab.label.replace(/^Região\s+/i, '')}</span>
                      {count != null ? (
                        <span
                          className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                            active
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300'
                          }`}
                        >
                          {count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </nav>
            </div>
          ) : null}

          {viewMode === 'regioes' ? (
            <LicitacoesRegiaoPanel regiaoKey={planilhaRegiaoKey} />
          ) : viewMode === 'banco-cats' ? (
            <BancoCatsPanel />
          ) : (
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            {/* Sidebar */}
            {listPanelExpanded ? (
              <div
                className="fixed inset-0 z-40 bg-black/50"
                aria-hidden
                onClick={() => setListPanelExpanded(false)}
              />
            ) : null}
            <aside
              className={
                listPanelExpanded
                  ? 'fixed left-1/2 top-1/2 z-50 w-[min(100%-1.5rem,56rem)] -translate-x-1/2 -translate-y-1/2'
                  : 'w-full shrink-0 lg:w-72 xl:w-80'
              }
            >
              <Card
                padding="none"
                className={
                  listPanelExpanded
                    ? 'flex h-[min(900px,92vh)] flex-col overflow-hidden shadow-2xl'
                    : 'flex max-h-[min(380px,45vh)] flex-col overflow-hidden shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)]'
                }
              >
                <CardHeader className="shrink-0 space-y-2.5 border-b border-gray-100 px-4 pb-3 pt-4 dark:border-gray-800">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Licitações
                      </h2>
                      {listPanelExpanded && list.length > 0 ? (
                        <p className="mt-0.5 text-xs text-gray-400">
                          {list.length}{' '}
                          {list.length === 1 ? 'licitação' : 'licitações'}
                          {hasActiveFilters ? ' (filtradas)' : ''}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title={listPanelExpanded ? 'Recolher lista' : 'Expandir lista'}
                        aria-label={listPanelExpanded ? 'Recolher lista' : 'Expandir lista'}
                        aria-expanded={listPanelExpanded}
                        onClick={() => setListPanelExpanded((v) => !v)}
                        className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                      >
                        {listPanelExpanded ? (
                          <Minimize2 className="h-4 w-4" />
                        ) : (
                          <Maximize2 className="h-4 w-4" />
                        )}
                      </button>
                      {listPanelExpanded ? (
                        <button
                          type="button"
                          title="Fechar"
                          aria-label="Fechar lista expandida"
                          onClick={() => setListPanelExpanded(false)}
                          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div
                    className={
                      listPanelExpanded
                        ? 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'
                        : 'space-y-2.5'
                    }
                  >
                    <div className={listPanelExpanded ? 'relative sm:col-span-2 lg:col-span-3' : 'relative'}>
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-9 w-full rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                      />
                    </div>
                    <div
                      className={
                        listPanelExpanded
                          ? 'contents'
                          : 'grid grid-cols-2 gap-2'
                      }
                    >
                      <input
                        type="date"
                        aria-label="De"
                        value={dataInicio}
                        onChange={(e) => setDataInicio(e.target.value)}
                        className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900"
                      />
                      <input
                        type="date"
                        aria-label="Até"
                        value={dataFim}
                        min={dataInicio || undefined}
                        onChange={(e) => setDataFim(e.target.value)}
                        className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900"
                      />
                    </div>
                    <select
                      aria-label="Região"
                      value={regiaoKey}
                      onChange={(e) => setRegiaoKey(e.target.value)}
                      className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="">Todas as regiões</option>
                      {regiaoTabs.map((tab) => (
                        <option key={tab.key} value={tab.key}>
                          {tab.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Estado"
                      value={estado}
                      onChange={(e) => setEstado(e.target.value)}
                      className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="">Todos os estados</option>
                      {BRASIL_UFS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                    {isArquivadasView ? (
                      <select
                        aria-label="Categoria do arquivamento"
                        value={arquivadaMotivoFilter}
                        onChange={(e) =>
                          setArquivadaMotivoFilter(
                            e.target.value as LicitacaoArquivadaMotivo | ''
                          )
                        }
                        className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900"
                      >
                        <option value="">Todas as categorias</option>
                        {ARQUIVADA_MOTIVO_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {isArquivadasView ? (
                      <select
                        aria-label="Decisão de participação"
                        value={decisaoAnaliseFinalFilter}
                        onChange={(e) =>
                          setDecisaoAnaliseFinalFilter(
                            e.target.value as LicitacaoDecisaoAnaliseFinal | ''
                          )
                        }
                        className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900"
                      >
                        <option value="">Todas as decisões</option>
                        {DECISAO_ANALISE_FINAL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setDataInicio('');
                        setDataFim('');
                        setRegiaoKey('');
                        setEstado('');
                        setArquivadaMotivoFilter('');
                        setDecisaoAnaliseFinalFilter('');
                      }}
                      className="text-left text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      Limpar filtros
                    </button>
                  ) : null}
                </CardHeader>

                <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2">
                  {loadingList ? (
                    <div className="flex flex-1 items-center justify-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-red-600" />
                    </div>
                  ) : list.length === 0 ? (
                    <p className="py-10 text-center text-sm text-gray-500">
                      {hasSearchOrFilters
                        ? 'Nenhum resultado.'
                        : isArquivadasView
                          ? arquivadaMotivoFilter || decisaoAnaliseFinalFilter
                            ? 'Nenhuma análise com os filtros selecionados.'
                            : 'Nenhuma análise em Análise final.'
                          : 'Nenhum processo com aceite. Aceite licitações na aba Por região.'}
                    </p>
                  ) : (
                    <ul
                      className="min-h-0 flex-1 divide-y divide-gray-200 overflow-y-auto pr-0.5 dark:divide-gray-700"
                      role="listbox"
                      aria-label="Licitações"
                    >
                      {list.map((item) => {
                        const active = selectedId === item.id;
                        const statusLabel = licitacaoStatusLabel(item, isArquivadasView);
                        const decisao = isArquivadasView ? resolveDecisaoAnaliseFinal(item) : null;
                        const decisaoLabel = decisaoAnaliseFinalLabel(decisao);
                        const statusDate = isArquivadasView && item.arquivadaEm
                          ? formatDateOnly(item.arquivadaEm)
                          : formatDateOnly(item.createdAt);
                        const titulo = tituloParaExibicao(item, list);
                        const responsavelLabel =
                          !isArquivadasView && item.analiseJson?.responsavelAnaliseId?.trim()
                            ? item.analiseJson.responsavelAnalise?.trim() || 'Assumida'
                            : !isArquivadasView
                              ? 'Disponível'
                              : null;
                        return (
                          <li key={item.id} className="group relative py-0.5 first:pt-0 last:pb-0">
                            <button
                              type="button"
                              role="option"
                              aria-selected={active}
                              onClick={() => {
                                setSelectedId(item.id);
                                if (listPanelExpanded) setListPanelExpanded(false);
                              }}
                              className={`w-full rounded-lg text-left transition-colors ${
                                listPanelExpanded ? 'px-4 py-3 pr-10' : 'px-3 py-2.5 pr-9'
                              } ${
                                active
                                  ? 'bg-red-600 text-white shadow-sm'
                                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                              }`}
                            >
                              <div
                                className={`flex gap-3 ${
                                  listPanelExpanded
                                    ? 'flex-col sm:flex-row sm:items-start sm:justify-between'
                                    : 'items-start justify-between'
                                }`}
                              >
                                <p
                                  className={`min-w-0 text-sm font-medium ${
                                    listPanelExpanded
                                      ? 'whitespace-normal break-words'
                                      : 'truncate'
                                  }`}
                                  title={titulo}
                                >
                                  {titulo}
                                </p>
                                <div
                                  className={`flex shrink-0 gap-1 ${
                                    listPanelExpanded
                                      ? 'flex-row flex-wrap items-center'
                                      : 'flex-col items-end'
                                  }`}
                                >
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight ${licitacaoStatusBadgeClass(item, active, isArquivadasView)}`}
                                  >
                                    {statusLabel}
                                  </span>
                                  {decisaoLabel ? (
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight ${decisaoAnaliseFinalBadgeClass(decisao!, active)}`}
                                    >
                                      {decisaoLabel}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <p
                                className={`mt-1 text-xs ${active ? 'text-red-100' : 'text-gray-500'}`}
                              >
                                {listPanelExpanded ? (
                                  <>
                                    <span>{statusDate}</span>
                                    {item.estado ? (
                                      <>
                                        {' · '}
                                        <span>{item.estado}</span>
                                      </>
                                    ) : null}
                                    {item.regiaoKey ? (
                                      <>
                                        {' · '}
                                        <span>
                                          {regiaoTabs.find((t) => t.key === item.regiaoKey)
                                            ?.label ?? item.regiaoKey}
                                        </span>
                                      </>
                                    ) : null}
                                    {responsavelLabel ? (
                                      <>
                                        {' · '}
                                        <span>{responsavelLabel}</span>
                                      </>
                                    ) : null}
                                  </>
                                ) : (
                                  <>
                                    {statusLabel}
                                    {decisaoLabel ? ` · ${decisaoLabel}` : ''} · {statusDate}
                                    {responsavelLabel ? ` · ${responsavelLabel}` : ''}
                                  </>
                                )}
                              </p>
                            </button>
                            <button
                              type="button"
                              title="Excluir processo"
                              disabled={deleteMutation.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  window.confirm(
                                    'Excluir este processo da análise? O aceite na planilha será mantido.'
                                  )
                                ) {
                                  deleteMutation.mutate(item.id);
                                }
                              }}
                              className={`absolute right-1.5 top-1.5 rounded-md p-1.5 opacity-80 transition-opacity hover:opacity-100 disabled:opacity-40 ${
                                active
                                  ? 'text-white hover:bg-white/20'
                                  : 'text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40'
                              }`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </aside>

            {/* Conteúdo principal */}
            <main className="min-w-0 flex-1 space-y-5">
              {!selectedId ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/40">
                      <FileText className="h-6 w-6 text-red-600 dark:text-red-400" />
                    </div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      Selecione um processo na lista
                    </p>
                    <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                      {isArquivadasView
                        ? 'Consulte as análises finalizadas pela lista ao lado.'
                        : 'Processos aparecem aqui após o aceite em Por região.'}
                    </p>
                  </CardContent>
                </Card>
              ) : loadingSelected || !display ? (
                <Card>
                  <CardContent className="flex justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-red-600" />
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card padding="none">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2
                            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
                            title={tituloParaExibicao(display, list)}
                          >
                            {tituloParaExibicao(display, list)}
                          </h2>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${licitacaoStatusBadgeClass(display, false, isArquivadasView)}`}
                          >
                            {licitacaoStatusLabel(display, isArquivadasView)}
                          </span>
                          {isArquivadasView &&
                          decisaoAnaliseFinalLabel(resolveDecisaoAnaliseFinal(display)) ? (
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${decisaoAnaliseFinalBadgeClass(resolveDecisaoAnaliseFinal(display)!, false)}`}
                            >
                              {decisaoAnaliseFinalLabel(resolveDecisaoAnaliseFinal(display))}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {isArquivadasView && display.arquivadaEm
                            ? formatDateOnly(display.arquivadaEm)
                            : formatDateOnly(display.createdAt)}
                          {display.creator?.name ? ` · ${display.creator.name}` : ''}
                          {display.estado ? ` · ${display.estado}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {isArquivadasView ? (
                          <>
                            <label className="relative inline-flex items-center">
                              <ChevronDown
                                className="pointer-events-none absolute right-2.5 h-4 w-4 text-gray-400"
                                aria-hidden
                              />
                              <select
                                aria-label="Status"
                                disabled={arquivarMutation.isPending || desarquivarMutation.isPending}
                                value={display ? resolveArquivadaMotivo(display) ?? '' : ''}
                                onChange={(e) => {
                                  const motivo = e.target.value as LicitacaoArquivadaMotivo | '';
                                  if (!motivo) return;
                                  handleAtualizarStatusAnalise(motivo);
                                }}
                                className="inline-flex h-9 appearance-none rounded-lg border border-gray-300 bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                              >
                                <option value="" disabled>
                                  Status
                                </option>
                                {ARQUIVADA_MOTIVO_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              disabled={desarquivarMutation.isPending}
                              onClick={handleDesarquivarAnalise}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              {desarquivarMutation.isPending ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Restaurando…
                                </span>
                              ) : (
                                'Reabrir análise'
                              )}
                            </button>
                          </>
                        ) : !display.arquivada ? (
                          <label className="relative inline-flex items-center">
                            <ChevronDown
                              className="pointer-events-none absolute right-2.5 h-4 w-4 text-gray-400"
                              aria-hidden
                            />
                            <select
                              aria-label="Status"
                              disabled={
                                saveAnaliseMutation.isPending ||
                                arquivarMutation.isPending ||
                                finalizarAnaliseMutation.isPending
                              }
                              defaultValue=""
                              onChange={(e) => {
                                const motivo = e.target.value as LicitacaoArquivadaMotivo | '';
                                e.currentTarget.value = '';
                                if (!motivo) return;
                                handleAtualizarStatusAnalise(motivo);
                              }}
                              className="inline-flex h-9 appearance-none rounded-lg border border-gray-300 bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                            >
                              <option value="" disabled>
                                {arquivarMutation.isPending ? 'Salvando…' : 'Status'}
                              </option>
                              {ARQUIVADA_MOTIVO_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                'Excluir este processo da análise? O aceite na planilha será mantido.'
                              )
                            ) {
                              deleteMutation.mutate(display.id);
                            }
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </Card>

                  {isArquivadasView ? (
                    <Card padding="none" className="shadow-sm">
                      <CardContent className="space-y-4 px-5 py-4">
                        <div>
                          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            Decisão
                          </span>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-2">
                              {DECISAO_ANALISE_FINAL_OPTIONS.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  disabled={
                                    saveAnaliseMutation.isPending ||
                                    saveDecisaoFinalMutation.isPending
                                  }
                                  onClick={() => handleDecisaoAnaliseFinal(option.value)}
                                  className={decisaoAnaliseFinalButtonClass(
                                    option.value,
                                    decisaoAnaliseFinal === option.value
                                  )}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={handleSalvarDecisaoFinal}
                              disabled={
                                !decisaoAnaliseFinal ||
                                !decisaoFinalDirty ||
                                saveDecisaoFinalMutation.isPending
                              }
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {saveDecisaoFinalMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                              ) : (
                                <Save className="h-4 w-4" aria-hidden />
                              )}
                              Salvar decisão
                            </button>
                          </div>
                        </div>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            Análise final
                          </span>
                          <textarea
                            value={analiseFinalTexto}
                            onChange={(e) => handleAnaliseFinalTextoChange(e.target.value)}
                            rows={5}
                            placeholder="Registre a conclusão da análise final, observações e recomendações…"
                            disabled={
                              saveAnaliseMutation.isPending || saveDecisaoFinalMutation.isPending
                            }
                            className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm leading-relaxed text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                          />
                        </label>
                      </CardContent>
                    </Card>
                  ) : null}

                  <Card padding="none" className="shadow-sm">
                    <CardContent className="px-5 py-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Link do caderno no Notebook LM
                          <span className="ml-0.5 text-red-600" aria-hidden="true">
                            *
                          </span>
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="url"
                            value={linkNotebookLm}
                            onChange={(e) => handleLinkNotebookLmChange(e.target.value)}
                            placeholder="https://notebooklm.google.com/..."
                            disabled={!canEditAnaliseManual || saveAnaliseMutation.isPending}
                            className="h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-70 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-950"
                          />
                          {isValidNotebookLmUrl(linkNotebookLm) ? (
                            <a
                              href={normalizeNotebookLmUrl(linkNotebookLm)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Abrir
                            </a>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Obrigatório para finalizar a análise.
                        </p>
                      </label>
                    </CardContent>
                  </Card>

                  <LicitacaoNaoSeHabilitaPanel
                    enabled={naoSeHabilita}
                    onEnabledChange={handleNaoSeHabilitaChange}
                    items={naoSeHabilitaItens}
                    onItemsChange={handleNaoSeHabilitaItensChange}
                    disabled={!canEditAnaliseManual || saveAnaliseMutation.isPending}
                  />

                  <Card padding="none" className="flex flex-col overflow-hidden shadow-sm">
                    <CardHeader className="shrink-0 border-b border-gray-100 px-5 py-3 dark:border-gray-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="h-5 w-5 text-red-600" />
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                            Checklist
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleExportChecklistPdf()}
                          disabled={exportingPdf || !selected}
                          className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                        >
                          {exportingPdf ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Download className="h-4 w-4" aria-hidden />
                          )}
                          {exportingPdf ? 'Gerando PDF…' : 'Exportar checklist PDF'}
                        </button>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 px-5 py-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="min-w-0 flex-1">
                            <span className="mb-0.5 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Responsável pela análise
                            </span>
                            <input
                              type="text"
                              value={responsavelAnalise}
                              readOnly
                              placeholder="Ninguém assumiu ainda"
                              className="h-9 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100"
                            />
                          </label>
                          {!isArquivadasView && !isAnaliseManualFinalizada(display) ? (
                            <>
                              {!isClaimedByMe ? (
                                <button
                                  type="button"
                                  disabled={
                                    assumirAnaliseMutation.isPending ||
                                    liberarAnaliseMutation.isPending
                                  }
                                  onClick={() => assumirAnaliseMutation.mutate()}
                                  title={
                                    isClaimed
                                      ? 'Entrar nesta análise junto com os responsáveis atuais'
                                      : 'Assumir esta análise'
                                  }
                                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {assumirAnaliseMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                  ) : (
                                    <Hand className="h-4 w-4" aria-hidden />
                                  )}
                                  {isClaimed ? 'Entrar na análise' : 'Assumir tarefa'}
                                </button>
                              ) : null}
                              {canLiberarAnalise ? (
                                <button
                                  type="button"
                                  disabled={
                                    assumirAnaliseMutation.isPending ||
                                    liberarAnaliseMutation.isPending
                                  }
                                  onClick={() => {
                                    const confirmMsg = isClaimedByMe
                                      ? claimedIds.length > 1
                                        ? 'Remover seu nome desta análise? Os demais responsáveis continuam.'
                                        : 'Liberar esta análise para que outro usuário possa assumi-la?'
                                      : 'Liberar todos os responsáveis desta análise?';
                                    if (window.confirm(confirmMsg)) {
                                      liberarAnaliseMutation.mutate();
                                    }
                                  }}
                                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                  {liberarAnaliseMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                  ) : (
                                    <UserCheck className="h-4 w-4" aria-hidden />
                                  )}
                                  Liberar
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                        {isClaimedByOther && !isArquivadasView ? (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                            Esta análise está com <strong>{claimedByName}</strong>. Clique em{' '}
                            <strong>Entrar na análise</strong> para participar e editar, ou peça a
                            liberação.
                            {isAdminUser ? ' Como administrador, você também pode liberar a tarefa.' : ''}
                          </p>
                        ) : null}
                        {isClaimedByMe && !isArquivadasView ? (
                          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                            {claimedIds.length > 1
                              ? `Você e outros estão nesta análise (${claimedByName}).`
                              : 'Você assumiu esta análise. Outros usuários podem entrar para analisar junto.'}
                          </p>
                        ) : null}
                        {!isClaimed && !isArquivadasView && !isAnaliseManualFinalizada(display) ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Clique em <strong>Assumir tarefa</strong> antes de analisar. Mais de uma
                            pessoa pode assumir a mesma solicitação.
                          </p>
                        ) : null}
                      </div>
                      <div className="h-[min(68vh,720px)] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-3 dark:border-gray-700 dark:bg-gray-950/30">
                        <LicitacaoChecklistEditor
                          key={selectedId}
                          sections={checklistSections}
                          state={checklistState}
                          onChange={updateChecklistItem}
                          disabled={
                            saveAnaliseMutation.isPending ||
                            finalizarAnaliseMutation.isPending ||
                            !canEditAnaliseManual
                          }
                          canManageItems={canManageChecklistItems}
                          onAddItem={handleAddChecklistItem}
                          onRemoveItem={handleRemoveChecklistItem}
                          managingItems={updateChecklistTemplateMutation.isPending}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card padding="none" className="flex flex-col overflow-hidden shadow-sm">
                    <CardHeader className="shrink-0 border-b border-gray-100 px-5 py-3 dark:border-gray-800">
                      <div className="flex items-center gap-2">
                        <User className="h-5 w-5 text-red-600" />
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          Sua análise
                        </h3>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 px-5 py-4">
                      <textarea
                        value={analiseUsuario}
                        onChange={(e) => handleAnaliseUsuarioChange(e.target.value)}
                        rows={12}
                        placeholder="Descreva sua análise: riscos, oportunidades, recomendações, observações gerais…"
                        disabled={saveAnaliseMutation.isPending || !canEditAnaliseManual}
                        className="min-h-[240px] w-full resize-y rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm leading-relaxed text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-70 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-950"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                        <span className="text-xs text-gray-500">
                          {saveAnaliseMutation.isPending || saveStatus === 'saving'
                            ? 'Salvando…'
                            : saveStatus === 'saved'
                              ? 'Salvo'
                              : saveStatus === 'error'
                                ? 'Erro ao salvar'
                                : display && isAnaliseManualFinalizada(display)
                                  ? 'Análise finalizada'
                                  : !isClaimed
                                    ? 'Assuma a tarefa para editar'
                                    : 'Salva automaticamente'}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {display && !isArquivadasView && !isAnaliseManualFinalizada(display) ? (
                            <button
                              type="button"
                              disabled={
                                !canEditAnaliseManual ||
                                saveAnaliseMutation.isPending ||
                                finalizarAnaliseMutation.isPending ||
                                !isValidNotebookLmUrl(linkNotebookLm)
                              }
                              title={
                                isValidNotebookLmUrl(linkNotebookLm)
                                  ? undefined
                                  : 'Informe o link do caderno no Notebook LM'
                              }
                              onClick={handleFinalizarAnalise}
                              className="rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                            >
                              {finalizarAnaliseMutation.isPending ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Finalizando…
                                </span>
                              ) : (
                                'Finalizar Análise'
                              )}
                            </button>
                          ) : null}
                          {!isArquivadasView ? (
                            <button
                              type="button"
                              disabled={
                                !canEditAnaliseManual ||
                                saveAnaliseMutation.isPending ||
                                finalizarAnaliseMutation.isPending ||
                                arquivarMutation.isPending
                              }
                              onClick={handleSaveAnaliseNow}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              Salvar agora
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card padding="none" className="shadow-sm">
                    <CardHeader className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="h-5 w-5 text-red-600" />
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                            Análise de Viabilidade
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleExportChecklistPdf()}
                          disabled={exportingPdf || !selected}
                          className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                        >
                          {exportingPdf ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Download className="h-4 w-4" aria-hidden />
                          )}
                          {exportingPdf ? 'Gerando PDF…' : 'Exportar checklist PDF'}
                        </button>
                      </div>
                    </CardHeader>
                    <CardContent className="px-5 pb-5">
                      <LicitacaoChecklistResumo
                        sections={checklistResumo}
                        responsavelAnalise={
                          responsavelAnalise.trim() || userData?.data?.name?.trim() || ''
                        }
                        linkNotebookLm={linkNotebookLm}
                        selectedTitulo={tituloParaExibicao(display, list)}
                        analiseUsuario={analiseUsuario}
                      />
                    </CardContent>
                  </Card>
                </>
              )}
            </main>
            </div>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
