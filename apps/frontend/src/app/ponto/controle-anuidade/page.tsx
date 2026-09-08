'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CheckCircle,
  ChevronDown,
  Clock,
  Download,
  FileDown,
  FileSpreadsheet,
  Filter,
  Plus,
  RotateCcw,
  Search,
  Upload,
  Wallet,
  Trash2,
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
  CONTROLE_ANUIDADE_IMPORT_COLUMNS,
  downloadControleAnuidadeImportTemplate,
  parseControleAnuidadeFromFile,
  type ControleAnuidadeImportRow,
} from '@/lib/controleAnuidadeImport';
import {
  exportControleAnuidadeEntries,
  exportControleAnuidadePdf,
} from '@/lib/exportControleAnuidade';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

interface ControleAnuidade {
  id: string;
  pagosPelo?: string | null;
  empresa?: string | null;
  profissional: string;
  porqueDesconto?: string | null;
  crea?: string | null;
  cpfCnpj?: string | null;
  valor?: string | number | null;
  dataVencimento?: string | null;
  dataParaPagamento?: string | null;
  dataPagamento?: string | null;
  status: string;
  fluig?: string | null;
}

type FormState = {
  pagosPelo: string;
  empresa: string;
  profissional: string;
  porqueDesconto: string;
  crea: string;
  cpfCnpj: string;
  valor: string;
  dataVencimento: string;
  dataParaPagamento: string;
  dataPagamento: string;
  status: string;
  fluig: string;
};

const EMPTY_FORM: FormState = {
  pagosPelo: '',
  empresa: '',
  profissional: '',
  porqueDesconto: '',
  crea: '',
  cpfCnpj: '',
  valor: '',
  dataVencimento: '',
  dataParaPagamento: '',
  dataPagamento: '',
  status: 'EM_ABERTA',
  fluig: '',
};

const STATUS_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos' },
  { value: 'CANCELADO', label: 'Cancelados' },
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
  { value: 'T2', label: 'T2' },
]);

const PAGOS_PELO_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos' },
  { value: 'CFT', label: 'CFT' },
  { value: 'CREA-BA', label: 'CREA-BA' },
  { value: 'CREA-DF', label: 'CREA-DF' },
  { value: 'CREA-GO', label: 'CREA-GO' },
  { value: 'CREA-RN', label: 'CREA-RN' },
  { value: 'CREA-PB', label: 'CREA-PB' },
  { value: 'CREA-PE', label: 'CREA-PE' },
  { value: 'CREA-RS', label: 'CREA-RS' },
  { value: 'CREA-SE', label: 'CREA-SE' },
  { value: 'CREA-MG', label: 'CREA-MG' },
  { value: 'CREA-PR', label: 'CREA-PR' },
  { value: 'CAU', label: 'CAU' },
]);

const STATUS_FORM_OPTIONS = labeledToSelectOptions([
  { value: 'EM_ABERTA', label: 'EM ABERTA' },
  { value: 'PAGO', label: 'PAGO' },
  { value: 'VENCIDA', label: 'VENCIDA' },
  { value: 'CANCELADO', label: 'CANCELADO' },
]);

type AnuidadeCardFilter = 'all' | 'pagos' | 'vencidas' | 'em_aberta' | 'vence_hoje';

const ANUIDADE_STAT_CARDS: {
  filter: AnuidadeCardFilter;
  label: string;
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
  countKey: 'pagos' | 'vencidas' | 'emAberta' | 'venceHoje';
}[] = [
  {
    filter: 'pagos',
    label: 'Pagos',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
    countKey: 'pagos',
  },
  {
    filter: 'vencidas',
    label: 'Vencidas',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: AlertTriangle,
    countKey: 'vencidas',
  },
  {
    filter: 'em_aberta',
    label: 'Em aberta',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    Icon: Clock,
    countKey: 'emAberta',
  },
  {
    filter: 'vence_hoje',
    label: 'Vence hoje',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: CalendarClock,
    countKey: 'venceHoje',
  },
];

