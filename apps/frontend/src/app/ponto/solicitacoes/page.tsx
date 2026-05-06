'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, List } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PointCorrectionCard } from '@/components/ponto/PointCorrectionCard';
import { PointCorrectionList } from '@/components/ponto/PointCorrectionList';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';

export default function SolicitacoesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');

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

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00',
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

  const handleSuccess = () => {
    setActiveTab('list');
  };

  return (
    <ProtectedRoute route="/ponto/solicitacoes">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          {/* Cabeçalho */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Alterações de ponto</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Solicite e acompanhe alterações de marcação do seu ponto</p>
          </div>

          {/* Navegação no topo */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('list')}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'list'
                    ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <List className="w-4 h-4" />
                Minhas alterações
              </button>
              <button
                onClick={() => setActiveTab('new')}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'new'
                    ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Plus className="w-4 h-4" />
                Nova alteração
              </button>
            </nav>
          </div>

          {/* Conteúdo principal */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                    <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {activeTab === 'list' ? 'Minhas alterações' : 'Nova alteração'}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {activeTab === 'list' ? 'Visualize o status das suas alterações de ponto' : 'Preencha os dados para solicitar uma nova alteração'}
                    </p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activeTab === 'list' ? (
                <PointCorrectionList />
              ) : (
                <PointCorrectionCard onSuccess={handleSuccess} />
              )}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
