'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart,
  Plus,
  List,
  X,
  AlertCircle,
  Send,
  Pencil,
  Paperclip,
  ExternalLink,
  Loader2,
  Search,
  Eye
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import toast from 'react-hot-toast';
import { useCostCenters } from '@/hooks/useCostCenters';
import {
  purchaseOrderPhaseLabel,
  ocStatusTextClass,
  OC_STATUS_LABELS_PT
} from '@/components/oc/ocStatusLabels';

/** Rótulo da OC sem prefixo "OC -" para caber melhor na coluna Fase atual. */
function purchaseOrderPhaseShortLabel(status: string): string {
  const full = purchaseOrderPhaseLabel(status);
  return full.replace(/^OC\s*-\s*/i, '').trim() || full;
}

function rmPriorityLabelPt(p: string | undefined): string {
  const m: Record<string, string> = {
    LOW: 'Baixa',
    MEDIUM: 'Média',
    HIGH: 'Alta',
    URGENT: 'Urgente'
  };
  return p ? m[p] || p : '—';
}

function rmStatusLabelPt(status: string): string {
  const m: Record<string, string> = {
    PENDING: 'Pendente',
    IN_REVIEW: 'Correção RM',
    APPROVED: 'Aprovada',
    PARTIALLY_FULFILLED: 'Parcialmente atendida',
    FULFILLED: 'Atendida',
    REJECTED: 'Rejeitada',
    CANCELLED: 'Cancelada'
  };
  return m[status] || status;
}

function rmStatusRowClass(status: string): string {
  if (status === 'APPROVED') return 'text-green-600 dark:text-green-400';
  if (status === 'PENDING') return 'text-amber-600 dark:text-amber-400';
  if (status === 'IN_REVIEW') return 'text-orange-600 dark:text-orange-400';
  if (status === 'REJECTED') return 'text-red-600 dark:text-red-400';
  if (status === 'CANCELLED') return 'text-gray-500 dark:text-gray-400';
  return 'text-gray-600 dark:text-gray-400';
}

type RmListPurchaseOrder = { id: string; status: string; orderNumber?: string | null };

const RM_POST_APPROVAL = new Set(['APPROVED', 'PARTIALLY_FULFILLED', 'FULFILLED']);

function sortPurchaseOrdersForDisplay(orders: RmListPurchaseOrder[]): RmListPurchaseOrder[] {
  return [...orders].sort((a, b) =>
    (a.orderNumber || '').localeCompare(b.orderNumber || '', 'pt-BR', { numeric: true })
  );
}

function materialRequestFaseAtualLines(request: {
  status?: string;
  purchaseOrders?: RmListPurchaseOrder[];
}): { key: string; text: string; className: string }[] {
  const rm = String(request.status || '');
  const pos = Array.isArray(request.purchaseOrders) ? request.purchaseOrders : [];

  if (!RM_POST_APPROVAL.has(rm)) {
    return [{ key: 'rm', text: `SC · ${rmStatusLabelPt(rm)}`, className: rmStatusRowClass(rm) }];
  }

  if (pos.length === 0) {
    if (rm === 'APPROVED') {
      return [{ key: 'rm', text: 'SC aprovada · aguardando OC', className: rmStatusRowClass('APPROVED') }];
    }
    return [{ key: 'rm', text: `SC · ${rmStatusLabelPt(rm)}`, className: rmStatusRowClass(rm) }];
  }

  const sorted = sortPurchaseOrdersForDisplay(pos);
  return [
    { key: 'rm', text: `SC · ${rmStatusLabelPt(rm)}`, className: rmStatusRowClass(rm) },
    ...sorted.map((po) => {
      const num = (po.orderNumber && String(po.orderNumber).trim()) || po.id.slice(0, 8);
      return {
        key: `po-${po.id}`,
        text: `OC ${num} · ${purchaseOrderPhaseShortLabel(po.status)}`,
        className: ocStatusTextClass(po.status)
      };
    })
  ];
}

const RM_FASE_FILTER_ORDER = [
  'PENDING',
  'IN_REVIEW',
  'APPROVED',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'REJECTED',
  'CANCELLED'
] as const;

const OC_FASE_FILTER_ORDER = [
  'DRAFT',
  'PENDING_COMPRAS',
  'PENDING',
  'PENDING_DIRETORIA',
  'IN_REVIEW',
  'APPROVED',
  'PENDING_PROOF_VALIDATION',
  'PENDING_PROOF_CORRECTION',
  'PENDING_NF_ATTACHMENT',
  'SENT',
  'FINALIZED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'REJECTED',
  'CANCELLED'
] as const;

/** Filtro "Fase atual": `rm:STATUS` = fase da SC; `oc:STATUS` = alguma OC com esse status. */
function requestMatchesFaseAtualFilter(
  request: { status?: string; purchaseOrders?: RmListPurchaseOrder[] },
  filterKey: string
): boolean {
  if (!filterKey) return true;
  const pos = Array.isArray(request.purchaseOrders) ? request.purchaseOrders : [];
  if (filterKey.startsWith('rm:')) {
    const s = filterKey.slice(3);
    return String(request.status || '') === s;
  }
  if (filterKey.startsWith('oc:')) {
    const s = filterKey.slice(3);
    return pos.some((po) => po.status === s);
  }
  return true;
}

