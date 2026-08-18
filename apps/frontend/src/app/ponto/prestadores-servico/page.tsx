'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Truck, Plus, Search, X, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { CadastroListEmpty, CadastroListLoading, CadastroListSummary, formatCadastroListId } from '@/components/ui/CadastroListSummary';
import { RowActionMenuCell, RowActionMenuPortal, cadastroListClasses, listTableRowClasses } from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useEspelhoNfBootstrap } from '@/hooks/useEspelhoNfBootstrap';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

interface ServiceProviderRow {
  id: string;
  cnpj?: string;
  municipalRegistration?: string;
  stateRegistration?: string;
  corporateName: string;
  tradeName?: string;
  address?: string;
  city?: string;
  state?: string;
  email?: string | null;
}

function emptyForm() {
  return {
    cnpj: '',
    municipalRegistration: '',
    stateRegistration: '',
    corporateName: '',
    tradeName: '',
    address: '',
    city: '',
    state: '',
    email: ''
  };
}

export default function PrestadoresEspelhoNfPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ServiceProviderRow | null>(null);
  const [formData, setFormData] = useState(() => emptyForm());
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);

  const closeProviderForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
  }, []);

  const { requestClose: requestCloseProviderForm, confirmUi: providerFormConfirmUi } =
    useModalCloseConfirm(closeProviderForm, { isParentOpen: showForm });

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

  const { data: bootstrap, isLoading, isError, error } = useEspelhoNfBootstrap();

  const providers = useMemo(() => {
    const list = (bootstrap?.providers ?? []) as ServiceProviderRow[];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => {
      const blob = [
        p.corporateName,
        p.tradeName,
        p.cnpj,
        p.city,
        p.state,
        p.email ?? ''
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [bootstrap?.providers, searchTerm]);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen
  } = useRowActionMenu(providers);

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const res = await api.post('/espelho-nf/service-providers', body);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['espelho-nf-bootstrap'] });
      setShowForm(false);
      setFormData(emptyForm());
      toast.success('Prestador cadastrado.');
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao cadastrar.');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, string> }) => {
      const res = await api.patch(`/espelho-nf/service-providers/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['espelho-nf-bootstrap'] });
      setShowForm(false);
      setEditing(null);
      setFormData(emptyForm());
      toast.success('Prestador atualizado.');
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/espelho-nf/service-providers/${id}`);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['espelho-nf-bootstrap'] });
      setShowDeleteModal(null);
      toast.success('Prestador excluído.');
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao excluir.');
    }
  });

  const openNew = () => {
    setEditing(null);
    setFormData(emptyForm());
    setShowForm(true);
  };

  const openEdit = (p: ServiceProviderRow) => {
    setEditing(p);
    setFormData({
      cnpj: p.cnpj ?? '',
      municipalRegistration: p.municipalRegistration ?? '',
      stateRegistration: p.stateRegistration ?? '',
      corporateName: p.corporateName ?? '',
      tradeName: p.tradeName ?? '',
      address: p.address ?? '',
      city: p.city ?? '',
      state: p.state ?? '',
      email: p.email ?? ''
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.corporateName.trim()) {
      toast.error('Razão Social é obrigatória.');
      return;
    }
    const payload = { ...formData };
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
      'Não foi possível carregar os prestadores.');
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/prestadores-servico">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Prestadores de Serviço
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Cadastro auxiliar usado ao montar o espelho de nota fiscal.
            </p>
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <Truck className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Prestadores de Serviço</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {isError ? 'Erro ao carregar.' : `${providers.length} registro(s)`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Pesquisar..."
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
                    onClick={openNew}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Novo Prestador de Serviço
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
                <CadastroListLoading message="Carregando prestadores..." />
              ) : providers.length === 0 ? (
                <CadastroListEmpty
                  icon={Truck}
                  title="Nenhum prestador de serviço encontrado"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Cadastre um novo prestador para começar'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={1}
                    endItem={providers.length}
                    total={providers.length}
                    itemLabel="prestador"
                    itemLabelPlural="prestadores"
                  />
                <div className="table-scroll">
                  <table className={cadastroListClasses.table}>
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className={cadastroListClasses.th}>ID</th>
                        <th className={cadastroListClasses.th}>Razão Social</th>
                        <th className={cadastroListClasses.th}>CNPJ</th>
                        <th className={cadastroListClasses.th}>Cidade / UF</th>
                        <th className={cadastroListClasses.th}>Nome Fantasia</th>
                        <th className={cadastroListClasses.thRight}>Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {providers.map((p, index) => (
                          <tr key={p.id} className={listTableRowClasses.tr}>
                            <td className={cadastroListClasses.tdMono}>
                              {formatCadastroListId(null, index + 1)}
                            </td>
                            <td className="min-w-0 px-3 py-4 sm:px-6">
                              <span className="text-sm text-gray-900 dark:text-gray-100 block truncate">
                                {p.corporateName}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-400 sm:px-6">
                              {p.cnpj || '—'}
                            </td>
                            <td className="min-w-0 px-3 py-4 text-sm text-gray-600 dark:text-gray-400 sm:px-6">
                              <span className="block truncate">
                                {[p.city, p.state].filter(Boolean).join(' / ') || '—'}
                              </span>
                            </td>
                            <td className="min-w-0 px-3 py-4 sm:px-6">
                              <span className="block truncate text-sm text-gray-600 dark:text-gray-400">
                                {p.tradeName || '—'}
                              </span>
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(p.id)}
                              onToggle={(e) =>
                                toggleRowActionMenu(p.id, e.currentTarget as HTMLButtonElement)
                              }
                            />
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
              {rowActionMenu && rowForActionMenu && (
                <RowActionMenuPortal
                  menu={rowActionMenu}
                  onClose={closeRowActionMenu}
                  onEdit={() => openEdit(rowForActionMenu)}
                  onDelete={() => setShowDeleteModal(rowForActionMenu.id)}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {showForm ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={requestCloseProviderForm}
            />
            <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editing ? 'Editar Prestador de Serviço' : 'Novo Prestador de Serviço'}
                </h2>
                <button
                  type="button"
                  onClick={requestCloseProviderForm}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 p-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Razão Social *
                  </label>
                  <input
                    value={formData.corporateName}
                    onChange={(e) => setFormData({ ...formData, corporateName: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nome Fantasia
                  </label>
                  <input
                    value={formData.tradeName}
                    onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">CNPJ</label>
                    <input
                      value={formData.cnpj}
                      onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">E-mail</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Inscrição Municipal
                    </label>
                    <input
                      value={formData.municipalRegistration}
                      onChange={(e) => setFormData({ ...formData, municipalRegistration: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Inscrição Estadual
                    </label>
                    <input
                      value={formData.stateRegistration}
                      onChange={(e) => setFormData({ ...formData, stateRegistration: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Endereço</label>
                  <input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Cidade</label>
                    <input
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">UF</label>
                    <input
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      maxLength={2}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
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
                    onClick={requestCloseProviderForm}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </AppModalOverlay>
        ) : null}

        {providerFormConfirmUi}

        {showDeleteModal ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteModal(null)} />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
                Excluir Prestador de Serviço?
              </h3>
              <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
                Não é possível excluir se houver espelho de nota fiscal vinculado.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(showDeleteModal)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}
      </MainLayout>
    </ProtectedRoute>
  );
}
