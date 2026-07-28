'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  DownloadCloud,
  ExternalLink,
  Filter,
  FolderKanban,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Send,
  Square,
  ThumbsDown,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { Loading } from '@/components/ui/Loading';
import {
  cadastroListClasses,
  RowActionMenuCell,
  RowActionMenuPortal,
} from '@/components/ui/RowActionMenu';
import { getListTableRowClassName } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { useRightClickPanScroll } from '@/hooks/useRightClickPanScroll';
import api from '@/lib/api';
import {
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

type PncpUfProgress = {
  uf: string;
  status: 'pending' | 'running' | 'done' | 'error';
  upsertedThisRun: number;
  lastSuccessAt?: string | null;
  lastAttemptAt?: string | null;
  lastStatus?: string | null;
  lastErrorMessage?: string | null;
};

type PncpSyncStatus = {
  running: boolean;
  currentUf?: string | null;
  currentModalidade?: string | null;
  syncOptions?: {
    ufs: string[];
    retryErrorsOnly: boolean;
    incremental: boolean;
    staleOnly?: boolean;
    fullResync?: boolean;
  } | null;
  progress?: {
    totalUfs: number;
    doneUfs: number;
    pendingUfs: number;
    pagesFetched: number;
    upserted: number;
    rateLimitHits: number;
    lookbackDays: number;
    startedAt: string | null;
    ufs: PncpUfProgress[];
  } | null;
  mirror?: {
    total: number;
    byUf: { uf: string; count: number }[];
  };
  errorUfCount?: number;
  lastRun: {
    id: string;
    status: string;
    trigger: string;
    startedAt: string;
    finishedAt: string | null;
    lookbackDays: number;
    pagesFetched: number;
    upserted: number;
    pruned: number;
    rateLimitHits: number;
    errorMessage: string | null;
  } | null;
};

const BRASIL_UFS = [
  'DF', 'GO', 'SP',
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'ES', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'TO',
] as const;

type PncpSyncRequest = {
  ufs?: string[];
  retryErrorsOnly?: boolean;
  incremental?: boolean;
  staleOnly?: boolean;
  fullResync?: boolean;
};

const MODALIDADE_OPTIONS = [
  { codigo: '6', nome: 'Pregão Eletrônico' },
  { codigo: '8', nome: 'Dispensa de Licitação' },
  { codigo: '9', nome: 'Inexigibilidade' },
  { codigo: '4', nome: 'Concorrência Eletrônica' },
  { codigo: '5', nome: 'Concorrência' },
  { codigo: '7', nome: 'Pregão Presencial' },
  { codigo: '1', nome: 'Leilão Eletrônico' },
] as const;

type ValorFiltroModo = '' | 'gt' | 'lt' | 'between';

const VALOR_FILTRO_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Qualquer valor' },
  { value: 'gt', label: 'Maior que' },
  { value: 'lt', label: 'Menor que' },
  { value: 'between', label: 'Entre' },
]);

type StatusAnaliseFiltro = 'disponivel' | 'enviada' | 'rejeitada' | 'vencida' | 'all';

type PncpStatusCounts = {
  all: number;
  disponivel: number;
  enviada: number;
  rejeitada: number;
  vencida: number;
};

function resolveValorFiltroBounds(
  modo: ValorFiltroModo,
  valor: string,
  valorDe: string,
  valorAte: string
): { valorMin: number | null; valorMax: number | null } {
  if (modo === 'gt') {
    return { valorMin: parseCurrencyInputBr(valor), valorMax: null };
  }
  if (modo === 'lt') {
    return { valorMin: null, valorMax: parseCurrencyInputBr(valor) };
  }
  if (modo === 'between') {
    return {
      valorMin: parseCurrencyInputBr(valorDe),
      valorMax: parseCurrencyInputBr(valorAte),
    };
  }
  return { valorMin: null, valorMax: null };
}

type PncpItem = {
  sequencialCompra: number | null;
  numeroControlePNCP: string | null;
  processo: string | null;
  numeroCompra?: string | null;
  objeto: string | null;
  orgao: string | null;
  cnpjOrgao: string | null;
  unidadeCompradora: string | null;
  codigoUnidadeCompradora: string | null;
  uf: string | null;
  municipio: string | null;
  modalidade: string | null;
  situacao: string | null;
  modoDisputa: string | null;
  plataforma: string | null;
  srp: boolean | null;
  valorEstimado: number | null;
  valorHomologado: number | null;
  dataInclusao: string | null;
  dataAberturaProposta: string | null;
  dataEncerramentoProposta: string | null;
  amparoLegal: string | null;
  linkSistemaOrigem: string | null;
  linkPncp: string | null;
  enviadoAnalise?: boolean;
  enviadoAnaliseRegiaoKey?: string | null;
  enviadoAnaliseAt?: string | null;
  enviadoAnaliseByName?: string | null;
  rejeitadoAnalise?: boolean;
  rejeitadoAnaliseAt?: string | null;
  rejeitadoAnaliseByName?: string | null;
};

type PncpListResult = {
  items: PncpItem[];
  pagina: number;
  tamanhoPagina: number;
  totalRegistros: number | null;
  totalPaginas: number | null;
  empty: boolean;
  statusCounts?: PncpStatusCounts;
};

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateInputToYyyymmdd(value: string): string {
  return value.replace(/-/g, '');
}

function formatBrDateParts(iso: string | null): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: '' };
  return {
    date: d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

function isPncpVencida(row: {
  dataEncerramentoProposta?: string | null;
  enviadoAnalise?: boolean;
  rejeitadoAnalise?: boolean;
}): boolean {
  if (row.enviadoAnalise || row.rejeitadoAnalise) return false;
  if (!row.dataEncerramentoProposta) return false;
  const d = new Date(row.dataEncerramentoProposta);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function DateTimeStacked({ iso }: { iso: string | null }) {
  const parts = formatBrDateParts(iso);
  if (!parts) return <span>—</span>;
  return (
    <div className="leading-tight">
      <div className="text-gray-900 dark:text-gray-100">{parts.date}</div>
      {parts.time ? (
        <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{parts.time}</div>
      ) : null}
    </div>
  );
}

function foldWithIndexMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const base = text[i]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    for (const ch of base) {
      folded += ch;
      map.push(i);
    }
  }
  return { folded, map };
}

type HighlightRange = { start: number; end: number };

