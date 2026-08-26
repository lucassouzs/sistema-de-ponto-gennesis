'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Car, Loader2, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { SpreadsheetImportModal } from '@/components/ui/SpreadsheetImportModal';
import { TableCheckbox } from '@/components/ui/Checkbox';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId,
  getCadastroListRange
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
  listTableRowClasses
} from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';
import { POLO_OPTIONS } from '@/components/suprimentos/materialDeliveryLabels';
import {
  formatPlacaDisplay,
  isValidBrazilianPlate,
  maskBrazilianPlate
} from '@/lib/brazilianVehiclePlate';
import {
  VEHICLE_IMPORT_COLUMNS,
  downloadVehicleImportTemplate,
  parseVehiclesFromFile,
} from '@/lib/vehicleImport';
import { toPersonSelectOptions } from '@/lib/personSelectOptions';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { ListPagination } from '@/components/ui/ListPagination';

type VehicleUsageType = 'FROTA' | 'PARTICULAR';

type FipeOption = {
  code: string;
  name: string;
};

type EmployeeOption = {
  id: string;
  name: string;
  cpf?: string | null;
  profilePhotoUrl?: string | null;
  costCenter: string | null;
  polo: string | null;
};

interface Vehicle {
  id: string;
  code: string;
  marcaVeic?: string | null;
  modeloVeic: string;
  placaVeic: string;
  polo?: string | null;
  contrato?: string | null;
  responsavel?: string | null;
  frotaPartic?: VehicleUsageType | null;
  isActive: boolean;
  inUse?: boolean;
  activeReservation?: {
    id: string;
    code: string | null;
    solicitante?: string | null;
    motorista?: string | null;
    dataUsoInicio?: string | null;
    dataUsoFim?: string | null;
  } | null;
}

type VehicleFormState = {
  marcaCode: string;
  marcaName: string;
  modeloCode: string;
  modeloName: string;
  placaVeic: string;
  polo: string;
  contrato: string;
  responsavel: string;
  frotaPartic: '' | VehicleUsageType;
  isActive: boolean;
};

const EMPTY_FORM: VehicleFormState = {
  marcaCode: '',
  marcaName: '',
  modeloCode: '',
  modeloName: '',
  placaVeic: '',
  polo: '',
  contrato: '',
  responsavel: '',
  frotaPartic: '',
  isActive: true
};

function normalizePoloValue(polo?: string | null): string {
  if (!polo) return '';
  const normalized = polo.trim().toUpperCase();
  if (normalized === 'DF' || normalized.includes('BRAS')) return 'DF';
  if (normalized === 'GO' || normalized.includes('GOI')) return 'GO';
  return polo;
}

function mapEmployeePoloToForm(polo: string | null): string {
  return normalizePoloValue(polo);
}

function formatFrotaPartic(value?: VehicleUsageType | null): string {
  if (value === 'FROTA') return 'Frota';
  if (value === 'PARTICULAR') return 'Particular';
  return '—';
}

function formatVehicleModel(vehicle: Pick<Vehicle, 'marcaVeic' | 'modeloVeic'>): string {
  const marca = vehicle.marcaVeic?.trim();
  const modelo = extractBaseModelName(vehicle.modeloVeic || '');
  if (marca && modelo) return `${marca} ${modelo}`;
  return modelo || marca || '—';
}

/** "02.06.01.01.011 - TJGO..." → "TJGO..." */
function formatVehicleContratoLabel(value: string | null | undefined): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '—';
  const withoutCode = trimmed.replace(/^\d+(?:\.\d+)+\s*[-–—]\s*/, '').trim();
  return withoutCode || trimmed;
}

function extractBaseModelName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] || trimmed;
}

