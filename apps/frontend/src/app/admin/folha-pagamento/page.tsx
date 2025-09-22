'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { DollarSign, Search, Filter, Download, Calculator, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import api from '@/lib/api';
import { PayrollEmployee, PayrollFilters, MonthlyPayrollData } from '@/types';

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
            <h1 className="text-3xl font-bold text-gray-900">Folha de Pagamento</h1>
          </div>
          <p className="text-gray-600">Gerencie e visualize informações salariais dos funcionários</p>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Filter className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {/* Primeira linha - Busca e filtros básicos */}
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1">
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
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
                <div className="sm:w-48">
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

                <div className="sm:w-32">
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
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Função
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Setor
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Empresa
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Centro de Custo
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contrato Atual
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tomador
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      CPF
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Banco
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tipo de Conta
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Agência
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      OP.
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Conta
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Digito
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tipo de Chave
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Chave Pix
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      VA (DIÁRIO)
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      VT (DIÁRIO)
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      TOTAL VA
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      TOTAL VT
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acréscimos
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Salário
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loadingPayroll ? (
                    <tr>
                      <td colSpan={22} className="px-6 py-8 text-center">
                        <div className="flex items-center justify-center">
                          <div className="loading-spinner w-6 h-6 mr-2" />
                          <span className="text-gray-600">Carregando folha de pagamento...</span>
                        </div>
                      </td>
                    </tr>
                  ) : employees.length === 0 ? (
                    <tr>
                      <td colSpan={22} className="px-6 py-8 text-center">
                        <div className="text-gray-500">
                          <p>Nenhum funcionário encontrado.</p>
                          <p className="text-sm mt-1">Tente ajustar os filtros de busca.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    employees.map((employee) => (
                      <tr key={employee.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {employee.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {employee.employeeId && `Matrícula: ${employee.employeeId}`}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.position || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.department || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.company || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.costCenter || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.currentContract || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.client || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.cpf || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.bank || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.accountType || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.agency || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.operation || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.account || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.digit || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.pixKeyType || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {employee.pixKey || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            R$ {employee.dailyFoodVoucher.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            R$ {employee.dailyTransportVoucher.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-green-600">
                            R$ {employee.totalFoodVoucher.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-blue-600">
                            R$ {employee.totalTransportVoucher.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">
                            R$ {employee.totalAdjustments.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">
                            R$ {employee.salary.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
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
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
