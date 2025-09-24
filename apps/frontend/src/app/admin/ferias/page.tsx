'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  Users,
  TrendingUp,
  AlertTriangle,
  Eye,
  Check,
  X
} from 'lucide-react';
import { Vacation, ComplianceReport } from '@/types';

export default function AdminVacationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<'pending' | 'all' | 'compliance'>('pending');

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
    role: 'ADMIN'
  };

  if (user.role !== 'ADMIN' && user.role !== 'HR') {
    router.push('/dashboard');
    return null;
  }

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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gestão de Férias</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600">
            Gerencie as solicitações de férias dos funcionários
          </p>
        </div>

        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="w-6 h-6 text-yellow-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Pendentes</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {loadingPending ? '...' : pendingVacationsList.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Aprovadas</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {loadingAll ? '...' : allVacationsList.filter(v => v.status === 'APPROVED').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Vencendo</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {expiringList.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Conformidade</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {loadingCompliance ? '...' : `${compliance?.complianceRate.toFixed(1)}%`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setSelectedTab('pending')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                selectedTab === 'pending'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Pendentes ({pendingVacationsList.length})
            </button>
            <button
              onClick={() => setSelectedTab('all')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                selectedTab === 'all'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Todas ({allVacationsList.length})
            </button>
            <button
              onClick={() => setSelectedTab('compliance')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                selectedTab === 'compliance'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
              <h2 className="text-lg font-semibold text-gray-900">Solicitações Pendentes</h2>
            </CardHeader>
            <CardContent>
              {loadingPending ? (
                <div className="text-center py-8">
                  <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
                  <p className="text-gray-600">Carregando solicitações...</p>
                </div>
              ) : pendingVacationsList.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                  <p className="text-gray-600">Nenhuma solicitação pendente</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingVacationsList.map((vacation) => (
                    <div
                      key={vacation.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {getStatusIcon(vacation.status)}
                          <div>
                            <h3 className="font-medium text-gray-900">
                              {vacation.user.name} - {vacation.employee.department}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {getTypeText(vacation.type)} • {vacation.days} dias •{' '}
                              {new Date(vacation.startDate).toLocaleDateString('pt-BR')} -{' '}
                              {new Date(vacation.endDate).toLocaleDateString('pt-BR')}
                            </p>
                            {vacation.reason && (
                              <p className="text-sm text-gray-500 mt-1">
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
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(vacation.id)}
                            disabled={rejectVacationMutation.isPending}
                            className="text-red-600 hover:text-red-700"
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
              <h2 className="text-lg font-semibold text-gray-900">Todas as Férias</h2>
            </CardHeader>
            <CardContent>
              {loadingAll ? (
                <div className="text-center py-8">
                  <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
                  <p className="text-gray-600">Carregando férias...</p>
                </div>
              ) : allVacationsList.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Nenhuma férias encontrada</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {allVacationsList.map((vacation) => (
                    <div
                      key={vacation.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {getStatusIcon(vacation.status)}
                          <div>
                            <h3 className="font-medium text-gray-900">
                              {vacation.user.name} - {vacation.employee.department}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {getTypeText(vacation.type)} • {vacation.days} dias •{' '}
                              {new Date(vacation.startDate).toLocaleDateString('pt-BR')} -{' '}
                              {new Date(vacation.endDate).toLocaleDateString('pt-BR')}
                            </p>
                            <p className="text-sm text-gray-500">
                              Solicitado em: {new Date(vacation.createdAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            vacation.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                            vacation.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                            vacation.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
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
                <h2 className="text-lg font-semibold text-gray-900">Relatório de Conformidade</h2>
              </CardHeader>
              <CardContent>
                {loadingCompliance ? (
                  <div className="text-center py-8">
                    <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
                    <p className="text-gray-600">Carregando relatório...</p>
                  </div>
                ) : compliance ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <p className="text-3xl font-bold text-blue-600">{compliance.complianceRate.toFixed(1)}%</p>
                      <p className="text-sm text-gray-600">Taxa de Conformidade</p>
                    </div>
                    <div className="text-center p-4 bg-red-50 rounded-lg">
                      <p className="text-3xl font-bold text-red-600">{compliance.expiredVacations.length}</p>
                      <p className="text-sm text-gray-600">Férias Vencidas</p>
                    </div>
                    <div className="text-center p-4 bg-yellow-50 rounded-lg">
                      <p className="text-3xl font-bold text-yellow-600">{compliance.upcomingExpirations}</p>
                      <p className="text-sm text-gray-600">Vencendo em 30 dias</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600">Nenhum dado de conformidade disponível</p>
                )}
              </CardContent>
            </Card>

            {/* Férias Vencendo */}
            {expiringList.length > 0 && (
              <Card>
                <CardHeader>
                  <h2 className="text-lg font-semibold text-gray-900">Férias Vencendo</h2>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {expiringList.map((item: any) => (
                      <div
                        key={item.userId}
                        className="border border-red-200 bg-red-50 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium text-red-900">{item.employeeName}</h3>
                            <p className="text-sm text-red-700">
                              {item.department} • {item.availableDays} dias disponíveis
                            </p>
                            <p className="text-sm text-red-600">
                              Vence em: {new Date(item.expiresAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <AlertTriangle className="w-6 h-6 text-red-500" />
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
    </MainLayout>
  );
}
