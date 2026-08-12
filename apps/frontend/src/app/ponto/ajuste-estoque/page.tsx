'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  ChevronDown,
  ChevronUp,
  Filter,
  History,
  MoreVertical,
  RotateCcw,
  Search,
  Upload,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { getListTableRowClassName, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { ConstructionMaterialSearchDropdown } from '@/components/suprimentos/ConstructionMaterialSearchDropdown';
import {
  fetchAllConstructionMaterials,
  type ConstructionMaterialListItem,
} from '@/lib/fetchAllConstructionMaterials';
import { SpreadsheetImportModal } from '@/components/ui/SpreadsheetImportModal';
import {
  STOCK_ADJUSTMENT_IMPORT_COLUMNS,
  downloadStockAdjustmentImportTemplate,
  parseStockAdjustmentsFromFile,
} from '@/lib/stockAdjustmentImport';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { resolveLockedUnbCostCenterId } from '@/lib/unbBranding';

interface Material {
  id: string;
  name: string;
  unit: string;
}

interface MovementFormData {
  materialId: string;
  costCenterId: string;
  type: 'IN' | 'OUT' | '';
  quantity: string;
  notes: string;
}

interface MovementPayload {
  materialId: string;
  costCenterId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  notes: string;
}

interface StockMovement {
  id: string;
  material: Material;
  costCenter?: { id?: string; code: string; name: string } | null;
  type: 'IN' | 'OUT';
  quantity: number;
  notes?: string | null;
  user: { name: string };
  createdAt: string;
}

const ADJUSTMENT_MARKER = '[AJUSTE_ESTOQUE]';

const HISTORY_TYPE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'ALL', label: 'Todos' },
  { value: 'IN', label: 'Entrada' },
  { value: 'OUT', label: 'Saída' },
]);

const HISTORY_MONTH_FILTER_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos' },
  ...Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return {
      value: String(month),
      label: new Date(0, i).toLocaleString('pt-BR', { month: 'long' }),
    };
  }),
]);
const HISTORY_ITEMS_PER_PAGE = 12;

const cleanAdjustmentNotes = (notes?: string | null) =>
  (notes || '').replace(ADJUSTMENT_MARKER, '').trim();

