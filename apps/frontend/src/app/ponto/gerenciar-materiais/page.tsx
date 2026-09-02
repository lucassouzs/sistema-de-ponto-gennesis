'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, X, CheckCircle, ClipboardList, Clock, ShoppingCart, XCircle, Paperclip, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { AppModalTabButton } from '@/components/ui/AppTabButton';
import api from '@/lib/api';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import { fixMojibakeFileName } from '@/lib/fixMojibakeFileName';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { OcStyledCheckbox, type PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';
import { OcAttachmentActions } from '@/components/oc/OcAttachmentActions';
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
import {
  getPriorityInfo,
  getStatusInfo,
  formatDateTime,
  materialItemLabel,
  rmContractDisplay,
  rmOsDisplay,
  rmSolicitante,
  rmSolicitanteId
} from './_lib/display';
import { getCoveredRmItemIds, canUserCancelRmItem, isRmItemCancelled } from '@/lib/rmProcurementCoverage';
import { RmItemSituationCell } from '@/components/material-requests/RmItemSituationCell';
import { RmLinkedOcDocuments } from '@/components/material-requests/RmLinkedOcDocuments';
import { Modal } from '@/components/ui/Modal';
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
import { buildSupplierPaymentPrefill } from '@/lib/supplierPaymentPrefill';
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
import { RmCommentsSection } from './_components/RmCommentsSection';
import { RmDetailOcTab } from './_components/RmDetailOcTab';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

type RmDetailModalTab = 'resumo' | 'materiais' | 'ocs' | 'documentos' | 'comentarios';

const RM_DETAIL_MODAL_TABS: { id: RmDetailModalTab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'materiais', label: 'Materiais' },
  { id: 'ocs', label: 'Ordens de compra' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'comentarios', label: 'Comentários' }
];

function RmDetailDocSection({
  title,
  description,
  headerRight,
  children
}: {
  title: string;
  description?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-0 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 pb-3 dark:border-gray-700">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
            {title}
          </h3>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {description}
            </p>
          ) : null}
        </div>
        {headerRight}
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">{children}</div>
    </section>
  );
}

function RmDetailDocumentItem({
  label,
  subtitle,
  url,
  fileName,
  pending = false,
  actions
}: {
  label: string;
  subtitle?: string;
  url?: string | null;
  fileName?: string | null;
  pending?: boolean;
  actions?: React.ReactNode;
}) {
  const trimmedUrl = (url || '').trim();
  const isPending = pending || !trimmedUrl;

  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-3 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isPending ? (
          <span className="inline-flex whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            Pendente
          </span>
        ) : (
          <OcAttachmentActions
            url={trimmedUrl}
            fileName={fileName || label}
            variant="buttons"
          />
        )}
        {actions}
      </div>
    </div>
  );
}

const ocFieldCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50';

