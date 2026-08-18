'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ClipboardList,
  Eye,
  Filter,
  Link2,
  Search,
  Sparkles,
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
import { AppTabButton } from '@/components/ui/AppTabButton';
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
import { Checkbox } from '@/components/ui/Checkbox';
import { SignaturePad } from '@/components/gestao-os/SignaturePad';
import { GestaoOsAttachmentsField } from '@/components/gestao-os/GestaoOsAttachmentsField';
import { GestaoOsCommentsSection } from '@/components/gestao-os/GestaoOsCommentsSection';
import { GestaoOsPartsEditor } from '@/components/gestao-os/GestaoOsPartsEditor';
import {
  GESTAO_OS_FORM_LABEL_CLS,
  GestaoOsAssetHistoryCard,
  GestaoOsChamadoResumo,
  GestaoOsChecklistField,
  GestaoOsDetailModalChrome,
  GestaoOsDocumentsTab,
  GestaoOsEmptyTab,
  GestaoOsHistoryList,
  GestaoOsModalFooter,
  GestaoOsRecurrenceBanner,
  GestaoOsRequiredMark,
  gestaoOsTechnicianSelectOptions,
  type GestaoOsAssetHistory
} from '@/components/gestao-os/GestaoOsModalUi';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import {
  GESTAO_OS_SLA_DOT,
  GESTAO_OS_SLA_LABEL,
  GestaoOsAttachment,
  GestaoOsChecklistResponseItem,
  GestaoOsLocationTree,
  GestaoOsMaintenanceType,
  GestaoOsPartLine,
  GestaoOsPriority,
  GestaoOsServiceCategory,
  GestaoOsStatus,
  GestaoOsWorkOrder,
  MAINTENANCE_TYPE_LABELS,
  PRIORITY_LABELS,
  SERVICE_CATEGORIES,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  cloneGestaoOsSafetyChecklist,
  formatGestaoOsLabel,
  formatGestaoOsNumber,
  gestaoOsSlaState,
  isGestaoOsSafetyChecklistComplete
} from './gestaoOsTypes';
import { useGestaoOsCompany } from './useGestaoOsCompany';

function allowedTransitionsByPermission(opts: {
  from: GestaoOsStatus;
  next: GestaoOsStatus[];
  isAdmin: boolean;
  canAnalisar: boolean;
  canExecutar: boolean;
  canEncerrar: boolean;
}): GestaoOsStatus[] {
  const { from, next, isAdmin, canAnalisar, canExecutar, canEncerrar } = opts;
  if (isAdmin) return next;

  return next.filter((to) => {
    if (to === 'CANCELLED') return canAnalisar || from === 'OPEN';
    if (from === 'OPEN' && to === 'UNDER_REVIEW') return canAnalisar;
    if (from === 'UNDER_REVIEW' && to === 'APPROVED') return canAnalisar;
    if (
      (from === 'APPROVED' && to === 'IN_PROGRESS') ||
      (from === 'SAFETY_CHECK' && to === 'IN_PROGRESS') ||
      (from === 'IN_PROGRESS' && (to === 'WAITING_PARTS' || to === 'COMPLETED')) ||
      (from === 'WAITING_PARTS' && (to === 'IN_PROGRESS' || to === 'COMPLETED')) ||
      (from === 'REWORK' && to === 'IN_PROGRESS')
    ) {
      return canExecutar || canAnalisar;
    }
    if (from === 'COMPLETED' && (to === 'CLOSED' || to === 'REWORK')) return canEncerrar || canAnalisar;
    return canAnalisar;
  });
}

type Technician = {
  id: string;
  name: string;
  email?: string;
  cpf?: string | null;
  profilePhotoUrl?: string | null;
};

type GestaoOsChamadoDetailTab =
  | 'resumo'
  | 'fluxo'
  | 'ativo'
  | 'checklist'
  | 'documentos'
  | 'historico'
  | 'comentarios';

const CHAMADO_DETAIL_TABS: ReadonlyArray<{ id: GestaoOsChamadoDetailTab; label: string }> = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'fluxo', label: 'Fluxo' },
  { id: 'ativo', label: 'Ativo' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'historico', label: 'Timeline' },
  { id: 'comentarios', label: 'Comentários' }
];

const PHASE_TABS: ReadonlyArray<{ id: GestaoOsStatus; label: string }> = [
  { id: 'OPEN', label: 'Aberta' },
  { id: 'UNDER_REVIEW', label: 'Em Análise' },
  { id: 'APPROVED', label: 'Aprovada' },
  { id: 'IN_PROGRESS', label: 'Em Execução' },
  { id: 'WAITING_PARTS', label: 'Aguardando Peça/Terceiro' },
  { id: 'COMPLETED', label: 'Concluída' },
  { id: 'REWORK', label: 'Aguardando Ajuste' },
  { id: 'CLOSED', label: 'Encerrada/Avaliada' },
  { id: 'CANCELLED', label: 'Cancelada' }
];

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