function MovementSegButton({
  active,
  onClick,
  label,
  icon: Icon,
  variant
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: 'in' | 'out';
}) {
  const activeCls =
    variant === 'in'
      ? 'border-green-600 bg-green-50 text-green-800 dark:border-green-500 dark:bg-green-950/40 dark:text-green-200'
      : 'border-red-600 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200';
  const inactiveCls =
    'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${
        active ? activeCls : inactiveCls
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

const quantityInputClass =
  'min-w-0 flex-1 bg-transparent px-3 text-sm text-gray-900 tabular-nums outline-none dark:text-gray-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]';

function parseAdjustmentQuantity(value: string): number {
  const parsed = parseFloat(value.replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAdjustmentQuantity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

function AdjustmentQuantityInput({
  value,
  onChange,
  unit,
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  unit: string;
  required?: boolean;
}) {
  const stepBtnClass =
    'flex flex-1 items-center justify-center text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200';

  const bump = (delta: number) => {
    const current = parseAdjustmentQuantity(value);
    const base = current > 0 ? current : 0;
    const next = Math.max(0, base + delta);
    onChange(formatAdjustmentQuantity(next));
  };

  return (
    <div className="flex h-10 overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
      <input
        type="text"
        required={required}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex.: 10,5"
        className={quantityInputClass}
      />
      <span className="flex shrink-0 items-center border-l border-gray-300 px-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-600 dark:text-gray-400">
        {unit?.trim() || '—'}
      </span>
      <div className="flex w-8 shrink-0 flex-col border-l border-gray-300 dark:border-gray-600">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Aumentar quantidade"
          onClick={() => bump(1)}
          className={`${stepBtnClass} border-b border-gray-300 dark:border-gray-600`}
        >
          <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Diminuir quantidade"
          onClick={() => bump(-1)}
          className={stepBtnClass}
        >
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

const emptyForm = (lockedCostCenterId = ''): MovementFormData => ({
  materialId: '',
  costCenterId: lockedCostCenterId,
  type: '',
  quantity: '',
  notes: ''
});

export default function AjusteEstoquePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isUnbUser, unbCostCenterIds } = usePermissions();
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [templateMaterialMode, setTemplateMaterialMode] = useState<'all' | 'selected'>('all');
  const [templateMaterials, setTemplateMaterials] = useState<
    Array<{ id: string; name: string }>
  >([]);

  const [formData, setFormData] = useState<MovementFormData>(emptyForm());
  const [selectedMaterial, setSelectedMaterial] = useState<ConstructionMaterialListItem | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [filtersCostCenterId, setFiltersCostCenterId] = useState('');
  const [filtersMonth, setFiltersMonth] = useState('');
  const [filtersYear, setFiltersYear] = useState(String(new Date().getFullYear()));
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [isHistoryFiltersModalOpen, setIsHistoryFiltersModalOpen] = useState(false);
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [historyDetail, setHistoryDetail] = useState<StockMovement | null>(null);

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

  const { data: costCentersData, isLoading: loadingCostCenters } = useQuery({
    queryKey: ['cost-centers', 'adjustment-page'],
    queryFn: async () => {
      const res = await api.get('/cost-centers', {
        params: { page: 1, limit: 2000, isActive: 'true' },
      });
      return res.data;
    },
  });

  const costCenters = Array.isArray(costCentersData?.data)
    ? costCentersData.data
    : Array.isArray(costCentersData)
      ? costCentersData
      : [];

  const lockedUnbCostCenterId = useMemo(() => {
    if (!isUnbUser) return null;
    return resolveLockedUnbCostCenterId(costCenters, unbCostCenterIds);
  }, [isUnbUser, costCenters, unbCostCenterIds]);

  useEffect(() => {
    if (!lockedUnbCostCenterId) return;
    setFiltersCostCenterId(lockedUnbCostCenterId);
  }, [lockedUnbCostCenterId]);

  const { data: movementsData, isLoading: loadingMovements } = useQuery({
    queryKey: ['stock-adjustment-movements'],
    queryFn: async () => {
      const res = await api.get('/stock/movements', { params: { limit: 500 } });
      return res.data;
    }
  });

  const { data: importMaterials = [] } = useQuery({
    queryKey: ['construction-materials', 'ajuste-import'],
    queryFn: () => fetchAllConstructionMaterials(),
    enabled: isImportModalOpen,
    staleTime: 5 * 60 * 1000,
  });

  const closeAdjustmentModal = useCallback(() => {
    setIsAdjustmentModalOpen(false);
    setFormData(emptyForm(lockedUnbCostCenterId || ''));
    setSelectedMaterial(null);
  }, [lockedUnbCostCenterId]);

  const { requestClose: requestCloseAdjustmentModal, confirmUi: adjustmentModalConfirmUi } =
    useModalCloseConfirm(closeAdjustmentModal, { isParentOpen: isAdjustmentModalOpen });

  const closeHistoryDetail = useCallback(() => {
    setHistoryDetail(null);
  }, []);

  const { requestClose: requestCloseHistoryDetail, confirmUi: historyDetailConfirmUi } =
    useModalCloseConfirm(closeHistoryDetail, { isParentOpen: !!historyDetail });

  const createMovementMutation = useMutation({
    mutationFn: async (data: MovementPayload) => {
      const res = await api.post('/stock/movements', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['stock-adjustment-movements'] });
      closeAdjustmentModal();
      toast.success('Ajuste de estoque registrado com sucesso!');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) => {
      const msg = error?.response?.data?.message || error?.message || 'Erro ao registrar ajuste de estoque';
      toast.error(msg);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedQuantity = parseFloat(formData.quantity.replace(',', '.'));

    if (
      !formData.type ||
      !formData.materialId ||
      Number.isNaN(parsedQuantity) ||
      parsedQuantity <= 0
    ) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    createMovementMutation.mutate({
      materialId: formData.materialId,
      costCenterId: formData.costCenterId,
      type: formData.type,
      quantity: parsedQuantity,
      notes: [ADJUSTMENT_MARKER, formData.notes.trim()].filter(Boolean).join('\n')
    });
  };

  const costCenterOptions = useMemo(() => {
    const mapped = costCenters.map((cc: { id: string; name: string }) => ({
      value: cc.id,
      label: cc.name,
    }));
    if (!lockedUnbCostCenterId) return mapped;
    return mapped.filter((opt: { value: string }) => opt.value === lockedUnbCostCenterId);
  }, [costCenters, lockedUnbCostCenterId]);

  const costCenterFilterOptions = useMemo(() => {
    if (lockedUnbCostCenterId) {
      return costCenterOptions;
    }
    return [
      { value: '', label: 'Todos', searchText: 'Todos' },
      ...costCenterOptions,
    ];
  }, [costCenterOptions, lockedUnbCostCenterId]);

  const historyYearFilterOptions = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => ({
        value: String(year),
        label: String(year),
      })),
    []
  );

  const selectedUnit = selectedMaterial?.unit || '—';
  const movements: StockMovement[] = movementsData?.data || [];

  const adjustmentMovements = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    return movements
      .filter((mov) => mov.notes?.includes(ADJUSTMENT_MARKER))
      .filter((mov) => {
        if (typeFilter !== 'ALL' && mov.type !== typeFilter) return false;
        if (filtersCostCenterId && mov.costCenter?.id !== filtersCostCenterId) return false;
        if (filtersMonth) {
          const month = new Date(mov.createdAt).getMonth() + 1;
          if (month !== Number(filtersMonth)) return false;
        }
        if (filtersYear) {
          const year = new Date(mov.createdAt).getFullYear();
          if (year !== Number(filtersYear)) return false;
        }
        if (!term) return true;
        const material = mov.material.name.toLowerCase();
        const user = mov.user.name.toLowerCase();
        const cc = (mov.costCenter?.name || '').toLowerCase();
        const notes = cleanAdjustmentNotes(mov.notes).toLowerCase();
        return material.includes(term) || user.includes(term) || cc.includes(term) || notes.includes(term);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [movements, historySearch, typeFilter, filtersCostCenterId, filtersMonth, filtersYear]);

  const historyTotal = adjustmentMovements.length;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_ITEMS_PER_PAGE));
  const historyStartIndex = (historyCurrentPage - 1) * HISTORY_ITEMS_PER_PAGE;
  const historyEndIndex = historyStartIndex + HISTORY_ITEMS_PER_PAGE;
  const paginatedAdjustments = adjustmentMovements.slice(historyStartIndex, historyEndIndex);
  const historyStartItem = historyTotal === 0 ? 0 : historyStartIndex + 1;
  const historyEndItem = Math.min(historyEndIndex, historyTotal);

  const clearHistoryFilters = () => {
    setFiltersCostCenterId(lockedUnbCostCenterId || '');
    setFiltersMonth('');
    setFiltersYear(String(new Date().getFullYear()));
    setTypeFilter('ALL');
    setHistorySearch('');
    setHistoryCurrentPage(1);
  };

  useEffect(() => {
    setHistoryCurrentPage(1);
  }, [historySearch, filtersCostCenterId, filtersMonth, filtersYear, typeFilter]);

  useEffect(() => {
    if (historyCurrentPage > historyTotalPages) {
      setHistoryCurrentPage(historyTotalPages);
    }
  }, [historyCurrentPage, historyTotalPages]);

  useEffect(() => {
    if (!historyDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseHistoryDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [historyDetail, requestCloseHistoryDetail]);

  useEffect(() => {
    if (!isAdjustmentModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseAdjustmentModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAdjustmentModalOpen, requestCloseAdjustmentModal]);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/ajuste-estoque">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Ajuste de Estoque</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Registre entradas e saídas para ajuste de saldo
            </p>
          </div>

          <Card className="w-full">
              <CardHeader className="border-b-0 pb-1">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <History className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Histórico de Ajustes
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Consulte ajustes de entrada e saída registrados no estoque
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        type="text"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Pesquisar material, usuário..."
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                      {historySearch && (
                        <button
                          type="button"
                          onClick={() => setHistorySearch('')}
                          aria-label="Limpar busca"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsHistoryFiltersModalOpen(true)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      aria-label="Abrir filtro"
                      title="Filtro"
                    >
                      <Filter className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsImportModalOpen(true)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      aria-label="Importar"
                      title="Importar"
                    >
                      <Upload className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(emptyForm(lockedUnbCostCenterId || ''));
                        setIsAdjustmentModalOpen(true);
                      }}
                      className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <ArrowLeftRight className="h-4 w-4 shrink-0" />
                      <span>Novo Ajuste</span>
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingMovements ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 dark:text-gray-400">Carregando histórico...</p>
                  </div>
                ) : historyTotal === 0 ? (
                  <div className="text-center py-8">
                    <History className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">Nenhum ajuste encontrado</p>
                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                      Registre um novo ajuste ou altere os filtros
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                      <span>
                        Mostrando {historyStartItem} a {historyEndItem} de {historyTotal} ajustes
                      </span>
                      <span>
                        Página {historyCurrentPage} de {historyTotalPages}
                      </span>
                    </div>
                    <div className="table-scroll">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Material
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Data
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Movimento
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Quantidade
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Contrato
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Registrado por
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Ação
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {paginatedAdjustments.map((mov) => (
                            <tr
                              key={mov.id}
                              onClick={() => setHistoryDetail(mov)}
                              className={getListTableRowClassName(true)}
                            >
                              <td className="px-3 sm:px-6 py-3 text-left text-sm">
                                <ListRowNavigableLabel className="font-medium">{mov.material.name}</ListRowNavigableLabel>
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-center text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                {new Date(mov.createdAt).toLocaleString('pt-BR')}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-center">
                                <span
                                  className={`inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                                    mov.type === 'IN'
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                  }`}
                                >
                                  {mov.type === 'IN' ? (
                                    <ArrowDownCircle className="h-3.5 w-3.5 shrink-0" />
                                  ) : (
                                    <ArrowUpCircle className="h-3.5 w-3.5 shrink-0" />
                                  )}
                                  {mov.type === 'IN' ? 'Entrada' : 'Saída'}
                                </span>
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                {mov.quantity.toLocaleString('pt-BR')} {mov.material.unit}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
                                {mov.costCenter?.name || '—'}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
                                {mov.user.name}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() => setHistoryDetail(mov)}
                                    className={rowActionMenuButtonClass(false)}
                                    aria-label="Ver detalhes"
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {historyTotalPages > 1 && (
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setHistoryCurrentPage((prev) => Math.max(prev - 1, 1))}
                          disabled={historyCurrentPage === 1}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setHistoryCurrentPage((prev) => Math.min(prev + 1, historyTotalPages))
                          }
                          disabled={historyCurrentPage === historyTotalPages}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Próxima
                        </button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>

              {isHistoryFiltersModalOpen && (
                <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black/40"
                    onClick={() => setIsHistoryFiltersModalOpen(false)}
                  />
                  <div className="relative mx-4 w-full max-w-2xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
                    <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
                      <button
                        type="button"
                        onClick={() => setIsHistoryFiltersModalOpen(false)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                        aria-label="Fechar filtros"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="px-5 py-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Centro de Custo
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersCostCenterId}
                            onChange={setFiltersCostCenterId}
                            options={costCenterFilterOptions}
                            allowEmpty={false}
                            disabled={Boolean(lockedUnbCostCenterId)}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Movimento
                          </label>
                          <StringSingleSelectDropdown
                            value={typeFilter}
                            onChange={(v) => setTypeFilter(v as typeof typeFilter)}
                            options={HISTORY_TYPE_FILTER_OPTIONS}
                            allowEmpty={false}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Mês
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersMonth}
                            onChange={setFiltersMonth}
                            options={HISTORY_MONTH_FILTER_OPTIONS}
                            allowEmpty={false}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Ano
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersYear}
                            onChange={setFiltersYear}
                            options={historyYearFilterOptions}
                            allowEmpty={false}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={clearHistoryFilters}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Limpar filtros
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsHistoryFiltersModalOpen(false)}
                        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Card>

          {isAdjustmentModalOpen && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={requestCloseAdjustmentModal} aria-hidden />
              <div
                className="relative flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
                role="dialog"
                aria-modal="true"
                aria-labelledby="adjustment-modal-title"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                  <h3
                    id="adjustment-modal-title"
                    className="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Nova Movimentação de Ajuste
                  </h3>
                  <button
                    type="button"
                    onClick={requestCloseAdjustmentModal}
                    className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-0 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    aria-label="Fechar"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="overflow-y-auto px-5 py-4 [&_*:focus]:outline-none [&_*:focus]:ring-0 [&_*:focus-visible]:outline-none [&_*:focus-visible]:ring-0">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Movimento *
                    </label>
                    <div className="flex gap-2">
                      <MovementSegButton
                        active={formData.type === 'IN'}
                        variant="in"
                        icon={ArrowDownCircle}
                        onClick={() => setFormData((prev) => ({ ...prev, type: 'IN' }))}
                        label="Entrada"
                      />
                      <MovementSegButton
                        active={formData.type === 'OUT'}
                        variant="out"
                        icon={ArrowUpCircle}
                        onClick={() => setFormData((prev) => ({ ...prev, type: 'OUT' }))}
                        label="Saída"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Material *
                    </label>
                    <ConstructionMaterialSearchDropdown
                      value={formData.materialId}
                      selectedLabel={selectedMaterial?.name}
                      onChange={(materialId, material) => {
                        setFormData((prev) => ({ ...prev, materialId }));
                        setSelectedMaterial(material);
                      }}
                      placeholder="Digite para buscar material..."
                      noFocusRing
                    />
                  </div>

                  <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                    <div className="min-w-0">
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Quantidade *
                      </label>
                      <AdjustmentQuantityInput
                        required
                        value={formData.quantity}
                        onChange={(quantity) => setFormData((prev) => ({ ...prev, quantity }))}
                        unit={selectedUnit}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Centro de Custo
                      </label>
                      <SingleSelectSearchDropdown
                        value={formData.costCenterId}
                        onChange={(costCenterId) =>
                          setFormData((prev) => ({ ...prev, costCenterId }))
                        }
                        options={costCenterOptions}
                        disabled={Boolean(lockedUnbCostCenterId) || loadingCostCenters}
                        allowEmpty={!lockedUnbCostCenterId}
                        emptyOptionLabel="Não especificado"
                        placeholder={
                          loadingCostCenters
                            ? 'Carregando centros de custo...'
                            : 'Selecionar centro de custo...'
                        }
                        emptyOptionsMessage="Nenhum centro de custo cadastrado."
                        noFocusRing
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Observações
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Observações sobre o ajuste..."
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={requestCloseAdjustmentModal}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={createMovementMutation.isPending}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {createMovementMutation.isPending ? 'Registrando...' : 'Registrar Ajuste'}
                    </button>
                  </div>
                </form>
                </div>
              </div>
            </div>
          )}

          {historyDetail && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={requestCloseHistoryDetail} aria-hidden />
              <div className="relative z-10 w-full max-w-lg max-h-[min(90vh,32rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 pr-2">
                    Detalhe do ajuste
                  </h2>
                  <button
                    type="button"
                    onClick={requestCloseHistoryDetail}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 space-y-3 text-sm text-gray-800 dark:text-gray-200">
                  <p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">Material</span>
                    <span className="font-medium">{historyDetail.material.name}</span>
                  </p>
                  <p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">Movimento</span>
                    <span>
                      {historyDetail.type === 'IN' ? 'Entrada' : 'Saída'} —{' '}
                      {historyDetail.quantity.toLocaleString('pt-BR')} {historyDetail.material.unit}
                    </span>
                  </p>
                  {historyDetail.costCenter && (
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Contrato</span>
                      <span>{historyDetail.costCenter.name}</span>
                    </p>
                  )}
                  {cleanAdjustmentNotes(historyDetail.notes) && (
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Observações</span>
                      <span className="whitespace-pre-line">{cleanAdjustmentNotes(historyDetail.notes)}</span>
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(historyDetail.createdAt).toLocaleString('pt-BR')} — {historyDetail.user.name}
                  </p>
                </div>
              </div>
            </div>
          )}

          {adjustmentModalConfirmUi}
          {historyDetailConfirmUi}

          <SpreadsheetImportModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            title="Importar ajustes de estoque"
            templateHint="Baixe o modelo com os materiais já nas linhas. Preencha movimento, quantidade e contrato só nos itens que quiser importar — o resto é ignorado."
            columns={STOCK_ADJUSTMENT_IMPORT_COLUMNS}
            bodyKey="adjustments"
            importPath="/stock/adjustments/import"
            downloadTemplate={() => {
              if (templateMaterialMode === 'selected' && templateMaterials.length === 0) {
                toast.error('Selecione os itens do modelo ou escolha Todos.');
                return;
              }
              const names =
                templateMaterialMode === 'all'
                  ? importMaterials.map((m) => m.name)
                  : templateMaterials.map((m) => m.name);
              downloadStockAdjustmentImportTemplate(names);
            }}
            parseFile={async (file) => {
              const report = await parseStockAdjustmentsFromFile(file);
              return {
                items: report.items,
                skipped: report.skipped,
                totalRows: report.totalRows,
              };
            }}
            onImported={() => {
              void queryClient.invalidateQueries({ queryKey: ['stock-adjustment-movements'] });
              void queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
              void queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
            }}
            templateExtra={
              <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Itens no modelo
                </p>
                <div className="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
                  <button
                    type="button"
                    onClick={() => setTemplateMaterialMode('all')}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      templateMaterialMode === 'all'
                        ? 'bg-white font-medium text-red-600 shadow-sm dark:bg-gray-600 dark:text-red-400'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateMaterialMode('selected')}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      templateMaterialMode === 'selected'
                        ? 'bg-white font-medium text-red-600 shadow-sm dark:bg-gray-600 dark:text-red-400'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                    }`}
                  >
                    Escolher itens
                  </button>
                </div>
                {templateMaterialMode === 'selected' && (
                  <div className="space-y-2">
                    <ConstructionMaterialSearchDropdown
                      value=""
                      stayOpenOnSelect
                      selectedIds={templateMaterials.map((m) => m.id)}
                      onChange={(_id, material) => {
                        setTemplateMaterials((prev) =>
                          prev.some((m) => m.id === material.id)
                            ? prev.filter((m) => m.id !== material.id)
                            : [...prev, { id: material.id, name: material.name }],
                        );
                      }}
                      placeholder="Digite para buscar material..."
                      noFocusRing
                    />
                    {templateMaterials.length > 0 && (
                      <>
                        <ul className="flex flex-wrap gap-1.5">
                          {templateMaterials.map((m) => (
                            <li
                              key={m.id}
                              className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-200 bg-white py-1 pl-2.5 pr-1 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                            >
                              <span className="min-w-0 truncate">{m.name}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setTemplateMaterials((prev) => prev.filter((x) => x.id !== m.id))
                                }
                                className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                                aria-label={`Remover ${m.name}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() => setTemplateMaterials([])}
                          className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Tirar todos
                        </button>
                      </>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {templateMaterialMode === 'all'
                    ? `${importMaterials.length} material(is) vão no modelo.`
                    : `${templateMaterials.length} material(is) selecionado(s).`}
                </p>
              </div>
            }
          />
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
