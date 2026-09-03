'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Clock, Calendar, Filter, Download, Search, Building2, User, CreditCard, ChevronDown, ChevronUp, ListPlus, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { DEPARTMENTS_LIST, CLIENTS_LIST, POLOS_LIST } from '@/constants/payrollFilters';
import { useCostCenters } from '@/hooks/useCostCenters';
import { CARGOS_LIST } from '@/constants/cargos';
import * as XLSX from 'xlsx';
import api from '@/lib/api';
import { listTableRowClasses } from '@/components/ui/listTableUi';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

const BANK_HOURS_STATUS_OPTIONS = labeledToSelectOptions([
  { value: 'positive', label: 'Positivo' },
  { value: 'negative', label: 'Negativo' },
  { value: 'zero', label: 'Neutro' },
]);

interface BankHoursData {
  employeeId: string;
  employeeName: string;
  employeeCpf: string;
  department: string;
  position: string;
  costCenter?: string;
  client?: string;
  hireDate: string;
  actualStartDate: string;
  totalWorkedHours: number;
  totalExpectedHours: number;
  bankHours: number;
  overtimeHours: number;
  overtimeMultipliedHours: number;
  pendingHours: number;
  lastUpdate: string;
}

interface BankHoursFilters {
  search?: string;
  department?: string;
  position?: string;
  costCenter?: string;
  client?: string;
  polo?: string;
  status?: string;
  startDate: string;
  endDate: string;
}

