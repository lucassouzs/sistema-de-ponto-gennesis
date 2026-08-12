'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Store,
  Plus,
  Search,
  X,
  AlertCircle,
  Filter,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses
} from '@/components/ui/RowActionMenu';
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { Modal } from '@/components/ui/Modal';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import {
  SUPPLIER_IMPORT_COLUMNS,
  downloadSupplierImportTemplate,
  normalizeSupplierCategory,
  parseSuppliersFromFile
} from '@/lib/supplierImport';
import { labeledToSelectOptions, stringsToSelectOptions } from '@/lib/selectOptionBuilders';
import { POLOS_LIST } from '@/constants/payrollFilters';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';

const SUPPLIER_ACTIVE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos (ativos e inativos)' },
  { value: 'true', label: 'Somente ativos' },
  { value: 'false', label: 'Somente inativos' },
]);

const PARTY_TYPE_SELECT_OPTIONS = labeledToSelectOptions([
  { value: 'Fornecedor', label: 'Fornecedor' },
  { value: 'Cliente', label: 'Cliente' },
  { value: 'Cliente/Fornecedor', label: 'Cliente/Fornecedor' },
]);

const CATEGORY_SELECT_OPTIONS = labeledToSelectOptions([
  { value: 'Pessoa Física', label: 'Pessoa Física' },
  { value: 'Pessoa Jurídica', label: 'Pessoa Jurídica' },
]);

const STATE_SELECT_OPTIONS = stringsToSelectOptions(POLOS_LIST);

const PIX_KEY_TYPE_SELECT_OPTIONS = labeledToSelectOptions([
  { value: 'ALEATÓRIA', label: 'ALEATÓRIA' },
  { value: 'CELULAR', label: 'CELULAR' },
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'CPF', label: 'CPF' },
  { value: 'E-MAIL', label: 'E-MAIL' },
]);

interface Supplier {
  id: string;
  code: string;
  partyType?: string | null;
  tradeName?: string | null;
  name: string;
  cnpj?: string | null;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  category?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
  poBox?: string | null;
  email?: string | null;
  phone?: string | null;
  fax?: string | null;
  mobile?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  contactName?: string | null;
  notes?: string | null;
  bank?: string | null;
  agency?: string | null;
  account?: string | null;
  accountDigit?: string | null;
  pixKeyType?: string | null;
  pixKey?: string | null;
  isActive: boolean;
}

type SupplierFormState = {
  partyType: string;
  tradeName: string;
  name: string;
  cnpj: string;
  stateRegistration: string;
  municipalRegistration: string;
  category: string;
  street: string;
  streetNumber: string;
  neighborhood: string;
  city: string;
  complement: string;
  poBox: string;
  state: string;
  zipCode: string;
  phone: string;
  fax: string;
  mobile: string;
  email: string;
  contactName: string;
  notes: string;
  bank: string;
  agency: string;
  account: string;
  accountDigit: string;
  pixKeyType: string;
  pixKey: string;
  isActive: boolean;
};

const EMPTY_FORM: SupplierFormState = {
  partyType: 'Fornecedor',
  tradeName: '',
  name: '',
  cnpj: '',
  stateRegistration: '',
  municipalRegistration: '',
  category: '',
  street: '',
  streetNumber: '',
  neighborhood: '',
  city: '',
  complement: '',
  poBox: '',
  state: '',
  zipCode: '',
  phone: '',
  fax: '',
  mobile: '',
  email: '',
  contactName: '',
  notes: '',
  bank: '',
  agency: '',
  account: '',
  accountDigit: '',
  pixKeyType: '',
  pixKey: '',
  isActive: true
};

const IMPORT_FILE_ID = 'fornecedores-import-file';
const IMPORT_BATCH_SIZE = 100;
const IMPORT_REQUEST_TIMEOUT_MS = 120_000;

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const labelClass = 'mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300';

function cell(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed || '-';
}

type DetailSection = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

