'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileCheck, Search, ExternalLink, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { pleitoStatusReadOnlySpanClass } from '@/lib/pleitoStatusStyles';

interface PleitoGerado {
  id: string;
  divSe: string | null;
  folderNumber: string | null;
  serviceDescription: string;
  budget: string | null;
  executionStatus: string | null;
  billingRequest: number | null;
  updatedContractId: string | null;
  updatedContract?: { id: string; name: string; number: string } | null;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR');
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export default function PleitosGeradosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 20;

  const deletePleitoMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/pleitos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pleitos-gerados'] });
      queryClient.invalidateQueries({ queryKey: ['pleitos'] });
      queryClient.invalidateQueries({ queryKey: ['pleitos-divse-list'] });
      queryClient.invalidateQueries({ queryKey: ['contract-pleitos'] });
      toast.success('Pleito excluído.');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao excluir pleito');
    }
  });

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

  const { data: listData, isLoading: loadingList } = useQuery({
    queryKey: ['pleitos-gerados', searchTerm, currentPage],
    queryFn: async () => {
      const res = await api.get('/pleitos', {
        params: { gerados: true, search: searchTerm || undefined, page: currentPage, limit }
      });
      return res.data;
    }
  });

  const rows = (listData?.data || []) as PleitoGerado[];
  const pagination = listData?.pagination || { page: 1, totalPages: 1, total: 0 };
  const totalValor = rows.reduce((s, p) => s + (p.billingRequest || 0), 0);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) return <Loading message="Carregando..." fullScreen size="lg" />;

  return (
    <ProtectedRoute route="/ponto/pleitos-gerados">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <FileCheck className="w-8 h-8 text-red-600 dark:text-red-400" />
                Pleitos Gerados
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Visualize todos os pleitos com valor pleiteado informado
              </p>
            </div>
            <Link
              href="/ponto/contratos"
              className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Ver contratos
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>

          <Card>
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar por descrição, OS/SE, pasta..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span>
                    {pagination.total} {pagination.total === 1 ? 'pleito' : 'pleitos'}
                  </span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    Total pleiteado: {formatCurrency(totalValor)}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Contrato</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">OS / SE</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nº Pasta</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Descrição</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Orçamento</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valor Pleiteado</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">% Orçamento</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status Execução</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase min-w-[7rem]">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {loadingList ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                          Carregando...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                          Nenhum pleito gerado encontrado. Os pleitos são gerados a partir do módulo de Contratos.
                        </td>
                      </tr>
                    ) : (
                      rows.map((p) => {
                        const orc = p.budget ? Number(p.budget) : 0;
                        const vp = p.billingRequest || 0;
                        const pct = orc > 0 ? (vp / orc) * 100 : null;
                        return (
                          <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                              {p.updatedContract ? (
                                <Link
                                  href={`/ponto/contratos/${p.updatedContract.id}`}
                                  className="text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  {p.updatedContract.name} - nº {p.updatedContract.number}
                                </Link>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{p.divSe || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{p.folderNumber || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={p.serviceDescription}>
                              {p.serviceDescription || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                              {p.budget ? formatCurrency(Number(p.budget)) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium text-green-600 dark:text-green-400">
                              {formatCurrency(vp)}
                            </td>
                            <td className="px-4 py-3 text-sm text-center text-gray-900 dark:text-gray-100">
                              {pct != null ? `${pct.toFixed(1)}%` : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className={pleitoStatusReadOnlySpanClass('execution', p.executionStatus)} title={p.executionStatus || ''}>
                                {p.executionStatus || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1.5 items-start">
                                {p.updatedContractId && (
                                  <Link
                                    href={`/ponto/contratos/${p.updatedContractId}`}
                                    className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    Ver contrato
                                    <ExternalLink className="w-3 h-3" />
                                  </Link>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      !window.confirm(
                                        'Excluir este registro de pleito? Esta ação não pode ser desfeita.'
                                      )
                                    ) {
                                      return;
                                    }
                                    deletePleitoMutation.mutate(p.id);
                                  }}
                                  disabled={deletePleitoMutation.isPending}
                                  className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Excluir pleito"
                                >
                                  <Trash2 className="w-3 h-3 shrink-0" />
                                  Excluir
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Página {pagination.page} de {pagination.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={pagination.page <= 1}
                      className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                      disabled={pagination.page >= pagination.totalPages}
                      className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
