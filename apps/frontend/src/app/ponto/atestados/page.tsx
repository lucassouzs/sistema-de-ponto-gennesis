'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { MedicalCertificateCard } from '@/components/medical-certificate/MedicalCertificateCard';
import { MedicalCertificateList } from '@/components/medical-certificate/MedicalCertificateList';
import { FileText, List, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';

export default function AtestadosPage() {
  const [activeTab, setActiveTab] = useState<'send' | 'list'>('send');

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
    role: 'EMPLOYEE'
  };

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Ausências</h1>
          <p className="mt-2 text-gray-600">Gerencie suas ausências e acompanhe o status</p>
        </div>

        {/* Abas */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('send')}
              className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'send'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Plus className="w-4 h-4" />
              Registrar Ausência
            </button>
            <button
              onClick={() => setActiveTab('list')}
              className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'list'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <List className="w-4 h-4" />
              Meus Registros
            </button>
          </nav>
        </div>

        {/* Conteúdo das Abas */}
        <div className="mt-6">
          {activeTab === 'send' ? (
            <MedicalCertificateCard onSuccess={handleSuccess} />
          ) : (
            <MedicalCertificateList userRole="EMPLOYEE" />
          )}
        </div>
      </div>
    </MainLayout>
  );
}
