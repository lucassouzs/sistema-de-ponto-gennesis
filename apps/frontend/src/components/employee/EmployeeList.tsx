'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Users, Search, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import api from '@/lib/api';

interface Employee {
  id: string;
  name: string;
  email: string;
  cpf: string;
  role: string;
  isActive: boolean;
  employee?: {
    employeeId: string;
    department: string;
    position: string;
    hireDate: string;
  };
}

interface EmployeeListProps {
  userRole: string;
}

export function EmployeeList({ userRole }: EmployeeListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const queryClient = useQueryClient();

  // Buscar funcionários
  const { data: employeesData, isLoading } = useQuery({
    queryKey: ['employees', searchTerm, currentPage],
    queryFn: async () => {
      const res = await api.get('/users', {
        params: { 
          search: searchTerm, 
          page: currentPage,
          limit: itemsPerPage
        }
      });
      return res.data;
    }
  });

  // Deletar funcionário
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const res = await api.delete(`/users/${employeeId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDeleteConfirm(null);
    },
    onError: (error: any) => {
      console.error('Erro ao deletar funcionário:', error);
    }
  });

  const handleDelete = (employeeId: string) => {
    deleteEmployeeMutation.mutate(employeeId);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const employees = employeesData?.data || [];
  const pagination = employeesData?.pagination || { total: 0, totalPages: 0 };

  // Filtrar apenas funcionários (não RH/Admin)
  const filteredEmployees = employees.filter((emp: Employee) => emp.role === 'EMPLOYEE');

  // Calcular informações de paginação
  const totalPages = Math.ceil(pagination.total / itemsPerPage);
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, pagination.total);

  // Resetar página quando buscar
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  if (userRole !== 'ADMIN') {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Users className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Gerenciar Funcionários</h3>
              <p className="text-sm text-gray-600">Visualizar e gerenciar funcionários cadastrados</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Busca */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar funcionários por nome, email ou CPF..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Lista de funcionários */}
        {isLoading ? (
          <div className="text-center py-8">
            <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
            <p className="text-gray-600">Carregando funcionários...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Nenhum funcionário encontrado</p>
          </div>
        ) : (
          <>
            {/* Informações de paginação */}
            <div className="mb-4 flex items-center justify-between text-sm text-gray-600">
              <span>
                Mostrando {startItem} a {endItem} de {pagination.total} funcionários
              </span>
              <span>
                Página {currentPage} de {totalPages}
              </span>
            </div>

            <div className="space-y-4">
              {filteredEmployees.map((employee: Employee) => (
              <div
                key={employee.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-4">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{employee.name}</h4>
                      <p className="text-sm text-gray-600">{employee.email}</p>
                      <div className="flex items-center space-x-4 mt-1">
                        <span className="text-xs text-gray-500">CPF: {employee.cpf}</span>
                        {employee.employee && (
                          <>
                            <span className="text-xs text-gray-500">
                              Matrícula: {employee.employee.employeeId}
                            </span>
                            <span className="text-xs text-gray-500">
                              {employee.employee.department} - {employee.employee.position}
                            </span>
                            <span className="text-xs text-gray-500">
                              Admitido em: {formatDate(employee.employee.hireDate)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setDeleteConfirm(employee.id)}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                    title="Excluir funcionário"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            </div>

            {/* Botões de paginação */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                
                {/* Números das páginas */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNumber = i + 1;
                  const isActive = pageNumber === currentPage;
                  
                  return (
                    <button
                      key={pageNumber}
                      onClick={() => setCurrentPage(pageNumber)}
                      className={`px-3 py-2 text-sm font-medium rounded-md ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}

        {/* Modal de confirmação de exclusão */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
            <div className="relative bg-white rounded-lg shadow-2xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-red-100 rounded-full">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Confirmar Exclusão</h3>
                    <p className="text-sm text-gray-600">Esta ação não pode ser desfeita</p>
                  </div>
                </div>
                
                <p className="text-gray-700 mb-6">
                  Tem certeza que deseja excluir este funcionário? O funcionário será desativado e não poderá mais acessar o sistema.
                </p>
                
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDelete(deleteConfirm)}
                    disabled={deleteEmployeeMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {deleteEmployeeMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Excluindo...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Excluir</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