const EMPRESA_FORM_VALUES = [
  'GENNESIS',
  'ENGPAC',
  'ECONTECX',
  'ECONTECK',
  'MÉTRICA',
  'CONSÓRCIO UNB',
  'CONSÓRCIO HUB',
] as const;

const EMPRESA_OPTION_PREFIX = 'empresa:';

const EMPRESA_FORM_OPTIONS = labeledToSelectOptions(
  EMPRESA_FORM_VALUES.map((value) => ({ value, label: value })),
);

function isEmpresaProfissionalOption(value: string): boolean {
  return value.startsWith(EMPRESA_OPTION_PREFIX);
}

function empresaProfissionalOptionValue(empresa: string): string {
  return `${EMPRESA_OPTION_PREFIX}${empresa}`;
}

function parseEmpresaProfissionalOption(value: string): string | null {
  if (!isEmpresaProfissionalOption(value)) return null;
  return value.slice(EMPRESA_OPTION_PREFIX.length).trim() || null;
}

const PAGOS_PELO_FORM_OPTIONS = labeledToSelectOptions([
  { value: 'CFT', label: 'CFT' },
  { value: 'CREA-BA', label: 'CREA-BA' },
  { value: 'CREA-DF', label: 'CREA-DF' },
  { value: 'CREA-GO', label: 'CREA-GO' },
  { value: 'CREA-RN', label: 'CREA-RN' },
  { value: 'CREA-PB', label: 'CREA-PB' },
  { value: 'CREA-PE', label: 'CREA-PE' },
  { value: 'CREA-RS', label: 'CREA-RS' },
  { value: 'CREA-SE', label: 'CREA-SE' },
  { value: 'CREA-MG', label: 'CREA-MG' },
  { value: 'CREA-PR', label: 'CREA-PR' },
  { value: 'CAU', label: 'CAU' },
]);

const IMPORT_FILE_ID = 'controle-anuidade-import-file';
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

