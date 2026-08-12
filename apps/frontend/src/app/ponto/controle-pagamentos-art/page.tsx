'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  FileCheck,
  FileSpreadsheet,
  Filter,
  List,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
} from '@/components/ui/RowActionMenu';
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { Modal } from '@/components/ui/Modal';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { TableCheckbox } from '@/components/ui/Checkbox';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  CONTROLE_PAGAMENTO_ART_IMPORT_COLUMNS,
  downloadControlePagamentoArtImportTemplate,
  exportControlePagamentoArtEntries,
  parseControlePagamentoArtFromFile,
  type ControlePagamentoArtImportRow,
} from '@/lib/controlePagamentoArtImport';

interface ControlePagamentoArt {
  id: string;
  uf?: string | null;
  empresa?: string | null;
  contratante?: string | null;
  cnpjCpf?: string | null;
  contrato?: string | null;
  observacoes?: string | null;
  vigenciaInicio?: string | null;
  vigenciaTermino?: string | null;
  renovacao?: string | null;
  art?: string | null;
  valor?: string | number | null;
  profissional: string;
  vencDoBoleto?: string | null;
  status: string;
  pago?: string | null;
  solicitaEm?: string | null;
  pagoEm?: string | null;
  fluig?: string | null;
}

type FormState = {
  uf: string;
  empresa: string;
  contratante: string;
  cnpjCpf: string;
  contrato: string;
  observacoes: string;
  vigenciaInicio: string;
  vigenciaTermino: string;
  renovacao: string;
  art: string;
  valor: string;
  profissional: string;
  vencDoBoleto: string;
  status: string;
  pago: string;
  solicitaEm: string;
  pagoEm: string;
  fluig: string;
};

const EMPTY_FORM: FormState = {
  uf: '',
  empresa: '',
  contratante: '',
  cnpjCpf: '',
  contrato: '',
  observacoes: '',
  vigenciaInicio: '',
  vigenciaTermino: '',
  renovacao: '',
  art: '',
  valor: '',
  profissional: '',
  vencDoBoleto: '',
  status: 'EM_ABERTA',
  pago: '',
  solicitaEm: '',
  pagoEm: '',
  fluig: '',
};

const STATUS_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos' },
  { value: 'CANCELADO', label: 'Cancelados' },
]);

const PAGO_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos' },
  { value: 'SIM', label: 'SIM' },
  { value: 'NAO', label: 'NÃO' },
]);

const EMPRESA_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todas' },
  { value: 'GENNESIS', label: 'GENNESIS' },
  { value: 'ENGPAC', label: 'ENGPAC' },
  { value: 'ECONTECX', label: 'ECONTECX' },
  { value: 'ECONTECK', label: 'ECONTECK' },
  { value: 'MÉTRICA', label: 'MÉTRICA' },
  { value: 'CONSÓRCIO UNB', label: 'CONSÓRCIO UNB' },
  { value: 'CONSÓRCIO HUB', label: 'CONSÓRCIO HUB' },
]);

const UF_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todas' },
  ...[
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
    'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
  ].map((uf) => ({ value: uf, label: uf })),
]);

const STATUS_FORM_OPTIONS = labeledToSelectOptions([
  { value: 'EM_ABERTA', label: 'EM ABERTA' },
  { value: 'PAGO', label: 'PAGO' },
  { value: 'VENCIDA', label: 'VENCIDA' },
  { value: 'CANCELADO', label: 'CANCELADO' },
]);

const PAGO_FORM_OPTIONS = labeledToSelectOptions([
  { value: 'SIM', label: 'SIM' },
  { value: 'NAO', label: 'NÃO' },
]);

type ArtCardFilter = 'all' | 'pagos' | 'a_vencer' | 'vencidas';

const ART_STAT_CARDS: {
  filter: ArtCardFilter;
  label: string;
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
  countKey: 'total' | 'pagos' | 'aVencer' | 'vencidas';
}[] = [
  {
    filter: 'all',
    label: 'Total',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: List,
    countKey: 'total',
  },
  {
    filter: 'pagos',
    label: 'Pagos',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
    countKey: 'pagos',
  },
  {
    filter: 'a_vencer',
    label: 'A vencer',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    Icon: Clock,
    countKey: 'aVencer',
  },
  {
    filter: 'vencidas',
    label: 'Vencidas',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: AlertTriangle,
    countKey: 'vencidas',
  },
];

