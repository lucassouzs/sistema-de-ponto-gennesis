'use client';

import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  ExternalLink,
  FileSearch,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { AppSegmentedButton, AppSegmentedControl } from '@/components/ui/AppTabButton';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { Modal } from '@/components/ui/Modal';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { TableCheckbox } from '@/components/ui/Checkbox';
import api from '@/lib/api';
import { exportBancoCatsSelecaoPdf } from '@/lib/exportBancoCatsSelecaoPdf';
import {
  buildSearchIndexText,
  containsKeyword,
  extractKeywords,
  matchByKeywords,
  normalizeMatchText,
  splitHabilitacaoServicos,
} from './bancoCatsMatch';

const SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1n_AhQ9DEGmguyVTfdA41Sm2j5qXmS0Huz4IV0KlBNPE/edit?gid=818440840#gid=818440840';

const CANONICAL_HEADERS = [
  'EMPRESA',
  'DESCRIÇÃO',
  'UND',
  'QUANT.',
  'FONTE',
] as const;

const PAGE_SIZE = 20;
/** Pré-visualização padrão por quadrante; o usuário pode expandir para ver todos. */
const QUADRANTE_MATCH_PREVIEW = 20;

type QuantSortDir = 'none' | 'asc' | 'desc';

type BancoCatsSheetData = {
  spreadsheetId: string;
  sheetName: string;
  headers: string[];
  rows: string[][];
  rowKeys?: string[];
  manualRowKeys?: string[];
  rowCount: number;
  filterOptions: {
    empresas: string[];
    unidades: string[];
    fontes: string[];
  };
  fetchedAt: string;
};

type IndexedRow = {
  key: string;
  rowKey: string;
  cells: string[];
  isManual: boolean;
  empresa: string;
  und: string;
  quant: string;
  fonte: string;
  descricao: string;
  searchText: string;
};

function normalizeHeaderKey(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalizedCandidates = candidates.map(normalizeHeaderKey);

  // Preferência por correspondência exata (ex.: "FONTE" e não "Ind. Fonte").
  const exact = headers.findIndex((header) =>
    normalizedCandidates.includes(normalizeHeaderKey(header))
  );
  if (exact >= 0) return exact;

  return headers.findIndex((header) => {
    const key = normalizeHeaderKey(header);
    return normalizedCandidates.some((candidate) => {
      if (!key.includes(candidate)) return false;
      // Evita mapear "Ind. Fonte" quando a coluna desejada é "FONTE".
      if (candidate === 'fonte' && key !== 'fonte') return false;
      return true;
    });
  });
}

function formatFetchedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function isDescricaoHeader(header: string): boolean {
  return normalizeHeaderKey(header).includes('descricao');
}

/** Colunas curtas do catálogo — alinhamento central (exceto descrição). */
function isCenteredCatalogHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  if (key.includes('descricao')) return false;
  return (
    key === 'empresa' ||
    key === 'und' ||
    key === 'unidade' ||
    key === 'quant' ||
    key === 'quantidade' ||
    key === 'qtd' ||
    key === 'qtde' ||
    key === 'fonte' ||
    key === 'pagina referente'
  );
}

/** Colunas ocultas na UI (planilha pode trazer, mas não exibimos). */
function isHiddenCatalogHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key === 'ind fonte' || key === 'indice';
}

