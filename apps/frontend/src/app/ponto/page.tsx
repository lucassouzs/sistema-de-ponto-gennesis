'use client';

// Desabilitar prerendering
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { BarChart3, Clock, Calendar, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { TimeRecordsList } from '@/components/ponto/TimeRecordsList';
import { MainLayout } from '@/components/layout/MainLayout';
import { ChangePasswordModal } from '@/components/ui/ChangePasswordModal';
import { Loading } from '@/components/ui/Loading';
import { PunchCard } from '@/components/ponto/PunchCard';
import api from '@/lib/api';

export default function PontoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  // Estados
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPunchModalOpen, setIsPunchModalOpen] = useState(false);
  const [hasError, setHasError] = useState(false);
  
  const { data: userData, isLoading: loadingUser, error: userError } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        const res = await api.get('/auth/me');
        return res.data;
      } catch (error: any) {
        console.error('Erro ao buscar dados do usuário:', error);
        setHasError(true);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
    gcTime: 10 * 60 * 1000, // Manter no cache por 10 minutos
    retry: 1,
  });

  const handleLogout = () => {
    // Remove token de autenticação
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    // Redireciona para a tela de login
    router.push('/auth/login');
  };

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

  // Detectar dispositivo móvel
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    
    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

  // Verificar se o funcionário precisa bater ponto (após carregar dados do usuário)
  // Só calcular se userData estiver disponível para evitar erros
  const requiresTimeClock = userData?.data?.employee?.requiresTimeClock !== false;

  const { data: todayRecords, isLoading: loadingToday, error: todayRecordsError } = useQuery({
    queryKey: ['today-records'],
    queryFn: async () => {
      try {
        const res = await api.get('/time-records/my-records/today');
        return res.data;
      } catch (error: any) {
        console.error('Erro ao buscar registros de hoje:', error);
        // Se for erro 500 ou outro erro, retornar estrutura vazia em vez de quebrar
        if (error.response?.status >= 500 || error.response?.status === 404) {
          return { 
            success: true,
            data: {
              records: [],
              summary: {
                date: new Date(),
                totalHours: 0,
                regularHours: 0,
                overtimeHours: 0,
                lunchHours: 0,
                breakHours: 0,
                records: [],
                isComplete: false,
                issues: []
              }
            }
          };
        }
        // Para outros erros, também retornar estrutura vazia para não quebrar a página
        return { 
          success: true,
          data: {
            records: [],
            summary: {
              date: new Date(),
              totalHours: 0,
              regularHours: 0,
              overtimeHours: 0,
              lunchHours: 0,
              breakHours: 0,
              records: [],
              isComplete: false,
              issues: []
            }
          }
        };
      }
    },
    enabled: !!userData?.data && !loadingUser && requiresTimeClock, // Só fazer a chamada se o usuário estiver carregado e precisar bater ponto
    retry: false, // Não tentar novamente para evitar loops
  });

  // Banco de horas total (desde a admissão)
  const { data: bankHoursData, error: bankHoursError, isLoading: bankHoursLoading, refetch: refetchBankHours } = useQuery({
    queryKey: ['bank-hours-total'],
    queryFn: async () => {
      try {
        const res = await api.get('/time-records/my-records/bank-hours');
        return res.data;
      } catch (error: any) {
        console.error('Erro ao buscar banco de horas:', error);
        // Se for erro 500 ou outro erro, retornar estrutura vazia em vez de quebrar
        if (error.response?.status >= 500 || error.response?.status === 404) {
          return { 
            success: true,
            data: { 
              balanceHours: 0,
              total: 0, 
              positive: 0, 
              negative: 0,
              hours: '00:00:00'
            }
          };
        }
        // Para outros erros, também retornar estrutura vazia para não quebrar a página
        return { 
          success: true,
          data: { 
            balanceHours: 0,
            total: 0, 
            positive: 0, 
            negative: 0,
            hours: '00:00:00'
          }
        };
      }
    },
    enabled: !!userData?.data && !loadingUser && requiresTimeClock, // Só fazer a chamada se o usuário estiver carregado e precisar bater ponto
    staleTime: 0, // Sempre considerar os dados como obsoletos
    gcTime: 0, // Não cachear os dados
    retry: false, // Não tentar novamente para evitar loops
  });


  // Painel "Ver mais" com filtros de data (dia/mês/ano)
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
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

  // Detalhamento do banco de horas (modal)
  const [isBankDetailsOpen, setIsBankDetailsOpen] = useState(false);
  const [selectedBankYear, setSelectedBankYear] = useState<number>(now.getFullYear());
  const [selectedBankMonth, setSelectedBankMonth] = useState<number>(now.getMonth() + 1);

  const { data: bankHoursDetailed, error: bankHoursDetailedError, isLoading: loadingBankHoursDetailed } = useQuery({
    queryKey: ['bank-hours-detailed', selectedBankYear, selectedBankMonth, isBankDetailsOpen],
    enabled: isBankDetailsOpen,
    queryFn: async () => {
      const startDate = new Date(selectedBankYear, selectedBankMonth - 1, 1);
      const endDate = new Date(selectedBankYear, selectedBankMonth, 0);
      
      const res = await api.get('/time-records/my-records/bank-hours', {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          detailed: true,
        },
        timeout: 30000, // 30 segundos para requisições detalhadas
      });
      return res.data;
    },
    retry: 2,
    retryDelay: 1000,
  });

  // Função para formatar horas decimais para HH:MM:SS
  const formatHours = (decimalHours: number) => {
    const totalSeconds = Math.round(Math.abs(decimalHours) * 3600);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const sign = decimalHours < 0 ? '-' : '';
    return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Função para formatar data
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  // Função para obter dia da semana
  const getWeekday = (dateString: string) => {
    const date = new Date(dateString);
    const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  };

  // Se houver erro ao carregar dados do usuário, mostrar mensagem de erro
  // Mas só se realmente não conseguir carregar após algumas tentativas
  const userErrorStatus = (userError as any)?.response?.status;
  if ((userError && userErrorStatus >= 500) || (hasError && !loadingUser)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Erro ao carregar dados
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Não foi possível carregar suas informações. Por favor, tente novamente.
          </p>
          <button
            onClick={() => {
              setHasError(false);
              queryClient.invalidateQueries({ queryKey: ['user'] });
            }}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Se ainda está carregando dados do usuário, mostrar loading
  if (loadingUser || !userData) {
    return (
      <Loading 
        message="Carregando dados..."
        fullScreen
        size="lg"
      />
    );
  }

  // Verificar se há dados do usuário antes de continuar
  if (!userData?.data) {
    return (
      <Loading 
        message="Carregando informações do usuário..."
        fullScreen
        size="lg"
      />
    );
  }

  const user = userData.data;

  // Se houver erro nas queries, mostrar mensagem de erro mas não quebrar a página
  const todayRecordsErrorStatus = (todayRecordsError as any)?.response?.status;
  if (todayRecordsError && todayRecordsErrorStatus >= 500) {
    console.error('Erro ao carregar registros:', todayRecordsError);
  }

  const bankHoursErrorStatus = (bankHoursError as any)?.response?.status;
  if (bankHoursError && bankHoursErrorStatus >= 500) {
    console.error('Erro ao carregar banco de horas:', bankHoursError);
  }

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={handleLogout}
    >
      <div className="space-y-6 w-full px-4">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Controle de Ponto</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">Gerencie seus registros de ponto e banco de horas</p>
      </div>  
           
      {/* Botão para bater ponto - apenas se o funcionário precisa bater ponto */}
      {requiresTimeClock && (
        <div className="flex justify-center mb-6">
          <button
            onClick={() => setIsPunchModalOpen(true)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2"
          >
            <Clock className="w-5 h-5" />
            <span>Bater Ponto</span>
          </button>
        </div>
      )}
      
      {/* Mensagem para funcionários que não precisam bater ponto */}
      {!requiresTimeClock && (
        <div className="flex justify-center mb-8">
          <div className="w-full max-w-2xl px-6 py-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-center text-base font-medium text-blue-800 dark:text-blue-200">
              Você não precisa bater ponto. Seu registro é automático.
            </p>
          </div>
        </div>
      )}

      {/* Cards lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card de registros do dia */}
          <div className="h-full">
            <TimeRecordsList 
              records={todayRecords?.data?.records || []} 
              onViewMore={() => setIsPanelOpen(true)}
            />
          </div>

        {/* Banco de horas - apenas saldo */}
        <div className="h-full">
           <Card className={`h-full flex flex-col ${
             (bankHoursData?.data?.balanceHours || 0) < 0 
               ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
               : (bankHoursData?.data?.balanceHours || 0) > 0 
                 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                 : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
           }`}>
             <CardHeader className="pb-4 border-b-0 pt-4">
               <h2 className={`text-xl font-semibold text-center ${
                 (bankHoursData?.data?.balanceHours || 0) < 0 
                   ? 'text-red-800 dark:text-red-400' 
                   : (bankHoursData?.data?.balanceHours || 0) > 0 
                     ? 'text-green-800 dark:text-green-400' 
                     : 'text-gray-900 dark:text-gray-100'
               }`}>Banco de Horas</h2>
               <p className={`text-sm text-center mt-1 ${
                 (bankHoursData?.data?.balanceHours || 0) < 0 
                   ? 'text-red-600 dark:text-red-400' 
                   : (bankHoursData?.data?.balanceHours || 0) > 0 
                     ? 'text-green-600 dark:text-green-400' 
                     : 'text-gray-600 dark:text-gray-400'
               }`}>Saldo atual</p>
             </CardHeader>
             <CardContent className="flex-1 flex flex-col justify-center text-center p-6 pt-0">
               <div className={`text-3xl font-bold ${
                      (bankHoursData?.data?.balanceHours || 0) >= 0 
                        ? 'text-green-700 dark:text-green-400' 
                        : 'text-red-700 dark:text-red-400'
                    }`}>
                      {bankHoursLoading ? 'Carregando...' : bankHoursError ? 'Erro' : formatHours(bankHoursData?.data?.balanceHours || 0)}
                    </div>
             </CardContent>
             
             <div className="mt-auto pt-4 px-6 pb-6">
                <button
                  onClick={() => setIsBankDetailsOpen(true)}
                 className={`w-full h-12 flex items-center justify-center space-x-2 px-4 rounded-lg shadow-sm hover:opacity-80 focus:outline-none focus:ring-2 transition-colors ${
                   (bankHoursData?.data?.balanceHours || 0) < 0 
                     ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 focus:ring-red-500' 
                     : (bankHoursData?.data?.balanceHours || 0) > 0 
                       ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 focus:ring-green-500' 
                       : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 focus:ring-blue-500'
                 }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span className="text-sm font-medium">Ver detalhamento</span>
                </button>
              </div>
        </Card>
            </div>
      </div>

      {/* Botões de navegação removidos */}

      {/* Modal de registros detalhados */}
      {isPanelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsPanelOpen(false)} />
          <div className="relative w-full max-w-3xl mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Todos os Registros</h3>
              <button
                onClick={() => setIsPanelOpen(false)}
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 border-b dark:border-gray-700">
              <div className="flex items-end gap-3 flex-wrap justify-center">
                <div className="flex flex-col">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">Dia</label>
                  <select
                    className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(Number(e.target.value))}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">Mês</label>
                  <select
                    className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  >
                    {['01','02','03','04','05','06','07','08','09','10','11','12'].map((label, i) => (
                      <option key={i+1} value={i+1}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">Ano</label>
                  <select
                    className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            <div className="max-h-[70vh] overflow-auto p-6 bg-white dark:bg-gray-800">
              <TimeRecordsList records={dayRecordsData?.data?.records || []} />
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalhamento do banco de horas */}
      {isBankDetailsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsBankDetailsOpen(false)} />
          <div className="relative w-full max-w-6xl mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Detalhamento do Banco de Horas</h3>
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">{userData?.data?.name}</span>
                    <span className="mx-2">•</span>
                    <span>CPF: {userData?.data?.cpf}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsBankDetailsOpen(false)}
                    className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                    aria-label="Fechar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {/* Seletores de mês e ano */}
              <div className="flex items-center space-x-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mês</label>
                  <select
                    value={selectedBankMonth}
                    onChange={(e) => setSelectedBankMonth(Number(e.target.value))}
                    className="w-32 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={1}>Janeiro</option>
                    <option value={2}>Fevereiro</option>
                    <option value={3}>Março</option>
                    <option value={4}>Abril</option>
                    <option value={5}>Maio</option>
                    <option value={6}>Junho</option>
                    <option value={7}>Julho</option>
                    <option value={8}>Agosto</option>
                    <option value={9}>Setembro</option>
                    <option value={10}>Outubro</option>
                    <option value={11}>Novembro</option>
                    <option value={12}>Dezembro</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ano</label>
                  <select
                    value={selectedBankYear}
                    onChange={(e) => setSelectedBankYear(Number(e.target.value))}
                    className="w-24 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {Array.from({ length: 10 }, (_, i) => {
                      const year = now.getFullYear() - 5 + i;
                      return (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-auto p-6 bg-white dark:bg-gray-800">
              {loadingBankHoursDetailed ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400 mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Carregando detalhamento...</p>
                  </div>
                </div>
              ) : bankHoursDetailedError ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <p className="text-red-600 dark:text-red-400 mb-2">Erro ao carregar detalhamento</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {bankHoursDetailedError instanceof Error 
                        ? bankHoursDetailedError.message 
                        : 'Erro desconhecido'}
                    </p>
                  </div>
                </div>
              ) : (
              <div className="w-full overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-gray-800 z-10">
                    <tr className="text-center text-gray-600 dark:text-gray-400 border-b dark:border-gray-700">
                      <th className="py-2 pr-4 sticky top-0 bg-white dark:bg-gray-800">Data</th>
                      <th className="py-2 pr-4 sticky top-0 bg-white dark:bg-gray-800 text-left">Dia da Semana</th>
                      <th className="py-2 pr-4 sticky top-0 bg-white dark:bg-gray-800">Esperado</th>
                      <th className="py-2 pr-4 sticky top-0 bg-white dark:bg-gray-800">Trabalhado</th>
                      <th className="py-2 pr-4 sticky top-0 bg-white dark:bg-gray-800">Horas Normais</th>
                      <th className="py-2 pr-4 sticky top-0 bg-white dark:bg-gray-800" title="Horas Extras com Multiplicadores:\n• 1,5x: Horas extras em dias úteis e sábados até 22h\n• 2,0x: Horas extras em domingos e após 22h\n• Total: Soma das horas multiplicadas">Horas Extras</th>
                      <th className="py-2 pr-4 sticky top-0 bg-white dark:bg-gray-800">Devidas</th>
                      <th className="py-2 pr-4 sticky top-0 bg-white dark:bg-gray-800">Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(bankHoursDetailed?.data?.days || []).map((d: any, idx: number) => (
                      <tr key={idx} className="border-b dark:border-gray-700">
                        <td className="py-2 pr-4 text-center text-gray-900 dark:text-gray-100">{formatDate(d.date)}</td>
                        <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">{getWeekday(d.date)}</td>
                        <td className="py-2 pr-4 text-center text-gray-900 dark:text-gray-100">
                          <span className={d.notes?.includes('Ausência Justificada') ? 'line-through text-gray-500 dark:text-gray-400' : ''}>
                            {formatHours(d.expectedHours || 0)}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-center text-gray-900 dark:text-gray-100">{formatHours(d.workedHours || 0)}</td>
                        <td className="py-2 pr-4 text-center text-gray-900 dark:text-gray-100">{formatHours(Math.min(d.workedHours || 0, d.expectedHours || 0))}</td>
                        <td className="py-2 pr-4 text-center text-blue-700 dark:text-blue-400" title={`Detalhamento das Horas Extras:\n• 1,5x: ${formatHours(d.overtimeHours15 || 0)} (${((d.overtimeHours15 || 0) / 1.5).toFixed(2)}h × 1,5)\n• 2,0x: ${formatHours(d.overtimeHours20 || 0)} (${((d.overtimeHours20 || 0) / 2.0).toFixed(2)}h × 2,0)\n• Total: ${formatHours((d.overtimeHours !== undefined ? d.overtimeHours : (d.overtimeHours15 || 0) + (d.overtimeHours20 || 0)) || 0)}`}>{formatHours((d.overtimeHours !== undefined ? d.overtimeHours : (d.overtimeHours15 || 0) + (d.overtimeHours20 || 0)) || 0)}</td>
                        <td className="py-2 pr-4 text-center text-red-700 dark:text-red-400">{formatHours(d.owedHours || 0)}</td>
                        <td className="py-2 pr-4 text-center text-gray-600 dark:text-gray-400">{(d.notes || []).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                {bankHoursDetailed?.data?.days && bankHoursDetailed.data.days.length > 0 && (
                  <tfoot>
                    <tr className="border-t dark:border-gray-700 font-semibold text-sm">
                      <td className="py-2 pr-4 text-gray-900 dark:text-gray-100" colSpan={2}>Totais do mês</td>
                      <td className="py-2 pr-4 text-center text-gray-900 dark:text-gray-100">
                        {formatHours((bankHoursDetailed.data.days as any[]).reduce((acc, d: any) => acc + (d.expectedHours || 0), 0))}
                      </td>
                      <td className="py-2 pr-4 text-center text-gray-900 dark:text-gray-100">
                        {formatHours((bankHoursDetailed.data.days as any[]).reduce((acc, d: any) => acc + (d.workedHours || 0), 0))}
                      </td>
                      <td className="py-2 pr-4 text-center text-gray-900 dark:text-gray-100">
                        {formatHours((bankHoursDetailed.data.days as any[]).reduce((acc, d: any) => acc + Math.min((d.workedHours || 0), (d.expectedHours || 0)), 0))}
                      </td>
                      <td className="py-2 pr-4 text-center text-blue-700 dark:text-blue-400">
                        {formatHours((bankHoursDetailed.data.days as any[]).reduce((acc, d: any) => acc + (d.overtimeHours !== undefined ? d.overtimeHours : ((d.overtimeHours15 || 0) + (d.overtimeHours20 || 0))), 0))}
                      </td>
                      <td className="py-2 pr-4 text-center text-red-700 dark:text-red-400">
                        {formatHours((bankHoursDetailed.data.days as any[]).reduce((acc, d: any) => acc + (d.owedHours || 0), 0))}
                      </td>
                      <td className="py-2 pr-4 text-center"></td>
                    </tr>
                  </tfoot>
                )}
                </table>
              </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* Modal de bater ponto */}
      {isPunchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="relative w-full max-w-md">
            <PunchCard
              onSuccess={() => {
                // Invalidar queries para atualizar os registros
                queryClient.invalidateQueries({ queryKey: ['today-records'] });
                queryClient.invalidateQueries({ queryKey: ['bank-hours-total'] });
                queryClient.invalidateQueries({ queryKey: ['day-records'] });
                // NÃO fechar o modal aqui - deixar o modal de confirmação controlar
              }}
              showCloseButton={true}
              onClose={() => setIsPunchModalOpen(false)}
            />
          </div>
        </div>
      )}
      </div>
    </MainLayout>
  );
}
