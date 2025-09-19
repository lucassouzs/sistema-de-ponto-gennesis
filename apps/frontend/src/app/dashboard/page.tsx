'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import api from '@/lib/api';


export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      console.log('User data from API:', res.data);
      return res.data;
    },
    staleTime: 0, // Sempre buscar dados frescos
    gcTime: 0 // Não cachear
  });

  const handleLogout = () => {
    // Remove token de autenticação
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    // Redireciona para a tela de login
    router.push('/auth/login');
  };


  if (loadingUser || !userData) {
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
    role: 'EMPLOYEE'
  };

  console.log('User object:', user);
  console.log('User role:', user.role);

  // Redirecionar baseado no papel do usuário
  if (user.role === 'EMPLOYEE') {
    console.log('Redirecting to /ponto');
    router.push('/ponto');
    return null;
  } else if (user.role === 'ADMIN' || user.role === 'HR') {
    console.log('Redirecting to /admin');
    router.push('/admin');
    return null;
  }

  return (
    <MainLayout 
              userRole={user.role} 
      userName={user.name} 
      onLogout={handleLogout}
    >
                  <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Bem-vindo!</h1>
        <p className="mt-2 text-gray-600">Redirecionando para sua área...</p>
      </div>
    </MainLayout>
  );
}