export default function VeiculosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState<VehicleFormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);

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

  const { data: listData, isLoading } = useQuery({
    queryKey: ['vehicles', searchTerm, currentPage, itemsPerPage],
    queryFn: async () => {
      const res = await api.get('/vehicles', {
        params: {
          search: searchTerm || undefined,
          page: currentPage,
          limit: itemsPerPage
        }
      });
      return res.data;
    }
  });

  const { data: fipeBrands = [], isLoading: loadingBrands } = useQuery({
    queryKey: ['vehicles-fipe-brands'],
    queryFn: async () => {
      const res = await api.get('/vehicles/fipe/brands', { params: { type: 'cars' } });
      return (res.data?.data || []) as FipeOption[];
    },
    enabled: showForm,
    staleTime: 24 * 60 * 60 * 1000
  });

  const { data: fipeModels = [], isLoading: loadingModels } = useQuery({
    queryKey: ['vehicles-fipe-models', formData.marcaCode],
    queryFn: async () => {
      const res = await api.get(`/vehicles/fipe/brands/${formData.marcaCode}/models`, {
        params: { type: 'cars' }
      });
      return (res.data?.data || []) as FipeOption[];
    },
    enabled: showForm && Boolean(formData.marcaCode),
    staleTime: 24 * 60 * 60 * 1000
  });

  const { data: employeeOptions = [], isLoading: loadingEmployees } = useQuery<EmployeeOption[]>({
    queryKey: ['vehicles-employee-options'],
    queryFn: async () => {
      const res = await api.get('/users', {
        params: { page: 1, limit: 1000 }
      });
      const users = res.data?.data || [];
      return users
        .filter((user: any) => {
          if (!user.employee?.id) return false;
          if (user.employee.position === 'Administrador') return false;
          const name = String(user.name || '').trim();
          if (name.localeCompare('Administrador', 'pt-BR', { sensitivity: 'accent' }) === 0) {
            return false;
          }
          return true;
        })
        .map((user: any) => ({
          id: String(user.employee.id),
          name: String(user.name || '').trim(),
          cpf: user.cpf ? String(user.cpf) : null,
          profilePhotoUrl: user.profilePhotoUrl ? String(user.profilePhotoUrl) : null,
          costCenter: user.employee.costCenter ? String(user.employee.costCenter).trim() : null,
          polo: user.employee.polo ? String(user.employee.polo).trim() : null
        }))
        .filter((employee: EmployeeOption) => employee.id && employee.name)
        .sort((a: EmployeeOption, b: EmployeeOption) => a.name.localeCompare(b.name, 'pt-BR'));
    },
    enabled: showForm,
    staleTime: 10 * 60 * 1000
  });

  const vehicles = (listData?.data || []) as Vehicle[];
  const pagination = listData?.pagination || {
    page: 1,
    limit: itemsPerPage,
    total: 0,
    totalPages: 1
  };

  const selectedCount = selectedIds.size;
  const allPageSelected =
    vehicles.length > 0 && vehicles.every((vehicle) => selectedIds.has(vehicle.id));
  const somePageSelected = vehicles.some((vehicle) => selectedIds.has(vehicle.id));
  const allSearchSelected =
    pagination.total > 0 && selectedCount > 0 && selectedCount >= pagination.total;

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllPage = () => {
    setSelectedIds((prev) => {
      if (vehicles.length === 0) return prev;
      if (vehicles.every((vehicle) => prev.has(vehicle.id))) {
        const next = new Set(prev);
        vehicles.forEach((vehicle) => next.delete(vehicle.id));
        return next;
      }
      const next = new Set(prev);
      vehicles.forEach((vehicle) => next.add(vehicle.id));
      return next;
    });
  };

  const selectAllFromSearch = async () => {
    if (selectingAll || pagination.total === 0) return;
    setSelectingAll(true);
    try {
      const pageSize = 500;
      const totalPages = Math.max(1, Math.ceil(pagination.total / pageSize));
      const ids: string[] = [];
      for (let page = 1; page <= totalPages; page++) {
        const res = await api.get('/vehicles', {
          params: {
            search: searchTerm || undefined,
            page,
            limit: pageSize,
          },
        });
        const rows = (res.data?.data || []) as Vehicle[];
        for (const row of rows) ids.push(row.id);
      }
      setSelectedIds(new Set(ids));
      toast.success(`${ids.length} veículo(s) selecionado(s)`);
    } catch {
      toast.error('Não foi possível selecionar todos os veículos da busca');
    } finally {
      setSelectingAll(false);
    }
  };

  const employeeByName = useMemo(() => {
    const map = new Map<string, EmployeeOption>();
    for (const employee of employeeOptions) {
      map.set(employee.name, employee);
    }
    return map;
  }, [employeeOptions]);

  const fipeBrandOptions = useMemo<MultiSelectSearchOption[]>(
    () =>
      fipeBrands.map((brand) => ({
        value: brand.code,
        label: brand.name,
        searchText: brand.name
      })),
    [fipeBrands]
  );

  const fipeModelOptions = useMemo<MultiSelectSearchOption[]>(
    () =>
      fipeModels.map((model) => ({
        value: model.code,
        label: model.name,
        searchText: model.name
      })),
    [fipeModels]
  );

  const employeeSelectOptions = useMemo<MultiSelectSearchOption[]>(
    () =>
      toPersonSelectOptions(
        employeeOptions.map((employee) => ({
          value: employee.name,
          name: employee.name,
          cpf: employee.cpf,
          profilePhotoUrl: employee.profilePhotoUrl,
          extraSearchText: [employee.costCenter, employee.polo].filter(Boolean).join(' '),
        }))
      ),
    [employeeOptions]
  );

  const frotaParticOptions = useMemo<MultiSelectSearchOption[]>(
    () => [
      { value: 'FROTA', label: 'Frota' },
      { value: 'PARTICULAR', label: 'Particular' }
    ],
    []
  );

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
    setRowActionMenu
  } = useRowActionMenu(vehicles);

  const listRange = getCadastroListRange(
    pagination.page,
    pagination.limit,
    pagination.total
  );

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [searchTerm]);

  const modalOpen = showForm || deleteId != null || showBulkDeleteModal;

  useEffect(() => {
    if (!modalOpen) return;
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!editing || !fipeBrands.length || formData.marcaCode) return;
    const marca = editing.marcaVeic?.trim();
    if (!marca) return;
    const brand = fipeBrands.find((item) => item.name === marca);
    if (!brand) return;
    setFormData((current) => ({
      ...current,
      marcaCode: brand.code,
      marcaName: brand.name
    }));
  }, [editing, fipeBrands, formData.marcaCode]);

  useEffect(() => {
    if (!editing || !fipeModels.length || formData.modeloCode) return;
    const modelo = editing.modeloVeic?.trim();
    if (!modelo) return;
    const baseModel = extractBaseModelName(modelo);
    const model = fipeModels.find(
      (item) => item.name === modelo || item.name === baseModel || item.code === baseModel
    );
    if (!model) return;
    setFormData((current) => ({
      ...current,
      modeloCode: model.code,
      modeloName: model.name
    }));
  }, [editing, fipeModels, formData.modeloCode]);

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditing(null);
  };

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await api.post('/vehicles', body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setShowForm(false);
      resetForm();
      toast.success('Veículo cadastrado com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao cadastrar veículo')
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await api.patch(`/vehicles/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setShowForm(false);
      resetForm();
      toast.success('Veículo atualizado com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao atualizar veículo')
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/vehicles/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setDeleteId(null);
      setRowActionMenu(null);
      setSelectedIds((prev) => {
        if (!deleteId || !prev.has(deleteId)) return prev;
        const next = new Set(prev);
        next.delete(deleteId);
        return next;
      });
      toast.success('Veículo excluído com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir veículo')
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await api.post('/vehicles/delete-many', { ids }, { timeout: 120_000 });
      return Number(res.data?.data?.deleted ?? ids.length);
    },
    onSuccess: (deleted) => {
      toast.success(
        deleted === 1 ? '1 veículo excluído' : `${deleted} veículos excluídos`
      );
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setSelectedIds(new Set());
      setShowBulkDeleteModal(false);
      setRowActionMenu(null);
    },
    onError: (err: any) =>
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Erro ao excluir selecionados'
      ),
  });

  const openEdit = (vehicle: Vehicle) => {
    setEditing(vehicle);
    setFormData({
      marcaCode: '',
      marcaName: vehicle.marcaVeic || '',
      modeloCode: '',
      modeloName: extractBaseModelName(vehicle.modeloVeic),
      placaVeic: formatPlacaDisplay(vehicle.placaVeic),
      polo: normalizePoloValue(vehicle.polo),
      contrato: vehicle.contrato || '',
      responsavel: vehicle.responsavel || '',
      frotaPartic: vehicle.frotaPartic || '',
      isActive: vehicle.isActive
    });
    setShowForm(true);
  };

  const handleBrandChange = (brandCode: string) => {
    const brand = fipeBrands.find((item) => item.code === brandCode);
    setFormData((current) => ({
      ...current,
      marcaCode: brandCode,
      marcaName: brand?.name || '',
      modeloCode: '',
      modeloName: ''
    }));
  };

  const handleModelChange = (modelCode: string) => {
    const model = fipeModels.find((item) => item.code === modelCode);
    setFormData((current) => ({
      ...current,
      modeloCode: modelCode,
      modeloName: model?.name || ''
    }));
  };

  const handleResponsavelChange = (responsavel: string) => {
    const employee = employeeByName.get(responsavel);
    setFormData((current) => ({
      ...current,
      responsavel,
      contrato: employee?.costCenter || '',
      polo: employee?.polo ? mapEmployeePoloToForm(employee.polo) : current.polo
    }));
  };

  const buildPayload = () => ({
    marcaVeic: formData.marcaName.trim() || undefined,
    modeloVeic: formData.modeloName.trim(),
    placaVeic: formatPlacaDisplay(formData.placaVeic.trim()),
    polo: formData.polo.trim() || undefined,
    contrato: formData.contrato.trim() || undefined,
    responsavel: formData.responsavel.trim() || undefined,
    frota_partic: formData.frotaPartic || undefined,
    isActive: formData.isActive
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.marcaCode) {
      toast.error('Selecione a marca do veículo');
      return;
    }
    if (!formData.modeloCode) {
      toast.error('Selecione o modelo do veículo');
      return;
    }
    if (!formData.placaVeic.trim()) {
      toast.error('Informe a placa');
      return;
    }
    if (!isValidBrazilianPlate(formData.placaVeic)) {
      toast.error('Placa inválida. Use ABC-1234 (antiga) ou ABC1D23 (Mercosul).');
      return;
    }

    const payload = buildPayload();
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const isListEmpty = !isLoading && vehicles.length === 0;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/veiculos">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/veiculos">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Frota
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Gerencie os veículos da frota e particulares vinculados aos contratos
            </p>
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                    <Car className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                      Frota
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {isLoading
                        ? 'Carregando...'
                        : pagination.total === 1
                          ? '1 veículo cadastrado'
                          : `${pagination.total} veículos cadastrados`}
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
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar por modelo, placa, contrato..."
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
                    onClick={() => setShowImportModal(true)}
                    className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                  >
                    <Upload className="h-4 w-4 shrink-0" />
                    <span>Importar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      resetForm();
                      setShowForm(true);
                    }}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Novo veículo</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isLoading ? (
                <CadastroListLoading message="Carregando veículos..." />
              ) : isListEmpty ? (
                <CadastroListEmpty
                  icon={Car}
                  title="Nenhum veículo encontrado"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Cadastre um novo veículo para começar'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={listRange.startItem}
                    endItem={listRange.endItem}
                    total={pagination.total}
                    itemLabel="veículo"
                    itemLabelPlural="veículos"
                    currentPage={pagination.page}
                    totalPages={pagination.totalPages}
                  />
                  <div className="table-scroll">
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th scope="col" className="w-10 px-3 py-4 sm:px-4">
                            <TableCheckbox
                              checked={allPageSelected}
                              indeterminate={!allPageSelected && somePageSelected}
                              onChange={() => toggleSelectAllPage()}
                              onClick={(e) => e.stopPropagation()}
                              ariaLabel="Selecionar todos desta página"
                            />
                          </th>
                          <th className={cadastroListClasses.th}>ID</th>
                          <th className={cadastroListClasses.th}>Modelo</th>
                          <th className={cadastroListClasses.thCenter}>Placa</th>
                          <th className={cadastroListClasses.thCenter}>Status</th>
                          <th className={cadastroListClasses.thCenter}>Contrato</th>
                          <th className={cadastroListClasses.thCenter}>Responsável</th>
                          <th className={cadastroListClasses.thCenter}>Frota / Particular</th>
                          <th className={cadastroListClasses.thRight}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {vehicles.map((vehicle, index) => (
                          <tr key={vehicle.id} className={listTableRowClasses.tr}>
                            <td className="w-10 px-3 py-4 sm:px-4">
                              <TableCheckbox
                                checked={selectedIds.has(vehicle.id)}
                                onChange={() => toggleSelectOne(vehicle.id)}
                                onClick={(e) => e.stopPropagation()}
                                ariaLabel={`Selecionar veículo ${formatPlacaDisplay(vehicle.placaVeic)}`}
                              />
                            </td>
                            <td className={cadastroListClasses.tdMono}>
                              {formatCadastroListId(
                                vehicle.code,
                                listRange.startItem + index
                              )}
                            </td>
                            <td className={cadastroListClasses.td}>{formatVehicleModel(vehicle)}</td>
                            <td className={`${cadastroListClasses.tdMono} text-center`}>
                              {formatPlacaDisplay(vehicle.placaVeic)}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {vehicle.inUse ? (
                                <span
                                  className="inline-flex whitespace-nowrap rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-200"
                                  title={
                                    vehicle.activeReservation
                                      ? `Em uso — ${
                                          vehicle.activeReservation.motorista ||
                                          vehicle.activeReservation.solicitante ||
                                          'reserva ativa'
                                        }`
                                      : 'Em uso'
                                  }
                                >
                                  Em uso
                                </span>
                              ) : (
                                <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                                  Disponível
                                </span>
                              )}
                            </td>
                            <td className={`${cadastroListClasses.td} text-center`}>
                              {formatVehicleContratoLabel(vehicle.contrato)}
                            </td>
                            <td className={`${cadastroListClasses.td} text-center`}>
                              {vehicle.responsavel || '—'}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {formatFrotaPartic(vehicle.frotaPartic)}
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(vehicle.id)}
                              onToggle={(e) =>
                                toggleRowActionMenu(vehicle.id, e.currentTarget as HTMLButtonElement)
                              }
                            />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {allPageSelected &&
                  pagination.total > vehicles.length &&
                  !allSearchSelected ? (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                      Todos os {vehicles.length} desta página estão selecionados.{' '}
                      <button
                        type="button"
                        disabled={selectingAll}
                        onClick={() => {
                          void selectAllFromSearch();
                        }}
                        className="font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                      >
                        {selectingAll
                          ? 'Selecionando…'
                          : `Selecionar todos os ${pagination.total} da busca`}
                      </button>
                    </div>
                  ) : null}

                  <ListPagination
                    currentPage={currentPage}
                    totalPages={pagination.totalPages}
                    onPageChange={setCurrentPage}
                  />

                  {rowActionMenu && rowForActionMenu && (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      onEdit={() => openEdit(rowForActionMenu as Vehicle)}
                      onDelete={() => setDeleteId((rowForActionMenu as Vehicle).id)}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {showForm && (
            <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/50"
                aria-hidden
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
              />
              <div className="relative z-[1101] max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
                <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editing ? 'Editar veículo' : 'Novo veículo'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Marca *
                    </label>
                    <SingleSelectSearchDropdown
                      value={formData.marcaCode}
                      onChange={handleBrandChange}
                      options={fipeBrandOptions}
                      disabled={loadingBrands}
                      allowEmpty={false}
                      placeholder={
                        loadingBrands ? 'Carregando marcas...' : 'Selecionar marca...'
                      }
                      searchPlaceholder="Pesquisar marca..."
                      emptyOptionsMessage="Nenhuma marca disponível."
                      noFocusRing
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Modelo *
                    </label>
                    <SingleSelectSearchDropdown
                      value={formData.modeloCode}
                      onChange={handleModelChange}
                      options={fipeModelOptions}
                      disabled={!formData.marcaCode || loadingModels}
                      allowEmpty={false}
                      placeholder={
                        !formData.marcaCode
                          ? 'Selecione a marca primeiro'
                          : loadingModels
                            ? 'Carregando modelos...'
                            : 'Selecionar modelo...'
                      }
                      searchPlaceholder="Pesquisar modelo..."
                      emptyOptionsMessage={
                        !formData.marcaCode
                          ? 'Selecione a marca primeiro.'
                          : 'Nenhum modelo disponível.'
                      }
                      noFocusRing
                    />
                    {loadingModels ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Consultando tabela FIPE...
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Placa *
                    </label>
                    <input
                      type="text"
                      value={formData.placaVeic}
                      onChange={(e) =>
                        setFormData((f) => ({
                          ...f,
                          placaVeic: maskBrazilianPlate(e.target.value)
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 uppercase placeholder:normal-case dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      placeholder="Escreva a placa do veículo"
                      maxLength={8}
                      inputMode="text"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Polo
                    </label>
                    <div className="flex gap-2">
                      {POLO_OPTIONS.map((option) => (
                        <ButtonSeg
                          key={option.value}
                          active={formData.polo === option.value}
                          onClick={() =>
                            setFormData((current) => ({ ...current, polo: option.value }))
                          }
                          label={option.label}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Contrato
                    </label>
                    <input
                      type="text"
                      value={formData.contrato}
                      onChange={(e) =>
                        setFormData((current) => ({ ...current, contrato: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      placeholder="Ex.: TJGO - RETROFIT LT5"
                      autoComplete="off"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Preenchido automaticamente pelo responsável, se houver centro de custo.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Responsável
                    </label>
                    <SingleSelectSearchDropdown
                      value={formData.responsavel}
                      onChange={handleResponsavelChange}
                      options={employeeSelectOptions}
                      disabled={loadingEmployees}
                      placeholder={
                        loadingEmployees
                          ? 'Carregando funcionários...'
                          : 'Selecionar responsável...'
                      }
                      searchPlaceholder="Pesquisar..."
                      emptyOptionsMessage="Nenhum funcionário disponível."
                      noFocusRing
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Frota / Particular
                    </label>
                    <SingleSelectSearchDropdown
                      value={formData.frotaPartic}
                      onChange={(frotaPartic) =>
                        setFormData((current) => ({
                          ...current,
                          frotaPartic: frotaPartic as '' | VehicleUsageType
                        }))
                      }
                      options={frotaParticOptions}
                      placeholder="Selecionar..."
                      searchPlaceholder="Pesquisar..."
                      noFocusRing
                    />
                  </div>

                  <label className="group flex cursor-pointer items-center space-x-3">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => setFormData((f) => ({ ...f, isActive: e.target.checked }))}
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
                            aria-hidden
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

                  <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        resetForm();
                      }}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {isSaving ? 'Salvando...' : editing ? 'Salvar' : 'Cadastrar'}
                    </button>
                  </div>
                </form>
              </div>
            </AppModalOverlay>
          )}

          {deleteId && (
            <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/50"
                aria-hidden
                onClick={() => setDeleteId(null)}
              />
              <div className="relative z-[1101] w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Excluir veículo
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Tem certeza que deseja excluir este veículo? Esta ação não pode ser desfeita.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteId(null)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(deleteId)}
                    disabled={deleteMutation.isPending}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                  </button>
                </div>
              </div>
            </AppModalOverlay>
          )}

          {showBulkDeleteModal && (
            <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/50"
                aria-hidden
                onClick={() =>
                  !bulkDeleteMutation.isPending && setShowBulkDeleteModal(false)
                }
              />
              <div className="relative z-[1101] w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Excluir selecionados
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Tem certeza que deseja excluir{' '}
                  <strong>{selectedCount}</strong> veículo(s) selecionado(s)? Esta ação não
                  pode ser desfeita.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={bulkDeleteMutation.isPending}
                    onClick={() => setShowBulkDeleteModal(false)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={bulkDeleteMutation.isPending || selectedCount === 0}
                    onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {bulkDeleteMutation.isPending
                      ? 'Excluindo...'
                      : `Excluir ${selectedCount}`}
                  </button>
                </div>
              </div>
            </AppModalOverlay>
          )}

          <SpreadsheetImportModal
            isOpen={showImportModal}
            onClose={() => setShowImportModal(false)}
            title="Importar veículos"
            templateHint="Marca/modelo e contrato são associados automaticamente (FIPE + cadastros). Pode enviar nomes abreviados ou bagunçados — o sistema tenta corrigir."
            columns={VEHICLE_IMPORT_COLUMNS}
            bodyKey="vehicles"
            importPath="/vehicles/import"
            batchSize={25}
            requestTimeoutMs={180_000}
            downloadTemplate={downloadVehicleImportTemplate}
            parseFile={async (file) => {
              const report = await parseVehiclesFromFile(file);
              return {
                items: report.vehicles,
                skipped: report.skipped,
                totalRows: report.totalRows,
              };
            }}
            onImported={() => {
              void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
            }}
          />
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
