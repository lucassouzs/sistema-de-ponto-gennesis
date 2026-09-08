'use client';

import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileCheck, Search, Edit, Trash2, X, MoreVertical } from 'lucide-react';

const ROW_ACTION_MENU_WIDTH_PX = 224;
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import api from '@/lib/api';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { listTableRowClasses, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
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
  const [rowActionMenu, setRowActionMenu] = useState<{
    pleitoId: string;
    top: number;
    left: number;
  } | null>(null);
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
  const totalFiltered = pagination.total;
  const totalPages = Math.max(1, pagination.totalPages);
  const startItem = totalFiltered === 0 ? 0 : (currentPage - 1) * limit + 1;
  const endItem = totalFiltered === 0 ? 0 : Math.min(currentPage * limit, totalFiltered);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const isListEmpty = !loadingList && pagination.total === 0;
  const pleitoForActionMenu = rowActionMenu
    ? rows.find((r) => r.id === rowActionMenu.pleitoId) ?? null
    : null;

  useEffect(() => {
    if (!rowActionMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRowActionMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rowActionMenu]);

  useEffect(() => {
    if (rowActionMenu && !rows.some((r) => r.id === rowActionMenu.pleitoId)) {
      setRowActionMenu(null);
    }
  }, [rowActionMenu, rows]);

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/pleitos-gerados">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/pleitos-gerados">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Pleitos Gerados
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Visualize todos os pleitos com valor pleiteado informado
            </p>
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                    <FileCheck className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Pleitos gerados
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Visualize pleitos com valor pleiteado informado
                    </p>
                  </div>
                </div>
                <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    placeholder="Buscar por descrição, OS/SE, pasta..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                  {searchTerm ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setCurrentPage(1);
                      }}
                      aria-label="Limpar busca"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingList ? (
                <CadastroListLoading message="Carregando pleitos..." />
              ) : isListEmpty ? (
                <div className="py-8 text-center">
                  <FileCheck className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhum pleito gerado encontrado</p>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                    {searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Os pleitos são gerados a partir do módulo de Contratos'}
                  </p>
                </div>
              ) : (
              <>
                <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <span>
                    Mostrando {startItem} a {endItem} de {totalFiltered}{' '}
                    {totalFiltered === 1 ? 'pleito' : 'pleitos'}
                  </span>
                  <span>
                    Página {currentPage} de {totalPages}
                  </span>
                </div>
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contrato</th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">OS / SE</th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nº Pasta</th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descrição</th>
                      <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Orçamento</th>
                      <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Valor Pleiteado</th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">% Orçamento</th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status Execução</th>
                      <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[7rem]">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {rows.map((p) => {
                        const orc = p.budget ? Number(p.budget) : 0;
                        const vp = p.billingRequest || 0;
                        const pct = orc > 0 ? (vp / orc) * 100 : null;
                        return (
                          <tr key={p.id} className={listTableRowClasses.tr}>
                            <td className="px-3 sm:px-6 py-4 text-sm">
                              {p.updatedContract ? (
                                <span className="text-sm text-gray-900 dark:text-gray-100">
                                  <Link
                                    href={`/ponto/contratos/${p.updatedContract.id}`}
                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {p.updatedContract.name} - nº {p.updatedContract.number}
                                  </Link>
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-3 sm:px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{p.divSe || '-'}</td>
                            <td className="px-3 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{p.folderNumber || '-'}</td>
                            <td className="px-3 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={p.serviceDescription}>
                              {p.serviceDescription || '-'}
                            </td>
                            <td className="px-3 sm:px-6 py-4 text-sm text-right text-gray-900 dark:text-gray-100">
                              {p.budget ? formatCurrency(Number(p.budget)) : '-'}
                            </td>
                            <td className="px-3 sm:px-6 py-4 text-sm text-right font-medium text-green-600 dark:text-green-400">
                              {formatCurrency(vp)}
                            </td>
                            <td className="px-3 sm:px-6 py-4 text-sm text-center text-gray-900 dark:text-gray-100">
                              {pct != null ? `${pct.toFixed(1)}%` : '-'}
                            </td>
                            <td className="px-3 sm:px-6 py-4 text-sm">
                              <span className={pleitoStatusReadOnlySpanClass('execution', p.executionStatus)} title={p.executionStatus || ''}>
                                {p.executionStatus || '—'}
                              </span>
                            </td>
                            <td className="px-3 sm:px-6 py-4 text-right">
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                    setRowActionMenu((prev) => {
                                      if (prev?.pleitoId === p.id) return null;
                                      let left = r.right - ROW_ACTION_MENU_WIDTH_PX;
                                      left = Math.max(
                                        8,
                                        Math.min(left, window.innerWidth - ROW_ACTION_MENU_WIDTH_PX - 8)
                                      );
                                      return { pleitoId: p.id, top: r.bottom + 4, left };
                                    });
                                  }}
                                  className={rowActionMenuButtonClass(rowActionMenu?.pleitoId === p.id)}
                                  aria-label="Menu de ações"
                                  aria-expanded={rowActionMenu?.pleitoId === p.id}
                                  aria-haspopup="menu"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              <ListPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />

              {rowActionMenu && pleitoForActionMenu && (
                <ActionMenuOverlay
                  open
                  onClose={() => setRowActionMenu(null)}
                  top={rowActionMenu.top}
                  left={rowActionMenu.left}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRowActionMenu(null);
                      if (pleitoForActionMenu.updatedContractId) {
                        router.push(`/ponto/contratos/${pleitoForActionMenu.updatedContractId}`);
                      } else {
                        router.push('/ponto/andamento-da-os');
                      }
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Edit className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span>Editar</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRowActionMenu(null);
                      if (
                        !window.confirm(
                          'Excluir este registro de pleito? Esta ação não pode ser desfeita.'
                        )
                      ) {
                        return;
                      }
                      deletePleitoMutation.mutate(pleitoForActionMenu.id);
                    }}
                    disabled={deletePleitoMutation.isPending}
                    className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>Excluir</span>
                  </button>
                </ActionMenuOverlay>
              )}
              </>
              )}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