type OcSupplierOption = {
  id: string;
  code: string;
  name: string;
  tradeName?: string | null;
  isActive?: boolean;
  bank?: string | null;
  agency?: string | null;
  account?: string | null;
  accountDigit?: string | null;
  pixKeyType?: string | null;
  pixKey?: string | null;
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
  const [loadingRmDetails, setLoadingRmDetails] = useState(false);
  const [showCreateOCModal, setShowCreateOCModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [rmDetailTab, setRmDetailTab] = useState<RmDetailModalTab>('resumo');
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

  // Quando abrir o modal de OC, preenche com itens da SC ainda sem OC ativa.
  useEffect(() => {
    if (!showCreateOCModal || !selectedRequest?.items?.length) return;
    const covered = getCoveredRmItemIds(selectedRequest);
    const openItems = selectedRequest.items.filter(
      (i) => !covered.has(i.id) && !isRmItemCancelled(i)
    );
    setOcSelectedItemIds(new Set(openItems.map((i) => i.id)));
    setOcQuantityStrByItemId(
      Object.fromEntries(openItems.map((i) => [i.id, String(i.quantity)]))
    );
    setOcUnitPriceStrByItemId({});
  }, [showCreateOCModal, selectedRequest]);

  const ocFormItems = useMemo(() => {
    if (!selectedRequest?.items?.length) return [];
    const covered = getCoveredRmItemIds(selectedRequest);
    return selectedRequest.items.filter(
      (i) => !covered.has(i.id) && !isRmItemCancelled(i)
    );
  }, [selectedRequest]);

  const ocSelectedItems =
    ocFormItems.filter((i) => ocSelectedItemIds.has(i.id));

  const ocAllItemsSelected = Boolean(
    ocFormItems.length && ocFormItems.every((i) => ocSelectedItemIds.has(i.id))
  );

  const ocSubtotalItens = useMemo(() => {
    if (!ocFormItems.length) return 0;
    let s = 0;
    for (const item of ocFormItems) {
      if (!ocSelectedItemIds.has(item.id)) continue;
      const q =
        numericQuantityFromInput(ocQuantityStrByItemId[item.id] ?? '') ??
        Number(item.quantity);
      const unit = numericUnitPriceFromInput(ocUnitPriceStrByItemId[item.id] ?? '');
      s += q * unit;
    }
    return Math.round(s * 100) / 100;
  }, [ocFormItems, ocSelectedItemIds, ocQuantityStrByItemId, ocUnitPriceStrByItemId]);

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
    if (!ocFormItems.length) return;
    setOcSelectedItemIds(new Set(ocFormItems.map((i) => i.id)));
    setOcQuantityStrByItemId((prev) => {
      const next = { ...prev };
      for (const it of ocFormItems) {
        if (next[it.id] === undefined) next[it.id] = String(it.quantity);
      }
      return next;
    });
    setOcUnitPriceStrByItemId((prev) => {
      const next = { ...prev };
      for (const it of ocFormItems) {
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
  const { isUnbUser, unbCostCenterIds, isAdministrator, isElevatedUser, canApproveMaterialRequests } = usePermissions();
  const [adminAttachmentBusy, setAdminAttachmentBusy] = useState(false);
  const [cancelItemTarget, setCancelItemTarget] = useState<{
    requestId: string;
    itemId: string;
    label: string;
  } | null>(null);

  const uploadRmAttachmentFile = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.post('/material-requests/upload-item-attachment', fd);
    const d = res.data?.data as { url?: string; originalName?: string } | undefined;
    if (!d?.url) throw new Error('Resposta inválida do servidor');
    return {
      url: d.url,
      name: fixMojibakeFileName(d.originalName || file.name) || 'Arquivo anexado',
    };
  };

  const getDemandSheetFiles = (request: MaterialRequest) => {
    const fromList = Array.isArray(request.demandSheetAttachments)
      ? request.demandSheetAttachments
          .map((file) => ({
            url: String(file?.url || '').trim(),
            name: fixMojibakeFileName(String(file?.name || '').trim()) || 'Arquivo anexado',
          }))
          .filter((file) => file.url)
      : [];
    if (fromList.length > 0) return fromList;
    if (request.demandSheetAttachmentUrl) {
      return [
        {
          url: request.demandSheetAttachmentUrl,
          name: fixMojibakeFileName(request.demandSheetAttachmentName) || 'Arquivo anexado',
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
    setShowDetailsModal(false);
    setSelectedRequest(null);
    setLoadingRmDetails(false);
    setRmDetailTab('resumo');
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

  const cancelRmItemMutation = useMutation({
    mutationFn: async ({ requestId, itemId }: { requestId: string; itemId: string }) => {
      const res = await api.patch(`/material-requests/${requestId}/items/${itemId}/cancel`);
      return res.data;
    },
    onSuccess: async (data, { requestId }) => {
      toast.success('Item cancelado.');
      setCancelItemTarget(null);
      const updated = data?.data as MaterialRequest | undefined;
      if (updated) {
        setSelectedRequest(updated);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['material-requests-manage'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }),
        queryClient.invalidateQueries({ queryKey: ['material-request-detail', requestId] }),
      ]);
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Não foi possível cancelar o item');
    },
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

  /** OCs vinculadas por requisição — prioriza purchaseOrders da RM (traz vínculo item↔OC). */
  const ordersByMaterialRequestId = useMemo(() => {
    const map = new Map<string, PurchaseOrder[]>();

    const upsert = (requestId: string, order: PurchaseOrder) => {
      if (!map.has(requestId)) map.set(requestId, []);
      const list = map.get(requestId)!;
      const idx = list.findIndex((row) => row.id === order.id);
      if (idx < 0) {
        list.push(order);
        return;
      }
      const prev = list[idx]!;
      const prevItems = prev.items ?? [];
      const nextItems = order.items ?? [];
      if (nextItems.length > 0 && prevItems.length === 0) {
        list[idx] = { ...prev, ...order, items: nextItems };
      }
    };

    for (const request of normalizedRequests) {
      const embedded = (request as MaterialRequest & { purchaseOrders?: PurchaseOrder[] })
        .purchaseOrders;
      if (!Array.isArray(embedded)) continue;
      for (const order of embedded) upsert(request.id, order);
    }

    for (const order of allOrders) {
      const requestId = order.materialRequestId ?? order.materialRequest?.id;
      if (!requestId) continue;
      upsert(requestId, order);
    }

    map.forEach((list) => {
      list.sort((a, b) =>
        (b.orderNumber || '').localeCompare(a.orderNumber || '', 'pt-BR', { numeric: true })
      );
    });
    return map;
  }, [normalizedRequests, allOrders]);

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
      <ProtectedRoute route="/ponto/gerenciar-materiais">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/gerenciar-materiais">
      <MainLayout
        userRole={user.role}
        userName={user.name}
        onLogout={handleLogout}
      >
        <div className="space-y-4">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Requisições de Materiais
            </h1>
            <p className="mt-1 text-sm sm:text-base text-gray-600 dark:text-gray-400">
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
            isAdministrator={isAdministrator}
            isElevatedUser={isElevatedUser}
            onDetails={(request) => {
              setSelectedRequest(request);
              setRmDetailTab('resumo');
              setShowDetailsModal(true);
              setLoadingRmDetails(true);
              void (async () => {
                try {
                  const res = await api.get(`/material-requests/${request.id}`);
                  setSelectedRequest((res.data?.data ?? res.data) as MaterialRequest);
                } catch {
                  toast.error('Erro ao carregar detalhes da RM');
                } finally {
                  setLoadingRmDetails(false);
                }
              })();
            }}
          />
        </div>

        {/* Modal Detalhes */}
        {showDetailsModal && selectedRequest && (() => {
          const embeddedOrders = (
            selectedRequest as MaterialRequest & { purchaseOrders?: PurchaseOrder[] }
          ).purchaseOrders;
          const detailOrders =
            Array.isArray(embeddedOrders) && embeddedOrders.length > 0
              ? embeddedOrders
              : ordersByMaterialRequestId.get(selectedRequest.id) ?? [];
          const openRmItemCount =
            selectedRequest.items?.filter((row) => !isRmItemCancelled(row)).length ?? 0;
          const userCanCancelItems = canUserCancelRmItem({
            userId: userData?.data?.id,
            requestedBy: rmSolicitante(selectedRequest)?.id,
            isAdministrator: isElevatedUser,
            canApproveMaterialRequests,
          });
          const displayStatus = getMaterialRequestDisplayStatus(selectedRequest, detailOrders);
          const statusInfo = getStatusInfo(displayStatus);
          const priorityInfo = getPriorityInfo(selectedRequest.priority);
          const cancellationReason = getMaterialRequestCancellationReason(selectedRequest, detailOrders);
          const rmDisplayNo =
            formatRmListDisplayId(selectedRequest.requestNumber) ||
            selectedRequest.id.slice(0, 8);
          const fdFiles = getDemandSheetFiles(selectedRequest);
          const isCommentsTab = rmDetailTab === 'comentarios';
          const canManageDemandSheetAttachments =
            isAdministrator ||
            (!!userData?.data?.id && userData.data.id === rmSolicitanteId(selectedRequest));

          const infoRows: { label: string; value: React.ReactNode; stacked?: boolean }[] = [
            { label: 'Status', value: (
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            )},
            { label: 'Prioridade', value: (
              <span className={priorityInfo.color}>{priorityInfo.label}</span>
            )},
            { label: 'Solicitante', value: rmSolicitante(selectedRequest)?.name || '—' },
            { label: 'Contrato', value: rmContractDisplay(selectedRequest) },
            { label: 'Ordem de serviço', value: rmOsDisplay(selectedRequest) },
          ];
          if (selectedRequest.project?.name) {
            infoRows.push({ label: 'Projeto', value: selectedRequest.project.name });
          }
          if (selectedRequest.createdAt) {
            infoRows.push({
              label: 'Data',
              value: formatDateTime(selectedRequest.createdAt)
            });
          }
          if (selectedRequest.demandSheet) {
            infoRows.push({ label: 'Ficha de Demanda', value: selectedRequest.demandSheet });
          }
          if (displayStatus === 'CANCELLED') {
            infoRows.push({
              label: 'Motivo do cancelamento',
              value: (
                <span className="whitespace-pre-wrap leading-relaxed">
                  {cancellationReason || 'Motivo não informado.'}
                </span>
              ),
              stacked: true
            });
          }
          if (selectedRequest.description?.trim()) {
            infoRows.push({
              label: 'Descrição',
              value: (
                <span className="whitespace-pre-wrap leading-relaxed">
                  {selectedRequest.description}
                </span>
              ),
              stacked: true
            });
          }

          return (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={closeDetailsModal}
              aria-hidden
            />
            <div
              className={`relative my-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800 ${
                isCommentsTab
                  ? 'h-[min(92dvh,calc(100dvh-2rem))]'
                  : 'max-h-[min(92dvh,calc(100dvh-2rem))]'
              }`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="rm-details-modal-title"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-2">
                <div className="min-w-0">
                  <h2
                    id="rm-details-modal-title"
                    className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Requisição de Material No. {rmDisplayNo}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeDetailsModal}
                  className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div
                className="shrink-0 border-b border-gray-200 px-5 dark:border-gray-700"
                role="tablist"
                aria-label="Seções da RM"
              >
                <div className="table-scroll -mb-px flex gap-1">
                  {RM_DETAIL_MODAL_TABS.map((tab) => {
                    const active = rmDetailTab === tab.id;
                    return (
                      <AppModalTabButton
                        key={tab.id}
                        active={active}
                        onClick={() => setRmDetailTab(tab.id)}
                        className="shrink-0 px-3 py-2.5 text-sm"
                      >
                        {tab.label}
                      </AppModalTabButton>
                    );
                  })}
                </div>
              </div>

              <div
                className={
                  isCommentsTab
                    ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-4 pt-4'
                    : 'min-h-0 flex-1 overflow-y-auto px-5 py-4'
                }
              >
                <div
                  className={
                    isCommentsTab ? 'flex h-full min-h-0 flex-col text-sm' : 'space-y-5 text-sm'
                  }
                >
                  {loadingRmDetails ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500 dark:text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando detalhes da RM…
                    </div>
                  ) : null}

                  {!loadingRmDetails && rmDetailTab === 'resumo' ? (
                    <div className="space-y-4">
                      <dl className="divide-y divide-gray-200 dark:divide-gray-700">
                        {infoRows.map((row) => (
                          <div
                            key={row.label}
                            className={
                              row.stacked
                                ? 'flex flex-col gap-1.5 py-3'
                                : 'flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6'
                            }
                          >
                            <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                              {row.label}
                            </dt>
                            <dd
                              className={
                                row.stacked
                                  ? 'min-w-0 text-left text-sm text-gray-900 dark:text-gray-100'
                                  : 'min-w-0 text-sm text-gray-900 dark:text-gray-100 sm:text-right'
                              }
                            >
                              {row.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}

                  {!loadingRmDetails && rmDetailTab === 'ocs' ? (
                    <RmDetailOcTab
                      materialRequestStatus={selectedRequest.status}
                      orders={detailOrders}
                      enabled={rmDetailTab === 'ocs'}
                      rmItems={selectedRequest.items}
                    />
                  ) : null}

                  {!loadingRmDetails && rmDetailTab === 'materiais' ? (
                    selectedRequest.items?.length ? (
                      <div className="table-scroll">
                        <table className="w-full text-xs sm:text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                              <th className="w-12 whitespace-nowrap pb-3 pr-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                                Item
                              </th>
                              <th className="px-2 pb-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                                Material
                              </th>
                              <th className="whitespace-nowrap px-2 pb-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                                Qtd
                              </th>
                              <th className="whitespace-nowrap px-2 pb-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                                Un.
                              </th>
                              <th className="whitespace-nowrap px-2 pb-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                                Valor referência
                              </th>
                              <th className="whitespace-nowrap pb-3 pl-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                                Situação
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {selectedRequest.items.map((item, idx) => {
                              return (
                              <tr
                                key={item.id}
                                className="text-gray-900 dark:text-gray-100"
                              >
                                <td className="py-3 pr-2 text-center align-top font-medium tabular-nums text-gray-500 dark:text-gray-400">
                                  {idx + 1}
                                </td>
                                <td className="max-w-[220px] px-2 py-3 align-top sm:max-w-none">
                                  {materialItemLabel(item)}
                                  {(item.notes || item.observation)?.trim() ? (
                                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                      {(item.notes || item.observation)?.trim()}
                                    </p>
                                  ) : null}
                                  {item.bankDetails?.trim() ? (
                                    <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-300">
                                      <span className="font-medium text-gray-700 dark:text-gray-200">
                                        Dados bancários:{' '}
                                      </span>
                                      {item.bankDetails.trim()}
                                    </p>
                                  ) : null}
                                </td>
                                <td className="whitespace-nowrap px-2 py-3 text-right align-top tabular-nums">
                                  {Number(item.quantity)}
                                </td>
                                <td className="whitespace-nowrap px-2 py-3 text-center align-top">
                                  {item.unit || '—'}
                                </td>
                                <td className="whitespace-nowrap px-2 py-3 text-right align-top tabular-nums">
                                  {(() => {
                                    const n = Number(item.unitPrice);
                                    if (!Number.isFinite(n) || n < 0) return '—';
                                    return n.toLocaleString('pt-BR', {
                                      style: 'currency',
                                      currency: 'BRL',
                                    });
                                  })()}
                                </td>
                                <td className="whitespace-nowrap py-3 pl-2 text-center align-top">
                                  <RmItemSituationCell
                                    item={item}
                                    requestStatus={selectedRequest.status}
                                    requestEffectivelyCancelled={isMaterialRequestEffectivelyCancelled(
                                      selectedRequest,
                                      detailOrders
                                    )}
                                    orders={detailOrders}
                                    openRmItemCount={openRmItemCount}
                                    canCancel={userCanCancelItems}
                                    cancelling={
                                      cancelRmItemMutation.isPending &&
                                      cancelItemTarget?.itemId === item.id
                                    }
                                    onCancel={() =>
                                      setCancelItemTarget({
                                        requestId: selectedRequest.id,
                                        itemId: item.id,
                                        label: materialItemLabel(item),
                                      })
                                    }
                                  />
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="py-10 text-center text-sm text-gray-400">
                        Nenhum material nesta requisição.
                      </p>
                    )
                  ) : null}

                  {!loadingRmDetails && rmDetailTab === 'documentos' ? (
                    <div className="space-y-4">
                      <RmDetailDocSection
                        title="Ficha de Demanda"
                        headerRight={
                          canManageDemandSheetAttachments ? (
                            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/80">
                              <Paperclip className="h-3.5 w-3.5" />
                              Anexar
                              <input
                                type="file"
                                className="hidden"
                                disabled={adminAttachmentBusy}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  if (file) {
                                    void handleAdminReplaceDemandFile(selectedRequest, null, file);
                                  }
                                }}
                              />
                            </label>
                          ) : null
                        }
                      >
                        {fdFiles.length === 0 ? (
                          <RmDetailDocumentItem
                            label="Arquivo"
                            subtitle="Não anexado"
                            pending
                          />
                        ) : (
                          fdFiles.map((file, index) => (
                            <RmDetailDocumentItem
                              key={`${file.url}-${index}`}
                              label={fdFiles.length > 1 ? `Arquivo ${index + 1}` : 'Arquivo'}
                              subtitle={file.name || 'Anexo'}
                              url={file.url}
                              fileName={file.name}
                              actions={
                                canManageDemandSheetAttachments ? (
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
                                      className="rounded-md border border-red-200 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                                    >
                                      Remover
                                    </button>
                                  </span>
                                ) : null
                              }
                            />
                          ))
                        )}
                      </RmDetailDocSection>

                      <RmLinkedOcDocuments
                        orders={detailOrders}
                        enabled={rmDetailTab === 'documentos'}
                      />

                      {(() => {
                        const itemsWithAttachments = (selectedRequest.items ?? [])
                          .map((item, idx) => ({ item, idx }))
                          .filter(({ item }) => Boolean(item.attachmentUrl?.trim()));
                        if (itemsWithAttachments.length === 0) return null;
                        return (
                          <RmDetailDocSection title="Anexos dos materiais">
                            {itemsWithAttachments.map(({ item, idx }) => (
                              <RmDetailDocumentItem
                                key={item.id}
                                label={`Item ${idx + 1} · ${materialItemLabel(item)}`}
                                subtitle={item.attachmentName || 'Anexo'}
                                url={item.attachmentUrl}
                                fileName={item.attachmentName}
                                actions={
                                  isAdministrator ? (
                                    <span className="inline-flex items-center gap-1">
                                      <label className="inline-flex cursor-pointer items-center rounded-md border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/80">
                                        Trocar
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
                                        className="rounded-md border border-red-200 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                                      >
                                        Remover
                                      </button>
                                    </span>
                                  ) : null
                                }
                              />
                            ))}
                          </RmDetailDocSection>
                        );
                      })()}
                    </div>
                  ) : null}

                  {!loadingRmDetails && rmDetailTab === 'comentarios' ? (
                    <RmCommentsSection
                      materialRequestId={selectedRequest.id}
                      currentUserId={userData?.data?.id}
                      fillHeight
                    />
                  ) : null}
                </div>
              </div>

              {selectedRequest.status === 'IN_REVIEW' &&
              (isAdministrator ||
                userData?.data?.id === rmSolicitante(selectedRequest)?.id) ? (
                <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700">
                  <Link
                    href={`/ponto/solicitar-materiais?editRm=${selectedRequest.id}`}
                    onClick={closeDetailsModal}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar RM
                  </Link>
                </div>
              ) : null}
            </div>
          </AppModalOverlay>
          );
        })()}

        {cancelItemTarget && (
          <Modal
            isOpen
            onClose={() => setCancelItemTarget(null)}
            confirmBeforeClose={false}
            title="Cancelar item"
            size="md"
          >
            <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
              O item <strong>{cancelItemTarget.label}</strong> será marcado como{' '}
              <strong>Cancelado</strong> e sairá do mapa de cotação. Confirma?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCancelItemTarget(null)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700/40 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => cancelRmItemMutation.mutate(cancelItemTarget)}
                disabled={cancelRmItemMutation.isPending}
                className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {cancelRmItemMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </Modal>
        )}

        {/* Modal Criar OC */}
        {showCreateOCModal && selectedRequest && (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
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
                        {ocFormItems.map((item) => {
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
                    const bankPrefill = buildSupplierPaymentPrefill(supplier);
                    if (bankPrefill.paymentDetails) {
                      setOcPaymentDetails(bankPrefill.paymentDetails);
                    }
                    if (bankPrefill.pixKeyType) {
                      setOcPixKeyType(bankPrefill.pixKeyType);
                    }
                    if (bankPrefill.pixKey) {
                      setOcPixKey(bankPrefill.pixKey);
                    }
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
          </AppModalOverlay>
        )}

      </MainLayout>
    </ProtectedRoute>
  );
}
