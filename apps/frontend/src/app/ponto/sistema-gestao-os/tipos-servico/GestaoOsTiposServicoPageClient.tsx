'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AlertCircle, Plus, Power, Search, Wrench, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
  listTableRowClasses
} from '@/components/ui/RowActionMenu';
import { ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import type { GestaoOsServiceCategory } from '../gestaoOsTypes';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

function emptyForm() {
  return { name: '', code: '', description: '', checklistText: '' };
}

export default function GestaoOsTiposServicoPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GestaoOsServiceCategory | null>(null);
  const [viewing, setViewing] = useState<GestaoOsServiceCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GestaoOsServiceCategory | null>(null);
  const [formData, setFormData] = useState(() => emptyForm());

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
  }, []);

  const { requestClose: requestCloseForm, confirmUi: formConfirmUi } = useModalCloseConfirm(
    closeForm,
    { isParentOpen: showForm }
  );

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
    data: categories = [],
    isLoading,
    isError,
    error
  } = useQuery({
    queryKey: ['gestao-os-cadastros', 'categories'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsServiceCategory[] }>(
        '/gestao-os/cadastros/categories'
      );
      return res.data?.data ?? [];
    }
  });

  const rows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) =>
      [c.name, c.code, c.description].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [categories, searchTerm]);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen
  } = useRowActionMenu(rows);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['gestao-os-cadastros', 'categories'] });
    void queryClient.invalidateQueries({ queryKey: ['gestao-os-categories'] });
  };

  const createMutation = useMutation({
    mutationFn: async (body: { name: string; code: string | null; description: string | null }) => {
      await api.post('/gestao-os/cadastros/categories', { ...body, companyId: null });
    },
    onSuccess: () => {
      toast.success('Tipo de serviço cadastrado.');
      setFormData(emptyForm());
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao cadastrar.');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data
    }: {
      id: string;
      data: { name: string; code: string | null; description: string | null };
    }) => {
      await api.patch(`/gestao-os/cadastros/categories/${id}`, data);
    },
    onSuccess: () => {
      toast.success('Tipo de serviço atualizado.');
      setFormData(emptyForm());
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar.');
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await api.patch(`/gestao-os/cadastros/categories/${id}`, { isActive });
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.isActive ? 'Tipo de serviço ativado.' : 'Tipo de serviço desativado.');
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar status.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/gestao-os/cadastros/categories/${id}`);
    },
    onSuccess: () => {
      toast.success('Tipo de serviço excluído.');
      setDeleteTarget(null);
      setViewing(null);
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao excluir.');
    }
  });

  const openCreate = () => {
    setEditing(null);
    setFormData(emptyForm());
    setShowForm(true);
  };

  const openView = (row: GestaoOsServiceCategory) => {
    setViewing(row);
  };

  const openEdit = (row: GestaoOsServiceCategory) => {
    setViewing(null);
    setEditing(row);
    setFormData({
      name: row.name ?? '',
      code: row.code ?? '',
      description: row.description ?? '',
      checklistText: (row.checklistItems ?? []).map((item) => item.label).join('\n')
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório.');
      return;
    }
    const payload = {
      name: formData.name.trim(),
      code: formData.code.trim() || null,
      description: formData.description.trim() || null,
      checklistItems: formData.checklistText
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const loadError =
    isError &&
    ((error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (error as Error)?.message ||
      'Não foi possível carregar os tipos de serviço.');
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/sistema-gestao-os/tipos-servico">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Tipos de Serviço
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Categorias usadas na abertura e classificação de chamados / OS.
            </p>
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <Wrench className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Tipos de Serviço
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {isError ? 'Erro ao carregar.' : `${rows.length} registro(s)`}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className={cadastroListClasses.searchField}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Pesquisar por nome ou código..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        aria-label="Limpar busca"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={openCreate}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Novo Tipo de Serviço
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isError ? (
                <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <AlertCircle className="h-10 w-10 text-red-500" />
                  <p className="max-w-md text-sm text-gray-700 dark:text-gray-300">{loadError}</p>
                </div>
              ) : isLoading ? (
                <CadastroListLoading message="Carregando tipos de serviço..." />
              ) : rows.length === 0 ? (
                <CadastroListEmpty
                  icon={Wrench}
                  title="Nenhum tipo de serviço encontrado"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Cadastre um novo tipo de serviço para começar'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={1}
                    endItem={rows.length}
                    total={rows.length}
                    itemLabel="tipo"
                    itemLabelPlural="tipos"
                  />
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={`${cadastroListClasses.th} w-14 whitespace-nowrap !px-2 sm:!px-3`}>
                            ID
                          </th>
                          <th className={`${cadastroListClasses.th} !pl-2 sm:!pl-3`}>Nome</th>
                          <th className={`${cadastroListClasses.th} w-28`}>Código</th>
                          <th className={cadastroListClasses.th}>Descrição</th>
                          <th className={`${cadastroListClasses.thCenter} w-28`}>Status</th>
                          <th className={cadastroListClasses.thRight}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {rows.map((row, index) => (
                          <tr
                            key={row.id}
                            role="button"
                            tabIndex={0}
                            className={listTableRowClasses.trNavigable}
                            onClick={() => openView(row)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openView(row);
                              }
                            }}
                          >
                            <td className={`${cadastroListClasses.tdMono} w-14 !px-2 sm:!px-3`}>
                              {formatCadastroListId(null, index + 1)}
                            </td>
                            <td className={`${cadastroListClasses.tdTruncate} !pl-2 sm:!pl-3`}>
                              <ListRowNavigableLabel className="block truncate">
                                {row.name}
                              </ListRowNavigableLabel>
                            </td>
                            <td className={cadastroListClasses.tdMuted}>{row.code || '—'}</td>
                            <td className={cadastroListClasses.tdTruncate}>
                              <span className="block truncate text-sm text-gray-600 dark:text-gray-400">
                                {row.description || '—'}
                              </span>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  row.isActive
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                }`}
                              >
                                {row.isActive ? 'Ativo' : 'Inativo'}
                              </span>
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(row.id)}
                              onToggle={(e) =>
                                toggleRowActionMenu(row.id, e.currentTarget as HTMLButtonElement)
                              }
                            />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {rowActionMenu && rowForActionMenu ? (
                <RowActionMenuPortal
                  menu={rowActionMenu}
                  onClose={closeRowActionMenu}
                  onEdit={() => openEdit(rowForActionMenu)}
                  onDelete={() => setDeleteTarget(rowForActionMenu)}
                  extraItems={[
                    {
                      label: rowForActionMenu.isActive ? 'Desativar' : 'Ativar',
                      icon: <Power className="h-4 w-4 shrink-0" />,
                      tone: rowForActionMenu.isActive ? 'danger' : 'success',
                      onClick: () =>
                        toggleActiveMutation.mutate({
                          id: rowForActionMenu.id,
                          isActive: !rowForActionMenu.isActive
                        })
                    }
                  ]}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        {showForm ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={requestCloseForm} />
            <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editing ? 'Editar Tipo de Serviço' : 'Novo Tipo de Serviço'}
                </h2>
                <button
                  type="button"
                  onClick={requestCloseForm}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 p-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nome *
                  </label>
                  <input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex.: Elétrica predial"
                    className={FORM_FIELD_INPUT_CLS}
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Código
                  </label>
                  <input
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="Ex.: ELE"
                    className={FORM_FIELD_INPUT_CLS}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Descrição
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descreva o tipo de serviço..."
                    className={FORM_FIELD_TEXTAREA_CLS}
                    rows={3}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Checklist do tipo de serviço
                  </label>
                  <textarea
                    value={formData.checklistText}
                    onChange={(e) => setFormData({ ...formData, checklistText: e.target.value })}
                    placeholder={'Um item por linha\nEx.: Verificar filtros\nEx.: Medir corrente'}
                    className={FORM_FIELD_TEXTAREA_CLS}
                    rows={5}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Copiado para a OS na abertura. Evita checklist genérico ou vazio.
                  </p>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    onClick={requestCloseForm}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </AppModalOverlay>
        ) : null}

        {viewing ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setViewing(null)} />
            <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Detalhes do Tipo de Serviço
                </h2>
                <button
                  type="button"
                  onClick={() => setViewing(null)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 p-6">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Nome
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{viewing.name}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Código
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{viewing.code || '—'}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Descrição
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {viewing.description || '—'}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Checklist
                  </p>
                  {viewing.checklistItems && viewing.checklistItems.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-5 text-sm text-gray-900 dark:text-gray-100">
                      {viewing.checklistItems.map((item) => (
                        <li key={item.id}>{item.label}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-900 dark:text-gray-100">—</p>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Status
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {viewing.isActive ? 'Ativo' : 'Inativo'}
                  </p>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setViewing(null)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}

        {deleteTarget ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
                Excluir {deleteTarget.name}?
              </h3>
              <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(deleteTarget.id)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}

        {formConfirmUi}
      </MainLayout>
    </ProtectedRoute>
  );
}
