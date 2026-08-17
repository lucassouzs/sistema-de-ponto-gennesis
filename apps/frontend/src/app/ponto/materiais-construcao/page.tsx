'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Package,
  Plus,
  Search,
  X,
  Check,
  AlertCircle,
  Upload,
  Download,
  Filter,
  FileSpreadsheet,
  CheckCircle,
  Eye,
  Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId,
  getCadastroListRange
} from '@/components/ui/CadastroListSummary';
import { RowActionMenuCell, RowActionMenuPortal, cadastroListClasses, listTableRowClasses } from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { ListRowNavigableLabel } from '@/components/ui/listTableUi';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { isMaterialCadastroBudgetNature } from '@/lib/budgetNatureMatch';
import * as XLSX from 'xlsx';
import { ButtonSeg } from '../solicitacoes-dp/DpSolicitacaoTypeFields';
import { TableCheckbox } from '@/components/ui/Checkbox';

const MATERIAL_ACTIVE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos' },
  { value: 'true', label: 'Ativos' },
  { value: 'false', label: 'Inativos' },
]);

type ProductTypeKind = 'Produto' | 'Serviço' | '';

type MaterialFormState = {
  name: string;
  productType: ProductTypeKind;
  description: string;
  unit: string;
  budgetNatureId: string;
  isActive: boolean;
};

const PRODUCT_TYPES = ['Produto', 'Serviço'] as const;

function normalizeProductType(value?: string | null): ProductTypeKind {
  const v = (value || '').trim().toLowerCase();
  if (v === 'produto' || v === 'product') return 'Produto';
  if (v === 'serviço' || v === 'servico' || v === 'service') return 'Serviço';
  return '';
}

function normalizeHeaderKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function pickRowValue(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  const normalized = new Map(
    Object.entries(row).map(([k, v]) => [normalizeHeaderKey(k), v])
  );
  for (const key of keys) {
    const val = normalized.get(normalizeHeaderKey(key));
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

/** Busca valor quando o cabeçalho da planilha varia (ex.: "Nome Fantasia", "Unidade de Controle"). */
function pickRowValueByPatterns(
  row: Record<string, unknown>,
  explicitKeys: string[],
  headerPatterns: RegExp[]
): string {
  const direct = pickRowValue(row, ...explicitKeys);
  if (direct) return direct;

  for (const [header, value] of Object.entries(row)) {
    if (value === null || value === undefined || String(value).trim() === '') continue;
    const normalizedHeader = normalizeHeaderKey(header);
    if (headerPatterns.some((pattern) => pattern.test(normalizedHeader))) {
      return String(value).trim();
    }
  }
  return '';
}

function analyzeImportRow(
  row: Record<string, unknown>,
  lineNumber: number
): {
  material: Record<string, unknown> | null;
  skipReasons: string[];
  preview: string;
} {
  const isEmptyRow = Object.values(row).every(
    (value) => value === null || value === undefined || String(value).trim() === ''
  );
  if (isEmptyRow) {
    return { material: null, skipReasons: ['Linha vazia'], preview: `Linha ${lineNumber}` };
  }

  const name = pickRowValueByPatterns(
    row,
    ['Nome', 'Name', 'nome', 'name', 'Nome Fantasia', 'Nome fantasia'],
    [/^nome(\s|$)/, /^name$/]
  );
  const productTypeRaw = pickRowValueByPatterns(
    row,
    [
      'Tipo do Produto',
      'Tipo do produto',
      'Tipo',
      'tipo',
      'productType',
      'Categoria',
      'categoria'
    ],
    [/^tipo(\s|$)/, /^tipodoproduto/, /^categoria$/]
  );
  const productType = normalizeProductType(productTypeRaw);
  const description = pickRowValueByPatterns(
    row,
    [
      'Descrição do Produto',
      'Descricao do Produto',
      'Descrição',
      'Descricao',
      'description',
      'descricao'
    ],
    [/^descricao/, /^description$/]
  );
  const unit = pickRowValueByPatterns(
    row,
    [
      'Unidade de Medida',
      'Unidade de Controle',
      'Unidade',
      'unit',
      'unidade',
      'unidade de medida',
      'unidade de controle'
    ],
    [/^unidade(\s|$)/, /^unit$/]
  );
  let naturezaOrcamentaria = pickRowValueByPatterns(
    row,
    [
      'Natureza Orçamentária',
      'Natureza Orcamentaria',
      'Natureza',
      'naturezaOrcamentaria',
      'natureza orcamentaria'
    ],
    [/^natureza(\s|$)/]
  );
  if (/^sem natureza$/i.test(naturezaOrcamentaria)) {
    naturezaOrcamentaria = '';
  }
  const ativoRaw = pickRowValue(row, 'Ativo', 'ativo', 'isActive');

  const skipReasons: string[] = [];
  if (!name) skipReasons.push('Nome em branco');
  if (!unit) skipReasons.push('Unidade em branco');
  if (!productType) {
    if (productTypeRaw) {
      skipReasons.push(`Tipo inválido: "${productTypeRaw}" (use Produto ou Serviço)`);
    } else {
      skipReasons.push('Tipo do Produto em branco');
    }
  }

  const preview = name || productTypeRaw || description || `Linha ${lineNumber}`;

  if (skipReasons.length > 0) {
    return { material: null, skipReasons, preview };
  }

  return {
    material: {
      name,
      productType,
      description: description || undefined,
      unit,
      naturezaOrcamentaria: naturezaOrcamentaria || undefined,
      isActive:
        ativoRaw === ''
          ? true
          : ['true', '1', 'sim', 's', 'ativo', 'yes'].includes(ativoRaw.toLowerCase())
    },
    skipReasons: [],
    preview
  };
}

function mapRowToImportMaterial(row: Record<string, unknown>): Record<string, unknown> | null {
  return analyzeImportRow(row, 0).material;
}

type ImportParseReport = {
  materials: Record<string, unknown>[];
  skipped: Array<{ line: number; reasons: string[]; preview: string }>;
  totalRows: number;
};

function buildImportParseReport(rows: Record<string, unknown>[]): ImportParseReport {
  const materials: Record<string, unknown>[] = [];
  const skipped: ImportParseReport['skipped'] = [];

  rows.forEach((row, index) => {
    const lineNumber = index + 2;
    const result = analyzeImportRow(row, lineNumber);
    if (result.material) {
      materials.push(result.material);
    } else {
      skipped.push({
        line: lineNumber,
        reasons: result.skipReasons,
        preview: result.preview
      });
    }
  });

  return { materials, skipped, totalRows: rows.length };
}

function parseCsvMaterials(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const headers = lines[0].split(delimiter).map((h) => normalizeHeaderKey(h));

  const materials: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    const material = mapRowToImportMaterial(row);
    if (material) materials.push(material);
  }
  return materials;
}

async function parseMaterialsFromFile(file: File): Promise<ImportParseReport> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (ext === 'xlsx' || ext === 'xls') {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { materials: [], skipped: [], totalRows: 0 };
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: null
    });
    return buildImportParseReport(rows);
  }

  if (ext === 'csv') {
    const materials = parseCsvMaterials(await file.text());
    return {
      materials,
      skipped: [],
      totalRows: materials.length
    };
  }

  if (ext === 'json') {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) {
      throw new Error('O JSON deve ser um array de materiais');
    }
    return buildImportParseReport(parsed);
  }

  throw new Error('Formato não suportado. Use planilha Excel (.xlsx, .xls), CSV ou JSON.');
}

