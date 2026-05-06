'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  Plus,
  Trash2,
  Search,
  X,
  AlertCircle,
  Shield,
  MoreVertical,
  Eye,
  Pencil,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import {
  UserPermissionsEditor,
  UserPermissionsTabBar,
  type PermissionEditorTab,
  type PermissionsTargetPreview,
} from '@/components/permissions/UserPermissionsEditor';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useCostCenters } from '@/hooks/useCostCenters';
import { usePermissions } from '@/hooks/usePermissions';
import { PERMISSION_ACCESS_ACTION, pathToModuleKey } from '@sistema-ponto/permission-modules';

interface CostCenter {
  id: string;
  code?: string;
  name?: string;
  label?: string;
}

interface Contract {
  id: string;
  name: string;
  number: string;
  startDate: string;
  endDate: string;
  costCenterId: string;
  costCenter?: { id: string; code: string; name: string };
  valuePlusAddenda: number;
}

type ContractPermissionUser = {
  id: string;
  name: string;
  cpf?: string;
  email: string;
  employee?: { position?: string; department?: string };
  hasContractsModule: boolean;
  hasContractAccess: boolean;
};

type UserPermissionPayload = {
  user: { id: string; name: string; email: string; employee?: { position?: string | null } };
  isAdmin: boolean;
  permissions: Array<{ module: string; action: string }>;
  allowedContractIds: string[];
};

const CONTRACT_ACTION_MENU_WIDTH_PX = 224; // w-56

const pk = pathToModuleKey;
const CONTRACTS_MODULE_KEY = pathToModuleKey('/ponto/contratos');

