'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, History, Trash2, Search, MoreVertical, Eye, Settings2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { getListTableRowClassName, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { ReuniaoFormModal, type ReuniaoListPatch } from '@/components/contract/ReuniaoFormModal';

interface ReuniaoEntry {
  id: string;
  data: string;
  responsavelPreenchimento: string;
  nome: string;
  createdAt: string;
  updatedAt: string;
}

interface Contract {
  id: string;
  name: string;
  number: string;
}

interface ReuniaoActionMenuState {
  reuniaoId: string;
  top: number;
  left: number;
}

const REUNIAO_MENU_WIDTH_PX = 224;

function formatDateTime(iso: string) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(ymd: string) {
  if (!ymd) return '-';
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '-';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export default function ContratoReunioesPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const rawId = params?.id;
  const contractId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] ?? '' : '';

  const [searchTerm, setSearchTerm] = useState('');
  const [reuniaoActionMenu, setReuniaoActionMenu] = useState<ReuniaoActionMenuState | null>(null);
  const [modalReuniaoId, setModalReuniaoId] = useState<string | null>(null);
  /** Overlay local da lista enquanto o modal está aberto (atualização em tempo real) */
  const [listOverrides, setListOverrides] = useState<Record<string, ReuniaoListPatch>>({});

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => (await api.get(`/contracts/${contractId}`)).data,
    enabled: !!contractId,
  });

  const { data: reunioesData, isLoading: loadingReunioes } = useQuery({
    queryKey: ['reunioes', contractId],
    queryFn: async () => (await api.get(`/reunioes/${contractId}`)).data,
    enabled: !!contractId,
  });

  // Abre modal via ?open=id (links antigos / redirect da página de detalhe)
  useEffect(() => {
    const openId = searchParams?.get('open');
    if (openId) {
      setModalReuniaoId(openId);
      router.replace(`/ponto/contratos/${contractId}/reunioes`, { scroll: false });
    }
  }, [searchParams, contractId, router]);

  const criarMutation = useMutation({
    mutationFn: async () => (await api.post(`/reunioes/${contractId}`)).data,
    onSuccess: (res) => {
      const entry = res.data as ReuniaoEntry;
      queryClient.setQueryData(['reunioes', contractId], (old: { data?: ReuniaoEntry[] } | undefined) => {
        const list = Array.isArray(old?.data) ? old!.data : [];
        return { success: true, data: [entry, ...list.filter((r) => r.id !== entry.id)] };
      });
      queryClient.invalidateQueries({ queryKey: ['reunioes', contractId] });
      setModalReuniaoId(entry.id);
      toast.success('Reunião criada!');
    },
    onError: () => toast.error('Erro ao criar reunião.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/reunioes/${contractId}/${id}`),
    onSuccess: (_res, id) => {
      if (modalReuniaoId === id) setModalReuniaoId(null);
      setListOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['reunioes', contractId] });
      toast.success('Reunião excluída.');
    },
    onError: () => toast.error('Erro ao excluir.'),
  });

  const handleListPatch = useCallback((reuniaoId: string, patch: ReuniaoListPatch) => {
    setListOverrides((prev) => ({ ...prev, [reuniaoId]: patch }));
    queryClient.setQueryData(['reunioes', contractId], (old: { data?: ReuniaoEntry[] } | undefined) => {
      if (!old?.data) return old;
      return {
        ...old,
        data: old.data.map((r) =>
          r.id === reuniaoId
            ? {
                ...r,
                data: patch.data,
                responsavelPreenchimento: patch.responsavelPreenchimento,
                nome: patch.nome,
                updatedAt: patch.updatedAt,
              }
            : r
        ),
      };
    });
  }, [contractId, queryClient]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const openReuniao = (id: string) => {
    setReuniaoActionMenu(null);
    setModalReuniaoId(id);
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const contract = contractData?.data as Contract | undefined;
  const reunioesRaw: ReuniaoEntry[] = (reunioesData?.data ?? []).map(
    (r: ReuniaoEntry & { contrato?: string }) => ({
      ...r,
      nome: r.nome || r.contrato || '',
    })
  );
  const reunioes = reunioesRaw.map((r) => {
    const ov = listOverrides[r.id];
    return ov
      ? {
          ...r,
          data: ov.data,
          responsavelPreenchimento: ov.responsavelPreenchimento,
          nome: ov.nome,
          updatedAt: ov.updatedAt,
        }
      : r;
  });
  const q = searchTerm.trim().toLowerCase();
  const reunioesFiltradas = reunioes.filter(
    (r) =>
      !q ||
      (r.nome || '').toLowerCase().includes(q) ||
      r.responsavelPreenchimento.toLowerCase().includes(q)
  );

  if (!contractId || loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
            <Link
              href={`/ponto/contratos/${contractId}`}
              aria-label="Voltar ao contrato"
              className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              Voltar
            </Link>
            <div className="w-full max-w-3xl px-14 text-center sm:px-20">
              <h1 className="break-words text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
                {loadingContract ? 'Carregando contrato…' : contract?.name || 'Histórico de Reuniões'}
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                Histórico de Reuniões
              </p>
            </div>
          </div>

          <Card className="w-full shadow-none">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center space-x-3">
                  <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30 sm:p-3">
                    <History className="h-5 w-5 text-indigo-600 dark:text-indigo-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Histórico de Reuniões
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Acompanhamento das reuniões de acompanhamento do contrato.
                    </p>
                  </div>
                </div>
                <div className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                  {!loadingReunioes && reunioes.length > 0 && (
                    <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por título ou responsável..."
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                    </div>
                  )}
                  <Link
                    href={`/ponto/contratos/${contractId}/reunioes/configurar`}
                    title="Editar formulário"
                    aria-label="Editar formulário"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => criarMutation.mutate()}
                    disabled={criarMutation.isPending}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-70"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    {criarMutation.isPending ? 'Criando...' : 'Nova Reunião'}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!loadingReunioes && reunioes.length > 0 && (
                <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <span>
                    Mostrando {reunioesFiltradas.length > 0 ? 1 : 0} a {reunioesFiltradas.length} de{' '}
                    {reunioesFiltradas.length}{' '}
                    {reunioesFiltradas.length === 1 ? 'reunião' : 'reuniões'}
                  </span>
                  <span>Página 1 de 1</span>
                </div>
              )}

              {loadingReunioes ? (
                <div className="mt-4">
                  <Loading message="Carregando reuniões..." size="md" />
                </div>
              ) : reunioesFiltradas.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-gray-300 py-12 text-center text-gray-500 dark:border-gray-600 dark:text-gray-400">
                  {reunioes.length === 0
                    ? 'Nenhuma reunião registrada ainda.'
                    : 'Nenhuma reunião encontrada para esta busca.'}
                </div>
              ) : (
                <div className="mt-3 table-scroll">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Título
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Responsável
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Data da reunião
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Atualizado
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Ação
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {reunioesFiltradas.map((r) => (
                        <tr
                          key={r.id}
                          onClick={() => openReuniao(r.id)}
                          className={`border-b border-gray-100 last:border-0 dark:border-gray-800/80 ${getListTableRowClassName(true)} ${
                            modalReuniaoId === r.id ? 'bg-red-50/50 dark:bg-red-950/20' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <ListRowNavigableLabel className="truncate font-medium">
                              {r.nome || 'Reunião sem título'}
                            </ListRowNavigableLabel>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">
                            {r.responsavelPreenchimento || '-'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">
                            {formatDateOnly(r.data)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">
                            {formatDateTime(r.updatedAt)}
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const bounds = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  setReuniaoActionMenu((prev) => {
                                    if (prev?.reuniaoId === r.id) return null;
                                    let left = bounds.right - REUNIAO_MENU_WIDTH_PX;
                                    left = Math.max(
                                      8,
                                      Math.min(left, window.innerWidth - REUNIAO_MENU_WIDTH_PX - 8)
                                    );
                                    return { reuniaoId: r.id, top: bounds.bottom + 4, left };
                                  });
                                }}
                                className={rowActionMenuButtonClass(reuniaoActionMenu?.reuniaoId === r.id)}
                                aria-label="Menu de ações"
                                aria-expanded={reuniaoActionMenu?.reuniaoId === r.id}
                                aria-haspopup="menu"
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
              )}
              {reuniaoActionMenu && (
                <ActionMenuOverlay
                  open
                  onClose={() => setReuniaoActionMenu(null)}
                  top={reuniaoActionMenu.top}
                  left={reuniaoActionMenu.left}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      openReuniao(reuniaoActionMenu.reuniaoId);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span>Abrir formulário</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      const { reuniaoId } = reuniaoActionMenu;
                      setReuniaoActionMenu(null);
                      if (confirm('Excluir esta reunião? Esta ação não pode ser desfeita.')) {
                        deleteMutation.mutate(reuniaoId);
                      }
                    }}
                    className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>Excluir</span>
                  </button>
                </ActionMenuOverlay>
              )}
            </CardContent>
          </Card>
        </div>

        <ReuniaoFormModal
          isOpen={!!modalReuniaoId}
          onClose={() => setModalReuniaoId(null)}
          contractId={contractId}
          reuniaoId={modalReuniaoId}
          onListPatch={handleListPatch}
        />
      </MainLayout>
    </ProtectedRoute>
  );
}
