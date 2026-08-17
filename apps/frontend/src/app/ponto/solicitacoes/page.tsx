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
import { AppTabButton } from '@/components/ui/AppTabButton';
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
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Alterações de Ponto</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Solicite e acompanhe alterações de marcação do seu ponto</p>
          </div>

          {/* Navegação no topo */}
          <nav className="-mb-px flex flex-wrap gap-1 overflow-x-auto py-1">
            <AppTabButton
              active={activeTab === 'list'}
              onClick={() => setActiveTab('list')}
              className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium"
            >
              <List className="w-4 h-4" />
              Minhas alterações
            </AppTabButton>
            <AppTabButton
              active={activeTab === 'new'}
              onClick={() => setActiveTab('new')}
              className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Nova alteração
            </AppTabButton>
          </nav>

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
