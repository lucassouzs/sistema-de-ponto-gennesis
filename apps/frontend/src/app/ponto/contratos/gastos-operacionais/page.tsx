'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { ControleGeralGastosOperacionaisPanel } from '../controle-geral/ControleGeralGastosOperacionaisPanel';
import {
  fetchGastosOperacionaisTotvs,
  GASTOS_OPERACIONAIS_TOTVS_QUERY_KEY
} from '../controle-geral/fetchGastosOperacionaisTotvs';

export default function GastosOperacionaisPage() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const {
    data: gastosData,
    isLoading: loadingGastos,
    isError: gastosError,
    error: gastosErrorObj,
    isFetching: fetchingGastos,
    refetch: refetchGastos
  } = useQuery({
    queryKey: GASTOS_OPERACIONAIS_TOTVS_QUERY_KEY,
    queryFn: fetchGastosOperacionaisTotvs,
    staleTime: 5 * 60 * 1000,
    retry: 1
  });

  const gastosDetailRows = gastosData?.detailRows ?? [];
  const gastosNaturezaDetailRows = gastosData?.naturezaDetailRows ?? [];
  const gastosTotvsNaturezaCatalog = gastosData?.totvsNaturezaCatalog ?? [];
  const gastosErrorMessage = (() => {
    const err = gastosErrorObj as {
      response?: { data?: { message?: string } };
      message?: string;
    } | null;
    return (
      err?.response?.data?.message ??
      err?.message ??
      'Não foi possível carregar os gastos no TOTVS RM.'
    );
  })();

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/contratos/gastos-operacionais">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/contratos/gastos-operacionais">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Gastos Operacionais
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Visualize e exporte os gastos de todos os centros de custo.
            </p>
          </div>

          <ControleGeralGastosOperacionaisPanel
            detailRows={gastosDetailRows}
            naturezaDetailRows={gastosNaturezaDetailRows}
            totvsNaturezaCatalog={gastosTotvsNaturezaCatalog}
            isLoading={loadingGastos || fetchingGastos}
            isError={gastosError}
            errorMessage={gastosErrorMessage}
            onRetry={() => {
              void refetchGastos();
            }}
            hideDataRefreshControls
            inlineFilters
            panelTitle="Resumo por centro de custo"
            panelDescription="Totais mensais e anuais integrados ao TOTVS RM."
            readOnlyPoloColumn
            showPdfExport
            showNaturezasCatalogButton
          />
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
