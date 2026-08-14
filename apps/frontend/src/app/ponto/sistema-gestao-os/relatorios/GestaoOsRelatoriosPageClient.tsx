'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart3, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import api from '@/lib/api';
import { GestaoOsReportsSummary } from '../gestaoOsTypes';
import { useGestaoOsCompany } from '../useGestaoOsCompany';

function downloadCsv(filename: string, rows: string[][]) {
  const escape = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const body = rows.map((r) => r.map(escape).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function GestaoOsRelatoriosPageClient() {
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
    queryKey: ['gestao-os-reports-summary'],
    enabled: !loadingCompany,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsReportsSummary }>(
        '/gestao-os/reports/summary'
      );
      return res.data?.data;
    }
  });

  const exportCsv = () => {
    if (!data) {
      toast.error('Sem dados para exportar');
      return;
    }
    const rows: string[][] = [
      ['Métrica', 'Valor'],
      ['Em aberto', String(data.openLike)],
      ['Atrasadas', String(data.overdue)],
      ['MTTR (horas)', data.mttrHours != null ? String(data.mttrHours) : '—'],
      [],
      ['Categoria', 'Quantidade'],
      ...data.byCategory.map((r) => [r.category, String(r.count)]),
      [],
      ['Prédio', 'Quantidade'],
      ...data.byBuilding.map((r) => [r.name, String(r.count)]),
      [],
      ['Técnico', 'Quantidade'],
      ...data.byTechnician.map((r) => [r.name, String(r.count)])
    ];
    downloadCsv(`gestao-os-relatorio-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast.success('CSV exportado');
  };

  if (loadingUser || loadingCompany) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/sistema-gestao-os/relatorios">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Relatórios de Chamados
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Indicadores de backlog, atraso, MTTR e distribuição.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm">
              <Link
                href="/ponto/sistema-gestao-os"
                className="font-medium text-red-700 hover:underline dark:text-red-300"
              >
                Voltar à Central de Chamados
              </Link>
            </div>
          </div>

          {isLoading || !data ? (
            <div className="py-16 text-center text-sm text-gray-500">Carregando indicadores...</div>
          ) : (
            <>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={exportCsv}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="py-5">
                    <p className="text-xs uppercase text-gray-500">Em aberto</p>
                    <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
                      {data.openLike}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-5">
                    <p className="text-xs uppercase text-gray-500">Atrasadas</p>
                    <p className="mt-1 text-3xl font-bold text-rose-700 dark:text-rose-300">
                      {data.overdue}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-5">
                    <p className="text-xs uppercase text-gray-500">MTTR (horas)</p>
                    <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
                      {data.mttrHours != null ? data.mttrHours : '—'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                      <BarChart3 className="h-4 w-4 text-red-600" />
                      Por categoria
                    </h3>
                  </CardHeader>
                  <CardContent>
                    {data.byCategory.length === 0 ? (
                      <p className="text-sm text-gray-500">Sem dados</p>
                    ) : (
                      <table className="w-full text-sm">
                        <tbody>
                          {data.byCategory.map((row) => (
                            <tr
                              key={row.category}
                              className="border-b border-gray-100 dark:border-gray-800"
                            >
                              <td className="py-1.5 text-gray-800 dark:text-gray-200">
                                {row.category}
                              </td>
                              <td className="py-1.5 text-right font-semibold text-gray-900 dark:text-gray-100">
                                {row.count}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      Por prédio
                    </h3>
                  </CardHeader>
                  <CardContent>
                    {data.byBuilding.length === 0 ? (
                      <p className="text-sm text-gray-500">Sem dados</p>
                    ) : (
                      <table className="w-full text-sm">
                        <tbody>
                          {data.byBuilding.map((row) => (
                            <tr
                              key={row.buildingId || row.name}
                              className="border-b border-gray-100 dark:border-gray-800"
                            >
                              <td className="py-1.5 text-gray-800 dark:text-gray-200">{row.name}</td>
                              <td className="py-1.5 text-right font-semibold text-gray-900 dark:text-gray-100">
                                {row.count}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      Por técnico
                    </h3>
                  </CardHeader>
                  <CardContent>
                    {data.byTechnician.length === 0 ? (
                      <p className="text-sm text-gray-500">Sem dados</p>
                    ) : (
                      <table className="w-full text-sm">
                        <tbody>
                          {data.byTechnician.map((row) => (
                            <tr
                              key={row.assigneeId || row.name}
                              className="border-b border-gray-100 dark:border-gray-800"
                            >
                              <td className="py-1.5 text-gray-800 dark:text-gray-200">{row.name}</td>
                              <td className="py-1.5 text-right font-semibold text-gray-900 dark:text-gray-100">
                                {row.count}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
