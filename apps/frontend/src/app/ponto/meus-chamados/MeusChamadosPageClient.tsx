'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Eye, Search, Wrench, X } from 'lucide-react';
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
import { GestaoOsCommentsSection } from '@/components/gestao-os/GestaoOsCommentsSection';
import {
  GESTAO_OS_FORM_LABEL_CLS,
  GestaoOsChamadoResumo,
  GestaoOsChecklistField,
  GestaoOsDetailModalChrome,
  GestaoOsDocumentsTab,
  GestaoOsEmptyTab,
  GestaoOsHistoryList,
  GestaoOsModalFooter,
  GestaoOsRequiredMark
} from '@/components/gestao-os/GestaoOsModalUi';
import api from '@/lib/api';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import {
  GestaoOsAttachment,
  GestaoOsLocationTree,
  GestaoOsPriority,
  GestaoOsServiceCategory,
  GestaoOsWorkOrder,
  PRIORITY_LABELS,
  SERVICE_CATEGORIES,
  STATUS_LABELS,
  formatGestaoOsLabel,
  formatGestaoOsNumber,
  gestaoOsStatusBadgeClass
} from '../sistema-gestao-os/gestaoOsTypes';

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

type MeusChamadosDetailTab = 'resumo' | 'checklist' | 'documentos' | 'historico' | 'comentarios';

const MEUS_CHAMADOS_DETAIL_TABS: ReadonlyArray<{ id: MeusChamadosDetailTab; label: string }> = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'historico', label: 'Histórico' },
  { id: 'comentarios', label: 'Comentários' }
];

