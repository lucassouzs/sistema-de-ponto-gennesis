'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ClipboardList,
  Eye,
  Paperclip,
  RefreshCw,
  Search,
  Wrench,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { TabCountBadge } from '@/components/ui/TabCountBadge';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import {
  GestaoOsAttachment,
  GestaoOsLocationTree,
  GestaoOsMaintenanceType,
  GestaoOsPriority,
  GestaoOsServiceCategory,
  GestaoOsStatus,
  GestaoOsWorkOrder,
  MAINTENANCE_TYPE_LABELS,
  PRIORITY_LABELS,
  SERVICE_CATEGORIES,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  formatGestaoOsLabel
} from './gestaoOsTypes';

type Technician = { id: string; name: string; email?: string };

const PHASE_TABS: ReadonlyArray<{ id: GestaoOsStatus; label: string }> = [
  { id: 'OPEN', label: 'Aberta' },
  { id: 'UNDER_REVIEW', label: 'Em Análise' },
  { id: 'APPROVED', label: 'Aprovada' },
  { id: 'IN_PROGRESS', label: 'Em Execução' },
  { id: 'WAITING_PARTS', label: 'Aguardando Peça/Terceiro' },
  { id: 'COMPLETED', label: 'Concluída' },
  { id: 'CLOSED', label: 'Encerrada/Avaliada' },
  { id: 'CANCELLED', label: 'Cancelada' }
];

const STATUS_BADGE: Record<GestaoOsStatus, string> = {
  OPEN: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  UNDER_REVIEW: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  APPROVED: 'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200',
  WAITING_PARTS: 'bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200',
  COMPLETED: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  CLOSED: 'bg-teal-100 text-teal-900 dark:bg-teal-950/40 dark:text-teal-200',
  CANCELLED: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
};

