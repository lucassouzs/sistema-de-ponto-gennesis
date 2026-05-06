'use client';

// Desabilitar prerendering
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Users, CheckCircle, XCircle, AlertCircle, X, Eye, Search } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { ChangePasswordModal } from '@/components/ui/ChangePasswordModal';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const handleLogout = () => {
    // Remove token de autenticação
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    // Redireciona para a tela de login
    router.push('/auth/login');
  };

  const { data: dashboardData, isLoading: loadingDashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await api.get('/dashboard');
      return res.data;
    }
  });


  
  // Modal de troca de senha
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  
  // Modais de listas de funcionários
  const [showPresentModal, setShowPresentModal] = useState(false);
  const [showAbsentModal, setShowAbsentModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  
  // Estados de pesquisa para cada modal
  const [searchPresent, setSearchPresent] = useState('');
  const [searchAbsent, setSearchAbsent] = useState('');
  const [searchPending, setSearchPending] = useState('');

  // Verificar se é o primeiro login
  const isFirstLogin = userData?.data?.isFirstLogin || false;

  // Abrir modal de troca de senha automaticamente no primeiro login
  useEffect(() => {
    if (isFirstLogin && userData) {
      setIsChangePasswordOpen(true);
    }
  }, [isFirstLogin, userData]);

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

  if (loadingUser || !userData) {
    return (
      <Loading 
        message="Carregando dashboard..."
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

  const stats = dashboardData?.data || {
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    pendingToday: 0,
    pendingVacations: 0,
    pendingOvertime: 0,
    averageAttendance: 0,
    attendanceRate: 0,
    presentEmployees: [],
    absentEmployees: [],
    pendingEmployees: [],
  };

  const widthPercent = Math.min(100, Math.max(0, Number(stats.attendanceRate || 0)));

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={handleLogout}
    >
      <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Painel de Funcionários</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Visão geral do sistema de controle de ponto</p>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center">
              <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal">Total Funcionários</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.totalEmployees}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center flex-1 min-w-[120px] pr-2">
                <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg flex-shrink-0">
                  <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="ml-3 sm:ml-4 flex-1 overflow-hidden">
                  <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 leading-tight break-normal">Presentes Hoje</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.presentToday || 0}</p>
                </div>
              </div>
              <button
                onClick={() => setShowPresentModal(true)}
                className="p-2 sm:p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors flex-shrink-0 mt-1 sm:mt-0"
                title="Ver lista"
              >
                <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center flex-1 min-w-[120px] pr-2">
                <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg flex-shrink-0">
                  <XCircle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="ml-3 sm:ml-4 flex-1 overflow-hidden">
                  <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 leading-tight break-normal">Ausentes Hoje</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.absentToday || 0}</p>
                </div>
              </div>
              <button
                onClick={() => setShowAbsentModal(true)}
                className="p-2 sm:p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors flex-shrink-0 mt-1 sm:mt-0"
                title="Ver lista"
              >
                <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center flex-1 min-w-[120px] pr-2">
                <div className="p-2 sm:p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex-shrink-0">
                  <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div className="ml-3 sm:ml-4 flex-1 overflow-hidden">
                  <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 leading-tight break-normal">Pendentes</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.pendingToday || 0}</p>
                </div>
              </div>
              <button
                onClick={() => setShowPendingModal(true)}
                className="p-2 sm:p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors flex-shrink-0 mt-1 sm:mt-0"
                title="Ver lista"
              >
                <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de frequência */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Taxa de Frequência</h2>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Frequência Geral</span>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{stats.attendanceRate}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${widthPercent}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {stats.presentToday} de {stats.totalEmployees} funcionários presentes hoje
            </div>
          </div>
        </CardContent>
      </Card>

      </div>

      {/* Modal de alterar senha */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        onSuccess={() => {
          setIsChangePasswordOpen(false);
          queryClient.invalidateQueries({ queryKey: ['user'] });
        }}
      />

      {/* Modal de Funcionários Presentes */}
      {showPresentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => {
            setShowPresentModal(false);
            setSearchPresent('');
          }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Funcionários Presentes Hoje ({stats.presentEmployees?.length || 0})
              </h3>
              <button
                onClick={() => {
                  setShowPresentModal(false);
                  setSearchPresent('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Barra de pesquisa */}
            <div className="px-6 pt-4 pb-2 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome, email, departamento ou cargo..."
                  value={searchPresent}
                  onChange={(e) => setSearchPresent(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
            </div>
            <div className="overflow-y-auto p-6">
              {(() => {
                const filtered = stats.presentEmployees?.filter((emp: any) => {
                  if (!searchPresent.trim()) return true;
                  const searchLower = searchPresent.toLowerCase();
                  return (
                    emp.name?.toLowerCase().includes(searchLower) ||
                    emp.email?.toLowerCase().includes(searchLower) ||
                    emp.department?.toLowerCase().includes(searchLower) ||
                    emp.position?.toLowerCase().includes(searchLower)
                  );
                }) || [];
                
                return filtered.length > 0 ? (
                  <div className="space-y-3">
                    {filtered.map((emp: any) => (
                    <div
                      key={emp.id}
                      className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                    >
                      <p className="font-medium text-gray-900 dark:text-gray-100">{emp.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{emp.email}</p>
                      {(emp.department || emp.position) && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {emp.position && emp.department 
                            ? `${emp.position} de ${emp.department}`
                            : emp.position || emp.department}
                        </p>
                      )}
                    </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    {searchPresent.trim() 
                      ? 'Nenhum funcionário encontrado com o termo pesquisado'
                      : 'Nenhum funcionário presente hoje'}
                  </p>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Funcionários Ausentes */}
      {showAbsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => {
            setShowAbsentModal(false);
            setSearchAbsent('');
          }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Funcionários Ausentes Hoje ({stats.absentEmployees?.length || 0})
              </h3>
              <button
                onClick={() => {
                  setShowAbsentModal(false);
                  setSearchAbsent('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Barra de pesquisa */}
            <div className="px-6 pt-4 pb-2 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome, email, departamento ou cargo..."
                  value={searchAbsent}
                  onChange={(e) => setSearchAbsent(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
            </div>
            <div className="overflow-y-auto p-6">
              {(() => {
                const filtered = stats.absentEmployees?.filter((emp: any) => {
                  if (!searchAbsent.trim()) return true;
                  const searchLower = searchAbsent.toLowerCase();
                  return (
                    emp.name?.toLowerCase().includes(searchLower) ||
                    emp.email?.toLowerCase().includes(searchLower) ||
                    emp.department?.toLowerCase().includes(searchLower) ||
                    emp.position?.toLowerCase().includes(searchLower)
                  );
                }) || [];
                
                return filtered.length > 0 ? (
                  <div className="space-y-3">
                    {filtered.map((emp: any) => (
                    <div
                      key={emp.id}
                      className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                    >
                      <p className="font-medium text-gray-900 dark:text-gray-100">{emp.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{emp.email}</p>
                      {(emp.department || emp.position) && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {emp.position && emp.department 
                            ? `${emp.position} de ${emp.department}`
                            : emp.position || emp.department}
                        </p>
                      )}
                    </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    {searchAbsent.trim() 
                      ? 'Nenhum funcionário encontrado com o termo pesquisado'
                      : 'Nenhum funcionário ausente hoje'}
                  </p>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Funcionários Pendentes */}
      {showPendingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => {
            setShowPendingModal(false);
            setSearchPending('');
          }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Funcionários Pendentes ({stats.pendingEmployees?.length || 0})
              </h3>
              <button
                onClick={() => {
                  setShowPendingModal(false);
                  setSearchPending('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Barra de pesquisa */}
            <div className="px-6 pt-4 pb-2 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome, email, departamento ou cargo..."
                  value={searchPending}
                  onChange={(e) => setSearchPending(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
            </div>
            <div className="overflow-y-auto p-6">
              {(() => {
                const filtered = stats.pendingEmployees?.filter((emp: any) => {
                  if (!searchPending.trim()) return true;
                  const searchLower = searchPending.toLowerCase();
                  return (
                    emp.name?.toLowerCase().includes(searchLower) ||
                    emp.email?.toLowerCase().includes(searchLower) ||
                    emp.department?.toLowerCase().includes(searchLower) ||
                    emp.position?.toLowerCase().includes(searchLower)
                  );
                }) || [];
                
                return filtered.length > 0 ? (
                  <div className="space-y-3">
                    {filtered.map((emp: any) => (
                    <div
                      key={emp.id}
                      className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                    >
                      <p className="font-medium text-gray-900 dark:text-gray-100">{emp.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{emp.email}</p>
                      {(emp.department || emp.position) && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {emp.position && emp.department 
                            ? `${emp.position} de ${emp.department}`
                            : emp.position || emp.department}
                        </p>
                      )}
                    </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    {searchPending.trim() 
                      ? 'Nenhum funcionário encontrado com o termo pesquisado'
                      : 'Nenhum funcionário pendente hoje'}
                  </p>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
