'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { 
  Clock, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Eye,
  FileText,
  User,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Users,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Building2
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { DEPARTMENTS_LIST, COMPANIES_LIST } from '@/constants/payrollFilters';
import { CARGOS_LIST } from '@/constants/cargos';

interface PointCorrectionRequest {
  id: string;
  title: string;
  description: string;
  justification: string;
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  originalDate: string;
  originalTime: string;
  originalType: 'ENTRY' | 'LUNCH_START' | 'LUNCH_END' | 'EXIT';
  correctedDate: string;
  correctedTime: string;
  correctedType: 'ENTRY' | 'LUNCH_START' | 'LUNCH_END' | 'EXIT';
  createdAt: string;
  approvedAt?: string;
  rejectionReason?: string;
  employee: {
    id: string;
    employeeId: string;
    department: string;
    position: string;
    company?: string;
    user: {
      id: string;
      name: string;
    };
  };
  approver?: {
    id: string;
    name: string;
    email: string;
  };
  comments: Array<{
    id: string;
    comment: string;
    isInternal: boolean;
    createdAt: string;
    user: {
      id: string;
      name: string;
    };
  }>;
}

const getStatusInfo = (status: string) => {
  switch (status) {
    case 'PENDING':
      return { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle };
    case 'IN_REVIEW':
      return { label: 'Em Análise', color: 'bg-blue-100 text-blue-800', icon: Eye };
    case 'APPROVED':
      return { label: 'Aprovada', color: 'bg-green-100 text-green-800', icon: CheckCircle };
    case 'REJECTED':
      return { label: 'Rejeitada', color: 'bg-red-100 text-red-800', icon: XCircle };
    case 'CANCELLED':
      return { label: 'Cancelada', color: 'bg-gray-100 text-gray-800', icon: XCircle };
    default:
      return { label: 'Desconhecido', color: 'bg-gray-100 text-gray-800', icon: AlertCircle };
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'ENTRY': return 'Entrada';
    case 'LUNCH_START': return 'Início Almoço';
    case 'LUNCH_END': return 'Fim Almoço';
    case 'EXIT': return 'Saída';
    default: return type;
  }
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('pt-BR');
};

const formatTime = (timeString: string) => {
  return timeString.substring(0, 5); // HH:MM
};

