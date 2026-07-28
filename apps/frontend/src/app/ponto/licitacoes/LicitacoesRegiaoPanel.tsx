'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ExternalLink,
  Flag,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { TableCheckbox } from '@/components/ui/Checkbox';
import { ListPagination } from '@/components/ui/ListPagination';
import { Modal } from '@/components/ui/Modal';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
} from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
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
};

type LicitacaoRegiaoAceiteSummary = {
  rowKey: string;
  acceptedBy: string;
  acceptedByName: string;
  acceptedAt: string;
};

type LicitacaoRegiaoSheetData = {
  tab: LicitacaoRegiaoTab;
  spreadsheetId: string;
  headers: string[];
  rows: string[][];
  rowKeys: string[];
  manualRowKeys?: string[];
  aceites: LicitacaoRegiaoAceiteSummary[];
  rowCount: number;
  sheetAvailable: boolean;
  fetchedAt: string;
};

type VisibleRow = {
  cells: string[];
  rowKey: string;
  sourceIndex: number;
  isManual: boolean;
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

function isQualificacaoHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key.includes('QUALIFICACAO') || key.includes('HABILITACAO');
}

function isEditalHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'EDITAL';
}

/** Colunas embutidas em outras — não aparecem sozinhas na lista. */
function isNestedListColumn(header: string): boolean {
  return (
    isItemHeader(header) ||
    isEstadoHeader(header) ||
    isSiteLocalHeader(header) ||
    isHoraHeader(header) ||
    isCodigoHeader(header) ||
    isDescontoHeader(header) ||
    isEmpresaHeader(header) ||
    isFaseHeader(header)
  );
}

function findHeaderIndex(headers: string[], predicate: (header: string) => boolean): number {
  return headers.findIndex(predicate);
}

function cellAt(cells: string[], index: number): string {
  if (index < 0) return '';
  return (cells[index] ?? '').trim();
}

function isAberturaHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'ABERTURA';
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
    } else if (isAberturaHeader(header)) {
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

const SHEET_POLL_INTERVAL_MS = 15_000;

export function LicitacoesRegiaoPanel() {
  const queryClient = useQueryClient();
  const [regiaoKey, setRegiaoKey] = useState(DEFAULT_REGIAO_KEY);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createFields, setCreateFields] = useState<Record<string, string>>({});

  const { data: tabs = [], isLoading: loadingTabs } = useQuery({
    queryKey: ['licitacoes-planilha-regioes'],
    queryFn: async () => {
      const res = await api.get('/licitacoes/planilha-regioes');
      return (res.data?.data ?? []) as LicitacaoRegiaoTab[];
    },
  });

  const activeTab = tabs.find((tab) => tab.key === regiaoKey) ?? tabs[0];

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

  const visibleRows = useMemo((): VisibleRow[] => {
    const rows = sheet?.rows ?? [];
    const rowKeys = sheet?.rowKeys ?? [];
    const query = normalizeSearchText(search);

    return rows
      .map((cells, sourceIndex) => {
        const rowKey = rowKeys[sourceIndex] ?? '';
        return {
          cells,
          rowKey,
          sourceIndex,
          isManual:
            Boolean(rowKey) &&
            (rowKey.startsWith('manual:') || manualRowKeySet.has(rowKey)),
        };
      })
      .filter(({ cells }) => {
        if (!query) return true;
        return cells.some((cell) => normalizeSearchText(cell).includes(query));
      });
  }, [sheet?.rows, sheet?.rowKeys, search, manualRowKeySet]);

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
  }, [search, regiaoKey, activeTab?.key]);

  const selectableVisibleRowKeys = useMemo(
    () => pageRows.filter((row) => row.rowKey && !aceitesByRowKey.has(row.rowKey)).map((r) => r.rowKey),
    [pageRows, aceitesByRowKey]
  );

  const selectedPendingRowKeys = useMemo(
    () => Array.from(selectedRowKeys).filter((key) => !aceitesByRowKey.has(key)),
    [selectedRowKeys, aceitesByRowKey]
  );

  const selectedAcceptedRowKeys = useMemo(
    () => Array.from(selectedRowKeys).filter((key) => aceitesByRowKey.has(key)),
    [selectedRowKeys, aceitesByRowKey]
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
        queryClient.setQueryData<LicitacaoRegiaoSheetData>(
          ['licitacoes-planilha-regiao', activeTab.key],
          (current) => {
            if (!current) return current;
            const byKey = new Map((current.aceites ?? []).map((aceite) => [aceite.rowKey, aceite]));
            for (const aceite of incomingAceites) {
              byKey.set(aceite.rowKey, aceite);
            }
            return { ...current, aceites: Array.from(byKey.values()) };
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

  const isAceiteBusy = aceiteMutation.isPending || desfazerAceiteMutation.isPending;
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
    codigo: findHeaderIndex(tableHeaders, isCodigoHeader),
    desconto: findHeaderIndex(tableHeaders, isDescontoHeader),
    empresa: findHeaderIndex(tableHeaders, isEmpresaHeader),
    fase: findHeaderIndex(tableHeaders, isFaseHeader),
  };
  const visibleTableColumns = tableHeaders
    .map((header, colIndex) => ({ header, colIndex }))
    .filter(({ header }) => !isNestedListColumn(header));

  return (
    <div className="space-y-5">
      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                <MapPin
                  className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6"
                  aria-hidden
                />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Licitações por região
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {loadingSheet
                    ? 'Carregando…'
                    : `${visibleRows.length} licitação(ões)`}
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
          {loadingTabs ? (
            <CadastroListLoading message="Carregando regiões..." />
          ) : (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav
                className="-mb-px flex flex-wrap gap-x-1 gap-y-2 overflow-x-auto sm:gap-x-2"
                role="tablist"
                aria-label="Regiões"
              >
                {tabs.map((tab) => {
                  const active = tab.key === (activeTab?.key ?? regiaoKey);
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setRegiaoKey(tab.key);
                        setSearch('');
                        setSelectedRowKeys(new Set());
                        setCreateModalOpen(false);
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
          )}

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
              icon={MapPin}
              title={
                search.trim()
                  ? 'Nenhum resultado para a busca atual'
                  : 'Nenhuma licitação nesta região'
              }
              hint={
                search.trim()
                  ? 'Tente ajustar a busca'
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] text-sm">
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
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Status
                      </th>
                      {visibleTableColumns.map(({ header, colIndex }) => {
                        const key = normalizeHeaderKey(header);
                        const isWide =
                          isObjetoHeader(header) ||
                          isQualificacaoHeader(header) ||
                          isOrgaoHeader(header);
                        const isCenter =
                          isValorEstimadoHeader(header) ||
                          isAberturaHeader(header) ||
                          isEditalHeader(header) ||
                          isPregaoHeader(header);
                        return (
                          <th
                            key={`${header}-${colIndex}`}
                            scope="col"
                            className={`${
                              isCenter ? cadastroListClasses.thCenter : cadastroListClasses.th
                            } ${isWide ? 'min-w-[14rem]' : 'whitespace-nowrap'}`}
                          >
                            {key === 'QUALIFICACAO TECNICA'
                              ? 'Qualificação técnica'
                              : header.trim()}
                          </th>
                        );
                      })}
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
                      const isAccepted = Boolean(aceite);
                      const isSelected = row.rowKey ? selectedRowKeys.has(row.rowKey) : false;
                      const hasValorEstimadoDuplicado = duplicatedValorEstimadoSourceIndexes.has(
                        row.sourceIndex
                      );
                      const estado = cellAt(row.cells, col.estado);
                      const site = cellAt(row.cells, col.site);
                      const hora = cellAt(row.cells, col.hora);
                      const codigo = cellAt(row.cells, col.codigo);
                      const desconto = cellAt(row.cells, col.desconto);
                      const empresa = cellAt(row.cells, col.empresa);
                      const fase = cellAt(row.cells, col.fase);

                      return (
                        <tr
                          key={`${row.sourceIndex}-${row.rowKey}`}
                          className={`border-b border-gray-200 align-middle dark:border-gray-700 ${
                            isAccepted
                              ? 'shadow-[inset_0_0_0_9999px_rgba(209,250,229,0.45)] dark:shadow-[inset_0_0_0_9999px_rgba(6,78,59,0.2)]'
                              : isSelected
                                ? 'shadow-[inset_0_0_0_9999px_rgba(254,226,226,0.55)] dark:shadow-[inset_0_0_0_9999px_rgba(127,29,29,0.22)]'
                                : 'hover:shadow-[inset_0_0_0_9999px_rgba(249,250,251,0.8)] dark:hover:shadow-[inset_0_0_0_9999px_rgba(17,24,39,0.35)]'
                          }`}
                        >
                          <td className={cadastroListClasses.tdCenter}>
                            <TableCheckbox
                              checked={isSelected}
                              onChange={() => toggleRowSelection(row.rowKey)}
                              disabled={!row.rowKey || isAceiteBusy}
                              ariaLabel="Selecionar licitação"
                            />
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            <div className="inline-flex min-w-[6rem] flex-col items-center gap-1">
                              {isAccepted ? (
                                <>
                                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    Aceite
                                  </span>
                                  {aceite?.acceptedByName ? (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {aceite.acceptedByName}
                                    </p>
                                  ) : null}
                                </>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                  Pendente
                                </span>
                              )}
                            </div>
                          </td>
                          {visibleTableColumns.map(({ header, colIndex }) => {
                            const value = cellAt(row.cells, colIndex);

                            if (isOrgaoHeader(header)) {
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
                                      {[estado, empresa].filter(Boolean).join(' · ') || '—'}
                                    </p>
                                  </div>
                                </td>
                              );
                            }

                            if (isObjetoHeader(header)) {
                              return (
                                <td
                                  key={`${row.rowKey}-${colIndex}`}
                                  className={`${cadastroListClasses.td} max-w-sm`}
                                >
                                  <div className="min-w-0">
                                    <p className="text-gray-900 dark:text-gray-100">
                                      <CellContent value={value} clamp />
                                    </p>
                                    {site ? (
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
                                      {[codigo, fase].filter(Boolean).join(' · ') || '—'}
                                    </p>
                                  </div>
                                </td>
                              );
                            }

                            if (isAberturaHeader(header)) {
                              return (
                                <td
                                  key={`${row.rowKey}-${colIndex}`}
                                  className={cadastroListClasses.tdCenter}
                                >
                                  <div>
                                    <p className="whitespace-nowrap text-gray-900 dark:text-gray-100">
                                      {value || '—'}
                                    </p>
                                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                      {hora || '—'}
                                    </p>
                                  </div>
                                </td>
                              );
                            }

                            if (isValorEstimadoHeader(header)) {
                              return (
                                <td
                                  key={`${row.rowKey}-${colIndex}`}
                                  className={cadastroListClasses.tdCenter}
                                >
                                  <div className="inline-flex flex-col items-center">
                                    <div className="inline-flex items-center justify-center gap-1.5">
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
                                      <p className="whitespace-nowrap font-medium text-gray-900 dark:text-gray-100">
                                        {value || '—'}
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
                    ...(!aceitesByRowKey.has(rowForActionMenu.rowKey)
                      ? [
                          {
                            label: 'Aceite',
                            disabled: !rowForActionMenu.rowKey || isAceiteBusy,
                            onClick: () => aceiteMutation.mutate([rowForActionMenu.rowKey]),
                            icon: (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            ),
                          },
                        ]
                      : [
                          {
                            label: 'Desfazer',
                            disabled: !rowForActionMenu.rowKey || isAceiteBusy,
                            onClick: () =>
                              desfazerAceiteMutation.mutate([rowForActionMenu.rowKey]),
                            icon: (
                              <Undo2 className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                            ),
                          },
                        ]),
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
              const label = header.trim();
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

              if (isAberturaHeader(header)) {
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