function getSupplierDetailSections(s: Supplier): DetailSection[] {
  const sections: DetailSection[] = [
    {
      title: 'Identificação',
      rows: [
        { label: 'ID', value: cell(s.code) },
        { label: 'Cliente/Fornecedor', value: cell(s.partyType) },
        { label: 'Nome Fantasia', value: cell(s.tradeName) },
        { label: 'Nome', value: cell(s.name) },
        { label: 'CPF/CNPJ', value: cell(s.cnpj) },
        { label: 'Inscrição Estadual', value: cell(s.stateRegistration) },
        { label: 'Inscrição Municipal', value: cell(s.municipalRegistration) },
        { label: 'Ativo', value: s.isActive ? 'Sim' : 'Não' },
        { label: 'Categoria', value: cell(s.category) }
      ]
    },
    {
      title: 'Endereço',
      rows: [
        { label: 'Rua', value: cell(s.street) },
        { label: 'Número', value: cell(s.streetNumber) },
        { label: 'Bairro', value: cell(s.neighborhood) },
        { label: 'Cidade', value: cell(s.city) },
        { label: 'Complemento', value: cell(s.complement) },
        { label: 'Caixa Postal', value: cell(s.poBox) },
        { label: 'Estado', value: cell(s.state) },
        { label: 'CEP', value: cell(s.zipCode) }
      ]
    },
    {
      title: 'Contatos',
      rows: [
        { label: 'Telefone', value: cell(s.phone) },
        { label: 'Fax', value: cell(s.fax) },
        { label: 'Celular', value: cell(s.mobile) },
        { label: 'E-mail', value: cell(s.email) },
        { label: 'Contato', value: cell(s.contactName) }
      ]
    },
    {
      title: 'Dados bancários',
      rows: [
        { label: 'Banco', value: cell(s.bank) },
        { label: 'Agência', value: cell(s.agency) },
        { label: 'Conta', value: cell(s.account) },
        { label: 'Dígito da conta', value: cell(s.accountDigit) },
        { label: 'Tipo de chave PIX', value: cell(s.pixKeyType) },
        { label: 'Chave PIX', value: cell(s.pixKey) }
      ]
    }
  ];

  if (s.notes?.trim()) {
    sections.push({
      title: 'Observações',
      rows: [{ label: 'Observações', value: s.notes.trim() }]
    });
  }

  return sections;
}

function supplierToForm(s: Supplier): SupplierFormState {
  return {
    partyType: s.partyType || 'Fornecedor',
    tradeName: s.tradeName || '',
    name: s.name || '',
    cnpj: s.cnpj || '',
    stateRegistration: s.stateRegistration || '',
    municipalRegistration: s.municipalRegistration || '',
    category: normalizeSupplierCategory(s.category) || '',
    street: s.street || '',
    streetNumber: s.streetNumber || '',
    neighborhood: s.neighborhood || '',
    city: s.city || '',
    complement: s.complement || '',
    poBox: s.poBox || '',
    state: s.state || '',
    zipCode: s.zipCode || '',
    phone: s.phone || '',
    fax: s.fax || '',
    mobile: s.mobile || '',
    email: s.email || '',
    contactName: s.contactName || '',
    notes: s.notes || '',
    bank: s.bank || '',
    agency: s.agency || '',
    account: s.account || '',
    accountDigit: s.accountDigit || '',
    pixKeyType: s.pixKeyType || '',
    pixKey: s.pixKey || '',
    isActive: s.isActive
  };
}

