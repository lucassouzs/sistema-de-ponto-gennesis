'use client';

import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  ExternalLink,
  Filter,
  Flag,
  FolderKanban,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ThumbsDown,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { TableCheckbox } from '@/components/ui/Checkbox';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { ListPagination } from '@/components/ui/ListPagination';
import { Modal } from '@/components/ui/Modal';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
} from '@/components/ui/RowActionMenu';
import { useRightClickPanScroll } from '@/hooks/useRightClickPanScroll';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { getListTableRowClassName } from '@/components/ui/listTableUi';
import { currencyDigitsToFormatted, parseCurrencyToNumber } from '@/lib/fichaDemandaApproval';

const SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1a91oJtIVYdydilp9hrmtVXnPwnXQ5Pf0/edit';

const PAGE_SIZE = 20;

const BRASIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

const BRASIL_UF_LABELS: Record<(typeof BRASIL_UFS)[number], string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
};

type LicitacaoRegiaoTab = {
  key: string;
  label: string;
  sheetName: string;
  count?: number;
};

type LicitacaoRegiaoAceiteSummary = {
  rowKey: string;
  acceptedBy: string;
  acceptedByName: string;
  acceptedAt: string;
};

type LicitacaoRegiaoRejeiteSummary = {
  rowKey: string;
  rejectedBy: string;
  rejectedByName: string;
  rejectedAt: string;
};

type LicitacaoRegiaoRowRecebimento = {
  enviadoPor: string | null;
  recebidoEm: string | null;
};

type LicitacaoRegiaoSheetData = {
  tab: LicitacaoRegiaoTab;
  spreadsheetId: string;
  headers: string[];
  rows: string[][];
  rowKeys: string[];
  manualRowKeys?: string[];
  recebimentosByRowKey?: Record<string, LicitacaoRegiaoRowRecebimento>;
  aceites: LicitacaoRegiaoAceiteSummary[];
  rejeites?: LicitacaoRegiaoRejeiteSummary[];
  rowCount: number;
  sheetAvailable: boolean;
  fetchedAt: string;
};

type RowStatus = 'aceite' | 'rejeitada' | 'vencida' | 'pendente';

type StatusFilterId =
  | 'all'
  | 'pendentes'
  | 'aceites'
  | 'rejeitadas'
  | 'vencidas';

type VisibleRow = {
  cells: string[];
  rowKey: string;
  sourceIndex: number;
  isManual: boolean;
  enviadoPor: string | null;
  recebidoEm: string | null;
  status: RowStatus;
};

type LicitacoesRegiaoPanelProps = {
  regiaoKey: string;
};

const DEFAULT_REGIAO_KEY = 'centro-oeste';

const CANONICAL_HEADERS_BY_REGIAO: Record<string, string[]> = {
  'centro-oeste': [
    'ITEM',
    'ESTADO',
    'ÓRGÃO',
    'OBJETO',
    'QUALIFICAÇÃO TÉCNICA',
    'VALOR ESTIMADO',
    'Nº DO PREGÃO',
    'CÓDIGO / UASG',
    'SITE/LOCAL',
    'ABERTURA',
    'HORA',
    'DESCONTO',
    'EMPRESA ',
    'EDITAL',
  ],
  sudeste: [
    'ITEM',
    'ESTADO',
    'ÓRGÃO',
    'OBJETO',
    'QUALIFICAÇÃO TÉCNICA',
    'VALOR ESTIMADO',
    'Nº DO PREGÃO',
    'CÓDIGO / UASG',
    'SITE/LOCAL',
    'ABERTURA',
    'HORA',
    'DESCONTO',
    'FASE DA LICITAÇÃO',
    'EMPRESA ',
    'EDITAL',
  ],
};

function getCanonicalHeaders(regiaoKey: string): string[] {
  if (regiaoKey === 'centro-oeste') return CANONICAL_HEADERS_BY_REGIAO['centro-oeste'];
  return CANONICAL_HEADERS_BY_REGIAO.sudeste;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function formatFetchedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatRecebidoEm(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function localDayKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return toDateInputValue(d);
}

function buildRowSnapshot(headers: string[], row: string[]): Record<string, string> {
  const snapshot: Record<string, string> = {};
  headers.forEach((header, index) => {
    const value = row[index]?.trim();
    if (value) snapshot[header || `Coluna ${index + 1}`] = value;
  });
  return snapshot;
}

function emptyFormFields(headers: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const header of headers) fields[header] = '';
  return fields;
}

function normalizeHeaderKey(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function isValorEstimadoHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key === 'VALOR ESTIMADO' || key === 'VALOR';
}

/** Chave comparável do valor estimado; null = vazio / texto (ex.: sigiloso) / ignorar. */
function normalizeValorEstimadoKey(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—' || trimmed === '–') return null;

  // Só números: textos como "sigiloso", "a definir", etc. não entram na comparação.
  const digits = trimmed.replace(/\D/g, '');
  if (!digits || /^0+$/.test(digits)) return null;

  const amount = parseCurrencyToNumber(trimmed);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return `n:${Math.round(amount * 100)}`;
}

function isEstadoHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key === 'ESTADO' || key === 'UF';
}

function isLinkHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return (
    key === 'EDITAL' ||
    key === 'SITE/LOCAL' ||
    key === 'SITE' ||
    key === 'LOCAL' ||
    key.startsWith('SITE')
  );
}

function isSiteLocalHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key === 'SITE/LOCAL' || key === 'SITE' || key === 'LOCAL' || key.startsWith('SITE');
}

function isItemHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'ITEM';
}

function isOrgaoHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'ORGAO';
}

function isObjetoHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'OBJETO';
}

function isPregaoHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key.includes('PREGAO') || key.includes('Nº DO PREGAO') || key.includes('NO DO PREGAO');
}

function isCodigoHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key.includes('CODIGO') || key.includes('UASG');
}

function isEmpresaHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'EMPRESA';
}

function isFaseHeader(header: string): boolean {
  return normalizeHeaderKey(header).includes('FASE');
}

function isModalidadeHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'MODALIDADE';
}

function isQualificacaoHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key.includes('QUALIFICACAO') || key.includes('HABILITACAO');
}

function isEditalHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'EDITAL';
}

/** Colunas embutidas em outras — não aparecem sozinhas na lista. */
function isNestedListColumn(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return (
    isItemHeader(header) ||
    isEstadoHeader(header) ||
    isSiteLocalHeader(header) ||
    isHoraHeader(header) ||
    isCodigoHeader(header) ||
    isDescontoHeader(header) ||
    isEmpresaHeader(header) ||
    isFaseHeader(header) ||
    isModalidadeHeader(header) ||
    key === 'ENCERRAMENTO' ||
    key === 'ENCERRAMENTO HORA'
  );
}

function findHeaderIndex(headers: string[], predicate: (header: string) => boolean): number {
  return headers.findIndex(predicate);
}

function cellAt(cells: string[], index: number): string {
  if (index < 0) return '';
  return (cells[index] ?? '').trim();
}

/** Coluna visível "Período" (header ABERTURA na planilha). */
function isPeriodoHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'ABERTURA';
}

function isEncerramentoOnlyHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'ENCERRAMENTO';
}

function isEncerramentoHoraHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'ENCERRAMENTO HORA';
}

function displayColumnHeader(header: string): string {
  if (isPeriodoHeader(header)) return 'Período';
  const key = normalizeHeaderKey(header);
  if (key === 'QUALIFICACAO TECNICA') return 'Qualificação técnica';
  return header.trim();
}