function formatDate(dateStr: string) {
  if (!dateStr) return '-';
  const raw = String(dateStr).trim();
  const only = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = only
    ? new Date(Number(only[1]), Number(only[2]) - 1, Number(only[3]), 12, 0, 0, 0)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

function formatCurrencyInput(value: number | string): string {
  if (value === '' || value === null || value === undefined) return '';
  const num = typeof value === 'string' ? parseFloat(value.replace(/\./g, '').replace(',', '.')) : value;
  if (isNaN(num)) return '';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseCurrencyInput(value: string): number {
  if (!value || typeof value !== 'string') return 0;
  const cleaned = value.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function getYearsBetween(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const startMatch = String(startDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const endMatch = String(endDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const start = startMatch
    ? new Date(`${startMatch[1]}-${startMatch[2]}-${startMatch[3]}T12:00:00`)
    : new Date(startDate);
  const end = endMatch
    ? new Date(`${endMatch[1]}-${endMatch[2]}-${endMatch[3]}T12:00:00`)
    : new Date(endDate);
  if (end <= start) return 0;
  // Conta anos completos de vigência (ex: 01/03/2026 a 01/03/2028 = 2 anos)
  const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.max(1, Math.floor(diffMonths / 12));
}

function getValorMaisAditivosAnual(valuePlusAddenda: number, startDate: string, endDate: string): number | null {
  const years = getYearsBetween(startDate, endDate);
  if (years <= 0) return null;
  return valuePlusAddenda / years;
}

function ContractAccessCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={`inline-flex select-none items-center gap-2.5 ${disabled ? 'cursor-not-allowed opacity-50' : 'group cursor-pointer'}`}>
      <div className="relative shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => !disabled && onChange(e.target.checked)}
        />
        <div
          className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors duration-150 ${
            checked
              ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
              : 'border-gray-300 bg-white dark:border-gray-500 dark:bg-gray-800 group-hover:border-gray-400 dark:group-hover:border-gray-400'
          }`}
        >
          {checked && (
            <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <span className={`min-w-[1.75rem] text-sm font-medium tabular-nums ${checked ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
        {checked ? 'Sim' : 'Não'}
      </span>
    </label>
  );
}

export default function ContratosPage() {
  const router = useRouter();
  const { isAdministrator, can, canAction } = usePermissions();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [contractActionMenu, setContractActionMenu] = useState<{
    contractId: string;
    top: number;
    left: number;
  } | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    number: '',
    startDate: '',
    endDate: '',
    costCenterId: '',
    valuePlusAddenda: ''
  });
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [permissionsContract, setPermissionsContract] = useState<Contract | null>(null);
  const [permissionsTarget, setPermissionsTarget] = useState<PermissionsTargetPreview | null>(null);
  const [permissionTab, setPermissionTab] = useState<PermissionEditorTab>('gerais');
  const [showContractsTab, setShowContractsTab] = useState(false);
  const [contractUsersSearch, setContractUsersSearch] = useState('');

  const closePermissionsEditor = () => {
    setPermissionsTarget(null);
    setPermissionTab('gerais');
    setShowContractsTab(false);
  };
  const canCreateContrato = isAdministrator || canAction(pk('/ponto/contratos'), 'criar');
  const canEditContrato = isAdministrator || canAction(pk('/ponto/contratos'), 'editar');
  const canDeleteContrato = isAdministrator || canAction(pk('/ponto/contratos'), 'excluir');
  const canManageUserPermissions =
    isAdministrator ||
    can(pk('/ponto/controle/alterar-permissoes')) ||
    canAction(pk('/ponto/controle/alterar-permissoes'), 'ver');
  const canManageContrato = canEditContrato || canDeleteContrato;
  const showActionsColumn = canManageContrato || canManageUserPermissions;

  const { costCenters, isLoading: loadingCostCenters } = useCostCenters();
  const costCentersList = (Array.isArray(costCenters) ? costCenters : []) as CostCenter[];

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

  const { data: contractsData, isLoading: loadingContracts } = useQuery({
    queryKey: ['contracts', searchTerm],
    queryFn: async () => {
      const res = await api.get('/contracts', {
        params: { search: searchTerm || undefined, limit: 100 }
      });
      return res.data;
    }
  });

  const { data: contractUsers = [], isLoading: loadingContractUsers } = useQuery({
    queryKey: ['permission-contract-users', permissionsContract?.id],
    queryFn: async () =>
      (await api.get('/permissions/contract-users', { params: { contractId: permissionsContract?.id } })).data
        ?.data as ContractPermissionUser[],
    enabled: !!permissionsContract?.id,
    retry: false,
  });

  const toggleContractAccessMutation = useMutation({
    mutationFn: async ({ userId, allow }: { userId: string; allow: boolean }) => {
      if (!permissionsContract?.id) return;
      const source = (await api.get(`/permissions/users/${userId}`)).data?.data as UserPermissionPayload;
      if (!source || source.isAdmin) {
        throw new Error('Usuário inválido para edição.');
      }

      const nextPermissions = Array.isArray(source.permissions) ? [...source.permissions] : [];
      const hasContractsAccess = nextPermissions.some(
        (p) => p.module === CONTRACTS_MODULE_KEY && p.action === PERMISSION_ACCESS_ACTION
      );
      if (!hasContractsAccess) {
        nextPermissions.push({ module: CONTRACTS_MODULE_KEY, action: PERMISSION_ACCESS_ACTION });
      }

      const currentIds = new Set(source.allowedContractIds || []);
      if (allow) currentIds.add(permissionsContract.id);
      else currentIds.delete(permissionsContract.id);

      await api.put(`/permissions/users/${userId}`, {
        permissions: nextPermissions,
        allowedContractIds: Array.from(currentIds),
      });
      return { userId, allow };
    },
    onSuccess: (data) => {
      if (!data) return;
      const { userId, allow } = data;
      queryClient.setQueryData(['permission-contract-users', permissionsContract?.id], (prev: unknown) => {
        if (!Array.isArray(prev)) return prev;
        return (prev as ContractPermissionUser[]).map((u) =>
          u.id === userId ? { ...u, hasContractAccess: allow, hasContractsModule: true } : u
        );
      });
      toast.success(allow ? 'Contrato liberado para o usuário.' : 'Contrato removido para o usuário.');
    },
    onError: (error: unknown) => {
      const msg =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Não foi possível atualizar acesso ao contrato.');
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/contracts', data);
      return res.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['permission-contracts-list'] });
      /** Novo contrato entra em allowedContractIds no backend; sem refetch o ProtectedRoute nega o acesso até F5. */
      await queryClient.refetchQueries({ queryKey: ['me-permissions'] });
      setShowForm(false);
      resetForm();
      toast.success('Contrato criado com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar contrato');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/contracts/${id}`, data);
      return res.data;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['permission-contracts-list'] });
      setPermissionsContract((prev) =>
        prev && prev.id === variables.id
          ? {
              ...prev,
              ...variables.data,
            }
          : prev
      );
      setShowForm(false);
      setEditingContract(null);
      resetForm();
      toast.success('Contrato atualizado com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar contrato');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/contracts/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['permission-contracts-list'] });
      setShowDeleteModal(null);
      toast.success('Contrato excluído com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao excluir contrato');
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      number: '',
      startDate: '',
      endDate: '',
      costCenterId: '',
      valuePlusAddenda: ''
    });
    setEditingContract(null);
  };

  const handleEdit = (contract: Contract) => {
    if (!canEditContrato) {
      toast.error('Você não tem permissão para editar contratos.');
      return;
    }
    setEditingContract(contract);
    setFormData({
      name: contract.name,
      number: contract.number,
      startDate: contract.startDate ? contract.startDate.split('T')[0] : '',
      endDate: contract.endDate ? contract.endDate.split('T')[0] : '',
      costCenterId: contract.costCenterId,
      valuePlusAddenda: contract.valuePlusAddenda ? formatCurrencyInput(contract.valuePlusAddenda) : ''
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingContract && !canEditContrato) {
      toast.error('Você não tem permissão para editar contratos.');
      return;
    }
    if (!editingContract && !canCreateContrato) {
      toast.error('Você não tem permissão para criar contratos.');
      return;
    }
    if (!formData.name.trim()) {
      toast.error('Nome do contrato é obrigatório');
      return;
    }
    if (!formData.number.trim()) {
      toast.error('Número do contrato é obrigatório');
      return;
    }
    if (!formData.startDate) {
      toast.error('Data de início da vigência é obrigatória');
      return;
    }
    if (!formData.endDate) {
      toast.error('Data de fim da vigência é obrigatória');
      return;
    }
    if (!formData.costCenterId) {
      toast.error('Centro de custo é obrigatório');
      return;
    }
    const parsedValue = parseCurrencyInput(formData.valuePlusAddenda);
    if (!formData.valuePlusAddenda || parsedValue === 0) {
      toast.error('Valor mais aditivos é obrigatório');
      return;
    }

    const payload = {
      name: formData.name.trim(),
      number: formData.number.trim(),
      startDate: formData.startDate,
      endDate: formData.endDate,
      costCenterId: formData.costCenterId,
      valuePlusAddenda: parsedValue
    };

    if (editingContract) {
      updateMutation.mutate({ id: editingContract.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: string) => {
    if (!canDeleteContrato) {
      toast.error('Você não tem permissão para excluir contratos.');
      return;
    }
    deleteMutation.mutate(id);
  };

  const contracts = contractsData?.data || [];
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const totalFiltered = contracts.length;
  const startItem = totalFiltered > 0 ? 1 : 0;
  const endItem = totalFiltered;

  const contractForActionMenu = contractActionMenu
    ? contracts.find((c: Contract) => c.id === contractActionMenu.contractId) || null
    : null;
  const usersWithContractsModule = useMemo(
    () => (contractUsers || []).filter((u) => u.hasContractsModule),
    [contractUsers]
  );

  const filteredContractUsers = useMemo(() => {
    const q = contractUsersSearch.trim().toLowerCase();
    if (!q) return usersWithContractsModule;
    const qDigits = q.replace(/\D/g, '');
    return usersWithContractsModule.filter((u) => {
      const name = (u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const dept = (u.employee?.department || '').toLowerCase();
      const pos = (u.employee?.position || '').toLowerCase();
      const cpfDigits = (u.cpf || '').replace(/\D/g, '');
      if (name.includes(q) || email.includes(q) || dept.includes(q) || pos.includes(q)) return true;
      if (qDigits.length >= 2 && cpfDigits.includes(qDigits)) return true;
      return false;
    });
  }, [usersWithContractsModule, contractUsersSearch]);

  useEffect(() => {
    setContractUsersSearch('');
  }, [permissionsContract?.id]);

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/contratos">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="w-full space-y-6">
          {permissionsContract ? (
            permissionsTarget ? (
              <div className="w-full space-y-6">
                <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
                  <button
                    type="button"
                    onClick={closePermissionsEditor}
                    className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  >
                    <ArrowLeft className="h-4 w-4 shrink-0" />
                    Voltar
                  </button>
                  <div className="w-full max-w-3xl px-14 text-center sm:px-20">
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                      Permissões de funcionário
                    </h1>
                    <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                      Defina o que este colaborador pode acessar no sistema
                    </p>
                  </div>
                </div>
                <UserPermissionsTabBar
                  activeTab={permissionTab}
                  onChange={setPermissionTab}
                  showContracts={showContractsTab}
                  className="w-full pb-2"
                />
                <UserPermissionsEditor
                  userId={permissionsTarget.id}
                  preview={permissionsTarget}
                  onBack={closePermissionsEditor}
                  hideTopNavigation
                  permissionTab={permissionTab}
                  onPermissionTabChange={setPermissionTab}
                  onContractsTabAvailabilityChange={setShowContractsTab}
                />
              </div>
            ) : (
              <div className="w-full space-y-6">
                <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
                  <button
                    type="button"
                    onClick={() => setPermissionsContract(null)}
                    className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  >
                    <ArrowLeft className="h-4 w-4 shrink-0" />
                    Voltar
                  </button>
                  <div className="w-full max-w-3xl px-14 text-center sm:px-20">
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                      Permissões do contrato
                    </h1>
                    <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                      Defina quais usuários podem acessar o contrato selecionado
                    </p>
                  </div>
                </div>

                <Card
                  className="relative w-full overflow-hidden border-gray-200/80 shadow-sm dark:border-gray-700/80"
                  padding="none"
                >
                  <div className="border-b border-gray-200 bg-white px-4 py-5 dark:border-gray-700 dark:bg-gray-800 sm:px-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                      <div className="flex min-w-0 items-start gap-4 sm:items-center">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-blue-500 bg-white text-sm font-bold text-blue-600 dark:border-blue-400 dark:bg-gray-800 dark:text-blue-400">
                          {permissionsContract.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {permissionsContract.name}
                          </h2>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            <span className="text-gray-700 dark:text-gray-300">
                              {usersWithContractsModule.length}{' '}
                              {usersWithContractsModule.length === 1
                                ? 'usuário com módulo de contratos'
                                : 'usuários com módulo de contratos'}
                            </span>
                            {contractUsersSearch.trim() && usersWithContractsModule.length > 0 ? (
                              <span className="text-gray-500 dark:text-gray-400">
                                {' · '}
                                {filteredContractUsers.length}{' '}
                                {filteredContractUsers.length === 1 ? 'resultado' : 'resultados'}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      <div className="flex w-full shrink-0 flex-col gap-2 sm:max-w-sm sm:flex-row sm:items-center sm:justify-end">
                        {canEditContrato && (
                          <button
                            type="button"
                            onClick={() => handleEdit(permissionsContract)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40"
                          >
                            <Pencil className="h-4 w-4" />
                            Editar contrato
                          </button>
                        )}
                        <div className="relative w-full sm:max-w-xs">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                          <input
                            type="search"
                            value={contractUsersSearch}
                            onChange={(e) => setContractUsersSearch(e.target.value)}
                            placeholder="Buscar colaborador…"
                            autoComplete="off"
                            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                            aria-label="Buscar colaborador na lista"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white px-4 pb-6 dark:bg-gray-800 sm:px-6">
                    <div className="overflow-x-auto pt-4 first:pt-4">
                      <table className="w-full min-w-[640px] table-fixed text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 align-bottom dark:border-gray-700/80">
                            <th
                              scope="col"
                              className="w-[46%] pb-3 pl-1 pr-4 text-left text-lg font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-100"
                            >
                              Usuário
                            </th>
                            <th
                              scope="col"
                              className="w-[34%] pb-3 pl-1 pr-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
                            >
                              Setor
                            </th>
                            <th
                              scope="col"
                              className="w-[20%] px-1 pb-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
                            >
                              Liberado
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                          {loadingContractUsers ? (
                            <tr>
                              <td colSpan={3} className="py-14 text-center text-sm text-gray-500 dark:text-gray-400">
                                Carregando usuários...
                              </td>
                            </tr>
                          ) : usersWithContractsModule.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="py-14 text-center text-sm text-gray-500 dark:text-gray-400">
                                Nenhum usuário com módulo de contratos disponível para este contrato.
                              </td>
                            </tr>
                          ) : filteredContractUsers.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="py-14 text-center text-sm text-gray-500 dark:text-gray-400">
                                Nenhum colaborador encontrado com essa busca. Tente nome, e-mail, setor ou CPF.
                              </td>
                            </tr>
                          ) : (
                            filteredContractUsers.map((u) => (
                              <tr
                                key={u.id}
                                onClick={() => {
                                  setShowContractsTab(false);
                                  setPermissionsTarget({
                                    id: u.id,
                                    name: u.name,
                                    email: u.email || '',
                                    position: u.employee?.position ?? undefined,
                                  });
                                  setPermissionTab('contratos');
                                }}
                                className="cursor-pointer transition-colors hover:bg-gray-50/90 dark:hover:bg-gray-700/25"
                              >
                                <td className="py-3.5 pl-1 pr-4 align-middle">
                                  <div className="text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">
                                    {u.name}
                                  </div>
                                  {u.cpf ? (
                                    <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{u.cpf}</div>
                                  ) : null}
                                </td>
                                <td className="py-3.5 pl-1 pr-4 text-sm text-gray-700 dark:text-gray-300">
                                  {u.employee?.department || '-'}
                                </td>
                                <td
                                  className="px-1 py-3.5 text-center align-middle"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex justify-center">
                                    <ContractAccessCheckbox
                                      checked={!!u.hasContractAccess}
                                      disabled={toggleContractAccessMutation.isPending}
                                      onChange={(next) => {
                                        toggleContractAccessMutation.mutate({ userId: u.id, allow: next });
                                      }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Card>
              </div>
            )
          )
          : (
          <>
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Cadastro de Contratos
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Gerencie os contratos da engenharia
            </p>
          </div>

          <Card>
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                    <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Contratos
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {contracts.length} {contracts.length === 1 ? 'contrato' : 'contratos'} cadastrado(s)
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar por nome ou número..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  {canCreateContrato && (
                    <button
                      onClick={() => {
                        if (!canCreateContrato) {
                          toast.error('Você não tem permissão para criar contratos.');
                          return;
                        }
                        resetForm();
                        setShowForm(true);
                      }}
                      className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <Plus className="w-4 h-4" />
                      Novo Contrato
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <span>
                  Mostrando {startItem} a {endItem} de {totalFiltered} contratos
                </span>
                <span>Página 1 de 1</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[240px]">
                        Nome
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Nº Contrato
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Vigência
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Centro de Custo
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Valor + Aditivos
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Valor + Aditivos Anual
                      </th>
                      {showActionsColumn && (
                        <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Ação
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {loadingContracts ? (
                      <tr>
                        <td colSpan={showActionsColumn ? 7 : 6} className="px-6 py-8 text-center">
                          <div className="flex items-center justify-center">
                            <div className="loading-spinner w-6 h-6 mr-2" />
                            <span className="text-gray-600 dark:text-gray-400">
                              Carregando contratos...
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : contracts.length === 0 ? (
                      <tr>
                        <td colSpan={showActionsColumn ? 7 : 6} className="px-6 py-8 text-center">
                          <div className="text-gray-500 dark:text-gray-400">
                            <p>Nenhum contrato encontrado.</p>
                            <p className="text-sm mt-1">
                              Cadastre um novo contrato para começar.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      contracts.map((c: Contract) => (
                        <tr
                          key={c.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <td className="px-3 sm:px-6 py-3 min-w-[240px] align-middle text-left">
                            <span className="text-sm text-gray-900 dark:text-gray-100 font-medium whitespace-normal">
                              {c.name}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-3 whitespace-nowrap text-sm text-left text-gray-700 dark:text-gray-300">
                            <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                              {c.number}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-3 whitespace-nowrap text-sm text-left text-gray-700 dark:text-gray-300">
                            {formatDate(c.startDate)} até {formatDate(c.endDate)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 whitespace-nowrap text-sm text-left text-gray-700 dark:text-gray-300">
                            {c.costCenter?.name || c.costCenter?.code || '-'}
                          </td>
                          <td className="px-3 sm:px-6 py-3 whitespace-nowrap text-sm text-left text-gray-700 dark:text-gray-300">
                            {formatCurrency(c.valuePlusAddenda)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 whitespace-nowrap text-sm text-left text-gray-700 dark:text-gray-300">
                            {(() => {
                              const anual = getValorMaisAditivosAnual(c.valuePlusAddenda, c.startDate, c.endDate);
                              return anual !== null ? formatCurrency(anual) : '-';
                            })()}
                          </td>
                          {showActionsColumn && (
                            <td className="relative px-3 sm:px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  setContractActionMenu((prev) => {
                                    if (prev?.contractId === c.id) return null;
                                    let left = r.right - CONTRACT_ACTION_MENU_WIDTH_PX;
                                    left = Math.max(
                                      8,
                                      Math.min(left, window.innerWidth - CONTRACT_ACTION_MENU_WIDTH_PX - 8)
                                    );
                                    return { contractId: c.id, top: r.bottom + 4, left };
                                  });
                                }}
                                className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                aria-label="Abrir ações"
                                aria-expanded={contractActionMenu?.contractId === c.id}
                                aria-haspopup="menu"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {contractActionMenu &&
                contractForActionMenu &&
                typeof document !== 'undefined' &&
                createPortal(
                  <>
                    <div
                      className="fixed inset-0 z-[200]"
                      aria-hidden
                      onClick={() => setContractActionMenu(null)}
                    />
                    <div
                      role="menu"
                      className="fixed z-[201] w-56 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
                      style={{
                        top: contractActionMenu.top,
                        left: contractActionMenu.left,
                      }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContractActionMenu(null);
                          router.push(`/ponto/contratos/${contractForActionMenu.id}`);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>Ver detalhes</span>
                      </button>
                      {canEditContrato && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            setContractActionMenu(null);
                            handleEdit(contractForActionMenu);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
                        >
                          <Pencil className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>Editar contrato</span>
                        </button>
                      )}
                      {canDeleteContrato && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            setContractActionMenu(null);
                            setShowDeleteModal(contractForActionMenu.id);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
                        >
                          <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                          <span>Excluir contrato</span>
                        </button>
                      )}
                      {canManageUserPermissions && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            setContractActionMenu(null);
                            setPermissionsContract(contractForActionMenu);
                            setPermissionsTarget(null);
                            setPermissionTab('gerais');
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
                        >
                          <Shield className="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0" />
                          <span>Gerenciar permissões</span>
                        </button>
                      )}
                    </div>
                  </>,
                  document.body
                )}
            </CardContent>
          </Card>
          </>
          )}
        </div>

        {/* Modal Criar/Editar */}
        {showForm && (
          <ContractFormModal
            isOpen={showForm}
            onClose={() => {
              setShowForm(false);
              resetForm();
            }}
            editingContract={editingContract}
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            createMutation={createMutation}
            updateMutation={updateMutation}
            costCenters={costCentersList}
            loadingCostCenters={loadingCostCenters}
          />
        )}

        {/* Modal Exclusão */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowDeleteModal(null)}
            />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">
                Excluir Contrato?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
                Tem certeza que deseja excluir este contrato? Esta ação não pode ser desfeita.
              </p>
              <div className="flex items-center justify-center space-x-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(showDeleteModal)}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}

function ContractFormModal({
  isOpen,
  onClose,
  editingContract,
  formData,
  setFormData,
  onSubmit,
  createMutation,
  updateMutation,
  costCenters,
  loadingCostCenters
}: {
  isOpen: boolean;
  onClose: () => void;
  editingContract: Contract | null;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  onSubmit: (e: React.FormEvent) => void;
  createMutation: any;
  updateMutation: any;
  costCenters: CostCenter[];
  loadingCostCenters: boolean;
}) {
  const ccList = Array.isArray(costCenters) ? costCenters : [];
  const [ccDropdownOpen, setCcDropdownOpen] = useState(false);
  const [ccSearch, setCcSearch] = useState('');
  const ccSearchInputRef = useRef<HTMLInputElement>(null);
  const ccTriggerRef = useRef<HTMLButtonElement>(null);
  const ccPopoverRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const syncCcDropdownPlacement = useCallback(() => {
    const el = ccTriggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    let top = r.bottom + gap;
    /** altura disponível até o fim da viewport (popover fica sempre visível) */
    const maxPopoverH = 320;
    const spaceBelow = window.innerHeight - top - 12;
    if (spaceBelow < 120) {
      const above = Math.max(8, r.top - gap - maxPopoverH);
      top = above;
    }
    setDropdownPos({
      top,
      left: r.left,
      width: Math.max(r.width, 280),
    });
  }, []);

  const filteredCostCenters = useMemo(() => {
    const q = ccSearch.trim().toLowerCase();
    if (!q) return ccList;
    return ccList.filter((cc) => {
      const label = `${cc.code ? `${cc.code} - ` : ''}${cc.name || 'Sem nome'}`.toLowerCase();
      return label.includes(q);
    });
  }, [ccList, ccSearch]);

  useLayoutEffect(() => {
    if (!ccDropdownOpen) return;
    syncCcDropdownPlacement();
    window.addEventListener('resize', syncCcDropdownPlacement);
    window.addEventListener('scroll', syncCcDropdownPlacement, true);
    return () => {
      window.removeEventListener('resize', syncCcDropdownPlacement);
      window.removeEventListener('scroll', syncCcDropdownPlacement, true);
    };
  }, [ccDropdownOpen, syncCcDropdownPlacement]);

  useEffect(() => {
    if (!ccDropdownOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ccTriggerRef.current?.contains(t)) return;
      if (ccPopoverRef.current?.contains(t)) return;
      setCcDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [ccDropdownOpen]);

  useEffect(() => {
    if (!isOpen) {
      setCcDropdownOpen(false);
      setCcSearch('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!ccDropdownOpen) return;
    const id = window.requestAnimationFrame(() => ccSearchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [ccDropdownOpen]);

  useEffect(() => {
    if (!ccDropdownOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCcDropdownOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ccDropdownOpen]);

  function costCenterDisplayLabel(cc: CostCenter): string {
    return `${cc.code ? `${cc.code} - ` : ''}${cc.name || 'Sem nome'}`;
  }

  if (!isOpen) return null;

  const ccDropdownPanel =
    ccDropdownOpen && !loadingCostCenters && dropdownPos ? (
      <div
        ref={ccPopoverRef}
        role="listbox"
        className="fixed z-[9999] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg flex flex-col overflow-hidden"
        style={{
          top: dropdownPos.top,
          left: dropdownPos.left,
          width: dropdownPos.width,
          maxHeight: Math.min(320, typeof window !== 'undefined' ? window.innerHeight - dropdownPos.top - 12 : 320),
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-gray-100 dark:border-gray-700 px-3 pt-2 pb-2 bg-white dark:bg-gray-800">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={ccSearchInputRef}
              type="search"
              value={ccSearch}
              onChange={(e) => setCcSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setCcDropdownOpen(false);
              }}
              placeholder="Pesquisar centro de custo..."
              autoComplete="off"
              className="w-full pl-9 pr-3 py-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-red-500/70 focus:border-red-500 dark:focus:border-red-500"
            />
          </div>
        </div>
        <div className="overflow-y-auto min-h-0 flex-1 py-1 max-h-52">
          {ccSearch.trim() === '' && (
            <button
              type="button"
              className={`w-full px-4 py-2.5 text-left text-sm ${
                !formData.costCenterId
                  ? 'bg-red-600 text-white'
                  : 'text-gray-900 dark:text-gray-100 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white'
              }`}
              onClick={() => {
                setFormData({ ...formData, costCenterId: '' });
                setCcDropdownOpen(false);
              }}
            >
              {!formData.costCenterId ? 'Selecione o centro de custo' : 'Limpar seleção'}
            </button>
          )}
          {filteredCostCenters.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Nenhum centro encontrado.</div>
          ) : (
            filteredCostCenters.map((cc) => (
              <button
                key={cc.id}
                type="button"
                className={`w-full px-4 py-2.5 text-left text-sm ${
                  formData.costCenterId === cc.id
                    ? 'bg-red-600 text-white'
                    : 'text-gray-900 dark:text-gray-100 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white'
                }`}
                onClick={() => {
                  setFormData({ ...formData, costCenterId: cc.id });
                  setCcDropdownOpen(false);
                  setCcSearch('');
                }}
              >
                {costCenterDisplayLabel(cc)}
              </button>
            ))
          )}
        </div>
      </div>
    ) : null;

  return (
    <>
      {typeof document !== 'undefined' && ccDropdownPanel
        ? createPortal(ccDropdownPanel, document.body)
        : null}
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {editingContract ? 'Editar Contrato' : 'Cadastrar Contrato'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nome do Contrato *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Ex: Contrato de Obra X"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Número do Contrato *
                </label>
                <input
                  type="text"
                  required
                  value={formData.number}
                  onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Ex: 001/2025"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Início da Vigência *
                </label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Fim da Vigência *
                </label>
                <input
                  type="date"
                  required
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Centro de Custo *
                </label>
                <div className="relative">
                  <button
                    ref={ccTriggerRef}
                    type="button"
                    disabled={loadingCostCenters}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (ccDropdownOpen) {
                        setCcDropdownOpen(false);
                        return;
                      }
                      syncCcDropdownPlacement();
                      setCcDropdownOpen(true);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between gap-2 disabled:opacity-50 outline-none focus:ring-2 focus:ring-red-500/80 dark:focus:ring-red-500/70 focus:border-red-500 dark:focus:border-red-500"
                  >
                    <span className="truncate min-w-0">
                      {loadingCostCenters
                        ? 'Carregando...'
                        : (() => {
                            if (!formData.costCenterId) return 'Selecione o centro de custo';
                            const cc = ccList.find((c) => c.id === formData.costCenterId);
                            if (!cc) return 'Selecione o centro de custo';
                            return costCenterDisplayLabel(cc);
                          })()}
                    </span>
                    {ccDropdownOpen ? (
                      <ChevronUp className="w-4 h-4 shrink-0 opacity-60" />
                    ) : (
                      <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Valor mais Aditivos *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium">
                    R$
                  </span>
                  <input
                    type="text"
                    required
                    value={formData.valuePlusAddenda}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '');
                      const formatted = v ? (Number(v) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                      setFormData({ ...formData, valuePlusAddenda: formatted });
                    }}
                    className="w-full pl-12 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="0,00"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Digite apenas números. Ex: 1500000 = R$ 15.000,00
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Valor mais Aditivos Anual
                </label>
                <div className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 font-medium">
                  {(() => {
                    const valor = parseCurrencyInput(formData.valuePlusAddenda);
                    const anual = getValorMaisAditivosAnual(valor, formData.startDate, formData.endDate);
                    return anual !== null ? formatCurrency(anual) : 'Informe valor e vigência';
                  })()}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Calculado automaticamente: Valor ÷ anos de vigência
                </p>
              </div>
            </div>

            {(createMutation.isError || updateMutation.isError) && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300">
                  {(createMutation.error as any)?.response?.data?.message ||
                    (updateMutation.error as any)?.response?.data?.message ||
                    'Erro ao salvar contrato'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Salvando...'
                  : editingContract
                  ? 'Atualizar'
                  : 'Cadastrar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
    </>
  );
}
