'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Building2, Plus, Edit, Trash2, Search, X, Check, AlertCircle, Upload, Download, CheckCircle, FileSpreadsheet, Loader2, Filter, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { normalizeCostCentersResponse } from '@/lib/costCenters';
import { POLOS_LIST, COMPANIES_LIST } from '@/constants/payrollFilters';

interface CostCenter {
  id: string;
  code: string;
  name: string;
  description?: string;
  state?: string;
  polo?: string;
  company?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const ESTADOS_LIST = ['DF', 'GO'];

export default function CentrosCustoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState<string>('all'); // 'all', 'true', 'false'
  const [stateFilter, setStateFilter] = useState<string>('all'); // 'all', 'DF', 'GO'
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    polo: '',
    isActive: true
  });
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(true);

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

  // Buscar centros de custo
  const { data: costCentersData, isLoading: loadingCostCenters } = useQuery({
    queryKey: ['cost-centers-admin', searchTerm, isActiveFilter, currentPage, itemsPerPage],
    queryFn: async () => {
      const res = await api.get('/cost-centers', {
        params: {
          search: searchTerm || undefined,
          isActive: isActiveFilter !== 'all' ? isActiveFilter : undefined,
          page: currentPage,
          limit: itemsPerPage
        }
      });
      return res.data;
    }
  });

  // Criar centro de custo
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/cost-centers', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers-admin'] });
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] }); // Invalida também a lista usada no formulário
      setShowForm(false);
      resetForm();
      toast.success('Centro de custo criado com sucesso!');
    },
    onError: (error: any) => {
      console.error('Erro ao criar centro de custo:', error);
      toast.error(error.response?.data?.message || 'Erro ao criar centro de custo');
    }
  });

  // Atualizar centro de custo
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/cost-centers/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers-admin'] });
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
      setShowForm(false);
      setEditingCostCenter(null);
      resetForm();
      toast.success('Centro de custo atualizado com sucesso!');
    },
    onError: (error: any) => {
      console.error('Erro ao atualizar centro de custo:', error);
      toast.error(error.response?.data?.message || 'Erro ao atualizar centro de custo');
    }
  });

  // Deletar centro de custo
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/cost-centers/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers-admin'] });
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
      setShowDeleteModal(null);
    }
  });

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      polo: '',
      isActive: true
    });
    setEditingCostCenter(null);
  };

  const handleEdit = (costCenter: CostCenter) => {
    setEditingCostCenter(costCenter);
    setFormData({
      code: costCenter.code,
      name: costCenter.name,
      polo: costCenter.polo || '',
      isActive: costCenter.isActive
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação básica - código não é mais obrigatório na criação
    if (!formData.name.trim()) {
      return;
    }
    
    if (editingCostCenter) {
      updateMutation.mutate({ 
        id: editingCostCenter.id, 
        data: {
          code: formData.code.trim() || undefined,
          name: formData.name.trim(),
          polo: formData.polo?.trim() || undefined,
          isActive: formData.isActive
        }
      });
    } else {
      createMutation.mutate({
        code: formData.code.trim() || undefined,
        name: formData.name.trim(),
        polo: formData.polo?.trim() || undefined,
        isActive: formData.isActive
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  const costCenters = normalizeCostCentersResponse(costCentersData) as unknown as CostCenter[];
  const pagination = costCentersData?.pagination || {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1
  };

  // Resetar página quando filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, isActiveFilter, stateFilter]);
  
  // Filtrar por estado no frontend (já que o backend não suporta filtro por estado ainda)
  const filteredCostCenters = useMemo(() => {
    return costCenters.filter((cc: CostCenter) => {
      if (stateFilter !== 'all' && cc.state !== stateFilter) {
        return false;
      }
      return true;
    });
  }, [costCenters, stateFilter]);

  if (loadingUser) {
    return (
      <Loading 
        message="Carregando..."
        fullScreen
        size="lg"
      />
    );
  }

  return (
    <ProtectedRoute route="/ponto/centros-custo">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Gerenciar Centros de Custo</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Cadastre e gerencie os centros de custo da empresa</p>
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
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setIsActiveFilter('all');
                        setStateFilter('all');
                      }}
                      className="flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Limpar todos os filtros"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
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
                  {/* Busca */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Buscar
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                      <input
                        type="text"
                        placeholder="Buscar por código ou nome..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  </div>
                  
                  {/* Filtros */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Status
                      </label>
                      <select
                        value={isActiveFilter}
                        onChange={(e) => setIsActiveFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="all">Todos</option>
                        <option value="true">Ativo</option>
                        <option value="false">Inativo</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Estado
                      </label>
                      <select
                        value={stateFilter}
                        onChange={(e) => setStateFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="all">Todos</option>
                        {ESTADOS_LIST.map((estado) => (
                          <option key={estado} value={estado}>
                            {estado}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Modal de Criar/Editar Centro de Custo */}
          <CostCenterFormModal
            isOpen={showForm}
            onClose={() => {
              setShowForm(false);
              resetForm();
            }}
            editingCostCenter={editingCostCenter}
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            createMutation={createMutation}
            updateMutation={updateMutation}
          />

          {/* Lista de centros de custo */}
          <Card>
            <CardHeader className="border-b-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                    <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Centros de Custo
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {pagination.total} {pagination.total === 1 ? 'centro de custo' : 'centros de custo'} cadastrado(s)
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
                  >
                    <Upload className="w-4 h-4" />
                    Importar
                  </button>
                  <button
                    onClick={() => {
                      resetForm();
                      setShowForm(true);
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    Cadastrar Centro de Custo
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Código</th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nome</th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Polo</th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {loadingCostCenters ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-8 text-center">
                          <div className="flex items-center justify-center">
                            <div className="loading-spinner w-6 h-6 mr-2" />
                            <span className="text-gray-600 dark:text-gray-400">Carregando centros de custo...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredCostCenters.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center">
                          <div className="text-gray-500 dark:text-gray-400">
                            <p>Nenhum centro de custo encontrado.</p>
                            <p className="text-sm mt-1">Tente ajustar os filtros de busca.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredCostCenters.map((cc: CostCenter) => (
                        <tr key={cc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">{cc.code}</span>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-900 dark:text-gray-100">{cc.name}</span>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-700 dark:text-gray-400">{cc.polo || '-'}</span>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              cc.isActive
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                            }`}>
                              {cc.isActive ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEdit(cc)}
                                className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setShowDeleteModal(cc.id)}
                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Paginação */}
              {pagination.totalPages > 1 && (
                <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <span>
                        Mostrando {((pagination.page - 1) * pagination.limit) + 1} a {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} centros de custo
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Anterior
                      </button>
                      
                      {/* Números das páginas */}
                      {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                        let pageNumber: number;
                        if (pagination.totalPages <= 5) {
                          pageNumber = i + 1;
                        } else if (currentPage <= 3) {
                          pageNumber = i + 1;
                        } else if (currentPage >= pagination.totalPages - 2) {
                          pageNumber = pagination.totalPages - 4 + i;
                        } else {
                          pageNumber = currentPage - 2 + i;
                        }
                        
                        const isActive = pageNumber === currentPage;
                        
                        return (
                          <button
                            key={pageNumber}
                            onClick={() => setCurrentPage(pageNumber)}
                            className={`px-3 py-2 text-sm font-medium rounded-md ${
                              isActive
                                ? 'bg-red-600 text-white'
                                : 'text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                            } transition-colors`}
                          >
                            {pageNumber}
                          </button>
                        );
                      })}
                      
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, pagination.totalPages))}
                        disabled={currentPage === pagination.totalPages}
                        className="px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Modal de confirmação de exclusão */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteModal(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">
                Excluir Centro de Custo?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
                Tem certeza que deseja excluir este centro de custo? Esta ação não pode ser desfeita.
              </p>
              <div className="flex items-center justify-center space-x-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(showDeleteModal)}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
              {deleteMutation.isError && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                        Não é possível excluir este centro de custo
                      </p>
                      <div className="text-sm text-red-700 dark:text-red-300 whitespace-pre-line leading-relaxed">
                        {(deleteMutation.error as any)?.response?.data?.error || 
                         (deleteMutation.error as any)?.response?.data?.message || 
                         (deleteMutation.error as any)?.message || 
                         'Erro ao excluir centro de custo'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal de Importação */}
        <ImportCostCentersModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['cost-centers-admin'] });
            queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
            setIsImportModalOpen(false);
          }}
        />
      </MainLayout>
    </ProtectedRoute>
  );
}

// Componente de Modal de Formulário
function CostCenterFormModal({
  isOpen,
  onClose,
  editingCostCenter,
  formData,
  setFormData,
  onSubmit,
  createMutation,
  updateMutation
}: {
  isOpen: boolean;
  onClose: () => void;
  editingCostCenter: CostCenter | null;
  formData: {
    code: string;
    name: string;
    polo: string;
    isActive: boolean;
  };
  setFormData: React.Dispatch<React.SetStateAction<{
    code: string;
    name: string;
    polo: string;
    isActive: boolean;
  }>>;
  onSubmit: (e: React.FormEvent) => void;
  createMutation: any;
  updateMutation: any;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {editingCostCenter ? 'Editar Centro de Custo' : 'Cadastrar Centro de Custo'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Código *
                </label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Ex: CC-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nome *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Ex: Secretaria de Estado de Desenvolvimento Social"
                />
              </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Polo
              </label>
              <select
                value={formData.polo}
                onChange={(e) => setFormData({ ...formData, polo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Selecione</option>
                {POLOS_LIST.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            </div>
            <div className="flex items-center">
              <label className="flex items-center space-x-3 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                    formData.isActive 
                      ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500' 
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                  }`}>
                    {formData.isActive && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                  Ativo
                </span>
              </label>
            </div>
            {(createMutation.isError || updateMutation.isError) && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                    Erro ao salvar centro de custo
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {(createMutation.error as any)?.response?.data?.message || 
                     (updateMutation.error as any)?.response?.data?.message || 
                     (createMutation.error as any)?.message ||
                     (updateMutation.error as any)?.message ||
                     'Ocorreu um erro inesperado. Verifique os dados e tente novamente.'}
                  </p>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Salvando...'
                  : editingCostCenter
                  ? 'Atualizar'
                  : 'Criar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Componente de Modal de Importação
function ImportCostCentersModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedRows, setParsedRows] = useState<Array<{
    linha: number;
    dados: {
      Código: string;
      Nome: string;
      Polo?: string;
      Ativo?: string;
    };
    erros: string[];
    isValid: boolean;
  }>>([]);
  const [result, setResult] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const handleClose = () => {
    // limpar estado interno antes de fechar
    setFile(null);
    setParsedRows([]);
    setResult(null);
    setIsDragging(false);
    onClose();
  };
 
  // Garantir que ao fechar a modal (quando isOpen virar false) o estado interno seja limpo
  React.useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setParsedRows([]);
      setResult(null);
      setIsDragging(false);
      setIsProcessing(false);
      setIsUploading(false);
    }
  }, [isOpen]);

  // Função para baixar modelo Excel
  const downloadExcelTemplate = () => {
    const headers = ['Código', 'Nome', 'Polo', 'Ativo'];
    const exampleRow = ['CC-001', 'Secretaria de Estado de Desenvolvimento Social', 'POLO-1', 'Ativo'];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    
    const colWidths = [
      { wch: 15 }, // Código
      { wch: 50 }, // Nome
      { wch: 20 }, // Polo
      { wch: 12 }  // Ativo
    ];
    ws['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(wb, ws, 'Centros de Custo');
    XLSX.writeFile(wb, 'modelo-importacao-centros-custo.xlsx');
  };

  // Processar planilha
  const parseSpreadsheet = async () => {
    if (!file) {
      toast.error('Selecione um arquivo');
      return;
    }

    setIsProcessing(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });

      if (rows.length === 0) {
        toast.error('Arquivo vazio ou sem dados válidos');
        setIsProcessing(false);
        return;
      }

      // Construir mapa tolerante de cabeçalhos (normalizado) para aceitar variações
      const normalize = (s: any) => {
        if (s === undefined || s === null) return '';
        return String(s)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // remove diacríticos
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ''); // remove caracteres não alfanuméricos
      };

      const headerMap: Record<string, string> = {};
      const firstRowKeys = Object.keys(rows[0] || {});
      firstRowKeys.forEach((k) => {
        headerMap[normalize(k)] = k;
      });
      // Heurística para detectar melhor coluna de código e nome
      const headerNorms = Object.keys(headerMap);
      const detectKey = (candidates: string[]) => {
        for (const c of candidates) {
          const found = headerNorms.find(h => h.includes(c));
          if (found) return found;
        }
        return undefined;
      };

      const detectedCodeKeyNorm =
        detectKey(['codigocentro','codigodocentro','codigo','cod','code','id','código']) ||
        detectKey(['codigo','cod','code']);
      const detectedNameKeyNorm =
        detectKey(['nomecentro','nome_do_centro','nome','name','centro_nome','centro']) ||
        detectKey(['nome','name']);

      // (no UI debug)

      const pick = (row: any, candidates: string[]) => {
        // 1) Tentar chaves exatas do Excel (ex.: Código, Nome)
        for (const c of candidates) {
          if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') return row[c];
        }
        // 2) Tentar via headerMap (chave normalizada)
        for (const c of candidates) {
          const hk = headerMap[c];
          if (hk && row[hk] !== undefined && row[hk] !== null) return row[hk];
        }
        if (detectedCodeKeyNorm && (candidates.includes('codigo') || candidates.includes('cod') || candidates.includes('code') || candidates.includes('Código') || candidates.includes('Codigo'))) {
          const hk = headerMap[detectedCodeKeyNorm];
          if (hk && row[hk] !== undefined && row[hk] !== null) return row[hk];
        }
        if (detectedNameKeyNorm && (candidates.includes('nome') || candidates.includes('name') || candidates.includes('Nome') || candidates.includes('centro'))) {
          const hk = headerMap[detectedNameKeyNorm];
          if (hk && row[hk] !== undefined && row[hk] !== null) return row[hk];
        }
        // 3) Header que contenha o candidato
        for (const c of candidates) {
          for (const hkNorm of Object.keys(headerMap)) {
            if (hkNorm.includes(c) || (c.length >= 2 && hkNorm.includes(c))) {
              const orig = headerMap[hkNorm];
              if (orig && row[orig] !== undefined && row[orig] !== null) return row[orig];
            }
          }
        }
        return undefined;
      };

      const normalizeStatus = (v: any) => {
        if (v === undefined || v === null) return undefined;
        const s = String(v).trim().toLowerCase();
        if (['ativo', 'a', 'sim', 's', 'true', '1', 'yes', 'y'].includes(s)) return 'Ativo';
        if (['inativo', 'i', 'nao', 'não', 'n', 'false', '0', 'no'].includes(s)) return 'Inativo';
        return undefined;
      };

      const processedRows = await Promise.all(
        rows.map(async (row, index) => {
          const linha = index + 2;
          const erros: string[] = [];

          const rawCodigo = pick(row, ['Código', 'Codigo', 'codigo', 'cod', 'code', 'id']) ?? '';
          const rawNome = pick(row, ['Nome', 'nome', 'name', 'centro']) ?? '';
          const rawPolo = pick(row, ['polo', 'polo']) || '';
          const rawAtivo = pick(row, ['ativo', 'status']) || pick(row, ['status']) || '';

          const codigo = String(rawCodigo || '').trim();
          const nome = String(rawNome || '').trim();
          const status = normalizeStatus(rawAtivo) || '';

          if (!codigo) {
            erros.push('Código é obrigatório');
          }
          if (!nome) {
            erros.push('Nome é obrigatório');
          }
          if (!status) {
            erros.push('Ativo deve ser "Ativo" ou "Inativo"');
          }

          // Verificar duplicata apenas por código (nome pode repetir)
          if (codigo) {
            try {
              const checkRes = await api.get('/cost-centers', {
                params: { search: codigo, limit: 10 }
              });
              const existing = normalizeCostCentersResponse(checkRes.data).find((cc: any) =>
                cc.code && String(cc.code).trim().toLowerCase() === String(codigo).trim().toLowerCase()
              );
              if (existing) {
                erros.push('Já existe um centro de custo com este código');
              }
            } catch (error) {
              // Ignorar erro na verificação
            }
          }

          return {
            linha,
            dados: {
              Código: codigo,
              Nome: nome,
              Polo: String(rawPolo || '').trim(),
              Ativo: status || 'Ativo'
            },
            erros,
            isValid: erros.length === 0
          };
        })
      );

      setParsedRows(processedRows);
      toast.success(`${processedRows.length} centro(s) de custo processado(s)`);
    } catch (error: any) {
      console.error('Erro ao processar planilha:', error);
      toast.error('Erro ao processar planilha: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsProcessing(false);
    }
  };
  const normalizeStatus = (v: any) => {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim().toLowerCase();
    if (['ativo', 'a', 'sim', 's', 'true', '1', 'yes', 'y'].includes(s)) return 'Ativo';
    if (['inativo', 'i', 'nao', 'não', 'n', 'false', '0', 'no'].includes(s)) return 'Inativo';
    return undefined;
  };

  // Atualizar linha editada
  const updateRow = (index: number, field: string, value: string) => {
    setParsedRows(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        dados: {
          ...updated[index].dados,
          [field]: value
        }
      };
      
      // Revalidar
      const row = updated[index];
      const erros: string[] = [];
      if (!row.dados.Código?.trim()) {
        erros.push('Código é obrigatório');
      }
      if (!row.dados.Nome?.trim()) {
        erros.push('Nome é obrigatório');
      }
      const normalizedStatus = normalizeStatus((row.dados as any).Ativo);
      if (!normalizedStatus) {
        erros.push('Ativo deve ser "Ativo" ou "Inativo"');
      } else {
        // keep normalized value in the preview
        updated[index].dados.Ativo = normalizedStatus;
      }

      updated[index] = {
        ...updated[index],
        erros,
        isValid: erros.length === 0
      };

      return updated;
    });
  };

  // Remover linha
  const removeRow = (index: number) => {
    setParsedRows(prev => prev.filter((_, i) => i !== index));
  };

  // Importar centros de custo
  const importMutation = useMutation({
    mutationFn: async (rows: typeof parsedRows) => {
      const validRows = rows.filter(r => r.isValid);
      // Backend expects Portuguese keys (Nome, Descrição, Estado, Polo, Empresa, Status)
      const payload = validRows.map(r => ({
        Código: (r.dados.Código || '').toString().trim(),
        Nome: (r.dados.Nome || '').toString().trim(),
        Descrição: null,
        Estado: null,
        Polo: (r.dados.Polo || null),
        Empresa: null,
        Status: String(r.dados.Ativo || 'Ativo').toString()
      }));
      const res = await api.post('/cost-centers/import/bulk', { costCenters: payload });
      return res.data;
    },
    onSuccess: (data) => {
      setResult(data.data);
      setIsUploading(false);
      if (data.data.erros === 0) {
        // Limpar arquivo e preview quando import completo com sucesso
        setFile(null);
        setParsedRows([]);
        setResult(data.data);
        toast.success(`✅ ${data.data.sucessos} centro(s) de custo importado(s) com sucesso!`);
        onSuccess();
      } else {
        toast.error(`⚠️ ${data.data.sucessos} importado(s), ${data.data.erros} erro(s)`);
      }
    },
    onError: (error: any) => {
      setIsUploading(false);
      toast.error(error.response?.data?.message || 'Erro ao importar centros de custo');
    },
  });

  const handleImport = () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      toast.error('Nenhum centro de custo válido para importar');
      return;
    }
    setIsUploading(true);
    importMutation.mutate(parsedRows);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
        toast.error('Apenas arquivos Excel (.xlsx ou .xls) são permitidos');
        return;
      }
      setFile(selectedFile);
      setParsedRows([]);
      setResult(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="absolute inset-0" onClick={handleClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Importar Centros de Custo</h3>
          <button
            onClick={handleClose}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Botão de Download do Modelo */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Baixe o modelo Excel, preencha com os dados dos centros de custo e importe
              </p>
            </div>
            <button
              onClick={downloadExcelTemplate}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center space-x-2 transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Modelo</span>
            </button>
          </div>

          {/* Upload de arquivo */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span>Planilha de Centros de Custo</span>
              </div>
            </label>
            
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              id="file-upload"
              className="hidden"
            />
            
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile && (droppedFile.name.match(/\.(xlsx|xls)$/i))) {
                  setFile(droppedFile);
                  setParsedRows([]);
                  setResult(null);
                } else {
                  toast.error('Apenas arquivos Excel (.xlsx ou .xls) são permitidos');
                }
              }}
              className={`
                relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
                ${isDragging 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                  : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-400 dark:hover:border-gray-500'
                }
                ${file ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}
              `}
            >
              {file ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center">
                    <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                      <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setFile(null);
                      setParsedRows([]);
                      setResult(null);
                    }}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline"
                  >
                    Remover arquivo
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center">
                    <div className={`p-4 rounded-full transition-colors ${isDragging ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                      <Upload className={`w-10 h-10 ${isDragging ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {isDragging ? 'Solte o arquivo aqui' : 'Arraste e solte o arquivo Excel aqui'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      ou
                    </p>
                  </div>
                  <label
                    htmlFor="file-upload"
                    className="inline-flex items-center px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Escolher arquivo
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Formatos aceitos: .xlsx ou .xls
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* hidden: debug mapping removed from UI */}

          {/* Botão Processar */}
          {file && parsedRows.length === 0 && (
            <button
              onClick={parseSpreadsheet}
              disabled={!file || isProcessing}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-colors duration-200 shadow-sm hover:shadow-md"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processando...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span>Validar Dados</span>
                </>
              )}
            </button>
          )}

          {/* Preview dos Registros */}
          {parsedRows.length > 0 && (
            <>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      Preview dos Centros de Custo
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {parsedRows.filter(r => r.isValid).length} válido(s) de {parsedRows.length} total
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Linha</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Código *</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Nome *</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Polo</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Ativo</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                      {parsedRows.map((row, index) => (
                        <tr
                          key={index}
                          className={row.isValid ? '' : 'bg-red-50 dark:bg-red-900/10'}
                        >
                          <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{row.linha}</td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={row.dados.Código || ''}
                              onChange={(e) => updateRow(index, 'Código', e.target.value)}
                              className={`w-full px-2 py-1 border rounded ${row.isValid ? 'border-gray-300 dark:border-gray-600' : 'border-red-300 dark:border-red-600'} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100`}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={row.dados.Nome}
                              onChange={(e) => updateRow(index, 'Nome', e.target.value)}
                              className={`w-full px-2 py-1 border rounded ${row.isValid ? 'border-gray-300 dark:border-gray-600' : 'border-red-300 dark:border-red-600'} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100`}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={row.dados.Polo || ''}
                              onChange={(e) => updateRow(index, 'Polo', e.target.value)}
                              className={`w-full px-2 py-1 border rounded ${row.isValid ? 'border-gray-300 dark:border-gray-600' : 'border-red-300 dark:border-red-600'} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100`}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={row.dados.Ativo || 'Ativo'}
                              onChange={(e) => updateRow(index, 'Ativo', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            >
                              <option value="Ativo">Ativo</option>
                              <option value="Inativo">Inativo</option>
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => removeRow(index)}
                              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedRows.some(r => !r.isValid) && (
                  <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      ⚠️ Linhas em vermelho têm erros que precisam ser corrigidos antes de importar.
                    </p>
                    {parsedRows.filter(r => !r.isValid).map((row, idx) => (
                      <div key={idx} className="mt-2 text-xs text-yellow-700 dark:text-yellow-300">
                        <strong>Linha {row.linha}:</strong> {row.erros.join(', ')}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botão Importar */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleImport}
                  disabled={isUploading || parsedRows.filter(r => r.isValid).length === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Importando...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Importar {parsedRows.filter(r => r.isValid).length} centro(s) de custo</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Resultado da Importação */}
          {result && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Resultado da Importação
              </h4>
              <div className="space-y-2">
                <p className="text-sm">
                  ✅ <strong>{result.sucessos}</strong> centro(s) de custo importado(s) com sucesso
                </p>
                {result.erros > 0 && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    ❌ <strong>{result.erros}</strong> erro(s)
                  </p>
                )}
                {result.detalhes && result.detalhes.length > 0 && (
                  <div className="mt-4 max-h-60 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                          <th className="px-2 py-1 text-left">Linha</th>
                          <th className="px-2 py-1 text-left">Código</th>
                          <th className="px-2 py-1 text-left">Nome</th>
                          <th className="px-2 py-1 text-left">Status</th>
                          <th className="px-2 py-1 text-left">Erro / Aviso</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {result.detalhes.map((d: any, idx: number) => (
                          <tr key={idx} className={d.sucesso ? 'bg-green-50 dark:bg-green-900/10' : 'bg-red-50 dark:bg-red-900/10'}>
                            <td className="px-2 py-1">{d.linha}</td>
                            <td className="px-2 py-1 font-mono text-gray-900 dark:text-gray-100">{d.codigo ?? '-'}</td>
                            <td className="px-2 py-1 text-gray-900 dark:text-gray-100">{d.nome ?? '-'}</td>
                            <td className="px-2 py-1">{d.sucesso ? '✅' : '❌'}</td>
                            <td className="px-2 py-1">
                              {d.erro ? (
                                <span className="text-red-600 dark:text-red-400">{d.erro}</span>
                              ) : d.aviso ? (
                                <span className="text-amber-600 dark:text-amber-400">{d.aviso}</span>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
