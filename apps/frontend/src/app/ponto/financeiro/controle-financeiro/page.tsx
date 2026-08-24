'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  Filter,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Download,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { CadastroListEmpty, CadastroListSummary } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { listTableRowClasses, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { Modal } from '@/components/ui/Modal';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { FinancialControlEntryModal } from '@/components/financeiro/FinancialControlEntryModal';
import {
  FINANCIAL_CONTROL_APPLICATION_TYPE_LABELS,
  FINANCIAL_CONTROL_CONSORCIO_LABELS,
  FINANCIAL_CONTROL_CONSORCIO_OPTIONS,
  formatApplicationTypeLabel,
  parseFinancialControlAttachments,
  resolveNfAndParcelForDisplay,
  type FinancialControlConsorcio,
  type FinancialControlEntry,
} from '@/components/financeiro/financialControlEntry';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { DatePickerField } from '@/components/ui/DatePickerField';
import api from '@/lib/api';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import { formatDateBr, parseDateSafe } from '@/lib/dateTimeBr';
import {
  exportFinancialControlEntries,
  exportFinancialControlEntriesPdf,
  type FinancialControlExportFormat,
} from '@/lib/exportFinancialControl';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  formatFinancialControlObservationDisplay,
  formatOcListDisplayId,
} from '@/components/oc/ocListDisplay';
import {
  FINANCIAL_CONTROL_STATUS_FILTER_OPTIONS,
  FINANCIAL_CONTROL_STATUS_STYLES,
  type FinancialControlStatus,
  isFinancialControlPaidStatus,
} from '@/lib/financialControlStatus';
import { ListPagination } from '@/components/ui/ListPagination';
import { useBrandingLogo } from '@/hooks/useBrandingLogo';

const MONTH_GROUP_PAGE_SIZE = 25;

function ConsorcioTabNav({
  active,
  onChange,
}: {
  active: FinancialControlConsorcio;
  onChange: (key: FinancialControlConsorcio) => void;
}) {
  return (
    <AppUnderlineTabList aria-label="Consórcios do controle financeiro">
      {FINANCIAL_CONTROL_CONSORCIO_OPTIONS.map((tab) => {
        const isActive = active === tab.value;
        return (
          <AppUnderlineTabButton
            key={tab.value}
            active={isActive}
            onClick={() => onChange(tab.value)}
            className="whitespace-nowrap px-2 py-2.5 text-xs sm:px-3 sm:text-sm"
          >
            {tab.label}
          </AppUnderlineTabButton>
        );
      })}
    </AppUnderlineTabList>
  );
}

function computeDashboardStats(entries: FinancialControlEntry[]) {
  let totalFinalSum = 0;
  const byStatus: Record<FinancialControlStatus, { count: number; sum: number }> = {
    PROCESSO_COMPLETO: { count: 0, sum: 0 },
    PAGO: { count: 0, sum: 0 },
    AGUARDAR_NOTA: { count: 0, sum: 0 },
    AGUARDAR_PAGAMENTO: { count: 0, sum: 0 },
    LANCADO: { count: 0, sum: 0 },
    CANCELADO: { count: 0, sum: 0 },
  };

  for (const entry of entries) {
    const final = Number(entry.finalValue ?? 0) || 0;
    const isCancelado = entry.status === 'CANCELADO';

    if (!isCancelado) {
      totalFinalSum += final;
    }

    byStatus[entry.status].count += 1;
    if (!isCancelado) {
      byStatus[entry.status].sum += final;
    }
  }

  return {
    total: entries.length,
    totalFinalSum,
    byStatus,
    pagoAguardarNota: {
      count: byStatus.PAGO.count + byStatus.AGUARDAR_NOTA.count,
      sum: byStatus.PAGO.sum + byStatus.AGUARDAR_NOTA.sum,
    },
  };
}

const STATUS_STYLES = FINANCIAL_CONTROL_STATUS_STYLES;
const STATUS_FILTER_OPTIONS = FINANCIAL_CONTROL_STATUS_FILTER_OPTIONS;

const DASHBOARD_STATUS_CARDS: {
  key: 'PROCESSO_COMPLETO' | 'PAGO_AGUARDAR_NOTA' | 'AGUARDAR_PAGAMENTO';
  title: string;
  Icon: LucideIcon;
  cardIcon: string;
  iconColor: string;
}[] = [
  {
    key: 'PROCESSO_COMPLETO',
    title: 'Processo Completo',
    Icon: ClipboardCheck,
    cardIcon: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  {
    key: 'PAGO_AGUARDAR_NOTA',
    title: 'Aguardando Nota',
    Icon: FileText,
    cardIcon: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  {
    key: 'AGUARDAR_PAGAMENTO',
    title: 'Aguardando Pagamento',
    Icon: Clock,
    cardIcon: 'bg-sky-100 dark:bg-sky-900/30',
    iconColor: 'text-sky-600 dark:text-sky-400',
  },
];

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(n)) return '-';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = parseDateSafe(value);
  if (!d || d.getFullYear() < 1990) return '—';
  return formatDateBr(value, '—');
}

/** Filtra emissionDate dentro do intervalo inclusivo [fromYmd, toYmd] (YYYY-MM-DD). */
function matchesEmissionRange(
  emissionDate: string | null | undefined,
  fromYmd: string,
  toYmd: string
): boolean {
  if (!emissionDate) return false;
  const d = parseDateSafe(emissionDate);
  if (!d || d.getFullYear() < 1990) return false;
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (fromYmd && ymd < fromYmd) return false;
  if (toYmd && ymd > toYmd) return false;
  return Boolean(fromYmd || toYmd);
}

function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Período padrão do filtro: últimos 6 meses até hoje. */
function getDefaultEmissionPeriod(ref: Date = new Date()) {
  const to = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const from = new Date(to);
  from.setMonth(from.getMonth() - 6);
  return {
    emissionFrom: toLocalYmd(from),
    emissionTo: toLocalYmd(to),
  };
}

/**
 * Converte a string digitada pelo usuário (ex.: "5000", "5.000,00", "5000,5") em um número.
 * Retorna null para valores inválidos/vazios.
 */
function parseCurrencyInput(value: string): number | null {
  if (!value) return null;
  const digitsOnly = value.replace(/\D/g, '');
  if (!digitsOnly) return null;
  // Tratamos os dois últimos dígitos como centavos.
  const n = parseInt(digitsOnly, 10) / 100;
  return isNaN(n) ? null : n;
}

