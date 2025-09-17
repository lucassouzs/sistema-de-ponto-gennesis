'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Users, UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { CreateEmployeeForm } from '@/components/employee/CreateEmployeeForm';
import { EmployeeList } from '@/components/employee/EmployeeList';
import { MainLayout } from '@/components/layout/MainLayout';
import api from '@/lib/api';

export default function EmployeesPage() {
  const router = useRouter();
  
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const [isCreateEmployeeOpen, setIsCreateEmployeeOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
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
    cpf: '000.000.000-00',
    role: 'ADMIN'
  };

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
                <h1 className="text-3xl font-bold text-gray-900">Gerenciar Funcionários</h1>
          <p className="mt-2 text-gray-600">Cadastre e gerencie os funcionários da empresa</p>
        </div>

        {/* Card de criação de funcionários */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-green-100 rounded-lg flex-shrink-0">
                  <UserPlus className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">Cadastrar Funcionários</h3>
                  <p className="text-sm text-gray-600">Adicionar novos funcionários ao sistema</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateEmployeeOpen(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center space-x-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Novo Funcionário</span>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Lista de funcionários */}
        <div>
          <EmployeeList 
            userRole={user.role} 
            showDeleteButton={user.role === 'ADMIN'}
          />
        </div>

        {/* Modal de criação de funcionário */}
        {isCreateEmployeeOpen && (
          <CreateEmployeeForm onClose={() => setIsCreateEmployeeOpen(false)} />
        )}
      </div>
    </MainLayout>
  );
}