function ControleAnuidadeContent() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [empresaFilter, setEmpresaFilter] = useState('all');
  const [pagosPeloFilter, setPagosPeloFilter] = useState('all');
  const [vencDeFilter, setVencDeFilter] = useState('');
  const [vencAteFilter, setVencAteFilter] = useState('');
  const [cardFilter, setCardFilter] = useState<AnuidadeCardFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ControleAnuidade | null>(null);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ControleAnuidade | null>(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [importRows, setImportRows] = useState<ControleAnuidadeImportRow[]>([]);
  const [importSkipped, setImportSkipped] = useState<
    { line: number; reasons: string[]; preview: string }[]
  >([]);
  const [importFileName, setImportFileName] = useState('');
  const [isImportDragging, setIsImportDragging] = useState(false);
  const [importing, setImporting] = useState(false);

  const hasActiveFilters =
    statusFilter !== 'all' ||
    empresaFilter !== 'all' ||
    pagosPeloFilter !== 'all' ||
    !!vencDeFilter ||
    !!vencAteFilter;

  const clearFilters = () => {
    setStatusFilter('all');
    setEmpresaFilter('all');
    setPagosPeloFilter('all');
    setVencDeFilter('');
    setVencAteFilter('');
    setCardFilter('all');
    setCurrentPage(1);
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'controle-anuidade',
      searchTerm,
      statusFilter,
      empresaFilter,
      pagosPeloFilter,
      vencDeFilter,
      vencAteFilter,
      cardFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      else if (cardFilter !== 'all') params.set('card', cardFilter);
      if (empresaFilter && empresaFilter !== 'all') params.set('empresa', empresaFilter);
      if (pagosPeloFilter && pagosPeloFilter !== 'all') params.set('pagosPelo', pagosPeloFilter);
      if (vencDeFilter) params.set('vencDe', vencDeFilter);
      if (vencAteFilter) params.set('vencAte', vencAteFilter);
      const qs = params.toString();
      const res = await api.get(`/controle-anuidade${qs ? `?${qs}` : ''}`);
      return {
        rows: (res.data?.data || []) as ControleAnuidade[],
        meta: {
          pagos: Number(res.data?.meta?.pagos || 0),
          emAberta: Number(res.data?.meta?.emAberta || 0),
          vencidas: Number(res.data?.meta?.vencidas || 0),
          venceHoje: Number(res.data?.meta?.venceHoje || 0),
        },
      };
    },
  });

  const { data: responsaveisTecnicos = [] } = useQuery({
    queryKey: ['responsaveis-tecnicos', 'for-anuidade'],
    queryFn: async () => {
      const res = await api.get('/responsaveis-tecnicos');
      return (res.data?.data || []) as Array<{
        id: string;
        profissional: string;
        empresa?: string | null;
        crea?: string | null;
        uf?: string | null;
        cpf?: string | null;
        registro?: string | null;
        status?: string;
      }>;
    },
    enabled: showForm,
  });

  const [selectedProfissionalOption, setSelectedProfissionalOption] = useState('');

  const profissionalOptions = useMemo(() => {
    const empresaOptions = EMPRESA_FORM_VALUES.map((empresa) => ({
      value: empresaProfissionalOptionValue(empresa),
      label: `Empresa · ${empresa}`,
    }));

    const rtOptions = responsaveisTecnicos
      .filter((rt) => rt.profissional?.trim())
      .slice()
      .sort((a, b) => a.profissional.localeCompare(b.profissional, 'pt-BR'))
      .map((rt) => {
        const cpf = rt.cpf?.trim();
        const label = cpf ? `${rt.profissional.trim()} · ${cpf}` : rt.profissional.trim();
        return { value: rt.id, label };
      });

    return labeledToSelectOptions([...empresaOptions, ...rtOptions]);
  }, [responsaveisTecnicos]);

  function applyProfissional(optionValue: string) {
    setSelectedProfissionalOption(optionValue);
    if (!optionValue) {
      setFormData((prev) => ({
        ...prev,
        profissional: '',
        crea: '',
        cpfCnpj: '',
      }));
      return;
    }

    const empresaNome = parseEmpresaProfissionalOption(optionValue);
    if (empresaNome) {
      setFormData((prev) => ({
        ...prev,
        profissional: empresaNome,
        empresa: prev.empresa?.trim() ? prev.empresa : empresaNome,
        crea: '',
        cpfCnpj: '',
      }));
      return;
    }

    const match = responsaveisTecnicos.find((rt) => rt.id === optionValue);
    if (!match) return;
    setFormData((prev) => ({
      ...prev,
      profissional: match.profissional.trim(),
      empresa: match.empresa?.trim() || prev.empresa,
      crea: match.crea?.trim() || match.uf?.trim() || '',
      cpfCnpj: match.cpf?.trim() || '',
    }));
  }

  useEffect(() => {
    if (!showForm || selectedProfissionalOption || !formData.profissional.trim()) {
      return;
    }
    const name = formData.profissional.trim();
    const nameUpper = name.toUpperCase();

    const naoInformadoEmpresa = name.match(/^n[aã]o informado\s*\((.+)\)$/i)?.[1]?.trim();
    const empresaCandidate = naoInformadoEmpresa || name;
    const empresaMatch = EMPRESA_FORM_VALUES.find(
      (empresa) => empresa.toUpperCase() === empresaCandidate.toUpperCase(),
    );
    if (empresaMatch) {
      setSelectedProfissionalOption(empresaProfissionalOptionValue(empresaMatch));
      return;
    }

    if (responsaveisTecnicos.length === 0) return;

    const cpf = formData.cpfCnpj.trim();
    const match =
      responsaveisTecnicos.find(
        (rt) =>
          rt.profissional?.trim().toUpperCase() === nameUpper &&
          (!cpf || (rt.cpf || '').trim() === cpf),
      ) ||
      responsaveisTecnicos.find((rt) => rt.profissional?.trim().toUpperCase() === nameUpper);
    if (match) {
      setSelectedProfissionalOption(match.id);
      if (!formData.cpfCnpj.trim() && match.cpf?.trim()) {
        setFormData((prev) => ({ ...prev, cpfCnpj: match.cpf!.trim() }));
      }
    }
  }, [
    showForm,
    selectedProfissionalOption,
    formData.profissional,
    formData.cpfCnpj,
    responsaveisTecnicos,
  ]);

  const rows = data?.rows || [];
  const stats = data?.meta || { pagos: 0, emAberta: 0, vencidas: 0, venceHoje: 0 };
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        pagosPelo: formData.pagosPelo.trim() || null,
        empresa: formData.empresa.trim() || null,
        profissional: formData.profissional.trim(),
        porqueDesconto: formData.porqueDesconto.trim() || null,
        crea: formData.crea.trim() || null,
        cpfCnpj: formData.cpfCnpj.trim() || null,
        valor: formData.valor.trim() || null,
        dataVencimento: formData.dataVencimento || null,
        dataParaPagamento: formData.dataParaPagamento || null,
        dataPagamento: formData.dataPagamento || null,
        status: formData.status || 'EM_ABERTA',
        fluig: formData.fluig.trim() || null,
      };
      if (editing) return api.patch(`/controle-anuidade/${editing.id}`, payload);
      return api.post('/controle-anuidade', payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Registro atualizado' : 'Registro criado');
      queryClient.invalidateQueries({ queryKey: ['controle-anuidade'] });
      setShowForm(false);
      setEditing(null);
      setFormData(EMPTY_FORM);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao salvar');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await api.post('/controle-anuidade/delete-many', { ids });
      return Number(res.data?.data?.deleted || ids.length);
    },
    onSuccess: (deleted) => {
      toast.success(`${deleted} registro(s) excluído(s)`);
      queryClient.invalidateQueries({ queryKey: ['controle-anuidade'] });
      setSelectedIds(new Set());
      setShowBulkDeleteModal(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao excluir selecionados');
    },
  });

  function openCreate() {
    setEditing(null);
    setFormData(EMPTY_FORM);
    setSelectedProfissionalOption('');
    setShowForm(true);
  }

  function openEdit(row: ControleAnuidade) {
    setEditing(row);
    setFormData({
      pagosPelo: row.pagosPelo || '',
      empresa: row.empresa || '',
      profissional: row.profissional || '',
      porqueDesconto: row.porqueDesconto || '',
      crea: row.crea || '',
      cpfCnpj: row.cpfCnpj || '',
      valor: row.valor != null ? String(row.valor) : '',
      dataVencimento: toDateInput(row.dataVencimento),
      dataParaPagamento: toDateInput(row.dataParaPagamento),
      dataPagamento: toDateInput(row.dataPagamento),
      status: row.status || 'EM_ABERTA',
      fluig: row.fluig || '',
    });
    setSelectedProfissionalOption('');
    setShowForm(true);
  }

  async function handleImportFile(file: File) {
    try {
      const parsed = await parseControleAnuidadeFromFile(file);
      setImportRows(parsed.registros);
      setImportSkipped(parsed.skipped);
      setImportFileName(file.name);
      if (parsed.skipped.length > 0) {
        toast(
          `${parsed.registros.length} linha(s) válidas; ${parsed.skipped.length} ignorada(s)`,
          { icon: '⚠️' },
        );
      } else {
        toast.success(`${parsed.registros.length} linha(s) prontas para importar`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao ler planilha');
    }
  }

  async function handleExportExcel() {
    if (rows.length === 0) {
      toast.error('Nenhum registro para exportar com os filtros atuais.');
      return;
    }
    setExportingExcel(true);
    try {
      await exportControleAnuidadeEntries(rows, new Date().toISOString().slice(0, 10));
      toast.success(`${rows.length} registro(s) exportado(s) em Excel.`);
      setShowExportMenu(false);
    } catch {
      toast.error('Erro ao exportar planilha.');
    } finally {
      setExportingExcel(false);
    }
  }

  async function handleExportPdf() {
    if (rows.length === 0) {
      toast.error('Nenhum registro para exportar com os filtros atuais.');
      return;
    }
    setExportingPdf(true);
    try {
      await exportControleAnuidadePdf(rows, new Date().toISOString().slice(0, 10));
      toast.success(`${rows.length} registro(s) exportado(s) em PDF.`);
      setShowExportMenu(false);
    } catch {
      toast.error('Erro ao gerar PDF.');
    } finally {
      setExportingPdf(false);
    }
  }

  async function runImport() {
    if (importRows.length === 0) {
      toast.error('Nenhuma linha válida para importar');
      return;
    }
    setImporting(true);
    let created = 0;
    let failed = 0;
    try {
      for (let i = 0; i < importRows.length; i += IMPORT_BATCH_SIZE) {
        const batch = importRows.slice(i, i + IMPORT_BATCH_SIZE);
        const res = await api.post('/controle-anuidade/import', { registros: batch });
        created += Number(res.data?.data?.created || 0);
        failed += Number(res.data?.data?.failed || 0);
      }
      toast.success(`Importação: ${created} criado(s), ${failed} erro(s)`);
      queryClient.invalidateQueries({ queryKey: ['controle-anuidade'] });
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
    'Erro ao carregar controle de anuidade';

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
          Controle de Anuidade
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          Acompanhe pagamentos e vencimentos de anuidade CREA
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
        {ANUIDADE_STAT_CARDS.map((card) => (
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
              setCardFilter((prev) => (prev === card.filter ? 'all' : card.filter));
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
                <Wallet className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Controle de Anuidade
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
                  placeholder="Buscar por profissional, empresa, CREA..."
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
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowExportMenu((v) => !v)}
                  disabled={isLoading || rows.length === 0 || exportingExcel || exportingPdf}
                  className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  <Download className="h-4 w-4 shrink-0" />
                  <span>
                    {exportingExcel
                      ? 'Gerando Excel…'
                      : exportingPdf
                        ? 'Gerando PDF…'
                        : 'Exportar'}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
                </button>
                {showExportMenu ? (
                  <>
                    <button
                      type="button"
                      aria-label="Fechar menu de exportação"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setShowExportMenu(false)}
                    />
                    <div className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                      <button
                        type="button"
                        onClick={() => void handleExportExcel()}
                        disabled={exportingExcel}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        Excel (.xlsx)
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExportPdf()}
                        disabled={exportingPdf}
                        className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        <FileDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                        PDF
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
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
            <CadastroListLoading message="Carregando controle de anuidade..." />
          ) : rows.length === 0 ? (
            <CadastroListEmpty
              icon={Wallet}
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
                <table className={cadastroListClasses.table}>
                  <colgroup>
                    <col className="w-[3rem]" />
                    <col className="w-[3.5rem]" />
                    <col className="w-[8rem]" />
                    <col className="w-[9rem]" />
                    <col />
                    <col className="w-[8rem]" />
                    <col className="w-[7rem]" />
                    <col className="w-[8rem]" />
                    <col className="w-[7rem]" />
                    <col className="w-[7rem]" />
                    <col className="w-[4.5rem]" />
                  </colgroup>
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
                      <th scope="col" className={cadastroListClasses.thCenter}>Empresa</th>
                      <th scope="col" className={cadastroListClasses.th}>Pagos pelo</th>
                      <th scope="col" className={cadastroListClasses.th}>Profissional</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Valor</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Vencimento</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>P/ pagamento</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Pagamento</th>
                      <th scope="col" className={cadastroListClasses.thCenter}>Status</th>
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
                        <td className={`${cadastroListClasses.tdTruncate} text-center`}>
                          <span className="block truncate">{cell(r.empresa)}</span>
                        </td>
                        <td className={`${cadastroListClasses.tdTruncate} min-w-[8rem]`}>
                          <span className="block whitespace-normal break-words">
                            {cell(r.pagosPelo)}
                          </span>
                        </td>
                        <td className={`${cadastroListClasses.tdTruncate} min-w-[12rem]`}>
                          <ListRowNavigableLabel className="block whitespace-normal break-words">
                            {cell(r.profissional)}
                          </ListRowNavigableLabel>
                          {r.crea?.trim() ? (
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {r.crea.trim()}
                            </p>
                          ) : null}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>{formatMoney(r.valor)}</td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatDateBr(r.dataVencimento)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatDateBr(r.dataParaPagamento)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatDateBr(r.dataPagamento)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          <span
                            className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(r.status)}`}
                          >
                            {r.status === 'EM_ABERTA' ? 'EM ABERTA' : cell(r.status)}
                          </span>
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
          {rowActionMenu && rowForActionMenu && (
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
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
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
                  Pagos pelo
                </label>
                <StringSingleSelectDropdown
                  value={pagosPeloFilter}
                  onChange={(v) => {
                    setPagosPeloFilter(v || 'all');
                    setCurrentPage(1);
                  }}
                  options={PAGOS_PELO_FILTER_OPTIONS}
                  allowEmpty={false}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Data de vencimento
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
                  Pagos, vencidas, em aberta e vence hoje ficam nos cards acima.
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
        </AppModalOverlay>
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
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing ? 'Editar anuidade' : 'Novo registro de anuidade'}
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
                if (!formData.profissional.trim() || !selectedProfissionalOption) {
                  toast.error('Selecione o profissional ou a empresa');
                  return;
                }
                saveMutation.mutate();
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Pagos pelo</label>
                  <StringSingleSelectDropdown
                    value={formData.pagosPelo}
                    onChange={(v) => setFormData({ ...formData, pagosPelo: v })}
                    options={PAGOS_PELO_FORM_OPTIONS}
                    placeholder="Selecionar..."
                    allowEmpty
                    emptyOptionLabel="—"
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
                <div className="sm:col-span-2">
                  <label className={labelClass}>Profissional *</label>
                  <StringSingleSelectDropdown
                    value={selectedProfissionalOption}
                    onChange={applyProfissional}
                    options={profissionalOptions}
                    placeholder="Selecionar profissional ou empresa..."
                    allowEmpty
                    emptyOptionLabel="—"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Porque do desconto</label>
                  <input
                    className={inputClass}
                    value={formData.porqueDesconto}
                    onChange={(e) => setFormData({ ...formData, porqueDesconto: e.target.value })}
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
                  <label className={labelClass}>Data de vencimento</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={formData.dataVencimento}
                    onChange={(e) => setFormData({ ...formData, dataVencimento: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Data para pagamento</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={formData.dataParaPagamento}
                    onChange={(e) =>
                      setFormData({ ...formData, dataParaPagamento: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Data de pagamento</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={formData.dataPagamento}
                    onChange={(e) => setFormData({ ...formData, dataPagamento: e.target.value })}
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
          title="Detalhes da anuidade"
        >
          <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
            {[
              ['Pagos pelo', detail.pagosPelo],
              ['Empresa', detail.empresa],
              ['Profissional', detail.profissional],
              ['Porque do desconto', detail.porqueDesconto],
              ['CREA', detail.crea],
              ['CPF/CNPJ', detail.cpfCnpj],
              ['Valor', formatMoney(detail.valor)],
              ['Data de vencimento', formatDateBr(detail.dataVencimento)],
              ['Data para pagamento', formatDateBr(detail.dataParaPagamento)],
              ['Data de pagamento', formatDateBr(detail.dataPagamento)],
              ['Status', detail.status === 'EM_ABERTA' ? 'EM ABERTA' : detail.status],
              ['FLUIG', detail.fluig],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex gap-2 border-b border-gray-100 py-1 dark:border-gray-700">
                <span className="w-44 shrink-0 font-medium text-gray-500 dark:text-gray-400">
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
          title="Importar controle de anuidade"
        >
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => downloadControleAnuidadeImportTemplate()}
              className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:underline"
            >
              <Download className="h-4 w-4" />
              Baixar modelo (.xlsx)
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Colunas: {CONTROLE_ANUIDADE_IMPORT_COLUMNS.map((c) => c.name).join(', ')}
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
                <p className="mb-1 font-semibold">Linhas ignoradas (sem dados úteis):</p>
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

export default function ControleAnuidadePage() {
  return (
    <ProtectedRoute route="/ponto/controle-anuidade">
      <MainLayout userRole="EMPLOYEE" userName="">
        <React.Suspense fallback={<Loading />}>
          <ControleAnuidadeContent />
        </React.Suspense>
      </MainLayout>
    </ProtectedRoute>
  );
}
