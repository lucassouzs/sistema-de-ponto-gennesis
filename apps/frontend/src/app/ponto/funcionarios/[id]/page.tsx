'use client';

import React, { Suspense, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  EmployeeDetailView,
  type EmployeeDetailTab,
} from '@/components/employee/EmployeeDetailView';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';

const VALID_TABS: EmployeeDetailTab[] = ['info', 'remuneration', 'records', 'permissions'];

function parseTab(value: string | null): EmployeeDetailTab {
  if (value && VALID_TABS.includes(value as EmployeeDetailTab)) {
    return value as EmployeeDetailTab;
  }
  return 'info';
}

function FuncionarioDetailInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = String(params?.id || '');

  const initialTab = useMemo(
    () => parseTab(searchParams?.get('tab') ?? null),
    [searchParams]
  );

  const handleTabChange = useCallback(
    (tab: EmployeeDetailTab) => {
      const next = new URLSearchParams(searchParams?.toString() ?? '');
      if (tab === 'info') {
        next.delete('tab');
      } else {
        next.set('tab', tab);
      }
      const qs = next.toString();
      router.replace(
        qs ? `/ponto/funcionarios/${userId}?${qs}` : `/ponto/funcionarios/${userId}`,
        { scroll: false }
      );
    },
    [router, searchParams, userId]
  );

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

  if (loadingUser) {
    return <Loading message="Carregando funcionário..." fullScreen size="lg" />;
  }

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE',
  };

  if (!userId) {
    return (
      <ProtectedRoute route="/ponto/funcionarios">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <p className="py-12 text-center text-gray-600 dark:text-gray-400">
            Funcionário inválido.
          </p>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/funcionarios">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <EmployeeDetailView
          userId={userId}
          initialTab={initialTab}
          onTabChange={handleTabChange}
        />
      </MainLayout>
    </ProtectedRoute>
  );
}

export default function FuncionarioDetailPage() {
  return (
    <Suspense fallback={<Loading message="Carregando funcionário..." fullScreen size="lg" />}>
      <FuncionarioDetailInner />
    </Suspense>
  );
}