function findKeywordRanges(text: string, keywords: string[]): HighlightRange[] {
  if (!text || keywords.length === 0) return [];
  const { folded, map } = foldWithIndexMap(text);
  const sorted = Array.from(
    new Set(
      keywords
        .map((k) =>
          k
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
        )
        .filter((k) => k.length >= 3)
    )
  ).sort((a, b) => b.length - a.length);

  const taken = new Array(folded.length).fill(false);
  const ranges: HighlightRange[] = [];

  for (const kw of sorted) {
    let from = 0;
    while (from < folded.length) {
      const idx = folded.indexOf(kw, from);
      if (idx < 0) break;
      const endFold = idx + kw.length;
      let overlap = false;
      for (let i = idx; i < endFold; i++) {
        if (taken[i]) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        for (let i = idx; i < endFold; i++) taken[i] = true;
        const start = map[idx];
        const end = map[endFold - 1] + 1;
        ranges.push({ start, end });
      }
      from = idx + 1;
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

function highlightObjetoText(text: string, keywords: string[]): React.ReactNode {
  const ranges = findKeywordRanges(text, keywords);
  if (ranges.length === 0) return text;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, i) => {
    if (range.start > cursor) {
      nodes.push(text.slice(cursor, range.start));
    }
    nodes.push(
      <strong key={`kw-${i}-${range.start}`} className="font-semibold text-gray-950 dark:text-white">
        {text.slice(range.start, range.end)}
      </strong>
    );
    cursor = range.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function ObjetoExpandable({
  text,
  keywords = [],
}: {
  text: string | null;
  keywords?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const value = text?.trim() || '';

  useEffect(() => {
    setExpanded(false);
  }, [value]);

  useEffect(() => {
    const el = textRef.current;
    if (!el || !value) {
      setNeedsToggle(false);
      return;
    }
    if (expanded) return;
    setNeedsToggle(el.scrollHeight > el.clientHeight + 2);
  }, [value, expanded, keywords]);

  if (!value) {
    return <p className="text-sm text-gray-800 dark:text-gray-200">—</p>;
  }

  return (
    <div>
      <p
        ref={textRef}
        className={`text-sm leading-relaxed text-gray-800 dark:text-gray-200 ${
          expanded ? '' : 'line-clamp-3'
        }`}
      >
        {highlightObjetoText(value, keywords)}
      </p>
      {needsToggle || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-red-600 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        >
          {expanded ? (
            <>
              Ver menos
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            </>
          ) : (
            <>
              Ver mais
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

function formatCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Id PNCP `CNPJ-1-SEQ/ANO` → https://pncp.gov.br/app/editais/{CNPJ}/{ANO}/{SEQ} */
function buildPncpEditalUrl(numeroControlePNCP: string | null | undefined): string | null {
  const m = String(numeroControlePNCP || '')
    .trim()
    .match(/^(\d{14})-\d+-(\d+)\s*\/\s*(\d{4})$/);
  if (!m) return null;
  const [, cnpj, seq, ano] = m;
  return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`;
}

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  return { dataInicial: toDateInputValue(start), dataFinal: toDateInputValue(end) };
}

function modalidadeOptionLabel(codigo: string): string {
  const found = MODALIDADE_OPTIONS.find((m) => String(m.codigo) === String(codigo));
  if (!found) return codigo;
  return found.nome;
}

function formatUfFilterLabel(ufs: string[]): string {
  if (ufs.length === 0 || ufs.length === BRASIL_UFS.length) return 'Todas as UFs';
  if (ufs.length === 1) return ufs[0];
  if (ufs.length <= 3) return ufs.join(', ');
  return `${ufs.length} UFs`;
}

function formatModalidadeFilterLabel(codigos: string[]): string {
  if (codigos.length === 0 || codigos.length === MODALIDADE_OPTIONS.length) {
    return 'Todas as modalidades';
  }
  if (codigos.length === 1) return modalidadeOptionLabel(codigos[0]);
  return `${codigos.length} modalidades`;
}

function formatSyncLabel(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'nunca';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function LicitacoesPncpPageContent() {
  const queryClient = useQueryClient();
  const tableScrollRef = useRightClickPanScroll<HTMLDivElement>();
  const defaults = useMemo(() => defaultRange(), []);
  const [ufs, setUfs] = useState<string[]>(['DF']);
  const [modalidadeCodigos, setModalidadeCodigos] = useState<string[]>([]);
  const [dataInicial, setDataInicial] = useState(defaults.dataInicial);
  const [dataFinal, setDataFinal] = useState(defaults.dataFinal);
  const [valorModo, setValorModo] = useState<ValorFiltroModo>('');
  const [valorFiltro, setValorFiltro] = useState('');
  const [valorDe, setValorDe] = useState('');
  const [valorAte, setValorAte] = useState('');
  const [statusAnalise, setStatusAnalise] = useState<StatusAnaliseFiltro>('disponivel');
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState<'uf' | 'modalidade' | null>(null);
  const [showKeywordsList, setShowKeywordsList] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncRetryErrorsOnly, setSyncRetryErrorsOnly] = useState(false);
  const [syncFullResync, setSyncFullResync] = useState(false);
  const [syncSelectedUfs, setSyncSelectedUfs] = useState<string[]>(() => [...BRASIL_UFS]);
  const [syncStopRequested, setSyncStopRequested] = useState(false);
  const [applied, setApplied] = useState({
    ufs: ['DF'] as string[],
    modalidadeCodigos: [] as string[],
    dataInicial: defaults.dataInicial,
    dataFinal: defaults.dataFinal,
    valorMin: null as number | null,
    valorMax: null as number | null,
    statusAnalise: 'disponivel' as StatusAnaliseFiltro,
    q: '',
    pagina: 1,
  });

  const MIN_SEARCH_LEN = 3;

  const ufFilterOptions = useMemo(
    () => BRASIL_UFS.map((uf) => ({ value: uf, label: uf })),
    []
  );

  const modalidadeFilterOptions = useMemo(
    () => MODALIDADE_OPTIONS.map((m) => ({ value: String(m.codigo), label: m.nome })),
    []
  );

  const searchTerm = applied.q.trim();
  const hasSearch =
    searchTerm.length >= MIN_SEARCH_LEN ||
    /^\d{14}-\d+-\d+\s*\/\s*\d{4}$/.test(searchTerm);

  const hasActiveFilters =
    !(applied.ufs.length === 1 && applied.ufs[0] === 'DF') ||
    applied.modalidadeCodigos.length > 0 ||
    applied.dataInicial !== defaults.dataInicial ||
    applied.dataFinal !== defaults.dataFinal ||
    applied.valorMin != null ||
    applied.valorMax != null ||
    hasSearch;

  const keywordsQuery = useQuery({
    queryKey: ['pncp-keywords', 'v3'],
    queryFn: async () => {
      const res = await api.get('/pncp/keywords');
      const raw = res.data?.data ?? res.data;
      if (Array.isArray(raw)) {
        const keywords = raw.filter((item): item is string => typeof item === 'string');
        return {
          keywords,
          entries: keywords.map((keyword) => ({ keyword, custom: false })),
        };
      }
      const keywords = Array.isArray(raw?.keywords)
        ? raw.keywords.filter((item: unknown): item is string => typeof item === 'string')
        : [];
      const entries = Array.isArray(raw?.entries)
        ? raw.entries.filter(
            (item: unknown): item is { keyword: string; custom: boolean } =>
              Boolean(item) &&
              typeof item === 'object' &&
              typeof (item as { keyword?: unknown }).keyword === 'string'
          )
        : keywords.map((keyword: string) => ({ keyword, custom: false }));
      return { keywords, entries };
    },
    staleTime: 60 * 60_000,
  });

  const keywords = Array.isArray(keywordsQuery.data?.keywords)
    ? keywordsQuery.data.keywords
    : [];
  const keywordEntries = Array.isArray(keywordsQuery.data?.entries)
    ? keywordsQuery.data.entries
    : [];

  const addKeywordMutation = useMutation({
    mutationFn: async (keyword: string) => {
      const res = await api.post('/pncp/keywords', { keyword });
      return (res.data?.data ?? res.data) as { keyword: string };
    },
    onSuccess: () => {
      toast.success('Palavra-chave adicionada.');
      setNewKeyword('');
      void queryClient.invalidateQueries({ queryKey: ['pncp-keywords'] });
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(err?.response?.data?.message || err?.message || 'Não foi possível adicionar.');
    },
  });

  const removeKeywordMutation = useMutation({
    mutationFn: async (keyword: string) => {
      await api.delete('/pncp/keywords', { data: { keyword } });
      return keyword;
    },
    onSuccess: () => {
      toast.success('Palavra-chave removida.');
      void queryClient.invalidateQueries({ queryKey: ['pncp-keywords'] });
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(err?.response?.data?.message || err?.message || 'Não foi possível remover.');
    },
  });

  const syncStatusQuery = useQuery({
    queryKey: ['pncp-sync-status'],
    queryFn: async () => {
      const res = await api.get('/pncp/sync/status');
      return (res.data?.data ?? res.data) as PncpSyncStatus;
    },
    refetchInterval: (q) => (q.state.data?.running ? 3_000 : 60_000),
    staleTime: 2_000,
  });

  const syncMutation = useMutation({
    mutationFn: async (payload: PncpSyncRequest = { incremental: true, staleOnly: true }) => {
      const res = await api.post('/pncp/sync', payload);
      return (res.data?.data ?? res.data) as PncpSyncStatus;
    },
    onSuccess: (data, variables) => {
      setSyncStopRequested(false);
      void queryClient.invalidateQueries({ queryKey: ['pncp-sync-status'] });
      setShowSyncModal(true);
      if (data.running) {
        const label = variables.retryErrorsOnly
          ? 'Repetindo UFs com erro'
          : variables.fullResync
            ? 'Sync completo'
            : variables.ufs?.length && variables.ufs.length < BRASIL_UFS.length
              ? `${variables.ufs.length} UF(s)`
              : 'UFs desatualizadas';
        toast.success(`Sincronização iniciada (${label}).`);
      }
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(
        err?.response?.data?.message || err?.message || 'Não foi possível iniciar a sincronização.'
      );
    },
  });

  const stopSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/pncp/sync/stop');
      return (res.data?.data ?? res.data) as PncpSyncStatus;
    },
    onSuccess: () => {
      setSyncStopRequested(true);
      void queryClient.invalidateQueries({ queryKey: ['pncp-sync-status'] });
      toast.success('Parando sincronização…');
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(
        err?.response?.data?.message || err?.message || 'Não foi possível parar a sincronização.'
      );
    },
  });

  const syncRunning =
    Boolean(syncStatusQuery.data?.running) || syncMutation.isPending;

  useEffect(() => {
    if (!syncStatusQuery.data?.running) {
      setSyncStopRequested(false);
    }
  }, [syncStatusQuery.data?.running]);

  const errorUfs = useMemo(
    () =>
      (syncStatusQuery.data?.progress?.ufs ?? [])
        .filter((u) => u.lastStatus === 'error' || u.status === 'error')
        .map((u) => u.uf)
        .sort(),
    [syncStatusQuery.data?.progress?.ufs]
  );
  const errorUfCount = syncStatusQuery.data?.errorUfCount ?? errorUfs.length;

  const sortedUfRows = useMemo(() => {
    const rows = [...(syncStatusQuery.data?.progress?.ufs ?? [])];
    rows.sort((a, b) => {
      const aErr = a.lastStatus === 'error' || a.status === 'error' ? 0 : 1;
      const bErr = b.lastStatus === 'error' || b.status === 'error' ? 0 : 1;
      if (aErr !== bErr) return aErr - bErr;
      return a.uf.localeCompare(b.uf);
    });
    return rows;
  }, [syncStatusQuery.data?.progress?.ufs]);

  const buildSyncPayload = (): PncpSyncRequest => {
    if (syncRetryErrorsOnly) {
      return { retryErrorsOnly: true, incremental: true, staleOnly: false };
    }
    if (syncFullResync) {
      const allSelected = syncSelectedUfs.length === BRASIL_UFS.length;
      return {
        fullResync: true,
        incremental: false,
        staleOnly: false,
        ...(allSelected ? {} : { ufs: syncSelectedUfs }),
      };
    }
    const allSelected = syncSelectedUfs.length === BRASIL_UFS.length;
    return {
      incremental: true,
      staleOnly: allSelected,
      ...(allSelected ? {} : { ufs: syncSelectedUfs, staleOnly: false }),
    };
  };

  const startSync = () => {
    syncMutation.mutate(buildSyncPayload());
  };

  const toggleSyncUf = (uf: string) => {
    setSyncRetryErrorsOnly(false);
    setSyncFullResync(false);
    setSyncSelectedUfs((prev) =>
      prev.includes(uf) ? prev.filter((u) => u !== uf) : [...prev, uf]
    );
  };

  const allSyncUfsSelected = syncSelectedUfs.length === BRASIL_UFS.length;

  const toggleAllSyncUfs = () => {
    setSyncRetryErrorsOnly(false);
    if (allSyncUfsSelected) {
      setSyncSelectedUfs([]);
    } else {
      setSyncFullResync(false);
      setSyncSelectedUfs([...BRASIL_UFS]);
    }
  };

  const selectErrorSyncUfs = () => {
    if (errorUfs.length === 0) {
      toast.error('Nenhuma UF com erro no momento.');
      return;
    }
    setSyncRetryErrorsOnly(true);
    setSyncSelectedUfs(errorUfs);
  };

  const query = useQuery({
    queryKey: [
      'pncp-contratacoes',
      { ...applied, q: hasSearch ? searchTerm : '' },
    ],
    queryFn: async () => {
      const res = await api.get('/pncp/contratacoes', {
        params: {
          uf:
            applied.ufs.length === 0 || applied.ufs.length === BRASIL_UFS.length
              ? 'all'
              : applied.ufs.join(','),
          codigoModalidadeContratacao:
            applied.modalidadeCodigos.length === 0 ||
            applied.modalidadeCodigos.length === MODALIDADE_OPTIONS.length
              ? 'all'
              : applied.modalidadeCodigos.join(','),
          dataInicial: dateInputToYyyymmdd(applied.dataInicial),
          dataFinal: dateInputToYyyymmdd(applied.dataFinal),
          pagina: applied.pagina,
          tamanhoPagina: 20,
          ...(applied.valorMin != null ? { valorMin: applied.valorMin } : {}),
          ...(applied.valorMax != null ? { valorMax: applied.valorMax } : {}),
          statusAnalise: applied.statusAnalise,
          ...(hasSearch ? { q: searchTerm } : {}),
        },
        timeout: 30_000,
      });
      return (res.data?.data ?? res.data) as PncpListResult;
    },
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
    retry: false,
  });

  const [sendingNumero, setSendingNumero] = useState<string | null>(null);
  const [rejectingNumero, setRejectingNumero] = useState<string | null>(null);

  const enviarAnaliseMutation = useMutation({
    mutationFn: async (numeroControlePNCP: string) => {
      const res = await api.post('/pncp/enviar-analise', { numeroControlePNCP });
      return (res.data?.data ?? res.data) as {
        alreadySent?: boolean;
        regiaoKey: string;
        regiaoLabel: string;
        enviadoAt: string;
      };
    },
    onMutate: (numeroControlePNCP) => {
      setSendingNumero(numeroControlePNCP);
    },
    onSuccess: (data, numeroControlePNCP) => {
      toast.success(`Enviada para ${data.regiaoLabel}.`);
      void queryClient.invalidateQueries({ queryKey: ['pncp-contratacoes'] });
      void queryClient.invalidateQueries({ queryKey: ['licitacoes-planilha-regiao'] });
      void queryClient.invalidateQueries({ queryKey: ['licitacoes-planilha-regioes'] });
      queryClient.setQueryData(
        ['pncp-contratacoes', { ...applied, q: hasSearch ? searchTerm : '' }],
        (prev: PncpListResult | undefined) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.numeroControlePNCP === numeroControlePNCP
                ? {
                    ...item,
                    enviadoAnalise: true,
                    enviadoAnaliseRegiaoKey: data.regiaoKey,
                    enviadoAnaliseAt: data.enviadoAt,
                    rejeitadoAnalise: false,
                    rejeitadoAnaliseAt: null,
                    rejeitadoAnaliseByName: null,
                  }
                : item
            ),
          };
        }
      );
    },
    onError: (err: {
      response?: { status?: number; data?: { message?: string; data?: { regiaoLabel?: string } } };
      message?: string;
    }) => {
      if (err?.response?.status === 409) {
        toast.error(
          err.response.data?.message ||
            `Já enviada${
              err.response.data?.data?.regiaoLabel
                ? ` para ${err.response.data.data.regiaoLabel}`
                : ''
            }.`
        );
        void queryClient.invalidateQueries({ queryKey: ['pncp-contratacoes'] });
        return;
      }
      toast.error(
        err?.response?.data?.message || err?.message || 'Não foi possível enviar para análise.'
      );
    },
    onSettled: () => {
      setSendingNumero(null);
    },
  });

  const rejeitarMutation = useMutation({
    mutationFn: async (numeroControlePNCP: string) => {
      const res = await api.post('/pncp/rejeitar', { numeroControlePNCP });
      return (res.data?.data ?? res.data) as {
        alreadyRejected?: boolean;
        rejeitadoAt: string;
      };
    },
    onMutate: (numeroControlePNCP) => {
      setRejectingNumero(numeroControlePNCP);
    },
    onSuccess: (data, numeroControlePNCP) => {
      toast.success('Licitação rejeitada.');
      void queryClient.invalidateQueries({ queryKey: ['pncp-contratacoes'] });
      queryClient.setQueryData(
        ['pncp-contratacoes', { ...applied, q: hasSearch ? searchTerm : '' }],
        (prev: PncpListResult | undefined) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.numeroControlePNCP === numeroControlePNCP
                ? {
                    ...item,
                    rejeitadoAnalise: true,
                    rejeitadoAnaliseAt: data.rejeitadoAt,
                  }
                : item
            ),
          };
        }
      );
    },
    onError: (err: {
      response?: { status?: number; data?: { message?: string } };
      message?: string;
    }) => {
      if (err?.response?.status === 409) {
        toast.error(err.response.data?.message || 'Esta licitação já foi rejeitada.');
        void queryClient.invalidateQueries({ queryKey: ['pncp-contratacoes'] });
        return;
      }
      toast.error(
        err?.response?.data?.message || err?.message || 'Não foi possível rejeitar a licitação.'
      );
    },
    onSettled: () => {
      setRejectingNumero(null);
    },
  });

  // Enquanto sincroniza, atualiza a lista (dados vão entrando) e ao terminar avisa.
  const wasSyncRunning = useRef(false);
  useEffect(() => {
    const running = Boolean(syncStatusQuery.data?.running);
    if (running) {
      void queryClient.invalidateQueries({ queryKey: ['pncp-contratacoes'] });
    }
    if (wasSyncRunning.current && !running) {
      void queryClient.invalidateQueries({ queryKey: ['pncp-contratacoes'] });
      const last = syncStatusQuery.data?.lastRun;
      if (last?.status === 'failed') {
        toast.error(last.errorMessage || 'Sincronização falhou.');
      } else {
        toast.success(
          `Sync concluída: ${last?.upserted?.toLocaleString('pt-BR') ?? 0} itens no espelho.`
        );
      }
    }
    wasSyncRunning.current = running;
  }, [
    syncStatusQuery.data?.running,
    syncStatusQuery.data?.lastRun?.status,
    syncStatusQuery.data?.lastRun?.upserted,
    syncStatusQuery.data?.lastRun?.errorMessage,
    queryClient,
  ]);

  const items = query.data?.items ?? [];
  const actionRows = useMemo(
    () =>
      items.map((row, idx) => ({
        ...row,
        id:
          row.numeroControlePNCP ||
          `${row.processo || 'p'}-${row.sequencialCompra || idx}`,
      })),
    [items]
  );
  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(actionRows);
  const totalPaginas = Math.max(1, query.data?.totalPaginas ?? 1);
  const currentPage = applied.pagina;
  const pageSize = query.data?.tamanhoPagina ?? 20;
  const totalRegistros = query.data?.totalRegistros ?? items.length;
  const startItem =
    items.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem =
    items.length === 0 ? 0 : Math.min(currentPage * pageSize, totalRegistros);
  const showInitialLoading = query.isLoading && !query.data;

  const lastSyncAt =
    syncStatusQuery.data?.lastRun?.finishedAt ||
    syncStatusQuery.data?.lastRun?.startedAt ||
    null;
  const syncProgress = syncStatusQuery.data?.lastRun;
  const progress = syncStatusQuery.data?.progress;
  const mirror = syncStatusQuery.data?.mirror;
  const syncPct =
    progress && progress.totalUfs > 0
      ? Math.round((progress.doneUfs / progress.totalUfs) * 100)
      : 0;

  const commitFilters = (next: {
    ufs: string[];
    modalidadeCodigos: string[];
    dataInicial: string;
    dataFinal: string;
    valorModo?: ValorFiltroModo;
    valorFiltro?: string;
    valorDe?: string;
    valorAte?: string;
    statusAnalise?: StatusAnaliseFiltro;
  }) => {
    if (!next.dataInicial || !next.dataFinal) {
      toast.error('Informe o período de abertura.');
      return;
    }
    if (next.dataInicial > next.dataFinal) {
      toast.error('A data inicial não pode ser maior que a data final.');
      return;
    }

    const modo = next.valorModo ?? valorModo;
    const valor = next.valorFiltro ?? valorFiltro;
    const de = next.valorDe ?? valorDe;
    const ate = next.valorAte ?? valorAte;
    const { valorMin, valorMax } = resolveValorFiltroBounds(modo, valor, de, ate);

    if (modo === 'between' && valorMin != null && valorMax != null && valorMin > valorMax) {
      toast.error('O valor inicial não pode ser maior que o final.');
      return;
    }

    const valorCompleto =
      modo === '' ||
      (modo === 'gt' && valorMin != null) ||
      (modo === 'lt' && valorMax != null) ||
      (modo === 'between' && valorMin != null && valorMax != null);

    setApplied((prev) => ({
      ...prev,
      ufs: next.ufs,
      modalidadeCodigos: next.modalidadeCodigos,
      dataInicial: next.dataInicial,
      dataFinal: next.dataFinal,
      valorMin: valorCompleto ? valorMin : null,
      valorMax: valorCompleto ? valorMax : null,
      statusAnalise: next.statusAnalise ?? statusAnalise,
      pagina: 1,
    }));
  };

  // Busca opcional: aplica com debounce (mín. 3 caracteres ou Id PNCP completo).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = q.trim();
      const usable =
        nextQ.length === 0 ||
        nextQ.length >= MIN_SEARCH_LEN ||
        /^\d{14}-\d+-\d+\s*\/\s*\d{4}$/.test(nextQ);
      if (!usable) return;
      setApplied((prev) => {
        if (prev.q === nextQ) return prev;
        return { ...prev, q: nextQ, pagina: 1 };
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [q]);

  const clearFilters = () => {
    setUfs(['DF']);
    setModalidadeCodigos([]);
    setDataInicial(defaults.dataInicial);
    setDataFinal(defaults.dataFinal);
    setValorModo('');
    setValorFiltro('');
    setValorDe('');
    setValorAte('');
    setStatusAnalise('disponivel');
    setApplied((prev) => ({
      ...prev,
      ufs: ['DF'],
      modalidadeCodigos: [],
      dataInicial: defaults.dataInicial,
      dataFinal: defaults.dataFinal,
      valorMin: null,
      valorMax: null,
      statusAnalise: 'disponivel',
      pagina: 1,
    }));
  };

  const clearSearch = () => {
    setQ('');
    setApplied((prev) => ({ ...prev, q: '', pagina: 1 }));
  };

  const goToPage = (page: number) => {
    const safe = Math.max(1, Math.min(page, totalPaginas));
    setApplied((prev) => ({ ...prev, pagina: safe }));
  };

  const loadError = (() => {
    const raw =
      (query.error as { response?: { data?: { message?: string } }; message?: string; code?: string })
        ?.response?.data?.message ||
      (query.error as Error)?.message ||
      'Erro ao consultar o PNCP.';
    if (/timeout of \d+ms exceeded/i.test(raw) || raw === 'ECONNABORTED') {
      return 'O PNCP demorou para responder. Aguarde um minuto e clique em Atualizar.';
    }
    return raw;
  })();

  const listSubtitle = showInitialLoading
    ? 'Carregando...'
    : query.isFetching
      ? `Atualizando página ${currentPage}…`
      : totalRegistros === 1
        ? '1 licitação no espelho local'
        : `${totalRegistros.toLocaleString('pt-BR')} licitações no espelho local`;

  const syncSubtitle = syncRunning
    ? `Sincronizando${
        syncStatusQuery.data?.currentUf ? ` ${syncStatusQuery.data.currentUf}` : ''
      }… ${syncProgress?.upserted ?? 0} salvos · ${syncProgress?.pagesFetched ?? 0} págs`
    : `Última sync: ${formatSyncLabel(lastSyncAt)}`;

  const statusCounts: PncpStatusCounts = query.data?.statusCounts ?? {
    all: totalRegistros,
    disponivel: applied.statusAnalise === 'disponivel' ? totalRegistros : 0,
    enviada: applied.statusAnalise === 'enviada' ? totalRegistros : 0,
    rejeitada: applied.statusAnalise === 'rejeitada' ? totalRegistros : 0,
    vencida: applied.statusAnalise === 'vencida' ? totalRegistros : 0,
  };

  const statusCards = useMemo(
    () =>
      [
        {
          id: 'all' as const,
          cardLabel: 'Todas',
          listLabel: 'Licitações',
          count: statusCounts.all,
          Icon: FolderKanban,
          iconBg: 'bg-blue-100 dark:bg-blue-900/30',
          iconColor: 'text-blue-700 dark:text-blue-300',
          listIconBg: 'bg-blue-100 dark:bg-blue-900/30',
          listIconColor: 'text-blue-700 dark:text-blue-300',
        },
        {
          id: 'disponivel' as const,
          cardLabel: 'Pendentes',
          listLabel: 'Pendentes',
          count: statusCounts.disponivel,
          Icon: ClipboardList,
          iconBg: 'bg-amber-100 dark:bg-amber-900/30',
          iconColor: 'text-amber-700 dark:text-amber-300',
          listIconBg: 'bg-amber-100 dark:bg-amber-900/30',
          listIconColor: 'text-amber-700 dark:text-amber-300',
        },
        {
          id: 'enviada' as const,
          cardLabel: 'Enviadas',
          listLabel: 'Enviadas',
          count: statusCounts.enviada,
          Icon: Send,
          iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
          iconColor: 'text-emerald-700 dark:text-emerald-300',
          listIconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
          listIconColor: 'text-emerald-700 dark:text-emerald-300',
        },
        {
          id: 'rejeitada' as const,
          cardLabel: 'Rejeitadas',
          listLabel: 'Rejeitadas',
          count: statusCounts.rejeitada,
          Icon: ThumbsDown,
          iconBg: 'bg-red-100 dark:bg-red-900/30',
          iconColor: 'text-red-700 dark:text-red-300',
          listIconBg: 'bg-red-100 dark:bg-red-900/30',
          listIconColor: 'text-red-700 dark:text-red-300',
        },
        {
          id: 'vencida' as const,
          cardLabel: 'Vencidas',
          listLabel: 'Vencidas',
          count: statusCounts.vencida,
          Icon: Clock,
          iconBg: 'bg-orange-100 dark:bg-orange-900/30',
          iconColor: 'text-orange-700 dark:text-orange-300',
          listIconBg: 'bg-orange-100 dark:bg-orange-900/30',
          listIconColor: 'text-orange-700 dark:text-orange-300',
        },
      ] as const satisfies ReadonlyArray<{
        id: StatusAnaliseFiltro;
        cardLabel: string;
        listLabel: string;
        count: number;
        Icon: LucideIcon;
        iconBg: string;
        iconColor: string;
        listIconBg: string;
        listIconColor: string;
      }>,
    [statusCounts]
  );

  const activeStatusCard =
    statusCards.find((card) => card.id === applied.statusAnalise) ?? statusCards[0];
  const ListStatusIcon = activeStatusCard.Icon;

  const selectStatusCard = (next: StatusAnaliseFiltro) => {
    setStatusAnalise(next);
    setApplied((prev) => ({
      ...prev,
      statusAnalise: next,
      pagina: 1,
    }));
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
          Portal Nacional de Contratações Públicas
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Consulta pública de contratações publicadas no PNCP.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
        {statusCards.map((card) => (
          <FilterStatCard
            key={card.id}
            label={card.cardLabel}
            count={card.count}
            icon={card.Icon}
            iconBg={card.iconBg}
            iconColor={card.iconColor}
            isActive={applied.statusAnalise === card.id}
            loading={showInitialLoading}
            onClick={() => selectStatusCard(card.id)}
          />
        ))}
      </div>

      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className={`flex-shrink-0 rounded-lg p-2 sm:p-3 ${activeStatusCard.listIconBg}`}>
                <ListStatusIcon
                  className={`h-5 w-5 sm:h-6 sm:w-6 ${activeStatusCard.listIconColor}`}
                />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                  {activeStatusCard.listLabel}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {listSubtitle}
                  {hasActiveFilters ? ' (filtrados)' : ''}
                </p>
                <button
                  type="button"
                  onClick={() => setShowSyncModal(true)}
                  className="mt-0.5 text-left text-xs text-gray-400 underline-offset-2 hover:text-red-600 hover:underline dark:text-gray-500 dark:hover:text-red-400"
                  title="Ver progresso da sincronização"
                >
                  {syncSubtitle}
                </button>
              </div>
            </div>

            <div className={cadastroListClasses.cardToolbar}>
              <div className="relative min-w-[200px] flex-1 sm:w-[280px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filtrar órgão, valor ou Id PNCP..."
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                {q ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setShowFilters(true)}
                className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  hasActiveFilters
                    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Abrir filtro"
                title={hasActiveFilters ? 'Filtro ativo' : 'Filtro'}
              >
                <Filter className="h-4 w-4" />
                {hasActiveFilters ? (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                ) : null}
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className={cadastroListClasses.cardContent}>
          {query.isError && !query.data ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <p className="max-w-md text-sm text-gray-700 dark:text-gray-300">{loadError}</p>
            </div>
          ) : showInitialLoading ? (
            <CadastroListLoading message="Carregando espelho local..." />
          ) : items.length === 0 ? (
            <div className="space-y-4">
              <CadastroListEmpty
                icon={ListStatusIcon}
                title="Nenhuma licitação encontrada"
                hint={
                  syncRunning
                    ? 'Sincronização em andamento. Em breve os dados aparecem aqui.'
                    : 'Ajuste os filtros ou aguarde o sync automático do PNCP.'
                }
              />
              {totalPaginas > 1 ? (
                <div className={cadastroListClasses.pagination}>
                  <ListPagination
                    currentPage={currentPage}
                    totalPages={totalPaginas}
                    onPageChange={goToPage}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <CadastroListSummary
                startItem={startItem}
                endItem={endItem}
                total={totalRegistros}
                itemLabel="licitação"
                itemLabelPlural="licitações"
                currentPage={currentPage}
                totalPages={totalPaginas}
              />

              <div
                ref={tableScrollRef}
                className={`overflow-x-auto transition-opacity ${
                  query.isFetching && !showInitialLoading ? 'opacity-60' : ''
                }`}
              >
                <table className="w-full min-w-[84rem] text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th scope="col" className={cadastroListClasses.th}>
                        Órgão
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        UF
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Modalidade
                      </th>
                      <th scope="col" className={cadastroListClasses.th}>
                        Objeto
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Processo
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Abertura
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Encerramento
                      </th>
                      <th scope="col" className={cadastroListClasses.thNumeric}>
                        Valor estimado
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Status
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Origem
                      </th>
                      <th scope="col" className={`${cadastroListClasses.thCenter} w-14`}>
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {items.map((row, idx) => {
                      const key =
                        row.numeroControlePNCP ||
                        `${row.processo || 'p'}-${row.sequencialCompra || idx}`;
                      return (
                        <tr key={key} className={getListTableRowClassName(false)}>
                          <td className={cadastroListClasses.td}>
                            <div className="min-w-[12rem] max-w-[18rem]">
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {row.orgao || '—'}
                              </div>
                              <div
                                className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2"
                                title={
                                  [
                                    row.codigoUnidadeCompradora,
                                    row.unidadeCompradora,
                                  ]
                                    .filter(Boolean)
                                    .join(' - ') || undefined
                                }
                              >
                                {row.codigoUnidadeCompradora && row.unidadeCompradora
                                  ? `${row.codigoUnidadeCompradora} - ${row.unidadeCompradora}`
                                  : row.unidadeCompradora ||
                                    row.codigoUnidadeCompradora ||
                                    '—'}
                              </div>
                            </div>
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {row.uf || '—'}
                            </div>
                            {row.municipio ? (
                              <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                {row.municipio}
                              </div>
                            ) : null}
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            <div className="min-w-[8rem] max-w-[12rem]">
                              <div>{row.modalidade || '—'}</div>
                              {row.srp ? (
                                <div className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                                  SRP
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className={cadastroListClasses.td}>
                            <div className="min-w-[16rem] max-w-[28rem]">
                              <ObjetoExpandable text={row.objeto} keywords={keywords} />
                            </div>
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            <div>{row.processo || '—'}</div>
                            {row.numeroControlePNCP ? (
                              <div className="mt-0.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                                {row.numeroControlePNCP}
                              </div>
                            ) : null}
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            <DateTimeStacked iso={row.dataAberturaProposta} />
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            <DateTimeStacked iso={row.dataEncerramentoProposta} />
                          </td>
                          <td className={cadastroListClasses.tdNumeric}>
                            {formatCurrency(row.valorEstimado)}
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            {row.enviadoAnalise ? (
                              <div className="inline-flex min-w-[7.5rem] flex-col items-center gap-0.5">
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                  Enviada
                                </span>
                                {row.enviadoAnaliseByName ? (
                                  <span
                                    className="max-w-[10rem] truncate text-[11px] text-gray-600 dark:text-gray-300"
                                    title={row.enviadoAnaliseByName}
                                  >
                                    {row.enviadoAnaliseByName}
                                  </span>
                                ) : null}
                                {row.enviadoAnaliseAt ? (
                                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                    {(() => {
                                      const parts = formatBrDateParts(row.enviadoAnaliseAt);
                                      if (!parts) return '—';
                                      return parts.time
                                        ? `${parts.date} ${parts.time}`
                                        : parts.date;
                                    })()}
                                  </span>
                                ) : null}
                              </div>
                            ) : row.rejeitadoAnalise ? (
                              <div className="inline-flex min-w-[7.5rem] flex-col items-center gap-0.5">
                                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-300">
                                  Rejeitada
                                </span>
                                {row.rejeitadoAnaliseByName ? (
                                  <span
                                    className="max-w-[10rem] truncate text-[11px] text-gray-600 dark:text-gray-300"
                                    title={row.rejeitadoAnaliseByName}
                                  >
                                    {row.rejeitadoAnaliseByName}
                                  </span>
                                ) : null}
                                {row.rejeitadoAnaliseAt ? (
                                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                    {(() => {
                                      const parts = formatBrDateParts(row.rejeitadoAnaliseAt);
                                      if (!parts) return '—';
                                      return parts.time
                                        ? `${parts.date} ${parts.time}`
                                        : parts.date;
                                    })()}
                                  </span>
                                ) : null}
                              </div>
                            ) : isPncpVencida(row) ? (
                              <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-semibold text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                                Vencida
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                Disponível
                              </span>
                            )}
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            {(() => {
                              const href =
                                buildPncpEditalUrl(row.numeroControlePNCP) ||
                                row.linkPncp ||
                                null;
                              if (!href) return '—';
                              return (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                                  aria-label="Abrir edital no PNCP"
                                  title="Abrir no PNCP"
                                >
                                  <ExternalLink className="h-4 w-4" aria-hidden />
                                </a>
                              );
                            })()}
                          </td>
                          <RowActionMenuCell
                            align="center"
                            isOpen={isRowMenuOpen(key)}
                            onToggle={(e) =>
                              toggleRowActionMenu(key, e.currentTarget as HTMLButtonElement)
                            }
                          />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className={cadastroListClasses.pagination}>
                <ListPagination
                  currentPage={currentPage}
                  totalPages={totalPaginas}
                  onPageChange={goToPage}
                />
              </div>

              {rowActionMenu && rowForActionMenu ? (
                <RowActionMenuPortal
                  menu={rowActionMenu}
                  onClose={closeRowActionMenu}
                  onEdit={() => undefined}
                  hideDefaultActions
                  extraItems={
                    rowForActionMenu.enviadoAnalise
                      ? [
                          {
                            label: 'Já enviada',
                            disabled: true,
                            onClick: () => undefined,
                            icon: (
                              <Send className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                            ),
                          },
                        ]
                      : rowForActionMenu.rejeitadoAnalise
                        ? [
                            {
                              label: 'Já rejeitada',
                              disabled: true,
                              onClick: () => undefined,
                              icon: (
                                <ThumbsDown className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                              ),
                            },
                          ]
                        : [
                            {
                              label:
                                sendingNumero === rowForActionMenu.numeroControlePNCP
                                  ? 'Enviando…'
                                  : 'Enviar',
                              tone: 'success',
                              disabled:
                                !rowForActionMenu.numeroControlePNCP ||
                                sendingNumero === rowForActionMenu.numeroControlePNCP ||
                                rejectingNumero === rowForActionMenu.numeroControlePNCP,
                              onClick: () => {
                                if (!rowForActionMenu.numeroControlePNCP) return;
                                if (
                                  !window.confirm(
                                    'Enviar esta licitação para a lista Por região (análise)?'
                                  )
                                ) {
                                  return;
                                }
                                closeRowActionMenu();
                                enviarAnaliseMutation.mutate(
                                  rowForActionMenu.numeroControlePNCP
                                );
                              },
                              icon:
                                sendingNumero === rowForActionMenu.numeroControlePNCP ? (
                                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600 dark:text-emerald-400" />
                                ) : (
                                  <Send className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                ),
                            },
                            {
                              label:
                                rejectingNumero === rowForActionMenu.numeroControlePNCP
                                  ? 'Rejeitando…'
                                  : 'Rejeitar',
                              tone: 'danger',
                              disabled:
                                !rowForActionMenu.numeroControlePNCP ||
                                rejectingNumero === rowForActionMenu.numeroControlePNCP ||
                                sendingNumero === rowForActionMenu.numeroControlePNCP,
                              onClick: () => {
                                if (!rowForActionMenu.numeroControlePNCP) return;
                                if (
                                  !window.confirm(
                                    'Rejeitar esta licitação? Ela sairá das disponíveis.'
                                  )
                                ) {
                                  return;
                                }
                                closeRowActionMenu();
                                rejeitarMutation.mutate(rowForActionMenu.numeroControlePNCP);
                              },
                              icon:
                                rejectingNumero === rowForActionMenu.numeroControlePNCP ? (
                                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-red-600 dark:text-red-400" />
                                ) : (
                                  <ThumbsDown className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                                ),
                            },
                          ]
                  }
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {showFilters ? (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowFilters(false)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Fechar filtros"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  UF
                </label>
                <MultiSelectSearchDropdown
                  options={ufFilterOptions}
                  selected={ufs}
                  onChange={(next) => {
                    setUfs(next);
                    commitFilters({
                      ufs: next,
                      modalidadeCodigos,
                      dataInicial,
                      dataFinal,
                    });
                  }}
                  placeholder={formatUfFilterLabel(ufs)}
                  searchPlaceholder="Pesquisar UF..."
                  open={filterDropdownOpen === 'uf'}
                  onOpenChange={(open) => setFilterDropdownOpen(open ? 'uf' : null)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Modalidade
                </label>
                <MultiSelectSearchDropdown
                  options={modalidadeFilterOptions}
                  selected={modalidadeCodigos}
                  onChange={(next) => {
                    setModalidadeCodigos(next);
                    commitFilters({
                      ufs,
                      modalidadeCodigos: next,
                      dataInicial,
                      dataFinal,
                    });
                  }}
                  placeholder={formatModalidadeFilterLabel(modalidadeCodigos)}
                  searchPlaceholder="Pesquisar modalidade..."
                  open={filterDropdownOpen === 'modalidade'}
                  onOpenChange={(open) => setFilterDropdownOpen(open ? 'modalidade' : null)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Abertura de
                  </label>
                  <DatePickerField
                    value={dataInicial}
                    onChange={(next) => {
                      setDataInicial(next);
                      commitFilters({
                        ufs,
                        modalidadeCodigos,
                        dataInicial: next,
                        dataFinal,
                      });
                    }}
                    aria-label="Abertura de"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Abertura até
                  </label>
                  <DatePickerField
                    value={dataFinal}
                    onChange={(next) => {
                      setDataFinal(next);
                      commitFilters({
                        ufs,
                        modalidadeCodigos,
                        dataInicial,
                        dataFinal: next,
                      });
                    }}
                    aria-label="Abertura até"
                    className="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Valor estimado
                </label>
                <StringSingleSelectDropdown
                  value={valorModo}
                  onChange={(next) => {
                    const modo = next as ValorFiltroModo;
                    setValorModo(modo);
                    if (!modo) {
                      setValorFiltro('');
                      setValorDe('');
                      setValorAte('');
                    }
                    commitFilters({
                      ufs,
                      modalidadeCodigos,
                      dataInicial,
                      dataFinal,
                      valorModo: modo,
                      valorFiltro: modo ? valorFiltro : '',
                      valorDe: modo === 'between' ? valorDe : '',
                      valorAte: modo === 'between' ? valorAte : '',
                    });
                  }}
                  options={VALOR_FILTRO_OPTIONS}
                  allowEmpty={false}
                  disableSearch
                />
                {valorModo === 'gt' || valorModo === 'lt' ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={valorFiltro}
                    onChange={(e) => {
                      const masked = maskCurrencyInputBrOrEmpty(e.target.value);
                      setValorFiltro(masked);
                      commitFilters({
                        ufs,
                        modalidadeCodigos,
                        dataInicial,
                        dataFinal,
                        valorModo,
                        valorFiltro: masked,
                      });
                    }}
                    placeholder={valorModo === 'gt' ? 'Maior que R$ 0,00' : 'Menor que R$ 0,00'}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                ) : null}
                {valorModo === 'between' ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={valorDe}
                      onChange={(e) => {
                        const masked = maskCurrencyInputBrOrEmpty(e.target.value);
                        setValorDe(masked);
                        commitFilters({
                          ufs,
                          modalidadeCodigos,
                          dataInicial,
                          dataFinal,
                          valorModo: 'between',
                          valorDe: masked,
                          valorAte,
                        });
                      }}
                      placeholder="De R$ 0,00"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={valorAte}
                      onChange={(e) => {
                        const masked = maskCurrencyInputBrOrEmpty(e.target.value);
                        setValorAte(masked);
                        commitFilters({
                          ufs,
                          modalidadeCodigos,
                          dataInicial,
                          dataFinal,
                          valorModo: 'between',
                          valorDe,
                          valorAte: masked,
                        });
                      }}
                      placeholder="Até R$ 0,00"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Espelho por palavras-chave
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  O sync guarda só objetos de{' '}
                  <strong className="font-semibold text-gray-700 dark:text-gray-200">
                    engenharia
                  </strong>{' '}
                  /{' '}
                  <strong className="font-semibold text-gray-700 dark:text-gray-200">
                    predial
                  </strong>{' '}
                  /{' '}
                  <strong className="font-semibold text-gray-700 dark:text-gray-200">
                    áreas verdes
                  </strong>{' '}
                  (e afins). A lista lê o banco local — sem rate limit do PNCP.
                </p>
                <button
                  type="button"
                  onClick={() => setShowKeywordsList((v) => !v)}
                  className="mt-2 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  {showKeywordsList ? 'Ocultar palavras-chave' : 'Ver palavras-chave'}
                </button>
                {showKeywordsList ? (
                  <div className="mt-2 space-y-2">
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const value = newKeyword.trim();
                        if (value.length < 3 || addKeywordMutation.isPending) return;
                        addKeywordMutation.mutate(value);
                      }}
                    >
                      <input
                        type="text"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        placeholder="Digite uma palavra-chave…"
                        maxLength={120}
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                      />
                      <button
                        type="submit"
                        disabled={newKeyword.trim().length < 3 || addKeywordMutation.isPending}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {addKeywordMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        Adicionar
                      </button>
                    </form>
                    <div className="max-h-36 overflow-y-auto">
                      {keywordsQuery.isLoading ? (
                        <p className="text-xs text-gray-500">Carregando...</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {keywordEntries.map((entry) => (
                            <span
                              key={`${entry.custom ? 'c' : 'p'}:${entry.keyword}`}
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                                entry.custom
                                  ? 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                              }`}
                            >
                              {entry.keyword}
                              {entry.custom ? (
                                <button
                                  type="button"
                                  aria-label={`Remover ${entry.keyword}`}
                                  disabled={removeKeywordMutation.isPending}
                                  onClick={() => removeKeywordMutation.mutate(entry.keyword)}
                                  className="rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900/50"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              ) : null}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      As palavras que você adicionar entram no próximo sync. As padrão não podem ser
                      removidas.
                    </p>
                  </div>
                ) : null}
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Sync automático a cada ~1h (Brasil, últimos 30 dias). Clique em “Última sync” no
                cabeçalho para ver o progresso ou forçar agora.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  clearFilters();
                  setShowFilters(false);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <RotateCcw className="h-4 w-4" />
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSyncModal ? (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSyncModal(false)} />
          <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Sincronização PNCP
                </h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {syncRunning
                    ? `Em andamento${
                        syncStatusQuery.data?.currentUf
                          ? ` · UF ${syncStatusQuery.data.currentUf}`
                          : ''
                      }${
                        syncStatusQuery.data?.currentModalidade
                          ? ` · ${syncStatusQuery.data.currentModalidade}`
                          : ''
                      }`
                    : `Última sync: ${formatSyncLabel(lastSyncAt)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">No espelho</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {(mirror?.total ?? 0).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Nesta sync</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {(progress?.upserted ?? syncProgress?.upserted ?? 0).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">UFs feitas</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {progress?.doneUfs ?? 0}/{progress?.totalUfs ?? 27}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Faltam</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {progress?.pendingUfs ?? 0} UFs
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>Progresso por UF</span>
                  <span>{syncPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-red-600 transition-all duration-500"
                    style={{ width: `${syncPct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {(progress?.pagesFetched ?? 0).toLocaleString('pt-BR')} páginas consultadas
                  {(progress?.rateLimitHits ?? 0) > 0
                    ? ` · ${progress?.rateLimitHits} rate-limit`
                    : ''}
                  {progress?.lookbackDays && syncStatusQuery.data?.syncOptions?.fullResync
                    ? ` · lookback ${progress.lookbackDays} dias (completo)`
                    : syncStatusQuery.data?.syncOptions?.incremental !== false
                      ? ' · incremental'
                      : ''}
                  {syncStatusQuery.data?.syncOptions?.staleOnly ? ' · só desatualizadas' : ''}
                  {!syncRunning && (syncStatusQuery.data?.lastRun?.pruned ?? 0) > 0
                    ? ` · ${syncStatusQuery.data?.lastRun?.pruned} removidos na última sync`
                    : ''}
                </p>
              </div>

              {!syncRunning ? (
                <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      UFs para sincronizar
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={toggleAllSyncUfs}
                        disabled={syncRetryErrorsOnly}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        {allSyncUfsSelected ? 'Desmarcar todas' : 'Marcar todas'}
                      </button>
                      <button
                        type="button"
                        onClick={selectErrorSyncUfs}
                        disabled={errorUfCount === 0}
                        className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/30"
                      >
                        Só erros ({errorUfCount})
                      </button>
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={syncRetryErrorsOnly}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSyncRetryErrorsOnly(checked);
                        if (checked) {
                          setSyncFullResync(false);
                          setSyncSelectedUfs(errorUfs);
                        }
                      }}
                      disabled={errorUfCount === 0}
                      className="rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-50"
                    />
                    Repetir apenas UFs com erro na última tentativa
                  </label>

                  <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={syncFullResync}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSyncFullResync(checked);
                        if (checked) setSyncRetryErrorsOnly(false);
                      }}
                      disabled={syncRetryErrorsOnly}
                      className="rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-50"
                    />
                    Sync completo (30 dias — varrer tudo de novo)
                  </label>

                  {!syncRetryErrorsOnly ? (
                    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-9">
                      {BRASIL_UFS.map((uf) => {
                        const selected = syncSelectedUfs.includes(uf);
                        const hadError = errorUfs.includes(uf);
                        return (
                          <button
                            key={uf}
                            type="button"
                            onClick={() => toggleSyncUf(uf)}
                            className={`rounded-md border px-1.5 py-1 text-xs font-medium transition-colors ${
                              selected
                                ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300'
                                : 'border-gray-200 bg-white text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400'
                            } ${hadError ? 'ring-1 ring-amber-400/70' : ''}`}
                          >
                            {uf}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Serão repetidas: {errorUfs.length ? errorUfs.join(', ') : 'nenhuma UF com erro'}.
                    </p>
                  )}

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {syncFullResync
                      ? 'Modo completo: revarre os últimos 30 dias nas UFs selecionadas (lento).'
                      : syncSelectedUfs.length === BRASIL_UFS.length
                        ? 'Padrão: só UFs desatualizadas, buscando publicações desde a última sync OK (rápido). Se tudo estiver em dia, avisa e não roda.'
                        : 'UFs escolhidas manualmente: busca novidades desde a última sync OK de cada uma.'}
                  </p>
                </div>
              ) : null}

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Status por UF
                  </p>
                  {errorUfCount > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      {errorUfCount} com erro: {errorUfs.join(', ')}
                    </span>
                  ) : null}
                </div>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900/80 dark:text-gray-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">UF</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Última OK</th>
                        <th className="px-3 py-2 font-medium">Última tent.</th>
                        <th className="px-3 py-2 text-right font-medium">Sync</th>
                        <th className="px-3 py-2 text-right font-medium">Espelho</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {sortedUfRows.map((row) => {
                        const mirrorCount =
                          mirror?.byUf.find((m) => m.uf === row.uf)?.count ?? 0;
                        const hasError =
                          row.lastStatus === 'error' || row.status === 'error';
                        const statusLabel =
                          row.status === 'running'
                            ? 'Agora'
                            : hasError
                              ? 'Erro'
                              : row.status === 'done' || row.lastStatus === 'success'
                                ? 'Em dia'
                                : row.lastSuccessAt
                                  ? 'Em dia'
                                  : 'Nunca';
                        const statusCls =
                          row.status === 'running'
                            ? 'font-semibold text-red-600 dark:text-red-400'
                            : hasError
                              ? 'font-medium text-amber-600 dark:text-amber-400'
                              : row.lastSuccessAt || row.lastStatus === 'success'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-gray-400';
                        const errorTitle = row.lastErrorMessage?.trim() || undefined;
                        return (
                          <tr
                            key={row.uf}
                            className={`bg-white dark:bg-gray-800 ${hasError ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}
                          >
                            <td className="px-3 py-1.5 font-medium text-gray-900 dark:text-gray-100">
                              {row.uf}
                            </td>
                            <td
                              className={`px-3 py-1.5 ${statusCls}`}
                              title={hasError ? errorTitle : undefined}
                            >
                              {statusLabel}
                              {hasError && errorTitle ? (
                                <span className="mt-0.5 block max-w-[140px] truncate text-[10px] font-normal text-amber-700/90 dark:text-amber-400/90">
                                  {errorTitle}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                              {row.lastSuccessAt ? formatSyncLabel(row.lastSuccessAt) : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                              {row.lastAttemptAt ? formatSyncLabel(row.lastAttemptAt) : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                              {row.upsertedThisRun.toLocaleString('pt-BR')}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                              {mirrorCount.toLocaleString('pt-BR')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-2">
                {syncRunning ? (
                  <button
                    type="button"
                    onClick={() => stopSyncMutation.mutate()}
                    disabled={syncStopRequested || stopSyncMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40"
                  >
                    <Square className="h-4 w-4 fill-current" />
                    {syncStopRequested || stopSyncMutation.isPending
                      ? 'Parando…'
                      : 'Parar sincronização'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startSync}
                    disabled={!syncRetryErrorsOnly && syncSelectedUfs.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <DownloadCloud className="h-4 w-4" />
                    Sincronizar agora
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function LicitacoesPncpPage() {
  const router = useRouter();
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
    staleTime: 5 * 60_000,
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' as const };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/licitacoes">
      <MainLayout
        userRole="EMPLOYEE"
        userName={user.name || ''}
        onLogout={handleLogout}
      >
        <LicitacoesPncpPageContent />
      </MainLayout>
    </ProtectedRoute>
  );
}
