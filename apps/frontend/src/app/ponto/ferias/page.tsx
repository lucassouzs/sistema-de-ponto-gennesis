'use client';

import React, { useState, useEffect } from 'react';
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
  Plus,
  Eye,
  Trash2,
  CalendarDays,
  CalendarCheck,
  CalendarX
} from 'lucide-react';
import { VacationFormData, VacationBalance, Vacation } from '@/types';

// Função helper para formatar data corretamente (evita problemas de timezone)
const formatDate = (dateString: string | Date): string => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  // Usar UTC para evitar problemas de timezone ao exibir datas do banco
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${day}/${month}/${year}`;
};

export default function VacationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<VacationFormData>({
    startDate: '',
    endDate: '',
    type: 'ANNUAL',
    reason: '',
    fraction: undefined
  });

  // Calcular quantidade de dias entre as datas (inclusive)
  const calculateDays = (start: string, end: string): number | null => {
    if (!start || !end) return null;
    
    // Parse das datas no formato YYYY-MM-DD
    const startParts = start.split('-');
    const endParts = end.split('-');
    
    if (startParts.length !== 3 || endParts.length !== 3) return null;
    
    // Criar datas no timezone local (sem hora) para cálculo correto
    const startYear = parseInt(startParts[0]);
    const startMonth = parseInt(startParts[1]) - 1;
    const startDay = parseInt(startParts[2]);
    
    const endYear = parseInt(endParts[0]);
    const endMonth = parseInt(endParts[1]) - 1;
    const endDay = parseInt(endParts[2]);
    
    // Calcular diferença diretamente: (endDay - startDay) + 1
    // Mas precisamos considerar meses e anos também
    const startDate = new Date(startYear, startMonth, startDay);
    const endDate = new Date(endYear, endMonth, endDay);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
    if (endDate < startDate) return null;
    
    // Calcular diferença em dias (inclusive): (endDate - startDate) + 1
    // Usar Math.floor para garantir cálculo correto
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 para incluir ambos os dias
    return diffDays;
  };

  const vacationDays = calculateDays(formData.startDate, formData.endDate);

  // Quando o tipo mudar para ANNUAL, limpar o fraction
  const handleTypeChange = (newType: string) => {
    if (newType === 'ANNUAL') {
      setFormData({ ...formData, type: newType, fraction: undefined });
    } else {
      setFormData({ ...formData, type: newType });
    }
  };

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  // Buscar saldo de férias
  const { data: balanceData, isLoading: loadingBalance } = useQuery({
    queryKey: ['vacation-balance'],
    queryFn: async () => {
      const res = await api.get('/vacations/my-vacations/balance');
      return res.data;
    },
  });

  // Buscar férias do usuário
  const { data: vacationsData, isLoading: loadingVacations } = useQuery({
    queryKey: ['my-vacations'],
    queryFn: async () => {
      const res = await api.get('/vacations/my-vacations');
      return res.data;
    },
  });

  // Mutation para solicitar férias
  const requestVacationMutation = useMutation({
    mutationFn: async (data: VacationFormData) => {
      const res = await api.post('/vacations/request', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação de férias criada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['my-vacations'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-balance'] });
      setShowForm(false);
      setFormData({
        startDate: '',
        endDate: '',
        type: 'ANNUAL',
        reason: '',
        fraction: undefined
      });
    },
    onError: (error: any) => {
      const errorData = error.response?.data;
      if (errorData?.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
        // Mostrar todos os erros de validação
        errorData.errors.forEach((err: string) => {
          toast.error(err);
        });
      } else if (errorData?.warnings && Array.isArray(errorData.warnings) && errorData.warnings.length > 0) {
        // Se só houver avisos, mostrar mas permitir continuar
        errorData.warnings.forEach((warn: string) => {
          toast.error(warn);
        });
      } else {
        const message = errorData?.message || 'Erro ao criar solicitação';
        toast.error(message);
      }
    }
  });

  // Mutation para cancelar férias
  const cancelVacationMutation = useMutation({
    mutationFn: async (vacationId: string) => {
      const res = await api.put(`/vacations/${vacationId}/cancel`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação cancelada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['my-vacations'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-balance'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao cancelar solicitação');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação: se for fracionado, o período fracionado é obrigatório
    if (formData.type === 'FRACTIONED' && !formData.fraction) {
      toast.error('Por favor, selecione o período fracionado');
      return;
    }
    
    // Se for anual, garantir que fraction seja undefined
    const dataToSubmit = formData.type === 'ANNUAL' 
      ? { ...formData, fraction: undefined }
      : formData;
    requestVacationMutation.mutate(dataToSubmit);
  };

  const handleCancel = (vacationId: string) => {
    if (confirm('Tem certeza que deseja cancelar esta solicitação?')) {
      cancelVacationMutation.mutate(vacationId);
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

  const getTypeText = (type: string, fraction?: number) => {
    switch (type) {
      case 'ANNUAL': return 'Férias Completas';
      case 'FRACTIONED_1': return '1º Período Fracionado';
      case 'FRACTIONED_2': return '2º Período Fracionado';
      case 'FRACTIONED_3': return '3º Período Fracionado';
      case 'FRACTIONED': 
        if (fraction === 1) return '1º Período Fracionado';
        if (fraction === 2) return '2º Período Fracionado';
        if (fraction === 3) return '3º Período Fracionado';
        return 'Fracionado';
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

  // Removido: verificação de role - agora usamos apenas cargos

  const balance: VacationBalance = balanceData?.data;
  const vacations: Vacation[] = vacationsData?.data || [];

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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Minhas Férias</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Solicite e acompanhe suas férias
          </p>
        </div>

        {/* Saldo de Férias */}
        {balance && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                    <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Total</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{balance.totalDays}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg flex-shrink-0">
                    <CalendarCheck className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Disponível</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{balance.availableDays}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex-shrink-0">
                    <CalendarX className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Usado</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{balance.usedDays}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg flex-shrink-0">
                    <XCircle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Vencidos</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{balance.expiredDays || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Botão para solicitar férias */}
        <div className="flex justify-end">
          <Button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Solicitar Férias</span>
          </Button>
        </div>

        {/* Formulário de solicitação */}
        {showForm && (
          <Card>
            <CardHeader className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                  <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nova Solicitação de Férias</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Preencha os dados para solicitar suas férias</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Data de Início *
                    </label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      required
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer relative"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Data de Fim *
                    </label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      required
                      min={formData.startDate || new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer relative"
                    />
                  </div>
                </div>
                {vacationDays !== null && vacationDays > 0 && (
                  <div className="flex items-center space-x-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                    <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      {vacationDays} {vacationDays === 1 ? 'dia' : 'dias'} de férias
                    </span>
                  </div>
                )}

                <div className={`grid gap-4 ${formData.type === 'FRACTIONED' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-1'}`}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tipo de Férias *
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => handleTypeChange(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="ANNUAL">Férias Completas</option>
                      <option value="FRACTIONED">Fracionado</option>
                    </select>
                  </div>
                  {formData.type === 'FRACTIONED' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Período Fracionado *
                      </label>
                      <select
                        value={formData.fraction || ''}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          fraction: e.target.value ? Number(e.target.value) : undefined 
                        })}
                        required={formData.type === 'FRACTIONED'}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Selecione o período</option>
                        <option value="1">1º Período</option>
                        <option value="2">2º Período</option>
                        <option value="3">3º Período</option>
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Motivo (opcional)
                  </label>
                  <textarea
                    value={formData.reason || ''}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    placeholder="Descreva o motivo da solicitação..."
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                    className="px-6 py-2"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={requestVacationMutation.isPending}
                    className="px-6 py-2"
                  >
                    {requestVacationMutation.isPending ? 'Enviando...' : 'Solicitar'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Lista de Férias */}
        <Card>
          <CardHeader className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Histórico de Férias</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Acompanhe suas solicitações de férias</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {loadingVacations ? (
              <div className="text-center py-8">
                <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">Carregando férias...</p>
              </div>
            ) : vacations.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">Nenhuma solicitação de férias encontrada</p>
              </div>
            ) : (
              <div className="space-y-4">
                {vacations.map((vacation) => (
                  <div
                    key={vacation.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(vacation.status)}
                        <div>
                          <h3 className="font-medium text-gray-900 dark:text-gray-100">
                            {getTypeText(vacation.type, vacation.fraction || undefined)}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {formatDate(vacation.startDate)} - {formatDate(vacation.endDate)} ({vacation.days} dias)
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
                        {vacation.status === 'PENDING' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancel(vacation.id)}
                            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {vacation.reason && (
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        <strong>Motivo:</strong> {vacation.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
