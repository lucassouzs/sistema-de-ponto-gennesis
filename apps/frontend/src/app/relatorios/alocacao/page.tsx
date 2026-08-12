'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Users, Search, Filter, ChevronDown, ChevronUp, X, Building2, FileText, Calendar, ListPlus, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import api from '@/lib/api';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { PayrollEmployee, PayrollFilters } from '@/types';
import { 
  DEPARTMENTS_LIST, 
  COMPANIES_LIST, 
  MODALITIES_LIST, 
  BANKS_LIST, 
  ACCOUNT_TYPES_LIST,
  CLIENTS_LIST,
  POLOS_LIST
} from '@/constants/payrollFilters';
import { useCostCenters } from '@/hooks/useCostCenters';
import { CARGOS_LIST } from '@/constants/cargos';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

const MONTH_FILTER_OPTIONS = labeledToSelectOptions([
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
]);

function filterWithEmpty(emptyLabel: string, items: string[]) {
  return labeledToSelectOptions([
    { value: '', label: emptyLabel },
    ...items.map((item) => ({ value: item, label: item })),
  ]);
}

const DEPARTMENT_FILTER_OPTIONS = filterWithEmpty('Todos os setores', DEPARTMENTS_LIST);
const POSITION_FILTER_OPTIONS = filterWithEmpty('Todos os cargos', CARGOS_LIST);
const COMPANY_FILTER_OPTIONS = filterWithEmpty('Todas as empresas', COMPANIES_LIST);
const CLIENT_FILTER_OPTIONS = filterWithEmpty('Todos os tomadores', CLIENTS_LIST);
const POLO_FILTER_OPTIONS = filterWithEmpty('Todos os polos', POLOS_LIST);
const MODALITY_FILTER_OPTIONS = filterWithEmpty('Todas as modalidades', MODALITIES_LIST);
const BANK_FILTER_OPTIONS = filterWithEmpty('Todos os bancos', BANKS_LIST);
const ACCOUNT_TYPE_FILTER_OPTIONS = filterWithEmpty('Todos os tipos', ACCOUNT_TYPES_LIST);

