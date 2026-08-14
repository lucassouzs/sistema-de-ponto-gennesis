'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Snowflake, Wind } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import api from '@/lib/api';
import { GestaoOsPmocOverview, PLAN_TYPE_LABELS } from '../gestaoOsTypes';
import { useGestaoOsCompany } from '../useGestaoOsCompany';

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export default function GestaoOsPmocPageClient() {
  const router = useRouter();
  const { isLoading: loadingCompany } = useGestaoOsCompany();

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
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const { data, isLoading } = useQuery({
    queryKey: ['gestao-os-pmoc'],
    enabled: !loadingCompany,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsPmocOverview }>('/gestao-os/pmoc');
      return res.data?.data;
    }
  });

  if (loadingUser || loadingCompany) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/sistema-gestao-os/pmoc">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">PMOC</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Visão dos planos de climatização e ativos cobertos.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm">
              <Link
                href="/ponto/sistema-gestao-os/planos"
                className="font-medium text-red-700 hover:underline dark:text-red-300"
              >
                Ir para Planos
              </Link>
              <Link
                href="/ponto/sistema-gestao-os"
                className="font-medium text-red-700 hover:underline dark:text-red-300"
              >
                Central de Chamados
              </Link>
            </div>
          </div>

          {isLoading || !data ? (
            <div className="py-16 text-center text-sm text-gray-500">Carregando visão PMOC...</div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="flex items-center gap-3 py-5">
                    <div className="rounded-lg bg-sky-100 p-2 dark:bg-sky-950/40">
                      <Snowflake className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                    </div>
                    <div>
                      <p className="text-xs uppercase text-gray-500">Vencendo em 30 dias</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {data.dueSoonCount}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-3 py-5">
                    <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30">
                      <Wind className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="text-xs uppercase text-gray-500">Planos PMOC</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {data.plans.length}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-5">
                    <p className="text-xs uppercase text-gray-500">Ativos de climatização</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {data.climateAssets.length}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Planos PMOC
                  </h3>
                </CardHeader>
                <CardContent>
                  {data.plans.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum plano PMOC cadastrado.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Nome</th>
                            <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Tipo</th>
                            <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">
                              Próx. venc.
                            </th>
                            <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Local</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.plans.map((plan) => (
                            <tr key={plan.id} className="border-b border-gray-100 dark:border-gray-800">
                              <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                                {plan.name}
                              </td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                {PLAN_TYPE_LABELS[plan.planType]}
                              </td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                {formatDate(plan.nextDueAt)}
                              </td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                {plan.building?.name || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Ativos de climatização
                  </h3>
                </CardHeader>
                <CardContent>
                  {data.climateAssets.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum ativo de climatização encontrado.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Ativo</th>
                            <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">
                              Categoria
                            </th>
                            <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Prédio</th>
                            <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">Local</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.climateAssets.map((asset) => (
                            <tr
                              key={asset.id}
                              className="border-b border-gray-100 dark:border-gray-800"
                            >
                              <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                                {asset.name}
                              </td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                {asset.category || '—'}
                              </td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                {asset.building?.name || '—'}
                              </td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                {asset.placeName}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
