'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, X, CheckCircle, ClipboardList, Clock, ShoppingCart, XCircle, Paperclip } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { OcStyledCheckbox, type PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';
import {
  PaymentConditionSelect,
  resolvePaymentConditionMeta,
  type PaymentConditionRow
} from '@/components/oc/PaymentConditionSelect';
import {
  OcBoletoCreationFields,
  resizeOcBoletoCreationSlots,
  type OcBoletoCreationSlot
} from '@/components/oc/OcBoletoCreationFields';
import type { MaterialRequest } from './_lib/types';
import { getStatusInfo, materialItemLabel, rmContractDisplay, rmSolicitante } from './_lib/display';
import {
  formatCurrencyBR,
  numericQuantityFromInput,
  numericUnitPriceFromInput,
  OC_TYPE_AVISTA,
  OC_TYPE_BOLETO,
  parseCurrencyBR
} from './_lib/ocAmounts';
import { maskCurrencyInputBrOrEmpty, parseCurrencyInputBr } from '@/lib/maskCurrencyBr';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { MaterialRequestsRmList } from './_components/MaterialRequestsRmList';
import { AsyncSearchSelectDropdown } from '@/components/ui/AsyncSearchSelectDropdown';
import { searchOcSuppliers } from '@/components/oc/searchOcSuppliers';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { OC_PIX_KEY_TYPE_OPTIONS } from '@/components/oc/OcPurchaseOrderFormFields';
import {
  getMaterialRequestCancellationReason,
  getMaterialRequestDisplayStatus,
  isMaterialRequestEffectivelyCancelled
} from './_lib/search';
import {
  DEFAULT_RM_CARD_FILTER,
  filterMaterialRequestsByCard,
  isMaterialRequestAwaitingOc,
  type RmCardFilter
} from './_lib/rmCardFilter';
import { formatRmListDisplayId } from './_lib/rmListDisplay';

const ocFieldCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50';

type OcSupplierOption = {
  id: string;
  code: string;
  name: string;
  tradeName?: string | null;
  isActive?: boolean;
};

function isOcAvistaPaymentIncomplete(
  paymentType: string,
  paymentDetails: string,
  pixKeyType: string,
  pixKey: string
): boolean {
  return (
    paymentType === OC_TYPE_AVISTA &&
    (!paymentDetails.trim() || !pixKeyType.trim() || !pixKey.trim())
  );
}
function getOcSupplierLabel(supplier?: OcSupplierOption | null): string {
  if (!supplier) return '';
  const displayName = supplier.tradeName?.trim() || supplier.name?.trim() || '';
  return supplier.code ? `${supplier.code} - ${displayName}` : displayName;
}

const ocPaymentSegmentCls = (active: boolean) =>
  `w-full rounded-lg border px-3 py-2.5 text-center text-sm font-medium transition-colors focus:outline-none focus:ring-0 ${
    active
      ? 'border-red-600 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200'
      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/80'
  }`;

const ocFieldCompactCls =
  'w-full min-w-0 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50';

const RM_STAT_CARDS: {
  filter: RmCardFilter;
  label: string;
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
  countKey: keyof { total: number; pending: number; approved: number; awaitingOc: number; cancelled: number };
}[] = [
  {
    filter: 'all',
    label: 'Total',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: ClipboardList,
    countKey: 'total'
  },
  {
    filter: 'pending',
    label: 'Pendentes',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    Icon: Clock,
    countKey: 'pending'
  },
  {
    filter: 'approved',
    label: 'Aprovadas',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
    countKey: 'approved'
  },
  {
    filter: 'awaitingOc',
    label: 'Aguardando OC',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    Icon: ShoppingCart,
    countKey: 'awaitingOc'
  },
  {
    filter: 'cancelled',
    label: 'Canceladas',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: XCircle,
    countKey: 'cancelled'
  }
];