function BankHoursPageContent() {
  const { costCentersList } = useCostCenters();
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const [filters, setFilters] = useState<BankHoursFilters>(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 1, 0, 0);
    const today = new Date();
    return {
      search: '',
      department: 'Departamento Pessoal',
      position: '',
      costCenter: '',
      client: '',
      polo: '',
      status: '',
      startDate: firstDay.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0]
    };
  });

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(true); // Minimizados por padrão

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, search: e.target.value }));
  };

  const handleDepartmentChange = (value: string) => {
    setFilters(prev => ({ ...prev, department: value }));
  };

  const handlePositionChange = (value: string) => {
    setFilters(prev => ({ ...prev, position: value }));
  };

  const handleCostCenterChange = (value: string) => {
    setFilters(prev => ({ ...prev, costCenter: value }));
  };

  const handleClientChange = (value: string) => {
    setFilters(prev => ({ ...prev, client: value }));
  };

  const handlePoloChange = (value: string) => {
    setFilters(prev => ({ ...prev, polo: value }));
  };

  const handleStatusChange = (value: string) => {
    setFilters(prev => ({ ...prev, status: value }));
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, startDate: e.target.value }));
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, endDate: e.target.value }));
  };

  const clearFilters = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 1, 0, 0);
    const today = new Date();
    setFilters({
      search: '',
      department: '',
      position: '',
      costCenter: '',
      client: '',
      status: '',
      startDate: firstDay.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0]
    });
  };

  const clearAdvancedFilters = () => {
    setFilters(prev => ({
      ...prev,
      department: '',
      position: '',
      costCenter: '',
      client: '',
      status: ''
    }));
  };

  const { data: bankHoursData, isLoading: loadingBankHours, error: bankHoursError } = useQuery({
    queryKey: ['bank-hours', filters],
    queryFn: async () => {
      try {
        const res = await api.get('/bank-hours/employees', {
          params: { 
            search: filters.search,
            department: filters.department,
            position: filters.position,
            costCenter: filters.costCenter,
            client: filters.client,
            polo: filters.polo,
            status: filters.status,
            startDate: filters.startDate, 
            endDate: filters.endDate
          }
        });
        console.log('📊 Resposta da API banco de horas:', res.data);
        return res.data;
      } catch (error: any) {
        console.error('❌ Erro ao buscar banco de horas:', error);
        console.error('❌ Detalhes do erro:', error.response?.data || error.message);
        throw error;
      }
    },
    retry: 2,
    retryDelay: 1000
  });

  const formatHours = (hours: number) => {
    const totalMinutes = Math.abs(hours) * 60;
    const h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60);
    const s = Math.floor((totalMinutes % 1) * 60);
    
    const sign = hours >= 0 ? '+' : '-';
    return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatHoursNoSign = (hours: number) => {
    const totalMinutes = Math.abs(hours) * 60;
    const h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60);
    const s = Math.floor((totalMinutes % 1) * 60);
    
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (bankHours: number) => {
    if (bankHours > 0) return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
    if (bankHours < 0) return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
    return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700';
  };

  const getStatusText = (bankHours: number) => {
    if (bankHours > 0) return 'Positivo';
    if (bankHours < 0) return 'Negativo';
    return 'Neutro';
  };

  const exportToExcel = () => {
    if (!Array.isArray(filteredData) || filteredData.length === 0) {
      alert('Nenhum dado para exportar');
      return;
    }

    // Preparar dados para exportação
    const exportData = filteredData.map((employee: BankHoursData) => ({
      'Data Inicial': filters.startDate,
      'Data Final': filters.endDate,
      'Funcionário': employee.employeeName,
      'CPF': employee.employeeCpf,
      'Setor': employee.department,
      'Cargo': employee.position,
      'Centro de Custo': employee.costCenter || '-',
      'Tomador': employee.client || '-',
      'Horas Esperadas': formatHoursNoSign(employee.totalExpectedHours),
      'Horas Trabalhadas': formatHoursNoSign(employee.totalWorkedHours),
      'Horas Extras (ponderadas)': formatHoursNoSign(employee.overtimeMultipliedHours),
      'Horas Devidas': formatHoursNoSign(employee.pendingHours),
      'Saldo Atual': formatHours(employee.bankHours)
    }));

    // Criar workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Ajustar largura das colunas
    const colWidths = [
      { wch: 12 }, // Data Inicial
      { wch: 12 }, // Data Final
      { wch: 20 }, // Funcionário
      { wch: 15 }, // CPF
      { wch: 15 }, // Setor
      { wch: 15 }, // Cargo
      { wch: 15 }, // Centro de Custo
      { wch: 15 }, // Tomador
      { wch: 15 }, // Horas Trabalhadas
      { wch: 15 }, // Horas Esperadas
      { wch: 15 }, // Banco de Horas
      { wch: 20 }, // Horas Extras (Multiplicadas)
      { wch: 10 }  // Status
    ];
    ws['!cols'] = colWidths;

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Banco de Horas');

    // Gerar nome do arquivo com período
    const formatDateForFileName = (dateString: string) => {
      // Parsear a data manualmente para evitar problemas de timezone
      // dateString está no formato "YYYY-MM-DD"
      const [year, month, day] = dateString.split('-').map(Number);
      return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
    };

    const startDateFormatted = formatDateForFileName(filters.startDate);
    const endDateFormatted = formatDateForFileName(filters.endDate);
    const fileName = `Banco_Horas_${startDateFormatted}_a_${endDateFormatted}.xlsx`;

    // Salvar arquivo
    XLSX.writeFile(wb, fileName);
  };



  if (loadingUser || !userData) {
    return (
      <Loading 
        message="Carregando banco de horas..."
        fullScreen
        size="lg"
      />
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00',
    role: 'EMPLOYEE'
  };

  const filteredData = bankHoursData?.data || [];
  
  // Log para debug
  console.log('📊 bankHoursData:', bankHoursData);
  console.log('📊 filteredData:', filteredData);
  console.log('📊 filteredData length:', filteredData?.length);
  console.log('❌ Erro banco de horas:', bankHoursError);

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Controle de Banco de Horas</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Acompanhamento do banco de horas de todos os funcionários</p>
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
              {/* Campo de Busca Principal */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                    Data Inicial
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                    <input
                      type="date"
                      value={filters.startDate}
                      onChange={handleStartDateChange}
                      className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Data Final
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                    <input
                      type="date"
                      value={filters.endDate}
                      onChange={handleEndDateChange}
                      className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                    />
                  </div>
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
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                          <StringSingleSelectDropdown
                            value={filters.department ?? ''}
                            onChange={handleDepartmentChange}
                            options={DEPARTMENTS_LIST || []}
                            emptyOptionLabel="Todos os setores"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Cargo
                        </label>
                        <StringSingleSelectDropdown
                          value={filters.position ?? ''}
                          onChange={handlePositionChange}
                          options={CARGOS_LIST || []}
                          emptyOptionLabel="Todos os cargos"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Status do Banco
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 z-10 pointer-events-none" />
                          <StringSingleSelectDropdown
                            value={filters.status ?? ''}
                            onChange={handleStatusChange}
                            options={BANK_HOURS_STATUS_OPTIONS}
                            emptyOptionLabel="Todos os status"
                            className="[&>button]:pl-10"
                          />
                        </div>
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
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 z-10 pointer-events-none" />
                          <StringSingleSelectDropdown
                            value={filters.costCenter ?? ''}
                            onChange={handleCostCenterChange}
                            options={costCentersList}
                            emptyOptionLabel="Todos os centros de custo"
                            className="[&>button]:pl-10"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Tomador
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                          <StringSingleSelectDropdown
                            value={filters.client ?? ''}
                            onChange={handleClientChange}
                            options={CLIENTS_LIST || []}
                            emptyOptionLabel="Todos os tomadores"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Polo
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                          <StringSingleSelectDropdown
                            value={filters.polo ?? ''}
                            onChange={handlePoloChange}
                            options={POLOS_LIST || []}
                            emptyOptionLabel="Todos os polos"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              </div>
            </CardContent>
          )}
        </Card>


        {/* Tabela de Banco de Horas */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                  <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Banco de Horas</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Cálculo do banco de horas de todos os funcionários</p>
                </div>
              </div>
              <button 
                onClick={exportToExcel}
                className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Exportar</span>
                <span className="sm:hidden">Exportar</span>
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="table-scroll">
              <table className="w-full">
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Funcionário
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                      Setor
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">
                      Centro de Custo
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                      Tomador
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                      Horas Esperadas
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                      Horas Trabalhadas
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Horas Extras
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Horas Devidas
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Saldo Atual
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {bankHoursError ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center">
                        <div className="text-red-600 dark:text-red-400">
                          <p className="font-semibold">Erro ao carregar dados</p>
                          <p className="text-sm mt-1">
                            {bankHoursError instanceof Error && bankHoursError.message.includes('CORS')
                              ? 'Erro de CORS: Verifique a configuração do servidor'
                              : bankHoursError instanceof Error
                              ? bankHoursError.message
                              : 'Não foi possível conectar ao servidor. Tente novamente mais tarde.'}
                          </p>
                          <p className="text-xs mt-2 text-gray-500 dark:text-gray-400">
                            Verifique o console do navegador para mais detalhes.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : loadingBankHours ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center">
                        <CadastroListLoading message="Carregando banco de horas..." />
                      </td>
                    </tr>
                  ) : !Array.isArray(filteredData) || filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center">
                        <div className="text-gray-500 dark:text-gray-400">
                          <p>Nenhum funcionário encontrado.</p>
                          <p className="text-sm mt-1">Tente ajustar os filtros de busca.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((employee: BankHoursData) => (
                      <tr key={employee.employeeId} className={listTableRowClasses.tr}>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                          <div>
                            <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                              {employee.employeeName}
                            </span>
                            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                              {employee.employeeCpf}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500 sm:hidden">
                              {employee.department && `${employee.department} • ${employee.costCenter || 'N/A'}`}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden sm:table-cell">
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {employee.department || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {employee.position || 'N/A'}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden md:table-cell">
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {employee.costCenter || 'N/A'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden lg:table-cell">
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {employee.client || 'N/A'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden lg:table-cell">
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {formatHoursNoSign(employee.totalExpectedHours)}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden lg:table-cell">
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {formatHoursNoSign(employee.totalWorkedHours)}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {formatHoursNoSign(employee.overtimeMultipliedHours)}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {formatHoursNoSign(employee.pendingHours)}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                          <span className={`text-sm font-bold ${employee.bankHours >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatHours(employee.bankHours)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Estatísticas */}
            {filteredData.length > 0 && (
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center space-x-6">
                    <span>
                      <strong>Período:</strong> {new Date(filters.startDate + 'T00:00:00').toLocaleDateString('pt-BR')} até {new Date(filters.endDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </span>
                    <span>
                      <strong>Total de funcionários:</strong> {filteredData.length}
                    </span>
                  </div>
                  {filters.department && (
                    <span>
                      <strong>Setor:</strong> {filters.department}
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </MainLayout>
  );
}

export default function BankHoursPage() {
  return (
    <ProtectedRoute route="/ponto/banco-horas">
      <BankHoursPageContent />
    </ProtectedRoute>
  );
}