const PRIORITY_BADGE: Record<GestaoOsPriority, string> = {
  LOW: 'text-slate-600 dark:text-slate-300',
  MEDIUM: 'text-sky-700 dark:text-sky-300',
  HIGH: 'text-orange-700 dark:text-orange-300',
  URGENT: 'text-rose-700 font-semibold dark:text-rose-300'
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function fieldClassName() {
  return 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
}

export default function SistemaGestaoOsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [activePhase, setActivePhase] = useState<GestaoOsStatus>('OPEN');
  const [priorityFilter, setPriorityFilter] = useState<GestaoOsPriority | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [category, setCategory] = useState<string>(SERVICE_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<GestaoOsPriority>('MEDIUM');
  const [buildingId, setBuildingId] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [placeId, setPlaceId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [attachments, setAttachments] = useState<GestaoOsAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [qrHandled, setQrHandled] = useState(false);
  const [openedAtLabel, setOpenedAtLabel] = useState(() => formatDateTime(new Date().toISOString()));

  const [transitionStatus, setTransitionStatus] = useState<GestaoOsStatus | ''>('');
  const [transitionNote, setTransitionNote] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [maintenanceType, setMaintenanceType] = useState<GestaoOsMaintenanceType | ''>('');
  const [assigneeId, setAssigneeId] = useState('');
  const [rating, setRating] = useState('5');
  const [ratingComment, setRatingComment] = useState('');

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

  const {
    data: rows = [],
    isLoading: loadingRows,
    isFetching: fetchingRows,
    refetch
  } = useQuery({
    queryKey: ['gestao-os-list', search, activePhase, priorityFilter],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsWorkOrder[] }>('/gestao-os', {
        params: {
          search: search || undefined,
          status: activePhase,
          priority: priorityFilter || undefined
        }
      });
      return res.data?.data ?? [];
    }
  });

  const { data: summary } = useQuery({
    queryKey: ['gestao-os-summary'],
    queryFn: async () => {
      const res = await api.get('/gestao-os/summary');
      return res.data?.data as {
        byStatus: Partial<Record<GestaoOsStatus, number>>;
        openLike: number;
        total: number;
      };
    }
  });

  const phaseCounts = useMemo(() => {
    const byStatus = summary?.byStatus ?? {};
    return Object.fromEntries(
      PHASE_TABS.map((tab) => [tab.id, byStatus[tab.id] ?? 0])
    ) as Record<GestaoOsStatus, number>;
  }, [summary]);

  useEffect(() => {
    if (!createOpen) return;
    setOpenedAtLabel(formatDateTime(new Date().toISOString()));
  }, [createOpen]);

  const { data: locationTree = [] } = useQuery({
    queryKey: ['gestao-os-locations'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsLocationTree }>('/gestao-os/locations');
      return res.data?.data ?? [];
    }
  });

  const { data: serviceCategories = [] } = useQuery({
    queryKey: ['gestao-os-categories'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsServiceCategory[] }>(
        '/gestao-os/cadastros/categories'
      );
      return res.data?.data ?? [];
    }
  });

  const categoryOptions = useMemo(() => {
    const fromDb = serviceCategories.filter((c) => c.isActive).map((c) => c.name);
    if (fromDb.length > 0) return fromDb;
    return [...SERVICE_CATEGORIES];
  }, [serviceCategories]);

  useEffect(() => {
    if (qrHandled) return;
    const qr = searchParams?.get('qr');
    if (!qr) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/gestao-os/cadastros/qr/resolve', { params: { token: qr } });
        const asset = res.data?.data as {
          id: string;
          name: string;
          category: string | null;
          buildingId: string;
          sectorId: string;
          placeId: string;
          locationLabel?: string;
        };
        if (cancelled || !asset) return;
        setBuildingId(asset.buildingId || '');
        setSectorId(asset.sectorId || '');
        setPlaceId(asset.placeId || '');
        setAssetId(asset.id);
        if (asset.category) setCategory(asset.category);
        setDescription((prev) => prev || `Manutenção no ativo: ${asset.name}`);
        setCreateOpen(true);
        toast.success(`Ativo identificado via QR: ${asset.name}`);
        router.replace('/ponto/sistema-gestao-os');
      } catch (err: any) {
        toast.error(err?.response?.data?.message || 'QR Code inválido ou ativo inativo');
      } finally {
        if (!cancelled) setQrHandled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, qrHandled, router]);

  const { data: technicians = [] } = useQuery({
    queryKey: ['gestao-os-technicians'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Technician[] }>('/gestao-os/technicians');
      return res.data?.data ?? [];
    }
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['gestao-os-detail', detailId],
    enabled: Boolean(detailId),
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsWorkOrder }>(
        `/gestao-os/${detailId}`
      );
      return res.data?.data;
    }
  });

  const sectors = useMemo(() => {
    return locationTree.find((b) => b.id === buildingId)?.sectors ?? [];
  }, [locationTree, buildingId]);

  const places = useMemo(() => {
    return sectors.find((s) => s.id === sectorId)?.places ?? [];
  }, [sectors, sectorId]);

  const assets = useMemo(() => {
    return places.find((p) => p.id === placeId)?.assets ?? [];
  }, [places, placeId]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/gestao-os', {
        category,
        description,
        priority,
        buildingId: buildingId || null,
        sectorId: sectorId || null,
        placeId: placeId || null,
        assetId: assetId || null,
        attachments
      });
      return res.data?.data as GestaoOsWorkOrder;
    },
    onSuccess: (created) => {
      toast.success(`${formatGestaoOsLabel(created)} aberto com sucesso`);
      setCreateOpen(false);
      setDescription('');
      setAttachments([]);
      setBuildingId('');
      setSectorId('');
      setPlaceId('');
      setAssetId('');
      setPriority('MEDIUM');
      setActivePhase('OPEN');
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-list'] });
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-summary'] });
      setDetailId(created.id);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Não foi possível abrir o chamado');
    }
  });

  const transitionMutation = useMutation({
    mutationFn: async () => {
      if (!detailId || !transitionStatus) throw new Error('Selecione o próximo status');
      const res = await api.post(`/gestao-os/${detailId}/transition`, {
        status: transitionStatus,
        note: transitionNote || undefined,
        cancelReason: transitionStatus === 'CANCELLED' ? cancelReason : undefined,
        maintenanceType: maintenanceType || undefined,
        assigneeId: assigneeId || undefined,
        rating: transitionStatus === 'CLOSED' ? Number(rating) : undefined,
        ratingComment: transitionStatus === 'CLOSED' ? ratingComment || undefined : undefined
      });
      return res.data?.data as GestaoOsWorkOrder;
    },
    onSuccess: (updated) => {
      if (updated?.osNumber != null && updated.status === 'UNDER_REVIEW') {
        toast.success(`OS #${updated.osNumber} criada a partir do chamado`);
      } else {
        toast.success('Status atualizado');
      }
      setTransitionStatus('');
      setTransitionNote('');
      setCancelReason('');
      if (updated?.status) setActivePhase(updated.status);
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-list'] });
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-detail', detailId] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Não foi possível atualizar o status');
    }
  });

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: GestaoOsAttachment[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        const res = await api.post('/gestao-os/upload-attachment', form, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        const data = res.data?.data;
        if (data?.url) {
          uploaded.push({
            url: data.url,
            name: data.name || file.name,
            mimeType: data.mimeType || file.type
          });
        }
      }
      setAttachments((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} anexo(s) enviado(s)`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Falha no upload');
    } finally {
      setUploading(false);
    }
  };

  const nextStatuses = detail ? STATUS_TRANSITIONS[detail.status] : [];

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/sistema-gestao-os">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Gestão de OS
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Solicite, aprove, execute e acompanhe ordens de serviço de manutenção — do solicitante
              ao técnico/prestador.
            </p>
          </div>

          <div className="scroll-mt-4">
            <div className="bg-transparent px-1">
              <nav className="-mb-px flex flex-wrap justify-center gap-x-1 gap-y-2 overflow-x-auto py-3 sm:gap-x-2">
                {PHASE_TABS.map((tab) => {
                  const active = activePhase === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActivePhase(tab.id)}
                      className={`flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-2 py-2 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                        active
                          ? 'border-red-500 text-red-600 dark:border-red-400 dark:text-red-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      {tab.label}
                      <TabCountBadge count={phaseCounts[tab.id] ?? 0} active={active} tone="red" />
                    </button>
                  );
                })}
              </nav>
            </div>
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
                      {STATUS_LABELS[activePhase]}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {summary?.total != null
                        ? `${summary.total} registros · ${rows.length} nesta fase`
                        : `${rows.length} nesta fase`}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className={cadastroListClasses.searchField}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Pesquisar chamado ou OS..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <select
                    className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value as GestaoOsPriority | '')}
                    aria-label="Filtrar por prioridade"
                  >
                    <option value="">Prioridade: todas</option>
                    {(Object.keys(PRIORITY_LABELS) as GestaoOsPriority[]).map((key) => (
                      <option key={key} value={key}>
                        {PRIORITY_LABELS[key]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <RefreshCw className={`h-4 w-4 ${fetchingRows ? 'animate-spin' : ''}`} />
                    Atualizar
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                  >
                    <ClipboardList className="h-4 w-4" />
                    Novo chamado
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
            {loadingRows ? (
              <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
                Carregando chamados...
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhum chamado nesta fase. Abra um chamado ou escolha outra fase.
              </div>
            ) : (
              <div className="w-full min-w-0">
                <table className="w-full table-fixed text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60">
                    <tr>
                      <th className="w-[10%] px-2 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Nº
                      </th>
                      <th className="w-[10%] px-2 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Prioridade
                      </th>
                      <th className="w-[16%] px-2 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Categoria
                      </th>
                      <th className="w-[24%] px-2 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Local / Ativo
                      </th>
                      <th className="w-[14%] px-2 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Solicitante
                      </th>
                      <th className="w-[15%] px-2 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Abertura
                      </th>
                      <th className="w-[14%] px-2 py-2.5 text-right text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40"
                      >
                        <td className="px-2 py-2.5 font-semibold text-gray-900 dark:text-gray-100">
                          {formatGestaoOsLabel(row)}
                        </td>
                        <td className={`px-2 py-2.5 text-xs sm:text-sm ${PRIORITY_BADGE[row.priority]}`}>
                          {PRIORITY_LABELS[row.priority]}
                        </td>
                        <td className="truncate px-2 py-2.5 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
                          {row.category}
                        </td>
                        <td
                          className="truncate px-2 py-2.5 text-xs text-gray-600 dark:text-gray-400 sm:text-sm"
                          title={row.locationLabel || undefined}
                        >
                          {row.locationLabel || '—'}
                        </td>
                        <td className="truncate px-2 py-2.5 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
                          {row.requester?.name || '—'}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
                          {formatDateTime(row.openedAt)}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setDetailId(row.id);
                              setTransitionStatus('');
                              setMaintenanceType(row.maintenanceType || '');
                              setAssigneeId(row.assigneeId || '');
                            }}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                          >
                            <Eye className="h-3.5 w-3.5 shrink-0" />
                            Ver Detalhes
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </CardContent>
          </Card>
        </div>

        <Modal
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          title="Novo chamado"
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Nome do solicitante
                </span>
                <input
                  className={`${fieldClassName()} cursor-default bg-gray-50 dark:bg-gray-900/60`}
                  value={user.name || '—'}
                  readOnly
                  tabIndex={-1}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Data de abertura
                </span>
                <input
                  className={`${fieldClassName()} cursor-default bg-gray-50 dark:bg-gray-900/60`}
                  value={openedAtLabel}
                  readOnly
                  tabIndex={-1}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Prédio
                </span>
                <select
                  className={fieldClassName()}
                  value={buildingId}
                  onChange={(e) => {
                    setBuildingId(e.target.value);
                    setSectorId('');
                    setPlaceId('');
                    setAssetId('');
                  }}
                >
                  <option value="">Selecione...</option>
                  {locationTree.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Andar/Setor
                </span>
                <select
                  className={fieldClassName()}
                  value={sectorId}
                  onChange={(e) => {
                    if (!buildingId) return;
                    setSectorId(e.target.value);
                    setPlaceId('');
                    setAssetId('');
                  }}
                >
                  <option value="">
                    {!buildingId
                      ? 'Selecione o prédio primeiro'
                      : sectors.length === 0
                        ? 'Nenhum andar/setor cadastrado'
                        : 'Selecione...'}
                  </option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Sala/Local
                </span>
                <select
                  className={fieldClassName()}
                  value={placeId}
                  onChange={(e) => {
                    if (!sectorId) return;
                    setPlaceId(e.target.value);
                    setAssetId('');
                  }}
                >
                  <option value="">
                    {!sectorId
                      ? 'Selecione o andar/setor primeiro'
                      : places.length === 0
                        ? 'Nenhuma sala/local cadastrada'
                        : 'Selecione...'}
                  </option>
                  {places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Ativo (opcional)
                </span>
                <select
                  className={fieldClassName()}
                  value={assetId}
                  onChange={(e) => {
                    if (!placeId) return;
                    setAssetId(e.target.value);
                  }}
                >
                  <option value="">
                    {!placeId
                      ? 'Selecione a sala/local primeiro'
                      : 'Nenhum / geral do local'}
                  </option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.category ? ` (${a.category})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Categoria
                </span>
                <select
                  className={fieldClassName()}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Prioridade
                </span>
                <select
                  className={fieldClassName()}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as GestaoOsPriority)}
                >
                  {(Object.keys(PRIORITY_LABELS) as GestaoOsPriority[]).map((key) => (
                    <option key={key} value={key}>
                      {PRIORITY_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                Descrição do problema
              </span>
              <textarea
                className={fieldClassName()}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: lâmpada queimada no corredor, vazamento sob a pia, ar-condicionado sem refrigerar..."
              />
            </label>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Anexos (fotos do problema)
              </label>
              <input
                type="file"
                accept="image/*,.pdf"
                multiple
                disabled={uploading}
                onChange={(e) => void uploadFiles(e.target.files)}
              />
              {attachments.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                  {attachments.map((file) => (
                    <li key={file.url} className="flex items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5" />
                      <a
                        href={resolveApiMediaUrl(file.url) ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="text-red-700 hover:underline dark:text-red-300"
                      >
                        {file.name}
                      </a>
                      <button
                        type="button"
                        className="text-rose-600"
                        onClick={() =>
                          setAttachments((prev) => prev.filter((item) => item.url !== file.url))
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={createMutation.isPending || !buildingId || !description.trim()}
                onClick={() => createMutation.mutate()}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Salvando...' : 'Abrir chamado'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={Boolean(detailId)}
          onClose={() => setDetailId(null)}
          title={detail ? formatGestaoOsLabel(detail) : 'Detalhe do chamado'}
          size="xl"
        >
          {loadingDetail || !detail ? (
            <div className="py-10 text-center text-sm text-gray-500">Carregando...</div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[detail.status]}`}>
                  {STATUS_LABELS[detail.status]}
                </span>
                <span className={`text-sm ${PRIORITY_BADGE[detail.priority]}`}>
                  Prioridade: {PRIORITY_LABELS[detail.priority]}
                </span>
                {detail.maintenanceType ? (
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    Tipo: {MAINTENANCE_TYPE_LABELS[detail.maintenanceType]}
                  </span>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs uppercase text-gray-500">Chamado</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    #{detail.displayNumber}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-500">OS</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {detail.osNumber != null ? `#${detail.osNumber}` : 'Ainda não gerada'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-500">Local / Ativo</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {detail.locationLabel || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-500">Categoria</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{detail.category}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-500">Solicitante</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {detail.requester?.name || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-500">Data de abertura</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {formatDateTime(detail.openedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-500">Responsável</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {detail.assignee?.name || 'Não atribuído'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500">Descrição</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
                  {detail.description}
                </p>
              </div>

              {Array.isArray(detail.attachments) && detail.attachments.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs uppercase text-gray-500">Anexos</p>
                  <div className="flex flex-wrap gap-2">
                    {detail.attachments.map((file) => (
                      <a
                        key={file.url}
                        href={resolveApiMediaUrl(file.url) ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-red-700 dark:border-gray-700 dark:text-red-300"
                      >
                        <Paperclip className="h-3 w-3" />
                        {file.name}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail.events && detail.events.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs uppercase text-gray-500">Histórico</p>
                  <ol className="space-y-2 border-l border-gray-200 pl-4 dark:border-gray-700">
                    {detail.events.map((event) => (
                      <li key={event.id} className="text-sm">
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {event.fromStatus ? `${STATUS_LABELS[event.fromStatus]} → ` : ''}
                          {STATUS_LABELS[event.toStatus]}
                        </p>
                        <p className="text-xs text-gray-500">
                          {event.actor?.name || 'Sistema'} · {formatDateTime(event.createdAt)}
                        </p>
                        {event.note ? (
                          <p className="text-xs text-gray-600 dark:text-gray-400">{event.note}</p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {nextStatuses.length > 0 ? (
                <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/20">
                  <p className="mb-3 text-sm font-semibold text-red-900 dark:text-red-100">
                    Avançar fluxo
                  </p>
                  {detail.status === 'OPEN' ? (
                    <p className="mb-3 text-xs text-red-800/80 dark:text-red-200/80">
                      Na primeira análise (Em Análise), o sistema cria a OS e atribui o número da
                      ordem de serviço.
                    </p>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm sm:col-span-2">
                      <span className="mb-1 block">Próximo status</span>
                      <select
                        className={fieldClassName()}
                        value={transitionStatus}
                        onChange={(e) => setTransitionStatus(e.target.value as GestaoOsStatus | '')}
                      >
                        <option value="">Selecione...</option>
                        {nextStatuses.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </label>

                    {(transitionStatus === 'APPROVED' ||
                      transitionStatus === 'UNDER_REVIEW' ||
                      detail.status === 'UNDER_REVIEW') && (
                      <>
                        <label className="block text-sm">
                          <span className="mb-1 block">Tipo de manutenção</span>
                          <select
                            className={fieldClassName()}
                            value={maintenanceType}
                            onChange={(e) =>
                              setMaintenanceType(e.target.value as GestaoOsMaintenanceType | '')
                            }
                          >
                            <option value="">Selecione...</option>
                            {(Object.keys(MAINTENANCE_TYPE_LABELS) as GestaoOsMaintenanceType[]).map(
                              (key) => (
                                <option key={key} value={key}>
                                  {MAINTENANCE_TYPE_LABELS[key]}
                                </option>
                              )
                            )}
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1 block">Técnico responsável</span>
                          <select
                            className={fieldClassName()}
                            value={assigneeId}
                            onChange={(e) => setAssigneeId(e.target.value)}
                          >
                            <option value="">Não atribuído</option>
                            {technicians.map((tech) => (
                              <option key={tech.id} value={tech.id}>
                                {tech.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}

                    {transitionStatus === 'CANCELLED' ? (
                      <label className="block text-sm sm:col-span-2">
                        <span className="mb-1 block">Justificativa do cancelamento *</span>
                        <textarea
                          className={fieldClassName()}
                          rows={3}
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                        />
                      </label>
                    ) : null}

                    {transitionStatus === 'CLOSED' ? (
                      <>
                        <label className="block text-sm">
                          <span className="mb-1 block">Avaliação (1–5)</span>
                          <select
                            className={fieldClassName()}
                            value={rating}
                            onChange={(e) => setRating(e.target.value)}
                          >
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1 block">Comentário da avaliação</span>
                          <input
                            className={fieldClassName()}
                            value={ratingComment}
                            onChange={(e) => setRatingComment(e.target.value)}
                          />
                        </label>
                      </>
                    ) : null}

                    <label className="block text-sm sm:col-span-2">
                      <span className="mb-1 block">Observação / relato</span>
                      <textarea
                        className={fieldClassName()}
                        rows={2}
                        value={transitionNote}
                        onChange={(e) => setTransitionNote(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      disabled={
                        !transitionStatus ||
                        transitionMutation.isPending ||
                        (transitionStatus === 'CANCELLED' && !cancelReason.trim()) ||
                        (transitionStatus === 'APPROVED' && !maintenanceType)
                      }
                      onClick={() => transitionMutation.mutate()}
                      className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {transitionMutation.isPending ? 'Atualizando...' : 'Confirmar transição'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  Esta solicitação está {STATUS_LABELS[detail.status].toLowerCase()} — sem novas
                  transições.
                </p>
              )}
            </div>
          )}
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