const EMPRESA_FORM_OPTIONS = labeledToSelectOptions([
  { value: 'GENNESIS', label: 'GENNESIS' },
  { value: 'ENGPAC', label: 'ENGPAC' },
  { value: 'ECONTECX', label: 'ECONTECX' },
  { value: 'ECONTECK', label: 'ECONTECK' },
  { value: 'MÉTRICA', label: 'MÉTRICA' },
  { value: 'CONSÓRCIO UNB', label: 'CONSÓRCIO UNB' },
  { value: 'CONSÓRCIO HUB', label: 'CONSÓRCIO HUB' },
]);

const IMPORT_FILE_ID = 'controle-pagamentos-art-import-file';
const IMPORT_BATCH_SIZE = 100;
const PAGE_SIZE = 20;

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
const labelClass = 'mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300';

function cell(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed || '-';
}

function toDateInput(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function formatDateBr(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return cell(value);
  return d.toLocaleDateString('pt-BR');
}

function formatMoney(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '-';
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num)) return cell(String(value));
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function statusBadgeClass(status: string): string {
  if (status === 'PAGO') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }
  if (status === 'VENCIDA') {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  }
  if (status === 'CANCELADO') {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
  }
  return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
}

/** Usa a data do calendário (YYYY-MM-DD) para evitar deslocamento de fuso. */
function toLocalDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Status exibido nos cards: EM_ABERTA com boleto já vencido conta como VENCIDA.
 */
function resolveDisplayStatus(
  status?: string | null,
  vencDoBoleto?: string | null
): string {
  const raw = (status || 'EM_ABERTA').toUpperCase();
  if (raw === 'PAGO' || raw === 'CANCELADO' || raw === 'VENCIDA') return raw;
  if (raw === 'EM_ABERTA' || raw === 'A_VENCER') {
    const venc = toLocalDateOnly(vencDoBoleto);
    if (!venc) return 'EM_ABERTA';
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (venc.getTime() < startToday.getTime()) return 'VENCIDA';
    return 'EM_ABERTA';
  }
  return raw;
}

function formatStatusLabel(status: string): string {
  if (status === 'EM_ABERTA') return 'EM ABERTA';
  if (status === 'A_VENCER') return 'A VENCER';
  return status || '-';
}

/** Coluna HOJE: dias até o vencimento do boleto (negativo = atrasado). */
function formatHoje(vencDoBoleto?: string | null, status?: string): string {
  const display = resolveDisplayStatus(status, vencDoBoleto);
  if (!vencDoBoleto || display === 'PAGO' || display === 'CANCELADO') return '-';
  const startVenc = toLocalDateOnly(vencDoBoleto);
  if (!startVenc) return '-';
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((startVenc.getTime() - startToday.getTime()) / 86400000);
  return String(diffDays);
}

