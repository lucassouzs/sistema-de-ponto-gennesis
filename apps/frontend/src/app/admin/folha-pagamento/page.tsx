'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { DollarSign, Search, Filter, Download, Calculator, Calendar, Clock, BadgeDollarSign, FileSpreadsheet, Building2, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { PayrollDetailModal } from '@/components/payroll/PayrollDetailModal';
import api from '@/lib/api';
import { PayrollEmployee, PayrollFilters, MonthlyPayrollData } from '@/types';
import * as XLSX from 'xlsx';

// Remover interfaces duplicadas - já importadas do types

export default function FolhaPagamentoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  // Obter mês e ano atual
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  
  const [filters, setFilters] = useState<PayrollFilters>({
    search: '',
    department: '',
    company: '',
    month: currentMonth,
    year: currentYear
  });
  const [selectedEmployee, setSelectedEmployee] = useState<PayrollEmployee | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: payrollResponse, isLoading: loadingPayroll } = useQuery({
    queryKey: ['payroll-monthly', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.department) params.append('department', filters.department);
      if (filters.company) params.append('company', filters.company);
      params.append('month', filters.month.toString());
      params.append('year', filters.year.toString());
      
      const res = await api.get(`/payroll/employees?${params.toString()}`);
      return res.data;
    }
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
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

  const handleViewDetails = (employee: PayrollEmployee) => {
    setSelectedEmployee(employee);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedEmployee(null);
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
      month: currentMonth,
      year: currentYear
    });
  };

  const exportToExcel = () => {
    if (!payrollData || payrollData.employees.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    // Preparar dados para exportação
    const exportData = payrollData.employees.map(employee => ({
      'Nome': `${employee.name} (CPF: ${employee.cpf})`,
      'Função/Setor': `${employee.position || 'N/A'} • ${employee.department || 'N/A'}`,
      'ID Funcionário': employee.employeeId,
      'Empresa': employee.company || 'Não informado',
      'Centro/Contrato': `${employee.costCenter || 'N/A'} • ${employee.currentContract || 'N/A'}`,
      'Cliente': employee.client || 'Não informado',
      'Dados Bancários': `${employee.bank || 'N/A'} • ${employee.accountType || 'N/A'} • Ag: ${employee.agency || 'N/A'} • OP: ${employee.operation || 'N/A'} • Conta: ${employee.account || 'N/A'}-${employee.digit || 'N/A'}`,
      'PIX': `${employee.pixKeyType || 'N/A'} - ${employee.pixKey || 'N/A'}`,
      'Modalidade': employee.modality || 'Não informado',
      'Salário Base': employee.salary,
      'Salário Família': employee.familySalary,
      'Periculosidade (R$)': employee.dangerPay ? (employee.salary * (employee.dangerPay / 100)) : 0,
      'Insalubridade (R$)': employee.unhealthyPay ? (1518 * (employee.unhealthyPay / 100)) : 0,
      'VA Diário': employee.dailyFoodVoucher,
      'VT Diário': employee.dailyTransportVoucher,
      'Total VA': employee.totalFoodVoucher,
      'Total VT': employee.totalTransportVoucher,
      'Total VA+VT': employee.totalFoodVoucher + employee.totalTransportVoucher,
      'Acréscimos': employee.totalAdjustments,
      'Descontos': employee.totalDiscounts,
      'Presença': `Dias: ${employee.daysWorked} • Faltas: ${employee.totalWorkingDays ? (employee.totalWorkingDays - employee.daysWorked) : 0}`,
      'Desconto por Faltas': (() => {
        const salario = employee.salary;
        const periculosidade = employee.dangerPay ? (employee.salary * (employee.dangerPay / 100)) : 0;
        const insalubridade = employee.unhealthyPay ? (1518 * (employee.unhealthyPay / 100)) : 0;
        const faltas = employee.totalWorkingDays ? (employee.totalWorkingDays - employee.daysWorked) : 0;
        return ((salario + periculosidade + insalubridade) / 30) * faltas;
      })()
    }));

    // Criar planilha
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Folha de Pagamento');

    // Gerar nome do arquivo
    const monthName = payrollData.period.monthName;
    const year = payrollData.period.year;
    const fileName = `Folha_Pagamento_${monthName}_${year}.xlsx`;

    // Baixar arquivo
    XLSX.writeFile(wb, fileName);
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00',
    role: 'ADMIN'
  };

  // Verificar se é admin
  if (user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Acesso Negado</h1>
          <p className="text-gray-600">Você não tem permissão para acessar esta página.</p>
        </div>
      </div>
    );
  }

  const payrollData: MonthlyPayrollData | null = payrollResponse?.data || null;
  const employees: PayrollEmployee[] = payrollData?.employees || [];
  const uniqueDepartments = Array.from(
    new Set(employees.map(emp => emp.department).filter(Boolean))
  ).sort();

  // Opções de mês e ano
  const monthOptions = [
    { value: 1, label: 'Janeiro' },
    { value: 2, label: 'Fevereiro' },
    { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Maio' },
    { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' },
    { value: 11, label: 'Novembro' },
    { value: 12, label: 'Dezembro' }
  ];

  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center space-x-3 mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Folha de Pagamento</h1>
          </div>
          <p className="text-sm sm:text-base text-gray-600">Gerencie e visualize informações salariais dos funcionários</p>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Filter className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-4">
              {/* Primeira linha - Busca e filtros básicos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Buscar Funcionário
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={filters.search}
                    onChange={handleSearchChange}
                    placeholder="Digite o nome do funcionário..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Empresa
                  </label>
                  <div className="relative">
                    {/* <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" /> */}
                    <select
                      value={filters.company}
                      onChange={handleCompanyChange}
                      className="w-full pl-4 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                    >
                      <option value="">Todas</option>
                      <option value="GÊNNESIS">GÊNNESIS</option>
                      <option value="MÉTRICA">MÉTRICA</option>
                      <option value="ABRASIL">ABRASIL</option>
                    </select>
                  </div>
                </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mês
                </label>
                <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <select
                      value={filters.month}
                      onChange={handleMonthChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                    >
                      {monthOptions.map(month => (
                        <option key={month.value} value={month.value}>
                          {month.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

                <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ano
                </label>
                <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <select
                      value={filters.year}
                      onChange={handleYearChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                    >
                      {yearOptions.map(year => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                </div>
              </div>
            </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Funcionários */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 rounded-lg flex-shrink-0">
                  <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">Folha de Pagamento</h3>
                  <p className="text-sm text-gray-600">Dados de remuneração dos funcionários</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={exportToExcel}
                  disabled={!payrollData || payrollData.employees.length === 0}
                  className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
                  title="Exportar para Excel"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Exportar XLSX</span>
                  <span className="sm:hidden">Exportar</span>
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                      Setor
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                      Empresa
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                      Contrato
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                      Tomador
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Líquido Total
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loadingPayroll ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center">
                        <div className="flex items-center justify-center">
                          <div className="loading-spinner w-6 h-6 mr-2" />
                          <span className="text-gray-600">Carregando folha de pagamento...</span>
                        </div>
                      </td>
                    </tr>
                  ) : employees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center">
                        <div className="text-gray-500">
                          <p>Nenhum funcionário encontrado.</p>
                          <p className="text-sm mt-1">Tente ajustar os filtros de busca.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    employees.map((employee) => (
                      <tr key={employee.id} className="hover:transition-colors">
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {employee.name}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-500">
                              {employee.cpf || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-400 sm:hidden">
                              {employee.department && `${employee.department} • ${employee.company || 'N/A'}`}
                            </div>
                            <div className="text-xs text-gray-400">
                              {employee.employeeId && `ID: ${employee.employeeId}`}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden sm:table-cell">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {employee.department || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {employee.position || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-400">
                              {employee.modality || 'N/A'}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden md:table-cell">
                          <span className="text-sm text-gray-900">
                            {employee.company || 'N/A'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden lg:table-cell">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {employee.costCenter || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {employee.currentContract || 'N/A'}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center hidden lg:table-cell">
                          <span className="text-sm text-gray-900">
                            {employee.client || 'N/A'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                          <span className="text-sm font-bold text-green-600">
                            R$ {(() => {
                              const salarioBase = employee.salary;
                              const periculosidade = employee.dangerPay ? (employee.salary * (employee.dangerPay / 100)) : 0;
                              const insalubridade = employee.unhealthyPay ? (1518 * (employee.unhealthyPay / 100)) : 0;
                              const salarioFamilia = employee.familySalary || 0;
                              const faltas = employee.totalWorkingDays ? (employee.totalWorkingDays - employee.daysWorked) : 0;
                              const descontoPorFaltas = ((salarioBase + periculosidade + insalubridade) / 30) * faltas;
                              const totalProventos = salarioBase + periculosidade + insalubridade + salarioFamilia + employee.totalAdjustments;
                              const totalDescontos = employee.totalDiscounts + descontoPorFaltas;
                              const liquidoReceber = totalProventos - totalDescontos;
                              return liquidoReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            })()}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => handleViewDetails(employee)}
                            className="p-2 text-yellow-600 hover:text-yellow-600 hover:bg-yellow-100 rounded-lg transition-colors"
                            title="Folha de Pagamento"
                          >
                            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Estatísticas */}
            {employees.length > 0 && payrollData && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <div className="flex items-center space-x-6">
                    <span>
                      <strong>Período:</strong> {payrollData.period.monthName} de {payrollData.period.year}
                    </span>
                  <span>
                      <strong>Total de funcionários:</strong> {payrollData.totals.totalEmployees}
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
      </div>

      {/* Modal de Detalhes */}
      {selectedEmployee && (
        <PayrollDetailModal
          employee={selectedEmployee}
          month={filters.month}
          year={filters.year}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}
    </MainLayout>
  );
}
