'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Edit, MoreVertical, Plus, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { FichaDemandaApprovalFormModal } from '@/components/engenharia/FichaDemandaApprovalFormModal';
import { FdStatusBadges } from '@/components/engenharia/FdStatusBadges';
import api from '@/lib/api';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { listTableRowClasses, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import {
  formatCurrencyDisplay,
  formToApiPayload,
  type FichaDemandaApprovalFormState,
  type FichaDemandaApprovalRecord,
} from '@/lib/fichaDemandaApproval';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

const ROW_ACTION_MENU_WIDTH_PX = 224;
const ITEMS_PER_PAGE = 20;

export default function AprovacaoFdsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FichaDemandaApprovalRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [rowActionMenu, setRowActionMenu] = useState<{
    rowId: string;
    top: number;
    left: number;
  } | null>(null);

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
    },
  });

  const { data: listData, isLoading: loadingList } = useQuery({
    queryKey: ['demand-sheet-approvals', searchTerm],
    queryFn: async () => {
      const res = await api.get('/demand-sheet-approvals', {
        params: { search: searchTerm || undefined },
      });
      return (res.data?.data || []) as FichaDemandaApprovalRecord[];
    },
    enabled: !loadingUser,
  });

  const records = listData || [];

  const totalFiltered = records.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = records.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const startItem = totalFiltered === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(startIndex + ITEMS_PER_PAGE, totalFiltered);
  const isListEmpty = !loadingList && totalFiltered === 0;

  const rowForActionMenu = rowActionMenu
    ? records.find((r) => r.id === rowActionMenu.rowId) ?? null
    : null;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!rowActionMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRowActionMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rowActionMenu]);

  useEffect(() => {
    if (rowActionMenu && !records.some((r) => r.id === rowActionMenu.rowId)) {
      setRowActionMenu(null);
    }
  }, [rowActionMenu, records]);

  const modalOpen = showForm || deleteId != null;

  useEffect(() => {
    if (!modalOpen) return;
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [modalOpen]);

  const createMutation = useMutation({
    mutationFn: async (form: FichaDemandaApprovalFormState) => {
      const res = await api.post('/demand-sheet-approvals', formToApiPayload(form));
      return res.data;
    },
    onSuccess: () => {
      toast.success('Ficha registrada. Aguardando aprovação do gestor.');
      void queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
      setShowForm(false);
      setEditingRecord(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao salvar ficha');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      form,
    }: {
      id: string;
      form: FichaDemandaApprovalFormState;
    }) => {
      const res = await api.patch(`/demand-sheet-approvals/${id}`, formToApiPayload(form));
      return res.data;
    },
    onSuccess: () => {
      toast.success('Ficha atualizada.');
      void queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
      setShowForm(false);
      setEditingRecord(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao atualizar ficha');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/demand-sheet-approvals/${id}`);
    },
    onSuccess: () => {
      toast.success('Registro excluído.');
      void queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
      setDeleteId(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao excluir');
    },
  });

  const handleSave = (form: FichaDemandaApprovalFormState) => {
    if (editingRecord) {
      updateMutation.mutate({ id: editingRecord.id, form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const openCreate = () => {
    setEditingRecord(null);
    setShowForm(true);
  };

  const openEdit = (row: FichaDemandaApprovalRecord) => {
    if (row.status !== 'WAITING_MANAGER') {
      toast.error('Somente fichas aguardando aprovação podem ser editadas.');
      return;
    }
    setEditingRecord(row);
    setShowForm(true);
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/aprovacao-fds">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Fichas de Demanda
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Cadastre fichas de demanda. Após o envio, o gestor do contrato analisa e decide.
            </p>
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <ClipboardCheck className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Fichas de Demanda
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Gerencie as fichas de demanda cadastradas
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="search"
                      placeholder="Buscar por código FD, pedido, contrato..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={openCreate}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Nova ficha</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingList ? (
                <div className="py-8 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="loading-spinner h-6 w-6" />
                    <span className="text-gray-600 dark:text-gray-400">Carregando fichas...</span>
                  </div>
                </div>
              ) : isListEmpty ? (
                <div className="py-8 text-center">
                  <ClipboardCheck className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhuma ficha de demanda encontrada</p>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                    {searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Cadastre uma nova ficha para começar'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {startItem} a {endItem} de {totalFiltered}{' '}
                      {totalFiltered === 1 ? 'ficha' : 'fichas'}
                    </span>
                    <span>
                      Página {currentPage} de {totalPages}
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Cód. FD
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Pedido
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Contrato
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Solicitante
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Polo
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Status
                          </th>
                          <th className="px-3 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Faturamento
                          </th>
                          <th className="min-w-[7rem] px-3 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {paginatedRows.map((row) => (
                          <tr
                            key={row.id}
                            className={listTableRowClasses.tr}
                          >
                            <td className="px-3 py-4 sm:px-6">
                              <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">{row.codFichaDemanda}</span>
                            </td>
                            <td className="px-3 py-4 text-gray-900 dark:text-gray-100 sm:px-6">
                              {row.codigoPedido}
                            </td>
                            <td
                              className="max-w-[220px] truncate px-3 py-4 text-gray-900 dark:text-gray-100 sm:px-6"
                              title={row.contratoNome}
                            >
                              {row.contratoNome}
                            </td>
                            <td className="px-3 py-4 text-gray-900 dark:text-gray-100 sm:px-6">
                              {row.solicitanteNome}
                            </td>
                            <td className="px-3 py-4 text-center sm:px-6">
                              <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                {row.polo}
                              </span>
                            </td>
                            <td className="px-3 py-4 text-center sm:px-6">
                              <FdStatusBadges record={row} />
                            </td>
                            <td className="px-3 py-4 text-right tabular-nums text-gray-900 dark:text-gray-100 sm:px-6">
                              {formatCurrencyDisplay(row.faturamentoEstimado)}
                            </td>
                            <td className="px-3 py-4 text-right sm:px-6">
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                    setRowActionMenu((prev) => {
                                      if (prev?.rowId === row.id) return null;
                                      let left = rect.right - ROW_ACTION_MENU_WIDTH_PX;
                                      left = Math.max(
                                        8,
                                        Math.min(left, window.innerWidth - ROW_ACTION_MENU_WIDTH_PX - 8)
                                      );
                                      return { rowId: row.id, top: rect.bottom + 4, left };
                                    });
                                  }}
                                  className={rowActionMenuButtonClass(rowActionMenu?.rowId === row.id)}
                                  aria-label="Menu de ações"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:mt-6">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                      >
                        Anterior
                      </button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const pageNumber = i + 1;
                        const isActive = pageNumber === currentPage;
                        return (
                          <button
                            key={pageNumber}
                            type="button"
                            onClick={() => setCurrentPage(pageNumber)}
                            className={`rounded-md px-3 py-2 text-sm font-medium ${
                              isActive
                                ? 'bg-red-600 text-white'
                                : 'border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                            }`}
                          >
                            {pageNumber}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                      >
                        Próxima
                      </button>
                    </div>
                  )}

                  {rowActionMenu && rowForActionMenu && (
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
                          openEdit(rowForActionMenu);
                        }}
                        disabled={rowForActionMenu.status !== 'WAITING_MANAGER'}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
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
                          if (rowForActionMenu.status !== 'WAITING_MANAGER') {
                            toast.error('Somente fichas aguardando aprovação podem ser excluídas.');
                            return;
                          }
                          setDeleteId(rowForActionMenu.id);
                        }}
                        disabled={rowForActionMenu.status !== 'WAITING_MANAGER'}
                        className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
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

        <FichaDemandaApprovalFormModal
          isOpen={showForm}
          onClose={() => {
            if (!isSaving) {
              setShowForm(false);
              setEditingRecord(null);
            }
          }}
          editingRecord={editingRecord}
          onSave={handleSave}
          isSaving={isSaving}
        />

        {deleteId ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" aria-hidden onClick={() => setDeleteId(null)} />
            <div className="relative z-[1101] w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <p className="mb-1 text-gray-900 dark:text-gray-100">Excluir ficha de demanda?</p>
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteId(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}
      </MainLayout>
    </ProtectedRoute>
  );
}