function rmOsLine(req: { serviceOrder?: string | null; project?: { code?: string | null; name?: string | null } | null; projectId?: string | null }) {
  if (req.serviceOrder?.trim()) return req.serviceOrder.trim();
  if (req.project?.code || req.project?.name) {
    return String(req.project?.code || req.project?.name || '').trim() || '—';
  }
  if (req.projectId && String(req.projectId).length === 25) return '—';
  if (req.projectId) return String(req.projectId);
  return '—';
}

function rmCostCenterLine(req: {
  costCenter?: { code?: string | null; name?: string | null } | null;
  costCenterId?: string | null;
}) {
  const cc = req.costCenter;
  if (cc?.code && cc?.name) return `${cc.code} — ${cc.name}`;
  if (cc?.code) return String(cc.code);
  if (cc?.name) return String(cc.name);
  if (req.costCenterId) return String(req.costCenterId);
  return '—';
}

/** YYYY-MM-DD no fuso local (para comparar com input type="date"). */
function toYmdLocal(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function SolicitarMateriaisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');
  const [formData, setFormData] = useState({
    costCenterId: '',
    serviceOrder: '',
    obra: '',
    description: '',
    priority: 'MEDIUM',
    demandSheet: '',
    demandSheetAttachmentUrl: '',
    demandSheetAttachmentName: '',
    items: [{ materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }]
  });

  const [correctionEditId, setCorrectionEditId] = useState<string | null>(null);
  const [detailViewId, setDetailViewId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    costCenterId: '',
    serviceOrder: '',
    obra: '',
    description: '',
    priority: 'MEDIUM',
    demandSheet: '',
    demandSheetAttachmentUrl: '',
    demandSheetAttachmentName: '',
    items: [{ materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }]
  });

  const [uploadingAttachment, setUploadingAttachment] = useState<{ form: 'new' | 'edit'; index: number } | null>(
    null
  );
  const [uploadingDemandSheetAttachment, setUploadingDemandSheetAttachment] = useState<'new' | 'edit' | null>(null);

  const [rmListSearch, setRmListSearch] = useState('');
  /** '' | `rm:PENDING` | `oc:APPROVED` … — fase da SC ou de alguma OC */
  const [rmListFaseAtual, setRmListFaseAtual] = useState<string>('');
  const [rmListObra, setRmListObra] = useState<string>('');
  const [rmListCostCenterId, setRmListCostCenterId] = useState('');
  const [rmListDateFrom, setRmListDateFrom] = useState('');
  const [rmListDateTo, setRmListDateTo] = useState('');

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { costCenters, isLoading: loadingCostCenters } = useCostCenters();


  // Buscar materiais
  const { data: materialsData } = useQuery({
    queryKey: ['materials'],
    queryFn: async () => {
      const res = await api.get('/material-requests/materials');
      return res.data;
    }
  });

  // Buscar requisições do usuário
  const { data: requestsData, isLoading: loadingRequests } = useQuery({
    queryKey: ['material-requests'],
    queryFn: async () => {
      const res = await api.get('/material-requests', {
        params: { requestedBy: userData?.data?.id, limit: 500 }
      });
      return res.data;
    },
    enabled: !!userData?.data?.id && (activeTab === 'list' || !!correctionEditId)
  });

  const { data: detailRmData, isLoading: loadingDetailRm } = useQuery({
    queryKey: ['material-request-detail', detailViewId],
    queryFn: async () => {
      const res = await api.get(`/material-requests/${detailViewId}`);
      return res.data?.data ?? res.data;
    },
    enabled: !!detailViewId && !!userData?.data?.id
  });

  const { data: correctionRmDetail } = useQuery({
    queryKey: ['material-request', correctionEditId],
    queryFn: async () => {
      const res = await api.get(`/material-requests/${correctionEditId}`);
      return res.data?.data ?? res.data;
    },
    enabled: !!correctionEditId && !!userData?.data?.id
  });

  const resubmitAfterCorrectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-requests/${id}/status`, { status: 'PENDING' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      toast.success('Requisição reenviada para análise.');
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Não foi possível reenviar');
    }
  });

  type EditFormShape = typeof editFormData;

  const updateCorrectionMutation = useMutation({
    mutationFn: async ({
      id,
      submitForApproval,
      form
    }: {
      id: string;
      submitForApproval: boolean;
      form: EditFormShape;
    }) => {
      const res = await api.patch(`/material-requests/${id}`, {
        costCenterId: form.costCenterId,
        projectId: form.serviceOrder || undefined,
        serviceOrder: form.serviceOrder || undefined,
        obra: form.obra || undefined,
        description: form.description,
        priority: form.priority,
        demandSheet: form.demandSheet || undefined,
        demandSheetAttachmentUrl: form.demandSheetAttachmentUrl || undefined,
        demandSheetAttachmentName: form.demandSheetAttachmentName || undefined,
        items: form.items.map((item) => ({
          materialId: item.materialId,
          quantity: item.quantity,
          observation: item.observation,
          attachmentUrl: item.attachmentUrl || undefined,
          attachmentName: item.attachmentName || undefined
        })),
        submitForApproval
      });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      setCorrectionEditId(null);
      toast.success(
        variables.submitForApproval
          ? 'Alterações salvas e requisição reenviada para aprovação.'
          : 'Alterações salvas. Você pode continuar editando ou reenviar quando estiver pronto.'
      );
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Não foi possível salvar');
    }
  });

  // Criar requisição
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/material-requests', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      setActiveTab('list');
      setFormData({
        costCenterId: '',
        serviceOrder: '',
        obra: '',
        description: '',
        priority: 'MEDIUM',
        demandSheet: '',
        demandSheetAttachmentUrl: '',
        demandSheetAttachmentName: '',
        items: [{ materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }]
      });
    }
  });

  const requests = requestsData?.data?.requests || requestsData?.data || [];

  const obraOptionsFromRequests = useMemo(() => {
    const set = new Set<string>();
    for (const r of Array.isArray(requests) ? requests : []) {
      const o = String((r as { obra?: string | null }).obra ?? '').trim();
      if (o) set.add(o);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [requests]);

  const filteredRequests = useMemo(() => {
    let list = Array.isArray(requests) ? [...requests] : [];
    if (rmListFaseAtual) {
      list = list.filter((r: { status?: string; purchaseOrders?: RmListPurchaseOrder[] }) =>
        requestMatchesFaseAtualFilter(r, rmListFaseAtual)
      );
    }
    if (rmListObra) {
      list = list.filter((r: { obra?: string | null }) => String(r.obra ?? '').trim() === rmListObra);
    }
    if (rmListCostCenterId) {
      list = list.filter((r: { costCenterId?: string; costCenter?: { id?: string } | null }) => {
        const id = r.costCenterId || r.costCenter?.id;
        return id === rmListCostCenterId;
      });
    }
    if (rmListDateFrom || rmListDateTo) {
      list = list.filter((r: { requestedAt?: string }) => {
        const ymd = toYmdLocal(r.requestedAt);
        if (!ymd) return false;
        if (rmListDateFrom && ymd < rmListDateFrom) return false;
        if (rmListDateTo && ymd > rmListDateTo) return false;
        return true;
      });
    }
    const q = rmListSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((req: Record<string, unknown>) => {
        const rn = String(req.requestNumber ?? '').toLowerCase();
        const os = rmOsLine(req as Parameters<typeof rmOsLine>[0]).toLowerCase();
        const obra = String(req.obra ?? '').toLowerCase();
        const desc = String(req.description ?? '').toLowerCase();
        const ccLine = rmCostCenterLine(req as Parameters<typeof rmCostCenterLine>[0]).toLowerCase();
        return (
          rn.includes(q) || os.includes(q) || obra.includes(q) || desc.includes(q) || ccLine.includes(q)
        );
      });
    }
    list.sort((a: { requestedAt?: string }, b: { requestedAt?: string }) => {
      const ta = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const tb = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
      return tb - ta;
    });
    return list;
  }, [
    requests,
    rmListSearch,
    rmListFaseAtual,
    rmListObra,
    rmListCostCenterId,
    rmListDateFrom,
    rmListDateTo
  ]);

  useEffect(() => {
    const id = searchParams?.get('editRm') ?? null;
    if (!id) return;
    setCorrectionEditId(id);
    setActiveTab('list');
    router.replace('/ponto/solicitar-materiais', { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    if (!correctionEditId) return;
    const fromList = requests.find((x: { id: string }) => x.id === correctionEditId);
    const r = (correctionRmDetail as typeof fromList | undefined) || fromList;
    if (!r) return;
    const itemsFromApi = Array.isArray(r.items) ? r.items : [];
    setEditFormData({
      costCenterId: (r as { costCenterId?: string }).costCenterId || (r as { costCenter?: { id?: string } }).costCenter?.id || '',
      serviceOrder:
        (r as { serviceOrder?: string }).serviceOrder?.trim()
          ? String((r as { serviceOrder?: string }).serviceOrder)
          : (r as { projectId?: string }).projectId && (r as { project?: { code?: string; name?: string } }).project
            ? String(
                (r as { project?: { code?: string; name?: string } }).project?.code ||
                  (r as { project?: { code?: string; name?: string } }).project?.name ||
                  ''
              )
            : '',
      obra: String((r as { obra?: string }).obra || ''),
      description: (r.description as string) || '',
      priority: (r.priority as string) || 'MEDIUM',
      demandSheet: String((r as { demandSheet?: string }).demandSheet || ''),
      demandSheetAttachmentUrl: String((r as { demandSheetAttachmentUrl?: string }).demandSheetAttachmentUrl || ''),
      demandSheetAttachmentName: String((r as { demandSheetAttachmentName?: string }).demandSheetAttachmentName || ''),
      items:
        itemsFromApi.length > 0
          ? itemsFromApi.map(
              (it: {
                materialId?: string;
                material?: { id?: string; unit?: string };
                quantity?: unknown;
                unit?: string;
                notes?: string | null;
                attachmentUrl?: string | null;
                attachmentName?: string | null;
              }) => ({
                materialId: it.materialId || it.material?.id || '',
                quantity: Math.max(1, Math.floor(Number(it.quantity)) || 1),
                unit: it.unit || it.material?.unit || '',
                observation: it.notes || '',
                attachmentUrl: it.attachmentUrl || '',
                attachmentName: it.attachmentName || ''
              })
            )
          : [{ materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }]
    });
  }, [correctionEditId, correctionRmDetail, requests]);

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  if (loadingUser) {
    return (
      <Loading 
        message="Carregando..."
        fullScreen
        size="lg"
      />
    );
  }

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        { materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }
      ]
    });
  };

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'materialId') {
      if (value) {
        const material = (materialsData?.data || []).find((m: any) => m.id === value);
        newItems[index].unit = material?.unit || '';
      } else {
        newItems[index].unit = '';
      }
    }
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      costCenterId: formData.costCenterId,
      serviceOrder: formData.serviceOrder || undefined,
      obra: formData.obra || undefined,
      description: formData.description,
      priority: formData.priority,
      demandSheet: formData.demandSheet || undefined,
      demandSheetAttachmentUrl: formData.demandSheetAttachmentUrl || undefined,
      demandSheetAttachmentName: formData.demandSheetAttachmentName || undefined,
      projectId: formData.serviceOrder || undefined,
      items: formData.items.map((item) => ({
        materialId: item.materialId,
        quantity: Number(item.quantity),
        observation: item.observation,
        attachmentUrl: item.attachmentUrl?.trim() || undefined,
        attachmentName: item.attachmentName?.trim() || undefined
      }))
    });
  };

  const handleEditAddItem = () => {
    setEditFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }
      ]
    }));
  };

  const handleItemAttachmentFile = async (form: 'new' | 'edit', index: number, file: File | null) => {
    if (!file) return;
    setUploadingAttachment({ form, index });
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/material-requests/upload-item-attachment', fd);
      const d = res.data?.data as { url?: string; originalName?: string } | undefined;
      if (!d?.url) throw new Error('Resposta inválida do servidor');
      if (form === 'new') {
        setFormData((prev) => {
          const next = [...prev.items];
          next[index] = {
            ...next[index],
            attachmentUrl: d.url!,
            attachmentName: d.originalName || ''
          };
          return { ...prev, items: next };
        });
      } else {
        setEditFormData((prev) => {
          const next = [...prev.items];
          next[index] = {
            ...next[index],
            attachmentUrl: d.url!,
            attachmentName: d.originalName || ''
          };
          return { ...prev, items: next };
        });
      }
      toast.success('Anexo enviado');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Não foi possível enviar o anexo');
    } finally {
      setUploadingAttachment(null);
    }
  };

  const clearItemAttachment = (form: 'new' | 'edit', index: number) => {
    if (form === 'new') {
      setFormData((prev) => {
        const next = [...prev.items];
        next[index] = { ...next[index], attachmentUrl: '', attachmentName: '' };
        return { ...prev, items: next };
      });
    } else {
      setEditFormData((prev) => {
        const next = [...prev.items];
        next[index] = { ...next[index], attachmentUrl: '', attachmentName: '' };
        return { ...prev, items: next };
      });
    }
  };

  const handleDemandSheetAttachmentFile = async (form: 'new' | 'edit', file: File | null) => {
    if (!file) return;
    setUploadingDemandSheetAttachment(form);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/material-requests/upload-item-attachment', fd);
      const d = res.data?.data as { url?: string; originalName?: string } | undefined;
      if (!d?.url) throw new Error('Resposta inválida do servidor');
      if (form === 'new') {
        setFormData((prev) => ({
          ...prev,
          demandSheetAttachmentUrl: d.url || '',
          demandSheetAttachmentName: d.originalName || ''
        }));
      } else {
        setEditFormData((prev) => ({
          ...prev,
          demandSheetAttachmentUrl: d.url || '',
          demandSheetAttachmentName: d.originalName || ''
        }));
      }
      toast.success('Anexo da FD enviado');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Não foi possível enviar o anexo da FD');
    } finally {
      setUploadingDemandSheetAttachment(null);
    }
  };

  const clearDemandSheetAttachment = (form: 'new' | 'edit') => {
    if (form === 'new') {
      setFormData((prev) => ({
        ...prev,
        demandSheetAttachmentUrl: '',
        demandSheetAttachmentName: ''
      }));
    } else {
      setEditFormData((prev) => ({
        ...prev,
        demandSheetAttachmentUrl: '',
        demandSheetAttachmentName: ''
      }));
    }
  };

  const handleEditRemoveItem = (index: number) => {
    setEditFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleEditItemChange = (index: number, field: string, value: unknown) => {
    setEditFormData((prev) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      if (field === 'materialId' && typeof value === 'string' && value) {
        const material = (materialsData?.data || []).find((m: { id: string }) => m.id === value);
        newItems[index].unit = material?.unit || '';
      } else if (field === 'materialId' && value === '') {
        newItems[index].unit = '';
      }
      return { ...prev, items: newItems };
    });
  };

  const submitCorrectionEdit = (submitForApproval: boolean) => {
    if (!correctionEditId) return;
    if (!editFormData.costCenterId) {
      toast.error('Selecione o centro de custo.');
      return;
    }
    const validItems = editFormData.items.filter((i) => i.materialId);
    if (validItems.length === 0) {
      toast.error('Inclua ao menos um material.');
      return;
    }
    updateCorrectionMutation.mutate({
      id: correctionEditId,
      submitForApproval,
      form: editFormData
    });
  };

  return (
    <ProtectedRoute route="/ponto/solicitar-materiais">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          {/* Cabeçalho */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Solicitar Materiais</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Solicite materiais para seus projetos</p>
          </div>

          {/* Navegação */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('list')}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'list'
                    ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <List className="w-4 h-4" />
                Minhas Solicitações
              </button>
              <button
                onClick={() => setActiveTab('new')}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'new'
                    ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Plus className="w-4 h-4" />
                Nova Solicitação
              </button>
            </nav>
          </div>

          {/* Conteúdo */}
          <Card>
            <CardHeader>
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                  <ShoppingCart className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {activeTab === 'list' ? 'Minhas Solicitações' : 'Nova Solicitação de Material'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {activeTab === 'list' ? 'Visualize suas solicitações de materiais' : 'Preencha os dados para criar uma nova solicitação'}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activeTab === 'list' ? (
                <div className="space-y-4">
                  {loadingRequests ? (
                    <div className="text-center py-8">
                      <Loading message="Carregando solicitações..." />
                    </div>
                  ) : requests.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500 dark:text-gray-400">Nenhuma solicitação encontrada</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        <div className="flex flex-col lg:flex-row flex-wrap gap-3 lg:items-end">
                          <div className="flex-1 min-w-[min(100%,220px)]">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Buscar
                            </label>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                              <input
                                type="search"
                                value={rmListSearch}
                                onChange={(e) => setRmListSearch(e.target.value)}
                                placeholder="Nº SC, OS, obra, centro de custo..."
                                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                          <div className="w-full sm:min-w-[min(100%,280px)] sm:max-w-md shrink-0">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Fase atual
                            </label>
                            <select
                              value={rmListFaseAtual}
                              onChange={(e) => setRmListFaseAtual(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">Todas</option>
                              <optgroup label="SC (solicitação)">
                                {RM_FASE_FILTER_ORDER.map((st) => (
                                  <option key={`rm:${st}`} value={`rm:${st}`}>
                                    {rmStatusLabelPt(st)}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="OC (ordem de compra)">
                                {OC_FASE_FILTER_ORDER.filter((k) => k in OC_STATUS_LABELS_PT).map((st) => (
                                  <option key={`oc:${st}`} value={`oc:${st}`}>
                                    {purchaseOrderPhaseShortLabel(st)}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          </div>
                          <div className="w-full sm:w-48 shrink-0">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Obra
                            </label>
                            <select
                              value={rmListObra}
                              onChange={(e) => setRmListObra(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">Todas</option>
                              {obraOptionsFromRequests.map((obra) => (
                                <option key={obra} value={obra}>
                                  {obra}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex-1 min-w-[min(100%,260px)]">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Centro de custo
                            </label>
                            {loadingCostCenters ? (
                              <div className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500">
                                Carregando...
                              </div>
                            ) : (
                              <select
                                value={rmListCostCenterId}
                                onChange={(e) => setRmListCostCenterId(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">Todos</option>
                                {costCenters
                                  .filter((cc): cc is typeof cc & { id: string } => Boolean(cc.id))
                                  .map((cc) => (
                                    <option key={cc.id} value={cc.id}>
                                      {cc.code} — {cc.name}
                                      {cc.description ? ` (${cc.description})` : ''}
                                    </option>
                                  ))}
                              </select>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-end">
                          <div className="w-full sm:w-44">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Data inicial
                            </label>
                            <input
                              type="date"
                              value={rmListDateFrom}
                              onChange={(e) => setRmListDateFrom(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div className="w-full sm:w-44">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Data final
                            </label>
                            <input
                              type="date"
                              value={rmListDateTo}
                              onChange={(e) => setRmListDateTo(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 sm:pb-2 sm:ml-1">
                            Período pela data da solicitação (fuso local).
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Exibindo {filteredRequests.length} de {requests.length} solicitação(ões)
                      </p>
                      {filteredRequests.length === 0 ? (
                        <div className="text-center py-8 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                          <p className="text-gray-500 dark:text-gray-400 text-sm">
                            Nenhuma solicitação corresponde aos filtros.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setRmListSearch('');
                              setRmListFaseAtual('');
                              setRmListObra('');
                              setRmListCostCenterId('');
                              setRmListDateFrom('');
                              setRmListDateTo('');
                            }}
                            className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Limpar filtros
                          </button>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                              <tr>
                                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Nº SC</th>
                                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Data</th>
                                <th className="px-3 py-2.5 font-medium min-w-[140px]">Centro de custo</th>
                                <th className="px-3 py-2.5 font-medium whitespace-nowrap">OS</th>
                                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Obra</th>
                                <th className="px-3 py-2.5 font-medium min-w-[140px]">Descrição</th>
                                <th className="px-3 py-2.5 font-medium whitespace-nowrap min-w-[160px]">Fase atual</th>
                                <th className="px-3 py-2.5 font-medium whitespace-nowrap text-right">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900/30">
                              {filteredRequests.map(
                                (
                                  request: Record<string, unknown> & {
                                    id: string;
                                    status?: string;
                                    purchaseOrders?: RmListPurchaseOrder[];
                                  }
                                ) => (
                                <tr key={request.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                    {String(request.requestNumber || '—')}
                                  </td>
                                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                    {request.requestedAt
                                      ? new Date(String(request.requestedAt)).toLocaleDateString('pt-BR')
                                      : '—'}
                                  </td>
                                  <td
                                    className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[200px]"
                                    title={rmCostCenterLine(request as Parameters<typeof rmCostCenterLine>[0])}
                                  >
                                    <span className="line-clamp-2 text-sm">
                                      {rmCostCenterLine(request as Parameters<typeof rmCostCenterLine>[0])}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[120px] truncate" title={rmOsLine(request as Parameters<typeof rmOsLine>[0])}>
                                    {rmOsLine(request as Parameters<typeof rmOsLine>[0])}
                                  </td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[120px] truncate" title={String(request.obra || '')}>
                                    {request.obra ? String(request.obra) : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400 max-w-[220px]">
                                    <span className="line-clamp-2" title={String(request.description || '')}>
                                      {request.description ? String(request.description) : '—'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 align-top">
                                    <div className="flex flex-col gap-0.5 text-xs sm:text-sm">
                                      {materialRequestFaseAtualLines(request).map((line) => (
                                        <span
                                          key={line.key}
                                          className={`font-medium whitespace-normal break-words ${line.className}`}
                                          title={line.text}
                                        >
                                          {line.text}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right whitespace-nowrap">
                                    <div className="inline-flex flex-col sm:flex-row gap-1 sm:justify-end items-end sm:items-center">
                                      <button
                                        type="button"
                                        onClick={() => setDetailViewId(request.id)}
                                        className="inline-flex items-center justify-center p-1.5 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                                        title="Ver detalhes da solicitação"
                                        aria-label="Ver detalhes da solicitação"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                      {request.status === 'IN_REVIEW' ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => setCorrectionEditId(request.id)}
                                            className="inline-flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-amber-600 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                            Editar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => resubmitAfterCorrectionMutation.mutate(request.id)}
                                            disabled={resubmitAfterCorrectionMutation.isPending}
                                            className="inline-flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                                          >
                                            <Send className="w-3.5 h-3.5" />
                                            Reenviar
                                          </button>
                                        </>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Centro de Custo *
                    </label>
                    {loadingCostCenters ? (
                      <div className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        Carregando centros de custo...
                      </div>
                    ) : (
                      <select
                        required
                        value={formData.costCenterId}
                        onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Selecione um centro de custo</option>
                        {costCenters.map((cc: any) => (
                          <option key={cc.id} value={cc.id}>
                            {cc.code} - {cc.name} {cc.description ? `(${cc.description})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    {!loadingCostCenters && costCenters.length === 0 && (
                      <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                        Nenhum centro de custo disponível. Execute o seed do banco de dados.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Ordem de Serviço
                    </label>
                    <input
                      type="text"
                      value={formData.serviceOrder}
                      onChange={(e) => setFormData({ ...formData, serviceOrder: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Digite o número da ordem de serviço (opcional)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Obra
                    </label>
                    <input
                      type="text"
                      value={formData.obra}
                      onChange={(e) => setFormData({ ...formData, obra: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Identificação da obra (opcional)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Descrição
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="Descreva a necessidade dos materiais..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Prioridade
                    </label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="LOW">Baixa</option>
                      <option value="MEDIUM">Média</option>
                      <option value="HIGH">Alta</option>
                      <option value="URGENT">Urgente</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Ficha de Demanda
                    </label>
                    <input
                      type="text"
                      value={formData.demandSheet}
                      onChange={(e) => setFormData({ ...formData, demandSheet: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="Número ou referência da FD (opcional)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Anexar FD
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50">
                        {uploadingDemandSheetAttachment === 'new' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Paperclip className="w-4 h-4" />
                        )}
                        <span>{uploadingDemandSheetAttachment === 'new' ? 'Enviando...' : 'Escolher arquivo'}</span>
                        <input
                          type="file"
                          className="hidden"
                          disabled={!!uploadingDemandSheetAttachment}
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                          onChange={(e) => {
                            const f = e.target.files?.[0] || null;
                            if (f) void handleDemandSheetAttachmentFile('new', f);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                      {formData.demandSheetAttachmentUrl && (
                        <>
                          <a
                            href={absoluteUploadUrl(formData.demandSheetAttachmentUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {formData.demandSheetAttachmentName || 'Anexo FD'}
                          </a>
                          <button
                            type="button"
                            onClick={() => clearDemandSheetAttachment('new')}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-red-300 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <X className="w-3 h-3" />
                            Remover
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Itens *
                      </label>
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Adicionar Item
                      </button>
                    </div>
                    <div className="space-y-3">
                      {formData.items.map((item, index) => (
                        <div key={index} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="flex items-start justify-between mb-3">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Item {index + 1}</span>
                            {formData.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                className="text-red-600 dark:text-red-400 hover:text-red-700"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Material *
                              </label>
                              <select
                                required
                                value={item.materialId}
                                onChange={(e) => handleItemChange(index, 'materialId', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                              >
                                <option value="">Selecione um material</option>
                                {(materialsData?.data || []).map((material: any) => (
                                  <option key={material.id} value={material.id}>
                                    {material.description || material.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Quantidade *
                              </label>
                              <input
                                type="number"
                                required
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Unidade
                              </label>
                              <input
                                type="text"
                                value={item.unit}
                                readOnly
                                placeholder="Ex: kg, m, un"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm cursor-not-allowed"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Observação
                              </label>
                              <input
                                type="text"
                                value={item.observation}
                                onChange={(e) => handleItemChange(index, 'observation', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Anexo (opcional)
                              </label>
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50">
                                  {uploadingAttachment?.form === 'new' && uploadingAttachment.index === index ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Paperclip className="w-4 h-4" />
                                  )}
                                  <span>
                                    {uploadingAttachment?.form === 'new' && uploadingAttachment.index === index
                                      ? 'Enviando...'
                                      : 'Escolher arquivo'}
                                  </span>
                                  <input
                                    key={`new-att-${index}-${item.attachmentUrl || 'empty'}`}
                                    type="file"
                                    className="hidden"
                                    disabled={!!uploadingAttachment}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) void handleItemAttachmentFile('new', index, f);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                                {item.attachmentUrl ? (
                                  <>
                                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                                      {item.attachmentName || 'Anexo'}
                                    </span>
                                    <a
                                      href={absoluteUploadUrl(item.attachmentUrl)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      Abrir
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => clearItemAttachment('new', index)}
                                      className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                    >
                                      Remover
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {createMutation.isError && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {(createMutation.error as any)?.response?.data?.message || 'Erro ao criar solicitação'}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('list')}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={createMutation.isPending}
                      className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 disabled:opacity-50"
                    >
                      {createMutation.isPending ? 'Criando...' : 'Criar Solicitação'}
                    </button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        {detailViewId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDetailViewId(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Detalhes da solicitação</h2>
              {loadingDetailRm ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-6">Carregando…</p>
              ) : detailRmData ? (
                (() => {
                  const d = detailRmData as Record<string, unknown> & {
                    requestNumber?: string;
                    requestedAt?: string;
                    status?: string;
                    description?: string;
                    obra?: string;
                    serviceOrder?: string;
                    priority?: string;
                    costCenter?: { code?: string; name?: string };
                    items?: Array<{
                      quantity?: unknown;
                      unit?: string;
                      notes?: string | null;
                      attachmentUrl?: string | null;
                      attachmentName?: string | null;
                      material?: { description?: string | null; name?: string | null; sinapiCode?: string | null };
                    }>;
                    purchaseOrders?: Array<{ id: string; orderNumber?: string | null; status: string }>;
                  };
                  const pos = Array.isArray(d.purchaseOrders) ? d.purchaseOrders : [];
                  return (
                    <div className="space-y-4 text-sm text-gray-700 dark:text-gray-200">
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                        <div>
                          <dt className="text-xs text-gray-500 dark:text-gray-400">Nº SC</dt>
                          <dd className="font-medium">{String(d.requestNumber || '—')}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500 dark:text-gray-400">Data</dt>
                          <dd>
                            {d.requestedAt
                              ? new Date(String(d.requestedAt)).toLocaleString('pt-BR')
                              : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500 dark:text-gray-400">Fase da SC</dt>
                          <dd>{d.status ? rmStatusLabelPt(String(d.status)) : '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500 dark:text-gray-400">Prioridade</dt>
                          <dd>{rmPriorityLabelPt(d.priority)}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-xs text-gray-500 dark:text-gray-400">Centro de custo</dt>
                          <dd>{rmCostCenterLine(d as Parameters<typeof rmCostCenterLine>[0])}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500 dark:text-gray-400">OS</dt>
                          <dd>{rmOsLine(d as Parameters<typeof rmOsLine>[0])}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500 dark:text-gray-400">Obra</dt>
                          <dd>{d.obra ? String(d.obra) : '—'}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-xs text-gray-500 dark:text-gray-400">Descrição</dt>
                          <dd className="whitespace-pre-wrap">{d.description ? String(d.description) : '—'}</dd>
                        </div>
                      </dl>
                      {d.items && d.items.length > 0 ? (
                        <div>
                          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Itens</p>
                          <ul className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-600 divide-y divide-gray-200 dark:divide-gray-600">
                            {d.items.map((it, idx) => {
                              const mat = it.material;
                              const line =
                                mat?.description?.trim() ||
                                mat?.name?.trim() ||
                                mat?.sinapiCode ||
                                'Material';
                              return (
                                <li key={idx} className="p-2.5 space-y-1">
                                  <p className="font-medium text-gray-900 dark:text-gray-100">{line}</p>
                                  <p className="text-xs text-gray-600 dark:text-gray-400">
                                    Qtd.:{' '}
                                    {it.quantity !== undefined && it.quantity !== null
                                      ? String(it.quantity)
                                      : '—'}{' '}
                                    {it.unit ? String(it.unit) : ''}
                                    {typeof it.notes === 'string' && it.notes.trim()
                                      ? ` · ${it.notes.trim()}`
                                      : ''}
                                  </p>
                                  {it.attachmentUrl ? (
                                    <a
                                      href={absoluteUploadUrl(String(it.attachmentUrl))}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      {it.attachmentName || 'Anexo'}
                                    </a>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                      {pos.length > 0 ? (
                        <div>
                          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                            Ordens de compra
                          </p>
                          <ul className="space-y-1">
                            {sortPurchaseOrdersForDisplay(pos as RmListPurchaseOrder[]).map((po) => {
                              const num =
                                (po.orderNumber && String(po.orderNumber).trim()) || po.id.slice(0, 8);
                              return (
                                <li key={po.id} className="text-sm">
                                  <span className="text-gray-600 dark:text-gray-400">OC {num}</span>
                                  {' · '}
                                  <span className={ocStatusTextClass(po.status)}>
                                    {purchaseOrderPhaseLabel(po.status)}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  );
                })()
              ) : (
                <p className="text-sm text-red-600 dark:text-red-400 py-4">Não foi possível carregar os detalhes.</p>
              )}
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDetailViewId(null)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {correctionEditId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => !updateCorrectionMutation.isPending && setCorrectionEditId(null)}
            />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Editar requisição (Correção RM)
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Ajuste os dados e salve. Use &quot;Salvar e reenviar&quot; quando quiser voltar a fila de aprovação do compras.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Centro de Custo *
                  </label>
                  <select
                    value={editFormData.costCenterId}
                    onChange={(e) => setEditFormData({ ...editFormData, costCenterId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  >
                    <option value="">Selecione</option>
                    {costCenters.map((cc: any) => (
                      <option key={String(cc.id ?? cc.value)} value={String(cc.id ?? cc.value)}>
                        {cc.code} - {cc.name || cc.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Ordem de Serviço
                  </label>
                  <input
                    type="text"
                    value={editFormData.serviceOrder}
                    onChange={(e) => setEditFormData({ ...editFormData, serviceOrder: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Opcional"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Obra
                  </label>
                  <input
                    type="text"
                    value={editFormData.obra}
                    onChange={(e) => setEditFormData({ ...editFormData, obra: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Identificação da obra (opcional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Descrição
                  </label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Prioridade
                  </label>
                  <select
                    value={editFormData.priority}
                    onChange={(e) => setEditFormData({ ...editFormData, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  >
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HIGH">Alta</option>
                    <option value="URGENT">Urgente</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Ficha de Demanda
                  </label>
                  <input
                    type="text"
                    value={editFormData.demandSheet}
                    onChange={(e) => setEditFormData({ ...editFormData, demandSheet: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Número ou referência da FD (opcional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Anexar FD
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                      {uploadingDemandSheetAttachment === 'edit' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Paperclip className="w-3.5 h-3.5" />
                      )}
                      <span>{uploadingDemandSheetAttachment === 'edit' ? 'Enviando...' : 'Arquivo'}</span>
                      <input
                        type="file"
                        className="hidden"
                        disabled={!!uploadingDemandSheetAttachment}
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          if (f) void handleDemandSheetAttachmentFile('edit', f);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {editFormData.demandSheetAttachmentUrl && (
                      <>
                        <a
                          href={absoluteUploadUrl(editFormData.demandSheetAttachmentUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          {editFormData.demandSheetAttachmentName || 'Anexo FD'}
                        </a>
                        <button
                          type="button"
                          onClick={() => clearDemandSheetAttachment('edit')}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-red-300 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <X className="w-3 h-3" />
                          Remover
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Itens *</span>
                    <button
                      type="button"
                      onClick={handleEditAddItem}
                      className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar item
                    </button>
                  </div>
                  <div className="space-y-3">
                    {editFormData.items.map((item, index) => (
                      <div
                        key={index}
                        className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-600"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Item {index + 1}</span>
                          {editFormData.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleEditRemoveItem(index)}
                              className="text-red-600 dark:text-red-400"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Material *</label>
                            <select
                              value={item.materialId}
                              onChange={(e) => handleEditItemChange(index, 'materialId', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800"
                            >
                              <option value="">Selecione</option>
                              {(materialsData?.data || []).map((m: { id: string; description?: string; name?: string }) => (
                                <option key={m.id} value={m.id}>
                                  {m.description || m.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Quantidade *</label>
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) =>
                                handleEditItemChange(index, 'quantity', parseInt(e.target.value, 10) || 1)
                              }
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Unidade</label>
                            <input
                              type="text"
                              readOnly
                              value={item.unit}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Observação</label>
                            <input
                              type="text"
                              value={item.observation}
                              onChange={(e) => handleEditItemChange(index, 'observation', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs text-gray-500 mb-0.5">Anexo (opcional)</label>
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                                {uploadingAttachment?.form === 'edit' && uploadingAttachment.index === index ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Paperclip className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {uploadingAttachment?.form === 'edit' && uploadingAttachment.index === index
                                    ? 'Enviando...'
                                    : 'Arquivo'}
                                </span>
                                <input
                                  key={`edit-att-${index}-${item.attachmentUrl || 'empty'}`}
                                  type="file"
                                  className="hidden"
                                  disabled={!!uploadingAttachment}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) void handleItemAttachmentFile('edit', index, f);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              {item.attachmentUrl ? (
                                <>
                                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[180px]">
                                    {item.attachmentName || 'Anexo'}
                                  </span>
                                  <a
                                    href={absoluteUploadUrl(item.attachmentUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Abrir
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => clearItemAttachment('edit', index)}
                                    className="text-xs text-red-600 dark:text-red-400"
                                  >
                                    Remover
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  disabled={updateCorrectionMutation.isPending}
                  onClick={() => setCorrectionEditId(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={updateCorrectionMutation.isPending}
                  onClick={() => submitCorrectionEdit(false)}
                  className="px-4 py-2 border border-blue-600 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30"
                >
                  {updateCorrectionMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
                </button>
                <button
                  type="button"
                  disabled={updateCorrectionMutation.isPending}
                  onClick={() => submitCorrectionEdit(true)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {updateCorrectionMutation.isPending ? 'Enviando...' : 'Salvar e reenviar para aprovação'}
                </button>
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}

/** Next.js exige Suspense em volta de `useSearchParams` na geração estática. */
export default function SolicitarMateriaisPageWithSuspense() {
  return (
    <Suspense fallback={<Loading />}>
      <SolicitarMateriaisPage />
    </Suspense>
  );
}
