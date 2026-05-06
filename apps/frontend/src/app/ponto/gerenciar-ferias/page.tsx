'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  Users,
  AlertTriangle,
  Eye,
  Check,
  X,
  Search
} from 'lucide-react';
import { Vacation, ComplianceReport } from '@/types';

export default function FeriasPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<'pending' | 'all' | 'compliance'>('pending');
  const [showExpiringModal, setShowExpiringModal] = useState(false);
  const [searchExpiring, setSearchExpiring] = useState('');
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [searchExpired, setSearchExpired] = useState('');

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  // Buscar férias pendentes
  const { data: pendingVacations, isLoading: loadingPending } = useQuery({
    queryKey: ['pending-vacations'],
    queryFn: async () => {
      const res = await api.get('/vacations/pending');
      return res.data;
    },
  });

  // Buscar todas as férias
  const { data: allVacations, isLoading: loadingAll } = useQuery({
    queryKey: ['all-vacations'],
    queryFn: async () => {
      const res = await api.get('/vacations');
      return res.data;
    },
  });

  // Buscar relatório de conformidade
  const { data: complianceData, isLoading: loadingCompliance } = useQuery({
    queryKey: ['vacation-compliance'],
    queryFn: async () => {
      const res = await api.get('/vacations/reports/compliance');
      return res.data;
    },
  });

  // Buscar férias vencendo
  const { data: expiringVacations } = useQuery({
    queryKey: ['expiring-vacations'],
    queryFn: async () => {
      const res = await api.get('/vacations/expiring?days=30');
      return res.data;
    },
  });

  // Mutation para aprovar férias
  const approveVacationMutation = useMutation({
    mutationFn: async (vacationId: string) => {
      const res = await api.put(`/vacations/${vacationId}/approve`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Férias aprovada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['pending-vacations'] });
      queryClient.invalidateQueries({ queryKey: ['all-vacations'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-compliance'] });
    },
    onError: () => {
      toast.error('Erro ao aprovar férias');
    }
  });

  // Mutation para rejeitar férias
  const rejectVacationMutation = useMutation({
    mutationFn: async ({ vacationId, reason }: { vacationId: string, reason: string }) => {
      const res = await api.put(`/vacations/${vacationId}/reject`, { reason });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Férias rejeitada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['pending-vacations'] });
      queryClient.invalidateQueries({ queryKey: ['all-vacations'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-compliance'] });
    },
    onError: () => {
      toast.error('Erro ao rejeitar férias');
    }
  });

  const handleApprove = (vacationId: string) => {
    if (confirm('Tem certeza que deseja aprovar esta solicitação de férias?')) {
      approveVacationMutation.mutate(vacationId);
    }
  };

  const handleReject = (vacationId: string) => {
    const reason = prompt('Digite o motivo da rejeição:');
    if (reason && reason.trim()) {
      rejectVacationMutation.mutate({ vacationId, reason: reason.trim() });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING': return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'APPROVED': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'REJECTED': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'CANCELLED': return <XCircle className="w-5 h-5 text-gray-500" />;
      default: return <AlertCircle className="w-5 h-5 text-blue-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PENDING': return 'Pendente';
      case 'APPROVED': return 'Aprovado';
      case 'REJECTED': return 'Rejeitado';
      case 'CANCELLED': return 'Cancelado';
      case 'NOTICE_SENT': return 'Aviso Enviado';
      case 'NOTICE_CONFIRMED': return 'Aviso Confirmado';
      case 'IN_PROGRESS': return 'Em Andamento';
      case 'COMPLETED': return 'Concluído';
      case 'EXPIRED': return 'Vencido';
      default: return status;
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'ANNUAL': return 'Anual';
      case 'FRACTIONED_1': return '1º Período Fracionado';
      case 'FRACTIONED_2': return '2º Período Fracionado';
      case 'FRACTIONED_3': return '3º Período Fracionado';
      case 'SICK': return 'Por Doença';
      case 'MATERNITY': return 'Maternidade';
      case 'PATERNITY': return 'Paternidade';
      case 'EMERGENCY': return 'Emergência';
      case 'COLLECTIVE': return 'Coletiva';
      default: return type;
    }
  };

  if (loadingUser) {
    return (
      <Loading 
        message="Carregando..."
        fullScreen
        size="lg"
      />
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  const pendingVacationsList: Vacation[] = pendingVacations?.data || [];
  const allVacationsList: Vacation[] = allVacations?.data || [];
  const compliance: ComplianceReport = complianceData?.data;
  const expiringList = expiringVacations?.data || [];

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={() => {
        localStorage.removeItem('token');
        router.push('/auth/login');
      }}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Gestão de Férias</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Gerencie as solicitações de férias dos funcionários
          </p>
        </div>

        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pendentes</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {loadingPending ? '...' : pendingVacationsList.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Aprovadas</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {loadingAll ? '...' : allVacationsList.filter(v => v.status === 'APPROVED').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center flex-1 min-w-[120px] pr-2">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex-shrink-0">
                    <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="ml-3 flex-1 overflow-hidden">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 leading-tight break-normal">Vencendo</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {expiringList.length}
                    </p>
                  </div>
                </div>
                {expiringList.length > 0 && (
                  <button
                    onClick={() => setShowExpiringModal(true)}
                    className="p-2 sm:p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors flex-shrink-0 mt-1 sm:mt-0"
                    title="Ver lista"
                  >
                    <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center flex-1 min-w-[120px] pr-2">
                  <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg flex-shrink-0">
                    <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="ml-3 flex-1 overflow-hidden">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 leading-tight break-normal">Vencidas</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {loadingCompliance ? '...' : (compliance?.expiredVacations?.length || 0)}
                    </p>
                  </div>
                </div>
                {compliance?.expiredVacations && compliance.expiredVacations.length > 0 && (
                  <button
                    onClick={() => setShowExpiredModal(true)}
                    className="p-2 sm:p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors flex-shrink-0 mt-1 sm:mt-0"
                    title="Ver lista"
                  >
                    <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setSelectedTab('pending')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                selectedTab === 'pending'
                  ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              Pendentes ({pendingVacationsList.length})
            </button>
            <button
              onClick={() => setSelectedTab('all')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                selectedTab === 'all'
                  ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              Todas ({allVacationsList.length})
            </button>
            <button
              onClick={() => setSelectedTab('compliance')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                selectedTab === 'compliance'
                  ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              Conformidade
            </button>
          </nav>
        </div>

        {/* Conteúdo das Tabs */}
        {selectedTab === 'pending' && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Solicitações Pendentes</h2>
            </CardHeader>
            <CardContent>
              {loadingPending ? (
                <div className="text-center py-8">
                  <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">Carregando solicitações...</p>
                </div>
              ) : pendingVacationsList.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-400 dark:text-green-500 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhuma solicitação pendente</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingVacationsList.map((vacation) => (
                    <div
                      key={vacation.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {getStatusIcon(vacation.status)}
                          <div>
                            <h3 className="font-medium text-gray-900 dark:text-gray-100">
                              {vacation.user.name} - {vacation.employee.department}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {getTypeText(vacation.type)} • {vacation.days} dias •{' '}
                              {new Date(vacation.startDate).toLocaleDateString('pt-BR')} -{' '}
                              {new Date(vacation.endDate).toLocaleDateString('pt-BR')}
                            </p>
                            {vacation.reason && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                <strong>Motivo:</strong> {vacation.reason}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(vacation.id)}
                            disabled={approveVacationMutation.isPending}
                            className="bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-800"
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(vacation.id)}
                            disabled={rejectVacationMutation.isPending}
                            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Rejeitar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {selectedTab === 'all' && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Todas as Férias</h2>
            </CardHeader>
            <CardContent>
              {loadingAll ? (
                <div className="text-center py-8">
                  <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">Carregando férias...</p>
                </div>
              ) : allVacationsList.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhuma férias encontrada</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {allVacationsList.map((vacation) => (
                    <div
                      key={vacation.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {getStatusIcon(vacation.status)}
                          <div>
                            <h3 className="font-medium text-gray-900 dark:text-gray-100">
                              {vacation.user.name} - {vacation.employee.department}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {getTypeText(vacation.type)} • {vacation.days} dias •{' '}
                              {new Date(vacation.startDate).toLocaleDateString('pt-BR')} -{' '}
                              {new Date(vacation.endDate).toLocaleDateString('pt-BR')}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Solicitado em: {new Date(vacation.createdAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            vacation.status === 'PENDING' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' :
                            vacation.status === 'APPROVED' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                            vacation.status === 'REJECTED' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                            'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                          }`}>
                            {getStatusText(vacation.status)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {selectedTab === 'compliance' && (
          <div className="space-y-6">
            {/* Relatório de Conformidade */}
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Relatório de Conformidade</h2>
              </CardHeader>
              <CardContent>
                {loadingCompliance ? (
                  <div className="text-center py-8">
                    <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">Carregando relatório...</p>
                  </div>
                ) : compliance ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                      <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{compliance.complianceRate.toFixed(1)}%</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Taxa de Conformidade</p>
                    </div>
                    <div className="text-center p-4 bg-red-50 dark:bg-red-900/30 rounded-lg">
                      <p className="text-3xl font-bold text-red-600 dark:text-red-400">{compliance.expiredVacations.length}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Férias Vencidas</p>
                    </div>
                    <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
                      <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{compliance.upcomingExpirations}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Vencendo em 30 dias</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600 dark:text-gray-400">Nenhum dado de conformidade disponível</p>
                )}
              </CardContent>
            </Card>

            {/* Férias Vencendo */}
            {expiringList.length > 0 && (
              <Card>
                <CardHeader>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Férias Vencendo</h2>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {expiringList.map((item: any) => (
                      <div
                        key={item.userId}
                        className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium text-red-900 dark:text-red-300">{item.employeeName}</h3>
                            <p className="text-sm text-red-700 dark:text-red-300">
                              {item.department} • {item.availableDays} dias disponíveis
                            </p>
                            <p className="text-sm text-red-600 dark:text-red-400">
                              Vence em: {new Date(item.expiresAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <AlertTriangle className="w-6 h-6 text-red-500 dark:text-red-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Modal de Funcionários com Férias Vencendo */}
      {showExpiringModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => {
            setShowExpiringModal(false);
            setSearchExpiring('');
          }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Funcionários com Férias Vencendo ({expiringList.length})
              </h3>
              <button
                onClick={() => {
                  setShowExpiringModal(false);
                  setSearchExpiring('');
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
                  placeholder="Pesquisar por nome, departamento..."
                  value={searchExpiring}
                  onChange={(e) => setSearchExpiring(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
            </div>
            <div className="overflow-y-auto p-6">
              {(() => {
                const filtered = expiringList.filter((item: any) => {
                  if (!searchExpiring.trim()) return true;
                  const searchLower = searchExpiring.toLowerCase();
                  return (
                    item.employeeName?.toLowerCase().includes(searchLower) ||
                    item.department?.toLowerCase().includes(searchLower)
                  );
                });
                
                return filtered.length > 0 ? (
                  <div className="space-y-3">
                    {filtered.map((item: any) => (
                      <div
                        key={item.userId}
                        className="p-4 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-red-900 dark:text-red-300">{item.employeeName}</p>
                            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                              {item.department} • {item.availableDays} dias disponíveis
                            </p>
                            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                              Vence em: {new Date(item.expiresAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <AlertTriangle className="w-6 h-6 text-red-500 dark:text-red-400 flex-shrink-0 ml-4" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    {searchExpiring.trim() 
                      ? 'Nenhum funcionário encontrado com o termo pesquisado'
                      : 'Nenhum funcionário com férias vencendo'}
                  </p>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Funcionários com Férias Vencidas */}
      {showExpiredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => {
            setShowExpiredModal(false);
            setSearchExpired('');
          }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Funcionários com Férias Vencidas ({compliance?.expiredVacations?.length || 0})
              </h3>
              <button
                onClick={() => {
                  setShowExpiredModal(false);
                  setSearchExpired('');
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
                  placeholder="Pesquisar por nome, departamento..."
                  value={searchExpired}
                  onChange={(e) => setSearchExpired(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
            </div>
            <div className="overflow-y-auto p-6">
              {(() => {
                const expiredList = compliance?.expiredVacations || [];
                const filtered = expiredList.filter((item: any) => {
                  if (!searchExpired.trim()) return true;
                  const searchLower = searchExpired.toLowerCase();
                  return (
                    item.employeeName?.toLowerCase().includes(searchLower) ||
                    item.employee?.name?.toLowerCase().includes(searchLower) ||
                    item.department?.toLowerCase().includes(searchLower) ||
                    item.employee?.department?.toLowerCase().includes(searchLower)
                  );
                });
                
                return filtered.length > 0 ? (
                  <div className="space-y-3">
                    {filtered.map((item: any, index: number) => {
                      const employeeName = item.employeeName || item.employee?.name || 'N/A';
                      const department = item.department || item.employee?.department || 'N/A';
                      const availableDays = item.availableDays || item.daysAvailable || 0;
                      const expiresAt = item.expiresAt || item.expiredAt;
                      
                      return (
                        <div
                          key={item.userId || item.employeeId || index}
                          className="p-4 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-red-900 dark:text-red-300">{employeeName}</p>
                              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                                {department} • {availableDays} dias disponíveis
                              </p>
                              {expiresAt && (
                                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                                  Venceu em: {new Date(expiresAt).toLocaleDateString('pt-BR')}
                                </p>
                              )}
                            </div>
                            <XCircle className="w-6 h-6 text-red-500 dark:text-red-400 flex-shrink-0 ml-4" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    {searchExpired.trim() 
                      ? 'Nenhum funcionário encontrado com o termo pesquisado'
                      : 'Nenhum funcionário com férias vencidas'}
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
