'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, FileImage, Trash2, Pencil, Search, MoreVertical, Eye, Calculator, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';

interface RelatorioEntry {
  id: string;
  titulo: string;
  createdAt: string;
  updatedAt: string;
}

interface Contract {
  id: string;
  name: string;
  number: string;
}

interface EmployeeOption {
  id: string;
  name: string;
}

interface CamposData {
  contrato: string;
  os: string;
  unidade: string;
  tipo: string;
  solicitante: string;
  os2: string;
  lote: string;
}

interface RelatorioFotograficoBody {
  campos: CamposData;
  logo: string | null;
  croqui: string | null;
  localizacao: string | null;
  fotos: { id: string; src: string | null; titulo: string; desc: string }[];
}

interface RelatorioFotograficoGetRes {
  success: boolean;
  data: RelatorioFotograficoBody;
}

interface RelatorioActionMenuState {
  relatorioId: string;
  titulo: string;
  top: number;
  left: number;
}

const RELATORIO_MENU_WIDTH_PX = 224;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ContratoRelatoriosPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const rawId = params?.id;
  const contractId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] ?? '' : '';

  const [novoTitulo, setNovoTitulo] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editarModalOpen, setEditarModalOpen] = useState(false);
  const [editarRelatorioId, setEditarRelatorioId] = useState<string | null>(null);
  const [editarTitulo, setEditarTitulo] = useState('');
  const [editarCampos, setEditarCampos] = useState<CamposData>({
    contrato: '',
    os: '',
    unidade: '',
    tipo: 'Relatório Fotográfico',
    solicitante: '',
    os2: '',
    lote: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [relatorioActionMenu, setRelatorioActionMenu] = useState<RelatorioActionMenuState | null>(null);
  const [novoCampos, setNovoCampos] = useState<CamposData>({
    contrato: '',
    os: '',
    unidade: '',
    tipo: 'Relatório Fotográfico',
    solicitante: '',
    os2: '',
    lote: '',
  });
  const [novoSolicitanteOpen, setNovoSolicitanteOpen] = useState(false);
  const [editarSolicitanteOpen, setEditarSolicitanteOpen] = useState(false);
  const [novoSolicitanteSearch, setNovoSolicitanteSearch] = useState('');
  const [editarSolicitanteSearch, setEditarSolicitanteSearch] = useState('');
  const novoSolicitanteRef = useRef<HTMLDivElement>(null);
  const editarSolicitanteRef = useRef<HTMLDivElement>(null);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => (await api.get(`/contracts/${contractId}`)).data,
    enabled: !!contractId,
  });

  const { data: relatoriosData, isLoading: loadingRelatorios } = useQuery({
    queryKey: ['relatorios-fotograficos', contractId],
    queryFn: async () => (await api.get(`/relatorios-fotograficos/${contractId}`)).data,
    enabled: !!contractId,
  });

  const { data: employeesData } = useQuery({
    queryKey: ['report-employee-options'],
    queryFn: async () => {
      const res = await api.get('/users', {
        params: { page: 1, limit: 10000, status: 'all' },
      });
      return res.data;
    },
    retry: false,
  });

  const employeeOptions = useMemo<EmployeeOption[]>(() => {
    const list = Array.isArray(employeesData?.data) ? employeesData.data : [];
    return list
      .map((u: any) => ({ id: String(u.id), name: String(u.name || '').trim() }))
      .filter((u: EmployeeOption) => !!u.id && !!u.name)
      .sort((a: EmployeeOption, b: EmployeeOption) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [employeesData]);

  const filteredNovoSolicitantes = useMemo(() => {
    const q = novoSolicitanteSearch.trim().toLowerCase();
    if (!q) return employeeOptions;
    return employeeOptions.filter((u) => u.name.toLowerCase().includes(q));
  }, [employeeOptions, novoSolicitanteSearch]);

  const filteredEditarSolicitantes = useMemo(() => {
    const q = editarSolicitanteSearch.trim().toLowerCase();
    if (!q) return employeeOptions;
    return employeeOptions.filter((u) => u.name.toLowerCase().includes(q));
  }, [employeeOptions, editarSolicitanteSearch]);

  const criarMutation = useMutation({
    mutationFn: async (payload: { titulo: string; campos: CamposData }) =>
      (await api.post(`/relatorios-fotograficos/${contractId}`, payload)).data,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['relatorios-fotograficos', contractId] });
      setNovoTitulo('');
      setCreateModalOpen(false);
      toast.success('Relatório criado!');
      router.push(`/ponto/contratos/${contractId}/relatorios/${res.data.id}`);
    },
    onError: () => toast.error('Erro ao criar relatório.'),
  });

  const { data: relatorioEditarRes, isLoading: loadingRelatorioEditar } = useQuery({
    queryKey: ['relatorio-fotografico', contractId, editarRelatorioId],
    queryFn: async () => (await api.get<RelatorioFotograficoGetRes>(`/relatorios-fotograficos/${contractId}/${editarRelatorioId}`)).data,
    enabled: !!contractId && !!editarRelatorioId && editarModalOpen,
  });
  const relatorioEditarBody = relatorioEditarRes?.data;

  const editarRelatorioMutation = useMutation({
    mutationFn: async (base: RelatorioFotograficoBody) => {
      if (!editarRelatorioId) return;
      const titulo = editarTitulo.trim();
      if (!titulo) throw new Error('Título é obrigatório');
      await api.put(`/relatorios-fotograficos/${contractId}/${editarRelatorioId}`, {
        data: { ...base, campos: editarCampos },
        titulo,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relatorios-fotograficos', contractId] });
      queryClient.invalidateQueries({ queryKey: ['relatorio-fotografico', contractId] });
      setEditarModalOpen(false);
      setEditarRelatorioId(null);
      toast.success('Relatório atualizado!');
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Título é obrigatório' || msg === 'Dados não carregados') toast.error(msg);
      else toast.error('Erro ao salvar alterações.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      api.delete(`/relatorios-fotograficos/${contractId}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relatorios-fotograficos', contractId] });
      toast.success('Relatório excluído.');
    },
    onError: () => toast.error('Erro ao excluir.'),
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const contract = contractData?.data as Contract | undefined;
  const relatorios: RelatorioEntry[] = relatoriosData?.data ?? [];
  const relatoriosFiltrados = relatorios.filter((r) =>
    r.titulo.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  useEffect(() => {
    if (!contract?.name) return;
    setNovoCampos((prev) => (prev.contrato ? prev : { ...prev, contrato: contract.name }));
  }, [contract?.name]);

  useEffect(() => {
    const b = relatorioEditarBody;
    if (!b || !editarModalOpen) return;
    setEditarCampos(b.campos);
  }, [relatorioEditarBody, editarModalOpen]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (novoSolicitanteRef.current && !novoSolicitanteRef.current.contains(t)) {
        setNovoSolicitanteOpen(false);
      }
      if (editarSolicitanteRef.current && !editarSolicitanteRef.current.contains(t)) {
        setEditarSolicitanteOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const abrirModalCriacao = () => {
    setNovoTitulo('');
    setNovoCampos({
      contrato: contract?.name || '',
      os: '',
      unidade: '',
      tipo: 'Relatório Fotográfico',
      solicitante: '',
      os2: '',
      lote: '',
    });
    setNovoSolicitanteSearch('');
    setNovoSolicitanteOpen(false);
    setCreateModalOpen(true);
  };

  const confirmarCriacao = () => {
    const titulo = novoTitulo.trim();
    if (!titulo) {
      toast.error('Informe o título do relatório.');
      return;
    }
    criarMutation.mutate({ titulo, campos: novoCampos });
  };

  const abrirModalEdicao = (id: string, titulo: string) => {
    setEditarRelatorioId(id);
    setEditarTitulo(titulo);
    setEditarSolicitanteSearch('');
    setEditarSolicitanteOpen(false);
    setEditarModalOpen(true);
  };

  const confirmarEdicao = () => {
    if (!editarTitulo.trim()) {
      toast.error('Informe o título do relatório.');
      return;
    }
    if (!relatorioEditarBody) {
      toast.error('Aguarde o carregamento dos dados do relatório.');
      return;
    }
    editarRelatorioMutation.mutate(relatorioEditarBody);
  };

  if (!contractId || loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          {/* Header de página: Voltar à esquerda, título/subtítulo centralizado */}
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
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl break-words">
                {loadingContract ? 'Carregando contrato…' : contract?.name || 'Relatórios'}
              </h1>
              <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
                Relatórios Fotográficos
              </p>
            </div>
          </div>

          <Card className="w-full shadow-none">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center space-x-3">
                  <div className="rounded-lg bg-blue-100 p-2 sm:p-3 dark:bg-blue-900/30">
                    <FileImage className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Relatórios</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Gestão de relatórios fotográficos do contrato.
                    </p>
                  </div>
                </div>
                <div className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                  {!loadingRelatorios && relatorios.length > 0 && (
                    <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar relatório..."
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={abrirModalCriacao}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Novo Relatório
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>

              {!loadingRelatorios && relatorios.length > 0 && (
                <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <span>
                    Mostrando {relatoriosFiltrados.length > 0 ? 1 : 0} a {relatoriosFiltrados.length} de{' '}
                    {relatoriosFiltrados.length} {relatoriosFiltrados.length === 1 ? 'relatório' : 'relatórios'}
                  </span>
                  <span>Página 1 de 1</span>
                </div>
              )}

              {loadingRelatorios ? (
                <div className="mt-4">
                  <Loading message="Carregando relatórios..." size="md" />
                </div>
              ) : relatoriosFiltrados.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 py-12 text-center text-gray-500 dark:text-gray-400">
                  {relatorios.length === 0
                    ? 'Nenhum relatório fotográfico criado ainda.'
                    : 'Nenhum relatório encontrado para esta busca.'}
                </div>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Relatório
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
                      {relatoriosFiltrados.map((r) => (
                        <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800/80 last:border-0">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-md bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
                                <FileImage className="w-4 h-4 text-red-600 dark:text-red-400" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{r.titulo}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                            {formatDate(r.updatedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const bounds = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                    setRelatorioActionMenu((prev) => {
                                      if (prev?.relatorioId === r.id) return null;
                                      let left = bounds.right - RELATORIO_MENU_WIDTH_PX;
                                      left = Math.max(
                                        8,
                                        Math.min(left, window.innerWidth - RELATORIO_MENU_WIDTH_PX - 8)
                                      );
                                      return { relatorioId: r.id, titulo: r.titulo, top: bounds.bottom + 4, left };
                                    });
                                  }}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                                  aria-label="Menu de ações"
                                  aria-expanded={relatorioActionMenu?.relatorioId === r.id}
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
              {relatorioActionMenu &&
                typeof document !== 'undefined' &&
                createPortal(
                  <>
                    <div
                      className="fixed inset-0 z-[200]"
                      aria-hidden
                      onClick={() => setRelatorioActionMenu(null)}
                    />
                    <div
                      role="menu"
                      className="fixed z-[201] w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                      style={{ top: relatorioActionMenu.top, left: relatorioActionMenu.left }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          const id = relatorioActionMenu.relatorioId;
                          setRelatorioActionMenu(null);
                          router.push(`/ponto/contratos/${contractId}/relatorios/${id}`);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                        <span>Ver detalhes</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          const { relatorioId, titulo } = relatorioActionMenu;
                          setRelatorioActionMenu(null);
                          abrirModalEdicao(relatorioId, titulo);
                        }}
                        className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Pencil className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-300" />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          const { relatorioId, titulo } = relatorioActionMenu;
                          setRelatorioActionMenu(null);
                          if (confirm(`Excluir "${titulo}"? Esta ação não pode ser desfeita.`)) {
                            deleteMutation.mutate(relatorioId);
                          }
                        }}
                        className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                        <span>Excluir</span>
                      </button>
                    </div>
                  </>,
                  document.body
                )}
            </CardContent>
          </Card>
        </div>
        <Modal
          isOpen={createModalOpen}
          onClose={() => !criarMutation.isPending && setCreateModalOpen(false)}
          title="Criar novo relatório fotográfico"
          size="lg"
          closeOnOverlayClick={!criarMutation.isPending}
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Título do relatório *
              </label>
              <input
                type="text"
                value={novoTitulo}
                onChange={(e) => setNovoTitulo(e.target.value)}
                placeholder="Ex: Relatório Fotográfico - OS 001/2025"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                disabled={criarMutation.isPending}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  { key: 'contrato' as const, label: 'Contrato nº' },
                  { key: 'os' as const, label: 'Ordem de Serviço nº' },
                  { key: 'unidade' as const, label: 'Unidade' },
                  { key: 'tipo' as const, label: 'Tipo de Relatório' },
                  { key: 'os2' as const, label: 'OS Secundária' },
                  { key: 'lote' as const, label: 'Lote' },
                ] as const
              ).map(({ key, label }) => (
                <div key={key} className={key === 'tipo' ? 'sm:col-span-2' : ''}>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
                  <input
                    type="text"
                    value={novoCampos[key]}
                    onChange={(e) => setNovoCampos((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    disabled={criarMutation.isPending}
                  />
                </div>
              ))}
              <div className="sm:col-span-2" ref={novoSolicitanteRef}>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Solicitante</label>
                <button
                  type="button"
                  onClick={() => setNovoSolicitanteOpen((v) => !v)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm text-gray-900 shadow-sm transition focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  disabled={criarMutation.isPending}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={novoCampos.solicitante ? '' : 'text-gray-400 dark:text-gray-500'}>
                      {novoCampos.solicitante || 'Selecionar funcionário...'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </span>
                </button>
                {novoSolicitanteOpen && (
                  <div className="relative">
                    <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                      <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                          <input
                            type="text"
                            value={novoSolicitanteSearch}
                            onChange={(e) => setNovoSolicitanteSearch(e.target.value)}
                            placeholder="Pesquisar funcionário..."
                            className="h-9 w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                          />
                        </div>
                      </div>
                      <div className="max-h-52 overflow-y-auto py-1">
                        <button
                          type="button"
                          onClick={() => {
                            setNovoCampos((prev) => ({ ...prev, solicitante: '' }));
                            setNovoSolicitanteOpen(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          Limpar seleção
                        </button>
                        {filteredNovoSolicitantes.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setNovoCampos((prev) => ({ ...prev, solicitante: opt.name }));
                              setNovoSolicitanteOpen(false);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700"
                          >
                            {opt.name}
                          </button>
                        ))}
                        {filteredNovoSolicitantes.length === 0 && (
                          <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                            Nenhum funcionário encontrado.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                disabled={criarMutation.isPending}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarCriacao}
                disabled={criarMutation.isPending}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-70"
              >
                {criarMutation.isPending ? 'Criando...' : 'Criar relatório'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={editarModalOpen}
          onClose={() => {
            if (!editarRelatorioMutation.isPending) {
              setEditarModalOpen(false);
              setEditarRelatorioId(null);
            }
          }}
          title="Editar relatório fotográfico"
          size="lg"
          closeOnOverlayClick={!editarRelatorioMutation.isPending}
        >
          {loadingRelatorioEditar ? (
            <div className="py-12">
              <Loading message="Carregando dados…" size="md" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Título do relatório *
                </label>
                <input
                  type="text"
                  value={editarTitulo}
                  onChange={(e) => setEditarTitulo(e.target.value)}
                  placeholder="Ex: Relatório Fotográfico - OS 001/2025"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  disabled={editarRelatorioMutation.isPending}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(
                  [
                    { key: 'contrato' as const, label: 'Contrato nº' },
                    { key: 'os' as const, label: 'Ordem de Serviço nº' },
                    { key: 'unidade' as const, label: 'Unidade' },
                    { key: 'tipo' as const, label: 'Tipo de Relatório' },
                    { key: 'os2' as const, label: 'OS Secundária' },
                    { key: 'lote' as const, label: 'Lote' },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key} className={key === 'tipo' ? 'sm:col-span-2' : ''}>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
                    <input
                      type="text"
                      value={editarCampos[key]}
                      onChange={(e) => setEditarCampos((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      disabled={editarRelatorioMutation.isPending}
                    />
                  </div>
                ))}
                <div className="sm:col-span-2" ref={editarSolicitanteRef}>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Solicitante</label>
                  <button
                    type="button"
                    onClick={() => setEditarSolicitanteOpen((v) => !v)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm text-gray-900 shadow-sm transition focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    disabled={editarRelatorioMutation.isPending}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={editarCampos.solicitante ? '' : 'text-gray-400 dark:text-gray-500'}>
                        {editarCampos.solicitante || 'Selecionar funcionário...'}
                      </span>
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    </span>
                  </button>
                  {editarSolicitanteOpen && (
                    <div className="relative">
                      <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                        <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                            <input
                              type="text"
                              value={editarSolicitanteSearch}
                              onChange={(e) => setEditarSolicitanteSearch(e.target.value)}
                              placeholder="Pesquisar funcionário..."
                              className="h-9 w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                            />
                          </div>
                        </div>
                        <div className="max-h-52 overflow-y-auto py-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditarCampos((prev) => ({ ...prev, solicitante: '' }));
                              setEditarSolicitanteOpen(false);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            Limpar seleção
                          </button>
                          {filteredEditarSolicitantes.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setEditarCampos((prev) => ({ ...prev, solicitante: opt.name }));
                                setEditarSolicitanteOpen(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700"
                            >
                              {opt.name}
                            </button>
                          ))}
                          {filteredEditarSolicitantes.length === 0 && (
                            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                              Nenhum funcionário encontrado.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    if (!editarRelatorioMutation.isPending) {
                      setEditarModalOpen(false);
                      setEditarRelatorioId(null);
                    }
                  }}
                  disabled={editarRelatorioMutation.isPending}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarEdicao}
                  disabled={editarRelatorioMutation.isPending || !relatorioEditarBody}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-70"
                >
                  {editarRelatorioMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
