'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Eye, Paperclip, Search, Wrench, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
  listTableRowClasses
} from '@/components/ui/RowActionMenu';
import { ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { GestaoOsAttachmentsField } from '@/components/gestao-os/GestaoOsAttachmentsField';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import {
  GestaoOsAttachment,
  GestaoOsLocationTree,
  GestaoOsPriority,
  GestaoOsServiceCategory,
  GestaoOsStatus,
  GestaoOsWorkOrder,
  PRIORITY_LABELS,
  SERVICE_CATEGORIES,
  STATUS_LABELS,
  formatGestaoOsLabel
} from '../sistema-gestao-os/gestaoOsTypes';

function isOverdue(row: Pick<GestaoOsWorkOrder, 'dueAt' | 'status'>) {
  if (!row.dueAt) return false;
  if (row.status === 'CLOSED' || row.status === 'CANCELLED') return false;
  const due = new Date(row.dueAt).getTime();
  return !Number.isNaN(due) && due < Date.now();
}

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

function RequiredMark() {
  return <span className="ml-0.5 text-red-600 dark:text-red-400">*</span>;
}

export default function MeusChamadosPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
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
  const [openedAtLabel, setOpenedAtLabel] = useState(() =>
    formatDateTime(new Date().toISOString())
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

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE', id: '' };

  const {
    data: rows = [],
    isLoading: loadingRows
  } = useQuery({
    queryKey: ['gestao-os-mine', search],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsWorkOrder[] }>('/gestao-os', {
        params: {
          mine: 1,
          search: search || undefined,
          limit: 200
        }
      });
      return res.data?.data ?? [];
    }
  });

  useEffect(() => {
    if (!createOpen) return;
    setOpenedAtLabel(formatDateTime(new Date().toISOString()));
  }, [createOpen]);

  const { data: locationTree = [] } = useQuery({
    queryKey: ['gestao-os-locations'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsLocationTree }>(
        '/gestao-os/locations'
      );
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
        router.replace('/ponto/meus-chamados');
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

  const buildings = locationTree;
  const sectors = useMemo(
    () => buildings.find((b) => b.id === buildingId)?.sectors ?? [],
    [buildings, buildingId]
  );
  const places = useMemo(
    () => sectors.find((s) => s.id === sectorId)?.places ?? [],
    [sectors, sectorId]
  );
  const assets = useMemo(
    () => places.find((p) => p.id === placeId)?.assets ?? [],
    [places, placeId]
  );

  const buildingFormOptions = useMemo(
    () => labeledToSelectOptions(buildings.map((b) => ({ value: b.id, label: b.name }))),
    [buildings]
  );
  const sectorFormOptions = useMemo(
    () => labeledToSelectOptions(sectors.map((s) => ({ value: s.id, label: s.name }))),
    [sectors]
  );
  const placeFormOptions = useMemo(
    () => labeledToSelectOptions(places.map((p) => ({ value: p.id, label: p.name }))),
    [places]
  );
  const assetFormOptions = useMemo(
    () =>
      labeledToSelectOptions(
        assets.map((a) => ({
          value: a.id,
          label: a.category ? `${a.name} (${a.category})` : a.name,
          searchText: `${a.name} ${a.category ?? ''}`
        }))
      ),
    [assets]
  );
  const categoryFormOptions = useMemo(
    () => labeledToSelectOptions(categoryOptions.map((name) => ({ value: name, label: name }))),
    [categoryOptions]
  );
  const priorityFormOptions = useMemo(
    () =>
      labeledToSelectOptions(
        (Object.keys(PRIORITY_LABELS) as GestaoOsPriority[]).map((key) => ({
          value: key,
          label: PRIORITY_LABELS[key]
        }))
      ),
    []
  );

  const openDetail = (row: GestaoOsWorkOrder) => setDetailId(row.id);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen
  } = useRowActionMenu(rows);

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
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-mine'] });
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-list'] });
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-summary'] });
      setDetailId(created.id);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Não foi possível abrir o chamado');
    }
  });

  const uploadFiles = async (files: FileList | File[] | null) => {
    const list = !files ? [] : Array.from(files);
    if (!list.length) return;
    setUploading(true);
    try {
      const uploaded: GestaoOsAttachment[] = [];
      for (const file of list) {
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

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/meus-chamados">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Meus Chamados
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Abra solicitações de manutenção e acompanhe o andamento dos seus chamados.
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
                      Seus chamados
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {rows.length} registro{rows.length === 1 ? '' : 's'}
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
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <ClipboardList className="h-4 w-4" />
                    Novo chamado
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {loadingRows ? (
                <CadastroListLoading message="Carregando seus chamados..." />
              ) : rows.length === 0 ? (
                <CadastroListEmpty
                  icon={ClipboardList}
                  title="Nenhum chamado seu"
                  hint={
                    search.trim()
                      ? 'Tente ajustar a busca'
                      : 'Clique em Novo chamado para abrir uma solicitação'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={1}
                    endItem={rows.length}
                    total={rows.length}
                    itemLabel="chamado"
                    itemLabelPlural="chamados"
                  />
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={`${cadastroListClasses.th} w-28 whitespace-nowrap`}>Nº</th>
                          <th className={`${cadastroListClasses.thCenter} w-36`}>Status</th>
                          <th className={`${cadastroListClasses.thCenter} w-28`}>Prioridade</th>
                          <th className={cadastroListClasses.th}>Categoria</th>
                          <th className={cadastroListClasses.th}>Local / Ativo</th>
                          <th className={`${cadastroListClasses.thCenter} w-36`}>Abertura</th>
                          <th className={cadastroListClasses.thRight}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {rows.map((row) => (
                          <tr
                            key={row.id}
                            role="button"
                            tabIndex={0}
                            className={listTableRowClasses.trNavigable}
                            onClick={() => openDetail(row)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openDetail(row);
                              }
                            }}
                          >
                            <td className={`${cadastroListClasses.tdTruncate} !pl-2 sm:!pl-3`}>
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <ListRowNavigableLabel className="font-semibold">
                                  {formatGestaoOsLabel(row)}
                                </ListRowNavigableLabel>
                                {isOverdue(row) ? (
                                  <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
                                    Atrasada
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}
                              >
                                {STATUS_LABELS[row.status]}
                              </span>
                            </td>
                            <td
                              className={`${cadastroListClasses.tdCenter} ${PRIORITY_BADGE[row.priority]}`}
                            >
                              {PRIORITY_LABELS[row.priority]}
                            </td>
                            <td className={cadastroListClasses.tdTruncate}>
                              <span className="block truncate text-sm text-gray-600 dark:text-gray-400">
                                {row.category}
                              </span>
                            </td>
                            <td
                              className={cadastroListClasses.tdTruncate}
                              title={row.locationLabel || undefined}
                            >
                              <span className="block truncate text-sm text-gray-600 dark:text-gray-400">
                                {row.locationLabel || '—'}
                              </span>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {formatDateTime(row.openedAt)}
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
                  onEdit={() => openDetail(rowForActionMenu)}
                  hideDelete
                  hideDefaultActions
                  extraItems={[
                    {
                      label: 'Ver detalhes',
                      icon: <Eye className="h-4 w-4" />,
                      onClick: () => openDetail(rowForActionMenu)
                    }
                  ]}
                />
              ) : null}
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
                  <RequiredMark />
                </span>
                <StringSingleSelectDropdown
                  value={buildingId}
                  onChange={(v) => {
                    setBuildingId(v);
                    setSectorId('');
                    setPlaceId('');
                    setAssetId('');
                  }}
                  options={buildingFormOptions}
                  placeholder="Selecione..."
                  emptyOptionLabel="Selecione..."
                  allowEmpty
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Andar
                  <RequiredMark />
                </span>
                <StringSingleSelectDropdown
                  value={sectorId}
                  onChange={(v) => {
                    setSectorId(v);
                    setPlaceId('');
                    setAssetId('');
                  }}
                  options={sectorFormOptions}
                  placeholder={
                    !buildingId
                      ? 'Selecione o prédio primeiro'
                      : sectors.length === 0
                        ? 'Nenhum andar cadastrado'
                        : 'Selecione...'
                  }
                  emptyOptionLabel="Selecione..."
                  allowEmpty
                  disabled={!buildingId || sectors.length === 0}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Local
                  <RequiredMark />
                </span>
                <StringSingleSelectDropdown
                  value={placeId}
                  onChange={(v) => {
                    setPlaceId(v);
                    setAssetId('');
                  }}
                  options={placeFormOptions}
                  placeholder={
                    !sectorId
                      ? 'Selecione o andar primeiro'
                      : places.length === 0
                        ? 'Nenhum local cadastrado'
                        : 'Selecione...'
                  }
                  emptyOptionLabel="Selecione..."
                  allowEmpty
                  disabled={!sectorId || places.length === 0}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Ativo
                </span>
                <StringSingleSelectDropdown
                  value={assetId}
                  onChange={setAssetId}
                  options={assetFormOptions}
                  placeholder={
                    !placeId ? 'Selecione o local primeiro' : 'Nenhum / geral do local'
                  }
                  emptyOptionLabel="Nenhum / geral do local"
                  allowEmpty
                  disabled={!placeId}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Categoria
                  <RequiredMark />
                </span>
                <StringSingleSelectDropdown
                  value={category}
                  onChange={setCategory}
                  options={categoryFormOptions}
                  placeholder="Selecione..."
                  allowEmpty={false}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Prioridade
                  <RequiredMark />
                </span>
                <StringSingleSelectDropdown
                  value={priority}
                  onChange={(v) => setPriority((v as GestaoOsPriority) || 'MEDIUM')}
                  options={priorityFormOptions}
                  placeholder="Selecione..."
                  allowEmpty={false}
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                Descrição
                <RequiredMark />
              </span>
              <textarea
                className={FORM_FIELD_TEXTAREA_CLS}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: lâmpada queimada no corredor, vazamento sob a pia, ar-condicionado sem refrigerar..."
              />
            </label>

            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Anexos
              </span>
              <GestaoOsAttachmentsField
                files={attachments}
                uploading={uploading}
                onFilesSelect={(selected) => void uploadFiles(selected)}
                onRemove={(url) =>
                  setAttachments((prev) => prev.filter((item) => item.url !== url))
                }
              />
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
                disabled={
                  createMutation.isPending ||
                  !buildingId ||
                  !sectorId ||
                  !placeId ||
                  !description.trim()
                }
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
          size="lg"
        >
          {loadingDetail || !detail ? (
            <div className="py-10 text-center text-sm text-gray-500">Carregando...</div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[detail.status]}`}
                >
                  {STATUS_LABELS[detail.status]}
                </span>
                <span className={`text-sm ${PRIORITY_BADGE[detail.priority]}`}>
                  Prioridade: {PRIORITY_LABELS[detail.priority]}
                </span>
                {isOverdue(detail) ? (
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
                    Atrasada · venc. {formatDateTime(detail.dueAt)}
                  </span>
                ) : null}
              </div>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
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
            </div>
          )}
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
