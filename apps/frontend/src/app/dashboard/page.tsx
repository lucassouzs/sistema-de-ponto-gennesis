'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, CheckCircle, XCircle, AlertCircle, User, LogOut, X, Eye, DoorOpen, DoorClosed, Utensils, UtensilsCrossed, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { PunchCard } from '@/components/ponto/PunchCard';
import { TimeRecordsList } from '@/components/ponto/TimeRecordsList';
import api from '@/lib/api';

type UserInfoPanelProps = {
  name: string;
  cpf: string;
  onLogout: () => void;
};

export function UserInfoPanel({ name, cpf, onLogout }: UserInfoPanelProps) {
  return (
    <Card className="bg-white shadow-sm border-gray-200 mb-6">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
              <p className="text-sm text-gray-600">CPF: {cpf}</p>
            </div>
          </div>
          
          <button
            onClick={onLogout}
            className="flex items-center space-x-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors duration-200"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">Sair</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: dashboardData, isLoading: loadingDashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await api.get('/dashboard');
      return res.data;
    }
  });

  const { data: todayRecords, isLoading: loadingToday } = useQuery({
    queryKey: ['today-records'],
    queryFn: async () => {
      const res = await api.get('/time-records/my-records/today');
      return res.data;
    }
  });

  // Painel "Ver mais" com filtros de data (dia/mês/ano)
  const now = new Date();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [selectedDay, setSelectedDay] = useState<number>(now.getDate());

  const { data: dayRecordsData, isLoading: loadingDay } = useQuery({
    queryKey: ['day-records', selectedYear, selectedMonth, selectedDay],
    enabled: isPanelOpen,
    queryFn: async () => {
      const start = new Date(selectedYear, selectedMonth - 1, selectedDay, 0, 0, 0, 0);
      const end = new Date(selectedYear, selectedMonth - 1, selectedDay, 23, 59, 59, 999);
      const res = await api.get('/time-records/my-records/period', {
        params: { startDate: start.toISOString(), endDate: end.toISOString() }
      });
      return res.data;
    }
  });

  // Banco de horas do mês atual
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const { data: bankHoursData } = useQuery({
    queryKey: ['bank-hours', startOfMonth.toISOString(), endOfMonth.toISOString()],
    queryFn: async () => {
      const res = await api.get('/time-records/my-records/bank-hours', {
        params: {
          startDate: startOfMonth.toISOString(),
          endDate: endOfMonth.toISOString(),
        }
      });
      return res.data;
    }
  });

  // Detalhamento do banco de horas (modal)
  const [isBankDetailsOpen, setIsBankDetailsOpen] = useState(false);
  const { data: bankHoursDetailed } = useQuery({
    queryKey: ['bank-hours-detailed', startOfMonth.toISOString(), endOfMonth.toISOString(), isBankDetailsOpen],
    enabled: isBankDetailsOpen,
    queryFn: async () => {
      const res = await api.get('/time-records/my-records/bank-hours', {
        params: {
          startDate: startOfMonth.toISOString(),
          endDate: endOfMonth.toISOString(),
          detailed: true,
        }
      });
      return res.data;
    }
  });

  const handleLogout = () => {
    // Remove token de autenticação (ajuste conforme seu projeto)
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    // Redireciona para a tela de login
    window.location.href = '/auth/login';
  };

  if (loadingDashboard || loadingUser || (isPanelOpen && loadingDay)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
          <p className="text-gray-600">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00'
  };

  const stats = dashboardData?.data || {
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    lateToday: 0,
    pendingVacations: 0,
    pendingOvertime: 0,
    attendanceRate: 0,
  };

  const widthPercent = Math.min(100, Math.max(0, Number(stats.attendanceRate || 0)));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 text-center">Gennesis Engenharia</h1>
          <p className="mt-2 text-gray-600 text-center">Visão geral do sistema de controle de ponto</p>
        </div>

        <UserInfoPanel name={user.name} cpf={user.cpf} onLogout={handleLogout} />
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Funcionários</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalEmployees}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-green-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Presentes Hoje</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.presentToday}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-red-100 rounded-lg">
                  <XCircle className="w-6 h-6 text-red-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Ausentes Hoje</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.absentToday}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-yellow-100 rounded-lg">
                  <AlertCircle className="w-6 h-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Atrasos Hoje</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.lateToday}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader className="pb-4">
            <h3 className="text-lg font-semibold text-gray-900">Taxa de Frequência</h3>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-6">
              <div className="flex-1">
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out" 
                    style={{ width: `${widthPercent}%` }} 
                  />
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900 min-w-[60px] text-right">
                {widthPercent}%
              </div>
            </div>
            <div className="mt-3 text-sm text-gray-500">
              {stats.presentToday} de {stats.totalEmployees} funcionários presentes hoje
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <PunchCard />
          </div>

          <Card className="w-full max-w-2xl mx-auto">
            <CardHeader className="pb-4 border-b-0 pt-4">
              <h2 className="text-2xl font-bold text-gray-900 text-center">Registros</h2>
            </CardHeader>
            <CardContent>
              <div className="max-w-2xl mx-auto">
                <label className="block text-sm font-medium text-gray-700 mb-3">Últimos Registros</label>
                {(() => {
                  const recs = todayRecords?.data?.records || [];
                  const getTime = (type: string) => {
                    const found = recs.find((r: any) => r.type === type);
                    if (!found) return '--:--';
                    const d = new Date(found.timestamp);
                    const hh = String(d.getHours()).padStart(2, '0');
                    const mm = String(d.getMinutes()).padStart(2, '0');
                    return `${hh}:${mm}`;
                  };
                  const tiles = [
                    { icon: <DoorOpen className="w-6 h-6" />, type: 'ENTRY' },
                    { icon: <Utensils className="w-6 h-6" />, type: 'LUNCH_START' },
                    { icon: <UtensilsCrossed className="w-6 h-6" />, type: 'LUNCH_END' },
                    { icon: <DoorClosed className="w-6 h-6" />, type: 'EXIT' },
                  ];
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      {tiles.map(t => (
                        <div key={t.type} className="p-4 rounded-lg border-2 bg-white border-gray-200">
                          <div className="flex flex-col items-center justify-center space-y-2">
                            {t.icon}
                            <div className="text-lg font-semibold text-gray-900">{getTime(t.type)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="pt-4">
                <button
                  onClick={() => setIsPanelOpen(true)}
                  className="w-full h-12 flex items-center justify-center space-x-2 px-4 bg-blue-100 text-blue-700 rounded-lg shadow-sm hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <Eye className="w-4 h-4" />
                  <span className="text-sm font-medium">Ver mais</span>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
        {isPanelOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setIsPanelOpen(false)} />
            <div className="relative w-full max-w-3xl mx-4 bg-white rounded-lg shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Todos os Registros</h3>
                <button
                  onClick={() => setIsPanelOpen(false)}
                  className="p-2 rounded hover:bg-gray-100 text-gray-600"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-4 border-b">
                <div className="flex items-end gap-3 flex-wrap justify-center">
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-1">Dia</label>
                    <select
                      className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={selectedDay}
                      onChange={(e) => setSelectedDay(Number(e.target.value))}
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-1">Mês</label>
                    <select
                      className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    >
                      {['01','02','03','04','05','06','07','08','09','10','11','12'].map((label, i) => (
                        <option key={i+1} value={i+1}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-1">Ano</label>
                    <select
                      className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                    >
                      {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="max-h-[70vh] overflow-auto p-6">
                <TimeRecordsList records={dayRecordsData?.data?.records || []} />
              </div>
            </div>
          </div>
        )}

        {/* Banco de horas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <Card className="w-full max-w-2xl mx-auto">
            <CardHeader className="pb-4">
              <h3 className="text-lg font-semibold text-gray-900">Banco de Horas (mês atual)</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 rounded">
                  <div className="text-sm text-gray-600">Horas Extras</div>
                  <div className="text-2xl font-bold text-blue-700">{bankHoursData?.data?.totalOvertimeHours?.toFixed ? bankHoursData.data.totalOvertimeHours.toFixed(1) : (bankHoursData?.data?.totalOvertimeHours || 0)}h</div>
                </div>
                <div className="p-4 bg-red-50 rounded">
                  <div className="text-sm text-gray-600">Horas Devidas</div>
                  <div className="text-2xl font-bold text-red-700">{bankHoursData?.data?.totalOwedHours?.toFixed ? bankHoursData.data.totalOwedHours.toFixed(1) : (bankHoursData?.data?.totalOwedHours || 0)}h</div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Saldo</div>
                  <div className="text-2xl font-bold text-gray-900">{bankHoursData?.data?.balanceHours?.toFixed ? bankHoursData.data.balanceHours.toFixed(1) : (bankHoursData?.data?.balanceHours || 0)}h</div>
                </div>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => setIsBankDetailsOpen(true)}
                  className="w-full h-12 flex items-center justify-center space-x-2 px-4 bg-blue-100 text-blue-700 rounded-lg shadow-sm hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span className="text-sm font-medium">Ver detalhamento</span>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {isBankDetailsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setIsBankDetailsOpen(false)} />
            <div className="relative w-full max-w-4xl mx-4 bg-white rounded-lg shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Detalhamento do Banco de Horas (mês atual)</h3>
                <button
                  onClick={() => setIsBankDetailsOpen(false)}
                  className="p-2 rounded hover:bg-gray-100 text-gray-600"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="max-h-[70vh] overflow-auto p-6">
                <div className="w-full overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-600 border-b">
                        <th className="py-2 pr-4">Data</th>
                        <th className="py-2 pr-4">Esperado</th>
                        <th className="py-2 pr-4">Trabalhado</th>
                        <th className="py-2 pr-4">Extras</th>
                        <th className="py-2 pr-4">Devidas</th>
                        <th className="py-2 pr-4">Observações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bankHoursDetailed?.data?.days || []).map((d: any, idx: number) => (
                        <tr key={idx} className="border-b">
                          <td className="py-2 pr-4">{new Date(d.date).toLocaleDateString('pt-BR')}</td>
                          <td className="py-2 pr-4">{(d.expectedHours || 0).toFixed ? d.expectedHours.toFixed(1) : d.expectedHours}h</td>
                          <td className="py-2 pr-4">{(d.workedHours || 0).toFixed ? d.workedHours.toFixed(1) : d.workedHours}h</td>
                          <td className="py-2 pr-4 text-blue-700">{(d.overtimeHours || 0).toFixed ? d.overtimeHours.toFixed(1) : d.overtimeHours}h</td>
                          <td className="py-2 pr-4 text-red-700">{(d.owedHours || 0).toFixed ? d.owedHours.toFixed(1) : d.owedHours}h</td>
                          <td className="py-2 pr-4 text-gray-600">{(d.notes || []).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}