export default function FornecedoresPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<SupplierFormState>(EMPTY_FORM);

  const closeSupplierForm = useCallback(() => {
    setShowForm(false);
    setEditingSupplier(null);
  }, []);

  const { requestClose: requestCloseSupplierForm, confirmUi: supplierFormConfirmUi } =
    useModalCloseConfirm(closeSupplierForm, { isParentOpen: showForm });
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [supplierActiveFilter, setSupplierActiveFilter] = useState<string>('all');

  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importRowCount, setImportRowCount] = useState(0);
  const [importTotalRows, setImportTotalRows] = useState(0);
  const [importSkippedRows, setImportSkippedRows] = useState<
    Array<{ line: number; reasons: string[]; preview: string }>
  >([]);
  const [importBackendErrors, setImportBackendErrors] = useState<
    Array<{ index: number; message: string }>
  >([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    batch: number;
    totalBatches: number;
    processed: number;
    total: number;
    created: number;
    failed: number;
  } | null>(null);
  const [isImportDragging, setIsImportDragging] = useState(false);
  const [showImportJson, setShowImportJson] = useState(false);
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null);

  const hasActiveSupplierFilters = supplierActiveFilter !== 'all';

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: suppliersData, isLoading, isError, error } = useQuery({
    queryKey: ['suppliers', searchTerm, supplierActiveFilter, currentPage, itemsPerPage],
    queryFn: async () => {
      const res = await api.get('/suppliers', {
        params: {
          search: searchTerm || undefined,
          isActive: supplierActiveFilter !== 'all' ? supplierActiveFilter : undefined,
          page: currentPage,
          limit: itemsPerPage
        }
      });
      return res.data;
    }
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, supplierActiveFilter, itemsPerPage]);

  const createMutation = useMutation({
    mutationFn: async (data: SupplierFormState) => {
      const res = await api.post('/suppliers', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setShowForm(false);
      resetForm();
      toast.success('Fornecedor criado com sucesso!');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao criar fornecedor');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: SupplierFormState }) => {
      const res = await api.patch(`/suppliers/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setShowForm(false);
      setEditingSupplier(null);
      resetForm();
      toast.success('Fornecedor atualizado com sucesso!');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao atualizar fornecedor');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/suppliers/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setShowDeleteModal(null);
      toast.success('Fornecedor excluído com sucesso!');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao excluir fornecedor');
    }
  });

  const resetForm = () => {
    setFormData(EMPTY_FORM);
  };

  const handleEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setFormData(supplierToForm(s));
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (editingSupplier) {
      updateMutation.mutate({ id: editingSupplier.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportData('');
    setImportFileName('');
    setImportRowCount(0);
    setImportTotalRows(0);
    setImportSkippedRows([]);
    setImportBackendErrors([]);
    setIsImporting(false);
    setImportProgress(null);
    setIsImportDragging(false);
    setShowImportJson(false);
  };

  const processImportFile = async (file: File) => {
    const report = await parseSuppliersFromFile(file);
    if (report.suppliers.length === 0) {
      toast.error(
        report.skipped.length > 0
          ? `Nenhuma linha válida. ${report.skipped.length} linha(s) ignorada(s) — veja o relatório.`
          : 'Nenhum registro válido na planilha.'
      );
      setImportSkippedRows(report.skipped);
      setImportTotalRows(report.totalRows);
      setImportRowCount(0);
      setImportData('');
      setImportFileName(file.name);
      return;
    }
    setImportData(JSON.stringify(report.suppliers, null, 2));
    setImportFileName(file.name);
    setImportRowCount(report.suppliers.length);
    setImportTotalRows(report.totalRows);
    setImportSkippedRows(report.skipped);
    setImportBackendErrors([]);
    const skippedMsg = report.skipped.length > 0 ? `, ${report.skipped.length} ignorada(s)` : '';
    toast.success(
      `${report.suppliers.length} registro(s) prontos${skippedMsg} (de ${report.totalRows} linhas)`
    );
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await processImportFile(file);
    } catch (err) {
      toast.error('Erro ao processar arquivo: ' + (err as Error).message);
    } finally {
      event.target.value = '';
    }
  };

  const handleImportDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsImportDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (!/\.(xlsx|xls|csv|json)$/i.test(file.name)) {
      toast.error('Formato não suportado. Use .xlsx, .xls, .csv ou .json');
      return;
    }
    try {
      await processImportFile(file);
    } catch (err) {
      toast.error('Erro ao processar arquivo: ' + (err as Error).message);
    }
  };

  const handleImport = async () => {
    try {
      const suppliers = JSON.parse(importData);
      if (!Array.isArray(suppliers) || suppliers.length === 0) {
        toast.error('Formato inválido. Deve ser um array de fornecedores.');
        return;
      }

      const totalBatches = Math.ceil(suppliers.length / IMPORT_BATCH_SIZE);
      setIsImporting(true);
      setImportProgress({
        batch: 0,
        totalBatches,
        processed: 0,
        total: suppliers.length,
        created: 0,
        failed: 0
      });
      setImportBackendErrors([]);

      let totalCreated = 0;
      let totalFailed = 0;
      const allErrors: Array<{ index: number; message: string }> = [];

      for (let offset = 0; offset < suppliers.length; offset += IMPORT_BATCH_SIZE) {
        const batchIndex = Math.floor(offset / IMPORT_BATCH_SIZE) + 1;
        const batch = suppliers.slice(offset, offset + IMPORT_BATCH_SIZE);

        setImportProgress((prev) =>
          prev ? { ...prev, batch: batchIndex, processed: offset } : null
        );

        const res = await api.post(
          '/suppliers/import',
          { suppliers: batch },
          { timeout: IMPORT_REQUEST_TIMEOUT_MS }
        );

        const batchCreated = res.data?.data?.created ?? 0;
        const batchFailed = res.data?.data?.failed ?? 0;
        const batchErrors: Array<{ index: number; message: string }> =
          res.data?.data?.errors ?? [];

        totalCreated += batchCreated;
        totalFailed += batchFailed;
        allErrors.push(
          ...batchErrors.map((err) => ({
            index: err.index + offset,
            message: err.message
          }))
        );

        setImportProgress((prev) =>
          prev
            ? {
                ...prev,
                batch: batchIndex,
                processed: Math.min(offset + batch.length, suppliers.length),
                created: totalCreated,
                failed: totalFailed
              }
            : null
        );
      }

      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });

      if (totalFailed > 0) {
        setImportBackendErrors(allErrors.slice(0, 100));
        toast.error(
          `Importação: ${totalCreated} criado(s), ${totalFailed} com erro — veja o relatório`
        );
      } else {
        closeImportModal();
        toast.success(`Importação concluída: ${totalCreated} fornecedor(es) criado(s)`);
      }
    } catch (err: unknown) {
      const error = err as { code?: string; response?: { data?: { message?: string } }; message?: string };
      const message =
        error.code === 'ECONNABORTED'
          ? 'Tempo esgotado. Tente novamente — a importação foi dividida em lotes menores.'
          : error.response?.data?.message || error.message || 'Erro ao importar fornecedores';
      toast.error(message);
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const suppliers: Supplier[] = Array.isArray(suppliersData?.data) ? suppliersData.data : [];
  const pagination = suppliersData?.pagination || {
    page: 1,
    limit: itemsPerPage,
    total: 0,
    totalPages: 1
  };
  const listRange = getCadastroListRange(currentPage, pagination.limit, pagination.total);
  const suppliersLoadError =
    isError &&
    ((error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (error as Error)?.message ||
      'Não foi possível carregar os fornecedores.');

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen
  } = useRowActionMenu(suppliers);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/fornecedores">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Cadastro de Fornecedores
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Gerencie fornecedores para ordens de compra (estilo TOTVS RM)
            </p>
          </div>

          <Modal
            isOpen={isFiltersModalOpen}
            onClose={() => setIsFiltersModalOpen(false)}
            title="Filtros"
            size="md"
          >
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Status na listagem</label>
                <StringSingleSelectDropdown
                  value={supplierActiveFilter}
                  onChange={setSupplierActiveFilter}
                  options={SUPPLIER_ACTIVE_FILTER_OPTIONS}
                  allowEmpty={false}
                />
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setSupplierActiveFilter('all')}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={() => setIsFiltersModalOpen(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </Modal>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <Store className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Fornecedores
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {isError
                        ? 'Erro ao carregar a lista'
                        : `${pagination.total} ${pagination.total === 1 ? 'fornecedor' : 'fornecedores'} cadastrado(s)`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Pesquisar fornecedor..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFiltersModalOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasActiveSupplierFilters
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveSupplierFilters ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowImportModal(true);
                      setImportData('');
                      setImportFileName('');
                      setImportRowCount(0);
                      setIsImportDragging(false);
                      setShowImportJson(false);
                    }}
                    className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                  >
                    <Upload className="h-4 w-4 shrink-0" />
                    <span>Importar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(true);
                      setEditingSupplier(null);
                      resetForm();
                    }}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Novo Fornecedor</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isError ? (
                <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <AlertCircle className="h-10 w-10 text-red-500" />
                  <p className="max-w-md text-sm text-gray-700 dark:text-gray-300">
                    {suppliersLoadError}
                  </p>
                </div>
              ) : isLoading ? (
                <CadastroListLoading message="Carregando fornecedores..." />
              ) : suppliers.length === 0 ? (
                <CadastroListEmpty
                  icon={Store}
                  title="Nenhum fornecedor encontrado"
                  hint={
                    searchTerm.trim() || hasActiveSupplierFilters
                      ? 'Tente ajustar a busca ou os filtros'
                      : 'Cadastre um novo fornecedor para começar'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={listRange.startItem}
                    endItem={listRange.endItem}
                    total={pagination.total}
                    itemLabel="fornecedor"
                    itemLabelPlural="fornecedores"
                    currentPage={currentPage}
                    totalPages={listRange.totalPages}
                  />
                  <div className="table-scroll">
                    <table className={cadastroListClasses.table}>
                      <colgroup>
                        <col className="w-[11rem]" />
                        <col />
                        <col className="w-[10rem]" />
                        <col className="w-[9rem]" />
                        <col className="w-[6rem]" />
                        <col className="w-[4.5rem]" />
                      </colgroup>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th scope="col" className={cadastroListClasses.th}>ID</th>
                          <th scope="col" className={`${cadastroListClasses.th} min-w-[12rem]`}>
                            Nome Fantasia
                          </th>
                          <th scope="col" className={cadastroListClasses.thCenter}>CPF/CNPJ</th>
                          <th scope="col" className={cadastroListClasses.thCenter}>Categoria</th>
                          <th scope="col" className={cadastroListClasses.thCenter}>Ativo</th>
                          <th scope="col" className={cadastroListClasses.thRight}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {suppliers.map((s) => (
                          <tr
                            key={s.id}
                            className={getListTableRowClassName(true)}
                            onClick={() => {
                              closeRowActionMenu();
                              setDetailSupplier(s);
                            }}
                          >
                            <td
                              className={`${cadastroListClasses.tdMono} max-w-0 truncate`}
                              title={s.code || undefined}
                            >
                              {s.code || '—'}
                            </td>
                            <td className={`${cadastroListClasses.tdTruncate} min-w-[12rem]`}>
                              <ListRowNavigableLabel className="block whitespace-normal break-words">
                                {cell(s.tradeName)}
                              </ListRowNavigableLabel>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>{cell(s.cnpj)}</td>
                            <td className={cadastroListClasses.tdCenter}>{cell(s.category)}</td>
                            <td className={cadastroListClasses.tdCenter}>
                              <span
                                className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-medium ${
                                  s.isActive
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                                }`}
                              >
                                {s.isActive ? 'Sim' : 'Não'}
                              </span>
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(s.id)}
                              onToggle={(e) =>
                                toggleRowActionMenu(s.id, e.currentTarget as HTMLButtonElement)
                              }
                            />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {pagination.totalPages > 1 && (
                    <div className={cadastroListClasses.pagination}>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                      >
                        Anterior
                      </button>

                      {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                        let pageNumber: number;
                        if (pagination.totalPages <= 5) {
                          pageNumber = i + 1;
                        } else if (currentPage <= 3) {
                          pageNumber = i + 1;
                        } else if (currentPage >= pagination.totalPages - 2) {
                          pageNumber = pagination.totalPages - 4 + i;
                        } else {
                          pageNumber = currentPage - 2 + i;
                        }

                        const isActive = pageNumber === currentPage;

                        return (
                          <button
                            key={pageNumber}
                            type="button"
                            onClick={() => setCurrentPage(pageNumber)}
                            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                              isActive
                                ? 'bg-red-600 text-white'
                                : 'border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                            }`}
                          >
                            {pageNumber}
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() =>
                          setCurrentPage((prev) => Math.min(prev + 1, pagination.totalPages))
                        }
                        disabled={currentPage === pagination.totalPages}
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                      >
                        Próxima
                      </button>
                    </div>
                  )}
                </>
              )}
              {rowActionMenu && rowForActionMenu && (
                <RowActionMenuPortal
                  menu={rowActionMenu}
                  onClose={closeRowActionMenu}
                  onEdit={() => handleEdit(rowForActionMenu)}
                  onDelete={() => setShowDeleteModal(rowForActionMenu.id)}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {showForm && (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={requestCloseSupplierForm}
            />
            <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
                </h2>
                <button
                  onClick={requestCloseSupplierForm}
                  className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-6 p-6">
                <section>
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Identificação
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Cliente/Fornecedor</label>
                      <StringSingleSelectDropdown
                        value={formData.partyType}
                        onChange={(v) => setFormData({ ...formData, partyType: v })}
                        options={PARTY_TYPE_SELECT_OPTIONS}
                        allowEmpty={false}
                        placeholder="Selecione o tipo"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Categoria</label>
                      <StringSingleSelectDropdown
                        value={formData.category}
                        onChange={(v) => setFormData({ ...formData, category: v })}
                        options={CATEGORY_SELECT_OPTIONS}
                        allowEmpty={false}
                        placeholder="Selecione a categoria"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Nome Fantasia</label>
                      <input
                        type="text"
                        value={formData.tradeName}
                        onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
                        placeholder="Ex.: ABC Materiais"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Nome *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Razão social ou nome completo"
                        className={inputClass}
                        required
                      />
                    </div>
                    <div>
                      <label className={labelClass}>CPF/CNPJ</label>
                      <input
                        type="text"
                        value={formData.cnpj}
                        onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                        placeholder="00.000.000/0001-00"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Inscrição Estadual</label>
                      <input
                        type="text"
                        value={formData.stateRegistration}
                        onChange={(e) =>
                          setFormData({ ...formData, stateRegistration: e.target.value })
                        }
                        placeholder="Ex.: 123456789"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Inscrição Municipal</label>
                      <input
                        type="text"
                        value={formData.municipalRegistration}
                        onChange={(e) =>
                          setFormData({ ...formData, municipalRegistration: e.target.value })
                        }
                        placeholder="Ex.: 987654321"
                        className={inputClass}
                      />
                    </div>
                    <div className="flex items-center pt-6">
                      <label className="group flex cursor-pointer items-center gap-3">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={formData.isActive}
                            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                            className="sr-only"
                          />
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all duration-200 ${
                              formData.isActive
                                ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
                                : 'border-gray-300 bg-white group-hover:border-red-500 dark:border-gray-600 dark:bg-gray-800 dark:group-hover:border-red-400'
                            }`}
                          >
                            {formData.isActive ? (
                              <svg
                                className="h-3 w-3 text-white"
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
                            ) : null}
                          </div>
                        </div>
                        <span className="text-sm font-medium text-gray-700 transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-gray-100">
                          Ativo
                        </span>
                      </label>
                    </div>
                  </div>
                </section>

                <section className="border-t border-gray-200 pt-6 dark:border-gray-700">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Endereço
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Rua</label>
                      <input
                        type="text"
                        value={formData.street}
                        onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                        placeholder="Ex.: Rua das Flores"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Número</label>
                      <input
                        type="text"
                        value={formData.streetNumber}
                        onChange={(e) => setFormData({ ...formData, streetNumber: e.target.value })}
                        placeholder="Ex.: 100"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Bairro</label>
                      <input
                        type="text"
                        value={formData.neighborhood}
                        onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                        placeholder="Ex.: Centro"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Cidade</label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        placeholder="Ex.: Brasília"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Complemento</label>
                      <input
                        type="text"
                        value={formData.complement}
                        onChange={(e) => setFormData({ ...formData, complement: e.target.value })}
                        placeholder="Ex.: Sala 2, Bloco A"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Caixa Postal</label>
                      <input
                        type="text"
                        value={formData.poBox}
                        onChange={(e) => setFormData({ ...formData, poBox: e.target.value })}
                        placeholder="Ex.: 70000-000"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Estado</label>
                      <StringSingleSelectDropdown
                        value={formData.state}
                        onChange={(state) => setFormData({ ...formData, state })}
                        options={STATE_SELECT_OPTIONS}
                        placeholder="Selecione a UF"
                        searchPlaceholder="Pesquisar UF..."
                        emptyOptionLabel="Nenhum"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>CEP</label>
                      <input
                        type="text"
                        value={formData.zipCode}
                        onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                        placeholder="00000-000"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </section>

                <section className="border-t border-gray-200 pt-6 dark:border-gray-700">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Contatos
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Telefone</label>
                      <input
                        type="text"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="(61) 3333-4444"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Fax</label>
                      <input
                        type="text"
                        value={formData.fax}
                        onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
                        placeholder="(61) 3333-5555"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Celular</label>
                      <input
                        type="text"
                        value={formData.mobile}
                        onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                        placeholder="(61) 99999-8888"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>E-mail</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="contato@empresa.com.br"
                        className={inputClass}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Contato</label>
                      <input
                        type="text"
                        value={formData.contactName}
                        onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                        placeholder="Nome do contato principal"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </section>

                <section className="border-t border-gray-200 pt-6 dark:border-gray-700">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Dados bancários
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Banco</label>
                      <input
                        type="text"
                        value={formData.bank}
                        onChange={(e) => setFormData({ ...formData, bank: e.target.value })}
                        placeholder="Ex.: ITAÚ ou 341"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Agência</label>
                      <input
                        type="text"
                        value={formData.agency}
                        onChange={(e) => setFormData({ ...formData, agency: e.target.value })}
                        placeholder="Ex.: 1234"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Conta</label>
                      <input
                        type="text"
                        value={formData.account}
                        onChange={(e) => setFormData({ ...formData, account: e.target.value })}
                        placeholder="Ex.: 56789"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Dígito da conta</label>
                      <input
                        type="text"
                        value={formData.accountDigit}
                        onChange={(e) => setFormData({ ...formData, accountDigit: e.target.value })}
                        maxLength={2}
                        placeholder="Ex.: 0"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Tipo de chave PIX</label>
                      <StringSingleSelectDropdown
                        value={formData.pixKeyType}
                        onChange={(pixKeyType) => setFormData({ ...formData, pixKeyType })}
                        options={PIX_KEY_TYPE_SELECT_OPTIONS}
                        placeholder="Selecione o tipo de chave"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Chave PIX</label>
                      <input
                        type="text"
                        value={formData.pixKey}
                        onChange={(e) => setFormData({ ...formData, pixKey: e.target.value })}
                        placeholder="Ex.: e-mail, CPF, CNPJ ou chave aleatória"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </section>

                <div className="flex gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    onClick={requestCloseSupplierForm}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {supplierFormConfirmUi}

        {showDeleteModal && (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteModal(null)} />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
                Excluir fornecedor?
              </h3>
              <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
                Esta ação não pode ser desfeita. O fornecedor não poderá ser excluído se tiver ordens de
                compra vinculadas.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setShowDeleteModal(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => deleteMutation.mutate(showDeleteModal)}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        )}

        <Modal
          isOpen={!!detailSupplier}
          onClose={() => setDetailSupplier(null)}
          title={
            detailSupplier
              ? `Fornecedor ${detailSupplier.code || ''} — ${detailSupplier.tradeName?.trim() || detailSupplier.name}`
              : 'Detalhes do fornecedor'
          }
          size="xl"
        >
          {detailSupplier ? (
            <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
              {getSupplierDetailSections(detailSupplier).map((section) => (
                <div key={section.title}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {section.title}
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    <dl className="divide-y divide-gray-100 text-sm dark:divide-gray-700">
                      {section.rows.map((row) => (
                        <div
                          key={`${section.title}-${row.label}`}
                          className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4"
                        >
                          <dt className="font-medium text-gray-700 dark:text-gray-300">{row.label}</dt>
                          <dd className="break-words text-gray-600 dark:text-gray-400">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              ))}
              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setDetailSupplier(null)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleEdit(detailSupplier);
                    setDetailSupplier(null);
                  }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Editar
                </button>
              </div>
            </div>
          ) : null}
        </Modal>

        <Modal
          isOpen={showImportModal}
          onClose={() => {
            if (!isImporting) closeImportModal();
          }}
          title="Importar fornecedores"
          size="xl"
        >
          <div className="space-y-6">
            {isImporting && importProgress ? (
              <div className="space-y-5 py-8">
                <p className="text-center text-sm font-medium text-gray-800 dark:text-gray-200">
                  Importando fornecedores…
                </p>
                <div className="w-full space-y-2">
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                    <span>
                      Lote {importProgress.batch} de {importProgress.totalBatches}
                    </span>
                    <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-100">
                      {importProgress.processed} / {importProgress.total}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-red-600 transition-all duration-150"
                      style={{
                        width: `${Math.min(100, (importProgress.processed / importProgress.total) * 100)}%`
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                  <span>{importProgress.created} criado(s)</span>
                  {importProgress.failed > 0 ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      {importProgress.failed} com erro
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Modelo de planilha
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      Baixe o Excel com as colunas TOTVS RM e envie abaixo.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={downloadSupplierImportTemplate}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                  >
                    <Download className="h-4 w-4" />
                    Baixar modelo
                  </button>
                </div>

                <div>
                  <label className="mb-3 block text-sm font-semibold text-gray-900 dark:text-gray-100">
                    <span className="flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-red-600 dark:text-red-400" />
                      Sua planilha
                    </span>
                  </label>
                  <input
                    ref={fileInputRef}
                    id={IMPORT_FILE_ID}
                    type="file"
                    accept=".xlsx,.xls,.csv,.json"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsImportDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsImportDragging(false);
                    }}
                    onDrop={handleImportDrop}
                    className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-all ${
                      importFileName && importRowCount > 0
                        ? 'border-green-500 bg-green-50/80 dark:border-green-600 dark:bg-green-950/25'
                        : isImportDragging
                          ? 'border-red-500 bg-red-50/80 dark:border-red-500 dark:bg-red-950/20'
                          : 'border-gray-300 bg-gray-50/50 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800/40'
                    }`}
                  >
                    {importFileName && importRowCount > 0 ? (
                      <div className="space-y-3">
                        <div className="flex justify-center">
                          <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/40">
                            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {importFileName}
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-400">
                          {importRowCount} registro(s) prontos para importar
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setImportFileName('');
                            setImportRowCount(0);
                            setImportData('');
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="text-xs font-medium text-red-600 underline-offset-2 hover:underline dark:text-red-400"
                        >
                          Escolher outro arquivo
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Upload className="mx-auto h-10 w-10 text-gray-400" />
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          Arraste e solte sua planilha aqui
                        </p>
                        <label
                          htmlFor={IMPORT_FILE_ID}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                          Escolher arquivo
                        </label>
                        <p className="text-xs text-gray-500">.xlsx, .xls, .csv ou .json</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Colunas da planilha
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      O código é gerado automaticamente (1, 2, 3…).
                    </p>
                  </div>
                  <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
                    {SUPPLIER_IMPORT_COLUMNS.map((col) => (
                      <li
                        key={col.name}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
                      >
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {col.name}
                          {col.required ? (
                            <span className="ml-1 text-red-600 dark:text-red-400">*</span>
                          ) : null}
                        </span>
                        {'hint' in col && col.hint ? (
                          <span className="text-xs text-gray-500">{col.hint}</span>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {col.required ? 'Obrigatório' : 'Opcional'}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {(importSkippedRows.length > 0 || importBackendErrors.length > 0) && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                    {importSkippedRows.map((item) => (
                      <p key={`skip-${item.line}`} className="text-xs text-amber-800 dark:text-amber-300">
                        Linha {item.line}: {item.reasons.join(' · ')}
                      </p>
                    ))}
                    {importBackendErrors.map((item) => (
                      <p key={`err-${item.index}`} className="text-xs text-red-700 dark:text-red-300">
                        Registro {item.index + 1}: {item.message}
                      </p>
                    ))}
                  </div>
                )}

                <div className="rounded-xl border border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setShowImportJson((v) => !v)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    <span>Avançado: editar JSON</span>
                    <span className="text-xs text-gray-400">{showImportJson ? 'Ocultar' : 'Mostrar'}</span>
                  </button>
                  {showImportJson ? (
                    <div className="border-t border-gray-200 p-4 dark:border-gray-700">
                      <textarea
                        value={importData}
                        onChange={(e) => {
                          setImportData(e.target.value);
                          try {
                            const parsed = JSON.parse(e.target.value);
                            setImportRowCount(Array.isArray(parsed) ? parsed.length : 0);
                          } catch {
                            setImportRowCount(0);
                          }
                        }}
                        rows={8}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeImportModal}
                    disabled={isImporting}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleImport()}
                    disabled={!importData.trim() || isImporting}
                    className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {importRowCount > 0
                      ? `Importar ${importRowCount} registro(s)`
                      : 'Importar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