export default function AlocacaoPage() {
  const { costCentersList } = useCostCenters();
  const router = useRouter();
  const queryClient = useQueryClient();
  
  // Obter mês e ano atual
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  
  const [filters, setFilters] = useState<PayrollFilters>({
    search: '',
    department: 'Departamento Pessoal',
    company: '',
    position: '',
    costCenter: '',
    client: '',
    modality: '',
    bank: '',
    accountType: '',
    polo: '',
    month: currentMonth,
    year: currentYear
  });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<PayrollEmployee | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCurrentMonth, setModalCurrentMonth] = useState(new Date().getMonth());
  const [modalCurrentYear, setModalCurrentYear] = useState(new Date().getFullYear());
  
  // Estado para armazenar dados reais de cada funcionário
  const [employeeDataMap, setEmployeeDataMap] = useState<Record<string, any>>({});
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(true);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: employeesResponse, isLoading: loadingEmployees, error: employeesError } = useQuery({
    queryKey: ['employees-alocacao', filters],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (filters.search) params.append('search', filters.search);
        if (filters.department) params.append('department', filters.department);
        if (filters.company) params.append('company', filters.company);
        if (filters.position) params.append('position', filters.position);
        if (filters.costCenter) params.append('costCenter', filters.costCenter);
        if (filters.client) params.append('client', filters.client);
        if (filters.modality) params.append('modality', filters.modality);
        if (filters.bank) params.append('bank', filters.bank);
        if (filters.accountType) params.append('accountType', filters.accountType);
        if (filters.polo) params.append('polo', filters.polo);
        params.append('month', filters.month.toString());
        params.append('year', filters.year.toString());
        params.append('forAllocation', 'true'); // Indicar que é para relatório de alocação
        
        const res = await api.get(`/payroll/employees?${params.toString()}`);
        console.log('📊 Resposta da API alocação:', res.data);
        return res.data;
      } catch (error: any) {
        console.error('❌ Erro ao buscar alocação:', error);
        console.error('❌ Detalhes do erro:', error.response?.data || error.message);
        throw error;
      }
    },
    retry: 2,
    retryDelay: 1000
  });

  // Query para buscar dados do funcionário selecionado
  const { data: employeeData, isLoading: loadingEmployeeData } = useQuery({
    queryKey: ['employee-cost-center', selectedEmployee?.id, modalCurrentMonth, modalCurrentYear],
    queryFn: async () => {
      console.log('=== API CALL STARTED ===');
      console.log('selectedEmployee?.id:', selectedEmployee?.id);
      console.log('modalCurrentMonth:', modalCurrentMonth);
      console.log('modalCurrentYear:', modalCurrentYear);
      
      if (!selectedEmployee?.id) {
        console.log('No employee ID - returning null');
        return null;
      }
      
      const res = await api.get(`/time-records/employee/${selectedEmployee.id}/cost-center?month=${modalCurrentMonth + 1}&year=${modalCurrentYear}`);
      console.log('API Response:', res.data);
      console.log('API Response Employee:', res.data?.data?.employee);
      console.log('API Response Employee AdmissionDate:', res.data?.data?.employee?.admissionDate);
      console.log('API Response Employee HireDate:', res.data?.data?.employee?.hireDate);
      return res.data;
    },
    enabled: !!selectedEmployee?.id && isModalOpen
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const handleViewDetails = (employee: PayrollEmployee) => {
    console.log('=== MODAL OPENING ===');
    console.log('Employee from table:', JSON.stringify(employee, null, 2));
    console.log('Employee admissionDate:', employee.admissionDate);
    console.log('Employee hireDate:', (employee as any).hireDate);
    setSelectedEmployee(employee);
    setIsModalOpen(true);
  };

  // Função para buscar dados reais de um funcionário
  const fetchEmployeeData = async (employeeId: string, month?: number, year?: number) => {
    const searchMonth = month || filters.month;
    const searchYear = year || filters.year;
    const cacheKey = `${employeeId}-${searchMonth}-${searchYear}`;
    
    if (employeeDataMap[cacheKey]) {
      return employeeDataMap[cacheKey];
    }
    
    try {
      const response = await api.get(`/time-records/employee/${employeeId}/cost-center?month=${searchMonth}&year=${searchYear}`);
      const data = response.data;
      
      setEmployeeDataMap(prev => ({
        ...prev,
        [cacheKey]: data
      }));
      
      return data;
    } catch (error) {
      console.error('Erro ao buscar dados do funcionário:', error);
      return null;
    }
  };

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedEmployee(null);
  }, []);

  const { requestClose: requestCloseAllocationModal, confirmUi: allocationModalConfirmUi } =
    useModalCloseConfirm(handleCloseModal, { isParentOpen: isModalOpen });

  const handlePreviousMonth = () => {
    if (modalCurrentMonth === 0) {
      setModalCurrentMonth(11);
      setModalCurrentYear(modalCurrentYear - 1);
    } else {
      setModalCurrentMonth(modalCurrentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (modalCurrentMonth === 11) {
      setModalCurrentMonth(0);
      setModalCurrentYear(modalCurrentYear + 1);
    } else {
      setModalCurrentMonth(modalCurrentMonth + 1);
    }
  };

  const getModalMonthName = (monthNumber: number) => {
    const date = new Date();
    date.setMonth(monthNumber);
    const monthName = date.toLocaleString('pt-BR', { month: 'long' });
    return monthName.charAt(0).toUpperCase() + monthName.slice(1);
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  // Função para obter apenas os dias até hoje
  const getDaysUntilToday = (year: number, month: number) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalDays = getDaysInMonth(year, month);
    const days: number[] = [];
    
    // Verificar se o mês/ano selecionado é no futuro
    const selectedMonth = new Date(year, month, 1);
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Se o mês selecionado é no futuro, não mostrar nenhum dia
    if (selectedMonth > currentMonth) {
      return [];
    }
    
    // Se o mês selecionado é no passado, mostrar todos os dias
    if (selectedMonth < currentMonth) {
      for (let day = 1; day <= totalDays; day++) {
        days.push(day);
      }
      return days;
    }
    
    // Se é o mês atual, mostrar apenas até hoje
    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);
      if (date <= today) {
        days.push(day);
      }
    }
    
    return days;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FINAL_DE_SEMANA':
        return 'bg-gray-400 dark:bg-gray-600';
      case 'FERIADO':
        return 'bg-purple-500 dark:bg-purple-600';
      case 'FALTA':
        return 'bg-red-500 dark:bg-red-600';
      case 'AUSENCIA_JUSTIFICADA':
        return 'bg-orange-500 dark:bg-orange-600';
      case 'FERIAS':
        return 'bg-green-500 dark:bg-green-600';
      case 'NAO_ADMITIDO':
        return 'bg-gray-300 dark:bg-gray-700';
      case 'FUTURO':
        return 'bg-gray-200 dark:bg-gray-800';
      default:
        return 'bg-gray-200 dark:bg-gray-800';
    }
  };

  const getAbsenceTypeLabel = (type: string | null, customType?: string | null) => {
    if (!type) return 'Ausência Justificada';
    
    // Se for "Outros" e tiver tipo personalizado, usar o personalizado
    if (type === 'OTHER' && customType) {
      return customType;
    }
    
    const typeMap: Record<string, string> = {
      'MEDICAL': 'Atestado Médico',
      'DENTAL': 'Atestado Odontológico',
      'PREVENTIVE': 'Exame Preventivo',
      'ACCIDENT': 'Acidente de Trabalho',
      'COVID': 'COVID-19',
      'MATERNITY': 'Maternidade',
      'PATERNITY': 'Paternidade',
      'OTHER': 'Outros'
    };
    
    return typeMap[type] || 'Ausência Justificada';
  };

  const getStatusLabel = (status: string) => {
    // Lista de tipos de ausência específicos
    const absenceTypes = ['Atestado Médico', 'Atestado Odontológico', 'Exame Preventivo', 'Acidente de Trabalho', 'COVID-19', 'Maternidade', 'Paternidade', 'Outros', 'Ausência Justificada'];
    
    // Se for um tipo de ausência específico, retornar diretamente
    if (status && absenceTypes.includes(status)) {
      return status;
    }
    
    switch (status) {
      case 'FINAL_DE_SEMANA':
        return 'Final de Semana';
      case 'FERIADO':
        return 'Feriado';
      case 'FALTA':
        return 'Falta';
      case 'AUSENCIA_JUSTIFICADA':
        return 'Ausência Justificada';
      case 'FERIAS':
        return 'Férias';
      case 'NAO_ADMITIDO':
        return 'Não Admitido';
      case 'FUTURO':
        return '-';
      default:
        return status || 'N/A'; // Retornar o status diretamente se não for um caso especial
    }
  };

  const getTextColor = (status: string) => {
    // Lista de tipos de ausência que devem aparecer em laranja
    const absenceTypes = ['Atestado Médico', 'Atestado Odontológico', 'Exame Preventivo', 'Acidente de Trabalho', 'COVID-19', 'Maternidade', 'Paternidade', 'Outros', 'Ausência Justificada'];
    
    // Se for um tipo de ausência, retornar laranja
    if (status && absenceTypes.includes(status)) {
      return 'text-orange-600 dark:text-orange-400 font-semibold';
    }
    
    // Se for um centro de custo específico (não um status especial)
    if (status && !['FINAL_DE_SEMANA', 'FERIADO', 'FALTA', 'AUSENCIA_JUSTIFICADA', 'FERIAS', 'NAO_ADMITIDO', 'FUTURO'].includes(status)) {
      return 'text-blue-600 dark:text-blue-400 font-semibold'; // Cor padrão para centros de custo
    }
    
    switch (status) {
      case 'FINAL_DE_SEMANA':
        return 'text-gray-400 dark:text-gray-500 font-semibold';
      case 'FERIADO':
        return 'text-purple-600 dark:text-purple-400 font-semibold';
      case 'FALTA':
        return 'text-red-600 dark:text-red-400 font-semibold';
      case 'AUSENCIA_JUSTIFICADA':
        return 'text-orange-600 dark:text-orange-400 font-semibold';
      case 'FERIAS':
        return 'text-green-600 dark:text-green-400 font-semibold';
      case 'NAO_ADMITIDO':
        return 'text-gray-400 dark:text-gray-500';
      case 'FUTURO':
        return 'text-gray-300 dark:text-gray-600';
      default:
        return 'text-blue-600 dark:text-blue-400 font-semibold'; // Cor padrão para centros de custo
    }
  };

  // Função para determinar o status de um dia específico
  const getDayStatus = (day: number, month: number, year: number) => {
    console.log('=== getDayStatus called ===');
    console.log('selectedEmployee:', selectedEmployee);
    console.log('employeeData:', employeeData);
    
    if (!selectedEmployee || !employeeData?.data) {
      console.log('Missing data - returning FUTURO');
      return { status: 'FUTURO', costCenter: null };
    }

    const date = new Date(year, month, day);
    const dateString = date.toISOString().split('T')[0];
    const today = new Date();
    // Buscar admissionDate do employeeData (que vem da API), não do selectedEmployee (que vem da tabela)
    const employeeFromApi = employeeData?.data?.employee;
    const admissionDate = employeeFromApi?.admissionDate ? new Date(employeeFromApi.admissionDate) : 
                          employeeFromApi?.hireDate ? new Date(employeeFromApi.hireDate) : null;
    
    // Debug: verificar se admissionDate está chegando
    console.log('EmployeeFromApi:', employeeFromApi);
    console.log('AdmissionDate from API:', admissionDate, 'Date:', date, 'DateString:', dateString);
    console.log('Date <= AdmissionDate:', admissionDate ? date <= admissionDate : false, 'Date < AdmissionDate:', admissionDate ? date < admissionDate : false);

    // Verificar se é futuro
    if (date > today) {
      return { status: 'FUTURO', costCenter: null };
    }

    // Verificar se funcionário estava admitido na data (incluindo o dia da admissão)
    if (admissionDate) {
      const admissionDateString = admissionDate.toISOString().split('T')[0];
      console.log('Comparing dates:', dateString, '<', admissionDateString, 'Result:', dateString < admissionDateString);
      console.log('Is admission day:', dateString === admissionDateString);
      
      if (dateString < admissionDateString) {
        // Se é final de semana antes da admissão, mostrar como final de semana
        if (date.getDay() === 0 || date.getDay() === 6) {
          return { status: 'FINAL_DE_SEMANA', costCenter: null };
        }
        // Se é dia útil antes da admissão, mostrar como não admitido
        return { status: 'NAO_ADMITIDO', costCenter: null };
      }
      
      // Se é exatamente o dia da admissão
      if (dateString === admissionDateString) {
        // Buscar dados do dia da admissão para ver se trabalhou
        const dayData = employeeData.data.days?.find((d: any) => d.date === dateString);
        
        if (dayData && dayData.points && dayData.points.length > 0) {
          // Se trabalhou, mostrar o centro de custo normalmente
          const costCenter = dayData.points[0].costCenter;
          return { status: costCenter, costCenter };
        } else {
          // Se não trabalhou no dia da admissão, mostrar como falta normalmente
          return { status: 'FALTA', costCenter: null };
        }
      }
    }

    // Buscar dados do dia específico
    const dayData = employeeData.data.days?.find((d: any) => d.date === dateString);
    
    if (dayData) {
      // Verificar se é feriado (prioridade sobre tudo)
      if (dayData.isHoliday) {
        return { status: 'FERIADO', costCenter: null };
      }
      
      // Verificar se está em férias (prioridade sobre final de semana)
      if (dayData.isOnVacation) {
        return { status: 'FERIAS', costCenter: null };
      }

      // Verificar se é final de semana após admissão
      if (date.getDay() === 0 || date.getDay() === 6) {
        return { status: 'FINAL_DE_SEMANA', costCenter: null };
      }
      
      // Verificar se há ausência justificada (inclui atestado médico aprovado)
      if (dayData.hasAbsenceJustified || dayData.hasMedicalCertificate) {
        // Retornar o tipo da ausência se disponível, senão retornar status genérico
        const absenceType = dayData.absenceType;
        const customAbsenceType = dayData.customAbsenceType;
        const absenceLabel = absenceType ? getAbsenceTypeLabel(absenceType, customAbsenceType) : 'AUSENCIA_JUSTIFICADA';
        return { status: absenceLabel, costCenter: null };
      }
      
      // Se tem pontos, usar o centro de custo do primeiro ponto
      if (dayData.points && dayData.points.length > 0) {
        const costCenter = dayData.points[0].costCenter;
        return { status: costCenter, costCenter };
      }
      
      // Se não tem pontos mas deveria ter (dia útil após admissão)
      return { status: 'FALTA', costCenter: null };
    }

    // Se não encontrou dados para o dia
    return { status: 'FALTA', costCenter: null };
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, search: e.target.value }));
  };

  const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, department: e.target.value }));
  };

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, company: e.target.value }));
  };

  const handlePositionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, position: e.target.value }));
  };

  const handleCostCenterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, costCenter: e.target.value }));
  };

  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, client: e.target.value }));
  };

  const handlePoloChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, polo: e.target.value }));
  };

  const handleModalityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, modality: e.target.value }));
  };

  const handleBankChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, bank: e.target.value }));
  };

  const handleAccountTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, accountType: e.target.value }));
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, month: parseInt(e.target.value) }));
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, year: parseInt(e.target.value) }));
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      department: '',
      company: '',
      position: '',
      costCenter: '',
      client: '',
      modality: '',
      bank: '',
      accountType: '',
      month: currentMonth,
      year: currentYear
    });
  };

  const clearAdvancedFilters = () => {
    setFilters(prev => ({
      ...prev,
      department: '',
      company: '',
      position: '',
      costCenter: '',
      client: '',
      modality: '',
      bank: '',
      accountType: ''
    }));
  };

  const getMonthName = (monthNumber: number) => {
    const date = new Date();
    date.setMonth(monthNumber - 1);
    return date.toLocaleString('pt-BR', { month: 'long' });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatCPF = (cpf: string) => {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  // Limpar cache quando o mês/ano mudar
  useEffect(() => {
    // Limpar o cache quando o mês/ano mudar
    setEmployeeDataMap({});
  }, [filters.month, filters.year]);

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Carregando...</p>
        </div>
      </div>
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00',
    role: 'EMPLOYEE'
  };

  const employees = employeesResponse?.data?.employees || [];
  
  // Log para debug
  console.log('📊 employeesResponse:', employeesResponse);
  console.log('📊 employees:', employees);
  console.log('📊 employees length:', employees?.length);
  console.log('❌ Erro alocação:', employeesError);
  
    // REMOVIDO: useEffect que buscava dados de todos os funcionários de uma vez
    // Isso estava causando muitas requisições simultâneas (erro 429)
    // Os dados agora são buscados sob demanda quando necessário (lazy loading)
  
  const yearFilterOptions = useMemo(
    () =>
      labeledToSelectOptions(
        Array.from({ length: 11 }, (_, i) => {
          const year = currentYear - 5 + i;
          return { value: String(year), label: String(year) };
        })
      ),
    [currentYear]
  );

  const costCenterFilterOptions = useMemo(
    () => filterWithEmpty('Todos os centros', costCentersList),
    [costCentersList]
  );

  return (
    <ProtectedRoute route="/relatorios/alocacao">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center space-x-3 mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Alocação de Funcionários</h1>
          </div>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Visualize a alocação de todos os funcionários</p>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader className="border-b-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
              </div>
              <div className="flex items-center space-x-4">
                {!isFiltersMinimized && (
                  <>
                    <button
                      onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                      className="flex items-center justify-center w-8 h-8 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title={showAdvancedFilters ? 'Ocultar filtros avançados' : 'Mostrar filtros avançados'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.354 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l1.218-1.348"/><path d="M16 6h6"/><path d="M19 3v6"/></svg>
                    </button>
                    <button
                      onClick={clearFilters}
                      className="flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
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
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Buscar Funcionário
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                  <input
                    type="text"
                    value={filters.search}
                    onChange={handleSearchChange}
                    placeholder="Digite nome, CPF, matrícula, setor, empresa ou qualquer informação..."
                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>
              </div>

              {/* Filtros de Período - Sempre Visíveis */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mês
                  </label>
                  <StringSingleSelectDropdown
                    value={String(filters.month)}
                    onChange={(v) => setFilters((prev) => ({ ...prev, month: parseInt(v, 10) }))}
                    options={MONTH_FILTER_OPTIONS}
                    allowEmpty={false}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ano
                  </label>
                  <StringSingleSelectDropdown
                    value={String(filters.year)}
                    onChange={(v) => setFilters((prev) => ({ ...prev, year: parseInt(v, 10) }))}
                    options={yearFilterOptions}
                    allowEmpty={false}
                  />
                </div>
              </div>

              {/* Filtros Avançados - Condicionais */}
              {showAdvancedFilters && (
                <div className="border-t dark:border-gray-700 pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtros Específicos</h4>
                  </div>
                  
                  {/* Grupo 1: Informações Básicas */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Informações Básicas</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Setor
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.department}
                          onChange={(v) => setFilters((prev) => ({ ...prev, department: v }))}
                          options={DEPARTMENT_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Cargo
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.position}
                          onChange={(v) => setFilters((prev) => ({ ...prev, position: v }))}
                          options={POSITION_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Empresa
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.company}
                          onChange={(v) => setFilters((prev) => ({ ...prev, company: v }))}
                          options={COMPANY_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Grupo 2: Informações Financeiras */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Informações Financeiras</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Centro de Custo
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.costCenter}
                          onChange={(v) => setFilters((prev) => ({ ...prev, costCenter: v }))}
                          options={costCenterFilterOptions}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Tomador
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.client}
                          onChange={(v) => setFilters((prev) => ({ ...prev, client: v }))}
                          options={CLIENT_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Polo
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.polo}
                          onChange={(v) => setFilters((prev) => ({ ...prev, polo: v }))}
                          options={POLO_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Modalidade
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.modality}
                          onChange={(v) => setFilters((prev) => ({ ...prev, modality: v }))}
                          options={MODALITY_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Grupo 3: Informações Bancárias */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Informações Bancárias</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Banco
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.bank}
                          onChange={(v) => setFilters((prev) => ({ ...prev, bank: v }))}
                          options={BANK_FILTER_OPTIONS}
                          allowEmpty={false}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Tipo de Conta
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.accountType}
                          onChange={(v) => setFilters((prev) => ({ ...prev, accountType: v }))}
                          options={ACCOUNT_TYPE_FILTER_OPTIONS}
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

        {/* Lista de Funcionários */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                  <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Alocação de Funcionários</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Dados de alocação dos funcionários</p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="table-scroll">
              <table className="w-full">
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky left-0 bg-white dark:bg-gray-800 z-10 border-r border-gray-200 dark:border-gray-700">
                      Funcionário
                    </th>
                    {/* Colunas dos dias do mês - apenas até hoje */}
                    {getDaysUntilToday(filters.year, filters.month - 1).map((day) => {
                      const date = new Date(filters.year, filters.month - 1, day);
                      const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                      const dayName = dayNames[date.getDay()];
                      
                      return (
                        <th key={day} className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-16">
                          <div>{dayName}</div>
                          <div>({String(day).padStart(2, '0')}/{String(filters.month).padStart(2, '0')})</div>
                        </th>
                      );
                    })}
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky right-0 bg-white dark:bg-gray-800 z-10 border-l border-gray-200 dark:border-gray-700">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {employeesError ? (
                    <tr>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 z-10 border-r border-gray-200 dark:border-gray-700">
                        <div className="text-red-600 dark:text-red-400">
                          <p className="font-semibold">Erro ao carregar dados</p>
                          <p className="text-sm mt-1">
                            {employeesError instanceof Error && employeesError.message.includes('CORS')
                              ? 'Erro de CORS: Verifique a configuração do servidor'
                              : employeesError instanceof Error
                              ? employeesError.message
                              : 'Não foi possível conectar ao servidor. Tente novamente mais tarde.'}
                          </p>
                        </div>
                      </td>
                      <td colSpan={getDaysUntilToday(filters.year, filters.month - 1).length + 1} className="px-3 sm:px-6 py-4 text-center">
                        <div className="text-red-600 dark:text-red-400">
                          <p className="text-xs mt-2 text-gray-500 dark:text-gray-400">
                            Verifique o console do navegador para mais detalhes.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : loadingEmployees ? (
                    <tr>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 z-10 border-r border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-center">
                          <div className="loading-spinner w-6 h-6 mr-2" />
                            <span className="text-gray-600 dark:text-gray-400">Carregando...</span>
                        </div>
                      </td>
                      <td colSpan={getDaysUntilToday(filters.year, filters.month - 1).length} className="px-3 sm:px-6 py-4 text-center">
                        <div className="flex items-center justify-center">
                          <div className="loading-spinner w-6 h-6 mr-2" />
                            <span className="text-gray-600 dark:text-gray-400">Carregando...</span>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center sticky right-0 bg-white dark:bg-gray-800 z-10 border-l border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-center">
                          <div className="loading-spinner w-6 h-6 mr-2" />
                            <span className="text-gray-600 dark:text-gray-400">Carregando...</span>
                        </div>
                      </td>
                    </tr>
                  ) : !Array.isArray(employees) || employees.length === 0 ? (
                    <tr>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 z-10 border-r border-gray-200 dark:border-gray-700">
                        <div className="text-gray-500 dark:text-gray-400">
                          <p>Nenhum funcionário encontrado.</p>
                          <p className="text-sm mt-1">Tente ajustar os filtros de busca.</p>
                        </div>
                      </td>
                      <td colSpan={getDaysUntilToday(filters.year, filters.month - 1).length} className="px-3 sm:px-6 py-4 text-center">
                        <div className="text-gray-500 dark:text-gray-400">
                          <p>Nenhum funcionário encontrado.</p>
                          <p className="text-sm mt-1">Tente ajustar os filtros de busca.</p>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center sticky right-0 bg-white dark:bg-gray-800 z-10 border-l border-gray-200 dark:border-gray-700">
                        <div className="text-gray-500 dark:text-gray-400">
                          <p>Nenhum funcionário encontrado.</p>
                          <p className="text-sm mt-1">Tente ajustar os filtros de busca.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    employees.map((employee: PayrollEmployee) => (
                      <tr key={employee.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 z-10 border-r border-gray-200 dark:border-gray-700">
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {employee.name}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                              {employee.department || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              {employee.position || 'N/A'}
                            </div>
                          </div>
                        </td>
                        {/* Células dos dias do mês - DADOS REAIS DO FUNCIONÁRIO - apenas até hoje */}
                        {getDaysUntilToday(filters.year, filters.month - 1).map((day) => {
                          const month = filters.month - 1;
                          const year = filters.year;
                          const date = new Date(year, month, day);
                          const dateString = date.toISOString().split('T')[0];
                          
                          let cellClass = 'px-3 sm:px-6 py-4 text-center text-xs ';
                          let cellContent = '';
                          
                          // Para todos os dias, usar dados reais baseados no funcionário
                          // Buscar dados reais do funcionário usando chave composta (id-mês-ano)
                          const cacheKey = `${employee.id}-${filters.month}-${filters.year}`;
                          const employeeData = employeeDataMap[cacheKey];
                            
                            // Verificar se funcionário estava admitido na data
                            const admissionDate = employeeData?.data?.employee?.admissionDate ? 
                                                 new Date(employeeData.data.employee.admissionDate) : 
                                                 employee.admissionDate ? new Date(employee.admissionDate) : null;
                            
                            if (admissionDate) {
                              const admissionDateString = admissionDate.toISOString().split('T')[0];
                              
                              // Se é antes da admissão
                              if (dateString < admissionDateString) {
                                // Se é final de semana antes da admissão, mostrar como final de semana
                                if (date.getDay() === 0 || date.getDay() === 6) {
                                  cellClass += 'text-gray-400 dark:text-gray-500 font-semibold';
                                  cellContent = 'Final de Semana';
                                } else {
                                  cellClass += 'text-gray-400 dark:text-gray-500';
                                  cellContent = 'N/A';
                                }
                              }
                              // Se é dia da admissão ou depois
                              else {
                                if (employeeData?.data?.days) {
                                  // Encontrar dados do dia específico
                                  const dayData = employeeData.data.days.find((d: any) => d.date === dateString);
                                  
                                  if (dayData) {
                                    // Verificar se é feriado (prioridade sobre tudo)
                                    if (dayData.isHoliday) {
                                      cellClass += 'text-purple-600 dark:text-purple-400 font-semibold';
                                      cellContent = 'Feriado';
                                    }
                                    // Verificar se está em férias (prioridade sobre final de semana)
                                    else if (dayData.isOnVacation) {
                                      cellClass += 'text-green-600 dark:text-green-400 font-semibold';
                                      cellContent = 'Férias';
                                    }
                                    // Verificar se é final de semana
                                    else if (date.getDay() === 0 || date.getDay() === 6) {
                                      cellClass += 'text-gray-400 dark:text-gray-500 font-semibold';
                                      cellContent = 'Final de Semana';
                                    }
                                    // Verificar se há ausência justificada (inclui atestado médico aprovado)
                                    else if (dayData.hasAbsenceJustified || dayData.hasMedicalCertificate) {
                                      cellClass += 'text-orange-600 dark:text-orange-400 font-semibold';
                                      cellContent = getAbsenceTypeLabel(dayData.absenceType, dayData.customAbsenceType);
                                    }
                                    // Se tem pontos, usar o centro de custo do primeiro ponto
                                    else if (dayData.points && dayData.points.length > 0) {
                                      const costCenter = dayData.points[0].costCenter;
                                      cellClass += 'text-blue-600 dark:text-blue-400';
                                      cellContent = costCenter || 'N/A';
                                    }
                                    // Se não tem pontos mas deveria ter (dia útil após admissão)
                                    else {
                                      cellClass += 'text-red-600 dark:text-red-400 font-semibold';
                                      cellContent = 'Falta';
                                    }
                                  } else {
                                    // Se não encontrou dados para o dia
                                    if (date.getDay() === 0 || date.getDay() === 6) {
                                      cellClass += 'text-gray-400 dark:text-gray-500 font-semibold';
                                      cellContent = 'Final de Semana';
                                    } else {
                                      cellClass += 'text-red-600 dark:text-red-400 font-semibold';
                                      cellContent = 'Falta';
                                    }
                                  }
                                } else {
                                  // Se não tem dados do funcionário ainda, mostrar indicador de carregamento
                                  cellClass += 'text-gray-400 dark:text-gray-500';
                                  cellContent = '...';
                                  
                                  // Buscar dados do funcionário em background
                                  fetchEmployeeData(employee.id);
                                }
                              }
                            } else {
                              // Se não tem data de admissão, usar lógica padrão
                              if (employeeData?.data?.days) {
                                const dayData = employeeData.data.days.find((d: any) => d.date === dateString);
                                
                                if (dayData) {
                                  // Verificar se é feriado (prioridade sobre tudo)
                                  if (dayData.isHoliday) {
                                    cellClass += 'text-purple-600 dark:text-purple-400 font-semibold';
                                    cellContent = 'Feriado';
                                  }
                                  // Verificar se está em férias (prioridade sobre final de semana)
                                  else if (dayData.isOnVacation) {
                                    cellClass += 'text-green-600 dark:text-green-400 font-semibold';
                                    cellContent = 'Férias';
                                  }
                                  // Verificar se é final de semana
                                  else if (date.getDay() === 0 || date.getDay() === 6) {
                                    cellClass += 'text-gray-400 dark:text-gray-500 font-semibold';
                                    cellContent = 'Final de Semana';
                                  }
                                  // Verificar se há ausência justificada (inclui atestado médico aprovado)
                                  else if (dayData.hasAbsenceJustified || dayData.hasMedicalCertificate) {
                                    cellClass += 'text-orange-600 dark:text-orange-400 font-semibold';
                                    cellContent = getAbsenceTypeLabel(dayData.absenceType, dayData.customAbsenceType);
                                  } else if (dayData.points && dayData.points.length > 0) {
                                    const costCenter = dayData.points[0].costCenter;
                                    cellClass += 'text-blue-600 dark:text-blue-400';
                                    cellContent = costCenter || 'N/A';
                                  } else {
                                    cellClass += 'text-red-600 dark:text-red-400 font-semibold';
                                    cellContent = 'Falta';
                                  }
                                } else {
                                  // Se não encontrou dados para o dia
                                  if (date.getDay() === 0 || date.getDay() === 6) {
                                    cellClass += 'text-gray-400 dark:text-gray-500 font-semibold';
                                    cellContent = 'Final de Semana';
                                  } else {
                                    cellClass += 'text-red-600 dark:text-red-400 font-semibold';
                                    cellContent = 'Falta';
                                  }
                                }
                              } else {
                                // Se não tem dados do funcionário ainda, mostrar indicador de carregamento
                                cellClass += 'text-gray-400 dark:text-gray-500';
                                cellContent = '...';
                                fetchEmployeeData(employee.id);
                              }
                            }
                          
                          return (
                            <td key={day} className={cellClass}>
                              {cellContent}
                            </td>
                          );
                        })}
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center sticky right-0 bg-white dark:bg-gray-800 z-10 border-l border-gray-200 dark:border-gray-700">
                          <div className="flex justify-center">
                            <button
                              onClick={() => handleViewDetails(employee)}
                              className="inline-flex items-center justify-center h-8 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent dark:bg-transparent hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
                              title="Ver detalhes"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Estatísticas */}
            {employees.length > 0 && (
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center space-x-6">
                    <span>
                      <strong>Período:</strong> {getMonthName(filters.month)} de {filters.year}
                    </span>
                    <span>
                      <strong>Total de funcionários:</strong> {employees.length}
                    </span>
                  </div>
                  {filters.department && (
                    <span>
                      <strong>Setor:</strong> {filters.department}
                    </span>
                  )}
                  {filters.company && (
                    <span>
                      <strong>Empresa:</strong> {filters.company}
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal de Centro de Custo */}
        {isModalOpen && selectedEmployee && (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={requestCloseAllocationModal} />
            <div className="relative w-full max-w-4xl rounded-lg bg-white dark:bg-gray-800 p-6 shadow-lg max-h-[90vh] overflow-y-auto">
              <button
                onClick={requestCloseAllocationModal}
                className="absolute top-3 right-3 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="h-6 w-6" />
              </button>
              
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Centro de Custo - {selectedEmployee.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  CPF: {selectedEmployee.cpf} | Setor: {selectedEmployee.department}
                </p>
              </div>

              {/* Navegação do Mês */}
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={handlePreviousMonth}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                </button>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {getModalMonthName(modalCurrentMonth)} de {modalCurrentYear}
                </h4>
                <button
                  onClick={handleNextMonth}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                </button>
              </div>

              {/* Calendário */}
              {loadingEmployeeData ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">Carregando dados...</span>
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-1 mb-6">
                {/* Cabeçalho dos dias da semana */}
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
                  <div key={day} className="p-2 text-center text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900">
                    {day}
                  </div>
                ))}
                
                {/* Dias do mês - apenas até hoje */}
                {(() => {
                  const daysUntilToday = getDaysUntilToday(modalCurrentYear, modalCurrentMonth);
                  const firstDay = getFirstDayOfMonth(modalCurrentYear, modalCurrentMonth);
                  const firstDayInRange = daysUntilToday.length > 0 ? new Date(modalCurrentYear, modalCurrentMonth, daysUntilToday[0]).getDay() : firstDay;
                  
                  return (
                    <>
                      {/* Espaços vazios antes do primeiro dia */}
                      {Array.from({ length: firstDayInRange }, (_, i) => (
                        <div key={`empty-${i}`} className="p-2 h-12"></div>
                      ))}
                      
                      {/* Dias até hoje */}
                      {daysUntilToday.map((day) => {
                        const date = new Date(modalCurrentYear, modalCurrentMonth, day);
                        
                        // Usar dados reais do funcionário
                        const dayStatus = getDayStatus(day, modalCurrentMonth, modalCurrentYear);
                        
                        return (
                          <div
                            key={day}
                            className={`p-1 h-16 border border-gray-200 dark:border-gray-700 rounded-lg flex flex-col items-center justify-center text-xs font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                              dayStatus.status === 'NAO_ADMITIDO' ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600' : ''
                            } ${
                              dayStatus.status === 'FINAL_DE_SEMANA' ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600' : ''
                            }`}
                            title={`${day} - ${getStatusLabel(dayStatus.status)}${dayStatus.costCenter ? ` (${dayStatus.costCenter})` : ''}`}
                          >
                            <div className="text-gray-600 dark:text-gray-400 mb-1">{day}</div>
                            <div className={`text-xs text-center leading-tight ${getTextColor(dayStatus.costCenter || dayStatus.status)}`}>
                              {dayStatus.status === 'NAO_ADMITIDO' ? 'Não Admitido' : 
                               (dayStatus.costCenter || getStatusLabel(dayStatus.status))}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
                </div>
              )}

              {/* Legenda removida */}
            </div>
          </div>
        )}
        {allocationModalConfirmUi}
      </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
