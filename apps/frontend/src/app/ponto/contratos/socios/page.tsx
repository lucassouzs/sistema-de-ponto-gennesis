'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { ControleGeralGastosOperacionaisPanel } from '../controle-geral/ControleGeralGastosOperacionaisPanel';
import {
  buildGastosDetailRowsFromSheetRows,
  filterTotvsGastosDetailRowsForControleGeral,
  mergeControleGeralGastosDetailRows
} from '../controle-geral/buildQueryGastosRows';
import {
  fetchGastosOperacionaisTotvs,
  GASTOS_OPERACIONAIS_TOTVS_QUERY_KEY
} from '../controle-geral/fetchGastosOperacionaisTotvs';
import { CONTRATOS_SOCIOS_ALLOWED } from './contratosSociosAllowed';

export default function ContratosSociosPage() {
  const router = useRouter();
  const [dataRefreshNonce, setDataRefreshNonce] = useState(0);

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
    data: totvsGastosData,
    isLoading: loadingTotvsGastos,
    isError: totvsGastosError,
    error: totvsGastosErrorObj,
    refetch: refetchTotvsGastos
  } = useQuery({
    queryKey: GASTOS_OPERACIONAIS_TOTVS_QUERY_KEY,
    queryFn: fetchGastosOperacionaisTotvs,
    staleTime: 5 * 60 * 1000,
    retry: 1
  });

  const {
    data: legacySheetData,
    isLoading: loadingLegacySheet,
    isError: legacySheetError,
    error: legacySheetErrorObj
  } = useQuery({
    queryKey: ['controle-geral-gastos-legacy-sheet-v19', dataRefreshNonce],
    queryFn: async () => {
      const refreshParams = dataRefreshNonce > 0 ? { refresh: 1 } : {};
      const sheetRes = await api.get<{
        success: boolean;
        data?: { rows?: string[][]; fetchedAt?: string };
      }>('/controle-nfs/sheet-data', {
        params: { sheetName: 'QUERY BASE DE GASTOS', ...refreshParams },
        timeout: 120_000
      });

      return {
        detailRows: buildGastosDetailRowsFromSheetRows(sheetRes.data?.data?.rows ?? []),
        fetchedAt: sheetRes.data?.data?.fetchedAt ?? new Date().toISOString()
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1
  });

  const gastosDetailRows = useMemo(
    () =>
      mergeControleGeralGastosDetailRows(
        legacySheetData?.detailRows ?? [],
        totvsGastosData?.detailRows ?? []
      ),
    [legacySheetData?.detailRows, totvsGastosData?.detailRows]
  );

  const gastosNaturezaDetailRows = useMemo(
    () => filterTotvsGastosDetailRowsForControleGeral(totvsGastosData?.naturezaDetailRows ?? []),
    [totvsGastosData?.naturezaDetailRows]
  );

  const loadingGastos = loadingLegacySheet || loadingTotvsGastos;
  const gastosError = Boolean(legacySheetError && totvsGastosError);
  const gastosFetchedAt = totvsGastosData?.fetchedAt ?? legacySheetData?.fetchedAt;
  const gastosErrorMessage = (() => {
    if (legacySheetError) {
      const err = legacySheetErrorObj as {
        response?: { data?: { message?: string } };
        message?: string;
      } | null;
      return (
        err?.response?.data?.message ??
        err?.message ??
        'Não foi possível carregar a planilha de gastos (até 2024).'
      );
    }
    if (totvsGastosError) {
      const err = totvsGastosErrorObj as {
        response?: { data?: { message?: string } };
        message?: string;
      } | null;
      return (
        err?.response?.data?.message ??
        err?.message ??
        'Não foi possível carregar os gastos no TOTVS RM (a partir de 2025).'
      );
    }
    return 'Não foi possível carregar os gastos.';
  })();

  const gastosTotvsWarning = totvsGastosError
    ? 'TOTVS indisponível — exibindo apenas planilha (até 2024), se disponível.'
    : null;

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/contratos/socios">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/contratos/socios">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Contratos Sócios
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Visão financeira dos contratos compartilhados com sócios
            </p>
          </div>

          <ControleGeralGastosOperacionaisPanel
            detailRows={gastosDetailRows}
            naturezaDetailRows={gastosNaturezaDetailRows}
            isLoading={loadingGastos}
            fetchedAt={gastosFetchedAt}
            isError={gastosError}
            errorMessage={gastosErrorMessage}
            onRetry={() => {
              setDataRefreshNonce((n) => n + 1);
              void refetchTotvsGastos();
            }}
            dataRefreshNonce={dataRefreshNonce}
            allowedContracts={CONTRATOS_SOCIOS_ALLOWED}
            hideLocalityColumn
            hideContractFilter
            hideLocalityFilter
            panelTitle="Controle de Contratos"
            panelDescription={
              gastosTotvsWarning
                ? `Dados parcialmente disponíveis (${gastosTotvsWarning})`
                : 'Faturamento, recebimentos e gastos por contrato'
            }
            totalColumnLabel="Gastos"
            showFaturamentoColumn
            showTetoOrcamentarioColumn
            showPdfExport
            enableContractFluxoModal
          />
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
