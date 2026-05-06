'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Eye, Check, X, Wrench, Send, Download, Loader2, Banknote, Receipt, Undo2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { normalizeCostCentersResponse } from '@/lib/costCenters';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import { exportPurchaseOrderPdf } from '@/lib/exportPurchaseOrderPdf';
import { PaymentConditionSelect, buildPaymentConditionLabelMap } from '@/components/oc/PaymentConditionSelect';
import { BoletoParcelasModal } from '@/components/oc/BoletoParcelasModal';
import {
  orderNeedsPaymentBoleto,
  canSendCurrentBoletoToPayment,
  canAttachComprovanteForBoletoOrder,
  canSubmitBoletoToProofValidation,
  lastPaidInstallmentProofUrl,
  hasAwaitingInstallmentPayment,
  awaitingBoletoInstallmentHasProof,
  parsePaymentBoletoInstallments,
  hasAnyPaymentBoletoAttachment,
  romanParcelLabel,
  rowStatus,
  installmentStatusLabel
} from '@/components/oc/ocPaymentBoleto';
import { purchaseOrderPhaseLabel } from '@/components/oc/ocStatusLabels';

export {
  orderNeedsPaymentBoleto,
  canSendCurrentBoletoToPayment,
  canAttachComprovanteForBoletoOrder,
  canSubmitBoletoToProofValidation,
  lastPaidInstallmentProofUrl,
  hasAwaitingInstallmentPayment,
  awaitingBoletoInstallmentHasProof,
  parsePaymentBoletoInstallments,
  hasAnyPaymentBoletoAttachment,
  rowStatus,
  installmentStatusLabel
} from '@/components/oc/ocPaymentBoleto';

export interface PurchaseOrder {
  id: string;
  materialRequestId?: string | null;
  orderNumber: string;
  status: string;
  orderDate: string;
  expectedDelivery?: string;
  deliveryAddress?: string | null;
  notes?: string | null;
  paymentType?: string | null;
  paymentCondition?: string | null;
  paymentDetails?: string | null;
  boletoAttachmentUrl?: string | null;
  boletoAttachmentName?: string | null;
  paymentBoletoUrl?: string | null;
  paymentBoletoName?: string | null;
  /** JSON no backend: parcelas com amount, dueDate, boletoUrl, boletoName */
  paymentBoletoInstallments?: unknown;
  /** Preenchido pela API a partir da condição de pagamento */
  paymentParcelCount?: number;
  paymentParcelDueDays?: number[];
  /** true após "Enviar para fase Pagamento" */
  paymentBoletoPhaseReleased?: boolean | null;
  paymentProofUrl?: string | null;
  paymentProofName?: string | null;
  /** JSON: [{ url, name, uploadedAt }] — NFs após validação do comprovante */
  nfAttachments?: unknown;
  /** Frete (R$). Total a pagar = soma dos itens + frete. */
  freightAmount?: number | string | null;
  amountToPay?: number | string | null;
  supplier: {
    id: string;
    code: string;
    name: string;
    cnpj?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    contactName?: string | null;
    bank?: string | null;
    agency?: string | null;
    account?: string | null;
    accountDigit?: string | null;
  };
  materialRequest?: {
    id?: string;
    requestNumber: string;
    serviceOrder?: string | null;
    description?: string | null;
    costCenter?: { id: string; code?: string | null; name?: string | null };
    quoteMaps?: Array<{ id: string; createdAt: string }>;
  };
  quoteMap?: {
    id: string;
    createdAt: string;
    suppliers?: Array<{
      supplierId: string;
      freight?: number | string | null;
      supplier?: { id: string; name: string; code?: string | null };
    }>;
    winners?: Array<{
      id: string;
      materialRequestItemId: string;
      winnerUnitPrice: number | string;
      winnerScore: number | string;
      winnerSupplier?: { id: string; name: string; code?: string | null };
      materialRequestItem?: {
        id: string;
        material?: { name?: string | null; description?: string | null; sinapiCode?: string | null };
      };
    }>;
  } | null;
  creator?: { id: string; name: string };
  items: Array<{
    materialRequestItemId?: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    unit?: string;
    material?: {
      id: string;
      name?: string | null;
      description?: string | null;
      sinapiCode?: string | null;
    };
  }>;
}

const OC_PAYMENT_TYPE_LABELS: Record<string, string> = {
  AVISTA: 'À vista',
  BOLETO: 'Boleto'
};

const OC_PAYMENT_CONDITION_LABELS: Record<string, string> = {
  AVISTA: 'À vista',
  BOLETO_30: 'Boleto 30 dias',
  BOLETO_28: 'Boleto 28 dias'
};

function nextApprovalStatus(currentStatus: string): string {
  if (currentStatus === 'PENDING_DIRETORIA') return 'APPROVED';
  if (currentStatus === 'PENDING') return 'PENDING_DIRETORIA';
  return 'PENDING';
}

function approvalLabel(currentStatus: string): string {
  if (currentStatus === 'PENDING_DIRETORIA') return 'Aprovar (Diretoria)';
  if (currentStatus === 'PENDING') return 'Aprovar (Gestor)';
  return 'Aprovar (Compras)';
}

function parseOcNfAttachments(raw: unknown): Array<{ url: string; name: string | null; uploadedAt: string }> {
  if (!raw || !Array.isArray(raw)) return [];
  const out: Array<{ url: string; name: string | null; uploadedAt: string }> = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const rec = x as Record<string, unknown>;
    const u = typeof rec.url === 'string' ? rec.url.trim() : '';
    if (!u) continue;
    const name =
      typeof rec.name === 'string' && rec.name.trim() ? String(rec.name).trim() : null;
    const uploadedAt =
      typeof rec.uploadedAt === 'string' && rec.uploadedAt.trim()
        ? String(rec.uploadedAt).trim()
        : '';
    out.push({ url: u, name, uploadedAt });
  }
  return out;
}

/** Total da OC na listagem: itens + frete (fallback em registros antigos só com amountToPay). */
function orderGrandTotal(o: Pick<PurchaseOrder, 'items' | 'freightAmount' | 'amountToPay'>): number {
  const items = o.items?.reduce((s, i) => s + Number(i.totalPrice), 0) ?? 0;
  const fRaw = o.freightAmount;
  if (fRaw != null && fRaw !== '' && Number.isFinite(Number(fRaw))) {
    return Math.round((items + Number(fRaw)) * 100) / 100;
  }
  if (o.amountToPay != null && o.amountToPay !== '' && Number.isFinite(Number(o.amountToPay))) {
    return Number(o.amountToPay);
  }
  return Math.round(items * 100) / 100;
}

function orderFreightValue(o: Pick<PurchaseOrder, 'freightAmount' | 'amountToPay' | 'items'>): number {
  const items = o.items?.reduce((s, i) => s + Number(i.totalPrice), 0) ?? 0;
  const fRaw = o.freightAmount;
  if (fRaw != null && fRaw !== '' && Number.isFinite(Number(fRaw))) {
    return Math.max(0, Number(fRaw));
  }
  const paid = o.amountToPay != null && o.amountToPay !== '' ? Number(o.amountToPay) : NaN;
  if (Number.isFinite(paid)) return Math.max(0, paid - items);
  return 0;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  PENDING_COMPRAS: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  PENDING_DIRETORIA: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300',
  IN_REVIEW: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  PENDING_PROOF_VALIDATION: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  PENDING_PROOF_CORRECTION: 'bg-amber-100 text-amber-900 dark:bg-amber-900/35 dark:text-amber-200',
  PENDING_NF_ATTACHMENT: 'bg-teal-100 text-teal-900 dark:bg-teal-900/30 dark:text-teal-300',
  SENT: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  FINALIZED: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/35 dark:text-indigo-200',
  PARTIALLY_RECEIVED: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  RECEIVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
};

export type OcTab =
  | 'compras'
  | 'gestor'
  | 'diretoria'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'ATTACH_BOLETO'
  | 'PROOF_VALIDATION'
  | 'PROOF_CORRECTION'
  | 'ATTACH_NF'
  | 'FINALIZADAS'
  | 'outras';

export type OcPurchaseOrdersPanelProps = {
  /** Quando true, painel integrado ao fluxo SC/RM (mesma página). */
  embedded?: boolean;
  /** Esconde a barra de abas interna (abas unificadas na página pai). */
  hideTabs?: boolean;
  /** Aba OC ativa quando `hideTabs` (controlado pelo pai). */
  activeTab?: OcTab;
};

