'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  Filter,
  HardHat,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
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
  downloadResponsavelTecnicoImportTemplate,
  exportResponsaveisTecnicosEntries,
  parseResponsaveisFromFile,
  RESPONSAVEL_TECNICO_IMPORT_COLUMNS,
  type ResponsavelTecnicoImportRow,
} from '@/lib/responsavelTecnicoImport';

interface ResponsavelTecnico {
  id: string;
  crea: string;
  uf: string;
  empresa?: string | null;
  profissional: string;
  cpf?: string | null;
  registro?: string | null;
  dataInicio?: string | null;
  titulo?: string | null;
  artCargoFuncao?: string | null;
  protocolo?: string | null;
  baixaEm?: string | null;
  anuidade2026?: string | null;
  status: string;
}

type FormState = {
  crea: string;
  uf: string;
  empresa: string;
  profissional: string;
  cpf: string;
  registro: string;
  dataInicio: string;
  baixaEm: string;
  titulo: string;
  artCargoFuncao: string;
  protocolo: string;
  anuidade2026: string;
  status: string;
};

const EMPTY_FORM: FormState = {
  crea: '',
  uf: '',
  empresa: '',
  profissional: '',
  cpf: '',
  registro: '',
  dataInicio: '',
  baixaEm: '',
  titulo: '',
  artCargoFuncao: '',
  protocolo: '',
  anuidade2026: '',
  status: 'ATIVO',
};

const UF_SIGLAS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

const STATUS_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos' },
  { value: 'ATIVO', label: 'Ativos' },
  { value: 'BAIXADA', label: 'Baixadas' },
]);

const EMPRESA_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todas' },
  { value: 'GENNESIS', label: 'GENNESIS' },
  { value: 'ENGPAC', label: 'ENGPAC' },
  { value: 'ECONTECX', label: 'ECONTECX' },
  { value: 'CONSÓRCIO UNB', label: 'CONSÓRCIO UNB' },
  { value: 'CONSÓRCIO HUB', label: 'CONSÓRCIO HUB' },
]);

const CREA_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos' },
  ...UF_SIGLAS.map((uf) => ({ value: uf, label: `CREA-${uf}` })),
]);

const ANUIDADE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todas' },
  { value: 'PAGO', label: 'PAGO' },
  { value: 'PENDENTE', label: 'PENDENTE' },
  { value: 'VENCIDO', label: 'VENCIDO' },
]);

const STATUS_FORM_OPTIONS = labeledToSelectOptions([
  { value: 'ATIVO', label: 'ATIVO' },
  { value: 'BAIXADA', label: 'BAIXADA' },
]);

const ANUIDADE_FORM_OPTIONS = labeledToSelectOptions([
  { value: 'PAGO', label: 'PAGO' },
  { value: 'PENDENTE', label: 'PENDENTE' },
  { value: 'VENCIDO', label: 'VENCIDO' },
]);

const EMPRESA_FORM_OPTIONS = labeledToSelectOptions([
  { value: 'GENNESIS', label: 'GENNESIS' },
  { value: 'ENGPAC', label: 'ENGPAC' },
  { value: 'ECONTECX', label: 'ECONTECX' },
  { value: 'CONSÓRCIO UNB', label: 'CONSÓRCIO UNB' },
  { value: 'CONSÓRCIO HUB', label: 'CONSÓRCIO HUB' },
]);

const CREA_UF_FORM_OPTIONS = labeledToSelectOptions(
  UF_SIGLAS.map((uf) => ({ value: uf, label: uf })),
);

const IMPORT_FILE_ID = 'responsaveis-tecnicos-import-file';
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