export default function SistemaGestaoOsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const {
    isAdmin,
    canAnalisar,
    canExecutar,
    canEncerrar,
    isLoading: loadingCompany
  } = useGestaoOsCompany();

  const [search, setSearch] = useState('');
  const [activePhase, setActivePhase] = useState<GestaoOsStatus>('OPEN');
  const [priorityFilter, setPriorityFilter] = useState<GestaoOsPriority | ''>('');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<GestaoOsChamadoDetailTab>('resumo');

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
  const [signatureRequesterUrl, setSignatureRequesterUrl] = useState<string | null>(null);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [checklistDraft, setChecklistDraft] = useState<GestaoOsChecklistResponseItem[]>([]);
  const [safetyChecklistDraft, setSafetyChecklistDraft] = useState<GestaoOsChecklistResponseItem[]>(
    []
  );
  const [safetyPhotoUrl, setSafetyPhotoUrl] = useState<string | null>(null);
  const [uploadingSafetyPhoto, setUploadingSafetyPhoto] = useState(false);
  const [parts, setParts] = useState<GestaoOsPartLine[]>([]);
  const [startPhotoUrl, setStartPhotoUrl] = useState<string | null>(null);
  const [endPhotoUrl, setEndPhotoUrl] = useState<string | null>(null);
  const [uploadingStartPhoto, setUploadingStartPhoto] = useState(false);
  const [uploadingEndPhoto, setUploadingEndPhoto] = useState(false);
  const [relatedWorkOrderId, setRelatedWorkOrderId] = useState('');
  const [autoAssign, setAutoAssign] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const slaCheckedRef = useRef(false);

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
  const companyParams = useMemo(() => ({}), []);
  const canCreate = false;

  const {
    data: rows = [],
    isLoading: loadingRows
  } = useQuery({
    queryKey: ['gestao-os-list', search, activePhase, priorityFilter, buildingFilter, overdueOnly],
    enabled: !loadingCompany,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsWorkOrder[] }>('/gestao-os', {
        params: {
          search: search || undefined,
          status: overdueOnly ? undefined : activePhase,
          overdue: overdueOnly ? '1' : undefined,
          priority: priorityFilter || undefined,
          buildingId: buildingFilter || undefined
        }
      });
      return res.data?.data ?? [];
    }
  });

  const { data: summary } = useQuery({
    queryKey: ['gestao-os-summary'],
    enabled: !loadingCompany,
    queryFn: async () => {
      const res = await api.get('/gestao-os/summary');
      return res.data?.data as {
        byStatus: Partial<Record<GestaoOsStatus, number>>;
        openLike: number;
        total: number;
        overdue?: number;
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
    if (loadingCompany || !summary || slaCheckedRef.current) return;
    slaCheckedRef.current = true;
    api
      .post('/gestao-os/sla/check-warnings', {})
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['gestao-os-list'] });
      })
      .catch(() => {
        /* alertas de SLA são best-effort */
      });
  }, [loadingCompany, summary, queryClient]);

  useEffect(() => {
    if (!createOpen) return;
    setOpenedAtLabel(formatDateTime(new Date().toISOString()));
  }, [createOpen]);

  const { data: locationTree = [] } = useQuery({
    queryKey: ['gestao-os-locations'],
    enabled: !loadingCompany,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsLocationTree }>(
        '/gestao-os/locations'
      );
      return res.data?.data ?? [];
    }
  });

  const { data: serviceCategories = [] } = useQuery({
    queryKey: ['gestao-os-categories'],
    enabled: !loadingCompany,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsServiceCategory[] }>(
        '/gestao-os/cadastros/categories',
        { params: companyParams }
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
    setQrHandled(true);
    router.replace(`/ponto/meus-chamados?qr=${encodeURIComponent(qr)}`);
  }, [searchParams, qrHandled, router]);

  useEffect(() => {
    const overdue = searchParams?.get('overdue');
    if (overdue === '1' || overdue === 'true') setOverdueOnly(true);
    // Só aplica o atalho da URL na entrada da página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = searchParams?.get('id');
    if (!id) return;
    setDetailId(id);
    setDetailTab('resumo');
  }, [searchParams]);

  const { data: technicians = [] } = useQuery({
    queryKey: ['gestao-os-technicians'],
    enabled: !loadingCompany,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Technician[] }>('/gestao-os/technicians', {
        params: companyParams
      });
      return res.data?.data ?? [];
    }
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['gestao-os-detail', detailId],
    enabled: Boolean(detailId),
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsWorkOrder }>(
        `/gestao-os/${detailId}`,
        { params: companyParams }
      );
      return res.data?.data;
    }
  });

  const { data: assetHistory } = useQuery({
    queryKey: ['gestao-os-asset-history', detail?.assetId],
    enabled: Boolean(detailId && detail?.assetId),
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsAssetHistory }>(
        `/gestao-os/assets/${detail?.assetId}/history`
      );
      return res.data?.data;
    }
  });

  const { data: createAssetHistory } = useQuery({
    queryKey: ['gestao-os-asset-history-create', assetId],
    enabled: createOpen && Boolean(assetId),
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsAssetHistory }>(
        `/gestao-os/assets/${assetId}/history`
      );
      return res.data?.data;
    }
  });

  useEffect(() => {
    if (!detail) return;
    setChecklistDraft(
      Array.isArray(detail.checklistResponses)
        ? detail.checklistResponses.map((item) => ({ ...item }))
        : []
    );
    const hasSafety =
      detail.status === 'APPROVED' ||
      detail.status === 'SAFETY_CHECK' ||
      (Array.isArray(detail.safetyChecklistResponses) &&
        detail.safetyChecklistResponses.length > 0);
    setSafetyChecklistDraft(hasSafety ? cloneGestaoOsSafetyChecklist(detail.safetyChecklistResponses) : []);
    setSafetyPhotoUrl(detail.safetyPhotoUrl ?? null);
    setParts(Array.isArray(detail.parts) ? detail.parts.map((p) => ({ ...p })) : []);
    setStartPhotoUrl(detail.startPhotoUrl ?? null);
    setEndPhotoUrl(detail.endPhotoUrl ?? null);
    setRelatedWorkOrderId(detail.relatedWorkOrderId ?? '');
    setAutoAssign(false);
    setActivePhase(detail.status);
    if (detail.status === 'APPROVED' || detail.status === 'SAFETY_CHECK') {
      setTransitionStatus('IN_PROGRESS');
    } else if (detail.status === 'REWORK') setTransitionStatus('IN_PROGRESS');
    else setTransitionStatus('');
    // Recarrega ao abrir outro chamado ou mudar de fase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id, detail?.status]);

  const sectors = useMemo(() => {
    return locationTree.find((b) => b.id === buildingId)?.sectors ?? [];
  }, [locationTree, buildingId]);

  const places = useMemo(() => {
    return sectors.find((s) => s.id === sectorId)?.places ?? [];
  }, [sectors, sectorId]);

  const assets = useMemo(() => {
    return places.find((p) => p.id === placeId)?.assets ?? [];
  }, [places, placeId]);

  const hasActiveFilters = Boolean(priorityFilter || buildingFilter || overdueOnly);

  const clearFilters = () => {
    setPriorityFilter('');
    setBuildingFilter('');
    setOverdueOnly(false);
  };

  const priorityFilterOptions = useMemo(
    () =>
      labeledToSelectOptions(
        (Object.keys(PRIORITY_LABELS) as GestaoOsPriority[]).map((key) => ({
          value: key,
          label: PRIORITY_LABELS[key]
        }))
      ),
    []
  );

  const buildingFilterOptions = useMemo(
    () =>
      labeledToSelectOptions(
        locationTree.map((b) => ({
          value: b.id,
          label: b.name,
          searchText: `${b.name} ${b.code ?? ''}`
        }))
      ),
    [locationTree]
  );

  const buildingFormOptions = buildingFilterOptions;

  const sectorFormOptions = useMemo(
    () =>
      labeledToSelectOptions(
        sectors.map((s) => ({
          value: s.id,
          label: s.name,
          searchText: `${s.name} ${s.code ?? ''}`
        }))
      ),
    [sectors]
  );

  const placeFormOptions = useMemo(
    () =>
      labeledToSelectOptions(
        places.map((p) => ({
          value: p.id,
          label: p.name,
          searchText: `${p.name} ${p.code ?? ''}`
        }))
      ),
    [places]
  );

  const assetFormOptions = useMemo(
    () =>
      labeledToSelectOptions(
        assets.map((a) => ({
          value: a.id,
          label: a.category ? `${a.name} (${a.category})` : a.name,
          searchText: `${a.name} ${a.category ?? ''} ${a.code ?? ''}`
        }))
      ),
    [assets]
  );

  const categoryFormOptions = useMemo(
    () => labeledToSelectOptions(categoryOptions.map((name) => ({ value: name, label: name }))),
    [categoryOptions]
  );

  const priorityFormOptions = priorityFilterOptions;

  const openDetail = (row: GestaoOsWorkOrder) => {
    setDetailId(row.id);
    setDetailTab('resumo');
    setTransitionStatus('');
    setMaintenanceType(row.maintenanceType || '');
    setAssigneeId(row.assigneeId || '');
    setSignatureRequesterUrl(null);
    setChecklistDraft(
      Array.isArray(row.checklistResponses)
        ? row.checklistResponses.map((item) => ({ ...item }))
        : []
    );
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
      setActivePhase('OPEN');
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-list'] });
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-summary'] });
      setDetailTab('resumo');
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
        ratingComment: transitionStatus === 'CLOSED' ? ratingComment || undefined : undefined,
        signatureRequesterUrl:
          transitionStatus === 'CLOSED' ? signatureRequesterUrl || undefined : undefined,
        checklistResponses: checklistDraft.length ? checklistDraft : undefined,
        safetyChecklistResponses: safetyChecklistDraft.length ? safetyChecklistDraft : undefined,
        safetyPhotoUrl: safetyPhotoUrl || undefined,
        parts:
          transitionStatus === 'WAITING_PARTS' ||
          detail?.status === 'WAITING_PARTS' ||
          parts.length > 0
            ? parts
            : undefined,
        startPhotoUrl: startPhotoUrl || undefined,
        endPhotoUrl: endPhotoUrl || undefined,
        relatedWorkOrderId: relatedWorkOrderId.trim() || undefined,
        autoAssign: autoAssign || undefined
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
      setSignatureRequesterUrl(null);
      if (updated?.status) setActivePhase(updated.status);
      setDetailId(null);
      setDetailTab('resumo');
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-list'] });
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-detail', detailId] });
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-technicians'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Não foi possível atualizar o status');
    }
  });

  const saveSignatureDataUrl = async (dataUrl: string) => {
    setUploadingSignature(true);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const form = new FormData();
      form.append('file', blob, `assinatura-${Date.now()}.png`);
      const res = await api.post('/gestao-os/upload-attachment', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: companyParams
      });
      const url = res.data?.data?.url as string | undefined;
      if (!url) throw new Error('URL da assinatura não retornada');
      setSignatureRequesterUrl(url);
      toast.success('Assinatura anexada');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Falha ao salvar assinatura');
    } finally {
      setUploadingSignature(false);
    }
  };

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

  const uploadSafetyPhoto = async (files: FileList | File[] | null) => {
    const list = !files ? [] : Array.from(files);
    const file = list.find((item) => item.type.startsWith('image/')) ?? list[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
      toast.error('Envie uma foto (PNG ou JPG)');
      return;
    }
    setUploadingSafetyPhoto(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/gestao-os/upload-attachment', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const url = res.data?.data?.url as string | undefined;
      if (!url) throw new Error('URL da foto não retornada');
      setSafetyPhotoUrl(url);
      toast.success('Foto de EPIs enviada');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Falha no upload da foto');
    } finally {
      setUploadingSafetyPhoto(false);
    }
  };

  const uploadPhoto = async (
    files: FileList | File[] | null,
    setUrl: (url: string) => void,
    setBusy: (busy: boolean) => void
  ) => {
    const list = !files ? [] : Array.from(files);
    const file = list.find((item) => item.type.startsWith('image/')) ?? list[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
      toast.error('Envie uma foto (PNG ou JPG)');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/gestao-os/upload-attachment', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const url = res.data?.data?.url as string | undefined;
      if (!url) throw new Error('URL da foto não retornada');
      setUrl(url);
      toast.success('Foto enviada');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Falha no upload da foto');
    } finally {
      setBusy(false);
    }
  };

  const handleSuggestAssignee = async () => {
    if (!detail) return;
    setSuggesting(true);
    try {
      const res = await api.get<{ success: boolean; data: { id: string; name: string } | null }>(
        '/gestao-os/suggest-assignee',
        {
          params: {
            buildingId: detail.buildingId || undefined,
            category: detail.category || undefined
          }
        }
      );
      const suggestion = res.data?.data;
      if (!suggestion?.id) {
        toast.error('Nenhum técnico sugerido');
        return;
      }
      setAssigneeId(suggestion.id);
      toast.success(`Técnico sugerido: ${suggestion.name}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Falha ao sugerir técnico');
    } finally {
      setSuggesting(false);
    }
  };

  const nextStatuses = detail
    ? allowedTransitionsByPermission({
        from: detail.status,
        next: STATUS_TRANSITIONS[detail.status],
        isAdmin,
        canAnalisar,
        canExecutar,
        canEncerrar
      })
    : [];

  const nextStatusOptions = useMemo(
    () =>
      labeledToSelectOptions(
        nextStatuses.map((status) => ({ value: status, label: STATUS_LABELS[status] }))
      ),
    [nextStatuses]
  );

  const maintenanceTypeOptions = useMemo(
    () =>
      labeledToSelectOptions(
        (Object.keys(MAINTENANCE_TYPE_LABELS) as GestaoOsMaintenanceType[]).map((key) => ({
          value: key,
          label: MAINTENANCE_TYPE_LABELS[key]
        }))
      ),
    []
  );

  const technicianOptions = useMemo(
    () => gestaoOsTechnicianSelectOptions(technicians),
    [technicians]
  );

  const ratingOptions = useMemo(
    () => labeledToSelectOptions([1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))),
    []
  );

  const checklistEditable = Boolean(
    detail &&
      checklistDraft.length > 0 &&
      (isAdmin || canExecutar) &&
      detail.status !== 'CLOSED' &&
      detail.status !== 'CANCELLED'
  );

  const safetyEditable = Boolean(
    detail &&
      (isAdmin || canExecutar || canAnalisar) &&
      (detail.status === 'APPROVED' || detail.status === 'SAFETY_CHECK')
  );

  const safetyReady = isGestaoOsSafetyChecklistComplete(safetyChecklistDraft) && Boolean(safetyPhotoUrl);

  const assetHistoryCard = assetHistory ? (
    <GestaoOsAssetHistoryCard
      history={assetHistory}
      currentId={detail?.id}
      onOpenWorkOrder={(id) => {
        setDetailId(id);
        setDetailTab('resumo');
        router.replace(`/ponto/sistema-gestao-os?id=${id}`);
      }}
    />
  ) : null;

  const createRecurrenceCount =
    (createAssetHistory?.recurrence90dCount ?? 0) + (assetId ? 1 : 0);
  const createAssetRecurrenceBanner =
    createRecurrenceCount >= 3 ? (
      <GestaoOsRecurrenceBanner count={createRecurrenceCount} predicted />
    ) : null;

  if (loadingUser || loadingCompany) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/sistema-gestao-os">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Central de Chamados
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Visão geral operacional: acompanhe todos os chamados por fase, filtre e avance o
              fluxo. Para abrir um chamado, use Meus Chamados.
            </p>
          </div>

          <div className="scroll-mt-4">
            <div className="bg-transparent px-2">
              <nav className="-mb-px flex flex-wrap justify-center gap-x-1 gap-y-2 overflow-visible py-3 sm:gap-x-2">
                {PHASE_TABS.map((tab) => {
                  const active = activePhase === tab.id;
                  return (
                    <AppTabButton
                      key={tab.id}
                      active={!overdueOnly && active}
                      onClick={() => {
                        setOverdueOnly(false);
                        setActivePhase(tab.id);
                      }}
                      className="flex items-center gap-2 whitespace-nowrap px-2 py-2 text-xs font-medium sm:px-3 sm:text-sm"
                    >
                      {tab.label}
                      <span className="app-tab__badge">
                        <TabCountBadge count={phaseCounts[tab.id] ?? 0} active={active} tone="red" />
                      </span>
                    </AppTabButton>
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
                      {overdueOnly ? 'Atrasadas' : STATUS_LABELS[activePhase]}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {overdueOnly
                        ? `${rows.length} chamado${rows.length === 1 ? '' : 's'} fora do SLA`
                        : summary?.total != null
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
                  <button
                    type="button"
                    onClick={() => setIsFiltersModalOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasActiveFilters
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtros"
                    title={hasActiveFilters ? 'Filtros ativos' : 'Filtros'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilters ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                  {canCreate ? (
                    <button
                      type="button"
                      onClick={() => setCreateOpen(true)}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <ClipboardList className="h-4 w-4" />
                      Novo chamado
                    </button>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {loadingRows ? (
                <CadastroListLoading message="Carregando chamados..." />
              ) : rows.length === 0 ? (
                <CadastroListEmpty
                  icon={ClipboardList}
                  title="Nenhum chamado nesta fase"
                  hint={
                    search.trim() || hasActiveFilters
                      ? 'Tente ajustar a busca ou os filtros'
                      : 'Escolha outra fase ou abra um chamado em Meus Chamados'
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
                        <col className="w-36" />
                        <col className="w-40" />
                        <col className="w-44" />
                        <col className="w-48" />
                        <col className="w-[4%]" />
                      </colgroup>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>ID</th>
                          <th className={cadastroListClasses.th}>Local / Ativo</th>
                          <th className={cadastroListClasses.thCenter}>Prioridade</th>
                          <th className={cadastroListClasses.thCenter}>Categoria</th>
                          <th className={cadastroListClasses.thCenter}>Solicitante</th>
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
                              {(() => {
                                const sla = gestaoOsSlaState(row);
                                return (
                                  <span className="inline-flex items-center gap-1.5">
                                    {sla ? (
                                      <span
                                        className={`h-2 w-2 shrink-0 rounded-full ${GESTAO_OS_SLA_DOT[sla]}`}
                                        title={GESTAO_OS_SLA_LABEL[sla]}
                                        aria-label={GESTAO_OS_SLA_LABEL[sla]}
                                      />
                                    ) : null}
                                    {formatGestaoOsNumber(row)}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className={cadastroListClasses.td}>
                              <ListRowNavigableLabel className="whitespace-normal break-words text-sm text-gray-600 dark:text-gray-400">
                                {row.locationLabel || '—'}
                              </ListRowNavigableLabel>
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
                            <td className={`${cadastroListClasses.tdCenter} min-w-0`}>
                              <span className="flex justify-center">
                                <span className="max-w-full truncate text-sm text-gray-600 dark:text-gray-400">
                                  {row.requester?.name || '—'}
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
          isOpen={isFiltersModalOpen}
          onClose={() => setIsFiltersModalOpen(false)}
          title="Filtros"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Prioridade
              </label>
              <StringSingleSelectDropdown
                value={priorityFilter}
                onChange={(v) => setPriorityFilter((v as GestaoOsPriority | '') || '')}
                options={priorityFilterOptions}
                placeholder="Todas"
                emptyOptionLabel="Todas"
                allowEmpty
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Prédio
              </label>
              <StringSingleSelectDropdown
                value={buildingFilter}
                onChange={setBuildingFilter}
                options={buildingFilterOptions}
                placeholder="Todos"
                emptyOptionLabel="Todos"
                allowEmpty
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Prazo
              </label>
              <button
                type="button"
                onClick={() => setOverdueOnly((v) => !v)}
                className={`inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                  overdueOnly
                    ? 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
                title="Mostrar só OS fora do prazo"
              >
                <AlertTriangle className="h-4 w-4" />
                Atrasadas
                {typeof summary?.overdue === 'number' && summary.overdue > 0 ? (
                  <span className="tabular-nums">{summary.overdue}</span>
                ) : null}
              </button>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(false)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Aplicar
              </button>
            </div>
          </div>
        </Modal>

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
              {createAssetRecurrenceBanner ? (
                <div className="sm:col-span-2">{createAssetRecurrenceBanner}</div>
              ) : null}
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
            tabs={[...CHAMADO_DETAIL_TABS]}
            activeTab={detailTab}
            onTabChange={(id) => setDetailTab(id as GestaoOsChamadoDetailTab)}
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
                  <GestaoOsChamadoResumo detail={detail} formatDateTime={formatDateTime} />
                ) : null}

                {detailTab === 'fluxo' ? (
                  nextStatuses.length > 0 ? (
                    <div className="space-y-4">
                      {detail.status === 'OPEN' ? (
                        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                          Na primeira análise (Em Análise), o sistema cria a OS e atribui o número
                          da ordem de serviço.
                        </p>
                      ) : null}
                      {detail.status === 'APPROVED' || detail.status === 'SAFETY_CHECK' ? (
                        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                          Antes de iniciar a execução, preencha o checklist de segurança do trabalho
                          e envie a foto com os EPIs na aba{' '}
                          <button
                            type="button"
                            onClick={() => setDetailTab('checklist')}
                            className="font-semibold text-red-600 hover:underline dark:text-red-400"
                          >
                            Checklist
                          </button>
                          .
                        </p>
                      ) : null}
                      {detail.status === 'COMPLETED' ? (
                        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                          Se o resultado não foi aceito, envie para Aguardando Ajuste. O técnico
                          volta para execução sem passar de novo pelo checklist de SST.
                        </p>
                      ) : null}
                      {detail.status === 'REWORK' ? (
                        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                          O serviço precisa de correção. Avance para Em Execução para o técnico
                          retomar o ajuste.
                        </p>
                      ) : null}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label className={GESTAO_OS_FORM_LABEL_CLS}>Próximo status</label>
                          <StringSingleSelectDropdown
                            value={transitionStatus}
                            onChange={(v) => setTransitionStatus((v as GestaoOsStatus) || '')}
                            options={nextStatusOptions}
                            placeholder="Selecione..."
                            emptyOptionLabel="Selecione..."
                            allowEmpty
                          />
                        </div>

                        {(transitionStatus === 'APPROVED' ||
                          transitionStatus === 'UNDER_REVIEW' ||
                          detail.status === 'UNDER_REVIEW') && (
                          <>
                            <div>
                              <label className={`${GESTAO_OS_FORM_LABEL_CLS} flex h-5 items-center`}>
                                Tipo de manutenção
                              </label>
                              <StringSingleSelectDropdown
                                value={maintenanceType}
                                onChange={(v) =>
                                  setMaintenanceType((v as GestaoOsMaintenanceType) || '')
                                }
                                options={maintenanceTypeOptions}
                                placeholder="Selecione..."
                                emptyOptionLabel="Selecione..."
                                allowEmpty
                              />
                            </div>
                            <div>
                              <div className="mb-1.5 flex h-5 items-center justify-between gap-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  Técnico responsável
                                </label>
                                <button
                                  type="button"
                                  disabled={suggesting}
                                  onClick={() => void handleSuggestAssignee()}
                                  title="Preenche o técnico com menos chamados abertos, priorizando quem já atende este prédio."
                                  className="inline-flex items-center gap-1 text-xs font-medium text-red-600 transition-colors hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                                >
                                  <Sparkles className="h-3.5 w-3.5" />
                                  {suggesting ? 'Sugerindo…' : 'Sugerir'}
                                </button>
                              </div>
                              <StringSingleSelectDropdown
                                value={assigneeId}
                                onChange={setAssigneeId}
                                options={technicianOptions}
                                placeholder="Não atribuído"
                                emptyOptionLabel="Não atribuído"
                                allowEmpty
                              />
                              <div className="mt-2">
                                <Checkbox
                                  checked={autoAssign}
                                  onChange={setAutoAssign}
                                  label="Atribuir automaticamente (menor carga)"
                                />
                              </div>
                            </div>
                          </>
                        )}

                        {transitionStatus === 'CANCELLED' ? (
                          <div className="sm:col-span-2">
                            <label className={GESTAO_OS_FORM_LABEL_CLS}>
                              Justificativa do cancelamento
                              <GestaoOsRequiredMark />
                            </label>
                            <textarea
                              className={FORM_FIELD_TEXTAREA_CLS}
                              rows={3}
                              value={cancelReason}
                              onChange={(e) => setCancelReason(e.target.value)}
                            />
                          </div>
                        ) : null}

                        {transitionStatus === 'CLOSED' ? (
                          <>
                            <div>
                              <label className={GESTAO_OS_FORM_LABEL_CLS}>Avaliação (1–5)</label>
                              <StringSingleSelectDropdown
                                value={rating}
                                onChange={setRating}
                                options={ratingOptions}
                                placeholder="Selecione..."
                                allowEmpty={false}
                              />
                            </div>
                            <div>
                              <label className={GESTAO_OS_FORM_LABEL_CLS}>
                                Comentário da avaliação
                              </label>
                              <input
                                className={FORM_FIELD_INPUT_CLS}
                                value={ratingComment}
                                onChange={(e) => setRatingComment(e.target.value)}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={GESTAO_OS_FORM_LABEL_CLS}>
                                Assinatura do solicitante
                              </label>
                              {signatureRequesterUrl ? (
                                <div className="flex flex-wrap items-center gap-3">
                                  <img
                                    src={resolveApiMediaUrl(signatureRequesterUrl) ?? undefined}
                                    alt="Prévia da assinatura"
                                    className="max-h-24 rounded-lg border border-gray-200 bg-white object-contain dark:border-gray-700"
                                  />
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-rose-600 hover:underline"
                                    onClick={() => setSignatureRequesterUrl(null)}
                                  >
                                    Refazer
                                  </button>
                                </div>
                              ) : (
                                <SignaturePad
                                  onSave={(dataUrl) => void saveSignatureDataUrl(dataUrl)}
                                />
                              )}
                              {uploadingSignature ? (
                                <p className="mt-1 text-xs text-gray-500">
                                  Enviando assinatura...
                                </p>
                              ) : null}
                            </div>
                          </>
                        ) : null}

                        {transitionStatus === 'WAITING_PARTS' ||
                        detail.status === 'WAITING_PARTS' ? (
                          <div className="sm:col-span-2">
                            <GestaoOsPartsEditor parts={parts} onChange={setParts} />
                            {transitionStatus === 'WAITING_PARTS' && parts.length === 0 ? (
                              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                                Adicione ao menos uma peça para aguardar peça/terceiro.
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {transitionStatus === 'IN_PROGRESS' ? (
                          <div className="sm:col-span-2">
                            <label className={GESTAO_OS_FORM_LABEL_CLS}>
                              Foto de início da execução
                              <GestaoOsRequiredMark />
                            </label>
                            <GestaoOsAttachmentsField
                              files={
                                startPhotoUrl
                                  ? [{ url: startPhotoUrl, name: 'Foto de início', mimeType: 'image/jpeg' }]
                                  : []
                              }
                              uploading={uploadingStartPhoto}
                              onFilesSelect={(selected) =>
                                void uploadPhoto(selected, setStartPhotoUrl, setUploadingStartPhoto)
                              }
                              onRemove={() => setStartPhotoUrl(null)}
                              label="Clique ou arraste a foto"
                              hint="PNG ou JPG"
                              accept="image/*"
                              multiple={false}
                            />
                          </div>
                        ) : null}

                        {transitionStatus === 'COMPLETED' ? (
                          <div className="sm:col-span-2">
                            <label className={GESTAO_OS_FORM_LABEL_CLS}>
                              Foto de conclusão
                              <GestaoOsRequiredMark />
                            </label>
                            <GestaoOsAttachmentsField
                              files={
                                endPhotoUrl
                                  ? [{ url: endPhotoUrl, name: 'Foto de conclusão', mimeType: 'image/jpeg' }]
                                  : []
                              }
                              uploading={uploadingEndPhoto}
                              onFilesSelect={(selected) =>
                                void uploadPhoto(selected, setEndPhotoUrl, setUploadingEndPhoto)
                              }
                              onRemove={() => setEndPhotoUrl(null)}
                              label="Clique ou arraste a foto"
                              hint="PNG ou JPG"
                              accept="image/*"
                              multiple={false}
                            />
                          </div>
                        ) : null}

                        <div className="sm:col-span-2">
                          <label className={GESTAO_OS_FORM_LABEL_CLS}>
                            <span className="inline-flex items-center gap-1.5">
                              <Link2 className="h-3.5 w-3.5" />
                              OS relacionada (ID)
                            </span>
                          </label>
                          <input
                            className={FORM_FIELD_INPUT_CLS}
                            value={relatedWorkOrderId}
                            onChange={(e) => setRelatedWorkOrderId(e.target.value)}
                            placeholder="Cole o ID de outra OS relacionada"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className={GESTAO_OS_FORM_LABEL_CLS}>
                            {transitionStatus === 'REWORK' ? (
                              <>
                                O que precisa ser ajustado
                                <GestaoOsRequiredMark />
                              </>
                            ) : (
                              'Observação / relato'
                            )}
                          </label>
                          <textarea
                            className={FORM_FIELD_TEXTAREA_CLS}
                            rows={3}
                            value={transitionNote}
                            onChange={(e) => setTransitionNote(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          disabled={
                            !transitionStatus ||
                            transitionMutation.isPending ||
                            uploadingStartPhoto ||
                            uploadingEndPhoto ||
                            (transitionStatus === 'CANCELLED' && !cancelReason.trim()) ||
                            (transitionStatus === 'REWORK' && !transitionNote.trim()) ||
                            (transitionStatus === 'APPROVED' && !maintenanceType) ||
                            (transitionStatus === 'WAITING_PARTS' && parts.length === 0) ||
                            (transitionStatus === 'IN_PROGRESS' &&
                              (detail.status === 'APPROVED' ||
                                detail.status === 'SAFETY_CHECK') &&
                              !startPhotoUrl) ||
                            (transitionStatus === 'COMPLETED' && !endPhotoUrl) ||
                            (transitionStatus === 'IN_PROGRESS' &&
                              (detail.status === 'APPROVED' ||
                                detail.status === 'SAFETY_CHECK') &&
                              !safetyReady)
                          }
                          onClick={() => transitionMutation.mutate()}
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {transitionMutation.isPending ? 'Atualizando...' : 'Confirmar transição'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <GestaoOsEmptyTab>
                      Esta solicitação está {STATUS_LABELS[detail.status].toLowerCase()} — sem
                      novas transições.
                    </GestaoOsEmptyTab>
                  )
                ) : null}

                {detailTab === 'ativo' ? (
                  assetHistoryCard ?? (
                    <GestaoOsEmptyTab>Nenhum ativo vinculado a este chamado.</GestaoOsEmptyTab>
                  )
                ) : null}

                {detailTab === 'checklist' ? (
                  safetyChecklistDraft.length > 0 || checklistDraft.length > 0 ? (
                    <div className="space-y-6">
                      {safetyChecklistDraft.length > 0 ? (
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                              Segurança do Trabalho
                            </p>
                            {safetyEditable ? (
                              <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                                Marque os equipamentos e condições e envie a foto com os EPIs. Itens
                                com * são obrigatórios.
                              </p>
                            ) : null}
                          </div>
                          <GestaoOsChecklistField
                            items={safetyChecklistDraft}
                            readOnly={!safetyEditable}
                            onToggle={
                              safetyEditable
                                ? (index, checked) =>
                                    setSafetyChecklistDraft((prev) =>
                                      prev.map((item, i) =>
                                        i === index ? { ...item, checked } : item
                                      )
                                    )
                                : undefined
                            }
                          />
                          <div>
                            <label className={GESTAO_OS_FORM_LABEL_CLS}>
                              Foto com os EPIs
                              {safetyEditable ? <GestaoOsRequiredMark /> : null}
                            </label>
                            {safetyEditable ? (
                              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                                Envie uma foto sua usando os equipamentos de proteção corretos.
                              </p>
                            ) : null}
                            {safetyEditable ? (
                              <GestaoOsAttachmentsField
                                files={
                                  safetyPhotoUrl
                                    ? [
                                        {
                                          url: safetyPhotoUrl,
                                          name: 'Foto de EPIs',
                                          mimeType: 'image/jpeg'
                                        }
                                      ]
                                    : []
                                }
                                uploading={uploadingSafetyPhoto}
                                onFilesSelect={(selected) => void uploadSafetyPhoto(selected)}
                                onRemove={() => setSafetyPhotoUrl(null)}
                                label="Clique ou arraste a foto"
                                hint="PNG ou JPG"
                                accept="image/*"
                                multiple={false}
                              />
                            ) : safetyPhotoUrl ? (
                              <img
                                src={resolveApiMediaUrl(safetyPhotoUrl) ?? undefined}
                                alt="Foto de EPIs"
                                className="max-h-48 rounded-lg border border-gray-200 object-cover dark:border-gray-700"
                              />
                            ) : (
                              <p className="text-xs text-gray-500">Nenhuma foto enviada.</p>
                            )}
                          </div>
                        </div>
                      ) : null}
                      {checklistDraft.length > 0 ? (
                        <div className="space-y-3">
                          {safetyChecklistDraft.length > 0 ? (
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                              Checklist da execução
                            </p>
                          ) : null}
                          {checklistEditable ? (
                            <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                              Marque os itens conforme a execução. Itens com * são obrigatórios.
                            </p>
                          ) : null}
                          <GestaoOsChecklistField
                            items={checklistDraft}
                            readOnly={!checklistEditable}
                            onToggle={
                              checklistEditable
                                ? (index, checked) =>
                                    setChecklistDraft((prev) =>
                                      prev.map((item, i) =>
                                        i === index ? { ...item, checked } : item
                                      )
                                    )
                                : undefined
                            }
                          />
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
                    <GestaoOsEmptyTab>Nenhum evento na timeline.</GestaoOsEmptyTab>
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
