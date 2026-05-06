'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Filter, Loader2, RotateCcw, DollarSign, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { COMPANIES_LIST } from '@/constants/payrollFilters';
import { useCostCenters } from '@/hooks/useCostCenters';

export default function FinanceiroPage() {
  const { costCentersList } = useCostCenters();
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({
    company: '',
    costCenter: '',
    month: currentMonth,
    year: currentYear
  });

  const [showPreview, setShowPreview] = useState(false);

  // Verificar status da folha
  const { data: payrollStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['payroll-status', filters.month, filters.year],
    queryFn: async () => {
      const res = await api.get(`/payroll/status?month=${filters.month}&year=${filters.year}`);
      return res.data;
    }
  });

  const isFinalized = payrollStatus?.data?.isFinalized || false;
  const { isDepartmentFinanceiro, userPosition } = usePermissions();
  
  // Verificar se o usuário pode reabrir a folha (Financeiro ou Administrador)
  const canReopenPayroll = isDepartmentFinanceiro || userPosition === 'Administrador';

  // Função para reabrir a folha
  const handleReopenPayroll = async () => {
    if (!confirm('Tem certeza que deseja reabrir esta folha de pagamento? O Departamento Pessoal poderá fazer correções.')) {
      return;
    }

    try {
      await api.post('/payroll/reopen', {
        month: filters.month,
        year: filters.year
      });
      
      await refetchStatus();
      queryClient.invalidateQueries({ queryKey: ['payroll-status'] });
      alert('Folha de pagamento reaberta com sucesso! O Departamento Pessoal pode fazer correções.');
    } catch (error: any) {
      console.error('Erro ao reabrir folha:', error);
      alert(error.response?.data?.message || 'Erro ao reabrir folha de pagamento. Tente novamente.');
    }
  };

  const { data: borderData, isLoading, error, refetch } = useQuery({
    queryKey: ['border-data', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.company) params.append('company', filters.company);
      if (filters.costCenter) params.append('costCenter', filters.costCenter);
      params.append('month', filters.month.toString());
      params.append('year', filters.year.toString());
      
      const res = await api.get(`/border/data?${params.toString()}`);
      return res.data;
    },
    enabled: false // Não buscar automaticamente
  });

  const handleGeneratePDF = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.company) params.append('company', filters.company);
      if (filters.costCenter) params.append('costCenter', filters.costCenter);
      params.append('month', filters.month.toString());
      params.append('year', filters.year.toString());

      const response = await api.get(`/border/pdf?${params.toString()}`, {
        responseType: 'blob'
      });

      // Criar link para download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `bordero-pagamento-${filters.month.toString().padStart(2, '0')}-${filters.year}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar borderô. Tente novamente.');
    }
  };

  const handleGenerateCNAB = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.company) params.append('company', filters.company);
      if (filters.costCenter) params.append('costCenter', filters.costCenter);
      params.append('month', filters.month.toString());
      params.append('year', filters.year.toString());

      const response = await api.get(`/border/cnab400?${params.toString()}`, {
        responseType: 'blob'
      });

      // Criar link para download
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/plain; charset=ISO-8859-1' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `CNAB400-${filters.month.toString().padStart(2, '0')}-${filters.year}.REM`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Erro ao gerar CNAB400:', error);
      alert('Erro ao gerar arquivo CNAB400. Tente novamente.');
    }
  };


  const handlePreview = async () => {
    setShowPreview(true);
    try {
      await refetch();
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    }
  };

  const totalAmount = borderData?.data?.reduce((sum: number, item: any) => sum + item.amount, 0) || 0;

  return (
    <ProtectedRoute route="/ponto/financeiro">
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={() => {}}>
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Módulo Financeiro
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Gere borderôs de pagamento em PDF e arquivos CNAB400 para envio ao banco
            </p>
          </div>

          {/* Status da Folha */}
          {!isFinalized && (
            <Card className="border-yellow-200 dark:border-yellow-800">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                      Folha de Pagamento Pendente
                    </h3>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      A folha de pagamento ainda não foi finalizada pelo Departamento Pessoal. 
                      Aguarde a finalização para gerar os documentos de pagamento.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {isFinalized && (
            <Card className="border-green-200 dark:border-green-800">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-1">
                        Folha de Pagamento Finalizada
                      </h3>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        A folha de pagamento foi finalizada. Você pode gerar os documentos de pagamento.
                      </p>
                    </div>
                  </div>
                  {canReopenPayroll && (
                    <button
                      onClick={handleReopenPayroll}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm whitespace-nowrap"
                      title="Reabrir folha de pagamento para correções"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Reabrir Folha</span>
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filtros */}
          <Card>
            <CardHeader className="border-b-0">
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Filtro de Empresa */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Empresa
                  </label>
                  <select
                    value={filters.company}
                    onChange={(e) => setFilters({ ...filters, company: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">Todas as empresas</option>
                    {COMPANIES_LIST.map((company) => (
                      <option key={company} value={company}>
                        {company}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtro de Centro de Custo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Centro de Custo
                  </label>
                  <select
                    value={filters.costCenter}
                    onChange={(e) => setFilters({ ...filters, costCenter: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">Todos os centros de custo</option>
                    {costCentersList.map((costCenter) => (
                      <option key={costCenter} value={costCenter}>
                        {costCenter}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtro de Mês */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mês
                  </label>
                  <select
                    value={filters.month}
                    onChange={(e) => setFilters({ ...filters, month: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                      <option key={month} value={month}>
                        {new Date(2024, month - 1).toLocaleString('pt-BR', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtro de Ano */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ano
                  </label>
                  <select
                    value={filters.year}
                    onChange={(e) => setFilters({ ...filters, year: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
                  >
                    {Array.from({ length: 10 }, (_, i) => currentYear - 2 + i).map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={handlePreview}
                  disabled={isLoading || !isFinalized}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  title={!isFinalized ? 'Aguarde a finalização da folha pelo DP' : 'Visualizar dados do borderô'}
                >
                  <FileText className="w-4 h-4" />
                  Visualizar Dados
                </button>
                <button
                  onClick={handleGeneratePDF}
                  disabled={isLoading || !isFinalized}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  title={!isFinalized ? 'Aguarde a finalização da folha pelo DP' : 'Gerar borderô em PDF'}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Gerar Borderô PDF
                    </>
                  )}
                </button>
                <button
                  onClick={handleGenerateCNAB}
                  disabled={isLoading || !isFinalized}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  title={!isFinalized ? 'Aguarde a finalização da folha pelo DP' : 'Gerar arquivo CNAB400 para Itaú'}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Gerar CNAB400 (Itaú)
                    </>
                  )}
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Preview dos dados */}
          {showPreview && borderData?.data && borderData.data.length > 0 && (
            <Card>
              <CardHeader className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Dados para Pagamento</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Visualize os funcionários e valores antes de gerar o arquivo</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Resumo */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Período</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {new Date(filters.year, filters.month - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Total de Funcionários</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {borderData.data.length}
                    </p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Valor Total</p>
                    <p className="text-lg font-bold text-red-700 dark:text-red-300">
                      R$ {totalAmount.toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                </div>

                {/* Tabela */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Data
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Nome
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Valor
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Banco
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Agência
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Conta
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                      {borderData.data.map((item: any, index: number) => (
                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {item.date}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {item.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right font-medium">
                            R$ {item.amount.toFixed(2).replace('.', ',')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {item.bank || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {item.agency || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {item.account ? `${item.account}${item.digit ? '-' + item.digit : ''}` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                          TOTAL
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-400 text-right">
                          R$ {totalAmount.toFixed(2).replace('.', ',')}
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {error && (
            <Card className="border-red-500">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
                      Erro ao carregar dados
                    </h3>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {error instanceof Error ? error.message : 'Erro desconhecido'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