export default function GerenciarMateriaisPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [selectedRequest, setSelectedRequest] = useState<MaterialRequest | null>(null);
  const [showCreateOCModal, setShowCreateOCModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCloseDetailsConfirm, setShowCloseDetailsConfirm] = useState(false);
  const [ocSupplierId, setOcSupplierId] = useState('');
  const [ocSupplierSearch, setOcSupplierSearch] = useState('');
  const [ocPaymentType, setOcPaymentType] = useState<string>(OC_TYPE_AVISTA);
  const [ocPaymentCondition, setOcPaymentCondition] = useState<string>('AVISTA');
  const [ocPaymentDetails, setOcPaymentDetails] = useState('');
  const [ocPixKeyType, setOcPixKeyType] = useState('');
  const [ocPixKey, setOcPixKey] = useState('');
  const [ocObservations, setOcObservations] = useState('');
  const [ocBoletoSlots, setOcBoletoSlots] = useState<OcBoletoCreationSlot[]>([{ url: '', name: '' }]);
  const [ocFreteStr, setOcFreteStr] = useState('');
  const [ocSelectedItemIds, setOcSelectedItemIds] = useState<Set<string>>(new Set());
  /** Quantidade na OC por item (texto livre: pode ficar vazio enquanto digita). */
  const [ocQuantityStrByItemId, setOcQuantityStrByItemId] = useState<Record<string, string>>({});
  /** Valor unitário na OC por item (texto livre: pode ficar vazio enquanto digita). */
  const [ocUnitPriceStrByItemId, setOcUnitPriceStrByItemId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (ocPaymentType === OC_TYPE_AVISTA) {
      setOcPaymentCondition('AVISTA');
    } else {
      setOcPaymentCondition((prev) => (prev === 'AVISTA' ? 'BOLETO_30' : prev));
      setOcPixKeyType('');
      setOcPixKey('');
    }
    if (ocPaymentType === OC_TYPE_AVISTA) {
      setOcBoletoSlots([{ url: '', name: '' }]);
    }
  }, [ocPaymentType]);

  const { data: boletoPaymentConditions } = useQuery({
    queryKey: ['payment-conditions', 'BOLETO'],
    queryFn: async () => {
      const res = await api.get('/payment-conditions', {
        params: { paymentType: 'BOLETO', activeOnly: 'true' }
      });
      return (res.data?.data || []) as PaymentConditionRow[];
    },
    enabled: showCreateOCModal && ocPaymentType === OC_TYPE_BOLETO
  });

  const ocBoletoParcelMeta = useMemo(
    () => resolvePaymentConditionMeta(ocPaymentCondition, boletoPaymentConditions),
    [ocPaymentCondition, boletoPaymentConditions]
  );

  useEffect(() => {
    if (ocPaymentType !== OC_TYPE_BOLETO) return;
    setOcBoletoSlots((prev) =>
      resizeOcBoletoCreationSlots(ocBoletoParcelMeta.parcelCount, prev, ocBoletoParcelMeta.parcelDueDays)
    );
  }, [ocPaymentType, ocPaymentCondition, ocBoletoParcelMeta.parcelCount]);

  const resetOcForm = () => {
    setOcSupplierId('');
    setOcSupplierSearch('');
    setOcPaymentType(OC_TYPE_AVISTA);
    setOcPaymentCondition('AVISTA');
    setOcPaymentDetails('');
    setOcPixKeyType('');
    setOcPixKey('');
    setOcObservations('');
    setOcBoletoSlots([{ url: '', name: '' }]);
    setOcFreteStr('');
    setOcSelectedItemIds(new Set());
    setOcQuantityStrByItemId({});
    setOcUnitPriceStrByItemId({});
  };

  // Quando abrir o modal de OC, preenche com TODOS os itens da SC (o comprador pode desmarcar).
  useEffect(() => {
    if (showCreateOCModal && selectedRequest?.items?.length) {
      setOcSelectedItemIds(new Set(selectedRequest.items.map((i) => i.id)));
      setOcQuantityStrByItemId(
        Object.fromEntries(selectedRequest.items.map((i) => [i.id, String(i.quantity)]))
      );
      setOcUnitPriceStrByItemId({});
    }
  }, [showCreateOCModal, selectedRequest]);

  const ocSelectedItems =
    selectedRequest?.items?.filter((i) => ocSelectedItemIds.has(i.id)) ?? [];

  const ocAllItemsSelected = Boolean(
    selectedRequest?.items?.length &&
      selectedRequest.items.every((i) => ocSelectedItemIds.has(i.id))
  );

  const ocSubtotalItens = useMemo(() => {
    if (!selectedRequest?.items?.length) return 0;
    let s = 0;
    for (const item of selectedRequest.items) {
      if (!ocSelectedItemIds.has(item.id)) continue;
      const q =
        numericQuantityFromInput(ocQuantityStrByItemId[item.id] ?? '') ??
        Number(item.quantity);
      const unit = numericUnitPriceFromInput(ocUnitPriceStrByItemId[item.id] ?? '');
      s += q * unit;
    }
    return Math.round(s * 100) / 100;
  }, [selectedRequest, ocSelectedItemIds, ocQuantityStrByItemId, ocUnitPriceStrByItemId]);

  const ocFreteParsed =
    ocFreteStr.trim() === '' ? 0 : parseCurrencyInputBr(ocFreteStr);
  const ocFreteInvalid = ocFreteStr.trim() !== '' && ocFreteParsed === null;
  const ocAmountToPayComputed =
    ocFreteInvalid || ocFreteParsed === null
      ? null
      : Math.round((ocSubtotalItens + ocFreteParsed) * 100) / 100;

  const toggleOcItem = (itemId: string) => {
    setOcSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const selectAllOcItems = () => {
    if (!selectedRequest?.items?.length) return;
    setOcSelectedItemIds(new Set(selectedRequest.items.map((i) => i.id)));
    setOcQuantityStrByItemId((prev) => {
      const next = { ...prev };
      for (const it of selectedRequest.items) {
        if (next[it.id] === undefined) next[it.id] = String(it.quantity);
      }
      return next;
    });
    setOcUnitPriceStrByItemId((prev) => {
      const next = { ...prev };
      for (const it of selectedRequest.items) {
        if (next[it.id] === undefined) next[it.id] = '';
      }
      return next;
    });
  };

  const clearOcItems = () => {
    setOcSelectedItemIds(new Set());
  };
  const [rmCardFilter, setRmCardFilter] = useState<RmCardFilter>(DEFAULT_RM_CARD_FILTER);
  const [searchTerm, setSearchTerm] = useState('');
  const { isUnbUser, unbCostCenterIds, isAdministrator } = usePermissions();
  const [adminAttachmentBusy, setAdminAttachmentBusy] = useState(false);

  const uploadRmAttachmentFile = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.post('/material-requests/upload-item-attachment', fd);
    const d = res.data?.data as { url?: string; originalName?: string } | undefined;
    if (!d?.url) throw new Error('Resposta inválida do servidor');
    return {
      url: d.url,
      name: d.originalName || file.name || 'Arquivo anexado',
    };
  };

  const getDemandSheetFiles = (request: MaterialRequest) => {
    const fromList = Array.isArray(request.demandSheetAttachments)
      ? request.demandSheetAttachments
          .map((file) => ({
            url: String(file?.url || '').trim(),
            name: String(file?.name || '').trim() || 'Arquivo anexado',
          }))
          .filter((file) => file.url)
      : [];
    if (fromList.length > 0) return fromList;
    if (request.demandSheetAttachmentUrl) {
      return [
        {
          url: request.demandSheetAttachmentUrl,
          name: request.demandSheetAttachmentName || 'Arquivo anexado',
        },
      ];
    }
    return [] as Array<{ url: string; name: string }>;
  };

  const applyAdminRequestUpdate = (request: MaterialRequest) => {
    setSelectedRequest((prev) => {
      if (!request?.id) return prev;
      return {
        ...prev,
        ...request,
        items: Array.isArray(request.items) && request.items.length > 0
          ? request.items
          : prev?.items ?? [],
      };
    });
    void queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
  };

  const handleAdminSaveDemandAttachments = async (
    request: MaterialRequest,
    attachments: Array<{ url: string; name: string }>
  ) => {
    setAdminAttachmentBusy(true);
    try {
      const res = await api.patch(`/material-requests/${request.id}/admin/demand-sheet-attachments`, {
        attachments,
      });
      const updated = res.data?.data as MaterialRequest | undefined;
      if (!updated) throw new Error('Resposta inválida do servidor');
      applyAdminRequestUpdate(updated);
      toast.success('Anexos atualizados');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      toast.error(err.response?.data?.message || err.message || 'Não foi possível atualizar os anexos');
    } finally {
      setAdminAttachmentBusy(false);
    }
  };

  const handleAdminReplaceDemandFile = async (
    request: MaterialRequest,
    replaceIndex: number | null,
    file: File
  ) => {
    try {
      const uploaded = await uploadRmAttachmentFile(file);
      const current = getDemandSheetFiles(request);
      const next =
        replaceIndex === null
          ? [...current, uploaded]
          : current.map((item, index) => (index === replaceIndex ? uploaded : item));
      await handleAdminSaveDemandAttachments(request, next);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      toast.error(err.response?.data?.message || err.message || 'Não foi possível enviar o arquivo');
    }
  };

  const handleAdminRemoveDemandFile = async (request: MaterialRequest, removeIndex: number) => {
    const next = getDemandSheetFiles(request).filter((_, index) => index !== removeIndex);
    await handleAdminSaveDemandAttachments(request, next);
  };

  const handleAdminReplaceItemAttachment = async (
    request: MaterialRequest,
    itemId: string,
    file: File | null
  ) => {
    setAdminAttachmentBusy(true);
    try {
      let payload: { url: string | null; name: string | null } = { url: null, name: null };
      if (file) {
        const uploaded = await uploadRmAttachmentFile(file);
        payload = { url: uploaded.url, name: uploaded.name };
      }
      const res = await api.patch(
        `/material-requests/${request.id}/items/${itemId}/admin/attachment`,
        payload
      );
      const updated = res.data?.data as MaterialRequest | undefined;
      if (!updated) throw new Error('Resposta inválida do servidor');
      applyAdminRequestUpdate(updated);
      toast.success(file ? 'Anexo do item atualizado' : 'Anexo do item removido');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      toast.error(err.response?.data?.message || err.message || 'Não foi possível atualizar o anexo');
    } finally {
      setAdminAttachmentBusy(false);
    }
  };

  const closeDetailsModal = () => {
    setShowCloseDetailsConfirm(false);
    setShowDetailsModal(false);
    setSelectedRequest(null);
  };

  const requestCloseDetailsModal = () => {
    setShowCloseDetailsConfirm(true);
  };

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

  // Buscar requisições de materiais
  const { data: requestsData, isLoading: loadingRequests, refetch } = useQuery({
    queryKey: ['material-requests-manage'],
    queryFn: async () => {
      const res = await api.get('/material-requests', { params: { limit: 200, summary: '1' } });
      return res.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: ordersData } = useQuery({
    queryKey: ['purchase-orders', 'list-summary'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500, summary: '1' } });
      return res.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Criar Ordem de Compra
  const createOCMutation = useMutation({
    mutationFn: async ({
      request,
      supplierId,
      paymentType,
      paymentCondition,
      paymentDetails,
      pixKeyType,
      pixKey,
      observations,
      freightAmount,
      selectedItemIds,
      quantityByItemId,
      unitPriceByItemId,
      boletoAttachmentUrl,
      boletoAttachmentName,
      creationBoletoInstallments
    }: {
      request: MaterialRequest;
      supplierId: string;
      paymentType: string;
      paymentCondition: string;
      paymentDetails: string;
      pixKeyType: string;
      pixKey: string;
      observations: string;
      freightAmount: number;
      selectedItemIds: string[];
      quantityByItemId: Record<string, number>;
      unitPriceByItemId: Record<string, number>;
      boletoAttachmentUrl?: string;
      boletoAttachmentName?: string;
      creationBoletoInstallments?: Array<{ boletoUrl: string; boletoName?: string }>;
    }) => {
      const selectedSet = new Set(selectedItemIds);
      const selectedItems = request.items.filter((it) => selectedSet.has(it.id));
      if (!selectedItems.length) {
        throw new Error('Selecione pelo menos 1 item para a OC');
      }

      const items = selectedItems.map((item) => {
        const maxQ = Number(item.quantity);
        const q = quantityByItemId[item.id] ?? maxQ;
        if (!(q > 0) || q > maxQ) {
          throw new Error(
            `Quantidade inválida para "${materialItemLabel(item)}". Use entre 0 e ${maxQ}.`
          );
        }
        return {
          materialRequestItemId: item.id,
          materialId: item.material.id,
          quantity: q,
          unit: item.unit,
          unitPrice: unitPriceByItemId[item.id] ?? 0,
          notes: item.observation ?? item.notes
        };
      });
      const res = await api.post('/purchase-orders', {
        materialRequestId: request.id,
        supplierId,
        items,
        paymentType,
        paymentCondition,
        paymentDetails: paymentDetails.trim() || undefined,
        pixKeyType: paymentType === OC_TYPE_AVISTA ? pixKeyType.trim() || undefined : undefined,
        pixKey: paymentType === OC_TYPE_AVISTA ? pixKey.trim() || undefined : undefined,
        boletoAttachmentUrl:
          paymentType === OC_TYPE_BOLETO ? boletoAttachmentUrl?.trim() || undefined : undefined,
        boletoAttachmentName:
          paymentType === OC_TYPE_BOLETO ? boletoAttachmentName?.trim() || undefined : undefined,
        creationBoletoInstallments:
          paymentType === OC_TYPE_BOLETO ? creationBoletoInstallments : undefined,
        notes: observations.trim() || undefined,
        freightAmount
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary'] });
      setShowCreateOCModal(false);
      setSelectedRequest(null);
      resetOcForm();
      toast.success('Ordem de compra criada com sucesso!');
    },
    onError: (error: any) => {
      toast.error(
        (typeof error?.message === 'string' && error.message) ||
          error.response?.data?.message ||
          'Erro ao criar OC'
      );
    }
  });

  const allRequests = useMemo(() => {
    const raw = requestsData?.data?.requests || requestsData?.data || [];
    const list = Array.isArray(raw) ? (raw as MaterialRequest[]) : [];
    if (!isUnbUser) return list;
    if (unbCostCenterIds.length === 0) return [];
    const allowed = new Set(unbCostCenterIds);
    return list.filter((r) => {
      const id = r.costCenter?.id;
      return !!id && allowed.has(id);
    });
  }, [requestsData, isUnbUser, unbCostCenterIds]);

  // Calcular estatísticas
  const normalizedRequests = allRequests.map((r: MaterialRequest) =>
    r.status === 'REJECTED' ? ({ ...r, status: 'CANCELLED' as const }) : r
  );

  const allOrders: PurchaseOrder[] = ordersData?.data || [];

  /** Requisições que já têm pelo menos uma OC — saem da fila "RMs aprovadas" e seguem só no fluxo OC */
  const materialRequestIdsWithOc = useMemo(() => {
    const s = new Set<string>();
    for (const o of allOrders) {
      const mid = o.materialRequestId ?? o.materialRequest?.id;
      if (mid) s.add(mid);
    }
    return s;
  }, [allOrders]);

  /** OCs vinculadas por requisição (mapa de cotação pode gerar várias por RM). */
  const ordersByMaterialRequestId = useMemo(() => {
    const map = new Map<string, PurchaseOrder[]>();
    for (const o of allOrders) {
      const mid = o.materialRequestId ?? o.materialRequest?.id;
      if (!mid) continue;
      if (!map.has(mid)) map.set(mid, []);
      map.get(mid)!.push(o);
    }
    map.forEach((list) => {
      list.sort((a, b) =>
        (b.orderNumber || '').localeCompare(a.orderNumber || '', 'pt-BR', { numeric: true })
      );
    });
    return map;
  }, [allOrders]);

  const stats = {
    total: normalizedRequests.length,
    pending: normalizedRequests.filter((r: MaterialRequest) => r.status === 'PENDING').length,
    approved: normalizedRequests.filter(
      (r: MaterialRequest) =>
        r.status === 'APPROVED' &&
        !isMaterialRequestEffectivelyCancelled(r, ordersByMaterialRequestId.get(r.id) ?? [])
    ).length,
    cancelled: normalizedRequests.filter((r: MaterialRequest) =>
      isMaterialRequestEffectivelyCancelled(r, ordersByMaterialRequestId.get(r.id) ?? [])
    ).length,
    awaitingOc: normalizedRequests.filter((r: MaterialRequest) =>
      isMaterialRequestAwaitingOc(r, ordersByMaterialRequestId.get(r.id) ?? [])
    ).length
  };

  const filteredRequests = useMemo(
    () =>
      filterMaterialRequestsByCard(
        normalizedRequests,
        rmCardFilter,
        searchTerm,
        materialRequestIdsWithOc,
        ordersByMaterialRequestId
      ),
    [normalizedRequests, rmCardFilter, searchTerm, materialRequestIdsWithOc, ordersByMaterialRequestId]
  );

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

  return (
    <ProtectedRoute route="/ponto/gerenciar-materiais">
      <MainLayout
        userRole={user.role}
        userName={user.name}
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Requisições de Materiais
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Acompanhe o status das requisições de materiais.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {RM_STAT_CARDS.map((card) => (
              <FilterStatCard
                key={card.filter}
                label={card.label}
                count={stats[card.countKey]}
                icon={card.Icon}
                iconBg={card.iconBg}
                iconColor={card.iconColor}
                isActive={rmCardFilter === card.filter}
                loading={loadingRequests}
                onClick={() => setRmCardFilter(card.filter)}
              />
            ))}
          </div>

          <MaterialRequestsRmList
            cardFilter={rmCardFilter}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            loadingRequests={loadingRequests}
            filteredRequests={filteredRequests}
            ordersByMaterialRequestId={ordersByMaterialRequestId}
            currentUserId={userData?.data?.id}
            onDetails={async (request) => {
              try {
                const res = await api.get(`/material-requests/${request.id}`);
                setSelectedRequest((res.data?.data ?? res.data) as MaterialRequest);
                setShowDetailsModal(true);
              } catch {
                toast.error('Erro ao carregar detalhes da RM');
              }
            }}
          />
        </div>

        {/* Modal Detalhes */}
        {showDetailsModal && selectedRequest && (() => {
          const detailOrders = ordersByMaterialRequestId.get(selectedRequest.id) ?? [];
          const displayStatus = getMaterialRequestDisplayStatus(selectedRequest, detailOrders);
          const statusInfo = getStatusInfo(displayStatus);
          const cancellationReason = getMaterialRequestCancellationReason(selectedRequest, detailOrders);

          return (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={requestCloseDetailsModal}
              aria-hidden
            />
            <div
              className="relative flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
              role="dialog"
              aria-modal="true"
              aria-labelledby="rm-details-modal-title"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                <h3
                  id="rm-details-modal-title"
                  className="text-lg font-semibold text-gray-900 dark:text-gray-100"
                >
                  Detalhes da Requisição
                </h3>
                <button
                  type="button"
                  onClick={requestCloseDetailsModal}
                  className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Número</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {formatRmListDisplayId(selectedRequest.requestNumber) ||
                      `#${selectedRequest.id.slice(0, 8)}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
                {displayStatus === 'CANCELLED' && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Motivo do cancelamento</p>
                    <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                      {cancellationReason || 'Motivo não informado.'}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Solicitante</p>
                  <p className="text-gray-900 dark:text-gray-100">{rmSolicitante(selectedRequest)?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Contrato</p>
                  <p className="text-gray-900 dark:text-gray-100">{rmContractDisplay(selectedRequest)}</p>
                </div>
                {selectedRequest.project && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Projeto</p>
                    <p className="text-gray-900 dark:text-gray-100">{selectedRequest.project.name}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Descrição</p>
                  <p className="text-gray-900 dark:text-gray-100">{selectedRequest.description || 'Sem descrição'}</p>
                </div>
                {selectedRequest.demandSheet ? (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Ficha de Demanda</p>
                    <p className="text-gray-900 dark:text-gray-100">{selectedRequest.demandSheet}</p>
                  </div>
                ) : null}
                {(() => {
                  const fdFiles = getDemandSheetFiles(selectedRequest);
                  if (fdFiles.length === 0 && !isAdministrator) return null;
                  return (
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Anexos</p>
                        {isAdministrator ? (
                          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/80">
                            <Paperclip className="h-3.5 w-3.5" />
                            Anexar
                            <input
                              type="file"
                              className="hidden"
                              disabled={adminAttachmentBusy}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) void handleAdminReplaceDemandFile(selectedRequest, null, file);
                              }}
                            />
                          </label>
                        ) : null}
                      </div>
                      {fdFiles.length === 0 ? (
                        <p className="text-xs text-gray-400">Nenhum anexo</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {fdFiles.map((file, index) => (
                            <li
                              key={`${file.url}-${index}`}
                              className="flex flex-wrap items-center gap-2"
                            >
                              <a
                                href={absoluteUploadUrl(file.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                              >
                                {file.name || 'Ver anexo'}
                              </a>
                              {isAdministrator ? (
                                <span className="inline-flex items-center gap-1">
                                  <label className="inline-flex cursor-pointer items-center rounded-md border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/80">
                                    Trocar
                                    <input
                                      type="file"
                                      className="hidden"
                                      disabled={adminAttachmentBusy}
                                      onChange={(e) => {
                                        const nextFile = e.target.files?.[0];
                                        e.target.value = '';
                                        if (nextFile) {
                                          void handleAdminReplaceDemandFile(
                                            selectedRequest,
                                            index,
                                            nextFile
                                          );
                                        }
                                      }}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    disabled={adminAttachmentBusy}
                                    onClick={() =>
                                      void handleAdminRemoveDemandFile(selectedRequest, index)
                                    }
                                    className="rounded-md border border-red-200 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40 disabled:opacity-50"
                                  >
                                    Remover
                                  </button>
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Itens</p>
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                          <th className="text-left p-2">Material</th>
                          <th className="text-right p-2">Qtd</th>
                          <th className="text-right p-2">Unidade</th>
                          <th className="text-left p-2">Anexo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRequest.items?.map((item: any) => (
                          <tr key={item.id} className="border-t border-gray-200 dark:border-gray-600">
                            <td className="p-2 text-gray-900 dark:text-gray-100">
                              {materialItemLabel(item)}
                            </td>
                            <td className="p-2 text-right">{item.quantity}</td>
                            <td className="p-2 text-right">{item.unit || '-'}</td>
                            <td className="p-2 text-left">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {item.attachmentUrl ? (
                                  <a
                                    href={absoluteUploadUrl(item.attachmentUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                                  >
                                    {item.attachmentName || 'Ver anexo'}
                                  </a>
                                ) : (
                                  <span className="text-gray-400 text-xs">—</span>
                                )}
                                {isAdministrator ? (
                                  <>
                                    <label className="inline-flex cursor-pointer items-center rounded-md border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/80">
                                      {item.attachmentUrl ? 'Trocar' : 'Anexar'}
                                      <input
                                        type="file"
                                        className="hidden"
                                        disabled={adminAttachmentBusy}
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          e.target.value = '';
                                          if (file) {
                                            void handleAdminReplaceItemAttachment(
                                              selectedRequest,
                                              item.id,
                                              file
                                            );
                                          }
                                        }}
                                      />
                                    </label>
                                    {item.attachmentUrl ? (
                                      <button
                                        type="button"
                                        disabled={adminAttachmentBusy}
                                        onClick={() =>
                                          void handleAdminReplaceItemAttachment(
                                            selectedRequest,
                                            item.id,
                                            null
                                          )
                                        }
                                        className="rounded-md border border-red-200 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40 disabled:opacity-50"
                                      >
                                        Remover
                                      </button>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                {selectedRequest.status === 'IN_REVIEW' &&
                  userData?.data?.id === rmSolicitante(selectedRequest)?.id && (
                    <Link
                      href={`/ponto/solicitar-materiais?editRm=${selectedRequest.id}`}
                      onClick={closeDetailsModal}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
                    >
                      <Pencil className="h-4 w-4" />
                      Editar RM
                    </Link>
                  )}
                <button
                  type="button"
                  onClick={closeDetailsModal}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {showCloseDetailsConfirm && (
          <div className="app-modal-overlay fixed inset-0 z-[2010] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowCloseDetailsConfirm(false)}
            />
            <div className="app-modal-panel relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
                Deseja fechar?
              </h3>
              <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
                Tem certeza que deseja fechar os detalhes da requisição?
              </p>
              <div className="flex items-center justify-center space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCloseDetailsConfirm(false)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={closeDetailsModal}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-red-700 dark:hover:bg-red-800"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Criar OC */}
        {showCreateOCModal && selectedRequest && (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => {
                setShowCreateOCModal(false);
                resetOcForm();
              }}
              aria-hidden
            />
            <div
              className="relative flex max-h-[min(92vh,800px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-oc-modal-title"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                <div className="min-w-0">
                  <h3
                    id="create-oc-modal-title"
                    className="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Criar Ordem de Compra
                  </h3>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                    RM: {formatRmListDisplayId(selectedRequest.requestNumber) || selectedRequest.id.slice(0, 8)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateOCModal(false);
                    resetOcForm();
                  }}
                  className="shrink-0 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
              {/* Lista de itens */}
              <div>
                <div className="mb-3">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Itens da SC</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Selecione quais itens serão inseridos nesta OC.
                  </p>
                </div>

                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600">
                  <div className="max-h-[min(280px,40vh)] overflow-auto">
                    <table className="w-full min-w-[26rem] table-fixed border-collapse text-sm">
                      <colgroup>
                        <col className="w-10" />
                        <col />
                        <col className="w-[5.5rem]" />
                        <col className="w-[6rem]" />
                        <col className="w-[7.5rem]" />
                      </colgroup>
                      <thead className="sticky top-0 z-[1] border-b border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-900/80">
                        <tr className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          <th scope="col" className="px-2 py-2">
                            <div className="flex justify-center">
                              <OcStyledCheckbox
                                checked={ocAllItemsSelected}
                                onChange={(checked) => {
                                  if (checked) selectAllOcItems();
                                  else clearOcItems();
                                }}
                                ariaLabel="Selecionar todos os itens"
                                title="Selecionar todos"
                              />
                            </div>
                          </th>
                          <th scope="col" className="px-2 py-2 text-left font-medium">
                            Material
                          </th>
                          <th scope="col" className="px-2 py-2 text-center font-medium">
                            Qtd. SC
                          </th>
                          <th scope="col" className="px-2 py-2 text-left font-medium">
                            Qtd. na OC
                          </th>
                          <th scope="col" className="px-2 py-2 text-left font-medium">
                            Valor unit.
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                        {selectedRequest.items.map((item) => {
                          const isSelected = ocSelectedItemIds.has(item.id);
                          return (
                            <tr key={item.id} className="bg-white dark:bg-gray-800">
                              <td className="px-2 py-2 align-middle">
                                <div className="flex justify-center">
                                  <OcStyledCheckbox
                                    checked={isSelected}
                                    onChange={() => toggleOcItem(item.id)}
                                    ariaLabel={`Incluir ${materialItemLabel(item)} na OC`}
                                  />
                                </div>
                              </td>
                              <td className="px-2 py-2 align-middle">
                                <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                                  {materialItemLabel(item)}
                                </p>
                                {item.attachmentUrl ? (
                                  <a
                                    href={absoluteUploadUrl(item.attachmentUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Anexo
                                  </a>
                                ) : null}
                              </td>
                              <td className="px-2 py-2 text-center align-middle tabular-nums font-medium text-gray-900 dark:text-gray-100">
                                {item.quantity} {item.unit}
                              </td>
                              <td className="px-2 py-2 align-middle">
                                <label htmlFor={`oc-qty-${item.id}`} className="sr-only">
                                  Quantidade na OC
                                </label>
                                <input
                                  id={`oc-qty-${item.id}`}
                                  type="text"
                                  inputMode="decimal"
                                  disabled={!isSelected}
                                  value={ocQuantityStrByItemId[item.id] ?? String(item.quantity)}
                                  onChange={(e) => {
                                    setOcQuantityStrByItemId((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value
                                    }));
                                  }}
                                  className={`${ocFieldCompactCls} w-full`}
                                />
                              </td>
                              <td className="px-2 py-2 align-middle">
                                <label htmlFor={`oc-price-${item.id}`} className="sr-only">
                                  Valor unitário em reais
                                </label>
                                <input
                                  id={`oc-price-${item.id}`}
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="R$ 0,00"
                                  disabled={!isSelected}
                                  value={ocUnitPriceStrByItemId[item.id] ?? ''}
                                  onChange={(e) => {
                                    setOcUnitPriceStrByItemId((prev) => ({
                                      ...prev,
                                      [item.id]: maskCurrencyInputBrOrEmpty(e.target.value)
                                    }));
                                  }}
                                  className={`${ocFieldCompactCls} w-full tabular-nums`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Selecionados: {ocSelectedItems.length} de {selectedRequest.items.length}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Fornecedor *
                </label>
                <AsyncSearchSelectDropdown
                  value={ocSupplierId}
                  selectedLabel={ocSupplierSearch}
                  onChange={(supplier) => {
                    setOcSupplierId(supplier.id);
                    setOcSupplierSearch(getOcSupplierLabel(supplier));
                  }}
                  searchFn={searchOcSuppliers}
                  getOptionId={(supplier) => supplier.id}
                  getOptionLabel={getOcSupplierLabel}
                  queryKeyPrefix="suppliers-oc-modal"
                  placeholder="Digite para buscar fornecedor..."
                  searchPlaceholder="Pesquisar fornecedor..."
                />
                <input type="hidden" value={ocSupplierId} readOnly />
              </div>

              <div>
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tipo de pagamento *
                </span>
                <div
                  role="radiogroup"
                  aria-label="Tipo de pagamento"
                  className="grid w-full grid-cols-2 gap-2"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={ocPaymentType === OC_TYPE_AVISTA}
                    onClick={() => setOcPaymentType(OC_TYPE_AVISTA)}
                    className={ocPaymentSegmentCls(ocPaymentType === OC_TYPE_AVISTA)}
                  >
                    À vista
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={ocPaymentType === OC_TYPE_BOLETO}
                    onClick={() => setOcPaymentType(OC_TYPE_BOLETO)}
                    className={ocPaymentSegmentCls(ocPaymentType === OC_TYPE_BOLETO)}
                  >
                    Boleto
                  </button>
                </div>
              </div>

              {ocPaymentType !== OC_TYPE_AVISTA ? (
                <div>
                  <label htmlFor="ocPaymentCondition" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Condição de pagamento *
                  </label>
                  <PaymentConditionSelect
                    id="ocPaymentCondition"
                    paymentType="BOLETO"
                    value={ocPaymentCondition}
                    onChange={setOcPaymentCondition}
                  />
                </div>
              ) : null}

              {ocPaymentType === OC_TYPE_AVISTA ? (
                <>
                  <div>
                    <label htmlFor="ocPaymentDetails" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Dados do pagamento *
                    </label>
                    <textarea
                      id="ocPaymentDetails"
                      value={ocPaymentDetails}
                      onChange={(e) => setOcPaymentDetails(e.target.value)}
                      rows={3}
                      className={`${ocFieldCls} resize-y`}
                      placeholder="Conta, agência, favorecido, etc."
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2.2fr)]">
                    <div>
                      <label htmlFor="ocPixKeyType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Tipo de Chave Pix *
                      </label>
                      <SingleSelectSearchDropdown
                        value={ocPixKeyType}
                        onChange={setOcPixKeyType}
                        options={OC_PIX_KEY_TYPE_OPTIONS}
                        allowEmpty
                        placeholder="Selecione..."
                        searchPlaceholder="Pesquisar..."
                        noFocusRing
                      />
                    </div>

                    <div>
                      <label htmlFor="ocPixKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Chave Pix *
                      </label>
                      <input
                        id="ocPixKey"
                        type="text"
                        value={ocPixKey}
                        onChange={(e) => setOcPixKey(e.target.value)}
                        className={ocFieldCls}
                        placeholder="Informe a chave PIX"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="ocPaymentDetails" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Dados do pagamento
                    </label>
                    <textarea
                      id="ocPaymentDetails"
                      value={ocPaymentDetails}
                      onChange={(e) => setOcPaymentDetails(e.target.value)}
                      rows={3}
                      className={`${ocFieldCls} resize-y`}
                      placeholder="Conta, agência, favorecido, etc."
                    />
                  </div>

                  <OcBoletoCreationFields
                    idPrefix="oc-create-boleto"
                    parcelCount={ocBoletoParcelMeta.parcelCount}
                    parcelDueDays={ocBoletoParcelMeta.parcelDueDays}
                    slots={ocBoletoSlots}
                    onChange={setOcBoletoSlots}
                    disabled={createOCMutation.isPending}
                  />
                </>
              )}

              <div>
                <label htmlFor="ocFrete" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Frete
                </label>
                <input
                  id="ocFrete"
                  type="text"
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                  value={ocFreteStr}
                  onChange={(e) => setOcFreteStr(maskCurrencyInputBrOrEmpty(e.target.value))}
                  className={`${ocFieldCls} tabular-nums`}
                />
                {ocFreteInvalid && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">Informe um valor de frete válido ou deixe em branco.</p>
                )}
              </div>

              <div>
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Valor total *
                </span>
                <div
                  className={`${ocFieldCls} bg-gray-50 font-semibold dark:bg-gray-900/50`}
                  aria-live="polite"
                >
                  {ocAmountToPayComputed !== null
                    ? `R$ ${formatCurrencyBR(ocAmountToPayComputed)}`
                    : '—'}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Soma dos itens (quantidade × valor unitário) + frete.
                </p>
              </div>

              <div>
                <label htmlFor="ocObservations" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Observações
                </label>
                <textarea
                  id="ocObservations"
                  value={ocObservations}
                  onChange={(e) => setOcObservations(e.target.value)}
                  rows={3}
                  className={`${ocFieldCls} resize-y`}
                  placeholder="Observações gerais da OC"
                />
              </div>
              </div>
              </div>

              <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateOCModal(false);
                    resetOcForm();
                  }}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedRequest || !ocSupplierId) {
                      toast.error('Selecione o fornecedor.');
                      return;
                    }
                    if (ocAmountToPayComputed === null || ocAmountToPayComputed < 0) {
                      toast.error('Corrija o frete ou os valores unitários para obter um total válido.');
                      return;
                    }
                    if (ocPaymentType === OC_TYPE_AVISTA && !ocPaymentDetails.trim()) {
                      toast.error('Informe os dados do pagamento para pagamento à vista.');
                      return;
                    }
                    if (ocPaymentType === OC_TYPE_AVISTA && !ocPixKeyType.trim()) {
                      toast.error('Selecione o tipo de chave PIX.');
                      return;
                    }
                    if (ocPaymentType === OC_TYPE_AVISTA && !ocPixKey.trim()) {
                      toast.error('Informe a chave PIX.');
                      return;
                    }
                    if (ocPaymentType === OC_TYPE_BOLETO) {
                      if (ocBoletoParcelMeta.parcelCount > 1) {
                        if (
                          ocBoletoSlots.length !== ocBoletoParcelMeta.parcelCount ||
                          !ocBoletoSlots.every((s) => s.url.trim())
                        ) {
                          toast.error(
                            `Anexe os ${ocBoletoParcelMeta.parcelCount} boletos (um para cada parcela).`
                          );
                          return;
                        }
                      } else if (!ocBoletoSlots[0]?.url.trim()) {
                        toast.error('Anexe o boleto para pagamento via boleto.');
                        return;
                      }
                    }
                    const unitPriceByItemId = Object.fromEntries(
                      Array.from(ocSelectedItemIds).map((id) => [
                        id,
                        numericUnitPriceFromInput(ocUnitPriceStrByItemId[id] ?? '')
                      ])
                    );
                    const quantityByItemId: Record<string, number> = {};
                    for (const id of Array.from(ocSelectedItemIds)) {
                      const item = selectedRequest.items.find((i) => i.id === id);
                      if (!item) continue;
                      const maxQ = Number(item.quantity);
                      const q = numericQuantityFromInput(ocQuantityStrByItemId[id] ?? '');
                      if (q === null || !(q > 0) || q > maxQ) {
                        toast.error(
                          `Quantidade inválida para "${materialItemLabel(item)}". Informe um valor entre 0 e ${maxQ}.`
                        );
                        return;
                      }
                      quantityByItemId[id] = q;
                    }
                    createOCMutation.mutate({
                      request: selectedRequest,
                      supplierId: ocSupplierId,
                      paymentType: ocPaymentType,
                      paymentCondition: ocPaymentCondition,
                      paymentDetails: ocPaymentDetails,
                      pixKeyType: ocPixKeyType,
                      pixKey: ocPixKey,
                      observations: ocObservations,
                      freightAmount: ocFreteParsed ?? 0,
                      selectedItemIds: Array.from(ocSelectedItemIds),
                      quantityByItemId,
                      unitPriceByItemId,
                      ...(ocBoletoParcelMeta.parcelCount > 1
                        ? {
                            creationBoletoInstallments: ocBoletoSlots.map((s) => ({
                              boletoUrl: s.url.trim(),
                              boletoName: s.name.trim() || undefined
                            }))
                          }
                        : {
                            boletoAttachmentUrl: ocBoletoSlots[0]?.url ?? '',
                            boletoAttachmentName: ocBoletoSlots[0]?.name ?? ''
                          })
                    });
                  }}
                  disabled={
                    !ocSupplierId ||
                    createOCMutation.isPending ||
                    ocSelectedItems.length === 0 ||
                    ocAmountToPayComputed === null ||
                    ocAmountToPayComputed < 0 ||
                    (ocPaymentType === OC_TYPE_AVISTA &&
                      isOcAvistaPaymentIncomplete(
                        ocPaymentType,
                        ocPaymentDetails,
                        ocPixKeyType,
                        ocPixKey
                      )) ||
                    (ocPaymentType === OC_TYPE_BOLETO &&
                      (ocBoletoParcelMeta.parcelCount > 1
                        ? ocBoletoSlots.length !== ocBoletoParcelMeta.parcelCount ||
                          !ocBoletoSlots.every((s) => s.url.trim())
                        : !ocBoletoSlots[0]?.url.trim()))
                  }
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {createOCMutation.isPending ? 'Criando...' : 'Criar OC'}
                </button>
              </div>
            </div>
          </div>
        )}

      </MainLayout>
    </ProtectedRoute>
  );
}
