'use client';

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ChangePasswordModal } from '@/components/ui/ChangePasswordModal';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { SystemOverviewDashboard } from '@/components/dashboard/SystemOverviewDashboard';
import api from '@/lib/api';

export default function PainelDoSistemaPage() {
  const router = useRouter();
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const isFirstLogin = userData?.data?.isFirstLogin || false;

  useEffect(() => {
    if (isFirstLogin && userData) {
      setIsChangePasswordOpen(true);
    }
  }, [isFirstLogin, userData]);

  if (loadingUser || !userData) {
    return <Loading message="Carregando painel do sistema..." fullScreen size="lg" />;
  }

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00',
    role: 'EMPLOYEE',
  };

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <SystemOverviewDashboard />

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        onSuccess={() => setIsChangePasswordOpen(false)}
      />
    </MainLayout>
  );
}