function ResponsaveisTecnicosContent() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [empresaFilter, setEmpresaFilter] = useState('all');
  const [creaFilter, setCreaFilter] = useState('all');
  const [profissionalFilter, setProfissionalFilter] = useState('all');
  const [anuidadeFilter, setAnuidadeFilter] = useState('all');
  const [dataInicioDeFilter, setDataInicioDeFilter] = useState('');
  const [dataInicioAteFilter, setDataInicioAteFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ResponsavelTecnico | null>(null);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ResponsavelTecnico | null>(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState<ResponsavelTecnicoImportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [isImportDragging, setIsImportDragging] = useState(false);
  const [importing, setImporting] = useState(false);

  const hasActiveFilters =
    statusFilter !== 'all' ||
    empresaFilter !== 'all' ||
    creaFilter !== 'all' ||
    profissionalFilter !== 'all' ||
    anuidadeFilter !== 'all' ||
    !!dataInicioDeFilter ||
    !!dataInicioAteFilter;

  const clearFilters = () => {
    setStatusFilter('all');
    setEmpresaFilter('all');
    setCreaFilter('all');
    setProfissionalFilter('all');
    setAnuidadeFilter('all');
    setDataInicioDeFilter('');
    setDataInicioAteFilter('');
    setCurrentPage(1);
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'responsaveis-tecnicos',
      searchTerm,
      statusFilter,
      empresaFilter,
      creaFilter,
      profissionalFilter,
      anuidadeFilter,
      dataInicioDeFilter,
      dataInicioAteFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (empresaFilter && empresaFilter !== 'all') params.set('empresa', empresaFilter);
      if (creaFilter && creaFilter !== 'all') params.set('crea', creaFilter);
      if (profissionalFilter && profissionalFilter !== 'all') {
        params.set('profissional', profissionalFilter);
      }
      if (anuidadeFilter && anuidadeFilter !== 'all') params.set('anuidade', anuidadeFilter);
      if (dataInicioDeFilter) params.set('dataInicioDe', dataInicioDeFilter);
      if (dataInicioAteFilter) params.set('dataInicioAte', dataInicioAteFilter);
      const qs = params.toString();
      const res = await api.get(`/responsaveis-tecnicos${qs ? `?${qs}` : ''}`);
      return (res.data?.data || []) as ResponsavelTecnico[];
    },
  });

  const { data: allForFilterOptions = [] } = useQuery({
    queryKey: ['responsaveis-tecnicos', 'filter-options'],
    queryFn: async () => {
      const res = await api.get('/responsaveis-tecnicos');
      return (res.data?.data || []) as ResponsavelTecnico[];
    },
    staleTime: 60_000,
  });

  const profissionalFilterOptions = useMemo(() => {
    const names = Array.from(
      new Set(
        allForFilterOptions
          .map((r) => r.profissional?.trim())
          .filter((name): name is string => !!name)
      )
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return labeledToSelectOptions([
      { value: 'all', label: 'Todos' },
      ...names.map((name) => ({ value: name, label: name })),
    ]);
  }, [allForFilterOptions]);

  const rows = data || [];
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
        crea: formData.crea.trim(),
        uf: formData.crea.trim(),
        empresa: formData.empresa.trim() || null,
        profissional: formData.profissional.trim(),
        cpf: formData.cpf.trim() || null,
        registro: formData.registro.trim() || null,
        dataInicio: formData.dataInicio || null,
        baixaEm: formData.baixaEm || null,
        titulo: formData.titulo.trim() || null,
        artCargoFuncao: formData.artCargoFuncao.trim() || null,
        protocolo: formData.protocolo.trim() || null,
        anuidade2026: formData.anuidade2026.trim() || null,
        status: formData.status || 'ATIVO',
      };
      if (editing) {
        return api.patch(`/responsaveis-tecnicos/${editing.id}`, payload);
      }
      return api.post('/responsaveis-tecnicos', payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Responsável atualizado' : 'Responsável criado');
      queryClient.invalidateQueries({ queryKey: ['responsaveis-tecnicos'] });
      setShowForm(false);
      setEditing(null);
      setFormData(EMPTY_FORM);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao salvar responsável técnico');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await api.post('/responsaveis-tecnicos/delete-many', { ids });
      return Number(res.data?.data?.deleted || ids.length);
    },
    onSuccess: (deleted) => {
      toast.success(`${deleted} responsável(is) excluído(s)`);
      queryClient.invalidateQueries({ queryKey: ['responsaveis-tecnicos'] });
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
    setShowForm(true);
  }

  function openEdit(row: ResponsavelTecnico) {
    setEditing(row);
    setFormData({
      crea: row.uf || row.crea || '',
      uf: row.uf || row.crea || '',
      empresa: row.empresa || '',
      profissional: row.profissional || '',
      cpf: row.cpf || '',
      registro: row.registro || '',
      dataInicio: toDateInput(row.dataInicio),
      baixaEm: toDateInput(row.baixaEm),
      titulo: row.titulo || '',
      artCargoFuncao: row.artCargoFuncao || '',
      protocolo: row.protocolo || '',
      anuidade2026: row.anuidade2026 || '',
      status: row.status || 'ATIVO',
    });
    setShowForm(true);
  }

  async function handleImportFile(file: File) {
    try {
      const parsed = await parseResponsaveisFromFile(file);
      setImportRows(parsed.responsaveis);
      setImportFileName(file.name);
      if (parsed.skipped.length > 0) {
        toast(
          `${parsed.responsaveis.length} linha(s) válidas; ${parsed.skipped.length} ignorada(s)`,
          { icon: '⚠️' },
        );
      } else {
        toast.success(`${parsed.responsaveis.length} linha(s) pronta(s) para importar`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao ler planilha');
    }
  }

  function handleExport() {
    if (rows.length === 0) {
      toast.error('Nenhum registro para exportar com os filtros atuais.');
      return;
    }
    try {
      exportResponsaveisTecnicosEntries(rows, new Date().toISOString().slice(0, 10));
      toast.success(`${rows.length} registro(s) exportado(s).`);
    } catch {
      toast.error('Erro ao exportar planilha.');
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
        const res = await api.post('/responsaveis-tecnicos/import', { responsaveis: batch });
        created += Number(res.data?.data?.created || 0);
        failed += Number(res.data?.data?.failed || 0);
      }
      toast.success(`Importação: ${created} criado(s), ${failed} erro(s)`);
      queryClient.invalidateQueries({ queryKey: ['responsaveis-tecnicos'] });
      setShowImportModal(false);
      setImportRows([]);
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
    'Erro ao carregar responsáveis técnicos';

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
          Responsáveis Técnicos
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          Cadastro de profissionais CREA para o módulo de Licitações
        </p>
      </div>

      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                <HardHat className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Responsáveis Técnicos
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {rows.length}{' '}
                  {rows.length === 1 ? 'responsável técnico' : 'responsáveis técnicos'}{' '}
                  cadastrado(s)
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
                  placeholder="Buscar por CREA, profissional, empresa, CPF..."
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
                <span>Novo responsável</span>
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
            <CadastroListLoading message="Carregando responsáveis técnicos..." />
          ) : rows.length === 0 ? (
            <CadastroListEmpty
              icon={HardHat}
              title="Nenhum responsável técnico encontrado"
              hint={
                searchTerm.trim() || statusFilter !== 'all'
                  ? 'Tente ajustar a busca ou os filtros'
                  : 'Cadastre um novo responsável ou importe a planilha'
              }
            />
          ) : (
            <>
              <CadastroListSummary
                startItem={listRange.startItem}
                endItem={listRange.endItem}
                total={rows.length}
                itemLabel="responsável"
                itemLabelPlural="responsáveis"
                currentPage={pageSafe}
                totalPages={totalPages}
              />
              <div className="table-scroll">
                <table className={cadastroListClasses.table}>
                  <colgroup>
                    <col className="w-[3rem]" />
                    <col className="w-[4.5rem]" />
                    <col className="w-[5rem]" />
                    <col />
                    <col className="w-[10rem]" />
                    <col className="w-[12rem]" />
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
                      <th scope="col" className={cadastroListClasses.th}>
                        ID
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        CREA
                      </th>
                      <th scope="col" className={`${cadastroListClasses.th} min-w-[12rem]`}>
                        Profissional
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Empresa
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Título
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Status
                      </th>
                      <th scope="col" className={cadastroListClasses.thRight}>
                        Ação
                      </th>
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
                        <td className={cadastroListClasses.tdCenter}>{cell(r.crea || r.uf)}</td>
                        <td className={`${cadastroListClasses.tdTruncate} min-w-[12rem]`}>
                          <ListRowNavigableLabel className="block whitespace-normal break-words">
                            {cell(r.profissional)}
                          </ListRowNavigableLabel>
                          {r.registro?.trim() ? (
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {r.registro.trim()}
                            </p>
                          ) : null}
                        </td>
                        <td className={`${cadastroListClasses.tdTruncate} text-center`}>
                          <span className="block truncate" title={r.empresa || undefined}>
                            {cell(r.empresa)}
                          </span>
                        </td>
                        <td className={`${cadastroListClasses.tdTruncate} text-center`}>
                          <span className="block truncate" title={r.titulo || undefined}>
                            {cell(r.titulo)}
                          </span>
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          <span
                            className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-medium ${
                              r.status === 'ATIVO'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                            }`}
                          >
                            {cell(r.status)}
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
                  Profissional
                </label>
                <StringSingleSelectDropdown
                  value={profissionalFilter}
                  onChange={(v) => {
                    setProfissionalFilter(v || 'all');
                    setCurrentPage(1);
                  }}
                  options={profissionalFilterOptions}
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
                  CREA
                </label>
                <StringSingleSelectDropdown
                  value={creaFilter}
                  onChange={(v) => {
                    setCreaFilter(v || 'all');
                    setCurrentPage(1);
                  }}
                  options={CREA_FILTER_OPTIONS}
                  allowEmpty={false}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Data de início
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">De</span>
                    <input
                      type="date"
                      className={inputClass}
                      value={dataInicioDeFilter}
                      onChange={(e) => {
                        setDataInicioDeFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Até</span>
                    <input
                      type="date"
                      className={inputClass}
                      value={dataInicioAteFilter}
                      onChange={(e) => {
                        setDataInicioAteFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Anuidade
                </label>
                <StringSingleSelectDropdown
                  value={anuidadeFilter}
                  onChange={(v) => {
                    setAnuidadeFilter(v || 'all');
                    setCurrentPage(1);
                  }}
                  options={ANUIDADE_FILTER_OPTIONS}
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
                  Ativos e baixadas. Use Anuidade para PAGO / PENDENTE / VENCIDO.
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
        <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
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
                {editing ? 'Editar responsável técnico' : 'Novo responsável técnico'}
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
                if (!formData.crea.trim() || !formData.profissional.trim()) {
                  toast.error('Preencha CREA e Profissional');
                  return;
                }
                saveMutation.mutate();
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>CREA *</label>
                  <StringSingleSelectDropdown
                    value={formData.crea}
                    onChange={(v) => setFormData({ ...formData, crea: v, uf: v })}
                    options={CREA_UF_FORM_OPTIONS}
                    placeholder="Selecionar..."
                    allowEmpty
                    emptyOptionLabel="—"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Profissional *</label>
                  <input
                    className={inputClass}
                    value={formData.profissional}
                    onChange={(e) => setFormData({ ...formData, profissional: e.target.value })}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
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
                  <label className={labelClass}>CPF</label>
                  <input
                    className={inputClass}
                    value={formData.cpf}
                    onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Registro</label>
                  <input
                    className={inputClass}
                    value={formData.registro}
                    onChange={(e) => setFormData({ ...formData, registro: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Data de início</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={formData.dataInicio}
                    onChange={(e) => setFormData({ ...formData, dataInicio: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Baixa em</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={formData.baixaEm}
                    onChange={(e) => setFormData({ ...formData, baixaEm: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Título</label>
                  <input
                    className={inputClass}
                    value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>ART / Cargo ou função</label>
                  <input
                    className={inputClass}
                    value={formData.artCargoFuncao}
                    onChange={(e) => setFormData({ ...formData, artCargoFuncao: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Protocolo</label>
                  <input
                    className={inputClass}
                    value={formData.protocolo}
                    onChange={(e) => setFormData({ ...formData, protocolo: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Anuidade</label>
                  <StringSingleSelectDropdown
                    value={formData.anuidade2026}
                    onChange={(v) => setFormData({ ...formData, anuidade2026: v })}
                    options={ANUIDADE_FORM_OPTIONS}
                    placeholder="Selecionar..."
                    allowEmpty
                    emptyOptionLabel="—"
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
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
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
          title="Detalhes do responsável técnico"
        >
          <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
            {[
              ['CREA', detail.crea || detail.uf],
              ['Profissional', detail.profissional],
              ['Empresa', detail.empresa],
              ['CPF', detail.cpf],
              ['Registro', detail.registro],
              ['Data de início', formatDateBr(detail.dataInicio)],
              ['Baixa em', formatDateBr(detail.baixaEm)],
              ['Título', detail.titulo],
              ['ART/Cargo', detail.artCargoFuncao],
              ['Protocolo', detail.protocolo],
              ['Anuidade', detail.anuidade2026],
              ['Status', detail.status],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex gap-2 border-b border-gray-100 py-1 dark:border-gray-700">
                <span className="w-36 shrink-0 font-medium text-gray-500 dark:text-gray-400">
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
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
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
            <strong>{selectedCount}</strong> responsável(is) selecionado(s)? Esta ação não pode
            ser desfeita.
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
          title="Importar responsáveis técnicos"
        >
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => downloadResponsavelTecnicoImportTemplate()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-100"
            >
              <Download className="h-4 w-4" />
              Baixar modelo (.xlsx)
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Colunas: {RESPONSAVEL_TECNICO_IMPORT_COLUMNS.map((c) => c.name).join(', ')}
            </p>
            <div
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
              className={`rounded-lg border-2 border-dashed p-6 text-center ${
                isImportDragging
                  ? 'border-red-400 bg-red-50 dark:bg-red-950/20'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-gray-400" />
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Arraste a planilha ou{' '}
                <button
                  type="button"
                  className="font-semibold text-red-600"
                  onClick={() => fileInputRef.current?.click()}
                >
                  selecione o arquivo
                </button>
              </p>
              <input
                ref={fileInputRef}
                id={IMPORT_FILE_ID}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportFile(file);
                  e.target.value = '';
                }}
              />
              {importFileName && (
                <p className="mt-2 text-xs text-gray-500">
                  {importFileName} — {importRows.length} linha(s) válida(s)
                </p>
              )}
            </div>
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
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {importing ? 'Importando...' : `Importar ${importRows.length || ''}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function ResponsaveisTecnicosPage() {
  return (
    <ProtectedRoute route="/ponto/responsaveis-tecnicos">
      <MainLayout userRole="EMPLOYEE" userName="">
        <React.Suspense fallback={<Loading />}>
          <ResponsaveisTecnicosContent />
        </React.Suspense>
      </MainLayout>
    </ProtectedRoute>
  );
}
