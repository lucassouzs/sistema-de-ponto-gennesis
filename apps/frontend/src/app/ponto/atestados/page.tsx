'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { MedicalCertificateCard } from '@/components/medical-certificate/MedicalCertificateCard';
import { MedicalCertificateList } from '@/components/medical-certificate/MedicalCertificateList';
import { List, Plus, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';
import api from '@/lib/api';

function AtestadosPageContent() {
  const [activeTab, setActiveTab] = useState<'list' | 'send'>('list');

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/auth/login';
  };

  const handleSuccess = () => {
    setActiveTab('list');
  };

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  if (loadingUser) {
    return (
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
    );
  }

  

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={handleLogout}
    >
      <div className="space-y-6 w-full px-4">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Ausências</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Gerencie suas ausências e acompanhe o status</p>
        </div>

        {/* Navegação no topo */}
        <AppUnderlineTabList aria-label="Seções de ausências" centered={false}>
          <AppUnderlineTabButton
            active={activeTab === 'list'}
            onClick={() => setActiveTab('list')}
            className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm"
          >
            <List className="w-4 h-4" />
            Meus Registros
          </AppUnderlineTabButton>
          <AppUnderlineTabButton
            active={activeTab === 'send'}
            onClick={() => setActiveTab('send')}
            className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Registrar Ausência
          </AppUnderlineTabButton>
        </AppUnderlineTabList>

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
                    {activeTab === 'list' ? 'Meus Registros' : 'Registrar Ausência'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {activeTab === 'list' ? 'Visualize e gerencie seus registros de ausência' : 'Preencha os dados para registrar uma nova ausência'}
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === 'list' ? (
              <MedicalCertificateList />
            ) : (
              <MedicalCertificateCard onSuccess={handleSuccess} />
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

export default function AtestadosPage() {
  return (
    <ProtectedRoute route="/ponto/atestados">
      <AtestadosPageContent />
    </ProtectedRoute>
  );
}