export default function GerenciarSolicitacoesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [selectedRequest, setSelectedRequest] = useState<PointCorrectionRequest | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionComment, setRejectionComment] = useState('');
  const [activeStatusTab, setActiveStatusTab] = useState<'all' | 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>('PENDING');
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    department: '',
    position: '',
    company: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  // Buscar solicitações para aprovação
  // Buscar todas as solicitações (sem filtro de status) para que o filtro seja feito no frontend
  const { data: requestsData, isLoading: loadingRequests, refetch } = useQuery({
    queryKey: ['point-corrections-gerenciar'],
    queryFn: async () => {
      const res = await api.get('/solicitacoes/gerenciar', {
        params: {
          status: 'all' // Buscar todas as solicitações
        }
      });
      return res.data;
    }
  });

  const allRequests = requestsData?.data || requestsData || [];

  // Calcular estatísticas
  const stats = {
    total: allRequests.length,
    pending: allRequests.filter((r: PointCorrectionRequest) => r.status === 'PENDING').length,
    approved: allRequests.filter((r: PointCorrectionRequest) => r.status === 'APPROVED').length,
    rejected: allRequests.filter((r: PointCorrectionRequest) => r.status === 'REJECTED').length,
    cancelled: allRequests.filter((r: PointCorrectionRequest) => r.status === 'CANCELLED').length,
    inReview: allRequests.filter((r: PointCorrectionRequest) => r.status === 'IN_REVIEW').length
  };

  // Filtrar solicitações
  const filteredRequests = allRequests.filter((request: PointCorrectionRequest) => {
    // Filtro de status (tabs)
    if (activeStatusTab !== 'all') {
      if (request.status !== activeStatusTab) return false;
    }

    // Filtro de busca
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesName = request.employee.user.name.toLowerCase().includes(searchLower);
      const matchesTitle = request.title.toLowerCase().includes(searchLower);
      const matchesJustification = request.justification.toLowerCase().includes(searchLower);
      if (!matchesName && !matchesTitle && !matchesJustification) return false;
    }

    // Filtro de setor
    if (filters.department) {
      if (request.employee.department !== filters.department) return false;
    }

    // Filtro de cargo
    if (filters.position) {
      if (request.employee.position !== filters.position) return false;
    }

    // Filtro de empresa
    if (filters.company) {
      if (request.employee.company !== filters.company) return false;
    }

    // Filtro de mês e ano
    if (filters.month || filters.year) {
      const requestDate = new Date(request.createdAt);
      const requestMonth = requestDate.getMonth() + 1;
      const requestYear = requestDate.getFullYear();
      
      if (filters.month && requestMonth !== filters.month) return false;
      if (filters.year && requestYear !== filters.year) return false;
    }

    return true;
  });

  // Contar solicitações por status
  const statusCounts = {
    all: allRequests.length,
    PENDING: stats.pending,
    IN_REVIEW: stats.inReview,
    APPROVED: stats.approved,
    REJECTED: stats.rejected,
    CANCELLED: stats.cancelled
  };

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

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ ...filters, search: e.target.value });
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ ...filters, month: parseInt(e.target.value) });
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ ...filters, year: parseInt(e.target.value) });
  };

  const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ ...filters, department: e.target.value });
  };

  const handlePositionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ ...filters, position: e.target.value });
  };

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ ...filters, company: e.target.value });
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      department: '',
      position: '',
      company: '',
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear()
    });
  };

  // Mutation para aprovar solicitação
  const approveMutation = useMutation({
    mutationFn: async ({ requestId, comment }: { requestId: string; comment: string }) => {
      const res = await api.post(`/solicitacoes/${requestId}/aprovar`, {
        comment,
        isInternal: false
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação aprovada com sucesso!');
      setShowApprovalModal(false);
      setApprovalComment('');
      setSelectedRequest(null);
      // Mudar para aba de aprovados para mostrar a solicitação aprovada
      setActiveStatusTab('APPROVED');
      // Invalidar cache e refetch - igual à página de registrar solicitação
      queryClient.invalidateQueries({ queryKey: ['point-corrections-gerenciar'] });
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao aprovar solicitação');
    }
  });

  // Mutation para rejeitar solicitação
  const rejectMutation = useMutation({
    mutationFn: async ({ requestId, reason, comment }: { requestId: string; reason: string; comment: string }) => {
      const res = await api.post(`/solicitacoes/${requestId}/rejeitar`, {
        reason,
        comment,
        isInternal: false
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação rejeitada com sucesso!');
      setShowRejectionModal(false);
      setRejectionReason('');
      setRejectionComment('');
      // Mudar para aba de rejeitados para mostrar a solicitação rejeitada
      setActiveStatusTab('REJECTED');
      // Invalidar cache e refetch - igual à página de registrar solicitação
      queryClient.invalidateQueries({ queryKey: ['point-corrections-gerenciar'] });
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao rejeitar solicitação');
    }
  });


  const handleApprove = () => {
    if (!selectedRequest || !approvalComment.trim()) {
      toast.error('Comentário é obrigatório');
      return;
    }
    
    approveMutation.mutate({
      requestId: selectedRequest.id,
      comment: approvalComment
    });
  };

  const handleReject = () => {
    if (!selectedRequest || !rejectionReason.trim() || !rejectionComment.trim()) {
      toast.error('Motivo e comentário são obrigatórios');
      return;
    }
    
    rejectMutation.mutate({
      requestId: selectedRequest.id,
      reason: rejectionReason,
      comment: rejectionComment
    });
  };

  if (loadingUser || loadingRequests) {
    return (
      <Loading 
        message="Carregando solicitações..."
        fullScreen
        size="lg"
      />
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  return (
    <ProtectedRoute route="/ponto/gerenciar-solicitacoes">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
        {/* Cabeçalho */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Gerenciar alterações de ponto</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Aprove ou rejeite solicitações de correção de ponto</p>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Total Registros</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Pendentes</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Aprovados</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.approved}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                  <XCircle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Rejeitados</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.rejected}</p>
                </div>
              </div>
            </CardContent>
          </Card>
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
                      onClick={clearFilters}
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
                    Buscar
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                    <input
                      type="text"
                      value={filters.search}
                      onChange={handleSearchChange}
                      placeholder="Digite nome, título ou justificativa..."
                      className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    />
                  </div>
                </div>

                {/* Filtros Avançados */}
                {showAdvancedFilters && (
                  <div className="border-t dark:border-gray-700 pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtros Avançados</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Setor
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                        <select
                          value={filters.department}
                          onChange={handleDepartmentChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                        >
                            <option value="">Todos os setores</option>
                          {DEPARTMENTS_LIST.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Cargo
                        </label>
                        <select
                          value={filters.position}
                          onChange={handlePositionChange}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                        >
                          <option value="">Todos os cargos</option>
                          {CARGOS_LIST.map(cargo => (
                            <option key={cargo} value={cargo}>{cargo}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Empresa
                        </label>
                        <select
                          value={filters.company}
                          onChange={handleCompanyChange}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                        >
                          <option value="">Todas as empresas</option>
                          {COMPANIES_LIST.map(company => (
                            <option key={company} value={company}>{company}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Mês
                        </label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                          <select
                            value={filters.month}
                            onChange={handleMonthChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
                          >
                            {monthOptions.map(month => (
                              <option key={month.value} value={month.value}>
                                {month.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Ano
                        </label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                          <select
                            value={filters.year}
                            onChange={handleYearChange}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-gray-900 dark:text-gray-100"
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
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Lista de Solicitações */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                  <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Solicitações de Correção</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Lista de todas as solicitações registradas</p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Tabs de Status */}
              <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-4 sm:space-x-8 overflow-x-auto">
                  <button
                    onClick={() => setActiveStatusTab('PENDING')}
                    className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                      activeStatusTab === 'PENDING'
                        ? 'border-yellow-500 dark:border-yellow-400 text-yellow-600 dark:text-yellow-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    Pendentes ({statusCounts.PENDING})
                  </button>
                  <button
                    onClick={() => setActiveStatusTab('APPROVED')}
                    className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                      activeStatusTab === 'APPROVED'
                        ? 'border-green-500 dark:border-green-400 text-green-600 dark:text-green-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    Aprovados ({statusCounts.APPROVED})
                  </button>
                  <button
                    onClick={() => setActiveStatusTab('REJECTED')}
                    className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                      activeStatusTab === 'REJECTED'
                        ? 'border-red-500 dark:border-red-400 text-red-600 dark:text-red-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    Rejeitados ({statusCounts.REJECTED})
                  </button>
                  <button
                    onClick={() => setActiveStatusTab('CANCELLED')}
                    className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                      activeStatusTab === 'CANCELLED'
                        ? 'border-gray-500 dark:border-gray-400 text-gray-600 dark:text-gray-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    Cancelados ({statusCounts.CANCELLED})
                  </button>
                  <button
                    onClick={() => setActiveStatusTab('all')}
                    className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                      activeStatusTab === 'all'
                        ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    Todas ({statusCounts.all})
                  </button>
                </nav>
              </div>

              {/* Lista de solicitações */}
              <div className="space-y-3">
              {filteredRequests.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                  <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Nenhuma solicitação encontrada
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400">
                    {activeStatusTab !== 'all' 
                      ? `Não há solicitações ${getStatusInfo(activeStatusTab).label.toLowerCase()} no momento.`
                      : (filters.search || filters.department || filters.position || filters.company)
                        ? 'Nenhum registro encontrado com os filtros selecionados.'
                        : 'Nenhuma solicitação encontrada.'}
                  </p>
                  </CardContent>
                </Card>
              ) : (
                filteredRequests.map((request: PointCorrectionRequest) => {
                  const statusInfo = getStatusInfo(request.status);
                  const StatusIcon = statusInfo.icon;

                  return (
                    <Card key={request.id} className="hover:shadow-md transition-all duration-200">
                      <CardContent className="p-4">
                        {/* Header compacto */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                                  {request.title}
                              </h4>
                              <Badge className={`${statusInfo.color} shrink-0 text-xs`}>
                                  <StatusIcon className="w-3 h-3 mr-1" />
                                  {statusInfo.label}
                                </Badge>
                              </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                              <User className="w-3 h-3 inline mr-1" />
                                {request.employee.user.name} - {request.employee.position} de {request.employee.department}
                              </p>
                            {request.justification && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">
                                {request.justification}
                              </p>
                            )}
                                </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {request.status === 'PENDING' && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedRequest(request);
                                    setShowApprovalModal(true);
                                  }}
                                  disabled={approveMutation.isPending}
                                  className="bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-800 text-white h-8 px-2"
                                  title="Aprovar"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedRequest(request);
                                    setShowRejectionModal(true);
                                  }}
                                  disabled={rejectMutation.isPending}
                                  className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500 border-red-500 dark:border-red-500 h-8 px-2"
                                  title="Rejeitar"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedRequest(request)}
                              className="shrink-0 h-8 px-2"
                              title="Ver detalhes"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Comparação compacta */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {/* Original */}
                          <div className="p-2.5 rounded border-l-2 border-red-500 dark:border-red-400 bg-red-50/50 dark:bg-red-900/10">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5">
                                {formatDate(request.originalDate)} {formatTime(request.originalTime)}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                {getTypeLabel(request.originalType)}
                              </p>
                            </div>
                          </div>

                          {/* Corrigido */}
                          <div className="p-2.5 rounded border-l-2 border-green-500 dark:border-green-400 bg-green-50/50 dark:bg-green-900/10">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5">
                                {formatDate(request.correctedDate)} {formatTime(request.correctedTime)}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                {getTypeLabel(request.correctedType)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Footer compacto */}
                        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Calendar className="w-3 h-3" />
                            <span>{formatDate(request.createdAt)}</span>
                          </div>
                          {request.approvedAt && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <Clock className="w-3 h-3" />
                              <span>Aprovado {formatDate(request.approvedAt)}</span>
                            </div>
                          )}
                          {request.comments.length > 0 && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <MessageSquare className="w-3 h-3" />
                              <span>{request.comments.length} comentário(s)</span>
                            </div>
                          )}
                        </div>

                        {/* Motivo da rejeição compacto */}
                        {request.rejectionReason && request.status === 'REJECTED' && (
                          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/30 border-l-2 border-red-500 dark:border-red-400 rounded-r">
                            <p className="text-xs text-red-700 dark:text-red-300">
                              <span className="font-semibold">Rejeição:</span> {request.rejectionReason}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Modal de detalhes */}
        {selectedRequest && !showApprovalModal && !showRejectionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedRequest(null)} />
            <div className="relative w-full max-w-3xl bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden max-h-[90vh]">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Detalhes da Solicitação
                </h3>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              
              <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6 space-y-6">
                <div>
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">{selectedRequest.title}</h4>
              </div>

              <div>
                <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Justificativa:</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-3 rounded">
                    {selectedRequest.justification}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded">
                    <h6 className="font-medium text-red-800 dark:text-red-300 mb-2">Dados Originais</h6>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {formatDate(selectedRequest.originalDate)} às {formatTime(selectedRequest.originalTime)}
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400">
                      {getTypeLabel(selectedRequest.originalType)}
                    </p>
                  </div>

                  <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded">
                    <h6 className="font-medium text-green-800 dark:text-green-300 mb-2">Dados Corrigidos</h6>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      {formatDate(selectedRequest.correctedDate)} às {formatTime(selectedRequest.correctedTime)}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {getTypeLabel(selectedRequest.correctedType)}
                    </p>
                  </div>
                </div>

                {selectedRequest.comments.length > 0 && (
                  <div>
                    <h6 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Comentários:</h6>
                    <div className="space-y-2">
                      {selectedRequest.comments.map((comment) => (
                        <div key={comment.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{comment.user.name}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(comment.createdAt)}</span>
                            {comment.isInternal && (
                              <Badge size="sm" className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                                Interno
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{comment.comment}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal de aprovação */}
        {showApprovalModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => {
              setShowApprovalModal(false);
              setSelectedRequest(null);
            }} />
            <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-2xl">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Aprovar Solicitação</h3>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Comentário de Aprovação *
                  </label>
                  <textarea
                    value={approvalComment}
                    onChange={(e) => setApprovalComment(e.target.value)}
                    placeholder="Digite um comentário sobre a aprovação..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    rows={3}
                  />
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowApprovalModal(false);
                    setSelectedRequest(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending || !approvalComment.trim()}
                  className="bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-800"
                >
                  {approveMutation.isPending ? 'Aprovando...' : 'Aprovar'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de rejeição */}
        {showRejectionModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => {
              setShowRejectionModal(false);
              setSelectedRequest(null);
            }} />
            <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-2xl">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Rejeitar Solicitação</h3>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Motivo da Rejeição *
                  </label>
                  <Input
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Ex: Dados inconsistentes"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Comentário *
                  </label>
                  <textarea
                    value={rejectionComment}
                    onChange={(e) => setRejectionComment(e.target.value)}
                    placeholder="Explique o motivo da rejeição..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    rows={3}
                  />
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRejectionModal(false);
                    setSelectedRequest(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={rejectMutation.isPending || !rejectionReason.trim() || !rejectionComment.trim()}
                  className="bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-800"
                >
                  {rejectMutation.isPending ? 'Rejeitando...' : 'Rejeitar'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
    </ProtectedRoute>
  );
}
