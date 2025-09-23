'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Clock, Users, TrendingUp, Calendar, Filter, Download } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ChangePasswordModal } from '@/components/ui/ChangePasswordModal';
import * as XLSX from 'xlsx';
import api from '@/lib/api';

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

export default function BankHoursPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const [startDateFilter, setStartDateFilter] = useState(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 1, 0, 0);
    return firstDay.toISOString().split('T')[0];
  });
  const [endDateFilter, setEndDateFilter] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [costCenterFilter, setCostCenterFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  // Listener para abrir modal de alterar senha via sidebar
  useEffect(() => {
    const handleOpenChangePasswordModal = () => {
      setIsChangePasswordOpen(true);
    };

    window.addEventListener('openChangePasswordModal', handleOpenChangePasswordModal);
    
    return () => {
      window.removeEventListener('openChangePasswordModal', handleOpenChangePasswordModal);
    };
  }, []);

  // Verificar se o usuário tem permissão para acessar esta página
  if (userData?.data?.role === 'EMPLOYEE') {
    router.push('/ponto');
    return null;
  }


  const { data: bankHoursData, isLoading: loadingBankHours } = useQuery({
    queryKey: ['bank-hours', startDateFilter, endDateFilter, departmentFilter, statusFilter, costCenterFilter, clientFilter],
    queryFn: async () => {
      const res = await api.get('/bank-hours/employees', {
        params: { 
          startDate: startDateFilter, 
          endDate: endDateFilter, 
          department: departmentFilter, 
          status: statusFilter,
          costCenter: costCenterFilter,
          client: clientFilter
        }
      });
      return res.data;
    }
  });

  const formatHours = (hours: number) => {
    const sign = hours >= 0 ? '+' : '';
    return `${sign}${hours.toFixed(1)}h`;
  };

  const formatTime = (hours: number) => {
    const totalMinutes = Math.abs(hours) * 60;
    const h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60);
    const s = Math.floor((totalMinutes % 1) * 60);
    
    const sign = hours >= 0 ? '+' : '-';
    return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (bankHours: number) => {
    if (bankHours > 0) return 'text-green-600 bg-green-100';
    if (bankHours < 0) return 'text-red-600 bg-red-100';
    return 'text-gray-600 bg-gray-100';
  };

  const getStatusText = (bankHours: number) => {
    if (bankHours > 0) return 'Positivo';
    if (bankHours < 0) return 'Negativo';
    return 'Neutro';
  };

  const exportToExcel = () => {
    if (!filteredData || filteredData.length === 0) {
      alert('Nenhum dado para exportar');
      return;
    }

    // Preparar dados para exportação
    const exportData = filteredData.map((employee: BankHoursData) => ({
      'Data Inicial': startDateFilter,
      'Data Final': endDateFilter,
      'Funcionário': employee.employeeName,
      'CPF': employee.employeeCpf,
      'Setor': employee.department,
      'Cargo': employee.position,
      'Centro de Custo': employee.costCenter || '-',
      'Tomador': employee.client || '-',
      'Horas Trabalhadas': formatTime(employee.totalWorkedHours),
      'Horas Esperadas': formatTime(employee.totalExpectedHours),
      'Banco de Horas': formatTime(employee.bankHours),
      'Horas Extras (Multiplicadas)': formatTime(employee.overtimeMultipliedHours),
      'Status': getStatusText(employee.bankHours)
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

    // Gerar nome do arquivo
    const fileName = `banco-horas.xlsx`;

    // Salvar arquivo
    XLSX.writeFile(wb, fileName);
  };

  const departments = [
    'Todos',
    'Engenharia Civil',
    'Engenharia Elétrica',
    'Engenharia Mecânica',
    'Engenharia de Software',
    'Recursos Humanos',
    'Financeiro',
    'Comercial',
    'Marketing',
    'Operações',
    'Qualidade',
    'Segurança do Trabalho',
    'Administrativo',
    'Tecnologia da Informação',
    'Projetos',
    'Manutenção',
    'Produção',
    'Vendas',
    'Atendimento ao Cliente',
    'Jurídico',
    'Contabilidade',
    'Compras',
    'Almoxarifado'
  ];

  const costCenters = [
    'Todos',
    'SEDES',
    'DF - ADM LOCAL',
    'ITAMARATY - SERVIÇOS EVENTUAIS',
    'ITAMARATY - MÃO DE OBRA',
    'SES GDF - LOTE 14',
    'SES GDF - LOTE 10',
    'ADM CENTRAL ENGPAC',
    'DIRETOR'
  ];

  const clients = [
    'Todos',
    '004 - ADMINISTRATIVO DF',
    '017 - CODEVASF',
    '022 - UFRN 2',
    '056 - SUPERINTENDENCIA REGIONAL DA RFB NA 4A R',
    '058 - INCRA NATAL',
    '064 - UFRN PINTURA',
    '068 - PARQUE 3 RUAS - JOÃO PESSOA',
    '069 - SUBSECAO JUDICIARIA ANAPOLIS-GO',
    '070 - SUBSECAO JUDICIARIA RIO VERDE-GO',
    '071 - SUBSECAO JUDICIARIA ITUMBIARA-GO',
    '072 - SUBSECAO JUDICIARIA LUZIANIA-GO',
    '073 - SUBSECAO JUDICIARIA URUACU-GO',
    '074 - SUBSECAO JUDICIARIA FORMOSA-GO',
    '075 - SUBSECAO JUDICIARIA JATAI-GO',
    '076 - MIN DAS RELAÇÕES EXTERIORES -ITAMARATY',
    '077 - SEDES - SEC EST DESENVOLVIMENTO SOCIAL DF',
    '078 - SES - SEC ESTADO DE SAUDE -TAGUATINGA',
    '079 - SES - SEC ESTADO DE SAUDE -CEILANDIA',
    '080 - SES - SEC ESTADO DE SAUDE -SAMAMBAIA/REC',
    '085 - ADMINISTRATIVO RS',
    '086 - CORREIOS E TELEGRAFOS 824 SE/RS',
    '087 - TRE RIO GRANDE DO SUL',
    '088 - BANRISUL',
    '090 - INMETRO RS',
    '092 - TJGO RETROFIT ITAJA',
    '093 - TJGO RETROFIT CAÇU',
    '094 - TJGO RETROFIT PARANAIGUARA',
    '096 - BANCO DO BRASIL GOIAS',
    '097 - SEINFRA PAVIMENTACAO PB',
    '098 - UFPE IMPERMEABILIZAÇÃO',
    '099 - TRIBUNAL DE JUSTICA DE GOIAS - RIO VERDE',
    '100 - TRIBUNAL DE JUSTICA DE GOIAS - CALDAS NOVAS',
    '102 - TJ GO RETROFIT LOTE 05',
    '103 - TJ GO RETROFIT LOTE 04',
    '106 - SMED RS 17/2023 LOTE 01 - REGIAO NORTE',
    '107 - BANCO DO BRASIL JARDIM AMERICA',
    '108 - BANCO DO BRASIL FORMOSA',
    '109 - CORREIOS DA SE/RS',
    '110 - NOVO PROGRESSO'
  ];


  if (loadingUser || !userData) {
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

  const filteredData = bankHoursData?.data || [];

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Controle de Banco de Horas</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600">Acompanhamento do banco de horas de todos os funcionários</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data Inicial</label>
                <input
                  type="date"
                  value={startDateFilter}
                  onChange={(e) => setStartDateFilter(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data Final</label>
                <input
                  type="date"
                  value={endDateFilter}
                  onChange={(e) => setEndDateFilter(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Setor</label>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="w-full px-3 pr-8 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                >
                  {departments.map((dept) => (
                    <option key={dept} value={dept === 'Todos' ? 'all' : dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Centro de Custo</label>
                <select
                  value={costCenterFilter}
                  onChange={(e) => setCostCenterFilter(e.target.value)}
                  className="w-full px-3 pr-8 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                >
                  {costCenters.map((cc) => (
                    <option key={cc} value={cc === 'Todos' ? 'all' : cc}>
                      {cc}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tomador</label>
                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className="w-full px-3 pr-8 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                >
                  {clients.map((client) => (
                    <option key={client} value={client === 'Todos' ? 'all' : client}>
                      {client}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 pr-8 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                >
                  <option value="all">Todos</option>
                  <option value="positive">Positivo</option>
                  <option value="negative">Negativo</option>
                  <option value="neutral">Neutro</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <Card className="w-full">
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 rounded-lg flex-shrink-0">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Funcionários</p>
                  <p className="text-2xl font-bold text-gray-900">{filteredData.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="w-full">
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-green-100 rounded-lg flex-shrink-0">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Banco Positivo</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {filteredData.filter((emp: BankHoursData) => emp.bankHours > 0).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="w-full">
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-red-100 rounded-lg flex-shrink-0">
                  <Clock className="w-6 h-6 text-red-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Banco Negativo</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {filteredData.filter((emp: BankHoursData) => emp.bankHours < 0).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Tabela de Banco de Horas */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 rounded-lg flex-shrink-0">
                  <Clock className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">Banco de Horas</h3>
                  <p className="text-sm text-gray-600">Cálculo do banco de horas de todos os funcionários</p>
                </div>
              </div>
              <button 
                onClick={exportToExcel}
                className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm sm:text-base"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Exportar XLSX</span>
                <span className="sm:hidden">Exportar</span>
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingBankHours ? (
              <div className="text-center py-8">
                <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
                <p className="text-gray-600">Carregando dados...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm">Funcionário</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm hidden sm:table-cell">Setor</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm hidden md:table-cell">Centro de Custo</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm hidden lg:table-cell">Tomador</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm hidden lg:table-cell">Horas Trabalhadas</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm hidden lg:table-cell">Horas Esperadas</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm">Banco de Horas</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm hidden xl:table-cell">Horas Extras</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-sm">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((employee: BankHoursData) => (
                      <tr key={employee.employeeId} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-2 sm:px-4">
                          <div>
                            <p className="font-medium text-gray-900 text-sm sm:text-base">{employee.employeeName}</p>
                            <p className="text-xs sm:text-sm text-gray-500">{employee.employeeCpf}</p>
                            <div className="text-xs text-gray-400 sm:hidden mt-1">
                              {employee.department && `${employee.department} • ${employee.costCenter || 'N/A'}`}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-center hidden sm:table-cell">
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{employee.department}</p>
                            <p className="text-xs text-gray-500">{employee.position}</p>
                          </div>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-center text-gray-700 text-sm hidden md:table-cell">{employee.costCenter || '-'}</td>
                        <td className="py-3 px-2 sm:px-4 text-center text-gray-700 text-sm hidden lg:table-cell">{employee.client || '-'}</td>
                        <td className="py-3 px-2 sm:px-4 text-center text-gray-700 text-sm hidden lg:table-cell">{formatTime(employee.totalWorkedHours)}</td>
                        <td className="py-3 px-2 sm:px-4 text-center text-gray-700 text-sm hidden lg:table-cell">{formatTime(employee.totalExpectedHours)}</td>
                        <td className="py-3 px-2 sm:px-4 text-center">
                          <span className={`font-medium text-sm ${employee.bankHours >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatTime(employee.bankHours)}
                          </span>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-center hidden xl:table-cell">
                          <span className="font-medium text-orange-600 text-sm">
                            {formatTime(employee.overtimeMultipliedHours)}
                          </span>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-center">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(employee.bankHours)}`}>
                            {getStatusText(employee.bankHours)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de alterar senha */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        onSuccess={() => {
          setIsChangePasswordOpen(false);
          // Invalidar query para recarregar dados do usuário
          queryClient.invalidateQueries({ queryKey: ['user'] });
        }}
      />
    </MainLayout>
  );
}
