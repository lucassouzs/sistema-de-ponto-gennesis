'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
  listTableRowClasses,
} from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { ListPagination } from '@/components/ui/ListPagination';
import api from '@/lib/api';
import type { FormTemplateSummary } from '@/components/forms/formStructureTypes';

const ITEMS_PER_PAGE = 20;

function formatDate(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FormulariosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ['formularios-templates'],
    queryFn: async () => {
      const res = await api.get('/formularios');
      return (Array.isArray(res.data?.data) ? res.data.data : []) as FormTemplateSummary[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/formularios', { name: 'Novo formulário' });
      return res.data?.data as FormTemplateSummary;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['formularios-templates'] });
      toast.success('Formulário criado.');
      if (created?.id) router.push(`/ponto/formularios/${created.id}`);
    },
    onError: () => toast.error('Não foi possível criar o formulário.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/formularios/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formularios-templates'] });
      toast.success('Formulário excluído.');
      closeRowActionMenu();
    },
    onError: () => toast.error('Não foi possível excluir o formulário.'),
  });

  const rows = Array.isArray(listData) ? listData : [];

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        (row.description || '').toLowerCase().includes(q)
      );
    });
  }, [rows, searchTerm]);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedRows = filtered.slice(startIndex, endIndex);
  const startItem = totalFiltered === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(endIndex, totalFiltered);
  const isListEmpty = !isLoading && totalFiltered === 0;

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(paginatedRows);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/formularios">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Formulários
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Crie e edite a estrutura de formulários (seções e perguntas).
            </p>
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <ClipboardList className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Formulários
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Gerencie templates com seções e perguntas
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className={cadastroListClasses.searchField}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Buscar por nome…"
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => createMutation.mutate()}
                    disabled={createMutation.isPending}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>
                      {createMutation.isPending ? 'Criando…' : 'Novo formulário'}
                    </span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isLoading ? (
                <CadastroListLoading message="Carregando formulários..." />
              ) : isListEmpty ? (
                <CadastroListEmpty
                  icon={ClipboardList}
                  title="Nenhum formulário encontrado"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Cadastre um novo formulário para começar'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={startItem}
                    endItem={endItem}
                    total={totalFiltered}
                    itemLabel="formulário"
                    itemLabelPlural="formulários"
                    currentPage={currentPage}
                    totalPages={totalPages}
                  />
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>Nome</th>
                          <th className={cadastroListClasses.th}>Descrição</th>
                          <th className={cadastroListClasses.th}>Atualizado</th>
                          <th className={cadastroListClasses.thRight}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {paginatedRows.map((row) => (
                          <tr
                            key={row.id}
                            className={`${listTableRowClasses.tr} cursor-pointer`}
                            onClick={() => router.push(`/ponto/formularios/${row.id}`)}
                          >
                            <td className="px-3 py-4 sm:px-6">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {row.name}
                              </span>
                            </td>
                            <td className={cadastroListClasses.td}>
                              {row.description?.trim() || '—'}
                            </td>
                            <td className={cadastroListClasses.td}>
                              {formatDate(row.updatedAt)}
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(row.id)}
                              onToggle={(e) =>
                                toggleRowActionMenu(
                                  row.id,
                                  e.currentTarget as HTMLButtonElement
                                )
                              }
                            />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ListPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />

                  {rowActionMenu && rowForActionMenu ? (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      onEdit={() =>
                        router.push(`/ponto/formularios/${rowForActionMenu.id}`)
                      }
                      onDelete={() => {
                        if (
                          confirm(
                            `Excluir o formulário "${rowForActionMenu.name}"? Esta ação não pode ser desfeita.`
                          )
                        ) {
                          deleteMutation.mutate(rowForActionMenu.id);
                        }
                      }}
                    />
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