function parseEncerramentoDate(dateStr: string, horaStr?: string): Date | null {
  const m = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!day || !month || !year) return null;
  const time = String(horaStr || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (time) {
    return new Date(year, month - 1, day, Number(time[1]), Number(time[2]), 0, 0);
  }
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function isEncerramentoVencido(dateStr: string, horaStr?: string): boolean {
  const end = parseEncerramentoDate(dateStr, horaStr);
  if (!end) return false;
  return end.getTime() < Date.now();
}

function StatusBadge({
  status,
  aceiteName,
  rejeiteName,
}: {
  status: RowStatus;
  aceiteName?: string | null;
  rejeiteName?: string | null;
}) {
  if (status === 'aceite') {
    return (
      <div className="inline-flex min-w-[6rem] flex-col items-center gap-1">
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
          Aceite
        </span>
        {aceiteName ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">{aceiteName}</p>
        ) : null}
      </div>
    );
  }
  if (status === 'rejeitada') {
    return (
      <div className="inline-flex min-w-[6rem] flex-col items-center gap-1">
        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-300">
          Rejeitada
        </span>
        {rejeiteName ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">{rejeiteName}</p>
        ) : null}
      </div>
    );
  }
  if (status === 'vencida') {
    return (
      <div className="inline-flex min-w-[6rem] flex-col items-center gap-1">
        <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-semibold text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
          Vencida
        </span>
      </div>
    );
  }
  return (
    <div className="inline-flex min-w-[6rem] flex-col items-center gap-1">
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        Pendente
      </span>
    </div>
  );
}

function resolveRowStatus(input: {
  rowKey: string;
  cells: string[];
  headers: string[];
  isManual: boolean;
  aceitesByRowKey: Map<string, LicitacaoRegiaoAceiteSummary>;
  rejeitesByRowKey: Map<string, LicitacaoRegiaoRejeiteSummary>;
}): RowStatus {
  if (input.rowKey && input.rejeitesByRowKey.has(input.rowKey)) return 'rejeitada';
  if (input.rowKey && input.aceitesByRowKey.has(input.rowKey)) return 'aceite';
  // Vencidas: só licitações do sistema (PNCP / nova), nunca da planilha.
  if (!input.isManual) return 'pendente';
  const encIdx = findHeaderIndex(input.headers, isEncerramentoOnlyHeader);
  const encHoraIdx = findHeaderIndex(input.headers, isEncerramentoHoraHeader);
  if (isEncerramentoVencido(cellAt(input.cells, encIdx), cellAt(input.cells, encHoraIdx))) {
    return 'vencida';
  }
  return 'pendente';
}

function isHoraHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'HORA';
}

function isDescontoHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'DESCONTO';
}

function formatValorEstimadoInput(raw: string): string {
  const formatted = currencyDigitsToFormatted(raw);
  if (!formatted) return '';
  return `R$ ${formatted}`;
}

function formatDescontoInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const cents = parseInt(digits, 10);
  const value = cents / 100;
  const formatted = value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted}%`;
}

function isoDateToBr(iso: string): string {
  const match = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso.trim();
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function normalizeLinkInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function prepareCreateFields(
  headers: string[],
  fields: Record<string, string>
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const header of headers) {
    const raw = fields[header] ?? '';
    if (isLinkHeader(header)) {
      next[header] = normalizeLinkInput(raw);
    } else if (isPeriodoHeader(header)) {
      next[header] = isoDateToBr(raw);
    } else {
      next[header] = raw.trim();
    }
  }
  return next;
}

function CellContent({
  value,
  clamp = false,
}: {
  value: string;
  clamp?: boolean;
}) {
  const text = value.trim();
  if (!text || text === '?' || text === '-') {
    return <span className="text-gray-400">—</span>;
  }
  if (isUrl(text)) {
    return (
      <a
        href={text}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-full items-center gap-1 text-red-600 hover:text-red-700 hover:underline dark:text-red-400"
        title={text}
      >
        <span className="truncate">{text.replace(/^https?:\/\//, '')}</span>
        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
      </a>
    );
  }
  return (
    <span
      className={clamp ? 'line-clamp-2' : undefined}
      title={text.length > 80 ? text : undefined}
    >
      {text}
    </span>
  );
}

/** Objeto expansível no mesmo padrão da lista PNCP. */
function ObjetoExpandable({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const value = text.trim();

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
  }, [value, expanded]);

  if (!value || value === '?' || value === '-') {
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
        {value}
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

function isPncpOrgaoSubtitle(empresa: string): boolean {
  return /^\d+\s*[-–—]\s*.+/.test(empresa.trim());
}

const SHEET_POLL_INTERVAL_MS = 15_000;

export function LicitacoesRegiaoPanel({
  regiaoKey: regiaoKeyProp,
}: LicitacoesRegiaoPanelProps) {
  const queryClient = useQueryClient();
  const regiaoKey = regiaoKeyProp || DEFAULT_REGIAO_KEY;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterId>('all');
  const [page, setPage] = useState(1);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createFields, setCreateFields] = useState<Record<string, string>>({});
  const [showRecebidoFilter, setShowRecebidoFilter] = useState(false);
  const [recebidoDe, setRecebidoDe] = useState('');
  const [recebidoAte, setRecebidoAte] = useState('');
  const tableScrollRef = useRightClickPanScroll<HTMLDivElement>();

  const { data: tabs = [] } = useQuery({
    queryKey: ['licitacoes-planilha-regioes'],
    queryFn: async () => {
      const res = await api.get('/licitacoes/planilha-regioes');
      return (res.data?.data ?? []) as LicitacaoRegiaoTab[];
    },
  });

  const activeTab = tabs.find((tab) => tab.key === regiaoKey) ?? tabs[0] ?? {
    key: regiaoKey,
    label: regiaoKey,
    sheetName: regiaoKey,
  };

  const {
    data: sheet,
    isLoading: loadingSheet,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['licitacoes-planilha-regiao', activeTab?.key],
    queryFn: async () => {
      const res = await api.get(`/licitacoes/planilha-regioes/${activeTab!.key}`, {
        params: { refresh: '1', t: Date.now() },
      });
      return res.data?.data as LicitacaoRegiaoSheetData;
    },
    enabled: Boolean(activeTab?.key),
    staleTime: 0,
    gcTime: 0,
    structuralSharing: false,
    refetchInterval: SHEET_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const formHeaders = useMemo(() => {
    if (sheet?.headers?.length) return sheet.headers;
    return getCanonicalHeaders(activeTab?.key ?? regiaoKey);
  }, [sheet?.headers, activeTab?.key, regiaoKey]);

  const openCreateModal = () => {
    setCreateFields(emptyFormFields(formHeaders));
    setCreateModalOpen(true);
  };

  const manualRowKeySet = useMemo(
    () => new Set(sheet?.manualRowKeys ?? []),
    [sheet?.manualRowKeys]
  );

  const aceitesByRowKey = useMemo(() => {
    const map = new Map<string, LicitacaoRegiaoAceiteSummary>();
    for (const aceite of sheet?.aceites ?? []) {
      map.set(aceite.rowKey, aceite);
    }
    return map;
  }, [sheet?.aceites]);

  const rejeitesByRowKey = useMemo(() => {
    const map = new Map<string, LicitacaoRegiaoRejeiteSummary>();
    for (const rejeite of sheet?.rejeites ?? []) {
      map.set(rejeite.rowKey, rejeite);
    }
    return map;
  }, [sheet?.rejeites]);

  const visibleRows = useMemo((): VisibleRow[] => {
    const rows = sheet?.rows ?? [];
    const rowKeys = sheet?.rowKeys ?? [];
    const headers = sheet?.headers ?? [];
    const recebimentos = sheet?.recebimentosByRowKey ?? {};
    const query = normalizeSearchText(search);

    return rows
      .map((cells, sourceIndex) => {
        const rowKey = rowKeys[sourceIndex] ?? '';
        const meta = rowKey ? recebimentos[rowKey] : undefined;
        const isManual =
          Boolean(rowKey) &&
          (rowKey.startsWith('manual:') || manualRowKeySet.has(rowKey));
        const status = resolveRowStatus({
          rowKey,
          cells,
          headers,
          isManual,
          aceitesByRowKey,
          rejeitesByRowKey,
        });
        return {
          cells,
          rowKey,
          sourceIndex,
          isManual,
          enviadoPor: meta?.enviadoPor?.trim() || null,
          recebidoEm: meta?.recebidoEm || null,
          status,
        };
      })
      .filter((row) => {
        if (query) {
          const textMatch =
            row.cells.some((cell) => normalizeSearchText(cell).includes(query)) ||
            normalizeSearchText(row.enviadoPor || '').includes(query);
          if (!textMatch) return false;
        }

        if (!recebidoDe && !recebidoAte) {
          // ok
        } else {
          const day = localDayKeyFromIso(row.recebidoEm);
          if (!day) return false;
          if (recebidoDe && day < recebidoDe) return false;
          if (recebidoAte && day > recebidoAte) return false;
        }

        if (statusFilter === 'aceites' && row.status !== 'aceite') return false;
        if (statusFilter === 'rejeitadas' && row.status !== 'rejeitada') return false;
        if (statusFilter === 'vencidas' && row.status !== 'vencida') return false;
        if (statusFilter === 'pendentes' && row.status !== 'pendente') return false;
        return true;
      });
  }, [
    sheet?.rows,
    sheet?.rowKeys,
    sheet?.headers,
    sheet?.recebimentosByRowKey,
    search,
    manualRowKeySet,
    recebidoDe,
    recebidoAte,
    aceitesByRowKey,
    rejeitesByRowKey,
    statusFilter,
  ]);

  const statusStats = useMemo(() => {
    const rows = sheet?.rows ?? [];
    const rowKeys = sheet?.rowKeys ?? [];
    const headers = sheet?.headers ?? [];
    let aceites = 0;
    let rejeitadas = 0;
    let vencidas = 0;
    let pendentes = 0;
    for (let i = 0; i < rows.length; i++) {
      const rowKey = rowKeys[i] ?? '';
      const isManual =
        Boolean(rowKey) &&
        (rowKey.startsWith('manual:') || manualRowKeySet.has(rowKey));
      const status = resolveRowStatus({
        rowKey,
        cells: rows[i],
        headers,
        isManual,
        aceitesByRowKey,
        rejeitesByRowKey,
      });
      if (status === 'aceite') aceites += 1;
      else if (status === 'rejeitada') rejeitadas += 1;
      else if (status === 'vencida') vencidas += 1;
      else pendentes += 1;
    }
    const total = rows.length;
    return {
      total,
      aceites,
      rejeitadas,
      vencidas,
      pendentes,
    };
  }, [sheet?.rows, sheet?.rowKeys, sheet?.headers, aceitesByRowKey, rejeitesByRowKey, manualRowKeySet]);

  const statusCards = useMemo(
    () =>
      [
        {
          id: 'all' as const,
          label: 'Licitações',
          cardLabel: 'Total',
          count: statusStats.total,
          Icon: FolderKanban,
          iconBg: 'bg-blue-100 dark:bg-blue-900/30',
          iconColor: 'text-blue-700 dark:text-blue-300',
          listIconBg: 'bg-blue-100 dark:bg-blue-900/30',
          listIconColor: 'text-blue-700 dark:text-blue-300',
        },
        {
          id: 'pendentes' as const,
          label: 'Pendentes',
          cardLabel: 'Pendentes',
          count: statusStats.pendentes,
          Icon: ClipboardList,
          iconBg: 'bg-amber-100 dark:bg-amber-900/30',
          iconColor: 'text-amber-700 dark:text-amber-300',
          listIconBg: 'bg-amber-100 dark:bg-amber-900/30',
          listIconColor: 'text-amber-700 dark:text-amber-300',
        },
        {
          id: 'aceites' as const,
          label: 'Aceites',
          cardLabel: 'Aceites',
          count: statusStats.aceites,
          Icon: CheckCircle2,
          iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
          iconColor: 'text-emerald-700 dark:text-emerald-300',
          listIconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
          listIconColor: 'text-emerald-700 dark:text-emerald-300',
        },
        {
          id: 'rejeitadas' as const,
          label: 'Rejeitadas',
          cardLabel: 'Rejeitadas',
          count: statusStats.rejeitadas,
          Icon: ThumbsDown,
          iconBg: 'bg-red-100 dark:bg-red-900/30',
          iconColor: 'text-red-700 dark:text-red-300',
          listIconBg: 'bg-red-100 dark:bg-red-900/30',
          listIconColor: 'text-red-700 dark:text-red-300',
        },
        {
          id: 'vencidas' as const,
          label: 'Vencidas',
          cardLabel: 'Vencidas',
          count: statusStats.vencidas,
          Icon: Clock,
          iconBg: 'bg-orange-100 dark:bg-orange-900/30',
          iconColor: 'text-orange-700 dark:text-orange-300',
          listIconBg: 'bg-orange-100 dark:bg-orange-900/30',
          listIconColor: 'text-orange-700 dark:text-orange-300',
        },
      ] as const satisfies ReadonlyArray<{
        id: StatusFilterId;
        label: string;
        cardLabel: string;
        count: number;
        Icon: LucideIcon;
        iconBg: string;
        iconColor: string;
        listIconBg: string;
        listIconColor: string;
      }>,
    [statusStats]
  );

  const activeStatusCard =
    statusCards.find((card) => card.id === statusFilter) ?? statusCards[0];
  const ListStatusIcon = activeStatusCard.Icon;

  const duplicatedValorEstimadoSourceIndexes = useMemo(() => {
    const headers = sheet?.headers ?? [];
    const rows = sheet?.rows ?? [];
    const valorCol = findHeaderIndex(headers, isValorEstimadoHeader);
    if (valorCol < 0 || rows.length === 0) return new Set<number>();

    const counts = new Map<string, number>();
    const keysByIndex: Array<string | null> = rows.map((cells) =>
      normalizeValorEstimadoKey(cellAt(cells, valorCol))
    );
    for (const key of keysByIndex) {
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const duplicated = new Set<number>();
    keysByIndex.forEach((key, index) => {
      if (key && (counts.get(key) ?? 0) > 1) duplicated.add(index);
    });
    return duplicated;
  }, [sheet?.headers, sheet?.rows]);

  const duplicatedValorEstimadoCount = duplicatedValorEstimadoSourceIndexes.size;

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleRows.slice(start, start + PAGE_SIZE);
  }, [visibleRows, currentPage]);
  const pageRowsWithId = useMemo(
    () =>
      pageRows.map((row) => ({
        ...row,
        id: row.rowKey || `idx-${row.sourceIndex}`,
      })),
    [pageRows]
  );
  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(pageRowsWithId);
  const listRange = getCadastroListRange(currentPage, PAGE_SIZE, visibleRows.length);

  useEffect(() => {
    setPage(1);
  }, [search, regiaoKey, activeTab?.key, recebidoDe, recebidoAte, statusFilter]);

  useEffect(() => {
    setSearch('');
    setStatusFilter('all');
    setRecebidoDe('');
    setRecebidoAte('');
    setShowRecebidoFilter(false);
    setSelectedRowKeys(new Set());
    setCreateModalOpen(false);
    setPage(1);
  }, [regiaoKey]);

  useEffect(() => {
    if (!sheet?.rowCount && sheet?.rowCount !== 0) return;
    queryClient.setQueryData(
      ['licitacoes-planilha-regioes'],
      (prev: LicitacaoRegiaoTab[] | undefined) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((tab) =>
          tab.key === (activeTab?.key ?? regiaoKey)
            ? { ...tab, count: sheet.rowCount }
            : tab
        );
      }
    );
  }, [sheet?.rowCount, activeTab?.key, regiaoKey, queryClient]);

  const selectableVisibleRowKeys = useMemo(
    () =>
      pageRows
        .filter((row) => row.rowKey && (row.status === 'pendente' || row.status === 'vencida'))
        .map((r) => r.rowKey),
    [pageRows]
  );

  const selectedPendingRowKeys = useMemo(
    () =>
      Array.from(selectedRowKeys).filter((key) => {
        const row = visibleRows.find((r) => r.rowKey === key);
        return row && (row.status === 'pendente' || row.status === 'vencida');
      }),
    [selectedRowKeys, visibleRows]
  );

  const selectedAcceptedRowKeys = useMemo(
    () =>
      Array.from(selectedRowKeys).filter((key) => {
        const row = visibleRows.find((r) => r.rowKey === key);
        return row?.status === 'aceite';
      }),
    [selectedRowKeys, visibleRows]
  );

  const selectedRejectedRowKeys = useMemo(
    () =>
      Array.from(selectedRowKeys).filter((key) => {
        const row = visibleRows.find((r) => r.rowKey === key);
        return row?.status === 'rejeitada';
      }),
    [selectedRowKeys, visibleRows]
  );

  const selectedManualRowKeys = useMemo(
    () =>
      Array.from(selectedRowKeys).filter(
        (key) => key.startsWith('manual:') || manualRowKeySet.has(key)
      ),
    [selectedRowKeys, manualRowKeySet]
  );

  const allVisibleSelected =
    selectableVisibleRowKeys.length > 0 &&
    selectableVisibleRowKeys.every((key) => selectedRowKeys.has(key));

  const aceiteMutation = useMutation({
    mutationFn: async (rowKeys: string[]) => {
      if (!sheet || !activeTab) throw new Error('Dados da planilha indisponíveis.');

      const items = rowKeys.map((rowKey) => {
        const sourceIndex = sheet.rowKeys.indexOf(rowKey);
        return {
          rowKey,
          rowSnapshot:
            sourceIndex >= 0
              ? buildRowSnapshot(sheet.headers, sheet.rows[sourceIndex])
              : undefined,
        };
      });

      const res = await api.post('/licitacoes/planilha-regioes/aceites', {
        regiaoKey: activeTab.key,
        spreadsheetId: sheet.spreadsheetId,
        items,
      });
      return res.data as {
        message?: string;
        data?: LicitacaoRegiaoAceiteSummary[];
      };
    },
    onSuccess: async (payload) => {
      toast.success(payload?.message ?? 'Aceite registrado com sucesso.');
      setSelectedRowKeys(new Set());

      const incomingAceites = payload?.data ?? [];
      if (incomingAceites.length > 0 && activeTab?.key) {
        const acceptedKeys = new Set(incomingAceites.map((a) => a.rowKey));
        queryClient.setQueryData<LicitacaoRegiaoSheetData>(
          ['licitacoes-planilha-regiao', activeTab.key],
          (current) => {
            if (!current) return current;
            const byKey = new Map((current.aceites ?? []).map((aceite) => [aceite.rowKey, aceite]));
            for (const aceite of incomingAceites) {
              byKey.set(aceite.rowKey, aceite);
            }
            return {
              ...current,
              aceites: Array.from(byKey.values()),
              rejeites: (current.rejeites ?? []).filter((r) => !acceptedKeys.has(r.rowKey)),
            };
          }
        );
      }

      await queryClient.invalidateQueries({ queryKey: ['licitacoes-planilha-regiao', activeTab?.key] });
      await queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      await refetch();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao registrar aceite.');
    },
  });

  const desfazerAceiteMutation = useMutation({
    mutationFn: async (rowKeys: string[]) => {
      if (!sheet || !activeTab) throw new Error('Dados da planilha indisponíveis.');

      const res = await api.delete('/licitacoes/planilha-regioes/aceites', {
        data: {
          regiaoKey: activeTab.key,
          spreadsheetId: sheet.spreadsheetId,
          rowKeys,
        },
      });
      return res.data as {
        message?: string;
        data?: { rowKeys?: string[] };
      };
    },
    onSuccess: async (payload) => {
      toast.success(payload?.message ?? 'Aceite desfeito com sucesso.');
      setSelectedRowKeys(new Set());

      const removedRowKeys = new Set(payload?.data?.rowKeys ?? []);
      if (removedRowKeys.size > 0 && activeTab?.key) {
        queryClient.setQueryData<LicitacaoRegiaoSheetData>(
          ['licitacoes-planilha-regiao', activeTab.key],
          (current) => {
            if (!current) return current;
            return {
              ...current,
              aceites: (current.aceites ?? []).filter((aceite) => !removedRowKeys.has(aceite.rowKey)),
            };
          }
        );
      }

      await queryClient.invalidateQueries({ queryKey: ['licitacoes-planilha-regiao', activeTab?.key] });
      await queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      await refetch();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao desfazer aceite.');
    },
  });

  const rejeitarMutation = useMutation({
    mutationFn: async (rowKeys: string[]) => {
      if (!sheet || !activeTab) throw new Error('Dados da planilha indisponíveis.');

      const items = rowKeys.map((rowKey) => {
        const sourceIndex = sheet.rowKeys.indexOf(rowKey);
        return {
          rowKey,
          rowSnapshot:
            sourceIndex >= 0
              ? buildRowSnapshot(sheet.headers, sheet.rows[sourceIndex])
              : undefined,
        };
      });

      const res = await api.post('/licitacoes/planilha-regioes/rejeites', {
        regiaoKey: activeTab.key,
        spreadsheetId: sheet.spreadsheetId,
        items,
      });
      return res.data as {
        message?: string;
        data?: LicitacaoRegiaoRejeiteSummary[];
      };
    },
    onSuccess: async (payload) => {
      toast.success(payload?.message ?? 'Licitação rejeitada.');
      setSelectedRowKeys(new Set());

      const incoming = payload?.data ?? [];
      if (incoming.length > 0 && activeTab?.key) {
        const rejectedKeys = new Set(incoming.map((r) => r.rowKey));
        queryClient.setQueryData<LicitacaoRegiaoSheetData>(
          ['licitacoes-planilha-regiao', activeTab.key],
          (current) => {
            if (!current) return current;
            const byKey = new Map((current.rejeites ?? []).map((r) => [r.rowKey, r]));
            for (const rejeite of incoming) {
              byKey.set(rejeite.rowKey, rejeite);
            }
            return {
              ...current,
              rejeites: Array.from(byKey.values()),
              aceites: (current.aceites ?? []).filter((a) => !rejectedKeys.has(a.rowKey)),
            };
          }
        );
      }

      await queryClient.invalidateQueries({ queryKey: ['licitacoes-planilha-regiao', activeTab?.key] });
      await queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      await refetch();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao rejeitar licitação.');
    },
  });

  const desfazerRejeiteMutation = useMutation({
    mutationFn: async (rowKeys: string[]) => {
      if (!sheet || !activeTab) throw new Error('Dados da planilha indisponíveis.');

      const res = await api.delete('/licitacoes/planilha-regioes/rejeites', {
        data: {
          regiaoKey: activeTab.key,
          spreadsheetId: sheet.spreadsheetId,
          rowKeys,
        },
      });
      return res.data as {
        message?: string;
        data?: { rowKeys?: string[] };
      };
    },
    onSuccess: async (payload) => {
      toast.success(payload?.message ?? 'Rejeição desfeita.');
      setSelectedRowKeys(new Set());

      const removedRowKeys = new Set(payload?.data?.rowKeys ?? []);
      if (removedRowKeys.size > 0 && activeTab?.key) {
        queryClient.setQueryData<LicitacaoRegiaoSheetData>(
          ['licitacoes-planilha-regiao', activeTab.key],
          (current) => {
            if (!current) return current;
            return {
              ...current,
              rejeites: (current.rejeites ?? []).filter((r) => !removedRowKeys.has(r.rowKey)),
            };
          }
        );
      }

      await queryClient.invalidateQueries({ queryKey: ['licitacoes-planilha-regiao', activeTab?.key] });
      await refetch();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao desfazer rejeição.');
    },
  });

  const createManualMutation = useMutation({
    mutationFn: async (fields: Record<string, string>) => {
      if (!activeTab) throw new Error('Região indisponível.');
      const res = await api.post('/licitacoes/planilha-regioes/manuais', {
        regiaoKey: activeTab.key,
        fields,
      });
      return res.data as { message?: string };
    },
    onSuccess: async (payload) => {
      toast.success(payload?.message ?? 'Licitação criada com sucesso.');
      setCreateModalOpen(false);
      setCreateFields({});
      await queryClient.invalidateQueries({ queryKey: ['licitacoes-planilha-regiao', activeTab?.key] });
      await refetch();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao criar licitação.');
    },
  });

  const deleteManualMutation = useMutation({
    mutationFn: async (rowKeys: string[]) => {
      if (!sheet || !activeTab) throw new Error('Dados indisponíveis.');
      const uniqueKeys = [...new Set(rowKeys.filter((key) => key.startsWith('manual:')))];
      if (uniqueKeys.length === 0) {
        throw new Error('Nenhuma licitação do sistema selecionada.');
      }

      for (const rowKey of uniqueKeys) {
        await api.delete('/licitacoes/planilha-regioes/manuais', {
          data: {
            regiaoKey: activeTab.key,
            spreadsheetId: sheet.spreadsheetId,
            rowKey,
          },
        });
      }

      return { count: uniqueKeys.length };
    },
    onSuccess: async (payload) => {
      toast.success(
        payload.count === 1
          ? 'Licitação removida da lista.'
          : `${payload.count} licitações removidas da lista.`
      );
      setSelectedRowKeys(new Set());
      await queryClient.invalidateQueries({ queryKey: ['licitacoes-planilha-regiao', activeTab?.key] });
      await queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      await refetch();
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(err.response?.data?.message ?? err.message ?? 'Erro ao excluir licitação.');
    },
  });

  const isAceiteBusy =
    aceiteMutation.isPending ||
    desfazerAceiteMutation.isPending ||
    rejeitarMutation.isPending ||
    desfazerRejeiteMutation.isPending;
  const isManualBusy = createManualMutation.isPending || deleteManualMutation.isPending;

  const toggleRowSelection = (rowKey: string) => {
    if (!rowKey) return;
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const key of selectableVisibleRowKeys) next.delete(key);
      } else {
        for (const key of selectableVisibleRowKeys) next.add(key);
      }
      return next;
    });
  };

  const someVisibleSelected =
    selectableVisibleRowKeys.some((key) => selectedRowKeys.has(key)) && !allVisibleSelected;

  const errorMessage =
    error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
      : error instanceof Error
        ? error.message
        : 'Erro ao carregar planilha';

  const tableHeaders = sheet?.headers?.length ? sheet.headers : formHeaders;
  const canShowTable = Boolean(tableHeaders.length);
  const col = {
    estado: findHeaderIndex(tableHeaders, isEstadoHeader),
    site: findHeaderIndex(tableHeaders, isSiteLocalHeader),
    hora: findHeaderIndex(tableHeaders, isHoraHeader),
    encerramento: findHeaderIndex(tableHeaders, isEncerramentoOnlyHeader),
    encerramentoHora: findHeaderIndex(tableHeaders, isEncerramentoHoraHeader),
    codigo: findHeaderIndex(tableHeaders, isCodigoHeader),
    desconto: findHeaderIndex(tableHeaders, isDescontoHeader),
    empresa: findHeaderIndex(tableHeaders, isEmpresaHeader),
    fase: findHeaderIndex(tableHeaders, isFaseHeader),
    modalidade: findHeaderIndex(tableHeaders, isModalidadeHeader),
  };
  const visibleTableColumns = tableHeaders
    .map((header, colIndex) => ({ header, colIndex }))
    .filter(({ header }) => !isNestedListColumn(header));
  const valorColumn = visibleTableColumns.find(({ header }) =>
    isValorEstimadoHeader(header)
  );
  const tableColumnsWithoutValor = visibleTableColumns.filter(
    ({ header }) => !isValorEstimadoHeader(header)
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
        {statusCards.map((card) => (
          <FilterStatCard
            key={card.id}
            label={card.cardLabel}
            count={card.count}
            icon={card.Icon}
            iconBg={card.iconBg}
            iconColor={card.iconColor}
            isActive={statusFilter === card.id}
            loading={loadingSheet}
            onClick={() => {
              if (card.id === 'all') {
                setStatusFilter('all');
              } else {
                setStatusFilter((prev) => (prev === card.id ? 'all' : card.id));
              }
              setPage(1);
            }}
          />
        ))}
      </div>

      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className={`rounded-lg p-2 sm:p-3 ${activeStatusCard.listIconBg}`}>
                <ListStatusIcon
                  className={`h-5 w-5 sm:h-6 sm:w-6 ${activeStatusCard.listIconColor}`}
                  aria-hidden
                />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {activeStatusCard.label}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {loadingSheet
                    ? 'Carregando…'
                    : `${visibleRows.length} ${
                        visibleRows.length === 1 ? 'licitação' : 'licitações'
                      }`}
                  {sheet?.aceites?.length ? ` · ${sheet.aceites.length} com aceite` : ''}
                  {manualRowKeySet.size ? ` · ${manualRowKeySet.size} no sistema` : ''}
                  {duplicatedValorEstimadoCount
                    ? ` · ${duplicatedValorEstimadoCount} com valor estimado repetido`
                    : ''}
                  {sheet?.fetchedAt ? ` · Atualizado em ${formatFetchedAt(sheet.fetchedAt)}` : ''}
                </p>
              </div>
            </div>
            <div className={cadastroListClasses.cardToolbar}>
              <div className="relative min-w-[200px] flex-1 sm:w-[260px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar órgão, objeto, pregão, UF…"
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
                onClick={() => setShowRecebidoFilter(true)}
                aria-label="Filtrar por data recebida"
                title="Filtrar por data recebida"
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  recebidoDe || recebidoAte
                    ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300'
                    : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Filter className="h-4 w-4" aria-hidden />
              </button>
              <a
                href={SPREADSHEET_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir planilha"
                title="Abrir planilha"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
              <button
                type="button"
                onClick={() => {
                  void refetch();
                }}
                disabled={isFetching || !activeTab}
                aria-label="Atualizar"
                title="Atualizar"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                {isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                disabled={!activeTab || loadingSheet}
                className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                <span>Nova licitação</span>
              </button>
              {selectedPendingRowKeys.length > 0 ? (
                <button
                  type="button"
                  onClick={() => aceiteMutation.mutate(selectedPendingRowKeys)}
                  disabled={isAceiteBusy || loadingSheet || !sheet}
                  className="flex h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                >
                  {aceiteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span>Aceite ({selectedPendingRowKeys.length})</span>
                </button>
              ) : null}
              {selectedPendingRowKeys.length > 0 ? (
                <button
                  type="button"
                  onClick={() => rejeitarMutation.mutate(selectedPendingRowKeys)}
                  disabled={isAceiteBusy || loadingSheet || !sheet}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                >
                  {rejeitarMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ThumbsDown className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span>Rejeitar ({selectedPendingRowKeys.length})</span>
                </button>
              ) : null}
              {selectedAcceptedRowKeys.length > 0 ? (
                <button
                  type="button"
                  onClick={() => desfazerAceiteMutation.mutate(selectedAcceptedRowKeys)}
                  disabled={isAceiteBusy || loadingSheet || !sheet}
                  className="flex h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  {desfazerAceiteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Undo2 className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span>Desfazer aceite ({selectedAcceptedRowKeys.length})</span>
                </button>
              ) : null}
              {selectedRejectedRowKeys.length > 0 ? (
                <button
                  type="button"
                  onClick={() => desfazerRejeiteMutation.mutate(selectedRejectedRowKeys)}
                  disabled={isAceiteBusy || loadingSheet || !sheet}
                  className="flex h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  {desfazerRejeiteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Undo2 className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span>Desfazer rejeição ({selectedRejectedRowKeys.length})</span>
                </button>
              ) : null}
              {selectedManualRowKeys.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        selectedManualRowKeys.length === 1
                          ? 'Excluir esta licitação criada no sistema?'
                          : `Excluir ${selectedManualRowKeys.length} licitações criadas no sistema?`
                      )
                    ) {
                      deleteManualMutation.mutate(selectedManualRowKeys);
                    }
                  }}
                  disabled={isManualBusy || loadingSheet || !sheet}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                >
                  {deleteManualMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span>Excluir ({selectedManualRowKeys.length})</span>
                </button>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className={`${cadastroListClasses.cardContent} space-y-4`}>
          {error ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="max-w-md font-medium text-red-600 dark:text-red-400">{errorMessage}</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="text-sm text-gray-600 underline hover:text-gray-800 dark:text-gray-400"
              >
                Tentar novamente
              </button>
            </div>
          ) : loadingSheet ? (
            <CadastroListLoading message="Carregando licitações..." />
          ) : !canShowTable || visibleRows.length === 0 ? (
            <CadastroListEmpty
              icon={ListStatusIcon}
              title={
                search.trim() || statusFilter !== 'all'
                  ? 'Nenhum resultado para o filtro atual'
                  : 'Nenhuma licitação nesta região'
              }
              hint={
                search.trim() || statusFilter !== 'all'
                  ? 'Tente ajustar a busca ou o card de status'
                  : sheet?.sheetAvailable === false
                    ? `Use “Nova licitação” ou aguarde a aba ${sheet.tab.sheetName} na planilha`
                    : 'Use “Nova licitação” para cadastrar a primeira'
              }
            />
          ) : (
            <>
              <CadastroListSummary
                startItem={listRange.startItem}
                endItem={listRange.endItem}
                total={visibleRows.length}
                itemLabel="licitação"
                itemLabelPlural="licitações"
                currentPage={currentPage}
                totalPages={listRange.totalPages}
              />
              <div ref={tableScrollRef} className="overflow-x-auto">
                <table className="w-full min-w-[64rem] text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th scope="col" className={`${cadastroListClasses.thCenter} w-12`}>
                        <TableCheckbox
                          checked={allVisibleSelected}
                          indeterminate={someVisibleSelected}
                          onChange={() => toggleSelectAllVisible()}
                          disabled={selectableVisibleRowKeys.length === 0}
                          ariaLabel="Selecionar todas as licitações da página"
                        />
                      </th>
                      {tableColumnsWithoutValor.map(({ header, colIndex }) => {
                        const isWide =
                          isObjetoHeader(header) ||
                          isQualificacaoHeader(header) ||
                          isOrgaoHeader(header);
                        const isCenter =
                          isPeriodoHeader(header) ||
                          isEditalHeader(header) ||
                          isPregaoHeader(header);
                        return (
                          <Fragment key={`${header}-${colIndex}`}>
                            <th
                              scope="col"
                              className={`${
                                isCenter ? cadastroListClasses.thCenter : cadastroListClasses.th
                              } ${isWide ? 'min-w-[14rem]' : 'whitespace-nowrap'}`}
                            >
                              {displayColumnHeader(header)}
                            </th>
                            {isPeriodoHeader(header) ? (
                              <>
                                {valorColumn ? (
                                  <th
                                    scope="col"
                                    className={`${cadastroListClasses.thNumeric} whitespace-nowrap`}
                                  >
                                    {valorColumn.header.trim()}
                                  </th>
                                ) : null}
                                <th scope="col" className={cadastroListClasses.thCenter}>
                                  Status
                                </th>
                              </>
                            ) : null}
                          </Fragment>
                        );
                      })}
                      {!tableColumnsWithoutValor.some(({ header }) =>
                        isPeriodoHeader(header)
                      ) ? (
                        <>
                          {valorColumn ? (
                            <th
                              scope="col"
                              className={`${cadastroListClasses.thNumeric} whitespace-nowrap`}
                            >
                              {valorColumn.header.trim()}
                            </th>
                          ) : null}
                          <th scope="col" className={cadastroListClasses.thCenter}>
                            Status
                          </th>
                        </>
                      ) : null}
                      <th scope="col" className={`${cadastroListClasses.thCenter} whitespace-nowrap`}>
                        Recebido
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Origem
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => {
                      const aceite = row.rowKey ? aceitesByRowKey.get(row.rowKey) : undefined;
                      const rejeite = row.rowKey ? rejeitesByRowKey.get(row.rowKey) : undefined;
                      const isSelected = row.rowKey ? selectedRowKeys.has(row.rowKey) : false;
                      const hasValorEstimadoDuplicado = duplicatedValorEstimadoSourceIndexes.has(
                        row.sourceIndex
                      );
                      const estado = cellAt(row.cells, col.estado);
                      const site = cellAt(row.cells, col.site);
                      const hora = cellAt(row.cells, col.hora);
                      const encerramento = cellAt(row.cells, col.encerramento);
                      const encerramentoHora = cellAt(row.cells, col.encerramentoHora);
                      const codigo = cellAt(row.cells, col.codigo);
                      const desconto = cellAt(row.cells, col.desconto);
                      const empresa = cellAt(row.cells, col.empresa);
                      const fase = cellAt(row.cells, col.fase);
                      const modalidade = cellAt(row.cells, col.modalidade);
                      const fromPncp = row.isManual && isPncpOrgaoSubtitle(empresa);

                      return (
                        <tr
                          key={`${row.sourceIndex}-${row.rowKey}`}
                          className={getListTableRowClassName(
                            false,
                            `border-b border-gray-200 align-middle dark:border-gray-700${
                              isSelected ? ' bg-gray-50 dark:bg-gray-700/40' : ''
                            }`
                          )}
                        >
                          <td className={cadastroListClasses.tdCenter}>
                            <TableCheckbox
                              checked={isSelected}
                              onChange={() => toggleRowSelection(row.rowKey)}
                              disabled={!row.rowKey || isAceiteBusy}
                              ariaLabel="Selecionar licitação"
                            />
                          </td>
                          {tableColumnsWithoutValor.map(({ header, colIndex }) => {
                            const value = cellAt(row.cells, colIndex);

                            if (isOrgaoHeader(header)) {
                              const empresaTrim = empresa.trim();
                              const orgaoSubtitle = /^\d+\s*[-–—]\s*.+/.test(empresaTrim)
                                ? empresaTrim
                                : [estado, empresa].filter(Boolean).join(' · ') || '—';
                              return (
                                <td
                                  key={`${row.rowKey}-${colIndex}`}
                                  className={`${cadastroListClasses.td} min-w-[10rem]`}
                                >
                                  <div className="min-w-0">
                                    <p className="font-medium text-gray-900 dark:text-gray-100">
                                      <CellContent value={value} clamp />
                                    </p>
                                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                      {orgaoSubtitle}
                                    </p>
                                  </div>
                                </td>
                              );
                            }

                            if (isObjetoHeader(header)) {
                              return (
                                <td
                                  key={`${row.rowKey}-${colIndex}`}
                                  className={`${cadastroListClasses.td} min-w-[16rem] max-w-[28rem]`}
                                >
                                  <div className="min-w-0">
                                    <ObjetoExpandable text={value} />
                                    {!fromPncp && site ? (
                                      <div className="mt-0.5 text-xs">
                                        <CellContent value={site} />
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              );
                            }

                            if (isQualificacaoHeader(header)) {
                              return (
                                <td
                                  key={`${row.rowKey}-${colIndex}`}
                                  className={`${cadastroListClasses.td} max-w-sm`}
                                >
                                  <CellContent value={value} clamp />
                                </td>
                              );
                            }

                            if (isPregaoHeader(header)) {
                              const pregaoSubtitle = fromPncp
                                ? modalidade || '—'
                                : [codigo, fase].filter(Boolean).join(' · ') || '—';
                              return (
                                <td
                                  key={`${row.rowKey}-${colIndex}`}
                                  className={cadastroListClasses.tdCenter}
                                >
                                  <div className="min-w-0">
                                    <p className="text-gray-900 dark:text-gray-100">
                                      <CellContent value={value} clamp />
                                    </p>
                                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                      {pregaoSubtitle}
                                    </p>
                                  </div>
                                </td>
                              );
                            }

                            if (isPeriodoHeader(header)) {
                              const valorValue = valorColumn
                                ? cellAt(row.cells, valorColumn.colIndex)
                                : '';
                              const aberturaLabel = [value, hora].filter(Boolean).join(' ') || '—';
                              const encerramentoLabel = row.isManual
                                ? [encerramento, encerramentoHora].filter(Boolean).join(' ')
                                : '';
                              return (
                                <Fragment key={`${row.rowKey}-${colIndex}-abertura-valor-status`}>
                                  <td className={cadastroListClasses.tdCenter}>
                                    <div>
                                      <p className="whitespace-nowrap text-gray-900 dark:text-gray-100">
                                        {aberturaLabel}
                                      </p>
                                      {encerramentoLabel ? (
                                        <p className="mt-0.5 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                          {encerramentoLabel}
                                        </p>
                                      ) : null}
                                    </div>
                                  </td>
                                  {valorColumn ? (
                                    <td className={cadastroListClasses.tdNumeric}>
                                      <div className="inline-flex flex-col items-end">
                                        <div className="inline-flex items-center justify-end gap-1.5">
                                          {hasValorEstimadoDuplicado ? (
                                            <span
                                              className="inline-flex items-center"
                                              title="Valor estimado repetido nesta região"
                                            >
                                              <Flag
                                                className="h-3.5 w-3.5 fill-amber-400 text-amber-500 dark:fill-amber-500 dark:text-amber-400"
                                                aria-label="Valor estimado repetido"
                                              />
                                            </span>
                                          ) : null}
                                          <p className="whitespace-nowrap">
                                            {valorValue || '—'}
                                          </p>
                                        </div>
                                        {desconto ? (
                                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                            Desc. {desconto}
                                          </p>
                                        ) : null}
                                        {hasValorEstimadoDuplicado ? (
                                          <p className="mt-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                            Valor repetido
                                          </p>
                                        ) : null}
                                      </div>
                                    </td>
                                  ) : null}
                                  <td className={cadastroListClasses.tdCenter}>
                                    <StatusBadge
                                      status={row.status}
                                      aceiteName={aceite?.acceptedByName}
                                      rejeiteName={rejeite?.rejectedByName}
                                    />
                                  </td>
                                </Fragment>
                              );
                            }

                            if (isEditalHeader(header)) {
                              const editalUrl = value.trim();
                              const hasUrl = Boolean(editalUrl) && isUrl(editalUrl);
                              return (
                                <td
                                  key={`${row.rowKey}-${colIndex}`}
                                  className={cadastroListClasses.tdCenter}
                                >
                                  {hasUrl ? (
                                    <div className="flex justify-center">
                                      <a
                                        href={editalUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(event) => event.stopPropagation()}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                                        aria-label="Abrir edital"
                                        title="Abrir edital"
                                      >
                                        <ExternalLink className="h-4 w-4" aria-hidden />
                                      </a>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                              );
                            }

                            return (
                              <td
                                key={`${row.rowKey}-${colIndex}`}
                                className={cadastroListClasses.td}
                              >
                                <CellContent value={value} />
                              </td>
                            );
                          })}
                          {!tableColumnsWithoutValor.some(({ header }) =>
                            isPeriodoHeader(header)
                          ) ? (
                            <>
                              {valorColumn ? (
                                <td className={cadastroListClasses.tdNumeric}>
                                  <div className="inline-flex flex-col items-end">
                                    <div className="inline-flex items-center justify-end gap-1.5">
                                      {hasValorEstimadoDuplicado ? (
                                        <span
                                          className="inline-flex items-center"
                                          title="Valor estimado repetido nesta região"
                                        >
                                          <Flag
                                            className="h-3.5 w-3.5 fill-amber-400 text-amber-500 dark:fill-amber-500 dark:text-amber-400"
                                            aria-label="Valor estimado repetido"
                                          />
                                        </span>
                                      ) : null}
                                      <p className="whitespace-nowrap">
                                        {cellAt(row.cells, valorColumn.colIndex) || '—'}
                                      </p>
                                    </div>
                                    {desconto ? (
                                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                        Desc. {desconto}
                                      </p>
                                    ) : null}
                                    {hasValorEstimadoDuplicado ? (
                                      <p className="mt-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                        Valor repetido
                                      </p>
                                    ) : null}
                                  </div>
                                </td>
                              ) : null}
                              <td className={cadastroListClasses.tdCenter}>
                                <StatusBadge
                                  status={row.status}
                                  aceiteName={aceite?.acceptedByName}
                                  rejeiteName={rejeite?.rejectedByName}
                                />
                              </td>
                            </>
                          ) : null}
                          <td className={cadastroListClasses.tdCenter}>
                            <div className="inline-flex min-w-[7.5rem] flex-col items-center gap-0.5">
                              <span
                                className="max-w-[10rem] truncate text-sm font-medium text-gray-900 dark:text-gray-100"
                                title={row.enviadoPor || undefined}
                              >
                                {row.enviadoPor || '—'}
                              </span>
                              <span className="whitespace-nowrap text-[11px] text-gray-500 dark:text-gray-400">
                                {formatRecebidoEm(row.recebidoEm)}
                              </span>
                            </div>
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            {row.isManual ? (
                              <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">
                                Sistema
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-gray-700/60 dark:text-gray-300">
                                Planilha
                              </span>
                            )}
                          </td>
                          <RowActionMenuCell
                            align="center"
                            isOpen={isRowMenuOpen(row.rowKey || `idx-${row.sourceIndex}`)}
                            onToggle={(e) =>
                              toggleRowActionMenu(
                                row.rowKey || `idx-${row.sourceIndex}`,
                                e.currentTarget as HTMLButtonElement
                              )
                            }
                          />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ListPagination
                currentPage={currentPage}
                totalPages={listRange.totalPages}
                onPageChange={setPage}
              />
              {rowActionMenu && rowForActionMenu ? (
                <RowActionMenuPortal
                  menu={rowActionMenu}
                  onClose={closeRowActionMenu}
                  onEdit={() => undefined}
                  hideDefaultActions
                  extraItems={[
                    ...(rowForActionMenu.status === 'pendente' ||
                    rowForActionMenu.status === 'vencida'
                      ? [
                          {
                            label: 'Aceite',
                            disabled: !rowForActionMenu.rowKey || isAceiteBusy,
                            onClick: () => aceiteMutation.mutate([rowForActionMenu.rowKey]),
                            icon: (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            ),
                          },
                          {
                            label: 'Rejeitar',
                            disabled: !rowForActionMenu.rowKey || isAceiteBusy,
                            onClick: () => rejeitarMutation.mutate([rowForActionMenu.rowKey]),
                            icon: (
                              <ThumbsDown className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                            ),
                          },
                        ]
                      : []),
                    ...(rowForActionMenu.status === 'aceite'
                      ? [
                          {
                            label: 'Desfazer aceite',
                            disabled: !rowForActionMenu.rowKey || isAceiteBusy,
                            onClick: () =>
                              desfazerAceiteMutation.mutate([rowForActionMenu.rowKey]),
                            icon: (
                              <Undo2 className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                            ),
                          },
                        ]
                      : []),
                    ...(rowForActionMenu.status === 'rejeitada'
                      ? [
                          {
                            label: 'Desfazer rejeição',
                            disabled: !rowForActionMenu.rowKey || isAceiteBusy,
                            onClick: () =>
                              desfazerRejeiteMutation.mutate([rowForActionMenu.rowKey]),
                            icon: (
                              <Undo2 className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                            ),
                          },
                        ]
                      : []),
                    ...(rowForActionMenu.isManual
                      ? [
                          {
                            label: 'Excluir',
                            disabled: isManualBusy || !rowForActionMenu.rowKey,
                            onClick: () => {
                              if (
                                window.confirm(
                                  'Excluir esta licitação criada no sistema? Ela não existe na planilha.'
                                )
                              ) {
                                deleteManualMutation.mutate([rowForActionMenu.rowKey]);
                              }
                            },
                            icon: (
                              <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {showRecebidoFilter ? (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowRecebidoFilter(false)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Período recebido
              </h3>
              <button
                type="button"
                onClick={() => setShowRecebidoFilter(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Fechar filtro"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Filtra pela data em que a licitação entrou nesta lista (envio PNCP, nova licitação ou
                inclusão da planilha).
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    De
                  </label>
                  <DatePickerField
                    value={recebidoDe}
                    onChange={setRecebidoDe}
                    aria-label="Recebida de"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Até
                  </label>
                  <DatePickerField
                    value={recebidoAte}
                    onChange={setRecebidoAte}
                    aria-label="Recebida até"
                    className="w-full"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setRecebidoDe('');
                  setRecebidoAte('');
                }}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setShowRecebidoFilter(false)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        isOpen={createModalOpen}
        onClose={() => {
          if (createManualMutation.isPending) return;
          setCreateModalOpen(false);
        }}
        title={`Nova licitação — ${activeTab?.label ?? 'Região'}`}
        size="xl"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createManualMutation.mutate(prepareCreateFields(formHeaders, createFields));
          }}
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Preencha os mesmos campos da planilha. A licitação será adicionada apenas à lista do
            sistema e não será gravada na planilha Google.
          </p>
          <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {formHeaders.map((header) => {
              const label = displayColumnHeader(header);
              const value = createFields[header] ?? '';
              const fieldClass =
                'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900';

              if (isEstadoHeader(header)) {
                return (
                  <label key={header} className="block sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </span>
                    <select
                      value={value}
                      onChange={(e) =>
                        setCreateFields((prev) => ({ ...prev, [header]: e.target.value }))
                      }
                      disabled={createManualMutation.isPending}
                      className={fieldClass}
                    >
                      <option value="">Selecione o estado</option>
                      {BRASIL_UFS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf} — {BRASIL_UF_LABELS[uf]}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }

              if (isValorEstimadoHeader(header)) {
                return (
                  <label key={header} className="block sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={value}
                      onChange={(e) =>
                        setCreateFields((prev) => ({
                          ...prev,
                          [header]: formatValorEstimadoInput(e.target.value),
                        }))
                      }
                      placeholder="R$ 0,00"
                      disabled={createManualMutation.isPending}
                      className={fieldClass}
                    />
                  </label>
                );
              }

              if (isPeriodoHeader(header)) {
                return (
                  <label key={header} className="block sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </span>
                    <input
                      type="date"
                      value={value}
                      onChange={(e) =>
                        setCreateFields((prev) => ({ ...prev, [header]: e.target.value }))
                      }
                      disabled={createManualMutation.isPending}
                      className={fieldClass}
                    />
                  </label>
                );
              }

              if (isHoraHeader(header)) {
                return (
                  <label key={header} className="block sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </span>
                    <input
                      type="time"
                      value={value}
                      onChange={(e) =>
                        setCreateFields((prev) => ({ ...prev, [header]: e.target.value }))
                      }
                      disabled={createManualMutation.isPending}
                      className={fieldClass}
                    />
                  </label>
                );
              }

              if (isDescontoHeader(header)) {
                return (
                  <label key={header} className="block sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={value}
                      onChange={(e) =>
                        setCreateFields((prev) => ({
                          ...prev,
                          [header]: formatDescontoInput(e.target.value),
                        }))
                      }
                      placeholder="0,00%"
                      disabled={createManualMutation.isPending}
                      className={fieldClass}
                    />
                  </label>
                );
              }

              if (isLinkHeader(header)) {
                return (
                  <label key={header} className="block sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </span>
                    <input
                      type="url"
                      value={value}
                      onChange={(e) =>
                        setCreateFields((prev) => ({ ...prev, [header]: e.target.value }))
                      }
                      placeholder="https://"
                      disabled={createManualMutation.isPending}
                      className={fieldClass}
                    />
                  </label>
                );
              }

              if (
                normalizeHeaderKey(header) === 'OBJETO' ||
                normalizeHeaderKey(header) === 'QUALIFICACAO TECNICA'
              ) {
                return (
                  <label key={header} className="block sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </span>
                    <textarea
                      value={value}
                      onChange={(e) =>
                        setCreateFields((prev) => ({ ...prev, [header]: e.target.value }))
                      }
                      rows={3}
                      disabled={createManualMutation.isPending}
                      className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    />
                  </label>
                );
              }

              return (
                <label key={header} className="block sm:col-span-1">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {label}
                  </span>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) =>
                      setCreateFields((prev) => ({ ...prev, [header]: e.target.value }))
                    }
                    disabled={createManualMutation.isPending}
                    className={fieldClass}
                  />
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              disabled={createManualMutation.isPending}
              className="inline-flex h-9 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createManualMutation.isPending}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {createManualMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              Criar licitação
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
