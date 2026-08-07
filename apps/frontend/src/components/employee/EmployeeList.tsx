'use client';

import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Users, Search, AlertTriangle, X, Download, Eye, EyeOff, Plus, ChevronDown, ChevronUp, CheckCircle, RotateCcw, Upload, Loader2, MoreVertical, UserX, Shield, Filter, KeyRound } from 'lucide-react';
import { TableCheckbox } from '@/components/ui/Checkbox';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import {
  filterOptionsWithAll,
  EMPLOYEE_POLO_OPTIONS,
  EMPLOYEE_CATEGORIA_FINANCEIRA_OPTIONS,
  EMPLOYEE_STATUS_FILTER_OPTIONS,
} from '@/lib/selectOptionBuilders';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { getListTableRowClassName, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { TOMADORES_LIST } from '@/constants/tomadores';
import { 
  DEPARTMENTS_LIST,
  COMPANIES_LIST,
  MODALITIES_LIST,
  CLIENTS_LIST,
  POLOS_LIST,
  CATEGORIAS_FINANCEIRAS_LIST
} from '@/constants/payrollFilters';
import { useCostCenters } from '@/hooks/useCostCenters';
import { CARGOS_LIST } from '@/constants/cargos';
import { usePermissions } from '@/hooks/usePermissions';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import api from '@/lib/api';
import { isGennecyBotUser } from '@/lib/gennecyBot';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import toast from 'react-hot-toast';

const EMPLOYEE_ACTION_MENU_WIDTH_PX = 224; // w-56

const pk = pathToModuleKey;

interface Employee {
  id: string;
  name: string;
  email: string;
  cpf: string;
  role: string;
  isActive: boolean;
  /** URL da foto de perfil (mesmo campo da tabela `users`) */
  profilePhotoUrl?: string | null;
  createdAt?: string;
  employee?: {
    id: string;
    employeeId: string;
    department: string;
    position: string;
    hireDate: string;
    birthDate?: string;
    salary: number;
    isRemote: boolean;
    workSchedule: any;
    costCenter?: string;
    client?: string;
    dailyFoodVoucher?: number;
    dailyTransportVoucher?: number;
    company?: string;
    bank?: string;
    accountType?: string;
    agency?: string;
    operation?: string;
    account?: string;
    digit?: string;
    pixKeyType?: string;
    pixKey?: string;
    // Novos campos - Modalidade e Adicionais
    modality?: string;
    familySalary?: number;
    dangerPay?: number;
    unhealthyPay?: number;
    // Novos campos - Polo e Categoria Financeira
    polo?: string;
    categoriaFinanceira?: string;
  };
}

interface EmployeeListProps {
  userRole: string;
  showDeleteButton?: boolean;
  /** Abre modal de importação (botão no cabeçalho da lista). */
  onImportEmployees?: () => void;
  /** Abre modal de novo funcionário (botão no cabeçalho da lista). */
  onCreateEmployee?: () => void;
}

export function EmployeeList({
  userRole,
  showDeleteButton = true,
  onImportEmployees,
  onCreateEmployee,
}: EmployeeListProps) {
  const router = useRouter();
  const { costCentersList } = useCostCenters();
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm.trim());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkReactivateModal, setShowBulkReactivateModal] = useState(false);
  /** Menu flutuante: fixed + portal para não ser cortado pelo overflow-x da tabela */
  const [employeeActionMenu, setEmployeeActionMenu] = useState<{
    employeeId: string;
    top: number;
    left: number;
  } | null>(null);
  const [reactivateConfirm, setReactivateConfirm] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12);

  // Função para formatar CPF
  const formatCPF = (cpf: string): string => {
    if (!cpf) return '';
    // Remove tudo que não é dígito
    const numbers = cpf.replace(/\D/g, '');
    // Aplica a formatação: 000.000.000-00
    if (numbers.length === 11) {
      return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    // Se não tiver 11 dígitos, retorna o CPF original
    return cpf;
  };
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [costCenterFilter, setCostCenterFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [poloFilter, setPoloFilter] = useState<string>('all');
  const [categoriaFinanceiraFilter, setCategoriaFinanceiraFilter] = useState<string>('all');
  const [modalityFilter, setModalityFilter] = useState<string>('all');
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  

  const [isExportingEmployees, setIsExportingEmployees] = useState(false);

  const queryClient = useQueryClient();

  // Listas de opções para filtros
  const departments = ['Todos', ...DEPARTMENTS_LIST];

  const positions = ['Todos', ...CARGOS_LIST];

  const costCenters = ['Todos', ...costCentersList];

  const clients = ['Todos', ...CLIENTS_LIST];

  // Lista leve: busca/departamento/cargo no servidor; demais filtros no cliente
  const { data: employeesData, isLoading, isFetching, error } = useQuery({
    queryKey: [
      'employees',
      statusFilter,
      deferredSearchTerm,
      departmentFilter,
      positionFilter,
    ],
    queryFn: async () => {
      const res = await api.get('/users', {
        params: {
          page: 1,
          limit: 500,
          light: 1,
          excludeAdmin: 1,
          status: statusFilter === 'all' ? 'all' : statusFilter,
          ...(deferredSearchTerm ? { search: deferredSearchTerm } : {}),
          ...(departmentFilter !== 'all' ? { department: departmentFilter } : {}),
          ...(positionFilter !== 'all' ? { position: positionFilter } : {}),
        },
      });
      return res.data;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    throwOnError: false,
    placeholderData: (prev) => prev,
  });


  // Deletar funcionário
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const res = await api.delete(`/users/${employeeId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDeleteConfirm(null);
      // Fechar modal de detalhes após desligar
      setSelectedEmployee(null);
    },
    onError: (error: any) => {
      console.error('Erro ao deletar funcionário:', error);
      toast.error(error?.response?.data?.message || error?.response?.data?.error || 'Erro ao desligar');
    }
  });

  const bulkDesligarMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      let ok = 0;
      let failed = 0;
      for (const id of ids) {
        try {
          await api.delete(`/users/${id}`);
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      return { ok, failed };
    },
    onSuccess: ({ ok, failed }) => {
      if (ok > 0) {
        toast.success(ok === 1 ? '1 funcionário desligado' : `${ok} funcionários desligados`);
      }
      if (failed > 0) {
        toast.error(`${failed} não puderam ser desligados`);
      }
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setSelectedIds(new Set());
      setShowBulkDeleteModal(false);
      setSelectedEmployee(null);
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          'Erro ao desligar selecionados'
      );
    },
  });

  const bulkReactivateMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      let ok = 0;
      let failed = 0;
      for (const id of ids) {
        try {
          await api.put(`/users/${id}`, { isActive: true });
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      return { ok, failed };
    },
    onSuccess: ({ ok, failed }) => {
      if (ok > 0) {
        toast.success(ok === 1 ? '1 funcionário ativado' : `${ok} funcionários ativados`);
      }
      if (failed > 0) {
        toast.error(`${failed} não puderam ser ativados`);
      }
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setSelectedIds(new Set());
      setShowBulkReactivateModal(false);
      setSelectedEmployee(null);
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          'Erro ao ativar selecionados'
      );
    },
  });

  // Reativar funcionário
  const reactivateEmployeeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const res = await api.put(`/users/${employeeId}`, { isActive: true });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      // Atualizar estado local do selecionado para refletir reativação imediata
      setSelectedEmployee((prev: any) => prev ? { ...prev, isActive: true } : prev);
      setReactivateConfirm(null);
      // Fechar modal de detalhes após reativar
      setSelectedEmployee(null);
    },
    onError: (error: any) => {
      console.error('Erro ao reativar funcionário:', error);
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: async ({ employeeId, newPassword }: { employeeId: string; newPassword: string }) => {
      const res = await api.put(`/users/${employeeId}/password`, { newPassword });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Senha alterada com sucesso!');
      setShowChangePasswordModal(false);
      setPasswordForm({ newPassword: '', confirmPassword: '' });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || 'Erro ao alterar senha';
      toast.error(errorMessage);
    }
  });

  const handleDelete = (employeeId: string) => {
    deleteEmployeeMutation.mutate(employeeId);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const employees: Employee[] = employeesData?.data || [];
  // Listas com base em fontes globais
  const companies: string[] = ['Todos', ...COMPANIES_LIST];
  const polos: string[] = ['Todos', ...POLOS_LIST];
  const categoriasFinanceiras: string[] = ['Todos', ...CATEGORIAS_FINANCEIRAS_LIST];
  const modalities: string[] = ['Todos', ...MODALITIES_LIST];
  const pagination = employeesData?.pagination || { total: 0, totalPages: 0 };


  // Filtrar funcionários (busca/departamento/cargo/admin já vêm do servidor)
  const filteredEmployees = useMemo(() => {
    if (!employees || employees.length === 0) {
      return [];
    }
    
    return employees.filter((emp: Employee) => {
      if (emp.role !== 'EMPLOYEE') return false;
      if (isGennecyBotUser(emp)) return false;
      
      if (costCenterFilter !== 'all' && 
          (!emp.employee?.costCenter || !emp.employee.costCenter.toLowerCase().includes(costCenterFilter.toLowerCase()))) {
        return false;
      }
      
      if (clientFilter !== 'all' && 
          (!emp.employee?.client || !emp.employee.client.toLowerCase().includes(clientFilter.toLowerCase()))) {
        return false;
      }
      
      if (companyFilter !== 'all' && emp.employee?.company !== companyFilter) {
        return false;
      }
      
      if (poloFilter !== 'all' && emp.employee?.polo !== poloFilter) {
        return false;
      }
      
      if (categoriaFinanceiraFilter !== 'all' && emp.employee?.categoriaFinanceira !== categoriaFinanceiraFilter) {
        return false;
      }
      
      if (modalityFilter !== 'all' && emp.employee?.modality !== modalityFilter) {
        return false;
      }
      
      return true;
    });
  }, [employees, costCenterFilter, clientFilter, companyFilter, poloFilter, categoriaFinanceiraFilter, modalityFilter]);

  const exportEmployeesToExcel = async () => {
    if (filteredEmployees.length === 0) {
      toast.error('Nenhum funcionário para exportar');
      return;
    }

    const formatExportDate = (value?: string | null) => {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toISOString().slice(0, 10);
    };

    const matchesClientFilters = (emp: Employee) => {
      if (emp.role !== 'EMPLOYEE') return false;
      if (isGennecyBotUser(emp)) return false;
      if (
        costCenterFilter !== 'all' &&
        (!emp.employee?.costCenter ||
          !emp.employee.costCenter.toLowerCase().includes(costCenterFilter.toLowerCase()))
      ) {
        return false;
      }
      if (
        clientFilter !== 'all' &&
        (!emp.employee?.client ||
          !emp.employee.client.toLowerCase().includes(clientFilter.toLowerCase()))
      ) {
        return false;
      }
      if (companyFilter !== 'all' && emp.employee?.company !== companyFilter) return false;
      if (poloFilter !== 'all' && emp.employee?.polo !== poloFilter) return false;
      if (
        categoriaFinanceiraFilter !== 'all' &&
        emp.employee?.categoriaFinanceira !== categoriaFinanceiraFilter
      ) {
        return false;
      }
      if (modalityFilter !== 'all' && emp.employee?.modality !== modalityFilter) return false;
      return true;
    };

    setIsExportingEmployees(true);
    const loadingToast = toast.loading('Preparando exportação completa...');

    try {
      // Lista da tela é light (sem salário/banco). Busca completa só no export.
      const res = await api.get('/users', {
        params: {
          page: 1,
          limit: 1000,
          excludeAdmin: 1,
          status: statusFilter === 'all' ? 'all' : statusFilter,
          ...(deferredSearchTerm ? { search: deferredSearchTerm } : {}),
          ...(departmentFilter !== 'all' ? { department: departmentFilter } : {}),
          ...(positionFilter !== 'all' ? { position: positionFilter } : {}),
        },
      });

      const fullEmployees: Employee[] = (res.data?.data || []).filter(matchesClientFilters);

      if (fullEmployees.length === 0) {
        toast.error('Nenhum funcionário para exportar', { id: loadingToast });
        return;
      }

      const rows = fullEmployees.map((emp) => ({
        Nome: emp.name || '',
        Email: emp.email || '',
        CPF: formatCPF(emp.cpf || ''),
        Matrícula: emp.employee?.employeeId || '',
        Setor: emp.employee?.department || '',
        Cargo: emp.employee?.position || '',
        'Data de Admissão': formatExportDate(emp.employee?.hireDate),
        'Data de Nascimento': formatExportDate(emp.employee?.birthDate),
        Salário: emp.employee?.salary ?? '',
        'Centro de Custo': emp.employee?.costCenter || '',
        Tomador: emp.employee?.client || '',
        Empresa: emp.employee?.company || '',
        Banco: emp.employee?.bank || '',
        'Tipo de Conta': emp.employee?.accountType || '',
        Agência: emp.employee?.agency || '',
        Operação: emp.employee?.operation || '',
        Conta: emp.employee?.account || '',
        Dígito: emp.employee?.digit || '',
        'Tipo Chave PIX': emp.employee?.pixKeyType || '',
        'Chave PIX': emp.employee?.pixKey || '',
        Modalidade: emp.employee?.modality || '',
        'Salário Família': emp.employee?.familySalary ?? '',
        Periculosidade: emp.employee?.dangerPay ?? '',
        Insalubridade: emp.employee?.unhealthyPay ?? '',
        Polo: emp.employee?.polo || '',
        'Categoria Financeira': emp.employee?.categoriaFinanceira || '',
        'VA Diário': emp.employee?.dailyFoodVoucher ?? '',
        'VT Diário': emp.employee?.dailyTransportVoucher ?? '',
        Status: emp.isActive ? 'Ativo' : 'Inativo',
        'Adicionado Em': formatExportDate(emp.createdAt),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const colWidths = Object.keys(rows[0] || {}).map((key) => ({
        wch: Math.min(28, Math.max(12, key.length + 2)),
      }));
      ws['!cols'] = colWidths;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Funcionários');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `funcionarios-${stamp}.xlsx`);
      toast.success(`${rows.length} funcionário(s) exportado(s)`, { id: loadingToast });
    } catch {
      toast.error('Erro ao exportar funcionários', { id: loadingToast });
    } finally {
      setIsExportingEmployees(false);
    }
  };

  const departmentFilterSelectOptions = useMemo(
    () => filterOptionsWithAll(['Todos', ...DEPARTMENTS_LIST], 'Todos'),
    []
  );
  const positionFilterSelectOptions = useMemo(
    () => filterOptionsWithAll(['Todos', ...CARGOS_LIST], 'Todos'),
    []
  );
  const companyFilterSelectOptions = useMemo(
    () => filterOptionsWithAll(['Todos', ...COMPANIES_LIST], 'Todas'),
    []
  );
  const poloFilterSelectOptions = useMemo(
    () => [
      { value: 'all', label: 'Todos', searchText: 'Todos' },
      ...EMPLOYEE_POLO_OPTIONS,
    ],
    []
  );
  const costCenterFilterSelectOptions = useMemo(
    () => filterOptionsWithAll(['Todos', ...costCentersList], 'Todos'),
    [costCentersList]
  );
  const clientFilterSelectOptions = useMemo(
    () => filterOptionsWithAll(['Todos', ...CLIENTS_LIST], 'Todos'),
    []
  );
  const categoriaFinanceiraFilterSelectOptions = useMemo(
    () => [
      { value: 'all', label: 'Todas', searchText: 'Todas' },
      ...EMPLOYEE_CATEGORIA_FINANCEIRA_OPTIONS,
    ],
    []
  );
  const modalityFilterSelectOptions = useMemo(
    () => filterOptionsWithAll(['Todos', ...MODALITIES_LIST], 'Todas'),
    []
  );

  // Aplicar paginação nos funcionários filtrados
  const totalFiltered = filteredEmployees.length;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedEmployees = filteredEmployees.slice(startIndex, endIndex);

  const selectedCount = selectedIds.size;
  const selectedEmployees = filteredEmployees.filter((e) => selectedIds.has(e.id));
  const selectedActiveCount = selectedEmployees.filter((e) => e.isActive).length;
  const selectedInactiveCount = selectedEmployees.filter((e) => !e.isActive).length;
  const selectionIsAllInactive =
    selectedCount > 0 && selectedInactiveCount === selectedCount;
  const selectionIsAllActive =
    selectedCount > 0 && selectedActiveCount === selectedCount;
  const allPageSelected =
    paginatedEmployees.length > 0 &&
    paginatedEmployees.every((employee) => selectedIds.has(employee.id));
  const somePageSelected = paginatedEmployees.some((employee) => selectedIds.has(employee.id));
  const filteredCount = filteredEmployees.length;
  const allFilteredSelected =
    filteredCount > 0 &&
    selectedCount > 0 &&
    filteredEmployees.every((e) => selectedIds.has(e.id));

  const toggleSelectOne = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllPage = () => {
    setSelectedIds((prev) => {
      if (paginatedEmployees.length === 0) return prev;
      if (paginatedEmployees.every((employee) => prev.has(employee.id))) {
        const next = new Set(prev);
        paginatedEmployees.forEach((employee) => next.delete(employee.id));
        return next;
      }
      const next = new Set(prev);
      paginatedEmployees.forEach((employee) => next.add(employee.id));
      return next;
    });
  };

  const selectAllFiltered = () => {
    const ids = filteredEmployees.map((e) => e.id);
    setSelectedIds(new Set(ids));
    toast.success(
      ids.length === 1 ? '1 funcionário selecionado' : `${ids.length} funcionários selecionados`
    );
  };

  // Calcular informações de paginação
  const totalPages = Math.ceil(totalFiltered / itemsPerPage);
  const startItem = totalFiltered === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(endIndex, totalFiltered);

  // Resetar página quando buscar
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleChangePassword = () => {
    if (!selectedEmployee) return;
    const newPassword = passwordForm.newPassword.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();

    if (!newPassword) {
      toast.error('Informe a nova senha');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    changePasswordMutation.mutate({ employeeId: selectedEmployee.id, newPassword });
  };

  // Verificar se o usuário tem permissões administrativas baseadas no cargo
  const {
    canManageEmployees,
    canCreateEmployees,
    canEditEmployees,
    canDeleteEmployees,
    isAdministrator,
    can,
    canAction,
  } = usePermissions();

  /** Mesma ideia da página de contratos: matriz (Permissões / Controle), não só cargo Administrador. */
  const canManageUserPermissions =
    isAdministrator ||
    can(pk('/ponto/permissoes')) ||
    canAction(pk('/ponto/permissoes'), 'ver') ||
    can(pk('/ponto/controle/alterar-permissoes'));
  const canChangeEmployeePassword =
    isAdministrator ||
    can(pk('/ponto/controle/alterar-senha-funcionarios')) ||
    canAction(pk('/ponto/controle/alterar-senha-funcionarios'), 'ver');

  const employeeForActionMenu = useMemo(() => {
    if (!employeeActionMenu) return null;
    return employees.find((e) => e.id === employeeActionMenu.employeeId) ?? null;
  }, [employeeActionMenu, employees]);


  useEffect(() => {
    if (!employeeActionMenu) return;
    const close = () => setEmployeeActionMenu(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [employeeActionMenu]);

  useEffect(() => {
    if (employeeActionMenu && !employees.some((e) => e.id === employeeActionMenu.employeeId)) {
      setEmployeeActionMenu(null);
    }
  }, [employeeActionMenu, employees]);


  // Função para limpar todos os filtros
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('active');
    setDepartmentFilter('all');
    setPositionFilter('all');
    setCostCenterFilter('all');
    setClientFilter('all');
    setCompanyFilter('all');
    setPoloFilter('all');
    setCategoriaFinanceiraFilter('all');
    setModalityFilter('all');
    setCurrentPage(1);
  };

  return (
    <>
      {/* Card de Filtros - fora do card de gestão (mesmo padrão das outras telas) */}
      <Card className="mb-6 hidden">
        <CardHeader className="border-b-0 pb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
            <div className="flex items-center space-x-4">
              {!isFiltersMinimized && (
                <>
                  <button
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    className="flex items-center justify-center w-8 h-8 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title={showAdvancedFilters ? 'Ocultar filtros avançados' : 'Mostrar filtros avançados'}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.354 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l1.218-1.348"/><path d="M16 6h6"/><path d="M19 3v6"/></svg>
                  </button>
                  <button
                    onClick={clearFilters}
                    className="flex items-center justify-center w-8 h-8 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                    title="Limpar todos os filtros"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                </>
              )}
              <button
                onClick={() => setIsFiltersMinimized(!isFiltersMinimized)}
                className="flex items-center justify-center w-8 h-8 text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title={isFiltersMinimized ? 'Expandir filtros' : 'Minimizar filtros'}
              >
                {isFiltersMinimized ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronUp className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </CardHeader>
        {!isFiltersMinimized && (
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-4">
              {/* Filtro Principal - Busca Geral */}
              <div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Buscar Funcionário
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Digite nome, CPF, matrícula, setor, empresa ou qualquer informação..."
                      className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    />
                  </div>
                </div>
              </div>

              {/* Filtros Avançados - Condicionais */}
              {showAdvancedFilters && (
                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtros Específicos</h4>
                  </div>
                  
                  {/* Grupo 1: Informações Básicas */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Informações Básicas</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Setor
                        </label>
                        <StringSingleSelectDropdown
                          value={departmentFilter}
                          onChange={setDepartmentFilter}
                          options={departmentFilterSelectOptions}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Cargo
                        </label>
                        <StringSingleSelectDropdown
                          value={positionFilter}
                          onChange={setPositionFilter}
                          options={positionFilterSelectOptions}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Empresa
                        </label>
                        <StringSingleSelectDropdown
                          value={companyFilter}
                          onChange={setCompanyFilter}
                          options={companyFilterSelectOptions}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Polo
                        </label>
                        <StringSingleSelectDropdown
                          value={poloFilter}
                          onChange={setPoloFilter}
                          options={poloFilterSelectOptions}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Status
                        </label>
                        <StringSingleSelectDropdown
                          value={statusFilter}
                          onChange={(v) => {
                            setStatusFilter(v as 'active' | 'inactive' | 'all');
                            setSelectedIds(new Set());
                          }}
                          options={EMPLOYEE_STATUS_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Grupo 2: Informações Financeiras */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Informações Financeiras</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Centro de Custo
                        </label>
                        <StringSingleSelectDropdown
                          value={costCenterFilter}
                          onChange={setCostCenterFilter}
                          options={costCenterFilterSelectOptions}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Tomador
                        </label>
                        <StringSingleSelectDropdown
                          value={clientFilter}
                          onChange={setClientFilter}
                          options={clientFilterSelectOptions}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Categoria Financeira
                        </label>
                        <StringSingleSelectDropdown
                          value={categoriaFinanceiraFilter}
                          onChange={setCategoriaFinanceiraFilter}
                          options={categoriaFinanceiraFilterSelectOptions}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Modalidade
                        </label>
                        <StringSingleSelectDropdown
                          value={modalityFilter}
                          onChange={setModalityFilter}
                          options={modalityFilterSelectOptions}
                          allowEmpty={false}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

    <Card className="w-full">
      <CardHeader className="border-b-0 pb-1">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Funcionários
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {canCreateEmployees || canEditEmployees || canDeleteEmployees
                  ? 'Visualizar e gerenciar funcionários cadastrados'
                  : 'Visualizar funcionários cadastrados'}
              </p>
            </div>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Pesquisar funcionário..."
                className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => handleSearch('')}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsFiltersModalOpen(true)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              aria-label="Abrir filtro"
              title="Filtro"
            >
              <Filter className="h-4 w-4" />
            </button>
            {canDeleteEmployees && showDeleteButton && selectionIsAllActive ? (
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                title="Desligar selecionados"
              >
                <UserX className="h-4 w-4 shrink-0" />
                <span>Desligar ({selectedCount})</span>
              </button>
            ) : null}
            {(canEditEmployees || canDeleteEmployees) &&
            showDeleteButton &&
            selectionIsAllInactive ? (
              <button
                type="button"
                onClick={() => setShowBulkReactivateModal(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                title="Ativar selecionados"
              >
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>Ativar ({selectedCount})</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void exportEmployeesToExcel()}
              disabled={filteredEmployees.length === 0 || isExportingEmployees}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              aria-label="Exportar funcionários"
              title="Exportar Excel"
            >
              {isExportingEmployees ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </button>
            {onImportEmployees && (
              <button
                type="button"
                onClick={onImportEmployees}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                aria-label="Importar funcionários"
                title="Importar"
              >
                <Upload className="h-4 w-4" />
              </button>
            )}
            {onCreateEmployee && (
              <button
                type="button"
                onClick={onCreateEmployee}
                className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span>Novo Funcionário</span>
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Busca e Filtros */}
        <div className="hidden">
          {/* Cabeçalho dos Filtros */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Filtro</h3>
              <button
                onClick={() => setIsFiltersMinimized(!isFiltersMinimized)}
                className="flex items-center justify-center w-8 h-8 text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title={isFiltersMinimized ? 'Expandir filtros' : 'Minimizar filtros'}
              >
                {isFiltersMinimized ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronUp className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
          
          {/* Conteúdo dos Filtros */}
          {!isFiltersMinimized && (
          <div className="p-4">
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Buscar funcionários por nome, email ou CPF..."
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>
              </div>
              
              {/* Filtros adicionais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Setor:</label>
                  <StringSingleSelectDropdown
                    value={departmentFilter}
                    onChange={setDepartmentFilter}
                    options={departmentFilterSelectOptions}
                    allowEmpty={false}
                    className="flex-1"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Cargo:</label>
                  <StringSingleSelectDropdown
                    value={positionFilter}
                    onChange={setPositionFilter}
                    options={positionFilterSelectOptions}
                    allowEmpty={false}
                    className="flex-1"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Centro de Custo:</label>
                  <StringSingleSelectDropdown
                    value={costCenterFilter}
                    onChange={setCostCenterFilter}
                    options={costCenterFilterSelectOptions}
                    allowEmpty={false}
                    className="flex-1"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tomador:</label>
                  <StringSingleSelectDropdown
                    value={clientFilter}
                    onChange={setClientFilter}
                    options={clientFilterSelectOptions}
                    allowEmpty={false}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lista de funcionários */}
        {error ? (
          <div className="text-center py-8">
            <AlertTriangle className="w-12 h-12 text-red-400 dark:text-red-500 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Erro ao carregar funcionários</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
              {error instanceof Error ? error.message : 'Erro desconhecido'}
            </p>
          </div>
        ) : isLoading || (isFetching && employees.length === 0) ? (
          <div className="text-center py-12">
            <Loader2 className="w-10 h-10 animate-spin text-red-600 dark:text-red-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Carregando funcionários...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Nenhum funcionário encontrado</p>
            {employees.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                Não há funcionários cadastrados no sistema
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Informações de paginação */}
            <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span>
                Mostrando {startItem} a {endItem} de {totalFiltered} funcionários
              </span>
              <span>
                Página {currentPage} de {totalPages}
              </span>
            </div>

            <div className="table-scroll">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    {canDeleteEmployees && showDeleteButton ? (
                      <th scope="col" className="w-10 px-3 py-4 sm:px-4">
                        <TableCheckbox
                          checked={allPageSelected}
                          indeterminate={!allPageSelected && somePageSelected}
                          onChange={() => toggleSelectAllPage()}
                          onClick={(e) => e.stopPropagation()}
                          ariaLabel="Selecionar todos desta página"
                        />
                      </th>
                    ) : null}
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Funcionário
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Setor
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Adicionado em
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedEmployees.map((employee: Employee) => {
                    const initials = employee.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                    const profilePhotoHref = resolveApiMediaUrl(employee.profilePhotoUrl ?? null);
                    const addedAt = employee.createdAt || employee.employee?.hireDate;
                    return (
                      <tr
                        key={employee.id}
                        onClick={() => {
                          router.push(`/ponto/funcionarios/${employee.id}`);
                        }}
                        className={getListTableRowClassName(true)}
                      >
                        {canDeleteEmployees && showDeleteButton ? (
                          <td
                            className="w-10 px-3 py-3 sm:px-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <TableCheckbox
                              checked={selectedIds.has(employee.id)}
                              onChange={() => toggleSelectOne(employee.id)}
                              onClick={(e) => e.stopPropagation()}
                              ariaLabel={`Selecionar ${employee.name}`}
                            />
                          </td>
                        ) : null}
                        <td className="px-3 sm:px-6 py-3 align-middle text-left">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center overflow-hidden bg-red-600"
                            >
                              {profilePhotoHref ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={profilePhotoHref}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span className="text-white font-semibold text-sm">
                                  {initials}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 text-left">
                              <ListRowNavigableLabel className="truncate font-semibold">
                                {employee.name}
                              </ListRowNavigableLabel>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{formatCPF(employee.cpf) || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-3 text-sm text-left text-gray-700 dark:text-gray-300">{employee.email || '—'}</td>
                        <td className="px-3 sm:px-6 py-3 text-sm text-center text-gray-700 dark:text-gray-300">{employee.employee?.department || '—'}</td>
                        <td className="px-3 sm:px-6 py-3 text-center">
                          <span
                            className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium ${
                              employee.isActive
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            }`}
                          >
                            {employee.isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                          {addedAt ? formatDate(addedAt) : '—'}
                        </td>
                        <td className="px-3 sm:px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                setEmployeeActionMenu((prev) => {
                                  if (prev?.employeeId === employee.id) return null;
                                  let left = r.right - EMPLOYEE_ACTION_MENU_WIDTH_PX;
                                  left = Math.max(
                                    8,
                                    Math.min(left, window.innerWidth - EMPLOYEE_ACTION_MENU_WIDTH_PX - 8)
                                  );
                                  return { employeeId: employee.id, top: r.bottom + 4, left };
                                });
                              }}
                              className={rowActionMenuButtonClass(employeeActionMenu?.employeeId === employee.id)}
                              aria-label="Menu de ações"
                              aria-expanded={employeeActionMenu?.employeeId === employee.id}
                              aria-haspopup="menu"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {canDeleteEmployees &&
            showDeleteButton &&
            allPageSelected &&
            filteredCount > paginatedEmployees.length &&
            !allFilteredSelected ? (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                Todos os {paginatedEmployees.length} desta página estão selecionados.{' '}
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="font-semibold text-red-600 hover:underline dark:text-red-400"
                >
                  Selecionar todos os {filteredCount} filtrados
                </button>
              </div>
            ) : null}

            {employeeActionMenu && employeeForActionMenu && (
              <ActionMenuOverlay
                open
                onClose={() => setEmployeeActionMenu(null)}
                top={employeeActionMenu.top}
                left={employeeActionMenu.left}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEmployeeActionMenu(null);
                    router.push(`/ponto/funcionarios/${employeeForActionMenu.id}`);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <Eye className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  <span>Ver detalhes</span>
                </button>
                {canChangeEmployeePassword && employeeForActionMenu.isActive && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEmployeeActionMenu(null);
                      setSelectedEmployee(employeeForActionMenu);
                      setPasswordForm({ newPassword: '', confirmPassword: '' });
                      setShowNewPassword(false);
                      setShowConfirmPassword(false);
                      setShowChangePasswordModal(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
                  >
                    <KeyRound className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                    <span>Alterar senha</span>
                  </button>
                )}
                {canDeleteEmployees && showDeleteButton && employeeForActionMenu.isActive && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEmployeeActionMenu(null);
                      setDeleteConfirm(employeeForActionMenu.id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
                  >
                    <UserX className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                    <span>Desligar o funcionário</span>
                  </button>
                )}
                {(canEditEmployees || canDeleteEmployees) && showDeleteButton && !employeeForActionMenu.isActive && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEmployeeActionMenu(null);
                      setReactivateConfirm(employeeForActionMenu.id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
                  >
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                    <span>Reativar funcionário</span>
                  </button>
                )}
                {canManageUserPermissions && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEmployeeActionMenu(null);
                      router.push(`/ponto/funcionarios/${employeeForActionMenu.id}?tab=permissions`);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
                  >
                    <Shield className="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0" />
                    <span>Gerenciar permissões</span>
                  </button>
                )}
              </ActionMenuOverlay>
            )}

            {/* Botões de paginação */}
            {totalPages > 1 && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:mt-6">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                
                {/* Números das páginas */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNumber = i + 1;
                  const isActive = pageNumber === currentPage;
                  
                  return (
                    <button
                      key={pageNumber}
                      onClick={() => setCurrentPage(pageNumber)}
                      className={`px-3 py-2 text-sm font-medium rounded-md ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}

        {isFiltersModalOpen && (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setIsFiltersModalOpen(false)} />
            <div className="relative mx-4 w-full max-w-3xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
                <button
                  type="button"
                  onClick={() => setIsFiltersModalOpen(false)}
                  className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  aria-label="Fechar filtros"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                      <StringSingleSelectDropdown
                        value={statusFilter}
                        onChange={(v) => {
                          setStatusFilter(v as 'active' | 'inactive' | 'all');
                          setSelectedIds(new Set());
                        }}
                        options={EMPLOYEE_STATUS_FILTER_OPTIONS}
                        allowEmpty={false}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Setor</label>
                      <StringSingleSelectDropdown
                        value={departmentFilter}
                        onChange={setDepartmentFilter}
                        options={departmentFilterSelectOptions}
                        allowEmpty={false}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Cargo</label>
                      <StringSingleSelectDropdown
                        value={positionFilter}
                        onChange={setPositionFilter}
                        options={positionFilterSelectOptions}
                        allowEmpty={false}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Empresa</label>
                      <StringSingleSelectDropdown
                        value={companyFilter}
                        onChange={setCompanyFilter}
                        options={companyFilterSelectOptions}
                        allowEmpty={false}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Centro de Custo</label>
                      <StringSingleSelectDropdown
                        value={costCenterFilter}
                        onChange={setCostCenterFilter}
                        options={costCenterFilterSelectOptions}
                        allowEmpty={false}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Tomador</label>
                      <StringSingleSelectDropdown
                        value={clientFilter}
                        onChange={setClientFilter}
                        options={clientFilterSelectOptions}
                        allowEmpty={false}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Polo</label>
                      <StringSingleSelectDropdown
                        value={poloFilter}
                        onChange={setPoloFilter}
                        options={poloFilterSelectOptions}
                        allowEmpty={false}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Categoria Financeira</label>
                      <StringSingleSelectDropdown
                        value={categoriaFinanceiraFilter}
                        onChange={setCategoriaFinanceiraFilter}
                        options={categoriaFinanceiraFilterSelectOptions}
                        allowEmpty={false}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Modalidade</label>
                      <StringSingleSelectDropdown
                        value={modalityFilter}
                        onChange={setModalityFilter}
                        options={modalityFilterSelectOptions}
                        allowEmpty={false}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <RotateCcw className="h-4 w-4" />
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={() => setIsFiltersModalOpen(false)}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de confirmação de exclusão */}
        {deleteConfirm && (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                    <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Confirmar Desligamento</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Esta ação não pode ser desfeita</p>
                  </div>
                </div>
                
                <p className="text-gray-700 dark:text-gray-300 mb-6">
                  Tem certeza que deseja desligar este funcionário? O funcionário será desativado e não poderá mais acessar o sistema.
                </p>
                
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDelete(deleteConfirm)}
                    disabled={deleteEmployeeMutation.isPending}
                    className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {deleteEmployeeMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Desligando...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Desligar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showBulkDeleteModal && (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => !bulkDesligarMutation.isPending && setShowBulkDeleteModal(false)}
            />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white shadow-2xl dark:bg-gray-800">
              <div className="p-6">
                <div className="mb-4 flex items-center space-x-3">
                  <div className="rounded-full bg-red-100 p-2 dark:bg-red-900/30">
                    <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Desligar selecionados
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedCount} funcionário{selectedCount === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <p className="mb-6 text-gray-700 dark:text-gray-300">
                  Tem certeza que deseja desligar {selectedCount === 1 ? 'este funcionário' : 'estes funcionários'}?
                  Eles serão desativados e não poderão mais acessar o sistema.
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    disabled={bulkDesligarMutation.isPending}
                    onClick={() => setShowBulkDeleteModal(false)}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={bulkDesligarMutation.isPending || selectedCount === 0}
                    onClick={() => bulkDesligarMutation.mutate(Array.from(selectedIds))}
                    className="flex items-center space-x-2 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
                  >
                    {bulkDesligarMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Desligando...</span>
                      </>
                    ) : (
                      <>
                        <UserX className="h-4 w-4" />
                        <span>Desligar {selectedCount}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showBulkReactivateModal && (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => !bulkReactivateMutation.isPending && setShowBulkReactivateModal(false)}
            />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white shadow-2xl dark:bg-gray-800">
              <div className="p-6">
                <div className="mb-4 flex items-center space-x-3">
                  <div className="rounded-full bg-green-100 p-2 dark:bg-green-900/30">
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Ativar selecionados
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedCount} funcionário{selectedCount === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <p className="mb-6 text-gray-700 dark:text-gray-300">
                  Tem certeza que deseja ativar{' '}
                  {selectedCount === 1 ? 'este funcionário' : 'estes funcionários'}? Eles voltarão a
                  ficar ativos e poderão acessar o sistema.
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    disabled={bulkReactivateMutation.isPending}
                    onClick={() => setShowBulkReactivateModal(false)}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={bulkReactivateMutation.isPending || selectedCount === 0}
                    onClick={() => bulkReactivateMutation.mutate(Array.from(selectedIds))}
                    className="flex items-center space-x-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-800"
                  >
                    {bulkReactivateMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Ativando...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        <span>Ativar {selectedCount}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de confirmação de admissão (reativar) */}
        {reactivateConfirm && (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setReactivateConfirm(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                    <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Confirmar Reativação</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Deseja reativar este funcionário?</p>
                  </div>
                </div>
                <p className="text-gray-700 dark:text-gray-300 mb-6">
                  O funcionário voltará a ficar ativo e poderá acessar o sistema normalmente.
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setReactivateConfirm(null)}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => reactivateEmployeeMutation.mutate(reactivateConfirm)}
                    disabled={reactivateEmployeeMutation.isPending}
                    className="px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {reactivateEmployeeMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Reativando...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Confirmar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </CardContent>

        {showChangePasswordModal && selectedEmployee && (
        <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowChangePasswordModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Alterar senha</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedEmployee.name}</p>
              </div>
              <button
                onClick={() => setShowChangePasswordModal(false)}
                className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Fechar modal de senha"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nova senha</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                    className="w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    placeholder="Digite a nova senha"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 px-3 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    aria-label={showNewPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmar senha</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    placeholder="Repita a nova senha"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 px-3 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    aria-label={showConfirmPassword ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowChangePasswordModal(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleChangePassword}
                  disabled={changePasswordMutation.isPending}
                  className="px-4 py-2 text-sm rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white inline-flex items-center gap-2"
                >
                  {changePasswordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
    </>
  );
}