function emptyFormFields(headers: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const header of headers) {
    fields[header] = normalizeHeaderKey(header) === 'empresa' ? 'GENNESIS' : '';
  }
  return fields;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    error.response.data &&
    typeof error.response.data === 'object' &&
    'message' in error.response.data &&
    typeof (error.response.data as { message?: unknown }).message === 'string'
  ) {
    return (error.response.data as { message: string }).message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Converte quantidade no formato BR (1.064,50 / 1064,50) para número. */
function parseQuantidadeBr(value: string): number {
  const text = value.trim();
  if (!text || text === '-' || text === '—' || text === '–') return 0;

  let normalized = text.replace(/[^\d.,-]/g, '');
  if (!normalized) return 0;

  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantidadeBr(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

/** Normaliza unidade para comparação (M, M., m² → M / M2). */
function normalizeUnd(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\.+$/g, '')
    .replace(/\s+/g, '');
}

function alertUnidadesDiferentes(units: string[], toastId: string) {
  const unique = Array.from(
    new Set(units.map(normalizeUnd).filter(Boolean))
  );
  if (unique.length <= 1) return;

  toast.error(
    `Atenção: unidades diferentes selecionadas (${unique.join(', ')}). A soma de QUANT. pode não fazer sentido.`,
    { id: toastId, duration: 5500 }
  );
}

function CreateServicoModal({
  isOpen,
  headers,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  headers: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>(() => emptyFormFields(headers));

  useEffect(() => {
    if (isOpen) {
      setFields(emptyFormFields(headers));
    }
  }, [isOpen, headers]);

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await api.post('/licitacoes/banco-cats', { fields: payload });
      return res.data as {
        message?: string;
        data?: { syncedToSheet?: boolean; writeConfigRequired?: boolean };
      };
    },
    onSuccess: (data) => {
      if (data?.data?.syncedToSheet) {
        toast.success('Serviço gravado na planilha e disponível no sistema.');
      } else if (data?.data?.writeConfigRequired) {
        toast.success(
          data.message ||
            'Serviço incluído no sistema. Configure a gravação na planilha para sincronizar.'
        );
      } else {
        toast.success(data?.message || "Serviço incluído no Banco CAT's.");
      }
      onCreated();
      onClose();
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, 'Não foi possível incluir o serviço.'));
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (createMutation.isPending) return;
        onClose();
      }}
      title="Incluir serviço no Banco CAT's"
      size="lg"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate(fields);
        }}
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          O serviço é gravado na planilha Google e passa a aparecer automaticamente na consulta
          do sistema.
        </p>

        <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {headers.map((header) => {
            if (isHiddenCatalogHeader(header)) return null;
            const label = header.trim();
            const value = fields[header] ?? '';
            const fieldClass =
              'w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900';

            if (isDescricaoHeader(header)) {
              return (
                <label key={header} className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {label} *
                  </span>
                  <textarea
                    value={value}
                    onChange={(e) =>
                      setFields((prev) => ({ ...prev, [header]: e.target.value }))
                    }
                    required
                    rows={4}
                    disabled={createMutation.isPending}
                    className={`${fieldClass} py-2`}
                    placeholder="Descrição do serviço conforme a CAT"
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
                    setFields((prev) => ({ ...prev, [header]: e.target.value }))
                  }
                  disabled={createMutation.isPending}
                  className={`${fieldClass} h-10`}
                  placeholder={
                    normalizeHeaderKey(header) === 'empresa'
                      ? 'GENNESIS'
                      : normalizeHeaderKey(header) === 'fonte'
                        ? 'Nome do arquivo da CAT'
                        : ''
                  }
                />
              </label>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            disabled={createMutation.isPending}
            className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
            Salvar serviço
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function BancoCatsPanel() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const deferredSearch = useDeferredValue(searchInput);
  const [empresa, setEmpresa] = useState('');
  const [unidade, setUnidade] = useState('');
  const [fonte, setFonte] = useState('');
  const [habilitacaoDraft, setHabilitacaoDraft] = useState('');
  const [habilitacaoConsulta, setHabilitacaoConsulta] = useState('');
  const [page, setPage] = useState(1);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  /** Seleção no catálogo principal (soma QUANT. + exclusão de manuais) */
  const [selectedCatalogKeys, setSelectedCatalogKeys] = useState<Set<string>>(new Set());
  /** Seleção para soma de QUANT. nos quadrantes: chave = `${quadranteId}::${rowKey}` */
  const [selectedMatchKeys, setSelectedMatchKeys] = useState<Set<string>>(new Set());
  /** Quadrantes com lista completa expandida (acima do preview de 50). */
  const [expandedQuadrantes, setExpandedQuadrantes] = useState<Set<string>>(new Set());
  const [activeServicoTabId, setActiveServicoTabId] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  /** Filtros / ordenação nas abas de serviços encontrados. */
  const [matchUnidade, setMatchUnidade] = useState('');
  const [matchKeywordsInput, setMatchKeywordsInput] = useState('');
  const deferredMatchKeywords = useDeferredValue(matchKeywordsInput);
  const [quantSortDir, setQuantSortDir] = useState<QuantSortDir>('none');

  const {
    data: sheet,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['licitacoes-banco-cats'],
    queryFn: async () => {
      const res = await api.get('/licitacoes/banco-cats', {
        params: { refresh: 1 },
      });
      return (res.data?.data ?? null) as BancoCatsSheetData | null;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const formHeaders = useMemo(() => {
    const headers = sheet?.headers?.length ? sheet.headers : [...CANONICAL_HEADERS];
    return headers.filter((header) => !isHiddenCatalogHeader(header));
  }, [sheet?.headers]);

  const indexedRows = useMemo(() => {
    if (!sheet) return [] as IndexedRow[];

    const headers = sheet.headers;
    const empresaIdx = findColumnIndex(headers, ['empresa']);
    const undIdx = findColumnIndex(headers, ['und', 'unidade']);
    const quantIdx = findColumnIndex(headers, [
      'quant',
      'quantidade',
      'qtd',
      'qtde',
      'quant.',
    ]);
    const fonteIdx = findColumnIndex(headers, ['fonte']);
    const descricaoIdx = findColumnIndex(headers, ['descricao', 'descrição']);
    const manualSet = new Set(sheet.manualRowKeys ?? []);

    return sheet.rows.map((cells, index) => {
      const rowKey = sheet.rowKeys?.[index] ?? `sheet:${index}`;
      return {
        key: rowKey,
        rowKey,
        cells,
        isManual: manualSet.has(rowKey),
        empresa: empresaIdx >= 0 ? (cells[empresaIdx] ?? '').trim() : '',
        und: undIdx >= 0 ? (cells[undIdx] ?? '').trim() : '',
        quant: quantIdx >= 0 ? (cells[quantIdx] ?? '').trim() : '',
        fonte: fonteIdx >= 0 ? (cells[fonteIdx] ?? '').trim() : '',
        descricao: descricaoIdx >= 0 ? (cells[descricaoIdx] ?? '').trim() : '',
        searchText: buildSearchIndexText(cells.join(' ')),
      };
    });
  }, [sheet]);

  const manualCount = useMemo(
    () => indexedRows.reduce((count, row) => (row.isManual ? count + 1 : count), 0),
    [indexedRows]
  );

  const servicoConsultas = useMemo(
    () => splitHabilitacaoServicos(habilitacaoConsulta),
    [habilitacaoConsulta]
  );

  const servicoQuadrantes = useMemo(() => {
    if (!habilitacaoConsulta.trim()) return [];

    return servicoConsultas.map((query, index) => {
      const keywords = extractKeywords(query);
      const matches = keywords.length
        ? matchByKeywords(indexedRows, keywords, {
            // 1 = conta/exibe todos os que batem em ao menos uma chave;
            // o ranking (nº de chaves + score) já coloca os melhores no topo.
            minScore: 1,
            limit: null,
            queryText: query,
          })
        : [];

      return {
        id: `servico-${index + 1}`,
        index: index + 1,
        query,
        keywords,
        matches,
      };
    });
  }, [habilitacaoConsulta, servicoConsultas, indexedRows]);

  const visibleRows = useMemo(() => {
    const term = deferredSearch.trim();
    const tokens = term
      ? normalizeMatchText(term).split(/\s+/).filter(Boolean)
      : [];

    // Durante a consulta de habilitação, os resultados ficam nos quadrantes.
    return indexedRows.filter((row) => {
      if (empresa && row.empresa !== empresa) return false;
      if (unidade && row.und !== unidade) return false;
      if (fonte && row.fonte !== fonte) return false;
      if (tokens.length > 0 && !tokens.every((token) => containsKeyword(row.searchText, token))) {
        return false;
      }
      return true;
    });
  }, [indexedRows, deferredSearch, empresa, unidade, fonte]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleRows.slice(start, start + PAGE_SIZE);
  }, [visibleRows, currentPage]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, empresa, unidade, fonte, habilitacaoConsulta]);

  useEffect(() => {
    setSelectedMatchKeys(new Set());
    setExpandedQuadrantes(new Set());
    setActiveServicoTabId('');
    setMatchUnidade('');
    setMatchKeywordsInput('');
    setQuantSortDir('none');
  }, [habilitacaoConsulta]);

  useEffect(() => {
    if (servicoQuadrantes.length === 0) {
      setActiveServicoTabId('');
      return;
    }
    setActiveServicoTabId((prev) =>
      servicoQuadrantes.some((q) => q.id === prev) ? prev : servicoQuadrantes[0].id
    );
  }, [servicoQuadrantes]);

  const activeServicoQuadrante = useMemo(
    () =>
      servicoQuadrantes.find((q) => q.id === activeServicoTabId) ?? servicoQuadrantes[0] ?? null,
    [servicoQuadrantes, activeServicoTabId]
  );

  const matchUnidadeOptions = useMemo(() => {
    if (!activeServicoQuadrante) return [] as string[];
    const units = new Set<string>();
    for (const match of activeServicoQuadrante.matches) {
      const und = match.item.und.trim();
      if (und) units.add(und);
    }
    return Array.from(units).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [activeServicoQuadrante]);

  useEffect(() => {
    if (matchUnidade && !matchUnidadeOptions.includes(matchUnidade)) {
      setMatchUnidade('');
    }
  }, [matchUnidade, matchUnidadeOptions]);

  const filteredSortedMatches = useMemo(() => {
    if (!activeServicoQuadrante) return [];

    const keywordTokens = deferredMatchKeywords
      .trim()
      .split(/[\s,;|/]+/)
      .map((token) => normalizeMatchText(token))
      .filter(Boolean);

    let rows = activeServicoQuadrante.matches.filter((match) => {
      if (matchUnidade && match.item.und !== matchUnidade) return false;
      if (keywordTokens.length > 0) {
        const haystack = buildSearchIndexText(
          [
            match.item.descricao,
            match.item.searchText,
            match.matchedKeywords.join(' '),
            match.item.fonte,
            match.item.empresa,
            match.item.und,
          ].join(' ')
        );
        if (!keywordTokens.every((token) => containsKeyword(haystack, token))) return false;
      }
      return true;
    });

    if (quantSortDir !== 'none') {
      rows = [...rows].sort((a, b) => {
        const qa = parseQuantidadeBr(a.item.quant);
        const qb = parseQuantidadeBr(b.item.quant);
        return quantSortDir === 'asc' ? qa - qb : qb - qa;
      });
    }

    return rows;
  }, [
    activeServicoQuadrante,
    matchUnidade,
    deferredMatchKeywords,
    quantSortDir,
  ]);

  const hasActiveMatchFilters = Boolean(matchUnidade || matchKeywordsInput.trim());
  const clearMatchFilters = () => {
    setMatchUnidade('');
    setMatchKeywordsInput('');
    setQuantSortDir('none');
  };

  const cycleQuantSort = () => {
    setQuantSortDir((prev) => {
      if (prev === 'none') return 'desc';
      if (prev === 'desc') return 'asc';
      return 'none';
    });
  };

  const deleteMutation = useMutation({
    mutationFn: async (rowKeys: string[]) => {
      for (const rowKey of rowKeys) {
        await api.delete('/licitacoes/banco-cats', {
          data: {
            spreadsheetId: sheet?.spreadsheetId,
            rowKey,
          },
        });
      }
    },
    onSuccess: async (_data, rowKeys) => {
      toast.success(
        rowKeys.length === 1
          ? 'Serviço removido.'
          : `${rowKeys.length} serviços removidos.`
      );
      setSelectedCatalogKeys((prev) => {
        const next = new Set(prev);
        for (const key of rowKeys) next.delete(key);
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ['licitacoes-banco-cats'] });
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, 'Não foi possível excluir o serviço.'));
    },
  });

  const matchingActive = Boolean(habilitacaoConsulta.trim());
  const hasActiveFilters = Boolean(empresa || unidade || fonte);
  const errorMessage =
    error instanceof Error
      ? error.message
      : "Não foi possível carregar o Banco CAT's.";

  const clearFilters = () => {
    setEmpresa('');
    setUnidade('');
    setFonte('');
    setPage(1);
  };

  const clearHabilitacaoConsulta = () => {
    setHabilitacaoDraft('');
    setHabilitacaoConsulta('');
    setSelectedMatchKeys(new Set());
    setExpandedQuadrantes(new Set());
    setActiveServicoTabId('');
    setMatchUnidade('');
    setMatchKeywordsInput('');
    setQuantSortDir('none');
  };

  const toggleQuadranteExpanded = (quadranteId: string) => {
    setExpandedQuadrantes((prev) => {
      const next = new Set(prev);
      if (next.has(quadranteId)) next.delete(quadranteId);
      else next.add(quadranteId);
      return next;
    });
  };

  const runHabilitacaoMatch = () => {
    const text = habilitacaoDraft.trim();
    if (!text) {
      toast.error('Cole ou digite as habilitações técnicas necessárias.');
      return;
    }
    const servicos = splitHabilitacaoServicos(text);
    const hasKeywords = servicos.some((servico) => extractKeywords(servico).length > 0);
    if (!hasKeywords) {
      toast.error(
        'Não foi possível extrair palavras-chave suficientes. Inclua termos técnicos do edital.'
      );
      return;
    }
    setHabilitacaoConsulta(text);
    setSelectedMatchKeys(new Set());
    setExpandedQuadrantes(new Set());
    setMatchUnidade('');
    setMatchKeywordsInput('');
    setQuantSortDir('none');
    setPage(1);
  };

  const somaPorQuadrante = useMemo(() => {
    const map = new Map<
      string,
      { count: number; soma: number; units: string[]; mixed: boolean }
    >();
    for (const quadrante of servicoQuadrantes) {
      let count = 0;
      let soma = 0;
      const unitSet = new Set<string>();
      for (const match of quadrante.matches) {
        const key = `${quadrante.id}::${match.item.rowKey}`;
        if (!selectedMatchKeys.has(key)) continue;
        count += 1;
        soma += parseQuantidadeBr(match.item.quant);
        const und = normalizeUnd(match.item.und);
        if (und) unitSet.add(und);
      }
      const units = Array.from(unitSet);
      map.set(quadrante.id, {
        count,
        soma,
        units,
        mixed: units.length > 1,
      });
    }
    return map;
  }, [servicoQuadrantes, selectedMatchKeys]);

  const toggleMatchSelection = (quadranteId: string, rowKey: string) => {
    const key = `${quadranteId}::${rowKey}`;
    if (selectedMatchKeys.has(key)) {
      setSelectedMatchKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return;
    }

    const quadrante = servicoQuadrantes.find((q) => q.id === quadranteId);
    const newItem = quadrante?.matches.find((m) => m.item.rowKey === rowKey);
    const newUnd = normalizeUnd(newItem?.item.und ?? '');

    if (newUnd && quadrante) {
      const existingUnits: string[] = [];
      for (const match of quadrante.matches) {
        const matchKey = `${quadranteId}::${match.item.rowKey}`;
        if (!selectedMatchKeys.has(matchKey)) continue;
        const und = normalizeUnd(match.item.und);
        if (und) existingUnits.push(und);
      }
      if (existingUnits.length > 0) {
        alertUnidadesDiferentes(
          [...existingUnits, newUnd],
          `banco-cats-mixed-und-${quadranteId}`
        );
      }
    }

    setSelectedMatchKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const selectedMatchCount = selectedMatchKeys.size;

  const exportSelecaoPdf = async () => {
    if (selectedMatchCount === 0) {
      toast.error('Marque ao menos um serviço nos quadrantes para exportar.');
      return;
    }

    setExportingPdf(true);
    try {
      const quadrantes = servicoQuadrantes
        .map((quadrante) => {
          const selecao = somaPorQuadrante.get(quadrante.id) ?? { count: 0, soma: 0 };
          const servicos = quadrante.matches
            .filter((match) =>
              selectedMatchKeys.has(`${quadrante.id}::${match.item.rowKey}`)
            )
            .map((match) => ({
              empresa: match.item.empresa,
              descricao: match.item.descricao,
              und: match.item.und,
              quant: match.item.quant,
              fonte: match.item.fonte,
            }));

          return {
            index: quadrante.index,
            query: quadrante.query,
            somaQuant: selecao.soma,
            somaQuantFormatada: formatQuantidadeBr(selecao.soma),
            servicos,
          };
        })
        .filter((q) => q.servicos.length > 0);

      await exportBancoCatsSelecaoPdf({ quadrantes });
      toast.success('PDF exportado com os serviços marcados.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Erro ao gerar o PDF. Tente novamente.'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const selectedManualKeysList = useMemo(
    () =>
      Array.from(selectedCatalogKeys).filter((rowKey) =>
        indexedRows.some((row) => row.rowKey === rowKey && row.isManual)
      ),
    [selectedCatalogKeys, indexedRows]
  );

  const catalogSoma = useMemo(() => {
    let count = 0;
    let soma = 0;
    const unitSet = new Set<string>();
    for (const row of indexedRows) {
      if (!selectedCatalogKeys.has(row.rowKey)) continue;
      count += 1;
      soma += parseQuantidadeBr(row.quant);
      const und = normalizeUnd(row.und);
      if (und) unitSet.add(und);
    }
    const units = Array.from(unitSet);
    return { count, soma, units, mixed: units.length > 1 };
  }, [indexedRows, selectedCatalogKeys]);

  const pageSelection = useMemo(() => {
    if (pageRows.length === 0) return { all: false, some: false };
    let selectedOnPage = 0;
    for (const row of pageRows) {
      if (selectedCatalogKeys.has(row.rowKey)) selectedOnPage += 1;
    }
    return {
      all: selectedOnPage === pageRows.length,
      some: selectedOnPage > 0 && selectedOnPage < pageRows.length,
    };
  }, [pageRows, selectedCatalogKeys]);

  const toggleCatalogSelection = (rowKey: string) => {
    if (selectedCatalogKeys.has(rowKey)) {
      setSelectedCatalogKeys((prev) => {
        const next = new Set(prev);
        next.delete(rowKey);
        return next;
      });
      return;
    }

    const newRow = indexedRows.find((row) => row.rowKey === rowKey);
    const newUnd = normalizeUnd(newRow?.und ?? '');
    if (newUnd) {
      const existingUnits: string[] = [];
      for (const row of indexedRows) {
        if (!selectedCatalogKeys.has(row.rowKey)) continue;
        const und = normalizeUnd(row.und);
        if (und) existingUnits.push(und);
      }
      if (existingUnits.length > 0) {
        alertUnidadesDiferentes(
          [...existingUnits, newUnd],
          'banco-cats-mixed-und-catalog'
        );
      }
    }

    setSelectedCatalogKeys((prev) => {
      const next = new Set(prev);
      next.add(rowKey);
      return next;
    });
  };

  const togglePageSelection = () => {
    if (pageSelection.all) {
      setSelectedCatalogKeys((prev) => {
        const next = new Set(prev);
        for (const row of pageRows) next.delete(row.rowKey);
        return next;
      });
      return;
    }

    const unitsAfter: string[] = [];
    for (const row of indexedRows) {
      if (selectedCatalogKeys.has(row.rowKey)) {
        const und = normalizeUnd(row.und);
        if (und) unitsAfter.push(und);
      }
    }
    for (const row of pageRows) {
      const und = normalizeUnd(row.und);
      if (und) unitsAfter.push(und);
    }
    alertUnidadesDiferentes(unitsAfter, 'banco-cats-mixed-und-catalog');

    setSelectedCatalogKeys((prev) => {
      const next = new Set(prev);
      for (const row of pageRows) next.add(row.rowKey);
      return next;
    });
  };

  const listRange = getCadastroListRange(currentPage, PAGE_SIZE, visibleRows.length);

  return (
    <div className="space-y-5">
      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                <FileSearch
                  className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6"
                  aria-hidden
                />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Consulta de Habilitação Técnica
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Busque serviços compatíveis com as exigências do edital.
                </p>
              </div>
            </div>
            <div className={cadastroListClasses.cardToolbar}>
              {matchingActive ? (
                <button
                  type="button"
                  onClick={clearHabilitacaoConsulta}
                  aria-label="Limpar consulta"
                  title="Limpar consulta"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
              {matchingActive && selectedMatchCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void exportSelecaoPdf()}
                  disabled={exportingPdf}
                  className="flex h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60"
                >
                  {exportingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Download className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span>
                    {exportingPdf ? 'Gerando PDF…' : `Exportar PDF (${selectedMatchCount})`}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={runHabilitacaoMatch}
                disabled={isLoading || !habilitacaoDraft.trim()}
                className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                <FileSearch className="h-4 w-4 shrink-0" aria-hidden />
                <span>Buscar compatíveis</span>
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className={`${cadastroListClasses.cardContent} space-y-4`}>
          <textarea
            value={habilitacaoDraft}
            onChange={(e) => setHabilitacaoDraft(e.target.value)}
            rows={3}
            placeholder="Um serviço por linha…"
            className="min-h-[4.75rem] w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-normal text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          {matchingActive && activeServicoQuadrante ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <AppSegmentedControl aria-label="Serviços consultados" className="max-w-full justify-start overflow-x-auto">
                  {servicoQuadrantes.map((tab) => {
                    const active = tab.id === activeServicoQuadrante.id;
                    return (
                      <AppSegmentedButton
                        key={tab.id}
                        active={active}
                        title={tab.query}
                        onClick={() => setActiveServicoTabId(tab.id)}
                        className="max-w-[16rem] gap-1.5 sm:max-w-[20rem]"
                      >
                        <span className="min-w-0 truncate">
                          {tab.query.trim() || `Serviço ${tab.index}`}
                        </span>
                        <span
                          className={`shrink-0 tabular-nums ${
                            active
                              ? 'text-red-500/80 dark:text-red-400/80'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}
                        >
                          ({tab.matches.length})
                        </span>
                      </AppSegmentedButton>
                    );
                  })}
                </AppSegmentedControl>
                {(() => {
                  const selecao = somaPorQuadrante.get(activeServicoQuadrante.id) ?? {
                    count: 0,
                    soma: 0,
                    units: [] as string[],
                    mixed: false,
                  };
                  return (
                    <span
                      className={`mb-2 inline-flex w-fit shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        selecao.mixed
                          ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                          : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                      }`}
                    >
                      Soma quantidade: {formatQuantidadeBr(selecao.soma)}
                      {selecao.count > 0 ? ` (${selecao.count})` : ''}
                      {selecao.mixed
                        ? ` · UND mistas: ${selecao.units.join(', ')}`
                        : selecao.units.length === 1
                          ? ` · ${selecao.units[0]}`
                          : ''}
                    </span>
                  );
                })()}
              </div>

              {(() => {
                const quadrante = activeServicoQuadrante;
                const totalMatches = quadrante.matches.length;
                const filteredMatches = filteredSortedMatches;
                const filteredCount = filteredMatches.length;
                const hasMoreThanPreview = filteredCount > QUADRANTE_MATCH_PREVIEW;
                const isExpanded = expandedQuadrantes.has(quadrante.id);
                const visibleMatches =
                  hasMoreThanPreview && !isExpanded
                    ? filteredMatches.slice(0, QUADRANTE_MATCH_PREVIEW)
                    : filteredMatches;
                const hiddenCount = filteredCount - visibleMatches.length;
                const selectedOnVisible = visibleMatches.filter((match) =>
                  selectedMatchKeys.has(`${quadrante.id}::${match.item.rowKey}`)
                ).length;
                const allVisibleSelected =
                  visibleMatches.length > 0 && selectedOnVisible === visibleMatches.length;
                const someVisibleSelected =
                  selectedOnVisible > 0 && selectedOnVisible < visibleMatches.length;

                const toggleAllVisible = () => {
                  setSelectedMatchKeys((prev) => {
                    const next = new Set(prev);
                    if (allVisibleSelected) {
                      for (const match of visibleMatches) {
                        next.delete(`${quadrante.id}::${match.item.rowKey}`);
                      }
                      return next;
                    }

                    const unitsAfter: string[] = [];
                    for (const match of quadrante.matches) {
                      const key = `${quadrante.id}::${match.item.rowKey}`;
                      if (!next.has(key)) continue;
                      const und = normalizeUnd(match.item.und);
                      if (und) unitsAfter.push(und);
                    }
                    for (const match of visibleMatches) {
                      const und = normalizeUnd(match.item.und);
                      if (und) unitsAfter.push(und);
                      next.add(`${quadrante.id}::${match.item.rowKey}`);
                    }
                    alertUnidadesDiferentes(unitsAfter, `banco-cats-mixed-und-${quadrante.id}`);
                    return next;
                  });
                };

                const quantSortLabel =
                  quantSortDir === 'desc'
                    ? 'Ordenado: maior quantidade'
                    : quantSortDir === 'asc'
                      ? 'Ordenado: menor quantidade'
                      : 'Ordenar por quantidade';

                return (
                  <div key={quadrante.id} className="space-y-3">
                    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40 sm:flex-row sm:flex-wrap sm:items-end">
                      <label className="block min-w-[10rem] flex-1 sm:max-w-[14rem]">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Unidade de medida
                        </span>
                        <StringSingleSelectDropdown
                          value={matchUnidade}
                          onChange={setMatchUnidade}
                          options={matchUnidadeOptions}
                          allowEmpty
                          emptyOptionLabel="Todas as unidades"
                          placeholder="Todas as unidades"
                          searchPlaceholder="Buscar unidade…"
                          emptyOptionsMessage="Nenhuma unidade nesta lista."
                        />
                      </label>
                      <label className="block min-w-0 flex-[2]">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Palavras-chave
                        </span>
                        <div className="relative">
                          <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                            aria-hidden
                          />
                          <input
                            type="search"
                            value={matchKeywordsInput}
                            onChange={(e) => setMatchKeywordsInput(e.target.value)}
                            placeholder="Filtrar por palavras-chave…"
                            className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                          />
                        </div>
                      </label>
                      {hasActiveMatchFilters || quantSortDir !== 'none' ? (
                        <button
                          type="button"
                          onClick={clearMatchFilters}
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden />
                          Limpar
                        </button>
                      ) : null}
                    </div>

                    {totalMatches > 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {hasActiveMatchFilters
                          ? `Exibindo ${filteredCount} de ${totalMatches} compatíveis`
                          : `${totalMatches} compatíveis encontrados`}
                        {quantSortDir !== 'none'
                          ? ` · ${
                              quantSortDir === 'desc'
                                ? 'maior → menor quantidade'
                                : 'menor → maior quantidade'
                            }`
                          : ''}
                      </p>
                    ) : null}

                    {totalMatches === 0 ? (
                      <CadastroListEmpty
                        icon={FileSearch}
                        title="Nenhum compatível encontrado"
                        hint="Tente outros termos do edital para este serviço"
                      />
                    ) : filteredCount === 0 ? (
                      <CadastroListEmpty
                        icon={Filter}
                        title="Nenhum resultado com estes filtros"
                        hint="Ajuste a unidade ou as palavras-chave, ou limpe os filtros"
                      />
                    ) : (
                      <>
                        <div className="table-scroll">
                          <table className="w-full min-w-[48rem] text-sm">
                            <thead>
                              <tr className="border-b border-gray-200 dark:border-gray-700">
                                <th scope="col" className={`${cadastroListClasses.thCenter} w-12`}>
                                  <TableCheckbox
                                    checked={allVisibleSelected}
                                    indeterminate={someVisibleSelected}
                                    onChange={toggleAllVisible}
                                    ariaLabel={`Selecionar todos os compatíveis do serviço ${quadrante.index}`}
                                  />
                                </th>
                                <th scope="col" className={cadastroListClasses.thCenter}>
                                  EMPRESA
                                </th>
                                <th
                                  scope="col"
                                  className={`${cadastroListClasses.th} min-w-[18rem]`}
                                >
                                  DESCRIÇÃO
                                </th>
                                <th scope="col" className={cadastroListClasses.thCenter}>
                                  UND
                                </th>
                                <th scope="col" className={cadastroListClasses.thCenter}>
                                  <button
                                    type="button"
                                    onClick={cycleQuantSort}
                                    title={quantSortLabel}
                                    aria-label={quantSortLabel}
                                    className="inline-flex items-center justify-center gap-1 rounded-md px-1 py-0.5 font-semibold uppercase tracking-wide text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                                  >
                                    QUANT.
                                    {quantSortDir === 'desc' ? (
                                      <ArrowDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-hidden />
                                    ) : quantSortDir === 'asc' ? (
                                      <ArrowUp className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-hidden />
                                    ) : (
                                      <ArrowUpDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
                                    )}
                                  </button>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleMatches.map((match) => {
                                const selectionKey = `${quadrante.id}::${match.item.rowKey}`;
                                const checked = selectedMatchKeys.has(selectionKey);
                                const descricao =
                                  match.item.descricao ||
                                  match.item.cells.join(' · ') ||
                                  '—';
                                return (
                                  <tr
                                    key={selectionKey}
                                    className={`border-b border-gray-200 align-middle dark:border-gray-700 ${
                                      checked
                                        ? 'shadow-[inset_0_0_0_9999px_rgba(254,226,226,0.55)] dark:shadow-[inset_0_0_0_9999px_rgba(127,29,29,0.22)]'
                                        : 'hover:shadow-[inset_0_0_0_9999px_rgba(249,250,251,0.8)] dark:hover:shadow-[inset_0_0_0_9999px_rgba(17,24,39,0.35)]'
                                    }`}
                                  >
                                    <td className={cadastroListClasses.tdCenter}>
                                      <TableCheckbox
                                        checked={checked}
                                        onChange={() =>
                                          toggleMatchSelection(quadrante.id, match.item.rowKey)
                                        }
                                        ariaLabel={`Selecionar para soma: ${descricao}`}
                                      />
                                    </td>
                                    <td className={cadastroListClasses.tdCenter}>
                                      {match.item.empresa || '—'}
                                    </td>
                                    <td
                                      className={`${cadastroListClasses.td} max-w-xl whitespace-normal`}
                                    >
                                      <div className="min-w-0">
                                        <p className="leading-relaxed text-gray-900 dark:text-gray-100">
                                          {descricao}
                                        </p>
                                        {match.matchedKeywords.length > 0 ? (
                                          <p
                                            className="mt-0.5 text-xs font-medium text-red-600 dark:text-red-400"
                                            title={`${match.matchedKeywords.length} chave(s) encontrada(s)`}
                                          >
                                            {match.matchedKeywords.join(', ')}{' '}
                                            {`{${match.matchedKeywords.length}}`}
                                          </p>
                                        ) : null}
                                        <p
                                          className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400"
                                          title={match.item.fonte || undefined}
                                        >
                                          {match.item.fonte || 'Sem fonte'}
                                        </p>
                                      </div>
                                    </td>
                                    <td className={cadastroListClasses.tdCenter}>
                                      {match.item.und || '—'}
                                    </td>
                                    <td className={cadastroListClasses.tdCenter}>
                                      {match.item.quant || '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {hasMoreThanPreview ? (
                          <div className="mt-3 flex justify-center">
                            <button
                              type="button"
                              onClick={() => toggleQuadranteExpanded(quadrante.id)}
                              className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="h-4 w-4" aria-hidden />
                                  Mostrar só os {QUADRANTE_MATCH_PREVIEW} primeiros
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-4 w-4" aria-hidden />
                                  Ver todos os {filteredCount} compatíveis
                                  {hiddenCount > 0
                                    ? ` (${hiddenCount} ocultos na prévia)`
                                    : ''}
                                </>
                              )}
                            </button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                <Database
                  className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6"
                  aria-hidden
                />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Banco CAT&apos;s
                  {catalogSoma.count > 0 ? (
                    <span
                      className={`ml-2 inline-flex align-middle rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        catalogSoma.mixed
                          ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                          : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                      }`}
                    >
                      Soma quantidade: {formatQuantidadeBr(catalogSoma.soma)} ({catalogSoma.count})
                      {catalogSoma.mixed
                        ? ` · UND mistas: ${catalogSoma.units.join(', ')}`
                        : catalogSoma.units.length === 1
                          ? ` · ${catalogSoma.units[0]}`
                          : ''}
                    </span>
                  ) : null}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {isLoading
                    ? 'Carregando…'
                    : `${visibleRows.length} serviço(s)${
                        sheet?.rowCount != null && visibleRows.length !== sheet.rowCount
                          ? ` de ${sheet.rowCount}`
                          : ''
                      }`}
                  {manualCount ? ` · ${manualCount} incluído(s) no sistema` : ''}
                  {sheet?.fetchedAt ? ` · Atualizado em ${formatFetchedAt(sheet.fetchedAt)}` : ''}
                </p>
              </div>
            </div>
            <div className={cadastroListClasses.cardToolbar}>
              <div className="relative min-w-[200px] flex-1 sm:w-[260px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar serviço, unidade, fonte…"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                {searchInput ? (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
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
                disabled={isFetching}
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
                onClick={() => setCreateModalOpen(true)}
                disabled={isLoading}
                className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                <span>Incluir serviço</span>
              </button>
              {selectedManualKeysList.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        selectedManualKeysList.length === 1
                          ? 'Excluir este serviço incluído no sistema?'
                          : `Excluir ${selectedManualKeysList.length} serviços incluídos no sistema?`
                      )
                    ) {
                      deleteMutation.mutate(selectedManualKeysList);
                    }
                  }}
                  disabled={deleteMutation.isPending || isLoading}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span>Excluir ({selectedManualKeysList.length})</span>
                </button>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className={cadastroListClasses.cardContent}>
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
          ) : isLoading ? (
            <CadastroListLoading message="Carregando Banco CAT's..." />
          ) : !sheet?.headers?.length || visibleRows.length === 0 ? (
            <CadastroListEmpty
              icon={Database}
              title={
                searchInput.trim() || hasActiveFilters
                  ? 'Nenhum resultado para a busca ou filtros atuais'
                  : 'Nenhum serviço encontrado'
              }
              hint={
                searchInput.trim() || hasActiveFilters
                  ? 'Tente ajustar a busca ou os filtros'
                  : 'Use “Incluir serviço” para cadastrar o primeiro'
              }
            />
          ) : (
            <>
              <CadastroListSummary
                startItem={listRange.startItem}
                endItem={listRange.endItem}
                total={visibleRows.length}
                itemLabel="serviço"
                itemLabelPlural="serviços"
                currentPage={currentPage}
                totalPages={listRange.totalPages}
              />
              <div className="table-scroll">
                <table className="w-full min-w-[56rem] text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th scope="col" className={`${cadastroListClasses.thCenter} w-12`}>
                        <TableCheckbox
                          checked={pageSelection.all}
                          indeterminate={pageSelection.some && !pageSelection.all}
                          onChange={() => togglePageSelection()}
                          disabled={pageRows.length === 0}
                          ariaLabel="Selecionar todos da página"
                        />
                      </th>
                      {sheet.headers.map((header) => {
                        if (isHiddenCatalogHeader(header)) return null;
                        const isDescricao = isDescricaoHeader(header);
                        const isCentered = isCenteredCatalogHeader(header);
                        return (
                          <th
                            key={header}
                            scope="col"
                            className={`${
                              isCentered ? cadastroListClasses.thCenter : cadastroListClasses.th
                            } ${isDescricao ? 'min-w-[18rem]' : 'whitespace-nowrap'}`}
                          >
                            {header}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => {
                      const checked = selectedCatalogKeys.has(row.rowKey);
                      return (
                        <tr
                          key={row.key}
                          className={`border-b border-gray-200 align-middle dark:border-gray-700 ${
                            checked
                              ? 'shadow-[inset_0_0_0_9999px_rgba(254,226,226,0.55)] dark:shadow-[inset_0_0_0_9999px_rgba(127,29,29,0.22)]'
                              : 'hover:shadow-[inset_0_0_0_9999px_rgba(249,250,251,0.8)] dark:hover:shadow-[inset_0_0_0_9999px_rgba(17,24,39,0.35)]'
                          }`}
                        >
                          <td className={cadastroListClasses.tdCenter}>
                            <TableCheckbox
                              checked={checked}
                              onChange={() => toggleCatalogSelection(row.rowKey)}
                              ariaLabel={`Selecionar serviço: ${row.descricao || row.rowKey}`}
                            />
                          </td>
                          {sheet.headers.map((header, colIndex) => {
                            if (isHiddenCatalogHeader(header)) return null;
                            const isDescricao = isDescricaoHeader(header);
                            const isCentered = isCenteredCatalogHeader(header);
                            return (
                              <td
                                key={`${row.key}-${header}`}
                                className={`${
                                  isCentered ? cadastroListClasses.tdCenter : cadastroListClasses.td
                                } ${
                                  isDescricao
                                    ? 'max-w-xl whitespace-normal leading-relaxed'
                                    : 'whitespace-nowrap'
                                }`}
                              >
                                <div
                                  className={`flex flex-wrap gap-2 ${
                                    isCentered
                                      ? 'items-center justify-center'
                                      : 'items-center justify-start'
                                  }`}
                                >
                                  <span>{row.cells[colIndex] || '—'}</span>
                                  {row.isManual && colIndex === 0 ? (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                                      Sistema
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                            );
                          })}
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
                className={`${cadastroListClasses.pagination} w-full`}
              />
            </>
          )}
        </CardContent>
      </Card>

      {showFilters ? (
        <div className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowFilters(false)}
            aria-hidden
          />
          <div className="relative mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                aria-label="Fechar filtros"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Empresa
                </label>
                <StringSingleSelectDropdown
                  value={empresa}
                  onChange={setEmpresa}
                  options={sheet?.filterOptions.empresas ?? []}
                  allowEmpty
                  emptyOptionLabel="Todas as empresas"
                  placeholder="Todas as empresas"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Unidade
                </label>
                <StringSingleSelectDropdown
                  value={unidade}
                  onChange={setUnidade}
                  options={sheet?.filterOptions.unidades ?? []}
                  allowEmpty
                  emptyOptionLabel="Todas as unidades"
                  placeholder="Todas as unidades"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Fonte (CAT)
                </label>
                <StringSingleSelectDropdown
                  value={fonte}
                  onChange={setFonte}
                  options={sheet?.filterOptions.fontes ?? []}
                  allowEmpty
                  emptyOptionLabel="Todas as fontes"
                  placeholder="Todas as fontes"
                />
              </div>
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
                Aplicar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <CreateServicoModal
        isOpen={createModalOpen}
        headers={formHeaders}
        onClose={() => setCreateModalOpen(false)}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ['licitacoes-banco-cats'] });
        }}
      />
    </div>
  );
}