export function OcPurchaseOrdersPanel({
  embedded = false,
  hideTabs = false,
  activeTab: activeTabProp
}: OcPurchaseOrdersPanelProps) {
  const queryClient = useQueryClient();
  const [internalActiveTab, setInternalActiveTab] = useState<OcTab>('compras');
  const activeTab = hideTabs ? (activeTabProp ?? 'compras') : internalActiveTab;
  const setActiveTab = (t: OcTab) => {
    if (!hideTabs) setInternalActiveTab(t);
  };
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PurchaseOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [correctionTarget, setCorrectionTarget] = useState<PurchaseOrder | null>(null);
  const [pdfExportingId, setPdfExportingId] = useState<string | null>(null);
  const [showEditOcModal, setShowEditOcModal] = useState(false);
  const [orderDetailLoadingId, setOrderDetailLoadingId] = useState<string | null>(null);
  const [cnabSelectedIds, setCnabSelectedIds] = useState<Set<string>>(() => new Set());
  const [cnabGenerating, setCnabGenerating] = useState(false);
  const [proofFileDraft, setProofFileDraft] = useState<File | null>(null);
  const [nfFileDraft, setNfFileDraft] = useState<File | null>(null);
  const [installmentProofFileDraft, setInstallmentProofFileDraft] = useState<File | null>(null);
  const [boletoParcelModalOrder, setBoletoParcelModalOrder] = useState<PurchaseOrder | null>(null);
  const [finalizedPage, setFinalizedPage] = useState(1);
  const [finalizedDraft, setFinalizedDraft] = useState({
    q: '',
    orderDateFrom: '',
    orderDateTo: '',
    supplierId: '',
    costCenterId: ''
  });
  const [finalizedApplied, setFinalizedApplied] = useState({
    q: '',
    orderDateFrom: '',
    orderDateTo: '',
    supplierId: '',
    costCenterId: ''
  });

  useEffect(() => {
    if (activeTab !== 'APPROVED') setCnabSelectedIds(new Set());
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'FINALIZADAS') {
      setFinalizedPage(1);
    }
  }, [activeTab]);

  useEffect(() => {
    setProofFileDraft(null);
    setNfFileDraft(null);
    setInstallmentProofFileDraft(null);
  }, [selectedOrder?.id]);

  const [editOcForm, setEditOcForm] = useState<{
    expectedDelivery: string; // input date: YYYY-MM-DD
    deliveryAddress: string;
    paymentType: string;
    paymentCondition: string;
    paymentDetails: string;
    freightAmount: string;
    notes: string;
    items: Array<{
      materialId: string;
      quantity: number;
      unit: string;
      unitPrice: number;
    }>;
  } | null>(null);

  const handleExportPdf = async (id: string) => {
    setPdfExportingId(id);
    try {
      await exportPurchaseOrderPdf(id);
      toast.success('PDF gerado com sucesso.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao gerar PDF';
      toast.error(msg);
    } finally {
      setPdfExportingId(null);
    }
  };

  const toDateInputValue = (d?: string | null) => {
    if (!d) return '';
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    return x.toISOString().slice(0, 10);
  };

  const parseMoneyInput = (value: string): number | null => {
    const cleaned = value.trim().replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
    if (!cleaned) return null;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['purchase-orders', 'list-full'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500 } });
      return res.data;
    }
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const nextStatus = nextApprovalStatus(currentStatus);
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: nextStatus });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setSelectedOrder(null);
      if (variables.currentStatus === 'PENDING_DIRETORIA') {
        toast.success('OC aprovada pela diretoria.');
      } else if (variables.currentStatus === 'PENDING') {
        toast.success('OC enviada para aprovação da diretoria.');
      } else {
        toast.success('OC aprovada pelo compras e enviada para aprovação do gestor.');
      }
    },
    onError: (error: { response?: { data?: { message?: string } } }) =>
      toast.error(error.response?.data?.message || 'Erro ao aprovar')
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, {
        status: 'REJECTED',
        rejectionReason: reason
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setRejectTarget(null);
      setRejectReason('');
      setSelectedOrder(null);
      toast.success('Ordem de compra reprovada.');
    },
    onError: (error: { response?: { data?: { message?: string } } }) =>
      toast.error(error.response?.data?.message || 'Erro ao reprovar')
  });

  const correctionOcMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: 'IN_REVIEW' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setCorrectionTarget(null);
      setSelectedOrder(null);
      toast.success('OC enviada para CORREÇÃO OC.');
    },
    onError: (error: { response?: { data?: { message?: string } } }) =>
      toast.error(error.response?.data?.message || 'Erro ao enviar para correção')
  });

  const resubmitOcMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: 'PENDING_COMPRAS' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setSelectedOrder(null);
      toast.success('OC reenviada para aprovação.');
    },
    onError: (error: { response?: { data?: { message?: string } } }) =>
      toast.error(error.response?.data?.message || 'Erro ao reenviar')
  });

  const updateOcDetailsMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await api.patch(`/purchase-orders/${id}/details`, payload);
      return res.data;
    },
    onSuccess: (resp: any) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      const updatedOrder = resp?.data;
      if (updatedOrder) setSelectedOrder(updatedOrder);
      setShowEditOcModal(false);
      toast.success('OC atualizada com sucesso.');
    },
    onError: (error: { response?: { data?: { message?: string } } }) =>
      toast.error(error.response?.data?.message || 'Erro ao atualizar OC')
  });

  const attachPaymentBoletoMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append('boleto', file);
      const up = await api.post('/purchase-orders/upload-boleto', fd);
      const url = up.data?.data?.url as string | undefined;
      const originalName = up.data?.data?.originalName as string | undefined;
      if (!url) throw new Error('Resposta inválida do upload');
      const res = await api.patch(`/purchase-orders/${id}/payment-boleto`, {
        paymentBoletoUrl: url,
        paymentBoletoName: originalName
      });
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      const updated = resp?.data;
      if (updated) setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
      toast.success('Boleto de pagamento anexado.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao anexar boleto')
  });

  const attachPaymentProofMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append('proof', file);
      const up = await api.post('/purchase-orders/upload-payment-proof', fd);
      const url = up.data?.data?.url as string | undefined;
      const originalName = up.data?.data?.originalName as string | undefined;
      if (!url) throw new Error('Resposta inválida do upload');
      const res = await api.patch(`/purchase-orders/${id}/payment-proof`, {
        paymentProofUrl: url,
        paymentProofName: originalName
      });
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      const updated = resp?.data;
      if (updated) {
        setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
      }
      setProofFileDraft(null);
      toast.success('Comprovante de pagamento anexado.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao anexar comprovante')
  });

  const reopenPaymentBoletoMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/reopen-payment-boleto`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setSelectedOrder(null);
      toast.success('A OC voltou para a fase Anexar Boleto.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao reabrir fase de boleto')
  });

  const releasePaymentBoletoPhaseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/release-payment-boleto-phase`);
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      const updated = resp?.data;
      if (updated) setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
      toast.success('OC enviada para a fase Pagamento.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao confirmar fase Pagamento')
  });

  const attachBoletoInstallmentProofMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append('proof', file);
      const up = await api.post('/purchase-orders/upload-payment-proof', fd);
      const url = up.data?.data?.url as string | undefined;
      const originalName = up.data?.data?.originalName as string | undefined;
      if (!url) throw new Error('Resposta inválida do upload');
      const res = await api.patch(`/purchase-orders/${id}/payment-boleto-installment-proof`, {
        paymentProofUrl: url,
        paymentProofName: originalName
      });
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      const updated = resp?.data;
      if (updated) setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
      setInstallmentProofFileDraft(null);
      toast.success('Comprovante desta parcela anexado.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao anexar comprovante da parcela')
  });

  const returnAfterBoletoInstallmentPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/return-after-boleto-installment-paid`);
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      const updated = resp?.data;
      if (updated) setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
      toast.success('Próxima parcela liberada para o comprador anexar o boleto.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao registrar pagamento da parcela')
  });

  const submitProofValidationMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, {
        status: 'PENDING_PROOF_VALIDATION'
      });
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      const updated = resp?.data;
      if (updated) setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
      toast.success('OC enviada para Validação Comprovante.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao enviar para validação')
  });

  const requestProofCorrectionMutation = useMutation({
    mutationFn: async ({ id, rejectionReason }: { id: string; rejectionReason?: string }) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, {
        status: 'PENDING_PROOF_CORRECTION',
        rejectionReason: rejectionReason?.trim() || undefined
      });
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      const updated = resp?.data;
      if (updated) setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
      toast.success('OC enviada para correção do comprovante.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao solicitar correção')
  });

  const validateProofMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: 'PENDING_NF_ATTACHMENT' });
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      const updated = resp?.data;
      if (updated) setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
      toast.success('Comprovante validado. O comprador pode anexar a(s) nota(s) fiscal(is).');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao validar comprovante')
  });

  const appendNfMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      const up = await api.post('/purchase-orders/upload-nf', fd);
      const url = up.data?.data?.url as string | undefined;
      const originalName = up.data?.data?.originalName as string | undefined;
      if (!url) throw new Error('Resposta inválida do upload');
      const res = await api.patch(`/purchase-orders/${id}/nf-attachments`, {
        nfUrl: url,
        nfName: originalName
      });
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      const updated = resp?.data;
      if (updated) setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
      setNfFileDraft(null);
      toast.success('Nota fiscal anexada.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao anexar NF')
  });

  const removeNfMutation = useMutation({
    mutationFn: async ({ id, index }: { id: string; index: number }) => {
      const res = await api.patch(`/purchase-orders/${id}/nf-attachments/remove`, { index });
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      const updated = resp?.data;
      if (updated) setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
      toast.success('Nota fiscal removida.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao remover NF')
  });

  const completeOcToFinalizedMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: 'FINALIZED' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setSelectedOrder(null);
      toast.success('OC finalizada. Ela aparece na aba Finalizadas.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao finalizar OC')
  });

  const allOrders: PurchaseOrder[] = ordersData?.data || [];

  const tabCounts = useMemo(() => {
    const compras = allOrders.filter((o) => o.status === 'PENDING_COMPRAS' || o.status === 'DRAFT').length;
    const gestor = allOrders.filter((o) => o.status === 'PENDING').length;
    const diretoria = allOrders.filter((o) => o.status === 'PENDING_DIRETORIA').length;
    const emCorrecao = allOrders.filter((o) => o.status === 'IN_REVIEW').length;
    const attachBoleto = allOrders.filter((o) => orderNeedsPaymentBoleto(o)).length;
    const aprovadas = allOrders.filter(
      (o) => o.status === 'APPROVED' && !orderNeedsPaymentBoleto(o)
    ).length;
    const proofValidation = allOrders.filter((o) => o.status === 'PENDING_PROOF_VALIDATION').length;
    const proofCorrection = allOrders.filter((o) => o.status === 'PENDING_PROOF_CORRECTION').length;
    const attachNf = allOrders.filter((o) => o.status === 'PENDING_NF_ATTACHMENT').length;
    const outras = allOrders.filter(
      (o) =>
        ![
          'PENDING_COMPRAS',
          'PENDING',
          'DRAFT',
          'PENDING_DIRETORIA',
          'IN_REVIEW',
          'APPROVED',
          'PENDING_PROOF_VALIDATION',
          'PENDING_PROOF_CORRECTION',
          'PENDING_NF_ATTACHMENT',
          'FINALIZED',
          'SENT'
        ].includes(o.status)
    ).length;
    return {
      compras,
      gestor,
      diretoria,
      IN_REVIEW: emCorrecao,
      ATTACH_BOLETO: attachBoleto,
      APPROVED: aprovadas,
      PROOF_VALIDATION: proofValidation,
      PROOF_CORRECTION: proofCorrection,
      ATTACH_NF: attachNf,
      outras
    };
  }, [allOrders]);

  const { data: paymentConditionRows } = useQuery({
    queryKey: ['payment-conditions', 'all-labels'],
    queryFn: async () => {
      const res = await api.get('/payment-conditions', { params: { activeOnly: 'false' } });
      return res.data?.data || [];
    }
  });

  const paymentConditionLabelMap = useMemo(
    () => buildPaymentConditionLabelMap(paymentConditionRows, OC_PAYMENT_CONDITION_LABELS),
    [paymentConditionRows]
  );

  const orders = useMemo(() => {
    if (activeTab === 'compras') {
      return allOrders.filter((o) => o.status === 'PENDING_COMPRAS' || o.status === 'DRAFT');
    }
    if (activeTab === 'gestor') {
      return allOrders.filter((o) => o.status === 'PENDING');
    }
    if (activeTab === 'diretoria') {
      return allOrders.filter((o) => o.status === 'PENDING_DIRETORIA');
    }
    if (activeTab === 'IN_REVIEW') {
      return allOrders.filter((o) => o.status === 'IN_REVIEW');
    }
    if (activeTab === 'APPROVED') {
      return allOrders.filter((o) => o.status === 'APPROVED' && !orderNeedsPaymentBoleto(o));
    }
    if (activeTab === 'ATTACH_BOLETO') {
      return allOrders.filter((o) => orderNeedsPaymentBoleto(o));
    }
    if (activeTab === 'PROOF_VALIDATION') {
      return allOrders.filter((o) => o.status === 'PENDING_PROOF_VALIDATION');
    }
    if (activeTab === 'PROOF_CORRECTION') {
      return allOrders.filter((o) => o.status === 'PENDING_PROOF_CORRECTION');
    }
    if (activeTab === 'ATTACH_NF') {
      return allOrders.filter((o) => o.status === 'PENDING_NF_ATTACHMENT');
    }
    if (activeTab === 'outras') {
      return allOrders.filter(
        (o) =>
          ![
            'PENDING_COMPRAS',
            'PENDING',
            'DRAFT',
            'PENDING_DIRETORIA',
            'IN_REVIEW',
            'APPROVED',
            'PENDING_PROOF_VALIDATION',
            'PENDING_PROOF_CORRECTION',
            'PENDING_NF_ATTACHMENT',
            'FINALIZED',
            'SENT'
          ].includes(o.status)
      );
    }
    return allOrders;
  }, [allOrders, activeTab]);

  const { data: finalizedTotal = 0 } = useQuery({
    queryKey: ['purchase-orders', 'finalized-total'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', {
        params: { status: 'FINALIZED,SENT', page: 1, limit: 1 }
      });
      return Number(res.data?.pagination?.total ?? 0);
    },
    staleTime: 30_000
  });

  const { data: finalizedListResponse, isFetching: finalizedListFetching } = useQuery({
    queryKey: ['purchase-orders', 'finalized-list', finalizedPage, finalizedApplied],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', {
        params: {
          status: 'FINALIZED,SENT',
          page: finalizedPage,
          limit: 25,
          q: finalizedApplied.q.trim() || undefined,
          orderDateFrom: finalizedApplied.orderDateFrom || undefined,
          orderDateTo: finalizedApplied.orderDateTo || undefined,
          supplierId: finalizedApplied.supplierId || undefined,
          costCenterId: finalizedApplied.costCenterId || undefined
        }
      });
      return res.data;
    },
    enabled: activeTab === 'FINALIZADAS',
    placeholderData: (previousData) => previousData
  });

  const { data: suppliersForFilter = [] } = useQuery({
    queryKey: ['suppliers', 'oc-finalizadas-filter'],
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { limit: 500 } });
      return res.data?.data || [];
    },
    enabled: activeTab === 'FINALIZADAS'
  });

  const { data: costCentersResponse } = useQuery({
    queryKey: ['cost-centers', 'oc-finalizadas-filter'],
    queryFn: async () => {
      const res = await api.get('/cost-centers', { params: { page: 1, limit: 2000 } });
      return res.data;
    },
    enabled: activeTab === 'FINALIZADAS'
  });

  const costCentersForFilter = useMemo(() => {
    const list = normalizeCostCentersResponse(costCentersResponse);
    return [...list].sort((a, b) => {
      const ca = (a.code || a.name || '').toString();
      const cb = (b.code || b.name || '').toString();
      return ca.localeCompare(cb, 'pt-BR', { numeric: true });
    });
  }, [costCentersResponse]);

  const finalizedOrders: PurchaseOrder[] = finalizedListResponse?.data ?? [];
  const finalizedPagination = finalizedListResponse?.pagination as
    | { page: number; limit: number; total: number; totalPages: number }
    | undefined;

  const displayedOrders = activeTab === 'FINALIZADAS' ? finalizedOrders : orders;

  const currentUserId = userData?.data?.id as string | undefined;
  const userEmployee = userData?.data?.employee as
    | { department?: string | null; position?: string | null }
    | undefined;
  const isFinanceOrAdminUser =
    userEmployee?.position?.trim() === 'Administrador' ||
    (userEmployee?.department?.toLowerCase().includes('financeiro') ?? false);

  const formatDate = (d?: string) => (d ? new Date(d).toLocaleDateString('pt-BR') : '-');
  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  /** Ex.: R$100,00 (sem espaço após R$), conforme detalhes da OC */
  const formatBrlCompact = (v: number) =>
    `R$${new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(v)}`;
  const totalOrder = (items: { totalPrice: number }[]) =>
    items.reduce((s, i) => s + Number(i.totalPrice), 0);

  const handleExportFinalizedCsv = async () => {
    try {
      const res = await api.get('/purchase-orders/export-finalized-csv', {
        params: {
          q: finalizedApplied.q.trim() || undefined,
          orderDateFrom: finalizedApplied.orderDateFrom || undefined,
          orderDateTo: finalizedApplied.orderDateTo || undefined,
          supplierId: finalizedApplied.supplierId || undefined,
          costCenterId: finalizedApplied.costCenterId || undefined
        },
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ocs-finalizadas-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Relatório exportado (CSV).');
    } catch {
      toast.error('Não foi possível exportar o relatório.');
    }
  };

  const materialLineLabel = (
    m?:
      | PurchaseOrder['items'][number]['material']
      | {
          name?: string | null;
          description?: string | null;
          sinapiCode?: string | null;
        }
  ) => {
    if (!m) return '—';
    const d = m.description?.trim();
    const n = m.name?.trim();
    if (d) return d;
    if (n) return n;
    if (m.sinapiCode) return m.sinapiCode;
    return '—';
  };

  const openOrderDetail = async (o: PurchaseOrder) => {
    setOrderDetailLoadingId(o.id);
    try {
      const res = await api.get(`/purchase-orders/${o.id}`);
      const order = res.data?.data as PurchaseOrder | undefined;
      if (!order) {
        toast.error('Não foi possível carregar a OC.');
        return;
      }
      setSelectedOrder(order);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Erro ao carregar detalhes da OC.');
    } finally {
      setOrderDetailLoadingId(null);
    }
  };

  const toggleCnabSelection = (id: string) => {
    setCnabSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerateCnabOc = async () => {
    const ids = Array.from(cnabSelectedIds);
    if (ids.length === 0) {
      toast.error('Selecione ao menos uma OC.');
      return;
    }
    setCnabGenerating(true);
    try {
      const res = await api.post('/purchase-orders/cnab400', { orderIds: ids }, { responseType: 'blob' });
      const rawSkipped = res.headers['x-skipped-order-numbers'];
      if (rawSkipped) {
        try {
          const arr = JSON.parse(decodeURIComponent(rawSkipped)) as string[];
          if (Array.isArray(arr) && arr.length > 0) {
            toast.error(
              `Fora da remessa (cadastre banco, agência e conta no fornecedor): ${arr.join(', ')}`
            );
          }
        } catch {
          /* ignore */
        }
      }
      const blob = new Blob([res.data], { type: 'text/plain; charset=ISO-8859-1' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CNAB400-OC-${new Date().toISOString().slice(0, 10)}.REM`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Arquivo CNAB400 gerado (padrão Financeiro / Itaú).');
    } catch (e: unknown) {
      const err = e as { response?: { data?: Blob } };
      const data = err.response?.data;
      if (data instanceof Blob) {
        const text = await data.text();
        try {
          const j = JSON.parse(text) as { message?: string };
          toast.error(j.message || 'Erro ao gerar CNAB400');
        } catch {
          toast.error(text.slice(0, 200) || 'Erro ao gerar CNAB400');
        }
      } else {
        toast.error('Erro ao gerar CNAB400');
      }
    } finally {
      setCnabGenerating(false);
    }
  };

  const handleOpenEditOc = () => {
    if (!selectedOrder) return;
    if (selectedOrder.status !== 'IN_REVIEW') return;
    if (!selectedOrder.creator?.id || selectedOrder.creator.id !== currentUserId) return;

    const items = (selectedOrder.items || []).map((it) => ({
      materialId: it.material?.id || '',
      quantity: Number(it.quantity),
      unit: it.unit || 'UN',
      unitPrice: Number(it.unitPrice)
    }));

    // Segurança: o backend precisa de materialId e unit
    const invalid = items.some((it) => !it.materialId || !it.unit);
    if (invalid) {
      toast.error('Não foi possível carregar os itens da OC para edição.');
      return;
    }

    const itemsSub = totalOrder(selectedOrder.items);
    const freightStored =
      selectedOrder.freightAmount != null && selectedOrder.freightAmount !== ''
        ? Number(selectedOrder.freightAmount)
        : Math.max(0, Number(selectedOrder.amountToPay ?? 0) - itemsSub);

    setEditOcForm({
      expectedDelivery: toDateInputValue(selectedOrder.expectedDelivery),
      deliveryAddress: selectedOrder.deliveryAddress || '',
      paymentType: selectedOrder.paymentType || 'AVISTA',
      paymentCondition: selectedOrder.paymentCondition || 'AVISTA',
      paymentDetails: selectedOrder.paymentDetails || '',
      freightAmount: Number.isFinite(freightStored) ? String(freightStored) : '0',
      notes: selectedOrder.notes || '',
      items
    });
    setShowEditOcModal(true);
  };

  const handleSaveEditOc = () => {
    if (!selectedOrder || !editOcForm) return;
    const freightParsed = parseMoneyInput(editOcForm.freightAmount);
    const freightAmount = freightParsed != null && freightParsed >= 0 ? freightParsed : 0;

    const payload = {
      expectedDelivery: editOcForm.expectedDelivery ? new Date(editOcForm.expectedDelivery).toISOString() : null,
      deliveryAddress: editOcForm.deliveryAddress.trim() || null,
      paymentType: editOcForm.paymentType,
      paymentCondition: editOcForm.paymentCondition,
      paymentDetails: editOcForm.paymentDetails.trim() || null,
      freightAmount,
      notes: editOcForm.notes.trim() || null,
      items: editOcForm.items.map((it) => ({
        materialId: it.materialId,
        quantity: Number(it.quantity),
        unit: it.unit,
        unitPrice: Number(it.unitPrice)
      }))
    };

    updateOcDetailsMutation.mutate({
      id: selectedOrder.id,
      payload
    });
  };

  const listLoading =
    activeTab === 'FINALIZADAS'
      ? finalizedListFetching && !finalizedListResponse
      : isLoading;

  return (
    <>
      <section id="fluxo-oc" className="scroll-mt-4">
        <Card>
          <CardHeader
            className={
              hideTabs
                ? 'border-b border-gray-200 dark:border-gray-700'
                : 'border-b-0'
            }
          >
            <div className="flex items-center">
              <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="ml-3 sm:ml-4 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {embedded ? 'Ordens de compra (OC)' : 'Ordens de Compra'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {activeTab === 'FINALIZADAS' ? (
                    <>
                      {finalizedPagination?.total ?? displayedOrders.length}{' '}
                      {(finalizedPagination?.total ?? displayedOrders.length) === 1 ? 'ordem' : 'ordens'} no total
                      {finalizedPagination && finalizedPagination.totalPages > 1
                        ? ` · página ${finalizedPagination.page} de ${finalizedPagination.totalPages}`
                        : ''}
                    </>
                  ) : (
                    <>
                      {orders.length} {orders.length === 1 ? 'ordem' : 'ordens'} encontrada(s)
                    </>
                  )}
                  {embedded && (
                    <span className="block sm:inline sm:ml-1 text-xs text-gray-500 dark:text-gray-500 mt-1 sm:mt-0">
                      {activeTab === 'ATTACH_BOLETO'
                        ? 'OC aprovada em boleto: anexe o boleto para pagamento (financeiro).'
                        : activeTab === 'APPROVED'
                          ? 'Pagamento: anexe o comprovante, gere CNAB se precisar e envie para Validação Comprovante.'
                          : activeTab === 'PROOF_VALIDATION'
                            ? 'OCs com comprovante enviado — aguardando validação.'
                            : activeTab === 'PROOF_CORRECTION'
                              ? 'Financeiro deve substituir o comprovante e reenviar para validação.'
                              : activeTab === 'ATTACH_NF'
                              ? 'Após o comprovante validado: anexe uma ou mais notas fiscais e conclua o envio.'
                              : activeTab === 'FINALIZADAS'
                                ? 'OCs que concluíram o fluxo (NF anexada). Use filtros e exporte relatório em CSV.'
                                : 'Após a SC aprovada: criar OC → aprovação Compras → Gestor → Diretoria.'}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </CardHeader>
          {!hideTabs && (
            <div className="border-b border-gray-200 dark:border-gray-700 px-4">
              <nav className="-mb-px flex flex-wrap gap-1 sm:gap-2 overflow-x-auto py-2">
                {(
                  [
                    { id: 'compras' as const, label: 'OC - Aprovação Compras', count: tabCounts.compras },
                    { id: 'gestor' as const, label: 'OC - Aprovação Gestor', count: tabCounts.gestor },
                    { id: 'diretoria' as const, label: 'OC - Aprovação Diretoria', count: tabCounts.diretoria },
                    { id: 'IN_REVIEW' as const, label: 'Correção OC', count: tabCounts.IN_REVIEW },
                    {
                      id: 'ATTACH_BOLETO' as const,
                      label: 'Anexar Boleto',
                      count: tabCounts.ATTACH_BOLETO
                    },
                    { id: 'APPROVED' as const, label: 'Pagamento', count: tabCounts.APPROVED },
                    {
                      id: 'PROOF_VALIDATION' as const,
                      label: 'Validação Comprovante',
                      count: tabCounts.PROOF_VALIDATION
                    },
                    {
                      id: 'PROOF_CORRECTION' as const,
                      label: 'Correção Comprovante',
                      count: tabCounts.PROOF_CORRECTION
                    },
                    { id: 'ATTACH_NF' as const, label: 'Anexar NF', count: tabCounts.ATTACH_NF },
                    { id: 'FINALIZADAS' as const, label: 'Finalizadas', count: finalizedTotal },
                    { id: 'outras' as const, label: 'Demais status', count: tabCounts.outras }
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap rounded-t-lg transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        activeTab === tab.id
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </nav>
            </div>
          )}
          <CardContent className="p-0">
            {listLoading ? (
              <div className="px-6 py-12 text-center">
                <Loading message="Carregando ordens..." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                {activeTab === 'FINALIZADAS' && (
                  <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/30 space-y-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[180px] flex-1">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Busca (nº OC, fornecedor, SC)
                        </label>
                        <input
                          type="text"
                          value={finalizedDraft.q}
                          onChange={(e) => setFinalizedDraft((d) => ({ ...d, q: e.target.value }))}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          placeholder="Ex.: OC-2026 ou nome do fornecedor"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Data OC (de)
                        </label>
                        <input
                          type="date"
                          value={finalizedDraft.orderDateFrom}
                          onChange={(e) => setFinalizedDraft((d) => ({ ...d, orderDateFrom: e.target.value }))}
                          className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Data OC (até)
                        </label>
                        <input
                          type="date"
                          value={finalizedDraft.orderDateTo}
                          onChange={(e) => setFinalizedDraft((d) => ({ ...d, orderDateTo: e.target.value }))}
                          className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div className="min-w-[200px]">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Fornecedor
                        </label>
                        <select
                          value={finalizedDraft.supplierId}
                          onChange={(e) => setFinalizedDraft((d) => ({ ...d, supplierId: e.target.value }))}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        >
                          <option value="">Todos</option>
                          {(suppliersForFilter as Array<{ id: string; name: string }>).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-[220px]">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Centro de custo
                        </label>
                        <select
                          value={finalizedDraft.costCenterId}
                          onChange={(e) => setFinalizedDraft((d) => ({ ...d, costCenterId: e.target.value }))}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        >
                          <option value="">Todos</option>
                          {costCentersForFilter
                            .filter((cc): cc is typeof cc & { id: string } => Boolean(cc.id))
                            .map((cc) => (
                              <option key={cc.id} value={cc.id}>
                                {[cc.code, cc.name].filter(Boolean).join(' — ') || cc.id}
                              </option>
                            ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFinalizedApplied({ ...finalizedDraft });
                          setFinalizedPage(1);
                        }}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Aplicar filtros
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const empty = {
                            q: '',
                            orderDateFrom: '',
                            orderDateTo: '',
                            supplierId: '',
                            costCenterId: ''
                          };
                          setFinalizedDraft(empty);
                          setFinalizedApplied(empty);
                          setFinalizedPage(1);
                        }}
                        className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Limpar
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleExportFinalizedCsv()}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <Download className="w-4 h-4 shrink-0" />
                        Exportar Relatório (CSV)
                      </button>
                      <p className="text-xs text-gray-500 dark:text-gray-400 self-center">
                        O arquivo usa os mesmos filtros acima (até 25 mil linhas).
                      </p>
                    </div>
                  </div>
                )}
                {activeTab === 'APPROVED' && orders.length > 0 && (
                  <div className="px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3 bg-gray-50/80 dark:bg-gray-900/30">
                    <p className="text-xs text-gray-600 dark:text-gray-400 max-w-2xl">
                      Remessa CNAB400 (Itaú), mesmo layout do módulo Financeiro. O fornecedor precisa ter{' '}
                      <strong>banco</strong>, <strong>agência</strong> e <strong>conta</strong> no cadastro.
                    </p>
                    <button
                      type="button"
                      onClick={handleGenerateCnabOc}
                      disabled={cnabGenerating || cnabSelectedIds.size === 0}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white disabled:opacity-50 transition-colors shrink-0"
                    >
                      {cnabGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Gerando…
                        </>
                      ) : (
                        <>
                          <FileText className="w-4 h-4" />
                          CNAB400
                        </>
                      )}
                    </button>
                  </div>
                )}
                <table className="w-full">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      {activeTab === 'APPROVED' && (
                        <th className="w-12 px-2 sm:px-3 py-4 text-center">
                          <input
                            type="checkbox"
                            title="Selecionar todas"
                            aria-label="Selecionar todas as OCs"
                            checked={orders.length > 0 && orders.every((x) => cnabSelectedIds.has(x.id))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCnabSelectedIds(new Set(orders.map((x) => x.id)));
                              } else {
                                setCnabSelectedIds(new Set());
                              }
                            }}
                            className="rounded border-gray-300 dark:border-gray-600"
                          />
                        </th>
                      )}
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Nº OC
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Fornecedor
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        SC
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Data
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Valor Total
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      {activeTab === 'ATTACH_BOLETO' && (
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[200px]">
                          Boleto (pagamento)
                        </th>
                      )}
                      {(activeTab === 'APPROVED' ||
                        activeTab === 'PROOF_VALIDATION' ||
                        activeTab === 'PROOF_CORRECTION' ||
                        activeTab === 'ATTACH_NF' ||
                        activeTab === 'FINALIZADAS') && (
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[140px]">
                          NF / Boleto / Comprovante
                        </th>
                      )}
                      <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {displayedOrders.map((o: PurchaseOrder) => (
                      <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        {activeTab === 'APPROVED' && (
                          <td className="px-2 sm:px-3 py-4 text-center align-middle">
                            <input
                              type="checkbox"
                              checked={cnabSelectedIds.has(o.id)}
                              onChange={() => toggleCnabSelection(o.id)}
                              aria-label={`Selecionar ${o.orderNumber}`}
                              className="rounded border-gray-300 dark:border-gray-600"
                            />
                          </td>
                        )}
                        <td className="px-3 sm:px-6 py-4 text-sm font-mono font-medium text-gray-900 dark:text-gray-100">
                          {o.orderNumber}
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {o.supplier?.name || '-'}
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {o.materialRequest?.requestNumber || '-'}
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {formatDate(o.orderDate)}
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-sm text-right text-gray-900 dark:text-gray-100">
                          {formatCurrency(orderGrandTotal(o))}
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-center">
                          <span
                            className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                              STATUS_COLORS[o.status] ||
                              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {purchaseOrderPhaseLabel(o.status)}
                          </span>
                        </td>
                        {activeTab === 'ATTACH_BOLETO' && (
                          <td className="px-3 sm:px-6 py-4 align-middle">
                            <div className="flex flex-col gap-2 max-w-[260px]">
                              {(o.paymentParcelCount ?? 1) > 1 ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setBoletoParcelModalOrder(o)}
                                    className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 shadow-sm"
                                  >
                                    <Banknote className="w-3.5 h-3.5 shrink-0" />
                                    Parcelas ({o.paymentParcelCount})
                                  </button>
                                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                    Valor, vencimento e boleto por parcela
                                  </span>
                                </>
                              ) : (
                                <>
                                  <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 font-medium shrink-0">
                                      <Banknote className="w-3.5 h-3.5" />
                                      Escolher arquivo
                                    </span>
                                    <input
                                      type="file"
                                      accept=".pdf,image/*"
                                      className="hidden"
                                      disabled={
                                        attachPaymentBoletoMutation.isPending &&
                                        attachPaymentBoletoMutation.variables?.id === o.id
                                      }
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        e.target.value = '';
                                        if (!file) return;
                                        attachPaymentBoletoMutation.mutate({ id: o.id, file });
                                      }}
                                    />
                                  </label>
                                  {attachPaymentBoletoMutation.isPending &&
                                  attachPaymentBoletoMutation.variables?.id === o.id ? (
                                    <span className="text-xs text-gray-500 flex items-center gap-1">
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      Enviando...
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                      PDF ou imagem (até 15 MB)
                                    </span>
                                  )}
                                </>
                              )}
                              {canSendCurrentBoletoToPayment(o) && o.paymentBoletoPhaseReleased !== true && (
                                <button
                                  type="button"
                                  disabled={
                                    releasePaymentBoletoPhaseMutation.isPending &&
                                    releasePaymentBoletoPhaseMutation.variables === o.id
                                  }
                                  onClick={() => releasePaymentBoletoPhaseMutation.mutate(o.id)}
                                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                                >
                                  <Send className="w-3.5 h-3.5 shrink-0" />
                                  Enviar p/ fase Pagamento
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                        {(activeTab === 'APPROVED' ||
                          activeTab === 'PROOF_VALIDATION' ||
                          activeTab === 'PROOF_CORRECTION' ||
                          activeTab === 'ATTACH_NF' ||
                          activeTab === 'FINALIZADAS') && (
                          <td className="px-3 sm:px-6 py-4 align-top">
                            <div className="flex flex-col gap-2 text-xs max-w-[200px]">
                              <div>
                                <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 block mb-0.5">
                                  NF (criação)
                                </span>
                                {o.boletoAttachmentUrl ? (
                                  <a
                                    href={absoluteUploadUrl(o.boletoAttachmentUrl || '')}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                  >
                                    <FileText className="w-3.5 h-3.5 shrink-0" />
                                    {o.boletoAttachmentName?.trim() || 'Abrir arquivo'}
                                  </a>
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-500">Não anexada</span>
                                )}
                              </div>
                              <div>
                                <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 block mb-0.5">
                                  Boleto
                                </span>
                                {(o.paymentParcelCount ?? 1) > 1 ? (
                                  (() => {
                                    const inst = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
                                    const n = o.paymentParcelCount ?? 1;
                                    return (
                                      <div className="flex flex-col gap-1">
                                        {Array.from({ length: n }, (_, idx) => {
                                          const row = inst[idx];
                                          const st = rowStatus(row);
                                          return (
                                            <div key={idx} className="text-[11px] leading-tight text-gray-700 dark:text-gray-300">
                                              <span className="text-gray-500 dark:text-gray-400">{romanParcelLabel(idx)}:</span>{' '}
                                              {st === 'PAID' ? (
                                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                                  {installmentStatusLabel(st)}
                                                </span>
                                              ) : st === 'AWAITING_PAYMENT' ? (
                                                <span className="text-amber-700 dark:text-amber-300 font-medium">
                                                  {installmentStatusLabel(st)}
                                                </span>
                                              ) : (row?.boletoUrl || '').trim() ? (
                                                <a
                                                  href={absoluteUploadUrl(row.boletoUrl || '')}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                                >
                                                  <Banknote className="w-3.5 h-3.5 shrink-0" />
                                                  {row.boletoName?.trim() || 'Abrir'}
                                                </a>
                                              ) : (
                                                <span className="text-gray-400 dark:text-gray-500">—</span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()
                                ) : o.paymentBoletoUrl ? (
                                  <a
                                    href={absoluteUploadUrl(o.paymentBoletoUrl || '')}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                  >
                                    <Banknote className="w-3.5 h-3.5 shrink-0" />
                                    {o.paymentBoletoName?.trim() || 'Abrir boleto'}
                                  </a>
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-500">Não anexado</span>
                                )}
                              </div>
                              <div>
                                <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 block mb-0.5">
                                  Comprovante
                                </span>
                                {o.paymentProofUrl ? (
                                  <a
                                    href={absoluteUploadUrl(o.paymentProofUrl || '')}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                  >
                                    <Receipt className="w-3.5 h-3.5 shrink-0" />
                                    {o.paymentProofName?.trim() || 'Abrir comprovante'}
                                  </a>
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-500">Não anexado</span>
                                )}
                              </div>
                              {parseOcNfAttachments(o.nfAttachments).length > 0 && (
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 block mb-0.5">
                                    NF (pós-comprovante)
                                  </span>
                                  <div className="flex flex-col gap-1">
                                    {parseOcNfAttachments(o.nfAttachments).map((nf, idx) => (
                                      <a
                                        key={`${nf.url}-${idx}`}
                                        href={absoluteUploadUrl(nf.url)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                      >
                                        <FileText className="w-3.5 h-3.5 shrink-0" />
                                        {nf.name?.trim() || `NF ${idx + 1}`}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="px-3 sm:px-6 py-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1 flex-wrap">
                            {o.status === 'PENDING_PROOF_VALIDATION' && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      'Confirmar validação do comprovante e liberar a fase Anexar NF para o comprador?'
                                    )
                                  ) {
                                    return;
                                  }
                                  validateProofMutation.mutate(o.id);
                                }}
                                disabled={validateProofMutation.isPending}
                                className="p-2 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-colors inline-flex disabled:opacity-50"
                                title="Validar comprovante — liberar anexo de NF"
                              >
                                {validateProofMutation.isPending ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4" />
                                )}
                              </button>
                            )}
                            {['DRAFT', 'PENDING_COMPRAS', 'PENDING', 'PENDING_DIRETORIA'].includes(o.status) && (
                              <button
                                type="button"
                                onClick={() => approveMutation.mutate({ id: o.id, currentStatus: o.status })}
                                className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors inline-flex"
                                title={approvalLabel(o.status)}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {['DRAFT', 'PENDING_COMPRAS', 'PENDING', 'PENDING_DIRETORIA'].includes(o.status) && (
                              <button
                                type="button"
                                onClick={() => setCorrectionTarget(o)}
                                className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors inline-flex"
                                title="Enviar para CORREÇÃO OC"
                              >
                                <Wrench className="w-4 h-4" />
                              </button>
                            )}
                            {['DRAFT', 'PENDING_COMPRAS', 'PENDING', 'PENDING_DIRETORIA'].includes(o.status) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectTarget(o);
                                  setRejectReason('');
                                }}
                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors inline-flex"
                                title="Reprovar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                            {o.status === 'IN_REVIEW' &&
                              o.creator?.id &&
                              currentUserId === o.creator.id && (
                                <button
                                  type="button"
                                  onClick={() => resubmitOcMutation.mutate(o.id)}
                                  disabled={resubmitOcMutation.isPending}
                                  className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors inline-flex disabled:opacity-50"
                                  title="Reenviar para aprovação"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                              )}
                            <button
                              type="button"
                              onClick={() => handleExportPdf(o.id)}
                              disabled={pdfExportingId === o.id}
                              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors inline-flex disabled:opacity-50"
                              title="Baixar OC (PDF)"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openOrderDetail(o)}
                              disabled={orderDetailLoadingId === o.id}
                              className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors inline-flex disabled:opacity-50"
                              title="Ver detalhes"
                            >
                              {orderDetailLoadingId === o.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {activeTab === 'FINALIZADAS' &&
                  finalizedPagination &&
                  finalizedPagination.totalPages > 0 &&
                  displayedOrders.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Página {finalizedPagination.page} de {finalizedPagination.totalPages}
                        {' · '}
                        {finalizedPagination.total}{' '}
                        {finalizedPagination.total === 1 ? 'ordem' : 'ordens'} no total
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={finalizedPage <= 1 || finalizedListFetching}
                          onClick={() => setFinalizedPage((p) => Math.max(1, p - 1))}
                          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          disabled={
                            finalizedPage >= finalizedPagination.totalPages || finalizedListFetching
                          }
                          onClick={() => setFinalizedPage((p) => p + 1)}
                          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          Próxima
                        </button>
                      </div>
                    </div>
                  )}
                {((activeTab === 'FINALIZADAS' && displayedOrders.length === 0 && !listLoading) ||
                  (activeTab !== 'FINALIZADAS' && orders.length === 0 && !isLoading)) && (
                  <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400 text-sm">
                    {activeTab === 'FINALIZADAS' ? (
                      <>
                        Nenhuma OC finalizada com os filtros atuais. Ajuste a busca, as datas, o fornecedor ou o
                        centro de custo, ou limpe os filtros.
                      </>
                    ) : activeTab === 'ATTACH_BOLETO' ? (
                      <>
                        Nenhuma OC em boleto aguardando anexo neste momento. A lista inclui apenas OCs{' '}
                        <strong>aprovadas</strong>, com pagamento <strong>boleto</strong>, sem todos os boletos de
                        pagamento registrados (uma ou mais parcelas, conforme a condição de pagamento).
                      </>
                    ) : activeTab === 'PROOF_VALIDATION' ? (
                      <>Nenhuma OC aguardando validação do comprovante.</>
                    ) : activeTab === 'PROOF_CORRECTION' ? (
                      <>Nenhuma OC em correção do comprovante.</>
                    ) : activeTab === 'ATTACH_NF' ? (
                      <>Nenhuma OC na fase Anexar NF. Valide o comprovante na aba anterior para liberar esta etapa.</>
                    ) : (
                      <>
                        Nenhuma ordem de compra encontrada. Crie uma OC a partir de uma SC aprovada (botão
                        &quot;Criar OC&quot; na requisição aprovada acima).
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {rejectTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setRejectTarget(null); setRejectReason(''); }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Reprovar OC</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{rejectTarget.orderNumber}</p>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo *</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-4"
              placeholder="Informe o motivo da reprovação..."
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                onClick={() => rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason.trim() })}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Reprovando...' : 'Confirmar reprovação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {correctionTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCorrectionTarget(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Enviar para CORREÇÃO OC</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Quem criou a OC poderá ajustar e reenviá-la para aprovação. {correctionTarget.orderNumber}
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setCorrectionTarget(null)} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg">
                Cancelar
              </button>
              <button
                type="button"
                disabled={correctionOcMutation.isPending}
                onClick={() => correctionOcMutation.mutate(correctionTarget.id)}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {correctionOcMutation.isPending ? 'Enviando...' : 'Enviar para correção'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditOcModal && selectedOrder && editOcForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowEditOcModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Editar OC (CORREÇÃO OC)</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {selectedOrder.orderNumber} — somente o criador pode editar antes de reenviar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditOcModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de entrega prevista</label>
                  <input
                    type="date"
                    value={editOcForm.expectedDelivery}
                    onChange={(e) =>
                      setEditOcForm((prev) => (prev ? { ...prev, expectedDelivery: e.target.value } : prev))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Endereço de entrega</label>
                  <input
                    type="text"
                    value={editOcForm.deliveryAddress}
                    onChange={(e) =>
                      setEditOcForm((prev) => (prev ? { ...prev, deliveryAddress: e.target.value } : prev))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    placeholder="Ex: Rua..., Cidade/UF"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de pagamento</label>
                  <select
                    value={editOcForm.paymentType}
                    onChange={(e) => {
                      const nextPaymentType = e.target.value;
                      const defaultCond =
                        nextPaymentType === 'AVISTA' ? 'AVISTA' : 'BOLETO_30';
                      setEditOcForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              paymentType: nextPaymentType,
                              paymentCondition: defaultCond
                            }
                          : prev
                      );
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="AVISTA">{OC_PAYMENT_TYPE_LABELS.AVISTA}</option>
                    <option value="BOLETO">{OC_PAYMENT_TYPE_LABELS.BOLETO}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Condição</label>
                  <PaymentConditionSelect
                    paymentType={editOcForm.paymentType === 'AVISTA' ? 'AVISTA' : 'BOLETO'}
                    value={editOcForm.paymentCondition}
                    onChange={(code) =>
                      setEditOcForm((prev) => (prev ? { ...prev, paymentCondition: code } : prev))
                    }
                    disabled={editOcForm.paymentType === 'AVISTA'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor frete</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editOcForm.freightAmount}
                    onChange={(e) =>
                      setEditOcForm((prev) => (prev ? { ...prev, freightAmount: e.target.value } : prev))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    placeholder="Ex: 150,00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
                <p className="text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Valor itens (calculado):</span>{' '}
                  {formatBrlCompact(
                    editOcForm.items.reduce((s, it) => s + Number(it.quantity) * Number(it.unitPrice), 0)
                  )}
                </p>
                <p className="text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Total a pagar (calculado):</span>{' '}
                  {formatBrlCompact(
                    editOcForm.items.reduce((s, it) => s + Number(it.quantity) * Number(it.unitPrice), 0) +
                      (parseMoneyInput(editOcForm.freightAmount) ?? 0)
                  )}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dados do pagamento</label>
                <input
                  type="text"
                  value={editOcForm.paymentDetails}
                  onChange={(e) =>
                    setEditOcForm((prev) => (prev ? { ...prev, paymentDetails: e.target.value } : prev))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Dados bancários / referência"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observações</label>
                <textarea
                  value={editOcForm.notes}
                  onChange={(e) =>
                    setEditOcForm((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Informações adicionais"
                />
              </div>

              <div className="pt-2">
                <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Materiais (OC)</p>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr className="text-left">
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300">Material</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Qtd</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-center whitespace-nowrap">Un.</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Unitário</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                      {editOcForm.items.map((it, idx) => {
                        const material = selectedOrder.items?.[idx]?.material;
                        const label = materialLineLabel(material);
                        const lineTotal = Number(it.quantity) * Number(it.unitPrice);
                        return (
                          <tr key={`${it.materialId}-${idx}`} className="text-gray-600 dark:text-gray-400">
                            <td className="p-2 align-top max-w-[240px] sm:max-w-none">{label}</td>
                            <td className="p-2 text-right whitespace-nowrap align-top">
                              <input
                                type="number"
                                step="0.01"
                                value={it.quantity}
                                onChange={(e) => {
                                  const nextQty = Number(e.target.value);
                                  setEditOcForm((prev) => {
                                    if (!prev) return prev;
                                    const nextItems = prev.items.map((x, i) =>
                                      i === idx ? { ...x, quantity: Number.isFinite(nextQty) ? nextQty : 0 } : x
                                    );
                                    return { ...prev, items: nextItems };
                                  });
                                }}
                                className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                              />
                            </td>
                            <td className="p-2 text-center whitespace-nowrap align-top">{it.unit}</td>
                            <td className="p-2 text-right whitespace-nowrap align-top">
                              <input
                                type="number"
                                step="0.01"
                                value={it.unitPrice}
                                onChange={(e) => {
                                  const nextPrice = Number(e.target.value);
                                  setEditOcForm((prev) => {
                                    if (!prev) return prev;
                                    const nextItems = prev.items.map((x, i) =>
                                      i === idx ? { ...x, unitPrice: Number.isFinite(nextPrice) ? nextPrice : 0 } : x
                                    );
                                    return { ...prev, items: nextItems };
                                  });
                                }}
                                className="w-28 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                              />
                            </td>
                            <td className="p-2 text-right whitespace-nowrap align-top font-medium text-gray-900 dark:text-gray-100">
                              {formatCurrency(Number.isFinite(lineTotal) ? lineTotal : 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowEditOcModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={updateOcDetailsMutation.isPending}
                onClick={handleSaveEditOc}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {updateOcDetailsMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedOrder(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start gap-2 mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedOrder.orderNumber}</h2>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleExportPdf(selectedOrder.id)}
                  disabled={pdfExportingId === selectedOrder.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {pdfExportingId === selectedOrder.id ? 'Gerando…' : 'PDF'}
                </button>
                <button type="button" onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-medium text-gray-700 dark:text-gray-300">Fornecedor:</span>{' '}
                <span className="text-gray-600 dark:text-gray-400">{selectedOrder.supplier?.name}</span>
              </p>
              <p>
                <span className="font-medium text-gray-700 dark:text-gray-300">SC:</span>{' '}
                <span className="text-gray-600 dark:text-gray-400">{selectedOrder.materialRequest?.requestNumber || '-'}</span>
              </p>
              <p>
                <span className="font-medium text-gray-700 dark:text-gray-300">Centro de custo:</span>{' '}
                <span className="text-gray-600 dark:text-gray-400">
                  {(() => {
                    const cc = selectedOrder.materialRequest?.costCenter;
                    if (!cc) return '—';
                    const parts = [cc.code, cc.name]
                      .map((x) => (x != null ? String(x).trim() : ''))
                      .filter((s) => s.length > 0);
                    return parts.length ? parts.join(' — ') : '—';
                  })()}
                </span>
              </p>
              <p>
                <span className="font-medium text-gray-700 dark:text-gray-300">Ordem de serviço:</span>{' '}
                <span className="text-gray-600 dark:text-gray-400">{selectedOrder.materialRequest?.serviceOrder?.trim() || '—'}</span>
              </p>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Descrição da solicitação:</span>
                <p className="mt-1 text-gray-600 dark:text-gray-400 whitespace-pre-wrap rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 px-3 py-2 min-h-[2.5rem]">
                  {selectedOrder.materialRequest?.description?.trim() || '—'}
                </p>
              </div>
              <p>
                <span className="font-medium text-gray-700 dark:text-gray-300">Data:</span>{' '}
                <span className="text-gray-600 dark:text-gray-400">{formatDate(selectedOrder.orderDate)}</span>
              </p>
              <p>
                <span className="font-medium text-gray-700 dark:text-gray-300">Status:</span>{' '}
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[selectedOrder.status] || ''}`}>
                  {purchaseOrderPhaseLabel(selectedOrder.status)}
                </span>
              </p>
              {selectedOrder.paymentType && (
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Tipo de pagamento:</span>{' '}
                  <span className="text-gray-600 dark:text-gray-400">
                    {OC_PAYMENT_TYPE_LABELS[selectedOrder.paymentType] || selectedOrder.paymentType}
                  </span>
                </p>
              )}
              {selectedOrder.paymentCondition && (
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Condição:</span>{' '}
                  <span className="text-gray-600 dark:text-gray-400">
                    {paymentConditionLabelMap[selectedOrder.paymentCondition] || selectedOrder.paymentCondition}
                  </span>
                </p>
              )}
              {[
                'APPROVED',
                'PENDING_PROOF_VALIDATION',
                'PENDING_PROOF_CORRECTION',
                'PENDING_NF_ATTACHMENT',
                'SENT',
                'FINALIZED',
                'PARTIALLY_RECEIVED',
                'RECEIVED'
              ].includes(selectedOrder.status) && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 px-3 py-2 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                    Registro financeiro
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">Valor Itens:</span>{' '}
                    {formatBrlCompact(totalOrder(selectedOrder.items))}
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">Valor Frete:</span>{' '}
                    {formatBrlCompact(orderFreightValue(selectedOrder))}
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">Total a Pagar:</span>{' '}
                    {formatBrlCompact(orderGrandTotal(selectedOrder))}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Boletos, comprovantes (incluindo por parcela) e notas fiscais anexadas ficam listados em
                    Documentos abaixo e permanecem vinculados a esta OC.
                  </p>
                </div>
              )}
              {[
                'APPROVED',
                'PENDING_PROOF_VALIDATION',
                'PENDING_PROOF_CORRECTION',
                'PENDING_NF_ATTACHMENT',
                'SENT',
                'FINALIZED',
                'PARTIALLY_RECEIVED',
                'RECEIVED'
              ].includes(selectedOrder.status) ? (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Dados de pagamento</span>
                  <p className="mt-1 text-gray-600 dark:text-gray-400 whitespace-pre-wrap rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 px-3 py-2 min-h-[2.5rem]">
                    {selectedOrder.paymentDetails?.trim() || '—'}
                  </p>
                </div>
              ) : (
                selectedOrder.paymentDetails?.trim() && (
                  <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Dados de pagamento:</span>{' '}
                    {selectedOrder.paymentDetails}
                  </p>
                )
              )}
              {selectedOrder.status === 'PENDING_PROOF_VALIDATION' && (
                <div className="rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-950/25 px-3 py-3 space-y-2">
                  <p className="text-xs font-semibold text-violet-900 dark:text-violet-200 uppercase tracking-wide">
                    Validação do comprovante
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Confirme que o comprovante de pagamento está correto para liberar o comprador a anexar uma ou mais
                    notas fiscais. Se estiver incorreto, solicite correção: o financeiro substitui o arquivo e reenvia
                    para validação.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={validateProofMutation.isPending || requestProofCorrectionMutation.isPending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            'Confirmar validação do comprovante e liberar a fase Anexar NF para o comprador?'
                          )
                        ) {
                          return;
                        }
                        validateProofMutation.mutate(selectedOrder.id);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      {validateProofMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          Salvando…
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 shrink-0" />
                          Validar comprovante — liberar Anexar NF
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={validateProofMutation.isPending || requestProofCorrectionMutation.isPending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            'Enviar esta OC para correção do comprovante? O financeiro poderá anexar um novo arquivo e reenviar para validação.'
                          )
                        ) {
                          return;
                        }
                        const rejectionReason = window.prompt('Motivo (opcional):') ?? '';
                        requestProofCorrectionMutation.mutate({
                          id: selectedOrder.id,
                          rejectionReason: rejectionReason.trim() || undefined
                        });
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-amber-500/80 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50"
                    >
                      {requestProofCorrectionMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          Salvando…
                        </>
                      ) : (
                        <>
                          <Wrench className="w-4 h-4 shrink-0" />
                          Solicitar correção do comprovante
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
              {selectedOrder.status === 'PENDING_NF_ATTACHMENT' && (
                <div className="rounded-lg border border-teal-200 dark:border-teal-900/50 bg-teal-50/50 dark:bg-teal-950/25 px-3 py-3 space-y-3">
                  <p className="text-xs font-semibold text-teal-900 dark:text-teal-200 uppercase tracking-wide">
                    Anexar nota(s) fiscal(is)
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Anexe quantas NFs forem necessárias (PDF ou imagem). Depois conclua para marcar a OC como enviada
                    ao fornecedor.
                  </p>
                  {parseOcNfAttachments(selectedOrder.nfAttachments).length > 0 ? (
                    <ul className="space-y-1.5 text-sm">
                      {parseOcNfAttachments(selectedOrder.nfAttachments).map((nf, idx) => (
                        <li
                          key={`${nf.url}-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-teal-100 dark:border-teal-900/40 bg-white/60 dark:bg-gray-900/30 px-2 py-1.5"
                        >
                          <a
                            href={absoluteUploadUrl(nf.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            {nf.name || `NF ${idx + 1}`}
                          </a>
                          {selectedOrder.creator?.id === currentUserId && (
                            <button
                              type="button"
                              disabled={removeNfMutation.isPending}
                              onClick={() => removeNfMutation.mutate({ id: selectedOrder.id, index: idx })}
                              className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                            >
                              Remover
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400">Nenhuma NF anexada ainda.</p>
                  )}
                  {selectedOrder.creator?.id === currentUserId ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => setNfFileDraft(e.target.files?.[0] ?? null)}
                        className="block w-full text-xs text-gray-600 dark:text-gray-400 file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-teal-100 file:text-teal-900 dark:file:bg-teal-900/40 dark:file:text-teal-100"
                      />
                      <button
                        type="button"
                        disabled={!nfFileDraft || appendNfMutation.isPending}
                        onClick={() => {
                          if (!nfFileDraft) return;
                          appendNfMutation.mutate({ id: selectedOrder.id, file: nfFileDraft });
                        }}
                        className="shrink-0 px-3 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        {appendNfMutation.isPending ? 'Enviando…' : 'Anexar NF'}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Somente quem criou a OC pode anexar ou remover NFs nesta fase.
                    </p>
                  )}
                  {selectedOrder.creator?.id === currentUserId && (
                    <button
                      type="button"
                      disabled={
                        completeOcToFinalizedMutation.isPending ||
                        parseOcNfAttachments(selectedOrder.nfAttachments).length === 0
                      }
                      onClick={() => {
                        if (
                          !window.confirm(
                            'Finalizar esta OC? Ela irá para a fase Finalizadas. Confirme se todas as NFs necessárias foram anexadas.'
                          )
                        ) {
                          return;
                        }
                        completeOcToFinalizedMutation.mutate(selectedOrder.id);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {completeOcToFinalizedMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          Concluindo…
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 shrink-0" />
                          Concluir OC
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
              {selectedOrder.status === 'APPROVED' &&
                selectedOrder.paymentType === 'BOLETO' &&
                orderNeedsPaymentBoleto(selectedOrder) && (
                  <div className="rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-950/25 px-3 py-3 space-y-2">
                    <p className="text-xs font-semibold text-violet-900 dark:text-violet-200 uppercase tracking-wide">
                      Anexar boleto (pagamento)
                    </p>
                    {!canSendCurrentBoletoToPayment(selectedOrder) ? (
                      <>
                        {(selectedOrder.paymentParcelCount ?? 1) > 1 ? (
                          <>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              Esta OC tem {selectedOrder.paymentParcelCount} parcelas. Informe valor, vencimento e
                              arquivo por parcela.
                            </p>
                            <button
                              type="button"
                              onClick={() => setBoletoParcelModalOrder(selectedOrder)}
                              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700"
                            >
                              <Banknote className="w-4 h-4 shrink-0" />
                              Abrir parcelas ({selectedOrder.paymentParcelCount})
                            </button>
                          </>
                        ) : (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                              <span className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 font-medium">
                                <Banknote className="w-3.5 h-3.5" />
                                Escolher arquivo
                              </span>
                              <input
                                type="file"
                                accept=".pdf,image/*"
                                className="hidden"
                                disabled={
                                  attachPaymentBoletoMutation.isPending &&
                                  attachPaymentBoletoMutation.variables?.id === selectedOrder.id
                                }
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!file || !selectedOrder) return;
                                  attachPaymentBoletoMutation.mutate({ id: selectedOrder.id, file });
                                }}
                              />
                            </label>
                            {attachPaymentBoletoMutation.isPending &&
                            attachPaymentBoletoMutation.variables?.id === selectedOrder.id ? (
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Enviando...
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                PDF ou imagem (até 15 MB)
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Boletos anexados. Para liberar a fase Pagamento (comprovante, CNAB etc.), confirme o envio
                          abaixo.
                        </p>
                        <button
                          type="button"
                          disabled={
                            releasePaymentBoletoPhaseMutation.isPending ||
                            !selectedOrder
                          }
                          onClick={() => {
                            if (!selectedOrder) return;
                            releasePaymentBoletoPhaseMutation.mutate(selectedOrder.id);
                          }}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Send className="w-4 h-4 shrink-0" />
                          Enviar para fase Pagamento
                        </button>
                      </>
                    )}
                  </div>
                )}
              <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-2 space-y-2">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                  Documentos (fases anteriores)
                </p>
                <p className="text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">NF anexada na criação da OC:</span>{' '}
                  {selectedOrder.boletoAttachmentUrl ? (
                    <a
                      href={absoluteUploadUrl(selectedOrder.boletoAttachmentUrl || '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {selectedOrder.boletoAttachmentName || 'Abrir arquivo'}
                    </a>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400">Não anexada</span>
                  )}
                </p>
                <div className="text-sm space-y-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Boleto (anexo na fase &quot;Anexar Boleto&quot;):
                  </span>
                  {(selectedOrder.paymentParcelCount ?? 1) > 1 ? (
                    (() => {
                      const inst = parsePaymentBoletoInstallments(selectedOrder.paymentBoletoInstallments);
                      const n = selectedOrder.paymentParcelCount ?? 1;
                      return (
                        <div className="flex flex-col gap-2 mt-1">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Histórico por parcela: boleto enviado pelo comprador e comprovante anexado pelo financeiro
                            (quando houver).
                          </p>
                          {Array.from({ length: n }, (_, idx) => {
                            const row = inst[idx];
                            const st = rowStatus(row);
                            const boletoHref = (row?.boletoUrl || '').trim();
                            const proofHref = (row?.installmentProofUrl || '').trim();
                            const statusClass =
                              st === 'PAID'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : st === 'AWAITING_PAYMENT'
                                  ? 'text-amber-700 dark:text-amber-300'
                                  : 'text-gray-600 dark:text-gray-400';
                            return (
                              <div
                                key={idx}
                                className="rounded-md border border-gray-200/80 dark:border-gray-600/80 bg-white/40 dark:bg-gray-950/30 px-2.5 py-2 space-y-1.5"
                              >
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                  <span className="font-medium text-gray-800 dark:text-gray-200">
                                    Parcela {romanParcelLabel(idx)}
                                  </span>
                                  <span className={`text-xs font-medium ${statusClass}`}>
                                    {installmentStatusLabel(st)}
                                  </span>
                                </div>
                                <div className="text-xs sm:text-sm space-y-1 pl-0.5">
                                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                    <span className="text-gray-500 dark:text-gray-400 shrink-0">Boleto:</span>
                                    {boletoHref ? (
                                      <a
                                        href={absoluteUploadUrl(boletoHref)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                                      >
                                        <Banknote className="w-3.5 h-3.5 shrink-0" />
                                        {row?.boletoName?.trim() || 'Abrir boleto'}
                                      </a>
                                    ) : (
                                      <span className="text-gray-400 dark:text-gray-500">Não anexado</span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                    <span className="text-gray-500 dark:text-gray-400 shrink-0">Comprovante:</span>
                                    {proofHref ? (
                                      <a
                                        href={absoluteUploadUrl(proofHref)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                                      >
                                        <Receipt className="w-3.5 h-3.5 shrink-0" />
                                        {row?.installmentProofName?.trim() || 'Abrir comprovante'}
                                      </a>
                                    ) : (
                                      <span className="text-gray-400 dark:text-gray-500">—</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()
                  ) : selectedOrder.paymentBoletoUrl ? (
                    <a
                      href={absoluteUploadUrl(selectedOrder.paymentBoletoUrl || '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      {selectedOrder.paymentBoletoName || 'Abrir boleto'}
                    </a>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400">Não anexado</span>
                  )}
                </div>
                {selectedOrder.status === 'APPROVED' &&
                  selectedOrder.paymentType === 'BOLETO' &&
                  selectedOrder.paymentBoletoPhaseReleased &&
                  hasAnyPaymentBoletoAttachment(selectedOrder) && (
                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        disabled={reopenPaymentBoletoMutation.isPending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              'Remover todos os boletos de pagamento e voltar a OC para a fase Anexar Boleto?'
                            )
                          ) {
                            return;
                          }
                          reopenPaymentBoletoMutation.mutate(selectedOrder.id);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-normal rounded border border-gray-300/80 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-amber-800 dark:hover:text-amber-200 hover:border-amber-400/60 dark:hover:border-amber-700/60 bg-transparent hover:bg-amber-50/30 dark:hover:bg-amber-950/20 disabled:opacity-50"
                        title="Volta a OC para anexar boletos novamente (ação administrativa)"
                      >
                        <Undo2 className="w-3 h-3 shrink-0 opacity-70" />
                        Reabrir fase Anexar boleto
                      </button>
                    </div>
                  )}
                {(selectedOrder.paymentProofUrl || '').trim() ? (
                  <p className="text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Comprovante de pagamento (fase Pagamento):
                    </span>{' '}
                    <a
                      href={absoluteUploadUrl(selectedOrder.paymentProofUrl || '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      {selectedOrder.paymentProofName || 'Abrir comprovante'}
                    </a>
                  </p>
                ) : null}
                {parseOcNfAttachments(selectedOrder.nfAttachments).length > 0 && (
                  <div className="text-sm space-y-1.5 pt-2 border-t border-gray-200 dark:border-gray-600 mt-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Notas fiscais (após validação do comprovante):
                    </span>
                    <ul className="list-none space-y-1 pl-0">
                      {parseOcNfAttachments(selectedOrder.nfAttachments).map((nf, idx) => (
                        <li key={`${nf.url}-${idx}`}>
                          <a
                            href={absoluteUploadUrl(nf.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            {nf.name || `NF ${idx + 1}`}
                          </a>
                          {nf.uploadedAt ? (
                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                              ({new Date(nf.uploadedAt).toLocaleString('pt-BR')})
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {selectedOrder.status === 'APPROVED' &&
                selectedOrder.paymentType === 'BOLETO' &&
                selectedOrder.paymentBoletoPhaseReleased &&
                hasAwaitingInstallmentPayment(selectedOrder) && (
                  <div className="rounded-lg border border-sky-200 dark:border-sky-900/50 bg-sky-50/60 dark:bg-sky-950/25 px-3 py-3 space-y-2">
                    <p className="text-xs font-semibold text-sky-900 dark:text-sky-200 uppercase tracking-wide">
                      Pagamento de parcela (financeiro)
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      O comprador enviou o boleto desta parcela. Após efetivar o pagamento, anexe o comprovante do
                      pagamento desta parcela; só então libere a anexação da próxima (se houver).
                    </p>
                    {(() => {
                      const awRow = parsePaymentBoletoInstallments(selectedOrder.paymentBoletoInstallments).find(
                        (r) => rowStatus(r) === 'AWAITING_PAYMENT'
                      );
                      const proofUrl = (awRow?.installmentProofUrl || '').trim();
                      const proofName = (awRow?.installmentProofName || '').trim();
                      return proofUrl ? (
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          Comprovante desta parcela:{' '}
                          <a
                            href={absoluteUploadUrl(proofUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            {proofName || 'Abrir'}
                          </a>
                        </p>
                      ) : (
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Anexe o comprovante do pagamento desta parcela (PDF ou imagem).
                        </p>
                      );
                    })()}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => setInstallmentProofFileDraft(e.target.files?.[0] ?? null)}
                        className="block w-full text-xs text-gray-600 dark:text-gray-400 file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-sky-100 file:text-sky-900 dark:file:bg-sky-900/40 dark:file:text-sky-100"
                      />
                      <button
                        type="button"
                        disabled={
                          !installmentProofFileDraft ||
                          attachBoletoInstallmentProofMutation.isPending ||
                          !selectedOrder
                        }
                        onClick={() => {
                          if (!selectedOrder || !installmentProofFileDraft) return;
                          attachBoletoInstallmentProofMutation.mutate({
                            id: selectedOrder.id,
                            file: installmentProofFileDraft
                          });
                        }}
                        className="shrink-0 px-3 py-2 text-sm font-medium rounded-lg bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50"
                      >
                        {attachBoletoInstallmentProofMutation.isPending
                          ? 'Enviando…'
                          : 'Anexar / substituir comprovante da parcela'}
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={
                        returnAfterBoletoInstallmentPaidMutation.isPending ||
                        !awaitingBoletoInstallmentHasProof(selectedOrder)
                      }
                      onClick={() => {
                        if (
                          !window.confirm(
                            'Confirmar que esta parcela foi paga e liberar o comprador para anexar o boleto da próxima?'
                          )
                        ) {
                          return;
                        }
                        returnAfterBoletoInstallmentPaidMutation.mutate(selectedOrder.id);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {returnAfterBoletoInstallmentPaidMutation.isPending ? 'Salvando…' : 'Parcela paga — liberar próxima anexação'}
                    </button>
                  </div>
                )}
              {((selectedOrder.status === 'APPROVED' &&
                !orderNeedsPaymentBoleto(selectedOrder) &&
                canAttachComprovanteForBoletoOrder(selectedOrder)) ||
                selectedOrder.status === 'PENDING_PROOF_CORRECTION') && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/25 px-3 py-3 space-y-3">
                  <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 uppercase tracking-wide">
                    {selectedOrder.status === 'PENDING_PROOF_CORRECTION'
                      ? 'Correção do comprovante'
                      : 'Comprovante de pagamento (fase Pagamento)'}
                  </p>
                  {selectedOrder.status === 'PENDING_PROOF_CORRECTION' && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      O comprovante precisa ser ajustado. Substitua o arquivo abaixo (se necessário) e reenvie para a
                      validação.
                    </p>
                  )}
                  {selectedOrder.paymentProofUrl?.trim() ? (
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Arquivo atual:{' '}
                      <a
                        href={absoluteUploadUrl(selectedOrder.paymentProofUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        {selectedOrder.paymentProofName || 'Abrir'}
                      </a>
                    </p>
                  ) : (() => {
                      const fromLast = lastPaidInstallmentProofUrl(selectedOrder);
                      return fromLast ? (
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          Comprovante da última parcela (será usado no envio à validação):{' '}
                          <a
                            href={absoluteUploadUrl(fromLast.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            {fromLast.name || 'Abrir'}
                          </a>
                          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Não é obrigatório anexar de novo aqui se o financeiro já anexou o comprovante ao pagar a
                            última parcela.
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Anexe o comprovante (PDF ou imagem) antes de enviar para validação.
                        </p>
                      );
                    })()}
                  {selectedOrder.status === 'PENDING_PROOF_CORRECTION' && !isFinanceOrAdminUser ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Apenas o financeiro pode substituir o comprovante e reenviar para validação.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          onChange={(e) => setProofFileDraft(e.target.files?.[0] ?? null)}
                          className="block w-full text-xs text-gray-600 dark:text-gray-400 file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-emerald-100 file:text-emerald-900 dark:file:bg-emerald-900/40 dark:file:text-emerald-100"
                        />
                        <button
                          type="button"
                          disabled={
                            !proofFileDraft ||
                            attachPaymentProofMutation.isPending ||
                            !selectedOrder
                          }
                          onClick={() => {
                            if (!selectedOrder || !proofFileDraft) return;
                            attachPaymentProofMutation.mutate({ id: selectedOrder.id, file: proofFileDraft });
                          }}
                          className="shrink-0 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {attachPaymentProofMutation.isPending ? 'Enviando…' : 'Anexar / substituir comprovante'}
                        </button>
                      </div>
                      <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={
                            submitProofValidationMutation.isPending ||
                            !canSubmitBoletoToProofValidation(selectedOrder) ||
                            !canAttachComprovanteForBoletoOrder(selectedOrder)
                          }
                          onClick={() => submitProofValidationMutation.mutate(selectedOrder.id)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          {submitProofValidationMutation.isPending
                            ? 'Enviando…'
                            : selectedOrder.status === 'PENDING_PROOF_CORRECTION'
                              ? 'Reenviar para validação do comprovante'
                              : 'Enviar para Validação Comprovante'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {selectedOrder.notes && (
                <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Observações:</span> {selectedOrder.notes}
                </p>
              )}

              <div className="pt-2">
                <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Materiais (OC)</p>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr className="text-left">
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300">Material</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Qtd</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-center whitespace-nowrap">Un.</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Unitário</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                      {selectedOrder.items?.map((line, idx) => (
                        <tr key={idx} className="text-gray-600 dark:text-gray-400">
                          <td className="p-2 align-top max-w-[200px] sm:max-w-none">{materialLineLabel(line.material)}</td>
                          <td className="p-2 text-right whitespace-nowrap align-top">{Number(line.quantity)}</td>
                          <td className="p-2 text-center whitespace-nowrap align-top">{line.unit || '—'}</td>
                          <td className="p-2 text-right whitespace-nowrap align-top">{formatCurrency(Number(line.unitPrice))}</td>
                          <td className="p-2 text-right whitespace-nowrap align-top font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(Number(line.totalPrice))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-600">
                      <tr>
                        <td colSpan={4} className="p-2 text-right font-medium text-gray-700 dark:text-gray-300">
                          Total dos itens
                        </td>
                        <td className="p-2 text-right font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {formatCurrency(totalOrder(selectedOrder.items))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="pt-2">
                <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Mapa de cotação vinculado</p>
                {(() => {
                  const quoteMap = selectedOrder.quoteMap || null;
                  if (!quoteMap) {
                    return (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Esta OC não possui mapa de cotação associado à SC.
                      </p>
                    );
                  }
                  const itemIds = new Set(
                    (selectedOrder.items || [])
                      .map((i) => i.materialRequestItemId)
                      .filter((x): x is string => !!x)
                  );
                  const winners = (quoteMap.winners || []).filter((w) =>
                    itemIds.size > 0 ? itemIds.has(w.materialRequestItemId) : true
                  );
                  return (
                    <div id="oc-quote-map" className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden scroll-mt-4">
                      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/40 text-xs text-gray-600 dark:text-gray-300">
                        Mapa: {quoteMap.id.slice(0, 8)} | Criado em {formatDate(quoteMap.createdAt)}
                      </div>
                      {winners.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
                          Não há vencedores do mapa vinculados aos itens desta OC.
                        </p>
                      ) : (
                        <table className="w-full text-xs sm:text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-700/30">
                            <tr className="text-left">
                              <th className="p-2 font-medium text-gray-700 dark:text-gray-300">Material</th>
                              <th className="p-2 font-medium text-gray-700 dark:text-gray-300">Fornecedor vencedor</th>
                              <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right">Preço unit.</th>
                              <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right">Score</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                            {winners.map((w) => (
                              <tr key={w.id} className="text-gray-600 dark:text-gray-400">
                                <td className="p-2">
                                  {materialLineLabel(w.materialRequestItem?.material) ||
                                    w.materialRequestItemId.slice(0, 8)}
                                </td>
                                <td className="p-2">{w.winnerSupplier?.name || '—'}</td>
                                <td className="p-2 text-right">{formatCurrency(Number(w.winnerUnitPrice || 0))}</td>
                                <td className="p-2 text-right">{formatCurrency(Number(w.winnerScore || 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedOrder.quoteMap && (
                <button
                  type="button"
                  onClick={async () => {
                    const mapId = selectedOrder.quoteMap?.id;
                    if (!mapId) return;
                    try {
                      const response = await api.get(`/quote-maps/${mapId}/snapshot-pdf`, {
                        responseType: 'blob'
                      });
                      const blobUrl = window.URL.createObjectURL(response.data);
                      window.open(blobUrl, '_blank', 'noopener,noreferrer');
                      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
                    } catch {
                      toast.error('Não foi possível abrir o snapshot do mapa de cotação.');
                    }
                  }}
                  className="flex-1 min-w-[160px] px-3 py-2 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700"
                >
                  Ver mapa de cotação
                </button>
              )}
              {['DRAFT', 'PENDING_COMPRAS', 'PENDING', 'PENDING_DIRETORIA'].includes(selectedOrder.status) && (
                <button
                  type="button"
                  onClick={() => approveMutation.mutate({ id: selectedOrder.id, currentStatus: selectedOrder.status })}
                  disabled={approveMutation.isPending}
                  className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4 shrink-0" />
                  {approvalLabel(selectedOrder.status)}
                </button>
              )}
              {['DRAFT', 'PENDING_COMPRAS', 'PENDING', 'PENDING_DIRETORIA'].includes(selectedOrder.status) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectTarget(selectedOrder);
                      setRejectReason('');
                    }}
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Reprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => setCorrectionTarget(selectedOrder)}
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                  >
                    Correção OC
                  </button>
                </>
              )}
              {selectedOrder.status === 'IN_REVIEW' && selectedOrder.creator?.id === currentUserId && (
                <>
                  <button
                    type="button"
                    onClick={handleOpenEditOc}
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700"
                  >
                    Editar OC
                  </button>
                  <button
                    type="button"
                    onClick={() => resubmitOcMutation.mutate(selectedOrder.id)}
                    disabled={resubmitOcMutation.isPending}
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Reenviar para aprovação
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="mt-4 w-full px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {boletoParcelModalOrder && (
        <BoletoParcelasModal
          key={boletoParcelModalOrder.id}
          order={boletoParcelModalOrder}
          onClose={() => setBoletoParcelModalOrder(null)}
          onSaved={(payload) => {
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            const updated = (payload as { data?: PurchaseOrder })?.data;
            if (updated) {
              setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
            }
          }}
        />
      )}
    </>
  );
}