/**
 * Formata um valor numérico (ou string numérica) em "5.000,00" (sem o "R$").
 */
function formatCurrencyValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(n)) return '';
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Calcula a diferença em dias entre a data de vencimento e a data de pagamento
 * (ou entre vencimento e a data de hoje, se não houver pagamento).
 * Retorna número (pode ser negativo se o vencimento já passou) ou null.
 */
function calcRemainingDays(dueDate: string, paidDate: string): number | null {
  const due = parseDateSafe(dueDate);
  if (!due) return null;
  const ref = paidDate
    ? parseDateSafe(paidDate)
    : (() => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
      })();
  if (!ref) return null;
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return Math.floor((a - b) / (1000 * 60 * 60 * 24));
}

function dateInputValue(value: string | null | undefined): string {
  const d = parseDateSafe(value);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface EntryFormState {
  id?: string;
  paymentMonth: number;
  paymentYear: number;
  status: FinancialControlStatus;
  osCode: string;
  supplierName: string;
  nfNumber: string;
  parcelNumber: string;
  emissionDate: string;
  boleto: string;
  dueDate: string;
  originalValue: string;
  ocNumber: string;
  finalValue: string;
  paidDate: string;
  remainingDays: string;
  receivedNote: string;
  notes: string;
}

function buildInitialForm(month: number, year: number): EntryFormState {
  return {
    paymentMonth: month,
    paymentYear: year,
    status: 'AGUARDAR_PAGAMENTO',
    osCode: '',
    supplierName: '',
    nfNumber: '',
    parcelNumber: '',
    emissionDate: '',
    boleto: 'Não',
    dueDate: '',
    originalValue: '',
    ocNumber: '',
    finalValue: '',
    paidDate: '',
    remainingDays: '',
    receivedNote: '',
    notes: '',
  };
}

function entryToForm(entry: FinancialControlEntry): EntryFormState {
  return {
    id: entry.id,
    paymentMonth: entry.paymentMonth,
    paymentYear: entry.paymentYear,
    status: entry.status,
    osCode: entry.osCode || '',
    supplierName: entry.supplierName || '',
    nfNumber: entry.nfNumber || '',
    parcelNumber: entry.parcelNumber || '',
    emissionDate: dateInputValue(entry.emissionDate),
    boleto: entry.boleto || '',
    dueDate: dateInputValue(entry.dueDate),
    originalValue: formatCurrencyValue(entry.originalValue),
    ocNumber: entry.ocNumber || '',
    finalValue: formatCurrencyValue(entry.finalValue),
    paidDate: dateInputValue(entry.paidDate),
    remainingDays:
      entry.remainingDays !== null && entry.remainingDays !== undefined ? String(entry.remainingDays) : '',
    receivedNote: entry.receivedNote || '',
    notes: entry.notes || '',
  };
}

export default function ControleFinanceiroPage() {
  const queryClient = useQueryClient();
  const { useUnbBranding } = useBrandingLogo();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const defaultEmissionPeriod = useMemo(() => getDefaultEmissionPeriod(), []);

  type ListFiltersState = {
    emissionFrom: string;
    emissionTo: string;
    status: '' | FinancialControlStatus;
    search: string;
    overdueOnly: boolean;
  };

  const buildDefaultListFilters = (): ListFiltersState => {
    const period = getDefaultEmissionPeriod();
    return {
      emissionFrom: period.emissionFrom,
      emissionTo: period.emissionTo,
      status: '',
      search: '',
      overdueOnly: false,
    };
  };

  const [consorcio, setConsorcio] = useState<FinancialControlConsorcio>('brasilia');
  const [filtersByConsorcio, setFiltersByConsorcio] = useState<
    Record<FinancialControlConsorcio, ListFiltersState>
  >(() => ({
    brasilia: buildDefaultListFilters(),
    hub: buildDefaultListFilters(),
  }));
  const filters = filtersByConsorcio[consorcio];
  const setFilters = (
    next: ListFiltersState | ((prev: ListFiltersState) => ListFiltersState)
  ) => {
    setFiltersByConsorcio((prev) => {
      const current = prev[consorcio];
      const resolved = typeof next === 'function' ? next(current) : next;
      return { ...prev, [consorcio]: resolved };
    });
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FinancialControlEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<FinancialControlExportFormat>('excel');
  const [isExporting, setIsExporting] = useState(false);
  const [searchOpenByConsorcio, setSearchOpenByConsorcio] = useState<
    Record<FinancialControlConsorcio, boolean>
  >({
    brasilia: false,
    hub: false,
  });
  const searchOpen = searchOpenByConsorcio[consorcio];
  const setSearchOpen = (open: boolean) => {
    setSearchOpenByConsorcio((prev) => ({ ...prev, [consorcio]: open }));
  };
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchExpanded = searchOpen || filters.search.trim().length > 0;
  const hasEmissionFilter = Boolean(filters.emissionFrom || filters.emissionTo);

  useEffect(() => {
    if (!searchExpanded) return;
    const id = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [searchExpanded, consorcio]);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [importConsorcio, setImportConsorcio] = useState<FinancialControlConsorcio>('brasilia');
  const [importResult, setImportResult] = useState<
    | null
    | {
        created: number;
        removed: number;
        warnings: string[];
        months: { year: number; month: number; label: string }[];
      }
  >(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importConsorcioLabel = FINANCIAL_CONTROL_CONSORCIO_LABELS[importConsorcio];

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.append('consorcio', consorcio);
    if (filters.status && filters.status !== 'AGUARDAR_NOTA') {
      params.append('status', filters.status);
    }
    if (filters.search.trim()) params.append('search', filters.search.trim());
    return params.toString();
  }, [consorcio, filters]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['financial-control', consorcio, queryParams],
    queryFn: async () => {
      const res = await api.get(`/financial-control${queryParams ? `?${queryParams}` : ''}`);
      return (res.data?.data as FinancialControlEntry[]) || [];
    },
  });

  const rawEntries = data || [];

  // Filtros de status, data de emissão e "apenas em atraso" no cliente.
  const entries = useMemo(() => {
    let result = rawEntries;
    if (filters.status === 'AGUARDAR_NOTA') {
      result = result.filter(
        (entry) => entry.status === 'AGUARDAR_NOTA' || entry.status === 'PAGO',
      );
    }
    if (hasEmissionFilter) {
      let from = filters.emissionFrom;
      let to = filters.emissionTo;
      if (from && to && from > to) {
        const swap = from;
        from = to;
        to = swap;
      }
      result = result.filter((entry) =>
        matchesEmissionRange(entry.emissionDate, from, to)
      );
    }
    if (!filters.overdueOnly) return result;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return result.filter((entry) => {
      const isPago = isFinancialControlPaidStatus(entry.status);
      const isCancelado = entry.status === 'CANCELADO';
      if (isPago || isCancelado || !entry.dueDate) return false;
      const due = parseDateSafe(entry.dueDate);
      if (!due || due.getFullYear() < 1990) return false;
      return due < todayStart;
    });
  }, [
    rawEntries,
    filters.status,
    filters.emissionFrom,
    filters.emissionTo,
    filters.overdueOnly,
    hasEmissionFilter,
  ]);

  const listEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (a.paymentYear !== b.paymentYear) return b.paymentYear - a.paymentYear;
      if (a.paymentMonth !== b.paymentMonth) return b.paymentMonth - a.paymentMonth;
      const dueA = a.dueDate
        ? (parseDateSafe(a.dueDate)?.getTime() ?? Number.NEGATIVE_INFINITY)
        : Number.NEGATIVE_INFINITY;
      const dueB = b.dueDate
        ? (parseDateSafe(b.dueDate)?.getTime() ?? Number.NEGATIVE_INFINITY)
        : Number.NEGATIVE_INFINITY;
      if (dueA !== dueB) return dueB - dueA;
      return (a.supplierName || '').localeCompare(b.supplierName || '', 'pt-BR');
    });
  }, [entries]);

  const stats = useMemo(() => computeDashboardStats(listEntries), [listEntries]);

  function dashboardCardStats(
    key: 'PROCESSO_COMPLETO' | 'PAGO_AGUARDAR_NOTA' | 'AGUARDAR_PAGAMENTO',
  ) {
    if (key === 'PAGO_AGUARDAR_NOTA') return stats.pagoAguardarNota;
    return stats.byStatus[key];
  }

  const statusFilterOptions = useMemo(() => {
    const present = new Set(rawEntries.map((entry) => entry.status));
    const hasAguardarNota = present.has('AGUARDAR_NOTA') || present.has('PAGO');
    const options = STATUS_FILTER_OPTIONS.filter((opt) => {
      if (opt.value === 'AGUARDAR_NOTA') return hasAguardarNota;
      return present.has(opt.value);
    });
    return labeledToSelectOptions([
      { value: '', label: 'Todos' },
      ...options.map((opt) => ({ value: opt.value, label: opt.label })),
    ]);
  }, [rawEntries]);

  const isDefaultEmissionPeriod =
    filters.emissionFrom === defaultEmissionPeriod.emissionFrom &&
    filters.emissionTo === defaultEmissionPeriod.emissionTo;

  const hasActivePeriodFilter =
    (!isDefaultEmissionPeriod && hasEmissionFilter) ||
    filters.status !== '' ||
    filters.overdueOnly;

  const exportFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (hasEmissionFilter) {
      const from = filters.emissionFrom
        ? formatDateBr(filters.emissionFrom, filters.emissionFrom)
        : null;
      const to = filters.emissionTo
        ? formatDateBr(filters.emissionTo, filters.emissionTo)
        : null;
      if (from && to) parts.push(`Emissão: ${from} a ${to}`);
      else if (from) parts.push(`Emissão: a partir de ${from}`);
      else if (to) parts.push(`Emissão: até ${to}`);
    }
    if (filters.status) {
      const label =
        STATUS_FILTER_OPTIONS.find((o) => o.value === filters.status)?.label || filters.status;
      parts.push(`Status: ${label}`);
    }
    if (filters.overdueOnly) parts.push('Apenas em atraso');
    if (filters.search.trim()) parts.push(`Busca: ${filters.search.trim()}`);
    return parts.join(' · ');
  }, [filters, hasEmissionFilter]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/financial-control/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Lançamento excluído');
      queryClient.invalidateQueries({ queryKey: ['financial-control'] });
      setDeletingId(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao excluir lançamento');
      setDeletingId(null);
    },
  });

  const importMutation = useMutation({
    mutationFn: async ({
      file,
      mode,
      consorcio: importConsorcio,
    }: {
      file: File;
      mode: 'append' | 'replace';
      consorcio: FinancialControlConsorcio;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', mode);
      formData.append('consorcio', importConsorcio);
      const res = await api.post('/financial-control/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      toast.success(data?.message || 'Planilha importada com sucesso');
      setImportResult(data?.data || null);
      setImportFile(null);
      if (importInputRef.current) importInputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['financial-control'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao importar planilha');
    },
  });

  const openImportModal = () => {
    setImportFile(null);
    setImportMode('append');
    setImportConsorcio(consorcio);
    setImportResult(null);
    setIsImportOpen(true);
  };

  const closeImportModal = () => {
    setIsImportOpen(false);
    setImportFile(null);
    setImportResult(null);
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      toast.error('Selecione um arquivo .xlsx, .xls ou .csv para importar');
      return;
    }
    importMutation.mutate({ file: importFile, mode: importMode, consorcio: importConsorcio });
  };

  const openCreateModal = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const openEditModal = (entry: FinancialControlEntry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
    setDeletingId(id);
    deleteMutation.mutate(id);
  };

  const buildExportSuffix = () => {
    const emissionPart =
      filters.emissionFrom || filters.emissionTo
        ? `-emissao-${filters.emissionFrom || 'inicio'}_a_${filters.emissionTo || 'fim'}`
        : '';
    const statusPart = filters.status ? `-${filters.status.toLowerCase()}` : '';
    return `${consorcio}${emissionPart}${statusPart}_${new Date().toISOString().slice(0, 10)}`;
  };

  const openExportModal = () => {
    if (listEntries.length === 0) {
      toast.error('Nenhum lançamento para exportar com os filtros atuais.');
      return;
    }
    setExportFormat('excel');
    setIsExportModalOpen(true);
  };

  const handleExportConfirm = async () => {
    if (listEntries.length === 0) {
      toast.error('Nenhum lançamento para exportar com os filtros atuais.');
      return;
    }
    setIsExporting(true);
    try {
      const suffix = buildExportSuffix();
      if (exportFormat === 'pdf') {
        await exportFinancialControlEntriesPdf(listEntries, suffix, {
          consorcioLabel: FINANCIAL_CONTROL_CONSORCIO_LABELS[consorcio],
          filterSummary: exportFilterSummary,
          useUnbBranding,
        });
        toast.success(`PDF gerado com ${listEntries.length} lançamento(s).`);
      } else {
        exportFinancialControlEntries(listEntries, suffix);
        toast.success(`${listEntries.length} lançamento(s) exportado(s) em Excel.`);
      }
      setIsExportModalOpen(false);
    } catch {
      toast.error(
        exportFormat === 'pdf' ? 'Erro ao gerar PDF.' : 'Erro ao exportar planilha.',
      );
    } finally {
      setIsExporting(false);
    }
  };

  const listTitle = (() => {
    if (!filters.emissionFrom && !filters.emissionTo) return 'Lançamentos';
    const from = filters.emissionFrom
      ? formatDateBr(filters.emissionFrom, filters.emissionFrom)
      : null;
    const to = filters.emissionTo
      ? formatDateBr(filters.emissionTo, filters.emissionTo)
      : null;
    if (from && to) {
      return from === to ? `Emissão em ${from}` : `Emissão de ${from} a ${to}`;
    }
    if (from) return `Emissão a partir de ${from}`;
    return `Emissão até ${to}`;
  })();

  const listToolbar = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <div
        className={`relative h-10 shrink-0 overflow-hidden rounded-lg border border-gray-300 bg-white transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-gray-600 dark:bg-gray-800 ${
          searchExpanded ? 'w-[min(100%,280px)] sm:w-[280px]' : 'w-10'
        }`}
      >
        <button
          type="button"
          tabIndex={searchExpanded ? -1 : 0}
          aria-hidden={searchExpanded}
          onClick={() => setSearchOpen(true)}
          className={`absolute inset-0 z-10 inline-flex items-center justify-center text-gray-700 outline-none transition-opacity duration-200 hover:bg-gray-50 focus:ring-0 dark:text-gray-200 dark:hover:bg-gray-700 ${
            searchExpanded ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
          title="Pesquisar lançamento"
          aria-label="Pesquisar lançamento"
        >
          <Search className="h-4 w-4" />
        </button>

        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            searchExpanded ? 'opacity-100 delay-75' : 'pointer-events-none opacity-0'
          }`}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            ref={searchInputRef}
            type="text"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            onBlur={() => {
              if (!filters.search.trim()) setSearchOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (filters.search) {
                  setFilters({ ...filters, search: '' });
                } else {
                  setSearchOpen(false);
                }
              }
            }}
            placeholder="Pesquisar lançamento..."
            tabIndex={searchExpanded ? 0 : -1}
            className="h-full w-full bg-transparent py-2 pl-9 pr-9 text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-100"
            aria-label="Pesquisar lançamento"
          />
          {filters.search ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setFilters({ ...filters, search: '' });
                searchInputRef.current?.focus();
              }}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 outline-none transition-colors hover:bg-gray-100 hover:text-gray-600 focus:ring-0 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsFiltersModalOpen(true)}
        className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
          hasActivePeriodFilter
            ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
        }`}
        aria-label="Abrir filtro"
        title={hasActivePeriodFilter ? 'Filtro ativo' : 'Filtro'}
      >
        <Filter className="h-4 w-4" />
        {hasActivePeriodFilter ? (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
        ) : null}
      </button>
      <button
        type="button"
        onClick={openExportModal}
        disabled={isLoading || listEntries.length === 0}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        aria-label="Exportar"
        title="Exportar"
      >
        <Download className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={openImportModal}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        aria-label="Importar"
        title="Importar"
      >
        <Upload className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={openCreateModal}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
        aria-label="Novo Lançamento"
        title="Novo Lançamento"
      >
        <Plus className="h-4 w-4 shrink-0" />
        <span>Novo Lançamento</span>
      </button>
    </div>
  );

  const listCardHeader = (
    <CardHeader className={cadastroListClasses.cardHeader}>
      <div className={cadastroListClasses.cardHeaderRow}>
        <div className={cadastroListClasses.cardHeaderIconRow}>
          <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
            <CalendarDays className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {listTitle}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {isLoading
                ? 'Carregando lançamentos...'
                : error
                  ? 'Erro ao carregar a lista'
                  : `${listEntries.length} ${listEntries.length === 1 ? 'lançamento' : 'lançamentos'}`}
            </p>
          </div>
        </div>
      </div>
    </CardHeader>
  );

  return (
    <ProtectedRoute route="/ponto/financeiro/controle-financeiro">
      <MainLayout userRole="EMPLOYEE" userName="">
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Controle Financeiro
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Controle de Material e Serviço Aplicado com acompanhamento de pagamentos.
            </p>
          </div>

          {/* Barra de ações — posição original (acima das abas) */}
          {listToolbar}

          <ConsorcioTabNav active={consorcio} onChange={setConsorcio} />

          {/* Dashboards — valor total (sem cancelados) + status da planilha */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex-shrink-0">
                    <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal">
                      Valor Total
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">
                      {formatCurrency(stats.totalFinalSum)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {DASHBOARD_STATUS_CARDS.map((card) => {
              const bucket = dashboardCardStats(card.key);
              const StatusIcon = card.Icon;
              return (
                <Card key={card.key}>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center">
                      <div className={`p-2 sm:p-3 rounded-lg flex-shrink-0 ${card.cardIcon}`}>
                        <StatusIcon
                          className={`w-5 h-5 sm:w-6 sm:h-6 ${card.iconColor}`}
                          aria-hidden
                        />
                      </div>
                      <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal leading-snug">
                          {card.title}{' '}
                          <span className="text-gray-400 dark:text-gray-500">({bucket.count})</span>
                        </p>
                        <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">
                          {formatCurrency(bucket.sum)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Lista — mesmo padrão das outras telas de cadastro */}
          {isLoading ? (
            <Card className={cadastroListClasses.card}>
              {listCardHeader}
              <CardContent className={cadastroListClasses.cardContent}>
                <div className="flex items-center justify-center gap-2 py-12 text-gray-500 dark:text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Carregando lançamentos...
                </div>
              </CardContent>
            </Card>
          ) : error ? (
            <Card className={`${cadastroListClasses.card} border-red-300 dark:border-red-700`}>
              {listCardHeader}
              <CardContent className={cadastroListClasses.cardContent}>
                <div className="flex items-start gap-3 py-6">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-red-600 dark:text-red-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">
                      Erro ao carregar dados
                    </p>
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {(error as any)?.response?.data?.message ||
                        (error as any)?.message ||
                        'Tente novamente.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="mt-2 text-sm font-medium text-red-700 underline dark:text-red-300"
                    >
                      Tentar novamente
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : listEntries.length === 0 ? (
            <Card className={cadastroListClasses.card}>
              {listCardHeader}
              <CardContent className={cadastroListClasses.cardContent}>
                <CadastroListEmpty
                  icon={ClipboardList}
                  title={
                    filters.search.trim() || hasActivePeriodFilter
                      ? 'Nenhum resultado encontrado'
                      : 'Nenhum lançamento encontrado'
                  }
                  hint={
                    filters.search.trim() || hasActivePeriodFilter
                      ? 'Ajuste a busca ou os filtros e tente novamente.'
                      : 'Use Novo Lançamento ou Importar para adicionar os primeiros registros.'
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <MonthGroup
              key={`${consorcio}-${filters.emissionFrom}-${filters.emissionTo}`}
              year={0}
              month={0}
              emissionFrom={filters.emissionFrom}
              emissionTo={filters.emissionTo}
              items={listEntries}
              header={listCardHeader}
              onEdit={openEditModal}
              onDelete={handleDelete}
              deletingId={deletingId}
            />
          )}
        </div>

        <FinancialControlEntryModal
          isOpen={isModalOpen}
          onClose={closeModal}
          editingEntry={editingEntry}
          initialValues={editingEntry ? undefined : { consorcio }}
          defaultPaymentMonth={currentMonth}
          defaultPaymentYear={currentYear}
        />

        {/* Modal de Filtros */}
        <Modal
          isOpen={isFiltersModalOpen}
          onClose={() => setIsFiltersModalOpen(false)}
          title="Filtros"
          size="md"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Data de emissão
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      De
                    </label>
                    <DatePickerField
                      value={filters.emissionFrom}
                      onChange={(emissionFrom) =>
                        setFilters({ ...filters, emissionFrom })
                      }
                      placeholder="dd/mm/aaaa"
                      noFocusRing
                      aria-label="Data de emissão inicial"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Até
                    </label>
                    <DatePickerField
                      value={filters.emissionTo}
                      onChange={(emissionTo) =>
                        setFilters({ ...filters, emissionTo })
                      }
                      placeholder="dd/mm/aaaa"
                      noFocusRing
                      aria-label="Data de emissão final"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Status
                </label>
                <StringSingleSelectDropdown
                  value={filters.status}
                  onChange={(v) =>
                    setFilters({ ...filters, status: v as '' | FinancialControlStatus })
                  }
                  options={statusFilterOptions}
                  allowEmpty={false}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/60 group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={filters.overdueOnly}
                      onChange={(e) =>
                        setFilters({ ...filters, overdueOnly: e.target.checked })
                      }
                      className="sr-only"
                    />
                    <div
                      className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                        filters.overdueOnly
                          ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                      }`}
                    >
                      {filters.overdueOnly && (
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Apenas em atraso
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Mostra somente lançamentos pendentes com vencimento passado
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setFilters({
                    emissionFrom: defaultEmissionPeriod.emissionFrom,
                    emissionTo: defaultEmissionPeriod.emissionTo,
                    status: '',
                    search: filters.search,
                    overdueOnly: false,
                  });
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Fechar
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal de Exportação */}
        <Modal
          isOpen={isExportModalOpen}
          onClose={() => {
            if (!isExporting) setIsExportModalOpen(false);
          }}
          title="Exportar lançamentos"
          size="md"
          closeOnOverlayClick={!isExporting}
        >
          <div className="space-y-5">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Serão exportados{' '}
              <strong className="font-medium text-gray-800 dark:text-gray-200">
                {listEntries.length} lançamento(s)
              </strong>{' '}
              com os filtros atuais
              {exportFilterSummary ? (
                <>
                  :{' '}
                  <span className="text-gray-700 dark:text-gray-300">{exportFilterSummary}</span>
                </>
              ) : (
                '.'
              )}
            </p>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Formato</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setExportFormat('excel')}
                  className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                    exportFormat === 'excel'
                      ? 'border-red-300 bg-red-50 dark:border-red-800/60 dark:bg-red-950/30'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/60'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Excel</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Planilha .xlsx com todas as colunas
                  </p>
                </button>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setExportFormat('pdf')}
                  className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                    exportFormat === 'pdf'
                      ? 'border-red-300 bg-red-50 dark:border-red-800/60 dark:bg-red-950/30'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/60'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">PDF</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Relatório em paisagem para impressão
                  </p>
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setIsExportModalOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isExporting || listEntries.length === 0}
                onClick={() => void handleExportConfirm()}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gerando…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Exportar
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal de Importação */}
        <Modal
          isOpen={isImportOpen}
          onClose={closeImportModal}
          title="Importar Planilha de Controle Financeiro"
          size="lg"
        >
          <form onSubmit={handleImportSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Consórcio <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                {FINANCIAL_CONTROL_CONSORCIO_OPTIONS.map((opt) => (
                  <ButtonSeg
                    key={opt.value}
                    active={importConsorcio === opt.value}
                    onClick={() => setImportConsorcio(opt.value)}
                    label={opt.label}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Arquivo da planilha <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setImportFile(f);
                    setImportResult(null);
                  }}
                  className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-red-50 dark:file:bg-red-900/30 file:text-red-700 dark:file:text-red-300 hover:file:bg-red-100 dark:hover:file:bg-red-900/50"
                />
              </div>
              {importFile && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Selecionado: <span className="font-medium">{importFile.name}</span> (
                  {(importFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div>
              <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Modo de importação
              </p>
              <div className="space-y-2">
                <ImportModeRadio
                  value="append"
                  checked={importMode === 'append'}
                  onChange={() => setImportMode('append')}
                  title="Adicionar lançamentos"
                  description={
                    <>
                      Os lançamentos da planilha serão adicionados aos existentes. Pode gerar duplicatas se já existirem
                      dados para o mesmo mês.
                    </>
                  }
                />
                <ImportModeRadio
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  title="Substituir meses importados"
                  description={
                    <>
                      Para cada mês/ano detectado na planilha, os lançamentos existentes do{' '}
                      <span className="font-semibold">{importConsorcioLabel}</span> serão
                      <span className="font-semibold"> apagados </span>e substituídos pelos da planilha. O outro
                      consórcio não é afetado.
                    </>
                  }
                />
              </div>
            </div>

            {importResult && (
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 text-sm">
                <div className="flex items-start gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-900 dark:text-green-200">
                      Importação concluída
                    </p>
                    <p className="text-green-700 dark:text-green-300">
                      {importResult.created} lançamento(s) criado(s)
                      {importResult.removed > 0 && ` · ${importResult.removed} substituído(s)`}
                    </p>
                  </div>
                </div>
                {importResult.months.length > 0 && (
                  <div className="ml-7 mt-1">
                    <p className="text-xs font-medium text-green-800 dark:text-green-300 mb-1">
                      Meses detectados:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {importResult.months.map((m) => (
                        <span
                          key={`${m.year}-${m.month}`}
                          className="text-xs px-2 py-0.5 rounded-full bg-green-200 dark:bg-green-900/40 text-green-900 dark:text-green-200"
                        >
                          {m.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {importResult.warnings.length > 0 && (
                  <div className="ml-7 mt-2 text-xs text-yellow-700 dark:text-yellow-300">
                    <p className="font-medium">Avisos:</p>
                    <ul className="list-disc list-inside">
                      {importResult.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={closeImportModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {importResult ? 'Fechar' : 'Cancelar'}
              </button>
              {!importResult && (
                <button
                  type="submit"
                  disabled={!importFile || importMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Importar
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}

interface ImportModeRadioProps {
  value: 'append' | 'replace';
  checked: boolean;
  onChange: () => void;
  title: string;
  description: React.ReactNode;
}

function ImportModeRadio({
  value,
  checked,
  onChange,
  title,
  description,
}: ImportModeRadioProps) {
  return (
    <label
      className="group flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700/60"
    >
      <div className="relative shrink-0 pt-0.5">
        <input
          type="radio"
          name="importMode"
          value={value}
          checked={checked}
          onChange={onChange}
          className="sr-only"
        />
        <div
          className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200 ${
            checked
              ? 'border-red-600 dark:border-red-500'
              : 'border-gray-300 bg-white group-hover:border-red-400 dark:border-gray-600 dark:bg-gray-800 dark:group-hover:border-red-400'
          }`}
        >
          {checked && <div className="h-2.5 w-2.5 rounded-full bg-red-600 dark:bg-red-500" />}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </label>
  );
}

interface MonthGroupProps {
  year: number;
  month: number;
  emissionFrom?: string;
  emissionTo?: string;
  items: FinancialControlEntry[];
  header?: React.ReactNode;
  onEdit: (entry: FinancialControlEntry) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}

const ACTION_MENU_WIDTH_PX = 192;
const ACTION_MENU_MAX_HEIGHT_PX = 280;
const ACTION_MENU_GAP_PX = 4;
const ACTION_MENU_VIEWPORT_PAD_PX = 8;
/** Altura mínima desejada (~3 itens do menu). */
const ACTION_MENU_MIN_HEIGHT_PX = 140;

type ActionMenuCoords = {
  entryId: string;
  top: number;
  left: number;
  maxHeight: number;
  placement: 'below' | 'above';
};

function computeActionMenuPosition(rect: DOMRect, entryId: string): ActionMenuCoords {
  let left = rect.right - ACTION_MENU_WIDTH_PX;
  left = Math.max(
    ACTION_MENU_VIEWPORT_PAD_PX,
    Math.min(left, window.innerWidth - ACTION_MENU_WIDTH_PX - ACTION_MENU_VIEWPORT_PAD_PX)
  );

  const spaceBelow =
    window.innerHeight - rect.bottom - ACTION_MENU_GAP_PX - ACTION_MENU_VIEWPORT_PAD_PX;
  const spaceAbove = rect.top - ACTION_MENU_GAP_PX - ACTION_MENU_VIEWPORT_PAD_PX;

  if (spaceBelow >= ACTION_MENU_MIN_HEIGHT_PX || spaceBelow >= spaceAbove) {
    return {
      entryId,
      top: rect.bottom + ACTION_MENU_GAP_PX,
      left,
      maxHeight: Math.min(ACTION_MENU_MAX_HEIGHT_PX, Math.max(spaceBelow, ACTION_MENU_MIN_HEIGHT_PX)),
      placement: 'below'
    };
  }

  return {
    entryId,
    top: rect.top - ACTION_MENU_GAP_PX,
    left,
    maxHeight: Math.min(ACTION_MENU_MAX_HEIGHT_PX, Math.max(spaceAbove, ACTION_MENU_MIN_HEIGHT_PX)),
    placement: 'above'
  };
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function DetailField({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  );
}

function getEntryRemainingDays(entry: FinancialControlEntry): number | null {
  if (entry.dueDate && entry.paidDate) {
    return calcRemainingDays(entry.dueDate, entry.paidDate);
  }
  return entry.remainingDays ?? null;
}

function MonthGroup({
  year,
  month,
  emissionFrom,
  emissionTo,
  items,
  header,
  onEdit,
  onDelete,
  deletingId,
}: MonthGroupProps) {
  const monthLabel = month > 0 ? MONTHS_PT[month - 1] || '' : '';
  const titleMonth = monthLabel
    ? monthLabel.charAt(0) + monthLabel.slice(1).toLowerCase()
    : '';
  const emissionTitle = (() => {
    if (!emissionFrom && !emissionTo) return null;
    const from = emissionFrom ? formatDateBr(emissionFrom, emissionFrom) : null;
    const to = emissionTo ? formatDateBr(emissionTo, emissionTo) : null;
    if (from && to) {
      return from === to ? `Emissão em ${from}` : `Emissão de ${from} a ${to}`;
    }
    if (from) return `Emissão a partir de ${from}`;
    return `Emissão até ${to}`;
  })();
  const listTitle = emissionTitle
    ? emissionTitle
    : year > 0 && month > 0
      ? `Pagamentos de ${titleMonth} de ${year}`
      : year > 0
        ? `Pagamentos de ${year}`
        : month > 0
          ? `Pagamentos de ${titleMonth}`
          : 'Pagamentos';

  const [page, setPage] = useState(1);
  const [detailEntry, setDetailEntry] = useState<FinancialControlEntry | null>(null);
  const [actionMenu, setActionMenu] = useState<ActionMenuCoords | null>(null);

  const totalPages = Math.max(1, Math.ceil(items.length / MONTH_GROUP_PAGE_SIZE));
  const startIndex = (page - 1) * MONTH_GROUP_PAGE_SIZE;
  const paginatedItems = items.slice(startIndex, startIndex + MONTH_GROUP_PAGE_SIZE);
  const rangeStart = items.length === 0 ? 0 : startIndex + 1;
  const rangeEnd = Math.min(startIndex + MONTH_GROUP_PAGE_SIZE, items.length);

  useEffect(() => {
    setPage(1);
  }, [items.length, year, month, emissionFrom, emissionTo]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const entryForMenu = useMemo(() => {
    if (!actionMenu) return null;
    return paginatedItems.find((it) => it.id === actionMenu.entryId) ?? null;
  }, [actionMenu, paginatedItems]);

  useEffect(() => {
    if (!actionMenu) return;
    const close = () => setActionMenu(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', (e) => e.key === 'Escape' && close());
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [actionMenu]);

  useEffect(() => {
    if (actionMenu && !paginatedItems.some((it) => it.id === actionMenu.entryId)) {
      setActionMenu(null);
    }
  }, [actionMenu, paginatedItems]);

  const detailStatusStyle = detailEntry
    ? STATUS_STYLES[detailEntry.status] ?? STATUS_STYLES.AGUARDAR_PAGAMENTO
    : null;
  const detailNf = detailEntry ? resolveNfAndParcelForDisplay(detailEntry) : null;
  const detailRemainingDays = detailEntry ? getEntryRemainingDays(detailEntry) : null;
  const detailIsOverdue =
    detailRemainingDays !== null && detailRemainingDays !== undefined && detailRemainingDays < 0;

  return (
    <Card className={cadastroListClasses.card}>
      {header ?? (
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                <CalendarDays className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {listTitle}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {items.length} {items.length === 1 ? 'lançamento' : 'lançamentos'}
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
      )}
      <div id={`month-list-${year}-${month}`}>
        <CardContent className={cadastroListClasses.cardContent}>
          <CadastroListSummary
            startItem={rangeStart}
            endItem={rangeEnd}
            total={items.length}
            itemLabel="lançamento"
            itemLabelPlural="lançamentos"
            currentPage={page}
            totalPages={totalPages}
          />
          <div className={cadastroListClasses.tableScroll}>
            <table className={`${cadastroListClasses.table} !table-auto`}>
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className={cadastroListClasses.thCenter}>NF</th>
                <th className={cadastroListClasses.thCenter}>Parcela</th>
                <th className={cadastroListClasses.th}>Fornecedor</th>
                <th className={cadastroListClasses.thCenter}>Tipo</th>
                <th className={cadastroListClasses.thCenter}>OS</th>
                <th className={cadastroListClasses.thCenter}>OC</th>
                <th className={cadastroListClasses.thCenter}>Vencimento</th>
                <th className={cadastroListClasses.thCenter}>Valor Final</th>
                <th className={cadastroListClasses.thCenter}>Dias</th>
                <th className={cadastroListClasses.thCenter}>Status</th>
                <th className={`${listTableRowClasses.actionTh} !text-center`}>Ação</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedItems.map((entry) => {
                const statusStyle =
                  STATUS_STYLES[entry.status] ?? STATUS_STYLES.AGUARDAR_PAGAMENTO;
                const isDeleting = deletingId === entry.id;
                const { nfNumber, parcelNumber } = resolveNfAndParcelForDisplay(entry);
                const computed = getEntryRemainingDays(entry);

                return (
                  <tr
                    key={entry.id}
                    className={`${listTableRowClasses.tr} cursor-pointer`}
                    onClick={() => setDetailEntry(entry)}
                  >
                    <td className="px-3 sm:px-6 py-3 text-sm text-center font-medium text-gray-900 dark:text-gray-100">
                      {nfNumber || '—'}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                      {parcelNumber || '—'}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-left">
                      <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                        {entry.supplierName || '—'}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-center">
                      {(() => {
                        const key = (entry.applicationType || '').trim().toUpperCase();
                        if (!key) {
                          return (
                            <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                          );
                        }
                        const label =
                          FINANCIAL_CONTROL_APPLICATION_TYPE_LABELS[
                            key as keyof typeof FINANCIAL_CONTROL_APPLICATION_TYPE_LABELS
                          ] || formatApplicationTypeLabel(entry.applicationType);
                        const style =
                          key === 'SERVICO'
                            ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300'
                            : key === 'MISTO'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                              : 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300';
                        return (
                          <span
                            className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${style}`}
                          >
                            {label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                      {entry.osCode || '—'}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                      {entry.ocNumber ? formatOcListDisplayId(entry.ocNumber) : '—'}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center font-medium text-gray-900 dark:text-gray-100">
                      {formatDate(entry.dueDate)}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      {formatCurrency(entry.finalValue)}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center tabular-nums text-gray-900 dark:text-gray-100">
                      {computed === null || computed === undefined ? '—' : computed}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        {statusStyle.label}
                      </span>
                    </td>
                    <td
                      className={`${listTableRowClasses.actionTd} text-center`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setActionMenu((prev) => {
                              if (prev?.entryId === entry.id) return null;
                              return computeActionMenuPosition(r, entry.id);
                            });
                          }}
                          disabled={isDeleting}
                          className={`${rowActionMenuButtonClass(actionMenu?.entryId === entry.id)} disabled:opacity-50`}
                          aria-label="Menu de ações"
                          aria-expanded={actionMenu?.entryId === entry.id}
                          aria-haspopup="menu"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <MoreVertical className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ListPagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
        </CardContent>
      </div>

      {actionMenu && entryForMenu && (
        <ActionMenuOverlay
          open
          onClose={() => setActionMenu(null)}
          top={actionMenu.top}
          left={actionMenu.left}
          maxHeight={actionMenu.maxHeight}
          placement={actionMenu.placement}
          panelClassName="w-48"
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setActionMenu(null);
              setDetailEntry(entryForMenu);
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0" />
            <span>Ver detalhes</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setActionMenu(null);
              onEdit(entryForMenu);
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
          >
            <Pencil className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>Editar lançamento</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setActionMenu(null);
              onDelete(entryForMenu.id);
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 border-t border-gray-200 dark:border-gray-700"
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>Excluir lançamento</span>
          </button>
        </ActionMenuOverlay>
      )}

      <Modal
        isOpen={Boolean(detailEntry)}
        onClose={() => setDetailEntry(null)}
        title={
          detailNf?.nfNumber
            ? `Lançamento NF ${detailNf.nfNumber}`
            : 'Detalhes do lançamento'
        }
        size="lg"
      >
        {detailEntry && detailStatusStyle && detailNf ? (
          <div className="space-y-6">
            <DetailSection title="Identificação">
              <DetailField label="Número da NF">{detailNf.nfNumber || '—'}</DetailField>
              <DetailField label="Parcela">{detailNf.parcelNumber || '—'}</DetailField>
              <DetailField label="Status">
                <span
                  className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${detailStatusStyle.bg} ${detailStatusStyle.text}`}
                >
                  {detailStatusStyle.label}
                </span>
              </DetailField>
              <DetailField label="Fornecedor" className="sm:col-span-2">
                {detailEntry.supplierName || '—'}
              </DetailField>
              <DetailField label="Tipo">
                {formatApplicationTypeLabel(detailEntry.applicationType)}
              </DetailField>
              <DetailField label="OS">{detailEntry.osCode || '—'}</DetailField>
              <DetailField label="OC">
                {detailEntry.ocNumber ? formatOcListDisplayId(detailEntry.ocNumber) : '—'}
              </DetailField>
            </DetailSection>

            <DetailSection title="Datas e valores">
              <DetailField label="Data de emissão">{formatDate(detailEntry.emissionDate)}</DetailField>
              <DetailField label="Boleto">{detailEntry.boleto || '—'}</DetailField>
              <DetailField label="Data de vencimento">{formatDate(detailEntry.dueDate)}</DetailField>
              <DetailField label="Data de pagamento">{formatDate(detailEntry.paidDate)}</DetailField>
              <DetailField label="Valor original">
                <span className="tabular-nums">{formatCurrency(detailEntry.originalValue)}</span>
              </DetailField>
              <DetailField label="Valor final">
                <span className="font-semibold tabular-nums">
                  {formatCurrency(detailEntry.finalValue)}
                </span>
              </DetailField>
              <DetailField label="Diferença de dias">
                {detailRemainingDays === null || detailRemainingDays === undefined ? (
                  '—'
                ) : (
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      detailIsOverdue
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {detailRemainingDays}
                  </span>
                )}
              </DetailField>
              <DetailField label="Mês de pagamento">
                {MONTHS_PT[detailEntry.paymentMonth - 1] || detailEntry.paymentMonth} /{' '}
                {detailEntry.paymentYear}
              </DetailField>
            </DetailSection>

            <DetailSection title="Observações">
              <DetailField label="Observação" className="sm:col-span-2">
                {detailEntry.receivedNote
                  ? formatFinancialControlObservationDisplay(detailEntry.receivedNote)
                  : '—'}
              </DetailField>
              {detailEntry.notes ? (
                <DetailField label="Notas" className="sm:col-span-2">
                  <span className="whitespace-pre-wrap">{detailEntry.notes}</span>
                </DetailField>
              ) : null}
              {(() => {
                const files = parseFinancialControlAttachments(detailEntry.attachments);
                if (files.length === 0) return null;
                return (
                  <DetailField label="Anexos" className="sm:col-span-2">
                    <ul className="space-y-1">
                      {files.map((file, index) => (
                        <li key={`${file.url}-${index}`}>
                          <a
                            href={absoluteUploadUrl(file.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {file.name || 'Ver anexo'}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </DetailField>
                );
              })()}
            </DetailSection>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDetailEntry(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  const entry = detailEntry;
                  setDetailEntry(null);
                  onEdit(entry);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Editar lançamento
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}

interface CurrencyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Input formatado como moeda brasileira (ex.: "5.000,00") sem as setinhas do tipo number.
 * Internamente trabalha com a string já formatada; ao salvar usa parseCurrencyInput().
 */
function CurrencyInput({ value, onChange, placeholder = '0,00' }: CurrencyInputProps) {
  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      onChange('');
      return;
    }
    const number = parseInt(digits, 10) / 100;
    const formatted = number.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    onChange(formatted);
  };

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400 pointer-events-none">
        R$
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white text-right tabular-nums"
      />
    </div>
  );
}

interface RemainingDaysDisplayProps {
  dueDate: string;
  paidDate: string;
}

/**
 * Exibe (somente leitura) o cálculo de "Falta Dias" entre a Data de Vencto e a Data de Pagamento
 * (ou a data atual, se ainda não pago).
 */
function RemainingDaysDisplay({ dueDate, paidDate }: RemainingDaysDisplayProps) {
  const v = calcRemainingDays(dueDate, paidDate);

  let label: string;
  let tone = 'text-gray-900 dark:text-gray-100';

  if (v === null) {
    label = 'Informe a data de vencimento';
    tone = 'text-gray-400 dark:text-gray-500';
  } else if (v > 0) {
    label = `${v} ${v === 1 ? 'dia' : 'dias'}${paidDate ? ' (pago antes)' : ''}`;
  } else if (v === 0) {
    label = paidDate ? 'Pago no dia' : 'Vence hoje';
    tone = 'text-yellow-700 dark:text-yellow-300 font-semibold';
  } else {
    const days = Math.abs(v);
    label = `${days} ${days === 1 ? 'dia' : 'dias'} ${paidDate ? 'após o vencimento' : 'em atraso'}`;
    tone = 'text-red-700 dark:text-red-300 font-semibold';
  }

  return (
    <div
      className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/60 text-sm h-[42px] flex items-center ${tone}`}
    >
      {label}
    </div>
  );
}

interface BoletoToggleProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Checkbox "Sim" / "Não" para o campo Boleto, no mesmo estilo do "Lembre de mim" da página de login.
 * - Marcado → grava "Sim"
 * - Desmarcado → grava "Não"
 * - Valores especiais vindos da planilha (ex.: "CANCELADA") são exibidos como badge somente leitura.
 */
function BoletoToggle({ value, onChange }: BoletoToggleProps) {
  const normalized = (value || '').trim().toLowerCase();
  const isSpecialValue =
    normalized !== '' && normalized !== 'sim' && normalized !== 'não' && normalized !== 'nao';

  if (isSpecialValue) {
    return (
      <div className="flex items-center gap-2 h-[42px]">
        <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-sm font-medium uppercase">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange('Não')}
          className="text-xs text-gray-500 dark:text-gray-400 underline hover:text-gray-700 dark:hover:text-gray-200"
        >
          Limpar
        </button>
      </div>
    );
  }

  const isYes = normalized === 'sim';

  return (
    <label className="flex items-center gap-3 cursor-pointer group h-[42px] select-none">
      <div className="relative">
        <input
          type="checkbox"
          checked={isYes}
          onChange={(e) => onChange(e.target.checked ? 'Sim' : 'Não')}
          className="sr-only"
        />
        <div
          className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
            isYes
              ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
          }`}
        >
          {isYes && (
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {isYes ? 'Sim' : 'Não'}
      </span>
    </label>
  );
}

