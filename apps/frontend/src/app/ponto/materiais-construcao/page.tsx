'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Package, Plus, Edit, Trash2, Search, X, Check, AlertCircle, Upload, Download, Filter, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface ConstructionMaterial {
  id: string;
  sinapiCode?: string;
  description: string;
  unit: string;
  medianPrice?: number | string;
  state?: string;
  referenceMonth?: number;
  referenceYear?: number;
  categoryId?: string;
  costCenterId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function MateriaisConstrucaoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<ConstructionMaterial | null>(null);
  const [formData, setFormData] = useState({
    description: '',
    unit: '',
    medianPrice: '',
    state: '',
    referenceMonth: '',
    referenceYear: '',
    categoryId: '',
    costCenterId: '',
    isActive: true
  });
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState('');
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Buscar materiais
  const { data: materialsData, isLoading: loadingMaterials } = useQuery({
    queryKey: ['construction-materials', searchTerm, currentPage, itemsPerPage],
    queryFn: async () => {
      const res = await api.get('/construction-materials', {
        params: {
          search: searchTerm || undefined,
          page: currentPage,
          limit: itemsPerPage
        }
      });
      return res.data;
    }
  });

  // Criar material
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/construction-materials', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      setShowForm(false);
      resetForm();
      toast.success('Material criado com sucesso!');
    },
    onError: (error: any) => {
      console.error('Erro ao criar material:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Erro ao criar material';
      toast.error(errorMessage);
    }
  });

  // Atualizar material
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/construction-materials/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      setShowForm(false);
      setEditingMaterial(null);
      resetForm();
      toast.success('Material atualizado com sucesso!');
    },
    onError: (error: any) => {
      console.error('Erro ao atualizar material:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Erro ao atualizar material';
      toast.error(errorMessage);
    }
  });

  // Deletar material
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/construction-materials/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      setShowDeleteModal(null);
    }
  });

  // Importar materiais
  const importMutation = useMutation({
    mutationFn: async (materials: any[]) => {
      const res = await api.post('/construction-materials/import', { materials });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      setShowImportModal(false);
      setImportData('');
      alert(`Importação concluída: ${data.data.created} materiais criados`);
    },
    onError: (error: any) => {
      console.error('Erro ao importar materiais:', error);
      alert('Erro ao importar materiais: ' + (error.response?.data?.message || error.message));
    }
  });

  const resetForm = () => {
    setFormData({
      description: '',
      unit: '',
      medianPrice: '',
      state: '',
      referenceMonth: '',
      referenceYear: '',
      categoryId: '',
      costCenterId: '',
      isActive: true
    });
    setEditingMaterial(null);
  };

  const handleEdit = (material: ConstructionMaterial) => {
    setEditingMaterial(material);
    setFormData({
      description: material.description || '',
      unit: material.unit,
      medianPrice: material.medianPrice?.toString() || '',
      state: material.state || '',
      referenceMonth: material.referenceMonth?.toString() || '',
      referenceYear: material.referenceYear?.toString() || '',
      categoryId: material.categoryId || '',
      costCenterId: material.costCenterId || '',
      isActive: material.isActive
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação básica
    if (!formData.description.trim() || !formData.unit.trim()) {
      toast.error('Por favor, preencha descrição e unidade de medida');
      return;
    }

    const desc = formData.description.trim();
    const name = desc.slice(0, 255);

    // Limpar dados: remover campos vazios e manter apenas os necessários
    const dataToSend: any = {
      name,
      description: desc,
      unit: formData.unit.trim(),
      isActive: formData.isActive
    };
    
    // Adicionar campos opcionais apenas se tiverem valor
    if (formData.medianPrice && formData.medianPrice.toString().trim()) {
      dataToSend.medianPrice = parseFloat(formData.medianPrice.toString()) || undefined;
    }
    if (formData.state && formData.state.trim()) {
      dataToSend.state = formData.state.trim();
    }
    if (formData.referenceMonth && formData.referenceMonth.toString().trim()) {
      dataToSend.referenceMonth = parseInt(formData.referenceMonth.toString()) || undefined;
    }
    if (formData.referenceYear && formData.referenceYear.toString().trim()) {
      dataToSend.referenceYear = parseInt(formData.referenceYear.toString()) || undefined;
    }
    if (formData.categoryId && formData.categoryId.trim()) {
      dataToSend.categoryId = formData.categoryId.trim();
    }
    if (formData.costCenterId && formData.costCenterId.trim()) {
      dataToSend.costCenterId = formData.costCenterId.trim();
    }
    
    console.log('Enviando dados:', dataToSend);
    
    if (editingMaterial) {
      updateMutation.mutate({ id: editingMaterial.id, data: dataToSend });
    } else {
      createMutation.mutate(dataToSend);
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        let materials: any[] = [];

        if (file.name.endsWith('.json')) {
          materials = JSON.parse(text);
        } else if (file.name.endsWith('.csv')) {
          const lines = text.split('\n').filter(line => line.trim());
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const material: any = {};
            headers.forEach((header, index) => {
              if (header === 'nome' || header === 'name') {
                material.name = values[index];
              } else if (header === 'codigo' || header === 'code' || header === 'sinapicode') {
                material.sinapiCode = values[index];
              } else if (header === 'descrição' || header === 'description' || header === 'descricao') {
                material.description = values[index];
              } else if (header === 'unidade' || header === 'unit') {
                material.unit = values[index];
              } else if (header === 'ativo' || header === 'isactive' || header === 'is_active') {
                material.isActive = values[index]?.toLowerCase() === 'true' || values[index] === '1';
              }
            });
            if (material.description && material.unit) {
              const desc = String(material.description).trim();
              const nameFromLegacy =
                (material.name || material.sinapiCode || desc).toString().trim().slice(0, 255);
              materials.push({
                ...material,
                name: nameFromLegacy,
                description: desc
              });
            }
          }
        }

        if (materials.length > 0) {
          setImportData(JSON.stringify(materials, null, 2));
          setShowImportModal(true);
        } else {
          alert('Nenhum material válido encontrado no arquivo');
        }
      } catch (error) {
        alert('Erro ao processar arquivo: ' + (error as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    try {
      const materials = JSON.parse(importData);
      if (Array.isArray(materials) && materials.length > 0) {
        importMutation.mutate(materials);
      } else {
        alert('Formato inválido. Deve ser um array de materiais.');
      }
    } catch (error) {
      alert('Erro ao processar dados: ' + (error as Error).message);
    }
  };

  const handleExport = () => {
    const materials = materialsData?.data || [];
    const json = JSON.stringify(materials, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `materiais-construcao-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const materials = materialsData?.data || [];
  const pagination = materialsData?.pagination || {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1
  };

  // Resetar página quando filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Como a busca já é feita no backend, não precisamos filtrar no frontend
  const filteredMaterials = useMemo(() => {
    return materials;
  }, [materials]);

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
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

  return (
    <ProtectedRoute route="/ponto/materiais-construcao">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Materiais de Construção
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Gerencie os materiais de construção civil
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
                    <button
                      onClick={() => {
                        setSearchTerm('');
                      }}
                      className="flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Limpar filtros"
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Buscar
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar por descrição, nome ou unidade..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Modal de Criar/Editar Material */}
          <MaterialFormModal
            isOpen={showForm}
            onClose={() => {
              setShowForm(false);
              resetForm();
            }}
            editingMaterial={editingMaterial}
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            createMutation={createMutation}
            updateMutation={updateMutation}
          />

          {/* Lista de materiais */}
          <Card>
            <CardHeader className="border-b-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                    <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Materiais de Construção
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {pagination.total} {pagination.total === 1 ? 'material cadastrado' : 'materiais cadastrados'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={handleExport}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
                  >
                    <Download className="w-4 h-4" />
                    Exportar
                  </button>
                  <button
                    onClick={() => {
                      setShowImportModal(true);
                      setImportData('');
                    }}
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
                    Cadastrar Material
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Descrição
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Unidade
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
                    {loadingMaterials ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center">
                          <div className="flex items-center justify-center">
                            <div className="loading-spinner w-6 h-6 mr-2" />
                            <span className="text-gray-600 dark:text-gray-400">Carregando materiais...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredMaterials.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center">
                          <div className="text-gray-500 dark:text-gray-400">
                            <p>Nenhum material encontrado.</p>
                            <p className="text-sm mt-1">Tente ajustar os filtros de busca.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredMaterials.map((material: ConstructionMaterial) => (
                        <tr
                          key={material.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <td className="px-3 sm:px-6 py-4">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {material.description || '-'}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-900 dark:text-gray-100">
                              {material.unit}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                            <span
                              className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${
                                material.isActive
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                              }`}
                            >
                              {material.isActive ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleEdit(material)}
                                className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setShowDeleteModal(material.id)}
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
                        Mostrando {((pagination.page - 1) * pagination.limit) + 1} a {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} materiais
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
                Excluir Material?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
                Tem certeza que deseja excluir este material? Esta ação não pode ser desfeita.
              </p>
              <div className="flex items-center justify-center space-x-3">
                <button
                  onClick={() => setShowDeleteModal(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(showDeleteModal)}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de importação */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => {
              setShowImportModal(false);
              setImportData('');
            }} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Upload className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Importar Materiais
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportData('');
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Carregar arquivo (CSV ou JSON)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.json"
                    onChange={handleFileUpload}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Formato CSV: descrição,unidade,ativo (com cabeçalho na primeira linha; colunas nome/código são opcionais)
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Formato JSON: Array de objetos com campos: description, unit, isActive (name opcional)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ou cole os dados JSON aqui:
                  </label>
                  <textarea
                    value={importData}
                    onChange={(e) => setImportData(e.target.value)}
                    rows={10}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm"
                    placeholder='[{"description": "Cimento Portland", "unit": "kg", "isActive": true}]'
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportData('');
                    }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={!importData.trim() || importMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                  >
                    {importMutation.isPending ? 'Importando...' : 'Importar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}

// Componente de Modal de Formulário
function MaterialFormModal({
  isOpen,
  onClose,
  editingMaterial,
  formData,
  setFormData,
  onSubmit,
  createMutation,
  updateMutation
}: {
  isOpen: boolean;
  onClose: () => void;
  editingMaterial: ConstructionMaterial | null;
  formData: {
    description: string;
    unit: string;
    medianPrice: string;
    state: string;
    referenceMonth: string;
    referenceYear: string;
    categoryId: string;
    costCenterId: string;
    isActive: boolean;
  };
  setFormData: React.Dispatch<React.SetStateAction<{
    description: string;
    unit: string;
    medianPrice: string;
    state: string;
    referenceMonth: string;
    referenceYear: string;
    categoryId: string;
    costCenterId: string;
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
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {editingMaterial ? 'Editar Material' : 'Cadastrar Material'}
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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Descrição *
              </label>
              <textarea
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Descrição do material..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Unidade de Medida *
              </label>
              <input
                type="text"
                required
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Ex: kg, m, m², un"
              />
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
                    Erro ao salvar material
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
                  : editingMaterial
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
