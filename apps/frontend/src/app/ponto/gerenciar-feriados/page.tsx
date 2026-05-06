'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { 
  Calendar, 
  Plus, 
  Edit, 
  Trash2, 
  Download,
  Upload,
  RefreshCw,
  Filter,
  Search,
  X,
  Check,
  AlertCircle,
  MapPin,
  Building2,
  Flag,
  ChevronDown,
  ChevronUp,
  RotateCcw
} from 'lucide-react';

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: 'NATIONAL' | 'STATE' | 'MUNICIPAL' | 'OPTIONAL' | 'COMPANY';
  isRecurring: boolean;
  state?: string;
  city?: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function GerenciarFeriadosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    date: string;
    type: Holiday['type'];
    isRecurring: boolean;
    state?: string;
    city: string;
    description: string;
    isActive: boolean;
  }>({
    name: '',
    date: '',
    type: 'NATIONAL',
    isRecurring: false,
    state: undefined,
    city: '',
    description: '',
    isActive: true,
  });
  const [importYear, setImportYear] = useState(new Date().getFullYear());

  // Buscar dados do usuário
  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  // Buscar feriados
  const { data: holidaysData, isLoading } = useQuery({
    queryKey: ['holidays', selectedYear, selectedMonth, filterType],
    queryFn: async () => {
      const params: any = { year: selectedYear };
      if (selectedMonth) params.month = selectedMonth;
      if (filterType) params.type = filterType;
      // Não filtrar por isActive na página de gerenciamento - mostrar todos
      
      const res = await api.get('/holidays', { params });
      console.log('Feriados recebidos:', res.data);
      return res.data;
    },
  });

  const holidays: Holiday[] = holidaysData?.data || [];

  // Filtrar por termo de busca
  const filteredHolidays = holidays.filter(holiday =>
    holiday.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    holiday.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Mutation para criar feriado
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/holidays', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Feriado criado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar feriado');
    },
  });

  // Mutation para atualizar feriado
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.put(`/holidays/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Feriado atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setIsModalOpen(false);
      setEditingHoliday(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar feriado');
    },
  });

  // Mutation para deletar feriado
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/holidays/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Feriado deletado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
    },
    onError: () => {
      toast.error('Erro ao deletar feriado');
    },
  });

  // Mutation para importar feriados nacionais
  const importMutation = useMutation({
    mutationFn: async (year: number) => {
      const res = await api.post('/holidays/import/national', { year });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`${data.count} feriados nacionais importados com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setIsImportModalOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao importar feriados');
    },
  });

  // Mutation para gerar feriados recorrentes
  const generateRecurringMutation = useMutation({
    mutationFn: async (year: number) => {
      const res = await api.post('/holidays/generate/recurring', { year });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`${data.count} feriados recorrentes gerados com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao gerar feriados');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      date: '',
      type: 'NATIONAL',
      isRecurring: false,
      state: undefined,
      city: '',
      description: '',
      isActive: true,
    });
    setEditingHoliday(null);
  };

  const handleEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setFormData({
      name: holiday.name,
      date: holiday.date.split('T')[0],
      type: holiday.type,
      isRecurring: holiday.isRecurring,
      state: holiday.state,
      city: holiday.city || '',
      description: holiday.description || '',
      isActive: holiday.isActive,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Limpar campos vazios antes de enviar
    const dataToSend = {
      ...formData,
      state: formData.state || undefined,
      city: formData.city || undefined,
      description: formData.description || undefined,
    };
    
    if (editingHoliday) {
      updateMutation.mutate({ id: editingHoliday.id, data: dataToSend });
    } else {
      createMutation.mutate(dataToSend);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja deletar este feriado?')) {
      deleteMutation.mutate(id);
    }
  };

  const getTypeLabel = (type: Holiday['type']) => {
    const labels: Record<Holiday['type'], string> = {
      NATIONAL: 'Nacional',
      STATE: 'Estadual',
      MUNICIPAL: 'Municipal',
      OPTIONAL: 'Ponto Facultativo',
      COMPANY: 'Empresa',
    };
    return labels[type];
  };

  const getTypeIcon = (type: Holiday['type']) => {
    switch (type) {
      case 'NATIONAL':
        return <Flag className="w-4 h-4 text-blue-500" />;
      case 'STATE':
        return <MapPin className="w-4 h-4 text-green-500" />;
      case 'MUNICIPAL':
        return <Building2 className="w-4 h-4 text-purple-500" />;
      case 'OPTIONAL':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'COMPANY':
        return <Building2 className="w-4 h-4 text-orange-500" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getStateName = (stateCode?: string) => {
    if (!stateCode) return null;
    const states: Record<string, string> = {
      'DF': 'Distrito Federal (Brasília)',
      'GO': 'Goiás',
    };
    return states[stateCode] || stateCode;
  };

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Gerenciar Feriados</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Gerencie o calendário de feriados da empresa
          </p>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader className="border-b-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
              </div>
              <div className="flex items-center space-x-4">
                {!isFiltersMinimized && (
                  <>
                    <button
                      onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                      className="flex items-center justify-center w-8 h-8 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title={showAdvancedFilters ? 'Ocultar filtros avançados' : 'Mostrar filtros avançados'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.354 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l1.218-1.348"/><path d="M16 6h6"/><path d="M19 3v6"/></svg>
                    </button>
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setSelectedYear(new Date().getFullYear());
                        setSelectedMonth(undefined);
                        setFilterType('');
                      }}
                      className="flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Limpar todos os filtros"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setIsFiltersMinimized(!isFiltersMinimized)}
                  className="flex items-center justify-center w-8 h-8 text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title={isFiltersMinimized ? 'Expandir filtros' : 'Minimizar filtros'}
                >
                  {isFiltersMinimized ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronUp className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </CardHeader>
          {!isFiltersMinimized && (
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-4">
                {/* Filtro Principal - Busca Geral */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Buscar Feriado
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Digite o nome do feriado..."
                      className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    />
                  </div>
                </div>

                {/* Filtros Avançados - Condicionais */}
                {showAdvancedFilters && (
                  <div className="border-t dark:border-gray-700 pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtros Específicos</h4>
                    </div>
                    
                    {/* Grupo 1: Filtros de Período e Tipo */}
                    <div className="space-y-3">
                      <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Período e Tipo</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Ano
                          </label>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                            <select
                              value={selectedYear}
                              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                            >
                              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((year) => (
                                <option key={year} value={year}>
                                  {year}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Mês
                          </label>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                            <select
                              value={selectedMonth || ''}
                              onChange={(e) => setSelectedMonth(e.target.value ? parseInt(e.target.value) : undefined)}
                              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                            >
                              <option value="">Todos os meses</option>
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                                <option key={month} value={month}>
                                  {new Date(2000, month - 1).toLocaleDateString('pt-BR', { month: 'long' })}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Tipo
                          </label>
                          <div className="relative">
                            <Flag className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                            <select
                              value={filterType}
                              onChange={(e) => setFilterType(e.target.value)}
                              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                            >
                              <option value="">Todos os tipos</option>
                              <option value="NATIONAL">Nacional</option>
                              <option value="STATE">Estadual</option>
                              <option value="MUNICIPAL">Municipal</option>
                              <option value="OPTIONAL">Ponto Facultativo</option>
                              <option value="COMPANY">Empresa</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Lista de Feriados */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                  <Calendar className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Feriados ({filteredHolidays.length})</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Calendário de feriados da empresa</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                {selectedYear && (
                  <button
                    onClick={() => generateRecurringMutation.mutate(selectedYear)}
                    disabled={generateRecurringMutation.isPending}
                    className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
                    title="Gerar feriados recorrentes"
                  >
                    <RefreshCw className={`w-4 h-4 ${generateRecurringMutation.isPending ? 'animate-spin' : ''}`} />
                    <span>Gerar Recorrentes</span>
                  </button>
                )}
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
                  title="Importar feriados nacionais"
                >
                  <Upload className="w-4 h-4" />
                  <span>Importar</span>
                </button>
                <button
                  onClick={() => {
                    resetForm();
                    setIsModalOpen(true);
                  }}
                  className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base"
                  title="Criar novo feriado"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Feriado</span>
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6">
                <Loading />
              </div>
            ) : filteredHolidays.length === 0 ? (
              <div className="p-6 text-center py-12">
                <Calendar className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">Nenhum feriado encontrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Data
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Nome
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Localização
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Recorrente
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredHolidays.map((holiday) => (
                      <tr key={holiday.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {formatDate(holiday.date)}
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4">
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {holiday.name}
                            </div>
                            {holiday.description && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {holiday.description}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            {getTypeIcon(holiday.type)}
                            <span className="text-sm text-gray-900 dark:text-gray-100">{getTypeLabel(holiday.type)}</span>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                          {holiday.city ? (
                            <span className="text-sm text-gray-900 dark:text-gray-100">{holiday.city}, {getStateName(holiday.state) || holiday.state}</span>
                          ) : holiday.state ? (
                            <span className="text-sm text-gray-900 dark:text-gray-100">{getStateName(holiday.state)}</span>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-gray-500">Nacional</span>
                          )}
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                          {holiday.isRecurring ? (
                            <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                              <Check className="w-4 h-4" />
                              <span className="text-sm">Sim</span>
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-gray-500">Não</span>
                          )}
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                          {holiday.isActive ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
                              Inativo
                            </span>
                          )}
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleEdit(holiday)}
                              className="inline-flex items-center justify-center h-8 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent dark:bg-transparent hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
                              title="Editar feriado"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(holiday.id)}
                              className="inline-flex items-center justify-center h-8 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent dark:bg-transparent hover:bg-red-50 dark:hover:bg-red-900/30 active:bg-red-100 dark:active:bg-red-900/50 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
                              title="Excluir feriado"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal de Criar/Editar Feriado */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            resetForm();
          }}
          title={editingHoliday ? 'Editar Feriado' : 'Novo Feriado'}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nome do Feriado *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="Ex: Dia do Trabalhador"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Data *
              </label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tipo *
              </label>
              <select
                value={formData.type}
                onChange={(e) => {
                  const newType = e.target.value as Holiday['type'];
                  // Limpar estado se não for feriado estadual
                  const currentState: string = formData.state || '';
                  setFormData({ 
                    ...formData, 
                    type: newType,
                    state: newType === 'STATE' ? currentState : undefined
                  });
                }}
                className="w-full"
                required
              >
                <option value="NATIONAL">Nacional</option>
                <option value="STATE">Estadual</option>
                <option value="MUNICIPAL">Municipal</option>
                <option value="OPTIONAL">Ponto Facultativo</option>
                <option value="COMPANY">Empresa</option>
              </select>
            </div>

            {formData.type === 'STATE' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Estado *
                </label>
                <select
                  value={formData.state || ''}
                  onChange={(e) => {
                    const newState: string = e.target.value;
                    setFormData({ ...formData, state: newState || undefined });
                  }}
                  className="w-full"
                  required
                >
                  <option value="">Selecione um estado</option>
                  <option value="DF">Distrito Federal (DF) - Brasília</option>
                  <option value="GO">Goiás (GO)</option>
                </select>
              </div>
            )}

            {formData.type === 'MUNICIPAL' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cidade *
                </label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Ex: São Paulo"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Descrição
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full"
                rows={3}
                placeholder="Descrição adicional do feriado"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isRecurring}
                  onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 bg-white dark:bg-gray-800"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Feriado recorrente (todos os anos)</span>
              </label>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 bg-white dark:bg-gray-800"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Ativo</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingHoliday ? 'Atualizar' : 'Criar'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal de Importação */}
        <Modal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          title="Importar Feriados Nacionais"
        >
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Importe automaticamente todos os feriados nacionais do Brasil para o ano selecionado.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Ano
              </label>
              <Input
                type="number"
                value={importYear}
                onChange={(e) => setImportYear(parseInt(e.target.value))}
                min={2020}
                max={2100}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsImportModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => importMutation.mutate(importYear)}
                disabled={importMutation.isPending}
              >
                {importMutation.isPending ? 'Importando...' : 'Importar'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </MainLayout>
  );
}