function ControlePagamentoArtContent() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Opções dos filtros Contratante/Profissional: valores distintos da própria coluna da tabela.
  const { data: filterOptionsData, isLoading: loadingFilterOptions } = useQuery({
    queryKey: ['controle-pagamentos-art', 'filter-options'],
    queryFn: async () => {
      const res = await api.get('/controle-pagamentos-art');
      const list = (res.data?.data || []) as ControlePagamentoArt[];
      const contratantes = new Set<string>();
      const profissionais = new Set<string>();
      list.forEach((r) => {
        const c = (r.contratante || '').trim();
        const p = (r.profissional || '').trim();
        if (c) contratantes.add(c);
        if (p) profissionais.add(p);
      });
      return {
        contratantes: Array.from(contratantes).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        profissionais: Array.from(profissionais).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const contratanteOptions = useMemo(
    () =>
      labeledToSelectOptions(
        (filterOptionsData?.contratantes || []).map((c) => ({ value: c, label: c }))
      ),
    [filterOptionsData]
  );

  const profissionalOptions = useMemo(
    () =>
      labeledToSelectOptions(
        (filterOptionsData?.profissionais || []).map((p) => ({ value: p, label: p }))
      ),
    [filterOptionsData]
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ufFilter, setUfFilter] = useState('all');
  const [empresaFilter, setEmpresaFilter] = useState('all');
  const [contratanteFilter, setContratanteFilter] = useState('');
  const [profissionalFilter, setProfissionalFilter] = useState('');
  const [pagoFilter, setPagoFilter] = useState('all');
  const [vencDeFilter, setVencDeFilter] = useState('');
  const [vencAteFilter, setVencAteFilter] = useState('');
  const [cardFilter, setCardFilter] = useState<ArtCardFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ControlePagamentoArt | null>(null);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ControlePagamentoArt | null>(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState<ControlePagamentoArtImportRow[]>([]);
  const [importSkipped, setImportSkipped] = useState<
    { line: number; reasons: string[]; preview: string }[]
  >([]);
  const [importFileName, setImportFileName] = useState('');
  const [isImportDragging, setIsImportDragging] = useState(false);
  const [importing, setImporting] = useState(false);

  const hasActiveFilters =
    statusFilter !== 'all' ||
    ufFilter !== 'all' ||
    empresaFilter !== 'all' ||
    !!contratanteFilter.trim() ||
    !!profissionalFilter.trim() ||
    pagoFilter !== 'all' ||
    !!vencDeFilter ||
    !!vencAteFilter;

  const clearFilters = () => {
    setStatusFilter('all');
    setUfFilter('all');
    setEmpresaFilter('all');
    setContratanteFilter('');
    setProfissionalFilter('');
    setPagoFilter('all');
    setVencDeFilter('');
    setVencAteFilter('');
    setCardFilter('all');
    setCurrentPage(1);
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'controle-pagamentos-art',
      searchTerm,
      statusFilter,
      ufFilter,
      empresaFilter,
      contratanteFilter,
      profissionalFilter,
      pagoFilter,
      vencDeFilter,
      vencAteFilter,
      cardFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      else if (cardFilter !== 'all') params.set('card', cardFilter);
      if (ufFilter && ufFilter !== 'all') params.set('uf', ufFilter);
      if (empresaFilter && empresaFilter !== 'all') params.set('empresa', empresaFilter);
      if (contratanteFilter.trim()) params.set('contratante', contratanteFilter.trim());
      if (profissionalFilter.trim()) params.set('profissional', profissionalFilter.trim());
      if (pagoFilter && pagoFilter !== 'all') params.set('pago', pagoFilter);
      if (vencDeFilter) params.set('vencDe', vencDeFilter);
      if (vencAteFilter) params.set('vencAte', vencAteFilter);
      const qs = params.toString();
      const res = await api.get(`/controle-pagamentos-art${qs ? `?${qs}` : ''}`);
      return {
        rows: (res.data?.data || []) as ControlePagamentoArt[],
        meta: {
          total: Number(res.data?.meta?.total || 0),
          pagos: Number(res.data?.meta?.pagos || 0),
          aVencer: Number(res.data?.meta?.aVencer || 0),
          vencidas: Number(res.data?.meta?.vencidas || 0),
        },
      };
    },
  });

  const rows = data?.rows || [];
  const stats = data?.meta || { total: 0, pagos: 0, aVencer: 0, vencidas: 0 };
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageSafe = Math.min(currentPage, totalPages);
  const pageRows = rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  const listRange = getCadastroListRange(pageSafe, PAGE_SIZE, rows.length);

  const allFilteredSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const someFilteredSelected = rows.some((r) => selectedIds.has(r.id));
  const selectedCount = selectedIds.size;

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      if (rows.length === 0) return prev;
      if (rows.every((r) => prev.has(r.id))) {
        const next = new Set(prev);
        rows.forEach((r) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      rows.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(pageRows);

  const openCreate = () => {
    setEditing(null);
    setFormData(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (row: ControlePagamentoArt) => {
    setEditing(row);
    setFormData({
      uf: row.uf || '',
      empresa: row.empresa || '',
      contratante: row.contratante || '',
      cnpjCpf: row.cnpjCpf || '',
      contrato: row.contrato || '',
      observacoes: row.observacoes || '',
      vigenciaInicio: toDateInput(row.vigenciaInicio),
      vigenciaTermino: toDateInput(row.vigenciaTermino),
      renovacao: toDateInput(row.renovacao),
      art: row.art || '',
      valor: row.valor != null ? String(row.valor) : '',
      profissional: row.profissional || '',
      vencDoBoleto: toDateInput(row.vencDoBoleto),
      status: row.status || 'EM_ABERTA',
      pago: row.pago || '',
      solicitaEm: toDateInput(row.solicitaEm),
      pagoEm: toDateInput(row.pagoEm),
      fluig: row.fluig || '',
    });
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        uf: formData.uf.trim().toUpperCase() || null,
        empresa: formData.empresa.trim() || null,
        contratante: formData.contratante.trim() || null,
        cnpjCpf: formData.cnpjCpf.trim() || null,
        contrato: formData.contrato.trim() || null,
        observacoes: formData.observacoes.trim() || null,
        vigenciaInicio: formData.vigenciaInicio || null,
        vigenciaTermino: formData.vigenciaTermino || null,
        renovacao: formData.renovacao || null,
        art: formData.art.trim() || null,
        valor: formData.valor.trim() || null,
        profissional: formData.profissional.trim() || 'Não informado',
        vencDoBoleto: formData.vencDoBoleto || null,
        status: formData.status || 'EM_ABERTA',
        pago: formData.pago || null,
        solicitaEm: formData.solicitaEm || null,
        pagoEm: formData.pagoEm || null,
        fluig: formData.fluig.trim() || null,
      };
      if (editing) {
        await api.patch(`/controle-pagamentos-art/${editing.id}`, payload);
      } else {
        await api.post('/controle-pagamentos-art', payload);
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Registro atualizado' : 'Registro criado');
      queryClient.invalidateQueries({ queryKey: ['controle-pagamentos-art'] });
      setShowForm(false);
      setEditing(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao salvar');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await api.post('/controle-pagamentos-art/delete-many', { ids });
      return Number(res.data?.data?.deleted || ids.length);
    },
    onSuccess: (deleted) => {
      toast.success(`${deleted} registro(s) excluído(s)`);
      queryClient.invalidateQueries({ queryKey: ['controle-pagamentos-art'] });
      setSelectedIds(new Set());
      setShowBulkDeleteModal(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao excluir selecionados');
    },
  });

  async function handleImportFile(file: File) {
    try {
      const { registros, skipped } = await parseControlePagamentoArtFromFile(file);
      setImportRows(registros);
      setImportSkipped(skipped);
      setImportFileName(file.name);
      if (!registros.length) {
        toast.error('Nenhuma linha válida encontrada na planilha');
      } else {
        toast.success(`${registros.length} linha(s) pronta(s) para importar`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao ler planilha');
      setImportRows([]);
      setImportSkipped([]);
      setImportFileName('');
    }
  }

  function handleExport() {
    if (rows.length === 0) {
      toast.error('Nenhum registro para exportar com os filtros atuais.');
      return;
    }
    try {
      exportControlePagamentoArtEntries(rows, new Date().toISOString().slice(0, 10));
      toast.success(`${rows.length} registro(s) exportado(s).`);
    } catch {
      toast.error('Erro ao exportar planilha.');
    }
  }

  async function runImport() {
    if (!importRows.length) return;
    setImporting(true);
    let created = 0;
    let failed = 0;
    try {
      for (let i = 0; i < importRows.length; i += IMPORT_BATCH_SIZE) {
        const batch = importRows.slice(i, i + IMPORT_BATCH_SIZE);
        const res = await api.post('/controle-pagamentos-art/import', { registros: batch });
        created += Number(res.data?.data?.created || 0);
        failed += Number(res.data?.data?.failed || 0);
      }
      toast.success(`Importação: ${created} criado(s), ${failed} erro(s)`);
      queryClient.invalidateQueries({ queryKey: ['controle-pagamentos-art'] });
      setShowImportModal(false);
      setImportRows([]);
      setImportSkipped([]);
      setImportFileName('');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro na importação');
    } finally {
      setImporting(false);
    }
  }

  const loadError =
    (error as any)?.response?.data?.message ||
    (error as Error)?.message ||
    'Erro ao carregar controle de pagamentos ART';

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
          Controle de Pagamentos ART&apos;s / Protocolos
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          Acompanhe pagamentos, vigências e vencimentos de ART e protocolos
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
        {ART_STAT_CARDS.map((card) => (
          <FilterStatCard
            key={card.filter}
            label={card.label}
            count={stats[card.countKey]}
            icon={card.Icon}
            iconBg={card.iconBg}
            iconColor={card.iconColor}
            isActive={cardFilter === card.filter}
            loading={isLoading}
            onClick={() => {
              // Total (all) sempre mostra todos; os demais cards alternam o filtro.
              if (card.filter === 'all') {
                setCardFilter('all');
              } else {
                setCardFilter((prev) => (prev === card.filter ? 'all' : card.filter));
              }
              setStatusFilter('all');
              setCurrentPage(1);
            }}
          />
        ))}
      </div>

      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                <FileCheck className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  ART&apos;s / Protocolos
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {rows.length}{' '}
                  {rows.length === 1 ? 'registro' : 'registros'} cadastrado(s)
                </p>
              </div>
            </div>
            <div className={cadastroListClasses.cardToolbar}>
              {selectedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteModal(true)}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span>Excluir ({selectedCount})</span>
                </button>
              ) : null}
              <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Buscar por ART, profissional, contrato..."
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setCurrentPage(1);
                    }}
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
              <button
                type="button"
                onClick={handleExport}
                disabled={isLoading || rows.length === 0}
                className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                <Download className="h-4 w-4 shrink-0" />
                <span>Exportar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(true);
                  setImportRows([]);
                  setImportSkipped([]);
                  setImportFileName('');
                }}
                className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                <Upload className="h-4 w-4 shrink-0" />
                <span>Importar</span>
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span>Novo registro</span>
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className={cadastroListClasses.cardContent}>
          {isError ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <p className="max-w-md text-sm text-gray-700 dark:text-gray-300">{loadError}</p>
            </div>
          ) : isLoading ? (
            <CadastroListLoading message="Carregando pagamentos ART..." />
          ) : rows.length === 0 ? (
            <CadastroListEmpty
              icon={FileCheck}
              title="Nenhum registro encontrado"
              hint={
                searchTerm.trim() || hasActiveFilters || cardFilter !== 'all'
                  ? 'Tente ajustar a busca ou os filtros'
                  : 'Cadastre um novo registro ou importe a planilha'
              }
            />
          ) : (
            <>
              <CadastroListSummary
                startItem={listRange.startItem}
                endItem={listRange.endItem}
                total={rows.length}
                itemLabel="registro"
                itemLabelPlural="registros"
                currentPage={pageSafe}
                totalPages={totalPages}
              />
              <div className="table-scroll">
                <table className="w-full min-w-[90rem] text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th scope="col" className="w-10 px-3 py-4 sm:px-4">
                        <TableCheckbox
                          checked={allFilteredSelected}
                          indeterminate={!allFilteredSelected && someFilteredSelected}
                          onChange={() => toggleSelectAllFiltered()}
                          onClick={(e) => e.stopPropagation()}
                          ariaLabel="Selecionar todos os registros filtrados"
                        />
                      </th>
                      <th scope="col" className={cadastroListClasses.th}>ID</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>UF</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Empresa</th>
                      <th scope="col" className={cadastroListClasses.th}>Contratante</th>
                      <th scope="col" className={cadastroListClasses.th}>CNPJ/CPF</th>
                      <th scope="col" className={cadastroListClasses.th}>Contrato</th>
                      <th scope="col" className={cadastroListClasses.th}>Observações</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Vig. início</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Vig. término</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Renovação</th>
                      <th scope="col" className={cadastroListClasses.th}>ART</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Valor</th>
                      <th scope="col" className={cadastroListClasses.th}>Profissional</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Venc. boleto</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Status</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Pago</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Solicita em</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Pago em</th>
                      <th scope="col" className={cadastroListClasses.th}>Fluig</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Hoje</th>
                      <th scope="col" className={cadastroListClasses.thRight}>Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {pageRows.map((r, idx) => (
                      <tr
                        key={r.id}
                        className={getListTableRowClassName(true)}
                        onClick={() => {
                          closeRowActionMenu();
                          setDetail(r);
                        }}
                      >
                        <td
                          className="w-10 px-3 py-4 sm:px-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <TableCheckbox
                            checked={selectedIds.has(r.id)}
                            onChange={() => toggleSelectOne(r.id)}
                            onClick={(e) => e.stopPropagation()}
                            ariaLabel={`Selecionar registro ${r.id}`}
                          />
                        </td>
                        <td className={cadastroListClasses.tdMono}>
                          {(pageSafe - 1) * PAGE_SIZE + idx + 1}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>{cell(r.uf)}</td>
                        <td className={`${cadastroListClasses.tdTruncate} text-center`}>
                          <span className="block truncate">{cell(r.empresa)}</span>
                        </td>
                        <td className={cadastroListClasses.tdTruncate}>
                          <span className="block truncate">{cell(r.contratante)}</span>
                        </td>
                        <td className={cadastroListClasses.tdTruncate}>
                          <span className="block truncate">{cell(r.cnpjCpf)}</span>
                        </td>
                        <td className={cadastroListClasses.tdTruncate}>
                          <span className="block truncate">{cell(r.contrato)}</span>
                        </td>
                        <td className={cadastroListClasses.tdTruncate}>
                          <span className="block max-w-[10rem] truncate" title={r.observacoes || ''}>
                            {cell(r.observacoes)}
                          </span>
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatDateBr(r.vigenciaInicio)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatDateBr(r.vigenciaTermino)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatDateBr(r.renovacao)}
                        </td>
                        <td className={cadastroListClasses.tdTruncate}>
                          <span className="block truncate">{cell(r.art)}</span>
                        </td>
                        <td className={cadastroListClasses.tdCenter}>{formatMoney(r.valor)}</td>
                        <td className={`${cadastroListClasses.tdTruncate} min-w-[10rem]`}>
                          <ListRowNavigableLabel className="block whitespace-normal break-words">
                            {cell(r.profissional)}
                          </ListRowNavigableLabel>
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatDateBr(r.vencDoBoleto)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {(() => {
                            const displayStatus = resolveDisplayStatus(r.status, r.vencDoBoleto);
                            return (
                              <span
                                className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(displayStatus)}`}
                              >
                                {formatStatusLabel(displayStatus)}
                              </span>
                            );
                          })()}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {r.pago === 'NAO' ? 'NÃO' : cell(r.pago)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatDateBr(r.solicitaEm)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatDateBr(r.pagoEm)}
                        </td>
                        <td className={cadastroListClasses.tdTruncate}>
                          <span className="block truncate">{cell(r.fluig)}</span>
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatHoje(r.vencDoBoleto, r.status)}
                        </td>
                        <RowActionMenuCell
                          isOpen={isRowMenuOpen(r.id)}
                          onToggle={(e) =>
                            toggleRowActionMenu(r.id, e.currentTarget as HTMLButtonElement)
                          }
                        />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPagination
                currentPage={pageSafe}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </>
          )}
          {rowForActionMenu && rowActionMenu && (
            <RowActionMenuPortal
              menu={rowActionMenu}
              onClose={closeRowActionMenu}
              onEdit={() => openEdit(rowForActionMenu)}
              hideDelete
            />
          )}
        </CardContent>
      </Card>

      {showFilters && (
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
                  UF
                </label>
                <StringSingleSelectDropdown
                  value={ufFilter}
                  onChange={(v) => {
                    setUfFilter(v || 'all');
                    setCurrentPage(1);
                  }}
                  options={UF_FILTER_OPTIONS}
                  allowEmpty={false}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Empresa
                </label>
                <StringSingleSelectDropdown
                  value={empresaFilter}
                  onChange={(v) => {
                    setEmpresaFilter(v || 'all');
                    setCurrentPage(1);
                  }}
                  options={EMPRESA_FILTER_OPTIONS}
                  allowEmpty={false}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Contratante
                </label>
                <StringSingleSelectDropdown
                  value={contratanteFilter}
                  onChange={(v) => {
                    setContratanteFilter(v);
                    setCurrentPage(1);
                  }}
                  options={contratanteOptions}
                  placeholder={
                    loadingFilterOptions ? 'Carregando...' : 'Selecionar...'
                  }
                  allowEmpty
                  emptyOptionLabel="Todos"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Profissional
                </label>
                <StringSingleSelectDropdown
                  value={profissionalFilter}
                  onChange={(v) => {
                    setProfissionalFilter(v);
                    setCurrentPage(1);
                  }}
                  options={profissionalOptions}
                  placeholder={
                    loadingFilterOptions ? 'Carregando...' : 'Selecionar...'
                  }
                  allowEmpty
                  emptyOptionLabel="Todos"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Venc. do boleto
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">De</span>
                    <input
                      type="date"
                      className={inputClass}
                      value={vencDeFilter}
                      onChange={(e) => {
                        setVencDeFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Até</span>
                    <input
                      type="date"
                      className={inputClass}
                      value={vencAteFilter}
                      onChange={(e) => {
                        setVencAteFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Pago
                </label>
                <StringSingleSelectDropdown
                  value={pagoFilter}
                  onChange={(v) => {
                    setPagoFilter(v || 'all');
                    setCurrentPage(1);
                  }}
                  options={PAGO_FILTER_OPTIONS}
                  allowEmpty={false}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Status
                </label>
                <StringSingleSelectDropdown
                  value={statusFilter}
                  onChange={(v) => {
                    setStatusFilter(v);
                    setCurrentPage(1);
                  }}
                  options={STATUS_FILTER_OPTIONS}
                  allowEmpty={false}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Pagos, a vencer e vencidas ficam nos cards acima.
                </p>
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
      )}

      {showForm && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setShowForm(false);
              setEditing(null);
            }}
          />
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing ? 'Editar pagamento ART' : 'Novo registro de pagamento ART'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              className="space-y-4 p-6"
              onSubmit={(e) => {
                e.preventDefault();
                saveMutation.mutate();
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className={labelClass}>UF</label>
                  <input
                    className={inputClass}
                    value={formData.uf}
                    maxLength={2}
                    placeholder="Ex.: DF"
                    onChange={(e) =>
                      setFormData({ ...formData, uf: e.target.value.toUpperCase() })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Empresa</label>
                  <StringSingleSelectDropdown
                    value={formData.empresa}
                    onChange={(v) => setFormData({ ...formData, empresa: v })}
                    options={EMPRESA_FORM_OPTIONS}
                    placeholder="Selecionar..."
                    allowEmpty
                    emptyOptionLabel="—"
                  />
                </div>
                <div>
                  <label className={labelClass}>Contratante</label>
                  <input
                    className={inputClass}
                    value={formData.contratante}
                    onChange={(e) => setFormData({ ...formData, contratante: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>CNPJ/CPF</label>
                  <input
                    className={inputClass}
                    value={formData.cnpjCpf}
                    onChange={(e) => setFormData({ ...formData, cnpjCpf: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Contrato</label>
                  <input
                    className={inputClass}
                    value={formData.contrato}
                    onChange={(e) => setFormData({ ...formData, contrato: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>ART</label>
                  <input
                    className={inputClass}
                    value={formData.art}
                    onChange={(e) => setFormData({ ...formData, art: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Profissional</label>
                  <input
                    className={inputClass}
                    value={formData.profissional}
                    onChange={(e) => setFormData({ ...formData, profissional: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className={labelClass}>Observações</label>
                  <input
                    className={inputClass}
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Vigência — início</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={formData.vigenciaInicio}
                    onChange={(e) => setFormData({ ...formData, vigenciaInicio: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Vigência — término</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={formData.vigenciaTermino}
                    onChange={(e) => setFormData({ ...formData, vigenciaTermino: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Renovação</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={formData.renovacao}
                    onChange={(e) => setFormData({ ...formData, renovacao: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Valor</label>
                  <input
                    className={inputClass}
                    value={formData.valor}
                    onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className={labelClass}>Venc. do boleto</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={formData.vencDoBoleto}
                    onChange={(e) => setFormData({ ...formData, vencDoBoleto: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Status</label>
                  <StringSingleSelectDropdown
                    value={formData.status}
                    onChange={(v) => setFormData({ ...formData, status: v })}
                    options={STATUS_FORM_OPTIONS}
                    allowEmpty
                    emptyOptionLabel="—"
                  />
                </div>
                <div>
                  <label className={labelClass}>Pago</label>
                  <StringSingleSelectDropdown
                    value={formData.pago}
                    onChange={(v) => setFormData({ ...formData, pago: v })}
                    options={PAGO_FORM_OPTIONS}
                    allowEmpty
                    emptyOptionLabel="—"
                  />
                </div>
                <div>
                  <label className={labelClass}>Solicita em</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={formData.solicitaEm}
                    onChange={(e) => setFormData({ ...formData, solicitaEm: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Pago em</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={formData.pagoEm}
                    onChange={(e) => setFormData({ ...formData, pagoEm: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>FLUIG</label>
                  <input
                    className={inputClass}
                    value={formData.fluig}
                    onChange={(e) => setFormData({ ...formData, fluig: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditing(null);
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detail && (
        <Modal
          isOpen={!!detail}
          onClose={() => setDetail(null)}
          title="Detalhes do pagamento ART"
        >
          <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
            {[
              ['UF', detail.uf],
              ['Empresa', detail.empresa],
              ['Contratante', detail.contratante],
              ['CNPJ/CPF', detail.cnpjCpf],
              ['Contrato', detail.contrato],
              ['Observações', detail.observacoes],
              ['Vigência — início', formatDateBr(detail.vigenciaInicio)],
              ['Vigência — término', formatDateBr(detail.vigenciaTermino)],
              ['Renovação', formatDateBr(detail.renovacao)],
              ['ART', detail.art],
              ['Valor', formatMoney(detail.valor)],
              ['Profissional', detail.profissional],
              ['Venc. do boleto', formatDateBr(detail.vencDoBoleto)],
              ['Status', formatStatusLabel(resolveDisplayStatus(detail.status, detail.vencDoBoleto))],
              ['Pago', detail.pago === 'NAO' ? 'NÃO' : detail.pago],
              ['Solicita em', formatDateBr(detail.solicitaEm)],
              ['Pago em', formatDateBr(detail.pagoEm)],
              ['FLUIG', detail.fluig],
              ['Hoje (dias até venc.)', formatHoje(detail.vencDoBoleto, detail.status)],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex gap-2 border-b border-gray-100 py-1 dark:border-gray-700"
              >
                <span className="w-48 shrink-0 font-medium text-gray-500 dark:text-gray-400">
                  {label}
                </span>
                <span>{cell(value as string | null)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                openEdit(detail);
                setDetail(null);
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Editar
            </button>
          </div>
        </Modal>
      )}

      {showBulkDeleteModal && (
        <Modal
          isOpen={showBulkDeleteModal}
          onClose={() => !bulkDeleteMutation.isPending && setShowBulkDeleteModal(false)}
          confirmBeforeClose={false}
      title="Excluir selecionados"
        >
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Tem certeza que deseja excluir{' '}
            <strong>{selectedCount}</strong> registro(s) selecionado(s)? Esta ação não pode ser
            desfeita.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => setShowBulkDeleteModal(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={bulkDeleteMutation.isPending || selectedCount === 0}
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {bulkDeleteMutation.isPending ? 'Excluindo...' : `Excluir ${selectedCount}`}
            </button>
          </div>
        </Modal>
      )}

      {showImportModal && (
        <Modal
          isOpen={showImportModal}
          onClose={() => !importing && setShowImportModal(false)}
          title="Importar controle de pagamentos ART"
        >
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => downloadControlePagamentoArtImportTemplate()}
              className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:underline"
            >
              <Download className="h-4 w-4" />
              Baixar modelo (.xlsx)
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Colunas: {CONTROLE_PAGAMENTO_ART_IMPORT_COLUMNS.map((c) => c.name).join(', ')}
            </p>
            <label
              htmlFor={IMPORT_FILE_ID}
              onDragOver={(e) => {
                e.preventDefault();
                setIsImportDragging(true);
              }}
              onDragLeave={() => setIsImportDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsImportDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleImportFile(file);
              }}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                isImportDragging
                  ? 'border-red-400 bg-red-50 dark:bg-red-950/20'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              <FileSpreadsheet className="h-8 w-8 text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {importFileName
                  ? `${importFileName} — ${importRows.length} linha(s) válida(s)${
                      importSkipped.length ? `, ${importSkipped.length} ignorada(s)` : ''
                    }`
                  : 'Arraste a planilha ou clique para selecionar'}
              </span>
              <input
                id={IMPORT_FILE_ID}
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportFile(file);
                  e.target.value = '';
                }}
              />
            </label>
            {importSkipped.length > 0 ? (
              <div className="max-h-28 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="mb-1 font-semibold">Linhas ignoradas:</p>
                <ul className="space-y-0.5">
                  {importSkipped.slice(0, 15).map((s) => (
                    <li key={s.line}>
                      {s.preview} — {s.reasons.join(', ')}
                    </li>
                  ))}
                  {importSkipped.length > 15 ? (
                    <li>… e mais {importSkipped.length - 15}</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={importing}
                onClick={() => setShowImportModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={importing || importRows.length === 0}
                onClick={() => void runImport()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {importing ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function ControlePagamentoArtPage() {
  return (
    <ProtectedRoute route="/ponto/controle-pagamentos-art">
      <MainLayout userRole="EMPLOYEE" userName="">
        <React.Suspense fallback={<Loading />}>
          <ControlePagamentoArtContent />
        </React.Suspense>
      </MainLayout>
    </ProtectedRoute>
  );
}
