'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  Trash2,
  Search,
  MoreVertical,
  Eye,
  ClipboardList,
  Settings2,
  PenLine,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { textMatchesSearch } from '@/lib/normalizeSearchText';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { getListTableRowClassName, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { ReuniaoFormModal, type ReuniaoListPatch } from '@/components/contract/ReuniaoFormModal';
import { entryMonthLabel, formatMonthLabel, getIsoMonthKey } from '@/lib/monthPeriod';
import { entryWeekLabel, formatWeekLabel, getFortnightKey } from '@/lib/weekPeriod';
import type { AcompanhamentoKind } from '@/lib/acompanhamentoTypes';

export type { AcompanhamentoKind };

interface ReuniaoEntry {
  id: string;
  data: string;
  responsavelPreenchimento: string;
  nome: string;
  monthKey?: string;
  weekKey?: string;
  formularioName?: string;
  formularioDescription?: string;
  createdAt: string;
  updatedAt: string;
}

interface FormularioOption {
  id: string;
  name: string;
  description?: string;
}

interface ContractConfig {
  formularioId: string;
  formularioName: string;
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

export interface ContratoAcompanhamentoListConfig {
  kind: AcompanhamentoKind;
  pageTitle: string;
  sectionTitle: string;
  sectionDescription: string;
  Icon: LucideIcon;
  periodColumnLabel: string;
  searchPlaceholder: string;
  emptyMessage: string;
  configModalTitle: string;
  configModalDescription: string;
  fillButtonLabel: string;
  fillButtonContinueLabel: string;
  currentPeriodSummaryLabel: string;
  recordsCountLabel: (count: number) => string;
  saveSuccessToast: string;
  openSuccessToast: string;
  backHref?: (contractId: string) => string;
  backLabel?: string;
  protectedRoute?: string;
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

function entryPeriodLabel(kind: AcompanhamentoKind, entry: ReuniaoEntry) {
  return kind === 'mensal' ? entryMonthLabel(entry) : entryWeekLabel(entry);
}

function sortByPeriodDesc(kind: AcompanhamentoKind, a: ReuniaoEntry, b: ReuniaoEntry) {
  const ka = kind === 'mensal' ? a.monthKey || '' : a.weekKey || '';
  const kb = kind === 'mensal' ? b.monthKey || '' : b.weekKey || '';
  if (ka && kb && ka !== kb) return kb.localeCompare(ka);
  return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
}

function isCurrentPeriod(kind: AcompanhamentoKind, entry: ReuniaoEntry) {
  if (kind === 'mensal') return entry.monthKey === getIsoMonthKey();
  return entry.weekKey === getFortnightKey();
}

function currentPeriodLabel(kind: AcompanhamentoKind) {
  return kind === 'mensal' ? formatMonthLabel(getIsoMonthKey()) : formatWeekLabel(getFortnightKey());
}

export function ContratoAcompanhamentoListPage({ config }: { config: ContratoAcompanhamentoListConfig }) {
  const {
    kind,
    pageTitle,
    sectionTitle,
    sectionDescription,
    Icon,
    periodColumnLabel,
    searchPlaceholder,
    emptyMessage,
    configModalTitle,
    configModalDescription,
    fillButtonLabel,
    fillButtonContinueLabel,
    currentPeriodSummaryLabel,
    recordsCountLabel,
    saveSuccessToast,
    openSuccessToast,
    backHref,
    backLabel = 'Voltar',
    protectedRoute = '/ponto/contratos',
  } = config;

  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const rawId = params?.id ?? params?.contractId;
  const contractId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] ?? '' : '';

  const [searchTerm, setSearchTerm] = useState('');
  const [reuniaoActionMenu, setReuniaoActionMenu] = useState<ReuniaoActionMenuState | null>(null);
  const [modalReuniaoId, setModalReuniaoId] = useState<string | null>(null);
  const [listOverrides, setListOverrides] = useState<Record<string, ReuniaoListPatch>>({});
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedFormularioId, setSelectedFormularioId] = useState<string>('');

  const listQueryKey = ['reunioes', kind, contractId] as const;
  const configQueryKey = ['reunioes-config', kind, contractId] as const;
  const apiBase = `/reunioes/${contractId}/${kind}`;

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
    queryKey: listQueryKey,
    queryFn: async () => (await api.get(apiBase)).data,
    enabled: !!contractId,
  });

  const { data: configData, isLoading: loadingConfig } = useQuery({
    queryKey: configQueryKey,
    queryFn: async () => (await api.get(`${apiBase}/config`)).data,
    enabled: !!contractId,
  });

  const {
    data: formulariosData,
    isLoading: loadingFormularios,
    isFetching: fetchingFormularios,
  } = useQuery({
    queryKey: ['formularios-templates'],
    queryFn: async () => {
      const res = await api.get('/formularios');
      return (Array.isArray(res.data?.data) ? res.data.data : []) as FormularioOption[];
    },
    enabled: configModalOpen,
  });

  const formularios: FormularioOption[] = Array.isArray(formulariosData) ? formulariosData : [];
  const contractConfig = (configData?.data ?? null) as ContractConfig | null;

  useEffect(() => {
    const openId = searchParams?.get('open');
    if (!openId) return;
    setModalReuniaoId(openId);
    const basePath =
      backHref?.(contractId) ||
      (kind === 'mensal'
        ? `/ponto/metricas/relatorios-contrato/${contractId}`
        : `/ponto/contratos/${contractId}/reunioes`);
    router.replace(basePath, { scroll: false });
  }, [searchParams, contractId, router, kind]);

  useEffect(() => {
    if (!configModalOpen) return;
    if (contractConfig?.formularioId) {
      setSelectedFormularioId(contractConfig.formularioId);
      return;
    }
    if (Array.isArray(formulariosData) && formulariosData.length === 1) {
      setSelectedFormularioId(formulariosData[0]!.id);
    }
  }, [configModalOpen, contractConfig?.formularioId, formulariosData]);

  const configMutation = useMutation({
    mutationFn: async (formularioId: string) =>
      (await api.put(`${apiBase}/config`, { formularioId })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configQueryKey });
      setConfigModalOpen(false);
      toast.success(saveSuccessToast);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao salvar configuração.';
      toast.error(msg);
    },
  });

  const periodoAtualMutation = useMutation({
    mutationFn: async () => (await api.post(`${apiBase}/periodo-atual`)).data,
    onSuccess: (res) => {
      const entry = res.data as ReuniaoEntry;
      queryClient.setQueryData(listQueryKey, (old: { data?: ReuniaoEntry[] } | undefined) => {
        const list = Array.isArray(old?.data) ? old!.data : [];
        return { success: true, data: [entry, ...list.filter((r) => r.id !== entry.id)] };
      });
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      setModalReuniaoId(entry.id);
      toast.success(openSuccessToast);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao abrir o período atual.';
      if (msg.includes('Configure o formulário')) {
        toast.error(msg);
        setConfigModalOpen(true);
        return;
      }
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`${apiBase}/${id}`),
    onSuccess: (_res, id) => {
      if (modalReuniaoId === id) setModalReuniaoId(null);
      setListOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      toast.success('Registro excluído.');
    },
    onError: () => toast.error('Erro ao excluir.'),
  });

  const handleListPatch = useCallback(
    (reuniaoId: string, patch: ReuniaoListPatch) => {
      setListOverrides((prev) => ({ ...prev, [reuniaoId]: patch }));
      queryClient.setQueryData(listQueryKey, (old: { data?: ReuniaoEntry[] } | undefined) => {
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
    },
    [queryClient, listQueryKey]
  );

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

  const reunioes = reunioesRaw
    .map((r) => {
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
    })
    .sort((a, b) => sortByPeriodDesc(kind, a, b));

  const currentPeriodEntry = useMemo(
    () => reunioes.find((r) => isCurrentPeriod(kind, r)),
    [reunioes, kind]
  );

  const reunioesFiltradas = reunioes.filter(
    (r) =>
      !searchTerm.trim() ||
      textMatchesSearch(entryPeriodLabel(kind, r), searchTerm) ||
      textMatchesSearch(r.formularioName, searchTerm) ||
      textMatchesSearch(r.formularioDescription, searchTerm) ||
      textMatchesSearch(r.responsavelPreenchimento, searchTerm)
  );

  if (!contractId || loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route={protectedRoute} contractId={contractId}>
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
            <Link
              href={backHref?.(contractId) || `/ponto/contratos/${contractId}`}
              aria-label={backLabel}
              className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              {backLabel}
            </Link>
            <div className="w-full max-w-3xl px-14 text-center sm:px-20">
              <h1 className="break-words text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
                {loadingContract ? 'Carregando contrato…' : contract?.name || pageTitle}
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">{pageTitle}</p>
            </div>
          </div>

          <Card className="w-full shadow-none">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center space-x-3">
                  <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30 sm:p-3">
                    <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{sectionTitle}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {loadingConfig
                        ? 'Carregando configuração…'
                        : contractConfig?.formularioName
                          ? `Formulário: ${contractConfig.formularioName}`
                          : sectionDescription}
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
                        placeholder={searchPlaceholder}
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfigModalOpen(true)}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <Settings2 className="h-4 w-4 shrink-0" />
                    Configurar formulário
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentPeriodEntry) {
                        setModalReuniaoId(currentPeriodEntry.id);
                        return;
                      }
                      periodoAtualMutation.mutate();
                    }}
                    disabled={periodoAtualMutation.isPending || loadingConfig}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-70"
                  >
                    <PenLine className="h-4 w-4 shrink-0" />
                    {currentPeriodEntry ? fillButtonContinueLabel : fillButtonLabel}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!loadingReunioes && reunioes.length > 0 && (
                <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <span>
                    {currentPeriodSummaryLabel}: {currentPeriodLabel(kind)}
                    {currentPeriodEntry ? ' · em andamento' : ' · ainda não preenchido'}
                  </span>
                  <span>{recordsCountLabel(reunioesFiltradas.length)}</span>
                </div>
              )}

              {loadingReunioes ? (
                <div className="mt-4">
                  <Loading message="Carregando histórico..." size="md" />
                </div>
              ) : reunioesFiltradas.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-gray-300 py-12 text-center text-gray-500 dark:border-gray-600 dark:text-gray-400">
                  {reunioes.length === 0 ? emptyMessage : 'Nenhum registro encontrado para esta busca.'}
                </div>
              ) : (
                <div className="mt-3 table-scroll">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          {periodColumnLabel}
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Responsável
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Atualizado em
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
                          } ${isCurrentPeriod(kind, r) ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <ListRowNavigableLabel className="truncate font-medium">
                              {entryPeriodLabel(kind, r)}
                              {isCurrentPeriod(kind, r) ? (
                                <span className="ml-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                                  atual
                                </span>
                              ) : null}
                            </ListRowNavigableLabel>
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                            {r.responsavelPreenchimento?.trim() || '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">
                            {formatDateTime(r.updatedAt || r.createdAt)}
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
                      if (confirm('Excluir este registro? Esta ação não pode ser desfeita.')) {
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

        <Modal
          isOpen={configModalOpen}
          onClose={() => {
            if (configMutation.isPending) return;
            setConfigModalOpen(false);
          }}
          title={configModalTitle}
          size="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">{configModalDescription}</p>

            {loadingFormularios || fetchingFormularios ? (
              <Loading message="Carregando formulários..." size="md" />
            ) : formularios.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-gray-600">
                <ClipboardList className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Nenhum formulário cadastrado.</p>
                <Link
                  href="/ponto/formularios"
                  className="mt-3 inline-flex text-sm font-semibold text-red-600 hover:underline"
                >
                  Criar formulário
                </Link>
              </div>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {formularios.map((f) => {
                  const active = selectedFormularioId === f.id;
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedFormularioId(f.id)}
                        className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                          active
                            ? 'border-red-500 bg-red-50 dark:border-red-500 dark:bg-red-950/40'
                            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500'
                        }`}
                      >
                        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {f.name}
                        </span>
                        {f.description ? (
                          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                            {f.description}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setConfigModalOpen(false)}
                disabled={configMutation.isPending}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!selectedFormularioId || configMutation.isPending || formularios.length === 0}
                onClick={() => configMutation.mutate(selectedFormularioId)}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {configMutation.isPending ? 'Salvando...' : 'Salvar formulário'}
              </button>
            </div>
          </div>
        </Modal>

        <ReuniaoFormModal
          isOpen={!!modalReuniaoId}
          onClose={() => setModalReuniaoId(null)}
          contractId={contractId}
          kind={kind}
          reuniaoId={modalReuniaoId}
          onListPatch={handleListPatch}
        />
      </MainLayout>
    </ProtectedRoute>
  );
}