export default function MeusChamadosPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<MeusChamadosDetailTab>('resumo');

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

  const openDetail = (row: GestaoOsWorkOrder) => {
    setDetailId(row.id);
    setDetailTab('resumo');
  };

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
      setDetailTab('resumo');
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
                      Chamados
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
                    <table className={`${cadastroListClasses.table} min-w-[64rem]`}>
                      <colgroup>
                        <col className="w-[4.5rem]" />
                        <col />
                        <col className="w-52" />
                        <col className="w-36" />
                        <col className="w-40" />
                        <col className="w-48" />
                        <col className="w-[4%]" />
                      </colgroup>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>ID</th>
                          <th className={cadastroListClasses.th}>Local / Ativo</th>
                          <th className={cadastroListClasses.thCenter}>Status</th>
                          <th className={cadastroListClasses.thCenter}>Prioridade</th>
                          <th className={cadastroListClasses.thCenter}>Categoria</th>
                          <th className={`${cadastroListClasses.thCenter} whitespace-nowrap`}>Abertura</th>
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
                            <td className={cadastroListClasses.tdMono}>
                              {formatGestaoOsNumber(row)}
                            </td>
                            <td className={cadastroListClasses.td}>
                              <ListRowNavigableLabel className="whitespace-normal break-words text-sm text-gray-600 dark:text-gray-400">
                                {row.locationLabel || '—'}
                              </ListRowNavigableLabel>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              <span className="flex justify-center">
                                <span className={gestaoOsStatusBadgeClass(row.status)}>
                                  {STATUS_LABELS[row.status]}
                                </span>
                              </span>
                            </td>
                            <td
                              className={`${cadastroListClasses.tdCenter} ${PRIORITY_BADGE[row.priority]}`}
                            >
                              <span className="flex justify-center">
                                {PRIORITY_LABELS[row.priority]}
                              </span>
                            </td>
                            <td className={`${cadastroListClasses.tdCenter} min-w-0`}>
                              <span className="flex justify-center">
                                <span className="max-w-full truncate text-sm text-gray-600 dark:text-gray-400">
                                  {row.category}
                                </span>
                              </span>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              <span className="flex justify-center">
                                {formatDateTime(row.openedAt)}
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
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Nome do solicitante</label>
                <input
                  className={`${FORM_FIELD_INPUT_CLS} cursor-default bg-gray-50 dark:bg-gray-900/60`}
                  value={user.name || '—'}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Data de abertura</label>
                <input
                  className={`${FORM_FIELD_INPUT_CLS} cursor-default bg-gray-50 dark:bg-gray-900/60`}
                  value={openedAtLabel}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>
                  Prédio
                  <GestaoOsRequiredMark />
                </label>
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
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>
                  Andar
                  <GestaoOsRequiredMark />
                </label>
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
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>
                  Local
                  <GestaoOsRequiredMark />
                </label>
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
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Ativo</label>
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
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>
                  Categoria
                  <GestaoOsRequiredMark />
                </label>
                <StringSingleSelectDropdown
                  value={category}
                  onChange={setCategory}
                  options={categoryFormOptions}
                  placeholder="Selecione..."
                  allowEmpty={false}
                />
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>
                  Prioridade
                  <GestaoOsRequiredMark />
                </label>
                <StringSingleSelectDropdown
                  value={priority}
                  onChange={(v) => setPriority((v as GestaoOsPriority) || 'MEDIUM')}
                  options={priorityFormOptions}
                  placeholder="Selecione..."
                  allowEmpty={false}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={GESTAO_OS_FORM_LABEL_CLS}>
                  Descrição
                  <GestaoOsRequiredMark />
                </label>
                <textarea
                  className={FORM_FIELD_TEXTAREA_CLS}
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex.: lâmpada queimada no corredor, vazamento sob a pia, ar-condicionado sem refrigerar..."
                />
              </div>
              <div className="sm:col-span-2">
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Anexos</label>
                <GestaoOsAttachmentsField
                  files={attachments}
                  uploading={uploading}
                  onFilesSelect={(selected) => void uploadFiles(selected)}
                  onRemove={(url) =>
                    setAttachments((prev) => prev.filter((item) => item.url !== url))
                  }
                />
              </div>
            </div>

            <GestaoOsModalFooter>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
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
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Salvando...' : 'Abrir chamado'}
              </button>
            </GestaoOsModalFooter>
          </div>
        </Modal>

        <Modal
          isOpen={Boolean(detailId)}
          onClose={() => {
            setDetailId(null);
            setDetailTab('resumo');
          }}
          showCloseButton={false}
          scrollContent={false}
          contentClassName="!p-0"
          size="xl"
          panelClassName={
            detailTab === 'comentarios'
              ? '!max-h-[min(92dvh,calc(100dvh-2rem))] h-[min(92dvh,calc(100dvh-2rem))]'
              : 'max-h-[min(92dvh,calc(100dvh-2rem))]'
          }
        >
          <GestaoOsDetailModalChrome
            title={detail ? formatGestaoOsLabel(detail) : 'Detalhe do chamado'}
            tabs={[...MEUS_CHAMADOS_DETAIL_TABS]}
            activeTab={detailTab}
            onTabChange={(id) => setDetailTab(id as MeusChamadosDetailTab)}
            fillBody={detailTab === 'comentarios'}
            onClose={() => {
              setDetailId(null);
              setDetailTab('resumo');
            }}
          >
            {loadingDetail || !detail ? (
              <div className="py-10 text-center text-sm text-gray-500">Carregando...</div>
            ) : (
              <div
                className={
                  detailTab === 'comentarios'
                    ? 'flex h-full min-h-0 flex-col text-sm'
                    : 'space-y-5 text-sm'
                }
              >
                {detailTab === 'resumo' ? (
                  <GestaoOsChamadoResumo
                    detail={detail}
                    formatDateTime={formatDateTime}
                    showRequester={false}
                  />
                ) : null}

                {detailTab === 'checklist' ? (
                  (Array.isArray(detail.safetyChecklistResponses) &&
                    detail.safetyChecklistResponses.length > 0) ||
                  (Array.isArray(detail.checklistResponses) &&
                    detail.checklistResponses.length > 0) ? (
                    <div className="space-y-6">
                      {Array.isArray(detail.safetyChecklistResponses) &&
                      detail.safetyChecklistResponses.length > 0 ? (
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                            Segurança do Trabalho
                          </p>
                          <GestaoOsChecklistField
                            items={detail.safetyChecklistResponses}
                            readOnly
                          />
                        </div>
                      ) : null}
                      {Array.isArray(detail.checklistResponses) &&
                      detail.checklistResponses.length > 0 ? (
                        <div className="space-y-3">
                          {Array.isArray(detail.safetyChecklistResponses) &&
                          detail.safetyChecklistResponses.length > 0 ? (
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                              Checklist da execução
                            </p>
                          ) : null}
                          <GestaoOsChecklistField items={detail.checklistResponses} readOnly />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <GestaoOsEmptyTab>Nenhum checklist neste chamado.</GestaoOsEmptyTab>
                  )
                ) : null}

                {detailTab === 'documentos' ? <GestaoOsDocumentsTab detail={detail} /> : null}

                {detailTab === 'historico' ? (
                  detail.events && detail.events.length > 0 ? (
                    <GestaoOsHistoryList
                      events={detail.events}
                      status={detail.status}
                      formatDateTime={formatDateTime}
                    />
                  ) : (
                    <GestaoOsEmptyTab>Nenhum histórico neste chamado.</GestaoOsEmptyTab>
                  )
                ) : null}

                {detailTab === 'comentarios' ? (
                  <GestaoOsCommentsSection
                    workOrderId={detail.id}
                    currentUserId={user.id}
                  />
                ) : null}
              </div>
            )}
          </GestaoOsDetailModalChrome>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