interface BudgetNatureOption {
  id: string;
  code?: string | null;
  name: string;
}

interface ConstructionMaterial {
  id: string;
  code?: string | null;
  name: string;
  sinapiCode?: string;
  productType?: string | null;
  description?: string | null;
  unit: string;
  budgetNatureId?: string | null;
  budgetNature?: BudgetNatureOption | null;
  category?: string;
  isActive: boolean;
  /** Média ponderada das últimas 10 compras efetivas; null se nunca comprou. */
  avgPaidUnitPrice?: number | null;
  createdAt: string;
  updatedAt: string;
}

type MaterialPurchaseHistoryRow = {
  id: string;
  purchaseOrderId: string;
  orderNumber: string;
  orderDate: string;
  status: string;
  supplierName: string;
  supplierCode?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
};

function formatMoneyBr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDateBr(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function formatOcNumber(orderNumber?: string | null): string {
  const raw = (orderNumber || '').trim();
  if (!raw) return '—';
  const m = raw.match(/(\d+)\s*$/);
  return m ? m[1] : raw;
}

function formatBudgetNatureLabel(bn?: BudgetNatureOption | null): string {
  if (!bn) return '-';
  return bn.name;
}

/** Unidades mais usadas em materiais e serviços de construção. */
const DEFAULT_MATERIAL_UNITS = [
  'un',
  'pç',
  'pc',
  'cx',
  'sc',
  'rl',
  'kg',
  'g',
  't',
  'm',
  'm²',
  'm³',
  'cm',
  'mm',
  'L',
  'ml',
  'h',
  'dia',
  'mês',
  'vb',
  '%',
  'gl',
  'lt',
  'serviço'
];

const UNIT_OTHER_VALUE = '__other__';

const IMPORT_FILE_ID = 'materiais-import-file';
const IMPORT_BATCH_SIZE = 100;
const EXPORT_PAGE_SIZE = 100;
const IMPORT_REQUEST_TIMEOUT_MS = 120_000;

const IMPORT_COLUMNS = [
  { name: 'Nome / Nome Fantasia', required: true },
  { name: 'Tipo do Produto', required: true, hint: 'Produto ou Serviço' },
  { name: 'Descrição do Produto', required: false },
  { name: 'Unidade de Medida / Unidade de Controle', required: true },
  { name: 'Natureza Orçamentária', required: false, hint: 'Sem Natureza = vazio' },
  { name: 'Ativo', required: false, hint: 'Sim / Não' }
] as const;

export default function MateriaisConstrucaoPage() {
  const CUSTOM_UNITS_STORAGE_KEY = 'construction-material-custom-units';

  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<ConstructionMaterial | null>(null);
  const [formData, setFormData] = useState<MaterialFormState>({
    name: '',
    productType: '',
    description: '',
    unit: '',
    budgetNatureId: '',
    isActive: true
  });
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailMaterial, setDetailMaterial] = useState<ConstructionMaterial | null>(null);
  const [detailTab, setDetailTab] = useState<'detalhes' | 'historico'>('detalhes');
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
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloadingTotvs, setIsDownloadingTotvs] = useState(false);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  /** 'all' | 'true' | 'false' — alinhado à API de listagem. */
  const [materialActiveFilter, setMaterialActiveFilter] = useState<string>('all');
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const hasActiveMaterialFilters = materialActiveFilter !== 'all';

  const { data: budgetNaturesData } = useQuery({
    queryKey: ['budget-natures-for-materials'],
    queryFn: async () => {
      const res = await api.get('/budget-natures', {
        params: { limit: 500, isActive: true }
      });
      return res.data;
    }
  });

  const budgetNatureOptions: BudgetNatureOption[] = budgetNaturesData?.data || [];

  // Buscar materiais
  const { data: materialsData, isLoading: loadingMaterials } = useQuery({
    queryKey: ['construction-materials', searchTerm, materialActiveFilter, currentPage, itemsPerPage],
    queryFn: async () => {
      const res = await api.get('/construction-materials', {
        params: {
          search: searchTerm || undefined,
          isActive: materialActiveFilter !== 'all' ? materialActiveFilter : undefined,
          page: currentPage,
          limit: itemsPerPage
        }
      });
      return res.data;
    }
  });

  const { data: purchaseHistoryData, isLoading: loadingPurchaseHistory } = useQuery({
    queryKey: ['construction-material-purchase-history', detailMaterial?.id],
    queryFn: async () => {
      const res = await api.get(`/construction-materials/${detailMaterial!.id}/purchase-history`);
      return res.data?.data as {
        avgPaidUnitPrice: number | null;
        history: MaterialPurchaseHistoryRow[];
      };
    },
    enabled: !!detailMaterial?.id
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_UNITS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const sanitized = parsed
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean);
        setCustomUnits(Array.from(new Set(sanitized)));
      }
    } catch (_error) {
      // Ignora erro de parse e segue com lista padrão.
    }
  }, []);

  const unitOptions = useMemo(() => {
    const unitsFromMaterials = (materialsData?.data || [])
      .map((material: ConstructionMaterial) => material.unit?.trim())
      .filter((unit: string) => Boolean(unit));

    return Array.from(new Set([...DEFAULT_MATERIAL_UNITS, ...customUnits, ...unitsFromMaterials]))
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [customUnits, materialsData?.data]);

  const rememberCustomUnit = (unit: string) => {
    const normalized = unit.trim();
    if (!normalized) return;

    setCustomUnits((prev) => {
      if (prev.includes(normalized)) return prev;
      const updated = [...prev, normalized].sort((a, b) =>
        a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
      );
      localStorage.setItem(CUSTOM_UNITS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Criar material
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/construction-materials', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      queryClient.invalidateQueries({ queryKey: ['materials-rm-dropdown'] });
      setShowForm(false);
      resetForm();
      toast.success('Material criado com sucesso!');
    },
    onError: (error: any) => {
      console.error('Erro ao criar material:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Erro ao criar material';
      toast.error(errorMessage);
    }
  });

  // Atualizar material
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/construction-materials/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      queryClient.invalidateQueries({ queryKey: ['materials-rm-dropdown'] });
      setShowForm(false);
      setEditingMaterial(null);
      resetForm();
      toast.success('Material atualizado com sucesso!');
    },
    onError: (error: any) => {
      console.error('Erro ao atualizar material:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Erro ao atualizar material';
      toast.error(errorMessage);
    }
  });

  // Deletar material
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/construction-materials/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      queryClient.invalidateQueries({ queryKey: ['materials-rm-dropdown'] });
      setShowDeleteModal(null);
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await api.post('/construction-materials/delete-many', { ids });
      return Number(res.data?.data?.deleted || ids.length);
    },
    onSuccess: (deleted) => {
      toast.success(
        deleted === 1 ? '1 cadastro excluído' : `${deleted} cadastros excluídos`
      );
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      queryClient.invalidateQueries({ queryKey: ['materials-rm-dropdown'] });
      setSelectedIds(new Set());
      setShowBulkDeleteModal(false);
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Erro ao excluir os cadastros selecionados'
      );
    }
  });

  const handleImport = async () => {
    try {
      const materials = JSON.parse(importData);
      if (!Array.isArray(materials) || materials.length === 0) {
        toast.error('Formato inválido. Deve ser um array de materiais.');
        return;
      }

      const totalBatches = Math.ceil(materials.length / IMPORT_BATCH_SIZE);
      setIsImporting(true);
      setImportProgress({
        batch: 0,
        totalBatches,
        processed: 0,
        total: materials.length,
        created: 0,
        failed: 0
      });
      setImportBackendErrors([]);

      let totalCreated = 0;
      let totalFailed = 0;
      const allErrors: Array<{ index: number; message: string }> = [];

      for (let offset = 0; offset < materials.length; offset += IMPORT_BATCH_SIZE) {
        const batchIndex = Math.floor(offset / IMPORT_BATCH_SIZE) + 1;
        const batch = materials.slice(offset, offset + IMPORT_BATCH_SIZE);

        setImportProgress((prev) =>
          prev
            ? {
                ...prev,
                batch: batchIndex,
                processed: offset
              }
            : null
        );

        const res = await api.post(
          '/construction-materials/import',
          { materials: batch },
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
                processed: Math.min(offset + batch.length, materials.length),
                created: totalCreated,
                failed: totalFailed
              }
            : null
        );
      }

      await queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      await queryClient.invalidateQueries({ queryKey: ['materials-rm-dropdown'] });

      if (totalFailed > 0) {
        setImportBackendErrors(allErrors.slice(0, 100));
        toast.error(
          `Importação: ${totalCreated} criado(s), ${totalFailed} com erro — veja o relatório`
        );
      } else {
        closeImportModal();
        toast.success(`Importação concluída: ${totalCreated} cadastro(s) criado(s)`);
      }
    } catch (error: any) {
      console.error('Erro ao importar materiais:', error);
      const message =
        error.code === 'ECONNABORTED'
          ? 'Tempo esgotado. Tente novamente — a importação foi dividida em lotes menores.'
          : error.response?.data?.message || error.message || 'Erro ao importar materiais';
      toast.error(message);
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      productType: '',
      description: '',
      unit: '',
      budgetNatureId: '',
      isActive: true
    });
    setEditingMaterial(null);
  };

  const openMaterialDetail = (material: ConstructionMaterial) => {
    setDetailTab('detalhes');
    setDetailMaterial(material);
  };

  const handleEdit = (material: ConstructionMaterial) => {
    setEditingMaterial(material);
    setFormData({
      name: material.name || '',
      productType: normalizeProductType(material.productType || material.category),
      description: material.description || '',
      unit: material.unit,
      budgetNatureId: material.budgetNatureId || '',
      isActive: material.isActive
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const name = formData.name.trim();
    const unit = formData.unit.trim();

    if (!name) {
      toast.error('Preencha o nome do produto');
      return;
    }

    if (!unit) {
      toast.error('Preencha a unidade de medida');
      return;
    }

    if (!formData.productType) {
      toast.error('Selecione Produto ou Serviço');
      return;
    }

    if (!formData.budgetNatureId) {
      toast.error('Selecione a natureza orçamentária');
      return;
    }

    const dataToSend: Record<string, unknown> = {
      name,
      productType: formData.productType,
      description: formData.description.trim() || undefined,
      unit,
      budgetNatureId: formData.budgetNatureId,
      isActive: formData.isActive
    };

    rememberCustomUnit(unit);

    if (editingMaterial) {
      updateMutation.mutate({ id: editingMaterial.id, data: dataToSend });
    } else {
      createMutation.mutate(dataToSend);
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const downloadImportTemplate = () => {
    const headers = [
      'Nome Fantasia',
      'Tipo do Produto',
      'Descrição do Produto',
      'Unidade de Controle',
      'Natureza Orçamentária',
      'Ativo'
    ];
    const exampleRow = [
      'Cimento Portland',
      'Produto',
      'CP II 50kg',
      'UN',
      'Materiais',
      'Sim'
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    ws['!cols'] = [
      { wch: 36 },
      { wch: 16 },
      { wch: 40 },
      { wch: 18 },
      { wch: 28 },
      { wch: 8 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Materiais');
    XLSX.writeFile(wb, 'modelo-importacao-materiais-servicos.xlsx');
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
    const report = await parseMaterialsFromFile(file);
    if (report.materials.length === 0) {
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
    setImportData(JSON.stringify(report.materials, null, 2));
    setImportFileName(file.name);
    setImportRowCount(report.materials.length);
    setImportTotalRows(report.totalRows);
    setImportSkippedRows(report.skipped);
    setImportBackendErrors([]);
    const skippedMsg =
      report.skipped.length > 0 ? `, ${report.skipped.length} ignorada(s)` : '';
    toast.success(
      `${report.materials.length} registro(s) prontos${skippedMsg} (de ${report.totalRows} linhas)`
    );
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await processImportFile(file);
    } catch (error) {
      toast.error('Erro ao processar arquivo: ' + (error as Error).message);
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
    } catch (error) {
      toast.error('Erro ao processar arquivo: ' + (error as Error).message);
    }
  };

  const handleDownloadTotvsProdutos = async () => {
    try {
      setIsDownloadingTotvs(true);

      const res = await api.get('/construction-materials/totvs/produtos-ativos', {
        timeout: 180_000
      });

      if (res.data?.success === false) {
        const msg = String(res.data?.message || 'Erro ao consultar TOTVS RM');
        toast.error(
          msg.includes('401') || /n[aã]o autorizado/i.test(msg)
            ? 'TOTVS RM recusou a autenticação. Verifique TOTVS_RM_USER/TOTVS_RM_PASSWORD no backend ou o caminho TOTVS_RM_PRODUTOSATIVOS_PATH.'
            : msg
        );
        return;
      }

      const rows: Record<string, unknown>[] = res.data?.data ?? [];

      if (rows.length === 0) {
        toast.error('Nenhum produto retornado pelo TOTVS.');
        return;
      }

      const headers: string[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          if (seen.has(key)) continue;
          seen.add(key);
          headers.push(key);
        }
      }

      const sheetRows = rows.map((row) =>
        headers.map((header) => {
          const value = row[header];
          if (value == null) return '';
          if (typeof value === 'object') return JSON.stringify(value);
          return String(value);
        })
      );

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...sheetRows]);
      XLSX.utils.book_append_sheet(wb, ws, 'PRODUTOSATIVOS');
      XLSX.writeFile(
        wb,
        `totvs-produtos-ativos-${new Date().toISOString().split('T')[0]}.xlsx`
      );
      toast.success(`${rows.length} produto(s) baixado(s) do TOTVS em Excel`);
    } catch (error: unknown) {
      console.error('Erro ao baixar PRODUTOSATIVOS:', error);
      const err = error as { response?: { status?: number; data?: { error?: string; message?: string } }; message?: string };
      if (err?.response?.status === 401) {
        toast.error('Sessão expirada. Faça login novamente e tente de novo.');
        return;
      }
      toast.error(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          'Erro ao baixar planilha do TOTVS'
      );
    } finally {
      setIsDownloadingTotvs(false);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);

      const allRows: ConstructionMaterial[] = [];
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const res = await api.get('/construction-materials', {
          params: {
            search: searchTerm || undefined,
            isActive: materialActiveFilter !== 'all' ? materialActiveFilter : undefined,
            page,
            limit: EXPORT_PAGE_SIZE
          },
          timeout: 120_000
        });

        const batch: ConstructionMaterial[] = res.data?.data ?? [];
        allRows.push(...batch);
        totalPages = res.data?.pagination?.totalPages ?? 1;
        page += 1;
      }

      if (allRows.length === 0) {
        toast.error('Nenhum cadastro para exportar.');
        return;
      }

      const headers = ['Código', 'Nome', 'Tipo', 'Descrição', 'UN'];
      const sheetRows = allRows.map((material) => [
        material.code || material.sinapiCode || '',
        material.name || '',
        normalizeProductType(material.productType || material.category) ||
          material.productType ||
          material.category ||
          '',
        material.description || '',
        material.unit || ''
      ]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...sheetRows]);
      ws['!cols'] = [
        { wch: 10 },
        { wch: 42 },
        { wch: 12 },
        { wch: 48 },
        { wch: 8 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Materiais e Serviços');
      XLSX.writeFile(
        wb,
        `materiais-e-servicos-${new Date().toISOString().split('T')[0]}.xlsx`
      );
      toast.success(`${allRows.length} cadastro(s) exportado(s) em Excel`);
    } catch (error) {
      console.error('Erro ao exportar materiais:', error);
      toast.error('Erro ao exportar para Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const materials = materialsData?.data || [];
  const pagination = materialsData?.pagination || {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1
  };

  // Resetar página quando filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, materialActiveFilter]);

  // Como a busca já é feita no backend, não precisamos filtrar no frontend
  const filteredMaterials = useMemo(() => {
    return materials;
  }, [materials]);

  const allPageSelected =
    filteredMaterials.length > 0 && filteredMaterials.every((m: ConstructionMaterial) => selectedIds.has(m.id));
  const somePageSelected = filteredMaterials.some((m: ConstructionMaterial) => selectedIds.has(m.id));
  const selectedCount = selectedIds.size;

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      if (filteredMaterials.length === 0) return prev;
      if (filteredMaterials.every((m: ConstructionMaterial) => prev.has(m.id))) {
        const next = new Set(prev);
        filteredMaterials.forEach((m: ConstructionMaterial) => next.delete(m.id));
        return next;
      }
      const next = new Set(prev);
      filteredMaterials.forEach((m: ConstructionMaterial) => next.add(m.id));
      return next;
    });
  };

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen
  } = useRowActionMenu<ConstructionMaterial>(filteredMaterials);

  const listRange = getCadastroListRange(
    currentPage,
    pagination.limit,
    pagination.total
  );

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  if (loadingUser) {
    return (
      <Loading 
        message="Carregando..."
        fullScreen
        size="lg"
      />
    );
  }

  return (
    <ProtectedRoute route="/ponto/materiais-construcao">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
            <div className="absolute right-0 top-1/2 z-10 -translate-y-1/2">
              <button
                type="button"
                onClick={() => void handleDownloadTotvsProdutos()}
                disabled={isDownloadingTotvs}
                aria-label={
                  isDownloadingTotvs
                    ? 'Baixando planilha TOTVS...'
                    : 'Baixar planilha PRODUTOSATIVOS do TOTVS RM'
                }
                title="Baixar planilha PRODUTOSATIVOS do TOTVS RM"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                <Download
                  className={`h-5 w-5 shrink-0 ${isDownloadingTotvs ? 'animate-pulse' : ''}`}
                />
              </button>
            </div>
            <div className="w-full max-w-3xl px-24 text-center sm:px-32">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
                Materiais e Serviços
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                Gerencie o cadastro de materiais e serviços
              </p>
            </div>
          </div>

          <MaterialFormModal
            isOpen={showForm}
            onClose={() => {
              setShowForm(false);
              resetForm();
            }}
            editingMaterial={editingMaterial}
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            createMutation={createMutation}
            updateMutation={updateMutation}
            unitOptions={unitOptions}
            budgetNatureOptions={budgetNatureOptions}
          />

          <Modal
            isOpen={isFiltersModalOpen}
            onClose={() => setIsFiltersModalOpen(false)}
            title="Filtros"
            size="md"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Status
                </label>
                <StringSingleSelectDropdown
                  value={materialActiveFilter}
                  onChange={setMaterialActiveFilter}
                  options={MATERIAL_ACTIVE_FILTER_OPTIONS}
                  allowEmpty={false}
                />
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setMaterialActiveFilter('all')}
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

          {/* Lista de materiais */}
          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                    <Package className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Materiais e Serviços
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {pagination.total}{' '}
                      {pagination.total === 1 ? 'cadastro' : 'cadastros'}
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
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Pesquisar..."
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
                      hasActiveMaterialFilters
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={hasActiveMaterialFilters ? 'Filtro (status ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveMaterialFilters ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport()}
                    disabled={isExporting || loadingMaterials}
                    className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                  >
                    <Download className="h-4 w-4 shrink-0" />
                    <span>{isExporting ? 'Exportando...' : 'Exportar'}</span>
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
                      resetForm();
                      setShowForm(true);
                    }}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Novo cadastro</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {loadingMaterials ? (
                <CadastroListLoading message="Carregando cadastros..." />
              ) : pagination.total === 0 ? (
                <CadastroListEmpty
                  icon={Package}
                  title="Nenhum material ou serviço encontrado"
                  hint={
                    searchTerm.trim() || hasActiveMaterialFilters
                      ? 'Tente ajustar a busca ou os filtros'
                      : 'Cadastre um novo item para começar'
                  }
                />
              ) : (
              <>
                <CadastroListSummary
                  startItem={listRange.startItem}
                  endItem={listRange.endItem}
                  total={pagination.total}
                  itemLabel="cadastro"
                  itemLabelPlural="cadastros"
                  currentPage={currentPage}
                  totalPages={listRange.totalPages}
                />
              <div className="table-scroll">
                <table className={cadastroListClasses.table}>
                  <colgroup>
                    <col className="w-10" />
                    <col className="w-[4.5rem]" />
                    <col />
                    <col className="w-[7rem]" />
                    <col className="w-[5rem]" />
                    <col className="w-[8rem]" />
                    <col className="w-[7.5rem]" />
                    <col className="w-[4.5rem]" />
                  </colgroup>
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th scope="col" className="w-10 px-3 py-4 sm:px-4">
                        <TableCheckbox
                          checked={allPageSelected}
                          indeterminate={!allPageSelected && somePageSelected}
                          onChange={() => toggleSelectAllOnPage()}
                          onClick={(e) => e.stopPropagation()}
                          ariaLabel="Selecionar todos os cadastros desta página"
                        />
                      </th>
                      <th scope="col" className={cadastroListClasses.th}>
                        ID
                      </th>
                      <th scope="col" className={`${cadastroListClasses.th} min-w-[12rem]`}>
                        Nome
                      </th>
                      <th
                        scope="col"
                        className="px-1 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-2 sm:py-4"
                      >
                        Tipo
                      </th>
                      <th
                        scope="col"
                        className="px-1 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-2 sm:py-4"
                      >
                        UN
                      </th>
                      <th
                        scope="col"
                        className="px-1 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-2 sm:py-4"
                      >
                        Média paga
                      </th>
                      <th
                        scope="col"
                        className="px-1 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-2 sm:py-4"
                      >
                        Status
                      </th>
                      <th scope="col" className={cadastroListClasses.thRight}>
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {filteredMaterials.map((material: ConstructionMaterial, index: number) => (
                        <tr
                          key={material.id}
                          role="button"
                          tabIndex={0}
                          className={listTableRowClasses.trNavigable}
                          onClick={() => openMaterialDetail(material)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openMaterialDetail(material);
                            }
                          }}
                        >
                          <td
                            className="w-10 px-3 py-4 sm:px-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <TableCheckbox
                              checked={selectedIds.has(material.id)}
                              onChange={() => toggleSelectOne(material.id)}
                              onClick={(e) => e.stopPropagation()}
                              ariaLabel={`Selecionar cadastro ${material.name || material.id}`}
                            />
                          </td>
                          <td className={cadastroListClasses.tdMono}>
                            {formatCadastroListId(material.code, listRange.startItem + index)}
                          </td>
                          <td className={`${cadastroListClasses.tdTruncate} min-w-[12rem]`}>
                            <ListRowNavigableLabel>
                              {material.name || '-'}
                            </ListRowNavigableLabel>
                          </td>
                          <td className="px-1 py-3 align-middle sm:px-2 sm:py-4">
                            <div className="flex justify-center text-sm text-gray-900 dark:text-gray-100">
                              {normalizeProductType(material.productType || material.category) ||
                                material.productType ||
                                material.category ||
                                '-'}
                            </div>
                          </td>
                          <td className="px-1 py-3 align-middle sm:px-2 sm:py-4">
                            <div className="flex justify-center text-sm text-gray-900 dark:text-gray-100">
                              {material.unit}
                            </div>
                          </td>
                          <td className="px-1 py-3 align-middle sm:px-2 sm:py-4">
                            <div className="flex justify-center text-sm tabular-nums text-gray-900 dark:text-gray-100">
                              {formatMoneyBr(material.avgPaidUnitPrice)}
                            </div>
                          </td>
                          <td className="px-1 py-3 align-middle sm:px-2 sm:py-4">
                            <div className="flex justify-center">
                              <span
                                className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-medium ${
                                  material.isActive
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                                }`}
                              >
                                {material.isActive ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                          </td>
                          <RowActionMenuCell
                            isOpen={isRowMenuOpen(material.id)}
                            onToggle={(e) =>
                              toggleRowActionMenu(material.id, e.currentTarget as HTMLButtonElement)
                            }
                          />
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {rowActionMenu && rowForActionMenu && (
                <RowActionMenuPortal
                  menu={rowActionMenu}
                  onClose={closeRowActionMenu}
                  onEdit={() => handleEdit(rowForActionMenu)}
                  onDelete={() => setShowDeleteModal(rowForActionMenu.id)}
                  extraItems={[
                    {
                      label: 'Ver detalhes',
                      icon: <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />,
                      onClick: () => openMaterialDetail(rowForActionMenu)
                    }
                  ]}
                />
              )}
              
              {/* Paginação */}
              {pagination.totalPages > 1 && (
                <div className={cadastroListClasses.pagination}>
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Anterior
                      </button>
                      
                      {/* Números das páginas */}
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
                            onClick={() => setCurrentPage(pageNumber)}
                            className={`px-3 py-2 text-sm font-medium rounded-md ${
                              isActive
                                ? 'bg-red-600 text-white'
                                : 'text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                            } transition-colors`}
                          >
                            {pageNumber}
                          </button>
                        );
                      })}
                      
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, pagination.totalPages))}
                        disabled={currentPage === pagination.totalPages}
                        className="px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Próxima
                      </button>
                </div>
              )}
              </>
              )}
            </CardContent>
          </Card>
        </div>

        <Modal
          isOpen={!!detailMaterial}
          onClose={() => setDetailMaterial(null)}
          title={
            detailMaterial
              ? `${detailMaterial.code ? `${detailMaterial.code} — ` : ''}${detailMaterial.name}`
              : 'Detalhes do material'
          }
          size="xl"
        >
          {detailMaterial ? (
            <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
              <div
                className="-mb-px flex gap-1 border-b border-gray-200 dark:border-gray-700"
                role="tablist"
                aria-label="Seções do material"
              >
                {(
                  [
                    { value: 'detalhes', label: 'Detalhes' },
                    { value: 'historico', label: 'Histórico de compras' },
                  ] as const
                ).map((tab) => {
                  const active = detailTab === tab.value;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setDetailTab(tab.value)}
                      className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? 'border-red-500 text-red-600 dark:border-red-400 dark:text-red-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {detailTab === 'detalhes' ? (
                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                  <dl className="divide-y divide-gray-100 text-sm dark:divide-gray-700">
                    <div className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4">
                      <dt className="font-medium text-gray-700 dark:text-gray-300">Tipo</dt>
                      <dd className="break-words text-gray-600 dark:text-gray-400">
                        {normalizeProductType(detailMaterial.productType || detailMaterial.category) ||
                          detailMaterial.productType ||
                          detailMaterial.category ||
                          '—'}
                      </dd>
                    </div>
                    <div className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4">
                      <dt className="font-medium text-gray-700 dark:text-gray-300">Unidade</dt>
                      <dd className="break-words text-gray-600 dark:text-gray-400">
                        {detailMaterial.unit || '—'}
                      </dd>
                    </div>
                    <div className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4">
                      <dt className="font-medium text-gray-700 dark:text-gray-300">
                        Natureza orçamentária
                      </dt>
                      <dd className="break-words text-gray-600 dark:text-gray-400">
                        {formatBudgetNatureLabel(detailMaterial.budgetNature)}
                      </dd>
                    </div>
                    <div className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4">
                      <dt className="font-medium text-gray-700 dark:text-gray-300">
                        Média paga (últimas 10)
                      </dt>
                      <dd className="break-words tabular-nums text-gray-600 dark:text-gray-400">
                        {formatMoneyBr(
                          purchaseHistoryData?.avgPaidUnitPrice ?? detailMaterial.avgPaidUnitPrice
                        )}
                        <span className="ml-1 text-xs text-gray-500 dark:text-gray-500">
                          / {detailMaterial.unit || 'un'}
                        </span>
                      </dd>
                    </div>
                    <div className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4">
                      <dt className="font-medium text-gray-700 dark:text-gray-300">Descrição</dt>
                      <dd className="whitespace-pre-wrap break-words text-gray-600 dark:text-gray-400">
                        {detailMaterial.description?.trim() || '—'}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div className="space-y-3">
                  {loadingPurchaseHistory ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Carregando histórico…</p>
                  ) : !(purchaseHistoryData?.history?.length) ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhuma compra efetiva registrada para este item.
                    </p>
                  ) : (
                    <div className="table-scroll rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="w-full min-w-[40rem] text-sm">
                        <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                              Data
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                              OC
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                              Fornecedor
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">
                              Qtd.
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">
                              V. unit.
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {purchaseHistoryData.history.map((row) => (
                            <tr key={row.id}>
                              <td className="whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-300">
                                {formatDateBr(row.orderDate)}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                                {formatOcNumber(row.orderNumber)}
                              </td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                {row.supplierName}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                                {Number(row.quantity).toLocaleString('pt-BR')} {row.unit}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                                {formatMoneyBr(row.unitPrice)}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                                {formatMoneyBr(row.totalPrice)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Lista todas as compras efetivas (após diretoria). A média paga (aba Detalhes) usa
                    só as últimas 10, ponderada pela quantidade.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setDetailMaterial(null)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const m = detailMaterial;
                    setDetailMaterial(null);
                    if (m) handleEdit(m);
                  }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Editar
                </button>
              </div>
            </div>
          ) : null}
        </Modal>

        {/* Modal de confirmação de exclusão */}
        <Modal
          isOpen={!!showDeleteModal}
          onClose={() => setShowDeleteModal(null)}
          title="Excluir Material?"
          size="md"
          confirmBeforeClose={false}
        >
          <div className="space-y-6">
            <div className="flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <p className="text-center text-sm text-gray-600 dark:text-gray-400">
              Tem certeza que deseja excluir este material? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setShowDeleteModal(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => showDeleteModal && handleDelete(showDeleteModal)}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={showBulkDeleteModal}
          onClose={() => !bulkDeleteMutation.isPending && setShowBulkDeleteModal(false)}
          title="Excluir selecionados"
          size="md"
          confirmBeforeClose={false}
        >
          <div className="space-y-6">
            <div className="flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <p className="text-center text-sm text-gray-600 dark:text-gray-400">
              Tem certeza que deseja excluir{' '}
              <strong>{selectedCount}</strong>{' '}
              {selectedCount === 1 ? 'cadastro selecionado' : 'cadastros selecionados'}? Esta ação
              não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                disabled={bulkDeleteMutation.isPending}
                onClick={() => setShowBulkDeleteModal(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={bulkDeleteMutation.isPending || selectedCount === 0}
                onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDeleteMutation.isPending ? 'Excluindo...' : `Excluir ${selectedCount}`}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={showImportModal}
          onClose={() => {
            if (!isImporting) closeImportModal();
          }}
          title="Importar cadastros"
          size="xl"
        >
          <div className="space-y-6">
            {isImporting && importProgress ? (
              <div className="py-8 space-y-5">
                <p className="text-center text-sm font-medium text-gray-800 dark:text-gray-200">
                  Importando cadastros…
                </p>
                <div className="w-full space-y-2">
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                    <span>
                      Lote {importProgress.batch} de {importProgress.totalBatches}
                    </span>
                    <span className="tabular-nums font-semibold text-gray-800 dark:text-gray-100">
                      {importProgress.processed} / {importProgress.total}{' '}
                      <span className="font-normal text-gray-500 dark:text-gray-400">
                        (
                        {Math.round(
                          (importProgress.processed / importProgress.total) * 100
                        )}
                        %)
                      </span>
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-red-600 transition-all duration-150 ease-out"
                      style={{
                        width: `${Math.min(
                          100,
                          (importProgress.processed / importProgress.total) * 100
                        )}%`
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                  <span>{importProgress.created} criado(s)</span>
                  {importProgress.failed > 0 ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      {importProgress.failed} com erro
                    </span>
                  ) : null}
                </div>
                <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                  Aguarde, não feche esta página.
                </p>
              </div>
            ) : (
              <>
            <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Modelo de planilha
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Baixe o Excel com as colunas corretas, preencha e envie abaixo.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadImportTemplate}
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
                className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
                  importFileName && importRowCount > 0
                    ? 'border-green-500 bg-green-50/80 dark:border-green-600 dark:bg-green-950/25'
                    : isImportDragging
                      ? 'border-red-500 bg-red-50/80 dark:border-red-500 dark:bg-red-950/20'
                      : 'border-gray-300 bg-gray-50/50 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800/40 dark:hover:border-gray-500'
                }`}
              >
                {importFileName && importRowCount > 0 ? (
                  <div className="space-y-3">
                    <div className="flex justify-center">
                      <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/40">
                        <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {importFileName}
                      </p>
                      <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                        {importRowCount} registro(s) prontos para importar
                        {importTotalRows > 0 ? (
                          <span className="text-gray-600 dark:text-gray-400">
                            {' '}
                            (de {importTotalRows} linhas na planilha)
                          </span>
                        ) : null}
                      </p>
                      {importSkippedRows.length > 0 ? (
                        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                          {importSkippedRows.length} linha(s) ignorada(s) — veja o relatório abaixo
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setImportFileName('');
                        setImportRowCount(0);
                        setImportTotalRows(0);
                        setImportSkippedRows([]);
                        setImportBackendErrors([]);
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
                    <div className="flex justify-center">
                      <div
                        className={`rounded-full p-4 transition-colors ${
                          isImportDragging
                            ? 'bg-red-100 dark:bg-red-900/40'
                            : 'bg-gray-100 dark:bg-gray-700'
                        }`}
                      >
                        <Upload
                          className={`h-10 w-10 ${
                            isImportDragging
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {isImportDragging
                          ? 'Solte o arquivo aqui'
                          : 'Arraste e solte sua planilha aqui'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">ou</p>
                    </div>
                    <label
                      htmlFor={IMPORT_FILE_ID}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      Escolher arquivo
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      .xlsx, .xls, .csv ou .json
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Colunas da planilha
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  A primeira linha deve ser o cabeçalho. O código é gerado automaticamente (1, 2, 3…).
                </p>
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {IMPORT_COLUMNS.map((col) => (
                  <li
                    key={col.name}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                  >
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {col.name}
                      {col.required ? (
                        <span className="ml-1 text-red-600 dark:text-red-400">*</span>
                      ) : null}
                    </span>
                    {'hint' in col && col.hint ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400">{col.hint}</span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {col.required ? 'Obrigatório' : 'Opcional'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {(importSkippedRows.length > 0 || importBackendErrors.length > 0) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20">
                <div className="border-b border-amber-200 px-4 py-3 dark:border-amber-900/50">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    Relatório de diferenças
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/80">
                    Linhas que não entraram no cadastro e o motivo
                  </p>
                </div>
                <div className="max-h-48 overflow-y-auto p-4">
                  {importSkippedRows.length > 0 ? (
                    <ul className="space-y-2 text-sm">
                      {importSkippedRows.map((item) => (
                        <li
                          key={`skip-${item.line}`}
                          className="rounded-lg border border-amber-200/80 bg-white/70 px-3 py-2 dark:border-amber-900/40 dark:bg-gray-900/40"
                        >
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            Linha {item.line}
                          </span>
                          {item.preview ? (
                            <span className="text-gray-600 dark:text-gray-400"> — {item.preview}</span>
                          ) : null}
                          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                            {item.reasons.join(' · ')}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {importBackendErrors.length > 0 ? (
                    <ul className={`space-y-2 text-sm ${importSkippedRows.length > 0 ? 'mt-4' : ''}`}>
                      {importBackendErrors.map((item) => (
                        <li
                          key={`err-${item.index}`}
                          className="rounded-lg border border-red-200/80 bg-white/70 px-3 py-2 dark:border-red-900/40 dark:bg-gray-900/40"
                        >
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            Registro {item.index + 1}
                          </span>
                          <p className="mt-1 text-xs text-red-700 dark:text-red-300">{item.message}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setShowImportJson((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/60"
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
                    placeholder='[{"name": "Cimento", "productType": "Produto", "unit": "sc"}]'
                  />
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={closeImportModal}
                disabled={isImporting}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={!importData.trim() || isImporting}
                className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isImporting
                  ? 'Importando...'
                  : importRowCount > 0
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

// Componente de Modal de Formulário
function MaterialFormModal({
  isOpen,
  onClose,
  editingMaterial,
  formData,
  setFormData,
  onSubmit,
  createMutation,
  updateMutation,
  unitOptions,
  budgetNatureOptions
}: {
  isOpen: boolean;
  onClose: () => void;
  editingMaterial: ConstructionMaterial | null;
  formData: MaterialFormState;
  setFormData: React.Dispatch<React.SetStateAction<MaterialFormState>>;
  onSubmit: (e: React.FormEvent) => void;
  createMutation: any;
  updateMutation: any;
  unitOptions: string[];
  budgetNatureOptions: BudgetNatureOption[];
}) {
  const [useCustomUnit, setUseCustomUnit] = useState(false);

  const unitSelectOptions = useMemo(
    () =>
      labeledToSelectOptions([
        ...unitOptions.map((unit) => ({ value: unit, label: unit })),
        { value: UNIT_OTHER_VALUE, label: 'Outra (informar manualmente)' },
      ]),
    [unitOptions]
  );

  const budgetNatureSelectOptions = useMemo(
    () =>
      labeledToSelectOptions(
        budgetNatureOptions
          .filter(
            (bn) =>
              isMaterialCadastroBudgetNature(bn.name) ||
              bn.id === formData.budgetNatureId
          )
          .map((bn) => ({
            value: bn.id,
            label: formatBudgetNatureLabel(bn),
          }))
      ),
    [budgetNatureOptions, formData.budgetNatureId]
  );

  useEffect(() => {
    if (!isOpen) return;
    const unit = formData.unit.trim();
    if (!unit) {
      setUseCustomUnit(false);
      return;
    }
    setUseCustomUnit(!unitOptions.includes(unit));
  }, [isOpen, editingMaterial?.id, formData.unit, unitOptions]);

  const selectFieldClass =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingMaterial ? 'Editar cadastro' : 'Novo cadastro'}
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {editingMaterial ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-900/40">
            <p className="text-xs text-gray-500 dark:text-gray-400">ID</p>
            <p className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
              {formatCadastroListId(editingMaterial.code)}
            </p>
          </div>
        ) : null}

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Nome *
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Ex: Cimento Portland"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Tipo do Produto *
          </label>
          <div className="flex gap-2">
            {PRODUCT_TYPES.map((tipo) => (
              <ButtonSeg
                key={tipo}
                active={formData.productType === tipo}
                onClick={() => setFormData({ ...formData, productType: tipo })}
                label={tipo}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Descrição do Produto
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Detalhes do produto ou serviço..."
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Unidade de Medida *
          </label>
          <StringSingleSelectDropdown
            value={useCustomUnit ? UNIT_OTHER_VALUE : formData.unit}
            onChange={(value) => {
              if (value === UNIT_OTHER_VALUE) {
                setUseCustomUnit(true);
                setFormData({ ...formData, unit: '' });
                return;
              }
              setUseCustomUnit(false);
              setFormData({ ...formData, unit: value });
            }}
            options={unitSelectOptions}
            placeholder="Selecione a unidade"
            emptyOptionLabel="Selecione a unidade"
            className="w-full"
          />
          {useCustomUnit ? (
            <input
              type="text"
              required
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              className={`${selectFieldClass} mt-2`}
              placeholder="Digite a unidade (ex: ton, m³/h)"
            />
          ) : null}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Natureza Orçamentária *
          </label>
          <StringSingleSelectDropdown
            value={formData.budgetNatureId}
            onChange={(budgetNatureId) => setFormData({ ...formData, budgetNatureId })}
            options={budgetNatureSelectOptions}
            placeholder="Selecione a natureza"
            emptyOptionLabel="Selecione a natureza"
            className="w-full"
          />
        </div>

        <div className="flex items-center">
          <label className="flex cursor-pointer items-center space-x-3 group">
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
                  <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : null}
              </div>
            </div>
            <span className="text-sm font-medium text-gray-700 transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-gray-100">
              Ativo
            </span>
          </label>
        </div>

        {(createMutation.isError || updateMutation.isError) && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
            <div className="flex-1">
              <p className="mb-1 text-sm font-medium text-red-700 dark:text-red-300">
                Erro ao salvar material
              </p>
              <p className="text-xs text-red-600 dark:text-red-400">
                {(createMutation.error as any)?.response?.data?.message ||
                  (updateMutation.error as any)?.response?.data?.message ||
                  (createMutation.error as any)?.message ||
                  (updateMutation.error as any)?.message ||
                  'Ocorreu um erro inesperado. Verifique os dados e tente novamente.'}
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {createMutation.isPending || updateMutation.isPending
              ? 'Salvando...'
              : editingMaterial
                ? 'Atualizar'
                : 'Criar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
