'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  FileText,
  FileUp,
  Eye,
  Check,
  CheckCircle,
  X,
  XCircle,
  Wrench,
  Send,
  Download,
  Loader2,
  Banknote,
  Pencil,
  Search,
  Filter,
  RotateCcw,
  MoreVertical,
  CircleDollarSign,
  Clock,
  LayoutList,
  Undo2,
} from 'lucide-react';
import { FinancialControlEntryModal } from '@/components/financeiro/FinancialControlEntryModal';
import { buildFormFromPurchaseOrder, hasFinancialEntryForOcInstallment } from '@/components/financeiro/financialControlEntry';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { AppModalTabButton } from '@/components/ui/AppTabButton';
import { DatePickerField } from '@/components/ui/DatePickerField';
import {
  getListTableRowClassName,
  listTableRowClasses,
  ListRowNavigableLabel,
  rowActionMenuButtonClass
} from '@/components/ui/listTableUi';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { buildOcPdfDownloadFileName, formatOcListDisplayId } from '@/components/oc/ocListDisplay';
import { formatRmListDisplayId } from '@/app/ponto/gerenciar-materiais/_lib/rmListDisplay';
import { stripOsSePrefix } from '@/lib/formatOsSePasta';
import { parseRmDemandSheetAttachments } from '@/lib/rmDemandSheetAttachments';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { normalizeCostCentersResponse } from '@/lib/costCenters';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import { parseLastOcCorrectionInfo } from '@/lib/ocCorrectionNotes';
import { exportPurchaseOrderPdf, type ExportPurchaseOrderPdfOptions } from '@/lib/exportPurchaseOrderPdf';
import {
  Z_ACTION_MENU,
} from '@/lib/zIndex';
import { PaymentConditionSelect, buildPaymentConditionLabelMap } from '@/components/oc/PaymentConditionSelect';
import {
  OcPurchaseOrderFormFields,
  buildOcFormValuesFromOrder,
  getOcSupplierLabel,
  type OcFormOrderSource,
  type OcPurchaseOrderFormValues,
  type OcSupplierOption
} from '@/components/oc/OcPurchaseOrderFormFields';
import { BoletoParcelasModal } from '@/components/oc/BoletoParcelasModal';
import { BoletoParcelasList } from '@/components/oc/BoletoParcelasList';
import { ymdAddDays } from '@/components/oc/boletoParcelasUtils';
import { canActOnOcApprovalStatus } from '@/lib/ocApprovalPermissions';
import { canReturnOcItemToRm } from '@/lib/rmProcurementCoverage';
import { isUnbRelatedLabel } from '@/lib/unbBranding';
import { usePermissions } from '@/hooks/usePermissions';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import {
  orderNeedsPaymentBoleto,
  showInAttachBoletoTab,
  canSendCurrentBoletoToPayment,
  canAttachComprovanteForBoletoOrder,
  canSubmitBoletoToProofValidation,
  canSubmitProofValidationWithFinancialEntry,
  lastPaidInstallmentProofUrl,
  hasAwaitingInstallmentPayment,
  awaitingBoletoInstallmentHasProof,
  showSequentialInstallmentProofSection,
  currentSequentialInstallmentHasProof,
  parsePaymentBoletoInstallments,
  romanParcelLabel,
  rowStatus,
  installmentStatusLabel,
  useParallelBoletoPaymentFlow,
  allInstallmentsHavePaymentProof,
  financeProofTargetInstallmentIndices,
  shouldShowOrderLevelPaymentProofInDocuments,
  isOcInFinancialLaunchPhase,
  effectivePaymentBoletoUrl,
  effectivePaymentBoletoName,
  visiblePaymentBoletoInstallmentIndex,
  listInstallmentIndex,
  listInstallmentRow,
  proofValidationInstallmentIndex,
  type OcListInstallmentMode,
  returnAfterBoletoInstallmentPaidButtonLabel,
  returnAfterBoletoInstallmentPaidConfirmMessage,
} from '@/components/oc/ocPaymentBoleto';
import {
  ocDeliveryStatusBadgeClass,
  type OcDeliveryStatusBadgeKey,
  purchaseOrderPhaseLabel,
} from '@/components/oc/ocStatusLabels';
import {
  APPROVAL_STATUS_COLUMN_TITLE,
  ApprovalStatusBadge,
  ocToApprovalStatus,
} from '@/app/ponto/aprovacoes/_components/ApprovalStatusBadge';
import { OcAttachmentActions } from '@/components/oc/OcAttachmentActions';
import { OcCommentsSection } from '@/components/oc/OcCommentsSection';
import { FinancialControlEntryFormModal } from '@/components/financeiro/FinancialControlEntryFormModal';
import {
  MONTHS_PT,
  formatCurrency as formatFinancialCurrency,
  type FinancialControlEntry,
} from '@/lib/financialControlEntry';
import { OcFluxTabsNav } from '@/components/oc/OcFluxTabsNav';
import { computeOcTabCounts } from '@/components/oc/ocTabCounts';
import { sortPurchaseOrdersByMostRecent } from '@/components/oc/ocPurchaseOrderListSort';
import { parseCurrencyInputBr } from '@/lib/maskCurrencyBr';
import { isOcBoletoPaymentType } from '@/components/oc/ocUploadBoleto';
import {
  getOcPaymentListStatus,
  ocPaymentListStatusClass,
  ocPaymentListStatusLabel,
} from '@/components/oc/ocPaymentListStatus';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  ApprovalPhaseStatCards,
  type ApprovalPhaseStatCard,
} from '@/app/ponto/aprovacoes/_components/ApprovalPhaseStatCards';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

const OC_APPROVAL_LIST_PHASE_OPTIONS = labeledToSelectOptions([
  { value: 'pending', label: 'Pendentes de aprovação' },
  { value: 'approved_by_me', label: 'Aprovadas por mim' },
  { value: 'rejected', label: 'Canceladas' },
  { value: 'all', label: 'Todos' },
]);

export {
  orderNeedsPaymentBoleto,
  canSendCurrentBoletoToPayment,
  canAttachComprovanteForBoletoOrder,
  canSubmitBoletoToProofValidation,
  canSubmitProofValidationWithFinancialEntry,
  getProofValidationSubmitBlockers,
  lastPaidInstallmentProofUrl,
  hasAwaitingInstallmentPayment,
  awaitingBoletoInstallmentHasProof,
  parsePaymentBoletoInstallments,
  hasAnyPaymentBoletoAttachment,
  rowStatus,
  installmentStatusLabel,
  useParallelBoletoPaymentFlow,
  allInstallmentsHavePaymentProof,
  financeProofTargetInstallmentIndices,
  shouldShowOrderLevelPaymentProofInDocuments
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
  pixKeyType?: string | null;
  pixKey?: string | null;
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
    pixKeyType?: string | null;
    pixKey?: string | null;
  };
  materialRequest?: {
    id?: string;
    requestNumber: string;
    serviceOrder?: string | null;
    description?: string | null;
    demandSheet?: string | null;
    demandSheetAttachmentUrl?: string | null;
    demandSheetAttachmentName?: string | null;
    demandSheetAttachments?: Array<{ url?: string; name?: string }> | null;
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
  comprasApprovedBy?: string | null;
  gestorApprovedBy?: string | null;
  approvedBy?: string | null;
  /** Ausente na listagem `summary=1`; preenchido no GET por id. */
  items?: Array<{
    id?: string;
    materialId?: string;
    materialRequestItemId?: string | null;
    materialRequestItem?: {
      quantity?: number | string | null;
      notes?: string | null;
      observation?: string | null;
    } | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    unit?: string;
    notes?: string | null;
    material?: {
      id: string;
      name?: string | null;
      description?: string | null;
      sinapiCode?: string | null;
    };
  }>;
  stockReceipt?: {
    hasReceipts: boolean;
    hasExits?: boolean;
    lines: Array<{
      materialLabel: string;
      ordered: number;
      received: number;
      gap: number;
      unit: string;
    }>;
    batches: Array<{
      createdAt: string;
      split: 'TOTAL' | 'PARCIAL' | '';
      userName: string;
      items: Array<{ materialName: string; quantity: number; unit: string }>;
    }>;
    exitBatches?: Array<{
      createdAt: string;
      split: 'TOTAL' | 'PARCIAL' | '';
      userName: string;
      items: Array<{ materialName: string; quantity: number; unit: string }>;
    }>;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface StockMovementForOcTag {
  id: string;
  type: 'IN' | 'OUT';
  notes?: string | null;
  createdAt: string;
}

type OcMovementTag = {
  label: string;
  badgeKey: OcDeliveryStatusBadgeKey;
  title?: string;
};

type OcMovementAttachmentTag = {
  key: string;
  label: string;
  colorClass: string;
  url?: string;
  /** Tooltip: na listagem o rótulo é curto; detalhes da OC trazem arquivo, valores e vencimentos. */
  titleHint?: string;
};

type StockMovementAttachmentItem = {
  name: string;
  url: string;
  amount?: string;
  dueDate?: string;
};

type StockMovementAttachmentBundle = {
  nf: StockMovementAttachmentItem | null;
  withdrawalSheet: StockMovementAttachmentItem | null;
  paymentSlips: StockMovementAttachmentItem[];
};

const OC_PAYMENT_TYPE_LABELS: Record<string, string> = {
  AVISTA: 'À vista',
  BOLETO: 'Boleto',
  CARTAO: 'Cartão',
};

function extractOcCorrectionBlocks(notes?: string | null): string {
  if (!notes?.trim()) return '';
  return notes
    .split(/\n\n+/)
    .filter((block) => /^\[Correção OC[^\]]*\]/.test(block.trim()))
    .join('\n\n')
    .trim();
}

function stripOcCorrectionBlocksFromNotes(notes?: string | null): string {
  if (!notes?.trim()) return '';
  return notes
    .split(/\n\n+/)
    .filter((block) => !/^\[Correção OC[^\]]*\]/.test(block.trim()))
    .join('\n\n')
    .trim();
}

function isEditOcAvistaPaymentIncomplete(
  paymentType: string,
  paymentDetails: string,
  pixKeyType: string,
  pixKey: string
): boolean {
  return (
    paymentType === 'AVISTA' &&
    (!paymentDetails.trim() || !pixKeyType.trim() || !pixKey.trim())
  );
}

const OC_PAYMENT_CONDITION_LABELS: Record<string, string> = {
  AVISTA: 'À vista',
  BOLETO_30: 'Boleto 30 dias',
  BOLETO_28: 'Boleto 28 dias'
};

function isOcUnbCostCenter(order: {
  materialRequest?: { costCenter?: { code?: string | null; name?: string | null } | null } | null;
}): boolean {
  const cc = order.materialRequest?.costCenter;
  return isUnbRelatedLabel(cc?.name) || isUnbRelatedLabel(cc?.code);
}

/** UNB: só gestor (PENDING → APPROVED). Demais: compras → gestor → diretoria. */
function nextApprovalStatus(currentStatus: string, unbOnlyGestor = false): string {
  if (unbOnlyGestor) {
    if (currentStatus === 'PENDING' || currentStatus === 'PENDING_DIRETORIA') return 'APPROVED';
    return 'PENDING';
  }
  if (currentStatus === 'PENDING_DIRETORIA') return 'APPROVED';
  if (currentStatus === 'PENDING') return 'PENDING_DIRETORIA';
  return 'PENDING';
}

function approvalLabel(currentStatus: string, unbOnlyGestor = false): string {
  if (unbOnlyGestor && currentStatus === 'PENDING') return 'Aprovar (Gestor)';
  if (currentStatus === 'PENDING_DIRETORIA') return 'Aprovar (Diretoria)';
  if (currentStatus === 'PENDING') return 'Aprovar (Gestor)';
  return 'Aprovar (Compras)';
}

type PurchaseOrdersListSummaryCache = {
  data?: PurchaseOrder[];
  pagination?: unknown;
  success?: boolean;
};

function patchOcInListSummaryCache(
  queryClient: QueryClient,
  id: string,
  patch: Partial<PurchaseOrder> | ((order: PurchaseOrder) => PurchaseOrder)
) {
  queryClient.setQueryData(
    ['purchase-orders', 'list-summary'],
    (old: PurchaseOrdersListSummaryCache | undefined) => {
      if (!old?.data || !Array.isArray(old.data)) return old;
      return {
        ...old,
        data: old.data.map((order) => {
          if (order.id !== id) return order;
          const next =
            typeof patch === 'function' ? patch(order) : { ...order, ...patch };
          // Sort da lista usa updatedAt; sem bump a OC entra na fase no meio e
          // só sobe depois do refetch (parece "pular" de posição).
          if (next.status !== order.status) {
            return { ...next, updatedAt: new Date().toISOString() };
          }
          return next;
        })
      };
    }
  );
}

/** OC e RM compartilham fase na UI — precisa atualizar as listas de RM também. */
function invalidateOcAndLinkedRmQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
  void queryClient.invalidateQueries({ queryKey: ['material-requests'], refetchType: 'all' });
  void queryClient.invalidateQueries({ queryKey: ['material-requests-manage'], refetchType: 'all' });
  void queryClient.invalidateQueries({ queryKey: ['material-request-detail'] });
  void queryClient.invalidateQueries({ queryKey: ['material-request'] });
  void queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
}

/** Só sobrescreve campos definidos — evita sumir comprovante/itens ao misturar resposta leve. */
function pickDefinedOcPatch(source: Partial<PurchaseOrder>): Partial<PurchaseOrder> {
  const out: Partial<PurchaseOrder> = {};
  (Object.keys(source) as (keyof PurchaseOrder)[]).forEach((key) => {
    const value = source[key];
    if (value !== undefined) {
      (out as Record<string, unknown>)[key as string] = value;
    }
  });
  return out;
}

function applyOcLocalPatch(
  queryClient: QueryClient,
  setSelectedOrder: React.Dispatch<React.SetStateAction<PurchaseOrder | null>>,
  id: string,
  patch: Partial<PurchaseOrder>
) {
  const safe = pickDefinedOcPatch({
    ...patch,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  });
  patchOcInListSummaryCache(queryClient, id, (order) => ({ ...order, ...safe }));
  queryClient.setQueryData(
    ['purchase-order-detail', id],
    (old: PurchaseOrder | undefined) => (old ? { ...old, ...safe } : old)
  );
  setSelectedOrder((prev) => (prev?.id === id ? { ...prev, ...safe } : prev));
}

function approvalOptimisticPatch(
  currentStatus: string,
  userId: string | undefined,
  unbOnlyGestor = false
): Partial<PurchaseOrder> {
  const nextStatus = nextApprovalStatus(currentStatus, unbOnlyGestor);
  const patch: Partial<PurchaseOrder> = { status: nextStatus };
  if (!userId) return patch;
  if (currentStatus === 'PENDING_COMPRAS' || currentStatus === 'DRAFT') {
    patch.comprasApprovedBy = userId;
  } else if (currentStatus === 'PENDING') {
    patch.gestorApprovedBy = userId;
    if (unbOnlyGestor) patch.approvedBy = userId;
  } else if (currentStatus === 'PENDING_DIRETORIA') {
    patch.approvedBy = userId;
  }
  return patch;
}

function isStockSyncedDocumentUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes('/uploads/stock-invoices/') ||
    u.includes('/uploads/stock-payment-slips/')
  );
}

function parseOcNfAttachments(
  raw: unknown
): Array<{ url: string; name: string | null; uploadedAt: string; number: string | null }> {
  if (!raw || !Array.isArray(raw)) return [];
  const out: Array<{ url: string; name: string | null; uploadedAt: string; number: string | null }> =
    [];
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
    const number =
      typeof rec.number === 'string' && rec.number.trim() ? String(rec.number).trim() : null;
    out.push({ url: u, name, uploadedAt, number });
  }
  return out;
}

/** Chave canônica do nº da NF (ignora espaços, pontos, traços e barras). */
function normalizeOcNfNumberKey(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .replace(/[\s.\-\/_]/g, '')
    .toUpperCase();
}

function orderAlreadyHasNfNumber(
  order: Pick<PurchaseOrder, 'nfAttachments'>,
  nfNumber: string
): boolean {
  const key = normalizeOcNfNumberKey(nfNumber);
  if (!key) return false;
  return parseOcNfAttachments(order.nfAttachments).some(
    (nf) => nf.number && normalizeOcNfNumberKey(nf.number) === key
  );
}

/** Total da OC na listagem: itens + frete (fallback em registros antigos só com amountToPay). */
function orderGrandTotal(o: Pick<PurchaseOrder, 'items' | 'freightAmount' | 'amountToPay'>): number {
  const pricedItems = (o.items ?? []).filter((i) => {
    if (i.totalPrice == null) return false;
    return Number.isFinite(Number(i.totalPrice));
  });
  const hasPricedLineItems = pricedItems.length > 0;
  // Listagem summary pode trazer só materialRequestItemId (cobertura RM) — sem preço.
  // Nesse caso usar amountToPay, não somar NaN.
  if (
    !hasPricedLineItems &&
    o.amountToPay != null &&
    o.amountToPay !== '' &&
    Number.isFinite(Number(o.amountToPay))
  ) {
    return Number(o.amountToPay);
  }
  const items = pricedItems.reduce((s, i) => s + Number(i.totalPrice), 0);
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
  const pricedItems = (o.items ?? []).filter((i) => {
    if (i.totalPrice == null) return false;
    return Number.isFinite(Number(i.totalPrice));
  });
  const items = pricedItems.reduce((s, i) => s + Number(i.totalPrice), 0);
  const fRaw = o.freightAmount;
  if (fRaw != null && fRaw !== '' && Number.isFinite(Number(fRaw))) {
    return Math.max(0, Number(fRaw));
  }
  const paid = o.amountToPay != null && o.amountToPay !== '' ? Number(o.amountToPay) : NaN;
  if (Number.isFinite(paid)) return Math.max(0, paid - items);
  return 0;
}

function movementNotesText(notes: unknown): string | null {
  if (notes == null) return null;
  if (typeof notes === 'string') return notes;
  return String(notes);
}

function parseOcMovementInfoFromNotes(notes?: string | null): { ocNumber: string; split: 'TOTAL' | 'PARCIAL' | '' } | null {
  const text = movementNotesText(notes);
  if (!text) return null;
  const ocMatch = text.match(/Nº OC:\s*([^\n|]+)/i);
  if (!ocMatch?.[1]) return null;

  const rawSplit = text.match(/Tipo:\s*(TOTAL|PARCIAL)/i)?.[1]?.toUpperCase() ?? '';
  const split = rawSplit === 'TOTAL' || rawSplit === 'PARCIAL' ? rawSplit : '';

  return {
    ocNumber: ocMatch[1].trim(),
    split
  };
}

function normalizeOcNumberKey(orderNumber: string): string {
  return orderNumber.trim().toLowerCase();
}

/** Prefer TOTAL sobre PARCIAL (mesmo tipo IN/OUT); desempate pela data mais recente. */
function pickRepresentativeOcMovement(movs: StockMovementForOcTag[]): StockMovementForOcTag | null {
  if (!movs.length) return null;

  const sorted = [...movs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const latest = sorted[0];

  const pickBestForType = (type: 'IN' | 'OUT') => {
    const typed = sorted.filter((m) => m.type === type);
    if (!typed.length) return null;
    const totalMov = typed.find((m) => parseOcMovementInfoFromNotes(m.notes)?.split === 'TOTAL');
    return totalMov ?? typed[0];
  };

  return pickBestForType(latest.type) ?? latest;
}

function buildOcListDeliveryStatusFromMovement(mov: StockMovementForOcTag): OcMovementTag {
  const split = parseOcMovementInfoFromNotes(mov.notes)?.split || 'TOTAL';
  const isPartial = split === 'PARCIAL';

  if (mov.type === 'IN') {
    return {
      label: isPartial ? 'Recebido parcial' : 'Recebido',
      title: isPartial ? 'Recebida parcialmente no estoque' : 'Recebida totalmente no estoque',
      badgeKey: isPartial ? 'received_partial' : 'received',
    };
  }

  return {
    label: isPartial ? 'Obra parcial' : 'Na obra',
    title: isPartial ? 'Enviado parcialmente para a obra' : 'Enviado totalmente para a obra',
    badgeKey: isPartial ? 'site_partial' : 'site',
  };
}

/** Fallback quando a listagem de movimentos ainda não carregou, mas o resumo do detalhe já veio. */
function synthesizeListMovementFromStockReceipt(
  receipt: NonNullable<PurchaseOrder['stockReceipt']>
): StockMovementForOcTag | null {
  const exitBatches = receipt.exitBatches ?? [];
  const inBatches = receipt.batches ?? [];
  const now = new Date().toISOString();

  if (receipt.hasExits || exitBatches.length > 0) {
    const hasTotal = exitBatches.some((b) => b.split === 'TOTAL');
    return {
      id: 'synth-stock-out',
      type: 'OUT',
      notes: `Tipo: ${hasTotal ? 'TOTAL' : 'PARCIAL'}`,
      createdAt: exitBatches[0]?.createdAt || now
    };
  }

  if (receipt.hasReceipts || inBatches.length > 0) {
    const hasTotal = inBatches.some((b) => b.split === 'TOTAL');
    const hasOpenGap = (receipt.lines || []).some((l) => Number(l.gap) > 0);
    const isPartial = hasOpenGap || (!hasTotal && inBatches.some((b) => b.split === 'PARCIAL'));
    return {
      id: 'synth-stock-in',
      type: 'IN',
      notes: `Tipo: ${isPartial ? 'PARCIAL' : 'TOTAL'}`,
      createdAt: inBatches[0]?.createdAt || now
    };
  }

  return null;
}

function parseAttachmentTagFromLine(
  line: string,
  keyPrefix: string,
  labelPrefix: string,
  colorClass: string
): OcMovementAttachmentTag | null {
  const match = line.match(/^(.*?)\s*\|\s*URL:\s*([^\s|]+)\s*$/i);
  if (!match?.[1] || !match?.[2]) return null;
  const name = match[1].trim();
  const url = match[2].trim();
  if (!name || !url) return null;
  return {
    key: `${keyPrefix}-${name}-${url}`,
    label: `${labelPrefix}: ${name}`,
    colorClass,
    url
  };
}

function parseOcAttachmentTagsFromNotes(notes?: string | null): OcMovementAttachmentTag[] {
  const text = movementNotesText(notes);
  if (!text) return [];
  const tags: OcMovementAttachmentTag[] = [];
  const detailHint = 'Dados completos nos detalhes da OC';

  const nfMatch = text.match(/NF:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)/i);
  if (nfMatch?.[1] && nfMatch?.[2]) {
    const url = nfMatch[2].trim();
    tags.push({
      key: `nf-${url}`,
      label: 'NF 1',
      colorClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      url,
      titleHint: detailHint
    });
  }

  const withdrawalMatch = text.match(/Ficha de Retirada:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)/i);
  if (withdrawalMatch?.[1] && withdrawalMatch?.[2]) {
    const url = withdrawalMatch[2].trim();
    tags.push({
      key: `withdrawal-${url}`,
      label: 'Ficha 1',
      colorClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      url,
      titleHint: detailHint
    });
  }

  const boletoSection = text.match(/Boletos:\s*([\s\S]*)/i)?.[1] || '';
  if (boletoSection) {
    const lines = boletoSection
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    lines.forEach((line, idx) => {
      const n = idx + 1;
      const normalized = line.replace(/^\d+\)\s*/, '');
      const full = normalized.match(
        /^(.*?)\s*\|\s*Valor:\s*(.*?)\s*\|\s*Vencimento:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)\s*$/i
      );
      if (full?.[4]) {
        const url = full[4].trim();
        tags.push({
          key: `boleto-${url}-${n}`,
          label: `boleto ${n}`,
          colorClass: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
          url,
          titleHint: detailHint
        });
        return;
      }
      const simple = normalized.match(/^(.*?)\s*\|\s*URL:\s*([^\s|]+)\s*$/i);
      if (simple?.[2]) {
        const url = simple[2].trim();
        tags.push({
          key: `boleto-${url}-${n}`,
          label: `boleto ${n}`,
          colorClass: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
          url,
          titleHint: detailHint
        });
      }
    });
  }

  return tags;
}

function parseStockMovementAttachmentsFromNotes(notes?: string | null): StockMovementAttachmentBundle {
  const bundle: StockMovementAttachmentBundle = {
    nf: null,
    withdrawalSheet: null,
    paymentSlips: []
  };
  const text = movementNotesText(notes);
  if (!text) return bundle;

  const nfMatch = text.match(/NF:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)/i);
  if (nfMatch?.[1] && nfMatch?.[2]) {
    bundle.nf = { name: nfMatch[1].trim(), url: nfMatch[2].trim() };
  }

  const withdrawalMatch = text.match(/Ficha de Retirada:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)/i);
  if (withdrawalMatch?.[1] && withdrawalMatch?.[2]) {
    bundle.withdrawalSheet = { name: withdrawalMatch[1].trim(), url: withdrawalMatch[2].trim() };
  }

  const boletoSection = text.match(/Boletos:\s*([\s\S]*)/i)?.[1] || '';
  if (boletoSection) {
    boletoSection
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const normalized = line.replace(/^\d+\)\s*/, '');
        const full = normalized.match(
          /^(.*?)\s*\|\s*Valor:\s*(.*?)\s*\|\s*Vencimento:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)\s*$/i
        );
        if (full?.[1] && full?.[4]) {
          bundle.paymentSlips.push({
            name: full[1].trim(),
            amount: full[2]?.trim() || '',
            dueDate: full[3]?.trim() || '',
            url: full[4].trim()
          });
          return;
        }
        const fallback = parseAttachmentTagFromLine(normalized, 'boleto', 'Boleto', '');
        if (fallback?.url) {
          bundle.paymentSlips.push({
            name: fallback.label.replace(/^Boleto:\s*/i, '').trim(),
            url: fallback.url
          });
        }
      });
  }

  return bundle;
}

type OcDetailModalTab = 'resumo' | 'materiais' | 'pagamento' | 'documentos' | 'estoque' | 'comentarios';

const OC_DETAIL_MODAL_TABS: { id: OcDetailModalTab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'materiais', label: 'Materiais' },
  { id: 'pagamento', label: 'Pagamento' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'comentarios', label: 'Comentários' }
];

/** Fases do fluxo em que a modal deve abrir direto na aba Pagamento. */
const OC_DETAIL_PAYMENT_PHASE_STATUSES = new Set([
  'APPROVED',
  'PENDING_PROOF_VALIDATION',
  'PENDING_PROOF_CORRECTION',
  'PENDING_NF_ATTACHMENT'
]);

function defaultOcDetailModalTab(status: string): OcDetailModalTab {
  return OC_DETAIL_PAYMENT_PHASE_STATUSES.has(status) ? 'pagamento' : 'resumo';
}

function OcDetailField({
  label,
  children,
  className = ''
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 break-words">{children}</dd>
    </div>
  );
}

function OcDetailSection({
  title,
  description,
  children,
  className = ''
}: {
  title?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-3 ${className}`}>
      {title ? (
        <div className="pb-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">{title}</h3>
          {description ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function OcProofFilePicker({
  file,
  onChange,
  disabled = false,
  uploading = false,
  selectLabel = 'Selecionar comprovante',
  emptyHint = 'PDF ou imagem'
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  uploading?: boolean;
  selectLabel?: string;
  emptyHint?: string;
}) {
  const isDisabled = disabled || uploading;
  return (
    <label
      className={`flex min-h-14 items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 transition-colors ${
        isDisabled
          ? 'cursor-not-allowed border-gray-200 text-gray-400 dark:border-gray-700 dark:text-gray-500'
          : 'cursor-pointer border-gray-300 text-gray-700 hover:border-red-400 hover:bg-red-50/40 dark:border-gray-600 dark:text-gray-200 dark:hover:border-red-500/70 dark:hover:bg-red-950/20'
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          {uploading ? 'Anexando…' : file ? 'Arquivo selecionado' : selectLabel}
        </span>
        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
          {file?.name || emptyHint}
        </span>
      </span>
      <input
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        disabled={isDisabled}
        onChange={(event) => {
          const next = event.target.files?.[0] ?? null;
          event.target.value = '';
          onChange(next);
        }}
      />
    </label>
  );
}

function OcDetailDocRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-2.5 border-b border-gray-200/80 dark:border-gray-700/80 last:border-0 last:pb-0 first:pt-0 sm:flex-row sm:items-start sm:gap-4">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 sm:w-48">{label}</span>
      <div className="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-200">{children}</div>
    </div>
  );
}

type OcDocumentEntry = {
  id: string;
  label: string;
  subtitle?: string;
  url?: string;
  fileName?: string;
  pending?: boolean;
};

function collectOcDocumentEntries(
  order: Pick<
    PurchaseOrder,
    | 'status'
    | 'paymentType'
    | 'paymentParcelCount'
    | 'paymentBoletoInstallments'
    | 'paymentProofUrl'
    | 'paymentProofName'
    | 'nfAttachments'
  >,
  stockAttachments: StockMovementAttachmentBundle
): OcDocumentEntry[] {
  const entries: OcDocumentEntry[] = [];
  const seenIds = new Set<string>();

  const push = (entry: Omit<OcDocumentEntry, 'id'> & { id: string }) => {
    if (seenIds.has(entry.id)) return;
    seenIds.add(entry.id);
    const url = entry.url?.trim() || undefined;
    entries.push({
      ...entry,
      url,
      pending: !url,
      fileName: url ? entry.fileName || entry.label : undefined,
      subtitle: url ? entry.subtitle : entry.subtitle || 'Não anexado'
    });
  };

  if (isOcBoletoPaymentType(order.paymentType)) {
    const parcelCount = Math.max(1, order.paymentParcelCount ?? 1);
    const rows = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);

    // Por parcela: Boleto, depois Comprovante (1, 2, …).
    for (let index = 0; index < parcelCount; index++) {
      const row = rows[index];
      const parcelLabel = String(index + 1);
      const boletoUrl =
        parcelCount > 1
          ? (row?.boletoUrl || '').trim()
          : effectivePaymentBoletoUrl(order) || (row?.boletoUrl || '').trim();
      push({
        id: parcelCount > 1 ? `boleto-parcela-${index}` : 'boleto',
        label: parcelCount > 1 ? `Boleto - Parcela ${parcelLabel}` : 'Boleto - Parcela 1',
        url: boletoUrl || undefined,
        fileName:
          (parcelCount > 1
            ? row?.boletoName?.trim()
            : effectivePaymentBoletoName(order) || row?.boletoName?.trim()) ||
          `Boleto parcela ${parcelLabel}`
      });
      const proofUrl =
        parcelCount > 1
          ? (row?.installmentProofUrl || '').trim()
          : (order.paymentProofUrl || '').trim() ||
            (row?.installmentProofUrl || '').trim();
      push({
        id: parcelCount > 1 ? `comprovante-parcela-${index}` : 'comprovante',
        label:
          parcelCount > 1
            ? `Comprovante - Parcela ${parcelLabel}`
            : 'Comprovante - Parcela 1',
        url: proofUrl || undefined,
        fileName:
          (parcelCount > 1
            ? row?.installmentProofName?.trim()
            : order.paymentProofName?.trim() || row?.installmentProofName?.trim()) ||
          `Comprovante parcela ${parcelLabel}`
      });
    }
  } else {
    push({
      id: 'comprovante',
      label: 'Comprovante de pagamento',
      url: (order.paymentProofUrl || '').trim() || undefined,
      fileName: order.paymentProofName?.trim() || 'Comprovante pagamento'
    });
    stockAttachments.paymentSlips.forEach((slip, index) => {
      if (!slip.url) return;
      push({
        id: `boleto-estoque-${index}-${slip.url}`,
        label: slip.amount ? `Boleto (${slip.amount})` : `Boleto ${index + 1}`,
        subtitle: slip.dueDate ? `Vencimento: ${slip.dueDate}` : undefined,
        url: slip.url,
        fileName: slip.name || `Boleto ${index + 1}`
      });
    });
  }

  // Nota Fiscal depois dos boletos/comprovantes.
  const nfs = parseOcNfAttachments(order.nfAttachments);
  if (nfs.length > 0) {
    nfs.forEach((nf, index) => {
      push({
        id: `nf-${index}-${nf.url || nf.number || index}`,
        label: nf.number ? `Nota Fiscal ${nf.number}` : `Nota Fiscal ${index + 1}`,
        subtitle: nf.uploadedAt ? new Date(nf.uploadedAt).toLocaleString('pt-BR') : undefined,
        url: nf.url,
        fileName: nf.name || `NF ${index + 1}`
      });
    });
  } else if (stockAttachments.nf?.url) {
    push({
      id: 'nf-estoque',
      label: 'Nota Fiscal 1',
      url: stockAttachments.nf.url,
      fileName: stockAttachments.nf.name || 'NF estoque'
    });
  } else {
    push({
      id: 'nf-pending',
      label: 'Nota Fiscal',
      subtitle: 'Não anexada'
    });
  }

  // Ficha de Retirada sempre por último.
  push({
    id: 'ficha-retirada',
    label: 'Ficha de Retirada',
    url: stockAttachments.withdrawalSheet?.url || undefined,
    fileName: stockAttachments.withdrawalSheet?.name || 'Ficha de Retirada',
    subtitle: stockAttachments.withdrawalSheet?.url ? undefined : 'Não anexada'
  });

  return entries;
}

type OcDocumentBlock = {
  id: string;
  title: string;
  items: OcDocumentEntry[];
};

/** Agrupa documentos em blocos: parcelas, pagamento, NF e ficha. */
function groupOcDocumentBlocks(
  entries: OcDocumentEntry[],
  order: Pick<PurchaseOrder, 'paymentType' | 'paymentParcelCount'>
): OcDocumentBlock[] {
  const blocks: OcDocumentBlock[] = [];
  const used = new Set<string>();

  const take = (pred: (e: OcDocumentEntry) => boolean, mapItem?: (e: OcDocumentEntry) => OcDocumentEntry) => {
    const items = entries
      .filter((e) => !used.has(e.id) && pred(e))
      .map((e) => {
        used.add(e.id);
        return mapItem ? mapItem(e) : e;
      });
    return items;
  };

  if (isOcBoletoPaymentType(order.paymentType)) {
    const parcelCount = Math.max(1, order.paymentParcelCount ?? 1);
    for (let index = 0; index < parcelCount; index++) {
      const items = take(
        (e) =>
          e.id === `boleto-parcela-${index}` ||
          e.id === `comprovante-parcela-${index}` ||
          (parcelCount === 1 && (e.id === 'boleto' || e.id === 'comprovante')),
        (e) => ({
          ...e,
          label: e.id.includes('comprovante') ? 'Comprovante' : 'Boleto'
        })
      );
      if (items.length > 0) {
        blocks.push({ id: `parcela-${index}`, title: `Parcela ${index + 1}`, items });
      }
    }
  } else {
    const items = take(
      (e) => e.id === 'comprovante' || e.id.startsWith('boleto-estoque-')
    );
    if (items.length > 0) {
      blocks.push({ id: 'pagamento', title: 'Pagamento', items });
    }
  }

  const nfItems = take((e) => e.id.startsWith('nf-') || e.id === 'nf-pending' || e.id === 'nf-estoque');
  if (nfItems.length > 0) {
    blocks.push({ id: 'notas-fiscais', title: 'Nota Fiscal', items: nfItems });
  }

  const fichaItems = take(
    (e) => e.id === 'ficha-retirada',
    (e) => ({ ...e, label: 'Arquivo' })
  );
  if (fichaItems.length > 0) {
    blocks.push({ id: 'ficha-retirada', title: 'Ficha de Retirada', items: fichaItems });
  }

  const leftovers = entries.filter((e) => !used.has(e.id));
  if (leftovers.length > 0) {
    blocks.push({ id: 'outros', title: 'Outros', items: leftovers });
  }

  return blocks;
}

async function openQuoteMapSnapshotPdf(mapId: string, purchaseOrderId?: string) {
  const response = await api.get(`/quote-maps/${mapId}/snapshot-pdf`, {
    responseType: 'blob',
    params: purchaseOrderId ? { purchaseOrderId } : undefined,
  });
  const blobUrl = window.URL.createObjectURL(response.data);
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
}

async function downloadQuoteMapSnapshotPdf(
  mapId: string,
  orderNumber?: string | number | null,
  supplierName?: string | null,
  purchaseOrderId?: string
) {
  const response = await api.get(`/quote-maps/${mapId}/snapshot-pdf`, {
    responseType: 'blob',
    params: purchaseOrderId ? { purchaseOrderId } : undefined,
  });
  const blobUrl = window.URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = buildOcPdfDownloadFileName(
    orderNumber != null ? String(orderNumber) : null,
    supplierName
  );
  anchor.click();
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
}

function OcDetailDocumentItem({
  label,
  subtitle,
  url,
  fileName,
  pending = false,
  onView,
  onDownload,
  viewPending = false,
  downloadPending = false
}: {
  label: string;
  subtitle?: string;
  url?: string;
  fileName?: string;
  pending?: boolean;
  onView?: () => void | Promise<void>;
  onDownload?: () => void | Promise<void>;
  viewPending?: boolean;
  downloadPending?: boolean;
}) {
  const actionBtnCls =
    'inline-flex items-center justify-center rounded-md p-1.5 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300';
  const isPending = pending || (!url && !onView && !onDownload);

  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
        ) : fileName && fileName !== label ? (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">{fileName}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {isPending ? (
          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            Pendente
          </span>
        ) : url ? (
          <OcAttachmentActions url={url} fileName={fileName || label} variant="buttons" />
        ) : (
          <>
            {onView ? (
              <button
                type="button"
                disabled={viewPending}
                onClick={() => void onView()}
                title="Ver"
                aria-label={`Ver ${label}`}
                className={actionBtnCls}
              >
                {viewPending ? (
                  <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                ) : (
                  <Eye className="h-5 w-5 shrink-0" />
                )}
              </button>
            ) : null}
            {onDownload ? (
              <button
                type="button"
                disabled={downloadPending}
                onClick={() => void onDownload()}
                title="Baixar"
                aria-label={`Baixar ${label}`}
                className={actionBtnCls}
              >
                {downloadPending ? (
                  <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                ) : (
                  <Download className="h-5 w-5 shrink-0" />
                )}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

type OcStockMovementBatch = NonNullable<PurchaseOrder['stockReceipt']>['batches'][number];

function OcStockMovementHistoryList({
  title,
  batches
}: {
  title: string;
  movementLabel?: string;
  batches: OcStockMovementBatch[];
}) {
  if (batches.length === 0) return null;

  const rows = batches.flatMap((batch, batchIdx) =>
    batch.items.map((item, itemIdx) => ({
      key: `${batch.createdAt}-${batchIdx}-${item.materialName}-${itemIdx}`,
      materialName: item.materialName,
      quantity: item.quantity,
      unit: item.unit,
      createdAt: batch.createdAt,
      split: batch.split,
      userName: batch.userName
    }))
  );

  return (
    <div className="table-scroll">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 pb-3 border-b border-gray-200 dark:border-gray-700">
        {title}
      </p>
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="text-left border-b border-gray-200 dark:border-gray-700">
            <th className="py-3 pr-2 font-medium text-xs text-gray-500 dark:text-gray-400">
              Material
            </th>
            <th className="py-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
              Qtd
            </th>
            <th className="py-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
              Unidade
            </th>
            <th className="py-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
              Data
            </th>
            <th className="py-3 pl-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
              Usuário
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {rows.map((row) => (
            <tr key={row.key} className="text-gray-900 dark:text-gray-100">
              <td className="py-3 pr-2 align-top max-w-[200px] sm:max-w-none">{row.materialName}</td>
              <td className="py-3 px-2 text-center whitespace-nowrap align-top tabular-nums font-medium">
                {row.quantity.toLocaleString('pt-BR')}
              </td>
              <td className="py-3 px-2 text-center whitespace-nowrap align-top">{row.unit}</td>
              <td className="py-3 px-2 text-center whitespace-nowrap align-top text-gray-600 dark:text-gray-400">
                {new Date(row.createdAt).toLocaleString('pt-BR')}
              </td>
              <td className="py-3 pl-2 text-center whitespace-nowrap align-top text-gray-600 dark:text-gray-400">
                {row.userName}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function materialLineLabel(
  m?:
    | NonNullable<PurchaseOrder['items']>[number]['material']
    | {
        name?: string | null;
        description?: string | null;
        sinapiCode?: string | null;
      }
) {
  if (!m) return '—';
  const d = m.description?.trim();
  const n = m.name?.trim();
  if (d) return d;
  if (n) return n;
  if (m.sinapiCode) return m.sinapiCode;
  return '—';
}

/** Detalhamento do item (mapa de cotação → notes da OC; fallback observação da RM). */
function purchaseOrderItemDetailText(
  line: NonNullable<PurchaseOrder['items']>[number]
): string {
  const fromOc = typeof line.notes === 'string' ? line.notes.trim() : '';
  if (fromOc) return fromOc;
  const mri = line.materialRequestItem;
  if (!mri || typeof mri !== 'object') return '';
  const fromRmNotes = typeof mri.notes === 'string' ? mri.notes.trim() : '';
  if (fromRmNotes) return fromRmNotes;
  const fromRmObs = typeof mri.observation === 'string' ? mri.observation.trim() : '';
  return fromRmObs;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function totalOrder(items?: { totalPrice?: number | string | null }[] | null) {
  return (items ?? []).reduce((s, i) => {
    const n = Number(i.totalPrice);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function OcOrderMaterialsTable({
  order,
  canReturnItem,
  onReturnItem,
  returningItemId,
}: {
  order: PurchaseOrder;
  canReturnItem?: boolean;
  onReturnItem?: (item: NonNullable<PurchaseOrder['items']>[number]) => void;
  returningItemId?: string | null;
}) {
  const showActions = Boolean(canReturnItem && onReturnItem);
  const itemCount = order.items?.length ?? 0;

  return (
    <div className="table-scroll">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="text-left border-b border-gray-200 dark:border-gray-700">
            <th className="pb-3 pr-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap w-12">
              Item
            </th>
            <th className="pb-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400">Material</th>
            <th className="pb-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-right whitespace-nowrap">
              Qtd
            </th>
            <th className="pb-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
              Un.
            </th>
            <th className="pb-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-right whitespace-nowrap">
              Unitário
            </th>
            <th className="pb-3 pl-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-right whitespace-nowrap">
              Total
            </th>
            {showActions ? (
              <th className="w-[1%] pb-3 pl-2 pr-0 text-center text-xs font-medium whitespace-nowrap text-gray-500 dark:text-gray-400">
                Ações
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {order.items?.map((line, idx) => {
            const detail = purchaseOrderItemDetailText(line);
            const canReturnThis = showActions && Boolean(line.id);
            return (
              <tr key={line.id || idx} className="text-gray-900 dark:text-gray-100">
                <td className="py-3 pr-2 text-center tabular-nums align-top font-medium text-gray-500 dark:text-gray-400">
                  {idx + 1}
                </td>
                <td className="py-3 px-2 align-top max-w-[220px] sm:max-w-none">
                  <span className="block">{materialLineLabel(line.material)}</span>
                  {detail ? (
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      {detail}
                    </p>
                  ) : null}
                </td>
                <td className="py-3 px-2 text-right whitespace-nowrap align-top tabular-nums">
                  {Number(line.quantity)}
                </td>
                <td className="py-3 px-2 text-center whitespace-nowrap align-top">{line.unit || '—'}</td>
                <td className="py-3 px-2 text-right whitespace-nowrap align-top tabular-nums">
                  {formatCurrency(Number(line.unitPrice))}
                </td>
                <td className="py-3 pl-2 text-right whitespace-nowrap align-top font-medium tabular-nums">
                  {formatCurrency(Number(line.totalPrice))}
                </td>
                {showActions ? (
                  <td className="w-[1%] py-3 pl-2 pr-0 text-center align-top whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onReturnItem?.(line)}
                      disabled={!canReturnThis || returningItemId === line.id}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      title={
                        itemCount <= 1
                          ? 'Devolver à RM (cancela esta OC)'
                          : 'Devolver à RM'
                      }
                      aria-label="Devolver à RM"
                    >
                      {returningItemId === line.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Undo2 className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 dark:border-gray-700">
            <td
              colSpan={showActions ? 6 : 5}
              className="pt-3.5 pr-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400"
            >
              Total
            </td>
            <td className="pt-3.5 pl-2 text-right font-semibold tabular-nums text-red-700 dark:text-red-300 whitespace-nowrap">
              {formatCurrency(totalOrder(order.items))}
            </td>
            {showActions ? <td className="w-[1%] pt-3.5 pl-2 pr-0" /> : null}
          </tr>
        </tfoot>
      </table>
    </div>
  );
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

const ocListDocThCls =
  'px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[5.5rem]';
const ocListDocTdCls = 'px-3 sm:px-6 py-4 align-middle text-xs min-w-[5.5rem]';
const ocListDocCellInnerCls = 'flex w-full items-center justify-center text-center';

function ocListShowsDocumentColumns(tab: OcTab): boolean {
  return (
    tab === 'APPROVED' ||
    tab === 'PROOF_VALIDATION' ||
    tab === 'PROOF_CORRECTION' ||
    tab === 'FINALIZADAS'
  );
}

function ocListShowsComprovanteColumn(tab: OcTab): boolean {
  return tab === 'PROOF_VALIDATION' || tab === 'PROOF_CORRECTION';
}

function ocListShowsPaymentConditionColumn(tab: OcTab): boolean {
  return tab === 'PROOF_CORRECTION';
}

function ocListShowsInstallmentParcelColumn(tab: OcTab): boolean {
  return tab === 'APPROVED' || tab === 'PROOF_VALIDATION' || tab === 'ATTACH_BOLETO';
}

function ocListShowsInstallmentDueDateColumn(tab: OcTab): boolean {
  return tab === 'APPROVED';
}

function ocListShowsInstallmentAmountColumn(tab: OcTab): boolean {
  return tab === 'APPROVED';
}

function formatOcListPaymentCondition(
  order: Pick<PurchaseOrder, 'paymentType' | 'paymentCondition'>,
  labelMap: Record<string, string>
): string {
  if (order.paymentType === 'AVISTA' || order.paymentType === 'CARTAO') {
    return labelMap[order.paymentType] ?? 'À vista';
  }
  const code = (order.paymentCondition || '').trim();
  if (!code) return '—';
  return labelMap[code] ?? code;
}

function formatOcListCostCenter(
  costCenter?: { code?: string | null; name?: string | null } | null
): { display: string; title?: string } {
  if (!costCenter) return { display: '—' };
  const code = costCenter.code?.trim() ?? '';
  const name = costCenter.name?.trim() ?? '';
  if (code && name) return { display: name, title: `${code} — ${name}` };
  if (name) return { display: name };
  if (code) return { display: code };
  return { display: '—' };
}

function ocListInstallmentMode(tab: OcTab): OcListInstallmentMode | undefined {
  if (tab === 'ATTACH_BOLETO') return 'attach-boleto';
  if (tab === 'APPROVED') return 'payment';
  if (tab === 'PROOF_VALIDATION' || tab === 'PROOF_CORRECTION') return 'proof-validation';
  return undefined;
}

function ocListShowsAttachBoletoStatusColumn(tab: OcTab): boolean {
  return tab === 'ATTACH_BOLETO';
}

function ocListShowsBoletoColumn(tab: OcTab): boolean {
  return tab === 'APPROVED' || tab === 'PROOF_VALIDATION' || tab === 'PROOF_CORRECTION';
}

function ocListShowsParcelasColumn(tab: OcTab): boolean {
  return tab === 'FINALIZADAS';
}

function ocListShowsNfColumn(tab: OcTab): boolean {
  return tab === 'FINALIZADAS' || tab === 'ATTACH_NF';
}

function ocListShowsPaymentStatusColumn(tab: OcTab): boolean {
  return tab === 'APPROVED';
}

function ocListShowsOrderGrandTotalColumn(tab: OcTab): boolean {
  return tab !== 'APPROVED';
}

function ocListShowsOrderDateColumn(tab: OcTab): boolean {
  return (
    tab !== 'APPROVED' &&
    tab !== 'PROOF_VALIDATION' &&
    tab !== 'PROOF_CORRECTION'
  );
}

function canUserAttachNfOnOrder(order: PurchaseOrder, canAct: boolean): boolean {
  return (
    canAct &&
    order.status === 'PENDING_NF_ATTACHMENT' &&
    parseOcNfAttachments(order.nfAttachments).length === 0
  );
}

function canUserFinalizeOcWithNf(order: PurchaseOrder, canAct: boolean): boolean {
  return (
    canAct &&
    order.status === 'PENDING_NF_ATTACHMENT' &&
    parseOcNfAttachments(order.nfAttachments).length > 0
  );
}

function canUserManageNfOnOrder(order: PurchaseOrder, canAct: boolean): boolean {
  return canAct && order.status === 'PENDING_NF_ATTACHMENT';
}

function OcListDownloadIconLink({
  url,
  fileName,
  label = 'Baixar arquivo'
}: {
  url: string;
  fileName: string;
  label?: string;
}) {
  const name = fileName.trim() || 'arquivo';
  return (
    <a
      href={absoluteUploadUrl(url)}
      target="_blank"
      rel="noopener noreferrer"
      title={name}
      aria-label={`${label}: ${name}`}
      className="inline-flex rounded-md p-1.5 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
      onClick={(e) => e.stopPropagation()}
    >
      <Download className="h-5 w-5 shrink-0" />
    </a>
  );
}

function OcListDeliveryStatusCellContent({
  movement,
  orderStatus,
}: {
  movement: StockMovementForOcTag | null | undefined;
  orderStatus?: string;
}) {
  if (orderStatus === 'REJECTED' || orderStatus === 'CANCELLED') {
    return (
      <span className={ocDeliveryStatusBadgeClass('cancelled')}>Cancelado</span>
    );
  }

  if (!movement) {
    return <span className={ocDeliveryStatusBadgeClass('pending')}>Pendente</span>;
  }

  const tag = buildOcListDeliveryStatusFromMovement(movement);
  return (
    <span className={ocDeliveryStatusBadgeClass(tag.badgeKey)} title={tag.title}>
      {tag.label}
    </span>
  );
}

function OcListAttachBoletoStatusCellContent({ order }: { order: PurchaseOrder }) {
  const pillBase =
    'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap';

  if (canSendCurrentBoletoToPayment(order) && order.paymentBoletoPhaseReleased !== true) {
    return (
      <span
        className={`${pillBase} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200`}
      >
        Pronto p/ envio
      </span>
    );
  }
  return (
    <span
      className={`${pillBase} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200`}
    >
      Aguardando boleto
    </span>
  );
}

function OcListInstallmentParcelCellContent({
  order,
  installmentMode,
}: {
  order: PurchaseOrder;
  installmentMode?: OcListInstallmentMode;
}) {
  const parcelCount = Math.max(1, order.paymentParcelCount ?? 1);

  // À vista / parcela única: sempre 1/1 (evita o "—" vazio).
  if (!isOcBoletoPaymentType(order.paymentType) || parcelCount <= 1) {
    return (
      <span className="font-medium text-gray-800 dark:text-gray-200 tabular-nums">1/1</span>
    );
  }

  const idx = installmentMode
    ? listInstallmentIndex(order, installmentMode)
    : visiblePaymentBoletoInstallmentIndex(order);

  if (idx == null) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }

  return (
    <span className="font-medium text-gray-800 dark:text-gray-200 tabular-nums">
      {idx + 1}/{parcelCount}
    </span>
  );
}

function resolveDueDateFromParcelPlan(
  order: Pick<PurchaseOrder, 'orderDate' | 'paymentParcelDueDays' | 'paymentParcelCount'>,
  installmentIndex: number
): string | null {
  const daysList = order.paymentParcelDueDays?.length ? order.paymentParcelDueDays : [30];
  const days = daysList[installmentIndex] ?? daysList[daysList.length - 1] ?? 30;
  const computed = ymdAddDays(order.orderDate, days);
  return computed || null;
}

function resolvePaymentListInstallmentValues(
  order: PurchaseOrder,
  installmentMode?: OcListInstallmentMode,
  financialEntries?: FinancialControlEntry[],
): { amount: number | null; dueDate: string | null } {
  const mode = installmentMode ?? 'payment';
  const parcelCount = Math.max(1, order.paymentParcelCount ?? 1);
  const rows = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
  const installmentIdx = listInstallmentIndex(order, mode);
  const planIdx = installmentIdx ?? 0;

  if (isOcBoletoPaymentType(order.paymentType)) {
    let row = listInstallmentRow(order, mode);
    if (!row) {
      if (parcelCount <= 1) {
        row = rows[0] ?? null;
      } else if (installmentIdx != null) {
        row = rows[installmentIdx] ?? null;
      } else {
        row =
          rows.find(
            (r) => rowStatus(r) !== 'PAID' && ((r.dueDate || '').trim() || Number.isFinite(r.amount))
          ) ??
          rows[0] ??
          null;
      }
    }

    const amount =
      row && Number.isFinite(row.amount) && row.amount > 0 ? row.amount : null;
    const dueRaw = (row?.dueDate || '').trim();
    let dueDate = dueRaw ? dueRaw.slice(0, 10) : null;

    if ((amount == null || !dueDate) && financialEntries?.length) {
      const parcelLabel =
        installmentIdx != null && parcelCount > 1 ? `${installmentIdx + 1}/${parcelCount}` : '1/1';
      const entry =
        financialEntries.find((e) => (e.parcelNumber || '').trim() === parcelLabel) ??
        financialEntries.find(
          (e) => e.status !== 'PAGO' && e.status !== 'PROCESSO_COMPLETO',
        ) ??
        financialEntries[0];
      if (entry) {
        if (amount == null) {
          const value = entry.finalValue ?? entry.originalValue;
          const num = value != null && value !== '' ? Number(value) : NaN;
          if (Number.isFinite(num) && num > 0) {
            return {
              amount: num,
              dueDate: dueDate || entry.dueDate?.slice(0, 10) || resolveDueDateFromParcelPlan(order, planIdx)
            };
          }
        }
        if (!dueDate && entry.dueDate) dueDate = entry.dueDate.slice(0, 10);
      }
    }

    if (!dueDate) {
      dueDate = resolveDueDateFromParcelPlan(order, planIdx);
    }

    if (amount != null || dueDate) return { amount, dueDate };
  }

  if (financialEntries?.length) {
    const entry =
      financialEntries.find(
        (e) => e.status !== 'PAGO' && e.status !== 'PROCESSO_COMPLETO',
      ) ?? financialEntries[0];
    const value = entry.finalValue ?? entry.originalValue;
    const num = value != null && value !== '' ? Number(value) : NaN;
    const amount = Number.isFinite(num) && num > 0 ? num : orderGrandTotal(order);
    const dueDate =
      entry.dueDate?.slice(0, 10) || resolveDueDateFromParcelPlan(order, planIdx);
    return { amount: amount > 0 ? amount : null, dueDate };
  }

  const ocTotal = orderGrandTotal(order);
  return {
    amount: ocTotal > 0 ? ocTotal : null,
    dueDate: resolveDueDateFromParcelPlan(order, planIdx)
  };
}

function formatInstallmentDueDateLabel(dueDate: string | null): string {
  if (!dueDate) return '—';
  const date = new Date(`${dueDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function isOcDueDateInPaymentFilterRange(
  dueDate: string | null,
  filters: { dueDateFrom: string; dueDateTo: string },
): boolean {
  if (!dueDate) return false;
  const normalized = dueDate.slice(0, 10);
  if (filters.dueDateFrom && normalized < filters.dueDateFrom) return false;
  if (filters.dueDateTo && normalized > filters.dueDateTo) return false;
  return true;
}

function OcListInstallmentDueDateCellContent({
  order,
  installmentMode,
  financialEntries,
}: {
  order: PurchaseOrder;
  installmentMode?: OcListInstallmentMode;
  financialEntries?: FinancialControlEntry[];
}) {
  const { dueDate } = resolvePaymentListInstallmentValues(
    order,
    installmentMode,
    financialEntries,
  );
  return (
    <span className="font-medium text-gray-800 dark:text-gray-200 tabular-nums whitespace-nowrap">
      {formatInstallmentDueDateLabel(dueDate)}
    </span>
  );
}

function OcListInstallmentAmountCellContent({
  order,
  installmentMode,
  financialEntries,
}: {
  order: PurchaseOrder;
  installmentMode?: OcListInstallmentMode;
  financialEntries?: FinancialControlEntry[];
}) {
  const { amount } = resolvePaymentListInstallmentValues(
    order,
    installmentMode,
    financialEntries,
  );
  if (amount == null) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }
  return (
    <span className="font-medium text-gray-800 dark:text-gray-200 tabular-nums whitespace-nowrap">
      {amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
    </span>
  );
}

function OcListBoletoCellContent({
  order,
  singleInstallmentMode,
}: {
  order: PurchaseOrder;
  singleInstallmentMode?: OcListInstallmentMode;
}) {
  if (!isOcBoletoPaymentType(order.paymentType)) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }

  const parcelCount = order.paymentParcelCount ?? 1;
  if (parcelCount > 1) {
    const inst = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
    const visibleIdx = singleInstallmentMode ? listInstallmentIndex(order, singleInstallmentMode) : null;
    const indices =
      visibleIdx != null
        ? [visibleIdx]
        : Array.from({ length: parcelCount }, (_, idx) => idx);
    return (
      <div className="mx-auto flex max-w-[11rem] flex-col items-center gap-1 text-center">
        {indices.map((idx) => {
          const row = inst[idx];
          const st = rowStatus(row);
          if (singleInstallmentMode && visibleIdx == null) {
            return (
              <span key={idx} className="text-[11px] text-gray-400 dark:text-gray-500">
                —
              </span>
            );
          }
          return (
            <div key={idx} className="text-[11px] leading-tight text-gray-700 dark:text-gray-300 space-y-0.5">
              <div>
                {!singleInstallmentMode ? (
                  <>
                    <span className="text-gray-500 dark:text-gray-400 font-medium">{romanParcelLabel(idx)}:</span>{' '}
                  </>
                ) : null}
                {st === 'PAID' ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {installmentStatusLabel(st)}
                  </span>
                ) : (row?.boletoUrl || '').trim() ? (
                  <OcListDownloadIconLink
                    url={row.boletoUrl || ''}
                    fileName={row.boletoName?.trim() || `Boleto ${romanParcelLabel(idx)}`}
                    label="Baixar boleto"
                  />
                ) : st === 'AWAITING_PAYMENT' ? (
                  <span className="text-amber-700 dark:text-amber-300 font-medium">
                    {installmentStatusLabel(st)}
                  </span>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">—</span>
                )}
              </div>
              {!singleInstallmentMode && (Number.isFinite(row?.amount) || row?.dueDate) ? (
                <div className="text-[10px] text-gray-500 dark:text-gray-400">
                  {Number.isFinite(row?.amount)
                    ? row.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : null}
                  {Number.isFinite(row?.amount) && row?.dueDate ? ' · ' : null}
                  {row?.dueDate
                    ? new Date(`${row.dueDate}T12:00:00`).toLocaleDateString('pt-BR')
                    : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  const boletoUrl = effectivePaymentBoletoUrl(order);
  if (boletoUrl) {
    return (
      <OcListDownloadIconLink
        url={boletoUrl}
        fileName={effectivePaymentBoletoName(order)}
        label="Baixar boleto"
      />
    );
  }

  return <span className="text-gray-400 dark:text-gray-500">Não anexado</span>;
}

function OcListParcelasCellContent({ order }: { order: PurchaseOrder }) {
  if (!isOcBoletoPaymentType(order.paymentType)) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }

  const parcelCount = order.paymentParcelCount ?? 1;
  const inst = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
  const summary = Array.from({ length: parcelCount }, (_, idx) => {
    const row = inst[idx];
    const st = rowStatus(row);
    const amount = Number.isFinite(row?.amount)
      ? row.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : null;
    const due = row?.dueDate
      ? new Date(`${row.dueDate}T12:00:00`).toLocaleDateString('pt-BR')
      : null;
    const details = [amount, due].filter(Boolean).join(' · ');
    return details
      ? `${romanParcelLabel(idx)}: ${installmentStatusLabel(st)} · ${details}`
      : `${romanParcelLabel(idx)}: ${installmentStatusLabel(st)}`;
  }).join('\n');

  return (
    <span
      className="text-sm font-medium text-gray-800 dark:text-gray-200 tabular-nums"
      title={summary || undefined}
    >
      {parcelCount}
    </span>
  );
}

function OcListComprovanteCellContent({
  order,
  proofValidationOnly = false,
}: {
  order: PurchaseOrder;
  proofValidationOnly?: boolean;
}) {
  const proofUrl = (order.paymentProofUrl || '').trim();
  if (proofUrl && !proofValidationOnly) {
    return (
      <OcListDownloadIconLink
        url={proofUrl}
        fileName={order.paymentProofName?.trim() || 'Comprovante pagamento'}
        label="Baixar comprovante"
      />
    );
  }

  const parcelCount = order.paymentParcelCount ?? 1;
  if (parcelCount > 1 && order.paymentType === 'BOLETO') {
    const inst = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
    if (proofValidationOnly) {
      const idx = proofValidationInstallmentIndex(order);
      if (idx != null) {
        const row = inst[idx];
        const url = (row?.installmentProofUrl || '').trim();
        if (url) {
          return (
            <OcListDownloadIconLink
              url={url}
              fileName={row.installmentProofName?.trim() || `Comprovante ${romanParcelLabel(idx)}`}
              label="Baixar comprovante"
            />
          );
        }
      }
    } else {
      const withProof = inst
        .map((row, idx) => ({ row, idx }))
        .filter(({ row }) => (row.installmentProofUrl || '').trim());
      if (withProof.length > 0) {
        return (
          <div className="mx-auto flex max-w-[11rem] flex-col items-center gap-1 text-center">
            {withProof.map(({ row, idx }) => (
              <div key={idx} className="text-[11px] leading-tight">
                <span className="text-gray-500 dark:text-gray-400 font-medium">{romanParcelLabel(idx)}:</span>{' '}
                <OcListDownloadIconLink
                  url={row.installmentProofUrl || ''}
                  fileName={row.installmentProofName?.trim() || `Comprovante ${romanParcelLabel(idx)}`}
                  label="Baixar comprovante"
                />
              </div>
            ))}
          </div>
        );
      }
    }
  }

  if (proofUrl) {
    return (
      <OcListDownloadIconLink
        url={proofUrl}
        fileName={order.paymentProofName?.trim() || 'Comprovante pagamento'}
        label="Baixar comprovante"
      />
    );
  }

  const fromLast = lastPaidInstallmentProofUrl(order);
  if (fromLast) {
    return (
      <OcListDownloadIconLink
        url={fromLast.url}
        fileName={fromLast.name || 'Comprovante pagamento'}
        label="Baixar comprovante"
      />
    );
  }

  return <span className="text-gray-400 dark:text-gray-500">Não anexado</span>;
}

function OcListNfCellContent({ order }: { order: PurchaseOrder }) {
  const nfs = parseOcNfAttachments(order.nfAttachments);
  if (nfs.length === 0) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }
  if (nfs.length === 1) {
    return (
      <OcListDownloadIconLink
        url={nfs[0].url}
        fileName={
          nfs[0].number
            ? `NF ${nfs[0].number}`
            : nfs[0].name?.trim() || 'Nota fiscal'
        }
        label="Baixar NF"
      />
    );
  }
  return (
    <div className="mx-auto flex max-w-[11rem] flex-col items-center gap-1 text-center">
      {nfs.map((nf, idx) => (
        <div key={`${nf.url}-${idx}`} className="inline-flex items-center justify-center gap-1">
          <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">{idx + 1}:</span>
          <OcListDownloadIconLink
            url={nf.url}
            fileName={nf.name?.trim() || `NF ${idx + 1}`}
            label="Baixar NF"
          />
        </div>
      ))}
    </div>
  );
}

export type OcPurchaseOrdersPanelProps = {
  /** Quando true, painel integrado ao fluxo SC/RM (mesma página). */
  embedded?: boolean;
  /** Esconde a barra de abas interna (abas unificadas na página pai). */
  hideTabs?: boolean;
  /** Aba OC ativa quando `hideTabs` (controlado pelo pai). */
  activeTab?: OcTab;
  /** Busca textual aplicada na listagem de OCs. */
  searchTerm?: string;
  /** Quando informado, exibe o campo de busca no cabeçalho do card (modo integrado). */
  onSearchChange?: (value: string) => void;
  /** Busca global no pai — oculta o campo duplicado no card. */
  hideSearch?: boolean;
  /** Card colado às abas do fluxo (sem borda/sombra superior). */
  flushInCard?: boolean;
  /**
   * Fase gestor na tela de Aprovações: limita OCs ao centro de custo dos contratos do gestor.
   * `undefined` = sem filtro (admin). `[]` = nenhum contrato vinculado.
   */
  gestorCostCenterIds?: string[];
  /** Habilita aprovar/reprovar/correção nas fases Compras, Gestor e Diretoria (tela de Aprovações). */
  allowApprovalActions?: boolean;
};

const normalizeOcSearch = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const EMBEDDED_OC_TAB_META: Record<OcTab, { title: string; subtitle: string }> = {
  compras: {
    title: 'Aprovação Compras',
    subtitle: 'Ordens aguardando aprovação do setor de compras'
  },
  gestor: {
    title: 'Aprovação Gestor',
    subtitle: 'Ordens aguardando aprovação do gestor'
  },
  diretoria: {
    title: 'Aprovação Diretoria',
    subtitle: 'Ordens aguardando aprovação da diretoria'
  },
  IN_REVIEW: {
    title: 'Correção',
    subtitle: 'Ordens devolvidas para correção antes de seguir no fluxo'
  },
  APPROVED: {
    title: 'Pagamento',
    subtitle: 'Anexe comprovante, gere CNAB se necessário e envie para validação'
  },
  ATTACH_BOLETO: {
    title: 'Anexar Boleto',
    subtitle: 'OCs aprovadas em boleto aguardando anexo para pagamento'
  },
  PROOF_VALIDATION: {
    title: 'Validação Comprovante',
    subtitle: 'Comprovantes enviados aguardando validação do financeiro'
  },
  PROOF_CORRECTION: {
    title: 'Correção Comprovante',
    subtitle: 'Substitua o comprovante e reenvie para validação'
  },
  ATTACH_NF: {
    title: 'Anexar NF',
    subtitle: 'Após comprovante validado, anexe a nota fiscal e finalize'
  },
  FINALIZADAS: {
    title: 'Finalizadas',
    subtitle: 'Histórico de ordens que concluíram o fluxo'
  },
  outras: {
    title: 'Canceladas',
    subtitle: 'Ordens canceladas'
  }
};

const OC_ACTION_MENU_WIDTH_PX = 224;
const OC_ACTION_MENU_MAX_HEIGHT_PX = 360;
const OC_ACTION_MENU_GAP_PX = 4;
const OC_ACTION_MENU_VIEWPORT_PAD_PX = 8;
const OC_ACTION_MENU_MIN_HEIGHT_PX = 96;

type OcActionMenuCoords = {
  top: number;
  left: number;
  maxHeight: number;
  placement: 'below' | 'above';
};

function computeOcActionMenuPosition(rect: DOMRect): OcActionMenuCoords {
  let left = rect.right - OC_ACTION_MENU_WIDTH_PX;
  left = Math.max(
    OC_ACTION_MENU_VIEWPORT_PAD_PX,
    Math.min(left, window.innerWidth - OC_ACTION_MENU_WIDTH_PX - OC_ACTION_MENU_VIEWPORT_PAD_PX)
  );

  const spaceBelow =
    window.innerHeight - rect.bottom - OC_ACTION_MENU_GAP_PX - OC_ACTION_MENU_VIEWPORT_PAD_PX;
  const spaceAbove = rect.top - OC_ACTION_MENU_GAP_PX - OC_ACTION_MENU_VIEWPORT_PAD_PX;

  if (spaceBelow >= OC_ACTION_MENU_MIN_HEIGHT_PX || spaceBelow >= spaceAbove) {
    return {
      top: rect.bottom + OC_ACTION_MENU_GAP_PX,
      left,
      maxHeight: Math.min(OC_ACTION_MENU_MAX_HEIGHT_PX, Math.max(spaceBelow, OC_ACTION_MENU_MIN_HEIGHT_PX)),
      placement: 'below'
    };
  }

  return {
    top: rect.top - OC_ACTION_MENU_GAP_PX,
    left,
    maxHeight: Math.min(OC_ACTION_MENU_MAX_HEIGHT_PX, Math.max(spaceAbove, OC_ACTION_MENU_MIN_HEIGHT_PX)),
    placement: 'above'
  };
}

const OC_MENU_ITEM_CLASS =
  'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700';

const OC_APPROVAL_FLOW_STATUSES = ['DRAFT', 'PENDING_COMPRAS', 'PENDING', 'PENDING_DIRETORIA'] as const;

export type OcApprovalListPhase = 'pending' | 'approved_by_me' | 'rejected' | 'all';

const OC_APPROVAL_STAT_CARDS: ApprovalPhaseStatCard<OcApprovalListPhase>[] = [
  {
    filter: 'pending',
    label: 'Pendentes',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    Icon: Clock,
  },
  {
    filter: 'approved_by_me',
    label: 'Aprovadas',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
  },
  {
    filter: 'rejected',
    label: 'Canceladas',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: XCircle,
  },
  {
    filter: 'all',
    label: 'Todos',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: LayoutList,
  },
];

const OC_APPROVAL_TABS: OcTab[] = ['compras', 'gestor', 'diretoria'];

function isOcApprovalTab(tab: OcTab): boolean {
  return OC_APPROVAL_TABS.includes(tab);
}

function orderApprovedByUserAtTab(order: PurchaseOrder, tab: OcTab, userId: string): boolean {
  if (tab === 'compras') return order.comprasApprovedBy === userId;
  if (tab === 'gestor') return order.gestorApprovedBy === userId;
  if (tab === 'diretoria') return order.approvedBy === userId;
  return false;
}

function applyOcGestorCostCenterScope(
  list: PurchaseOrder[],
  gestorCostCenterIds: string[] | undefined,
): PurchaseOrder[] {
  if (gestorCostCenterIds === undefined) return list;
  const allowed = new Set(gestorCostCenterIds);
  return list.filter((o) => {
    const ccId = o.materialRequest?.costCenter?.id;
    return ccId ? allowed.has(ccId) : false;
  });
}

function pendingOrdersForOcApprovalTab(allOrders: PurchaseOrder[], tab: OcTab): PurchaseOrder[] {
  if (tab === 'compras') {
    return allOrders.filter((o) => o.status === 'PENDING_COMPRAS' || o.status === 'DRAFT');
  }
  if (tab === 'gestor') {
    return allOrders.filter((o) => o.status === 'PENDING');
  }
  if (tab === 'diretoria') {
    return allOrders.filter((o) => o.status === 'PENDING_DIRETORIA');
  }
  return [];
}

function ordersForOcApprovalListPhase(
  allOrders: PurchaseOrder[],
  tab: OcTab,
  phase: OcApprovalListPhase,
  currentUserId: string | undefined,
  gestorCostCenterIds: string[] | undefined,
): PurchaseOrder[] {
  if (!isOcApprovalTab(tab)) return allOrders;

  const pending = pendingOrdersForOcApprovalTab(allOrders, tab);
  const approved =
    currentUserId
      ? allOrders.filter((o) => orderApprovedByUserAtTab(o, tab, currentUserId))
      : [];
  const rejected = allOrders.filter((o) => o.status === 'REJECTED');

  let list: PurchaseOrder[];
  if (phase === 'approved_by_me') list = approved;
  else if (phase === 'rejected') list = rejected;
  else if (phase === 'all') {
    const byId = new Map<string, PurchaseOrder>();
    for (const order of [...pending, ...approved, ...rejected]) {
      byId.set(order.id, order);
    }
    list = Array.from(byId.values());
  } else {
    list = pending;
  }

  return tab === 'gestor' ? applyOcGestorCostCenterScope(list, gestorCostCenterIds) : list;
}

export function OcStyledCheckbox({
  checked,
  onChange,
  ariaLabel,
  title
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <label
      className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center group"
      title={title}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
        className="sr-only"
      />
      <span
        className={`box-border flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors duration-200 ${
          checked
            ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
            : 'border-gray-300 bg-white group-hover:border-red-500 dark:border-gray-600 dark:bg-gray-800 dark:group-hover:border-red-400'
        }`}
      >
        <svg
          className={`h-3 w-3 shrink-0 text-white transition-opacity duration-200 ${
            checked ? 'opacity-100' : 'opacity-0'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    </label>
  );
}

function embeddedOcEmptyMessage(
  tab: OcTab,
  hasSearch: boolean,
  approvalListPhase: OcApprovalListPhase,
  hasPaymentDueDateFilter = false,
): string {
  if (hasSearch) return 'Nenhuma ordem corresponde à busca nesta fase';
  if (hasPaymentDueDateFilter && tab === 'APPROVED') {
    return 'Nenhuma OC com vencimento no período selecionado';
  }
  if (approvalListPhase === 'approved_by_me') {
    return 'Nenhuma ordem que você tenha aprovado nesta fase.';
  }
  if (approvalListPhase === 'rejected') {
    return 'Nenhuma ordem cancelada.';
  }
  if (approvalListPhase === 'all') {
    return 'Nenhuma ordem nesta fase.';
  }
  if (tab === 'FINALIZADAS') return 'Nenhuma OC finalizada com os filtros atuais';
  if (tab === 'ATTACH_BOLETO') return 'Nenhuma OC aguardando anexo de boleto';
  if (tab === 'PROOF_VALIDATION') return 'Nenhuma OC aguardando validação do comprovante';
  if (tab === 'PROOF_CORRECTION') return 'Nenhuma OC em correção do comprovante';
  if (tab === 'ATTACH_NF') return 'Nenhuma OC na fase de anexar NF';
  if (tab === 'compras') return 'Nenhuma ordem aguardando aprovação de compras';
  return 'Nenhuma ordem de compra nesta fase';
}

function approvalTabSubtitle(tab: OcTab, phase: OcApprovalListPhase): string {
  if (phase === 'approved_by_me') {
    return 'Ordens que você já aprovou nesta fase';
  }
  if (phase === 'rejected') {
    return 'Ordens canceladas no fluxo de aprovação';
  }
  if (phase === 'all') {
    return 'Pendentes, aprovadas por você e canceladas nesta visão';
  }
  return EMBEDDED_OC_TAB_META[tab].subtitle;
}

export function OcPurchaseOrdersPanel({
  embedded = false,
  hideTabs = false,
  activeTab: activeTabProp,
  searchTerm = '',
  onSearchChange,
  hideSearch = false,
  flushInCard = false,
  gestorCostCenterIds,
  allowApprovalActions = false
}: OcPurchaseOrdersPanelProps) {
  const queryClient = useQueryClient();
  const {
    isAdministrator,
    canApproveOcCompras,
    canApproveOcGestor,
    canApproveOcDiretoria,
    canActOcAttachBoleto,
    canActOcPayment,
    canActOcValidateProof,
    canActOcProofCorrection,
    canActOcAttachNf,
    canActOcCorrection,
    canReturnOcItemToRmPermission,
    dpApprovalContractIds,
    gestorCostCenterIds: permissionGestorCostCenterIds,
    ocGestorScopedCostCenterIds,
  } = usePermissions();
  /** Ações de aprovação só quando a tela pede explicitamente (ex.: página Aprovações). */
  const approvalActionsEnabled = allowApprovalActions;
  const canActOnOcApproval = (status: string) =>
    canActOnOcApprovalStatus(status, {
      isAdministrator,
      canApproveOcCompras,
      canApproveOcGestor,
      canApproveOcDiretoria
    });
  const showOcApprovalActions = (status: string) =>
    OC_APPROVAL_FLOW_STATUSES.includes(status as (typeof OC_APPROVAL_FLOW_STATUSES)[number]) &&
    canActOnOcApproval(status);
  const [approvalListPhase, setApprovalListPhase] = useState<OcApprovalListPhase>('pending');
  const [isApprovalFiltersModalOpen, setIsApprovalFiltersModalOpen] = useState(false);
  const [internalActiveTab, setInternalActiveTab] = useState<OcTab>('compras');
  const activeTab = hideTabs ? (activeTabProp ?? 'compras') : internalActiveTab;
  const setActiveTab = (t: OcTab) => {
    if (!hideTabs) setInternalActiveTab(t);
  };
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [ocDetailTab, setOcDetailTab] = useState<OcDetailModalTab>('resumo');
  const ocDetailScrollRef = useRef<HTMLDivElement>(null);
  const lastOcDetailOrderIdRef = useRef<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PurchaseOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [correctionTarget, setCorrectionTarget] = useState<PurchaseOrder | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [returnItemTarget, setReturnItemTarget] = useState<{
    orderId: string;
    item: NonNullable<PurchaseOrder['items']>[number];
  } | null>(null);
  const [returnItemReason, setReturnItemReason] = useState('');
  const [pdfExportingId, setPdfExportingId] = useState<string | null>(null);
  const [showEditOcModal, setShowEditOcModal] = useState(false);

  const closeSelectedOrder = useCallback(() => {
    setSelectedOrder(null);
  }, []);
  const {
    requestClose: requestCloseSelectedOrder,
    confirmUi: selectedOrderConfirmUi,
  } = useModalCloseConfirm(closeSelectedOrder, {
    isParentOpen: !!selectedOrder && !showEditOcModal && !correctionTarget,
  });

  const closeEditOc = useCallback(() => {
    setShowEditOcModal(false);
  }, []);
  const { requestClose: requestCloseEditOc, confirmUi: editOcConfirmUi } = useModalCloseConfirm(
    closeEditOc,
    { isParentOpen: showEditOcModal }
  );

  const [orderDetailLoadingId, setOrderDetailLoadingId] = useState<string | null>(null);
  const [cnabSelectedIds, setCnabSelectedIds] = useState<Set<string>>(() => new Set());
  const [cnabGenerating, setCnabGenerating] = useState(false);
  const [financialEntryOrder, setFinancialEntryOrder] = useState<PurchaseOrder | null>(null);
  const [ocActionMenu, setOcActionMenu] = useState<
    ({ orderId: string } & OcActionMenuCoords) | null
  >(null);
  const [proofFileDraft, setProofFileDraft] = useState<File | null>(null);
  const [financialEntryModalOpen, setFinancialEntryModalOpen] = useState(false);
  const [editingFinancialEntry, setEditingFinancialEntry] = useState<FinancialControlEntry | null>(null);
  const [nfFileDraft, setNfFileDraft] = useState<File | null>(null);
  const [nfNumberDraft, setNfNumberDraft] = useState('');
  const [installmentProofFileDraft, setInstallmentProofFileDraft] = useState<File | null>(null);
  const [installmentProofDraftByIdx, setInstallmentProofDraftByIdx] = useState<Record<number, File | null>>(
    {}
  );
  const [boletoParcelModalOrder, setBoletoParcelModalOrder] = useState<PurchaseOrder | null>(null);
  const [finalizedPage, setFinalizedPage] = useState(1);
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const [isFinalizedFiltersModalOpen, setIsFinalizedFiltersModalOpen] = useState(false);
  const [isPaymentDueFiltersModalOpen, setIsPaymentDueFiltersModalOpen] = useState(false);
  const [exportingFinalizedCsv, setExportingFinalizedCsv] = useState(false);
  const emptyFinalizedFilters = {
    orderDateFrom: '',
    orderDateTo: '',
    supplierId: '',
    costCenterId: ''
  };
  const emptyPaymentDueFilters = {
    dueDateFrom: '',
    dueDateTo: ''
  };
  const [finalizedFilters, setFinalizedFilters] = useState(emptyFinalizedFilters);
  const [paymentDueFilters, setPaymentDueFilters] = useState(emptyPaymentDueFilters);

  const effectiveSearchTerm = onSearchChange ? searchTerm : internalSearchTerm;
  const setEffectiveSearchTerm = (value: string) => {
    if (onSearchChange) onSearchChange(value);
    else setInternalSearchTerm(value);
  };

  const hasActiveFinalizedFilters = Boolean(
    finalizedFilters.orderDateFrom ||
      finalizedFilters.orderDateTo ||
      finalizedFilters.supplierId ||
      finalizedFilters.costCenterId
  );

  const hasActivePaymentDueFilters = Boolean(
    paymentDueFilters.dueDateFrom || paymentDueFilters.dueDateTo
  );

  const clearFinalizedFilters = () => {
    setFinalizedFilters(emptyFinalizedFilters);
    setFinalizedPage(1);
  };

  const clearPaymentDueFilters = () => {
    setPaymentDueFilters(emptyPaymentDueFilters);
  };

  useEffect(() => {
    if (activeTab !== 'APPROVED') {
      setCnabSelectedIds(new Set());
      clearPaymentDueFilters();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'FINALIZADAS') {
      setFinalizedPage(1);
    }
  }, [activeTab, effectiveSearchTerm, finalizedFilters]);

  useEffect(() => {
    setProofFileDraft(null);
    setNfFileDraft(null);
    setNfNumberDraft('');
    setInstallmentProofFileDraft(null);
    setInstallmentProofDraftByIdx({});

    const orderId = selectedOrder?.id ?? null;
    if (!orderId) {
      lastOcDetailOrderIdRef.current = null;
      setOcDetailTab('resumo');
      return;
    }
    if (lastOcDetailOrderIdRef.current !== orderId) {
      lastOcDetailOrderIdRef.current = orderId;
      setOcDetailTab(defaultOcDetailModalTab(selectedOrder?.status ?? ''));
    }
  }, [selectedOrder?.id]);

  useEffect(() => {
    ocDetailScrollRef.current?.scrollTo({ top: 0 });
  }, [ocDetailTab, selectedOrder?.id]);

  const [editOcForm, setEditOcForm] = useState<OcPurchaseOrderFormValues | null>(null);
  const [editSupplierSearch, setEditSupplierSearch] = useState('');

  const toDateInputValue = (d?: string | null) => {
    if (!d) return '';
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    return x.toISOString().slice(0, 10);
  };

  const parseMoneyInput = (value: string): number | null => {
    const t = value.trim();
    if (!t) return null;
    const fromMask = parseCurrencyInputBr(t);
    if (fromMask !== null) return fromMask;
    const cleaned = t.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
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
  const currentUserId = userData?.data?.id as string | undefined;

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['purchase-orders', 'list-summary'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500, summary: '1' } });
      return res.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });

  const { data: selectedOrderFresh } = useQuery({
    queryKey: ['purchase-order-detail', selectedOrder?.id],
    queryFn: async () => {
      const res = await api.get(`/purchase-orders/${selectedOrder!.id}`);
      return res.data?.data as PurchaseOrder | undefined;
    },
    enabled: !!selectedOrder?.id,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  });

  useEffect(() => {
    if (!selectedOrderFresh || selectedOrderFresh.id !== selectedOrder?.id) return;
    setSelectedOrder((prev) => {
      if (!prev || prev.id !== selectedOrderFresh.id) return selectedOrderFresh;
      // Mantém anexos/estado local mais novo se o cache de detalhe ainda estiver atrasado.
      const prevUpdated = prev.updatedAt ? Date.parse(prev.updatedAt) : 0;
      const freshUpdated = selectedOrderFresh.updatedAt
        ? Date.parse(selectedOrderFresh.updatedAt)
        : 0;
      const preferLocalPhase =
        Number.isFinite(prevUpdated) &&
        Number.isFinite(freshUpdated) &&
        prevUpdated > freshUpdated &&
        prev.status !== selectedOrderFresh.status;
      return {
        ...selectedOrderFresh,
        ...(preferLocalPhase
          ? { status: prev.status, updatedAt: prev.updatedAt }
          : {}),
        stockReceipt: prev.stockReceipt ?? selectedOrderFresh.stockReceipt,
        paymentProofUrl: prev.paymentProofUrl || selectedOrderFresh.paymentProofUrl,
        paymentProofName: prev.paymentProofName || selectedOrderFresh.paymentProofName,
        paymentBoletoUrl: prev.paymentBoletoUrl || selectedOrderFresh.paymentBoletoUrl,
        paymentBoletoName: prev.paymentBoletoName || selectedOrderFresh.paymentBoletoName,
        paymentBoletoInstallments:
          prev.paymentBoletoInstallments ?? selectedOrderFresh.paymentBoletoInstallments,
        paymentBoletoPhaseReleased:
          prev.paymentBoletoPhaseReleased ?? selectedOrderFresh.paymentBoletoPhaseReleased,
        paymentParcelCount: prev.paymentParcelCount ?? selectedOrderFresh.paymentParcelCount,
        nfAttachments: prev.nfAttachments ?? selectedOrderFresh.nfAttachments,
      };
    });
  }, [selectedOrderFresh, selectedOrder?.id]);

  const { data: selectedOrderStockReceipt, isFetching: isFetchingStockReceipt } = useQuery({
    queryKey: ['purchase-order-stock-receipt', selectedOrder?.id],
    queryFn: async () => {
      const res = await api.get(`/purchase-orders/${selectedOrder!.id}/stock-receipt`);
      return res.data?.data as PurchaseOrder['stockReceipt'];
    },
    enabled: !!selectedOrder?.id,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  });

  useEffect(() => {
    if (!selectedOrder?.id || selectedOrderStockReceipt === undefined) return;
    setSelectedOrder((prev) => {
      if (!prev || prev.id !== selectedOrder.id) return prev;
      return { ...prev, stockReceipt: selectedOrderStockReceipt };
    });
  }, [selectedOrder?.id, selectedOrderStockReceipt]);

  const nfNumberDraftKey = normalizeOcNfNumberKey(nfNumberDraft);
  const nfDuplicateOnThisOrder =
    !!selectedOrder &&
    !!nfNumberDraftKey &&
    orderAlreadyHasNfNumber(selectedOrder, nfNumberDraft);
  const { data: nfNumberAvailability } = useQuery({
    queryKey: ['purchase-orders', 'check-nf-number', nfNumberDraftKey, selectedOrder?.id],
    queryFn: async () => {
      const res = await api.get('/purchase-orders/check-nf-number', {
        params: {
          nfNumber: nfNumberDraft.trim(),
          excludeId: selectedOrder!.id
        }
      });
      return res.data?.data as { available: boolean; conflictOrderNumber?: string };
    },
    enabled:
      !!selectedOrder?.id &&
      !!nfNumberDraftKey &&
      !nfDuplicateOnThisOrder &&
      selectedOrder.status === 'PENDING_NF_ATTACHMENT',
    staleTime: 15_000,
    refetchOnWindowFocus: false
  });
  const nfConflictOtherOrder =
    nfNumberAvailability && nfNumberAvailability.available === false
      ? nfNumberAvailability.conflictOrderNumber || null
      : null;
  const nfNumberConflict = nfDuplicateOnThisOrder || !!nfConflictOtherOrder;
  const nfNumberConflictMessage = nfDuplicateOnThisOrder
    ? 'Esta nota fiscal já está anexada nesta OC.'
    : nfConflictOtherOrder
      ? `Nota fiscal já existe na OC ${formatOcListDisplayId(nfConflictOtherOrder)}.`
      : null;

  /** Precisa estar ativo na listagem: Status de entrega some ao fechar o detalhe se a query depender do selectedOrder. */
  const { data: stockMovementsData } = useQuery({
    queryKey: ['stock-movements-oc-tags'],
    queryFn: async () => {
      const res = await api.get('/stock/movements', { params: { limit: 1000 } });
      return res.data;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });

  const shouldTrackFinancialEntryForOc =
    !!selectedOrder?.orderNumber?.trim() &&
    (selectedOrder.status === 'APPROVED' || selectedOrder.status === 'PENDING_PROOF_CORRECTION');

  const { data: financialEntriesByOc = [], isFetching: financialEntriesLoading } = useQuery({
    queryKey: ['financial-control-by-oc', selectedOrder?.orderNumber],
    queryFn: async () => {
      const res = await api.get(
        `/financial-control/by-oc/${encodeURIComponent(selectedOrder!.orderNumber)}`
      );
      return (res.data?.data || []) as FinancialControlEntry[];
    },
    enabled: shouldTrackFinancialEntryForOc,
  });

  const hasFinancialEntryForOc = financialEntriesByOc.length > 0;

  /**
   * Coluna Ações / Devolver à RM: admin ou permissão Controle «Devolver item da OC à RM».
   * Em APPROVED (Anexar boleto / Pagamento): some se já houver lançamento financeiro.
   */
  const canReturnOcItemOnOrder = (order: PurchaseOrder) => {
    const hasLaunch =
      order.id === selectedOrder?.id ? hasFinancialEntryForOc : false;
    const launchLoading =
      order.id === selectedOrder?.id &&
      order.status === 'APPROVED' &&
      financialEntriesLoading;
    if (launchLoading) return false;
    if (!canReturnOcItemToRm(order.status, { hasFinancialEntry: hasLaunch })) return false;
    return canReturnOcItemToRmPermission;
  };

  const hasFinancialEntryForCurrentProofInstallment = useMemo(() => {
    if (!selectedOrder || !hasFinancialEntryForOc) return false;
    if (
      !isOcBoletoPaymentType(selectedOrder.paymentType) ||
      (selectedOrder.paymentParcelCount ?? 1) <= 1
    ) {
      return true;
    }
    const idx = visiblePaymentBoletoInstallmentIndex(selectedOrder);
    if (idx == null) return false;
    const rows = parsePaymentBoletoInstallments(selectedOrder.paymentBoletoInstallments);
    return hasFinancialEntryForOcInstallment(financialEntriesByOc, {
      installmentIndex: idx,
      parcelCount: selectedOrder.paymentParcelCount ?? 1,
      installmentDueDate: rows[idx]?.dueDate
    });
  }, [selectedOrder, hasFinancialEntryForOc, financialEntriesByOc]);

  const canSubmitProofValidation =
    !!selectedOrder &&
    !financialEntriesLoading &&
    canSubmitProofValidationWithFinancialEntry(
      selectedOrder,
      isOcBoletoPaymentType(selectedOrder.paymentType) &&
        (selectedOrder.paymentParcelCount ?? 1) > 1
        ? hasFinancialEntryForCurrentProofInstallment
        : hasFinancialEntryForOc
    );

  const canClickSubmitProofValidation =
    (isOcBoletoPaymentType(selectedOrder?.paymentType) &&
    (selectedOrder?.paymentParcelCount ?? 1) > 1
      ? hasFinancialEntryForCurrentProofInstallment
      : hasFinancialEntryForOc) &&
    !financialEntriesLoading &&
    canSubmitProofValidation;

  const approveMutation = useMutation({
    mutationFn: async ({
      id,
      currentStatus,
      unbOnlyGestor
    }: {
      id: string;
      currentStatus: string;
      unbOnlyGestor?: boolean;
    }) => {
      const nextStatus = nextApprovalStatus(currentStatus, !!unbOnlyGestor);
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: nextStatus });
      return res.data;
    },
    onMutate: async ({ id, currentStatus, unbOnlyGestor }) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary'
      ]);
      patchOcInListSummaryCache(
        queryClient,
        id,
        approvalOptimisticPatch(currentStatus, currentUserId, !!unbOnlyGestor)
      );
      setSelectedOrder(null);
      setOcActionMenu(null);
      const toastId = `oc-approve-${id}`;
      if (unbOnlyGestor && currentStatus === 'PENDING') {
        toast.success('OC UNB aprovada pelo gestor.', { id: toastId });
      } else if (currentStatus === 'PENDING_DIRETORIA') {
        toast.success('OC aprovada pela diretoria.', { id: toastId });
      } else if (currentStatus === 'PENDING') {
        toast.success('OC enviada para aprovação da diretoria.', { id: toastId });
      } else {
        toast.success('OC aprovada pelo compras e enviada para aprovação do gestor.', { id: toastId });
      }
      return { previous, toastId };
    },
    onSuccess: (data) => {
      const updated = data?.data as PurchaseOrder | undefined;
      if (updated?.id) {
        patchOcInListSummaryCache(queryClient, updated.id, (order) => ({
          ...order,
          status: updated.status ?? order.status,
          comprasApprovedBy: updated.comprasApprovedBy ?? order.comprasApprovedBy,
          gestorApprovedBy: updated.gestorApprovedBy ?? order.gestorApprovedBy,
          approvedBy: updated.approvedBy ?? order.approvedBy
        }));
      }
      invalidateOcAndLinkedRmQueries(queryClient);
    },
    onError: (error: { response?: { data?: { message?: string } } }, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      toast.error(error.response?.data?.message || 'Erro ao aprovar', {
        id: context?.toastId
      });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, {
        status: 'REJECTED',
        rejectionReason: reason
      });
      return res.data;
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary'
      ]);
      patchOcInListSummaryCache(queryClient, id, { status: 'REJECTED' });
      setRejectTarget(null);
      setRejectReason('');
      setSelectedOrder(null);
      setOcActionMenu(null);
      const toastId = `oc-reject-${id}`;
      toast.success('Ordem de compra cancelada.', { id: toastId });
      return { previous, toastId };
    },
    onSuccess: () => {
      invalidateOcAndLinkedRmQueries(queryClient);
    },
    onError: (error: { response?: { data?: { message?: string } } }, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      toast.error(error.response?.data?.message || 'Erro ao cancelar', {
        id: context?.toastId
      });
    }
  });

  const returnItemToRmMutation = useMutation({
    mutationFn: async ({
      orderId,
      itemId,
      reason,
    }: {
      orderId: string;
      itemId: string;
      reason: string;
    }) => {
      const res = await api.post(`/purchase-orders/${orderId}/items/${itemId}/return-to-rm`, {
        reason,
      });
      return res.data;
    },
    onSuccess: (data) => {
      const updated = data?.data as PurchaseOrder | undefined;
      const cancelledLastItem =
        updated?.status === 'CANCELLED' || (updated?.items?.length ?? 0) === 0;
      setReturnItemTarget(null);
      setReturnItemReason('');
      if (cancelledLastItem) {
        setSelectedOrder(null);
        toast.success('Item devolvido à RM e OC cancelada. Pode refazer o mapa de cotação.');
      } else if (updated?.id) {
        setSelectedOrder(updated);
        queryClient.setQueryData(['purchase-order-detail', updated.id], updated);
        toast.success('Item devolvido à RM. Pode refazer o mapa de cotação só com esse item.');
      } else {
        toast.success('Item devolvido à RM. Pode refazer o mapa de cotação só com esse item.');
      }
      invalidateOcAndLinkedRmQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['material-requests-approved-map'] });
      queryClient.invalidateQueries({ queryKey: ['material-request-detail'] });
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Erro ao devolver item à RM');
    },
  });

  const openOcCorrectionModal = (order: PurchaseOrder) => {
    setCorrectionReason('');
    setCorrectionTarget(order);
  };

  const correctionOcMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, {
        status: 'IN_REVIEW',
        rejectionReason: reason
      });
      return res.data;
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary'
      ]);
      patchOcInListSummaryCache(queryClient, id, { status: 'IN_REVIEW' });
      setCorrectionTarget(null);
      setCorrectionReason('');
      setSelectedOrder(null);
      setOcActionMenu(null);
      const toastId = `oc-correction-${id}`;
      toast.success('OC enviada para CORREÇÃO OC.', { id: toastId });
      return { previous, toastId };
    },
    onSuccess: () => {
      invalidateOcAndLinkedRmQueries(queryClient);
    },
    onError: (error: { response?: { data?: { message?: string } } }, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      toast.error(error.response?.data?.message || 'Erro ao enviar para correção', {
        id: context?.toastId
      });
    }
  });

  const resubmitOcMutation = useMutation({
    mutationFn: async (order: Pick<PurchaseOrder, 'id'> & {
      materialRequest?: PurchaseOrder['materialRequest'];
    }) => {
      // UNB volta direto para o gestor; demais CCs para compras.
      const status = isOcUnbCostCenter(order) ? 'PENDING' : 'PENDING_COMPRAS';
      const res = await api.patch(`/purchase-orders/${order.id}/status`, { status });
      return res.data;
    },
    onSuccess: () => {
      invalidateOcAndLinkedRmQueries(queryClient);
      setSelectedOrder(null);
      toast.success('OC enviada para aprovação.');
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
      invalidateOcAndLinkedRmQueries(queryClient);
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
      return {
        data: res.data?.data as PurchaseOrder | undefined,
        uploadedUrl: url,
        uploadedName: originalName
      };
    },
    onSuccess: (resp, vars) => {
      const updated = resp?.data;
      const id = updated?.id ?? vars.id;
      applyOcLocalPatch(queryClient, setSelectedOrder, id, {
        paymentBoletoUrl: updated?.paymentBoletoUrl ?? resp.uploadedUrl,
        paymentBoletoName: updated?.paymentBoletoName ?? resp.uploadedName ?? null,
        paymentBoletoInstallments: updated?.paymentBoletoInstallments,
        paymentBoletoPhaseReleased: updated?.paymentBoletoPhaseReleased,
        updatedAt: updated?.updatedAt
      });
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
      return {
        data: res.data?.data as PurchaseOrder | undefined,
        uploadedUrl: url,
        uploadedName: originalName
      };
    },
    onSuccess: (resp, vars) => {
      const updated = resp?.data;
      const id = updated?.id ?? vars.id;
      // Só patcheia campos de pagamento — resposta ListSummary não pode apagar o detalhe local.
      applyOcLocalPatch(queryClient, setSelectedOrder, id, {
        paymentProofUrl: updated?.paymentProofUrl ?? resp.uploadedUrl,
        paymentProofName: updated?.paymentProofName ?? resp.uploadedName ?? null,
        paymentBoletoInstallments: updated?.paymentBoletoInstallments,
        updatedAt: updated?.updatedAt
      });
      setProofFileDraft(null);
      toast.success('Comprovante de pagamento anexado.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao anexar comprovante')
  });
  const releasePaymentBoletoPhaseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/release-payment-boleto-phase`);
      return res.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary',
      ]);
      patchOcInListSummaryCache(queryClient, id, {
        paymentBoletoPhaseReleased: true,
        updatedAt: new Date().toISOString(),
      });
      setSelectedOrder(null);
      setOcActionMenu(null);
      setBoletoParcelModalOrder((prev) => (prev?.id === id ? null : prev));
      return { previous };
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      const updated = resp?.data;
      if (updated?.id) {
        applyOcLocalPatch(queryClient, setSelectedOrder, updated.id, {
          paymentBoletoPhaseReleased: true,
          paymentBoletoInstallments: updated.paymentBoletoInstallments,
          paymentBoletoUrl: updated.paymentBoletoUrl,
          paymentBoletoName: updated.paymentBoletoName,
          updatedAt: updated.updatedAt
        });
      }
      toast.success('OC enviada para a fase Pagamento.');
    },
    onError: (
      error: { response?: { data?: { message?: string } }; message?: string },
      _id,
      context
    ) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      toast.error(error.response?.data?.message || error.message || 'Erro ao confirmar fase Pagamento');
    },
  });

  const attachBoletoInstallmentProofMutation = useMutation({
    mutationFn: async ({
      id,
      file,
      installmentIndex
    }: {
      id: string;
      file: File;
      installmentIndex: number;
    }) => {
      const fd = new FormData();
      fd.append('proof', file);
      const up = await api.post('/purchase-orders/upload-payment-proof', fd);
      const url = up.data?.data?.url as string | undefined;
      const originalName = up.data?.data?.originalName as string | undefined;
      if (!url) throw new Error('Resposta inválida do upload');
      const res = await api.patch(`/purchase-orders/${id}/payment-boleto-installment-proof`, {
        paymentProofUrl: url,
        paymentProofName: originalName,
        installmentIndex
      });
      return {
        data: res.data?.data as PurchaseOrder | undefined,
        uploadedUrl: url,
        uploadedName: originalName
      };
    },
    onSuccess: (resp, vars) => {
      const updated = resp?.data;
      const id = updated?.id ?? vars.id;
      const patch: Partial<PurchaseOrder> = {
        paymentBoletoPhaseReleased:
          updated?.paymentBoletoPhaseReleased ?? true,
        updatedAt: updated?.updatedAt
      };
      if (updated?.paymentBoletoInstallments != null) {
        patch.paymentBoletoInstallments = updated.paymentBoletoInstallments;
      } else if (resp.uploadedUrl) {
        // Fallback: marca o comprovante na parcela local se a resposta veio incompleta.
        const current =
          queryClient.getQueryData<PurchaseOrder>(['purchase-order-detail', id]) ||
          (
            queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
              'purchase-orders',
              'list-summary'
            ])?.data || []
          ).find((o) => o.id === id);
        if (current?.paymentBoletoInstallments) {
          const rows = parsePaymentBoletoInstallments(current.paymentBoletoInstallments);
          patch.paymentBoletoInstallments = rows.map((row, j) =>
            j === vars.installmentIndex
              ? {
                  ...row,
                  installmentProofUrl: resp.uploadedUrl,
                  installmentProofName: resp.uploadedName ?? null
                }
              : row
          );
        }
      }
      if (updated?.paymentProofUrl) {
        patch.paymentProofUrl = updated.paymentProofUrl;
        patch.paymentProofName = updated.paymentProofName;
      }
      applyOcLocalPatch(queryClient, setSelectedOrder, id, patch);
      if (vars?.installmentIndex != null) {
        setInstallmentProofDraftByIdx((prev) => {
          const next = { ...prev };
          delete next[vars.installmentIndex];
          return next;
        });
      }
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
      const updated = resp?.data;
      if (updated?.id) {
        applyOcLocalPatch(queryClient, setSelectedOrder, updated.id, {
          paymentBoletoInstallments: updated.paymentBoletoInstallments,
          paymentBoletoPhaseReleased: updated.paymentBoletoPhaseReleased,
          paymentProofUrl: updated.paymentProofUrl,
          paymentProofName: updated.paymentProofName,
          updatedAt: updated.updatedAt
        });
      }
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
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      await queryClient.cancelQueries({ queryKey: ['purchase-order-detail', id] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary'
      ]);
      const previousDetail = queryClient.getQueryData<PurchaseOrder>([
        'purchase-order-detail',
        id
      ]);
      const previousSelected =
        selectedOrder?.id === id ? ({ ...selectedOrder } as PurchaseOrder) : null;
      applyOcLocalPatch(queryClient, setSelectedOrder, id, {
        status: 'PENDING_PROOF_VALIDATION'
      });
      setSelectedOrder(null);
      setOcActionMenu(null);
      setInstallmentProofFileDraft(null);
      setInstallmentProofDraftByIdx({});
      setProofFileDraft(null);
      const toastId = `oc-proof-submit-${id}`;
      toast.success('OC enviada para Validação Comprovante.', { id: toastId });
      return { previous, previousDetail, previousSelected, toastId };
    },
    onSuccess: () => {
      invalidateOcAndLinkedRmQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['purchase-order-detail'] });
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }, id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(['purchase-order-detail', id], context.previousDetail);
      }
      if (context?.previousSelected) {
        setSelectedOrder(context.previousSelected);
      }
      toast.error(error.response?.data?.message || error.message || 'Erro ao enviar para validação', {
        id: context?.toastId
      });
    }
  });

  const handleSubmitProofValidation = () => {
    if (!selectedOrder) return;
    submitProofValidationMutation.mutate(selectedOrder.id);
  };

  const requestProofCorrectionMutation = useMutation({
    mutationFn: async ({ id, rejectionReason }: { id: string; rejectionReason?: string }) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, {
        status: 'PENDING_PROOF_CORRECTION',
        rejectionReason: rejectionReason?.trim() || undefined
      });
      return res.data;
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      await queryClient.cancelQueries({ queryKey: ['purchase-order-detail', id] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary'
      ]);
      const previousDetail = queryClient.getQueryData<PurchaseOrder>([
        'purchase-order-detail',
        id
      ]);
      applyOcLocalPatch(queryClient, setSelectedOrder, id, {
        status: 'PENDING_PROOF_CORRECTION'
      });
      setOcActionMenu(null);
      const toastId = `oc-proof-correction-${id}`;
      toast.success('OC enviada para correção do comprovante.', { id: toastId });
      return { previous, previousDetail, toastId };
    },
    onSuccess: () => {
      invalidateOcAndLinkedRmQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['purchase-order-detail'] });
    },
    onError: (
      error: { response?: { data?: { message?: string } }; message?: string },
      { id },
      context
    ) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(['purchase-order-detail', id], context.previousDetail);
      }
      if (context?.previousDetail) {
        setSelectedOrder((prev) =>
          prev?.id === id ? { ...prev, status: context.previousDetail!.status } : prev
        );
      } else if (context?.previous?.data) {
        const rolled = context.previous.data.find((o) => o.id === id);
        if (rolled) {
          setSelectedOrder((prev) => (prev?.id === id ? { ...prev, status: rolled.status } : prev));
        }
      }
      toast.error(error.response?.data?.message || error.message || 'Erro ao solicitar correção', {
        id: context?.toastId
      });
    }
  });

  const validateProofMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: 'PENDING_NF_ATTACHMENT' });
      return res.data;
    },
    onMutate: async (id) => {
      // Não alterar status no cache aqui: boleto parcelado sequencial pode voltar
      // para APPROVED (Anexar Boleto) — um patch otimista para Anexar NF / Pagamento
      // causa flash na aba errada até o refetch.
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary'
      ]);
      setSelectedOrder(null);
      setOcActionMenu(null);
      return { previous, toastId: `oc-proof-validate-${id}` };
    },
    onSuccess: (resp: { data?: PurchaseOrder }, id) => {
      const updated = resp?.data;
      const toastId = `oc-proof-validate-${id}`;
      if (updated?.id) {
        applyOcLocalPatch(queryClient, setSelectedOrder, updated.id, {
          status: updated.status,
          paymentBoletoInstallments: updated.paymentBoletoInstallments,
          paymentBoletoPhaseReleased: updated.paymentBoletoPhaseReleased,
          paymentProofUrl: updated.paymentProofUrl,
          paymentProofName: updated.paymentProofName,
          paymentParcelCount: updated.paymentParcelCount,
        });
        if (updated.status === 'APPROVED') {
          const backToAttachBoleto = showInAttachBoletoTab(updated);
          toast.success(
            backToAttachBoleto
              ? 'Comprovante validado. A OC voltou para a fase Anexar Boleto (próxima parcela).'
              : 'Comprovante validado. Prosiga com a próxima parcela na fase Pagamento.',
            { id: toastId }
          );
        } else if (updated.status === 'PENDING_NF_ATTACHMENT') {
          toast.success('Comprovante validado. A OC foi para a fase Anexar NF.', { id: toastId });
        } else {
          toast.success('Comprovante validado.', { id: toastId });
        }
      } else {
        toast.success('Comprovante validado.', { id: toastId });
      }
      invalidateOcAndLinkedRmQueries(queryClient);
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }, _v, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      toast.error(error.response?.data?.message || error.message || 'Erro ao validar comprovante', {
        id: context?.toastId
      });
    }
  });

  const appendNfMutation = useMutation({
    mutationFn: async ({
      id,
      file,
      nfNumber
    }: {
      id: string;
      file: File;
      nfNumber: string;
    }) => {
      const fd = new FormData();
      fd.append('file', file);
      const up = await api.post('/purchase-orders/upload-nf', fd);
      const url = up.data?.data?.url as string | undefined;
      const originalName = up.data?.data?.originalName as string | undefined;
      if (!url) throw new Error('Resposta inválida do upload');
      const res = await api.patch(`/purchase-orders/${id}/nf-attachments`, {
        nfUrl: url,
        nfName: originalName,
        nfNumber: nfNumber.trim()
      });
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      invalidateOcAndLinkedRmQueries(queryClient);
      const updated = resp?.data;
      if (updated?.id) {
        applyOcLocalPatch(queryClient, setSelectedOrder, updated.id, {
          nfAttachments: updated.nfAttachments
        });
      }
      setNfFileDraft(null);
      setNfNumberDraft('');
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
      invalidateOcAndLinkedRmQueries(queryClient);
      const updated = resp?.data;
      if (updated?.id) {
        applyOcLocalPatch(queryClient, setSelectedOrder, updated.id, {
          nfAttachments: updated.nfAttachments
        });
      }
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
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary'
      ]);
      patchOcInListSummaryCache(queryClient, id, { status: 'FINALIZED' });
      setSelectedOrder(null);
      setOcActionMenu(null);
      const toastId = `oc-finalize-${id}`;
      toast.success('OC finalizada. Ela aparece na aba Finalizadas.', { id: toastId });
      return { previous, toastId };
    },
    onSuccess: () => {
      invalidateOcAndLinkedRmQueries(queryClient);
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }, _v, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      toast.error(error.response?.data?.message || error.message || 'Erro ao finalizar OC', {
        id: context?.toastId
      });
    }
  });

  const allOrders: PurchaseOrder[] = ordersData?.data || [];
  const stockMovementsForOcTag: StockMovementForOcTag[] = stockMovementsData?.data || [];

  const latestOcMovementByOrderNumber = useMemo(() => {
    const grouped = new Map<string, StockMovementForOcTag[]>();

    stockMovementsForOcTag.forEach((mov) => {
      const parsed = parseOcMovementInfoFromNotes(mov.notes);
      if (!parsed?.ocNumber) return;

      const key = normalizeOcNumberKey(parsed.ocNumber);
      const list = grouped.get(key) || [];
      list.push(mov);
      grouped.set(key, list);
    });

    const latestByOc = new Map<string, StockMovementForOcTag>();
    grouped.forEach((movs, key) => {
      const picked = pickRepresentativeOcMovement(movs);
      if (picked) latestByOc.set(key, picked);
    });

    // Detalhe da OC (aba Estoque) já tem o resumo — cobre atraso/falha do fetch de movimentos na lista.
    if (selectedOrder?.orderNumber && selectedOrder.stockReceipt) {
      const key = normalizeOcNumberKey(selectedOrder.orderNumber);
      if (!latestByOc.has(key)) {
        const synth = synthesizeListMovementFromStockReceipt(selectedOrder.stockReceipt);
        if (synth) latestByOc.set(key, synth);
      }
    }

    return latestByOc;
  }, [stockMovementsForOcTag, selectedOrder?.orderNumber, selectedOrder?.stockReceipt]);

  const selectedOrderLatestStockMovement = useMemo(
    () =>
      selectedOrder
        ? latestOcMovementByOrderNumber.get(normalizeOcNumberKey(selectedOrder.orderNumber)) || null
        : null,
    [selectedOrder, latestOcMovementByOrderNumber]
  );

  const selectedOrderStockAttachments = useMemo(
    () => parseStockMovementAttachmentsFromNotes(selectedOrderLatestStockMovement?.notes),
    [selectedOrderLatestStockMovement]
  );

  const selectedOrderInFinancialLaunchPhase = selectedOrder
    ? isOcInFinancialLaunchPhase(selectedOrder)
    : false;

  const tabCounts = useMemo(() => computeOcTabCounts(allOrders), [allOrders]);

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

  const handleExportPdf = async (id: string) => {
    setPdfExportingId(id);
    try {
      const cached =
        selectedOrder?.id === id && selectedOrder.items && selectedOrder.items.length > 0
          ? selectedOrder
          : undefined;
      await exportPurchaseOrderPdf(id, {
        order: cached as ExportPurchaseOrderPdfOptions['order'],
        paymentConditionLabels: paymentConditionLabelMap,
      });
      toast.success('PDF gerado com sucesso.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao gerar PDF';
      toast.error(msg);
    } finally {
      setPdfExportingId(null);
    }
  };

  const showApprovalPhaseFilter = isOcApprovalTab(activeTab);

  useEffect(() => {
    setApprovalListPhase('pending');
  }, [activeTab]);

  const showListApprovalActions = (status: string) =>
    approvalActionsEnabled &&
    isOcApprovalTab(activeTab) &&
    approvalListPhase === 'pending' &&
    showOcApprovalActions(status);

  const orders = useMemo(() => {
    if (isOcApprovalTab(activeTab)) {
      return ordersForOcApprovalListPhase(
        allOrders,
        activeTab,
        approvalListPhase,
        currentUserId,
        gestorCostCenterIds,
      );
    }
    if (activeTab === 'IN_REVIEW') {
      return allOrders.filter((o) => o.status === 'IN_REVIEW');
    }
    if (activeTab === 'APPROVED') {
      return allOrders.filter((o) => o.status === 'APPROVED' && !showInAttachBoletoTab(o));
    }
    if (activeTab === 'ATTACH_BOLETO') {
      return allOrders.filter((o) => showInAttachBoletoTab(o));
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
      return allOrders.filter((o) => o.status === 'REJECTED' || o.status === 'CANCELLED');
    }
    return allOrders;
  }, [allOrders, activeTab, gestorCostCenterIds, approvalListPhase, currentUserId]);

  const ocApprovalPhaseCounts = useMemo(() => {
    if (!isOcApprovalTab(activeTab)) {
      return { pending: 0, approved_by_me: 0, rejected: 0, all: 0 };
    }
    return {
      pending: ordersForOcApprovalListPhase(
        allOrders,
        activeTab,
        'pending',
        currentUserId,
        gestorCostCenterIds,
      ).length,
      approved_by_me: ordersForOcApprovalListPhase(
        allOrders,
        activeTab,
        'approved_by_me',
        currentUserId,
        gestorCostCenterIds,
      ).length,
      rejected: ordersForOcApprovalListPhase(
        allOrders,
        activeTab,
        'rejected',
        currentUserId,
        gestorCostCenterIds,
      ).length,
      all: ordersForOcApprovalListPhase(
        allOrders,
        activeTab,
        'all',
        currentUserId,
        gestorCostCenterIds,
      ).length,
    };
  }, [allOrders, activeTab, currentUserId, gestorCostCenterIds]);

  const filteredOrdersBySearch = useMemo(() => {
    const normalizedSearchTerm = normalizeOcSearch(searchTerm);
    const base =
      !normalizedSearchTerm
        ? orders
        : orders.filter((order) => {
            const searchableParts = [
              order.orderNumber,
              order.status,
              order.materialRequest?.requestNumber,
              order.materialRequest?.serviceOrder,
              order.materialRequest?.description,
              order.materialRequest?.costCenter?.code,
              order.materialRequest?.costCenter?.name,
              order.supplier?.name,
              order.supplier?.code,
              order.creator?.name
            ];

            return searchableParts.some((part) =>
              normalizeOcSearch(part).includes(normalizedSearchTerm)
            );
          });

    return sortPurchaseOrdersByMostRecent(base);
  }, [orders, searchTerm]);

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
    queryKey: ['purchase-orders', 'finalized-list', finalizedPage, finalizedFilters, effectiveSearchTerm],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', {
        params: {
          status: 'FINALIZED,SENT',
          page: finalizedPage,
          limit: 25,
          q: effectiveSearchTerm.trim() || undefined,
          orderDateFrom: finalizedFilters.orderDateFrom || undefined,
          orderDateTo: finalizedFilters.orderDateTo || undefined,
          supplierId: finalizedFilters.supplierId || undefined,
          costCenterId: finalizedFilters.costCenterId || undefined
        }
      });
      return res.data;
    },
    enabled: activeTab === 'FINALIZADAS',
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
    refetchOnWindowFocus: false
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

  const supplierFilterSelectOptions = useMemo(
    () => [
      { value: '', label: 'Todos', searchText: 'Todos' },
      ...(suppliersForFilter as Array<{ id: string; name: string }>).map((s) => ({
        value: s.id,
        label: s.name,
        searchText: s.name,
      })),
    ],
    [suppliersForFilter]
  );

  const costCenterFilterSelectOptions = useMemo(
    () => [
      { value: '', label: 'Todos', searchText: 'Todos' },
      ...costCentersForFilter
        .filter((cc): cc is typeof cc & { id: string } => Boolean(cc.id))
        .map((cc) => {
          const label = [cc.code, cc.name].filter(Boolean).join(' — ') || cc.id;
          return { value: cc.id, label, searchText: label };
        }),
    ],
    [costCentersForFilter]
  );

  const finalizedOrders: PurchaseOrder[] = finalizedListResponse?.data ?? [];
  const finalizedPagination = finalizedListResponse?.pagination as
    | { page: number; limit: number; total: number; totalPages: number }
    | undefined;

  const paymentTabOrderNumbers = useMemo(
    () =>
      activeTab === 'APPROVED'
        ? Array.from(new Set(orders.map((o) => o.orderNumber.trim()).filter(Boolean))).sort()
        : [],
    [activeTab, orders]
  );

  const { data: financialEntriesForPaymentTab = [] } = useQuery({
    queryKey: ['financial-control-batch-by-oc', paymentTabOrderNumbers.join('|')],
    queryFn: async () => {
      const res = await api.get('/financial-control/by-oc-batch', {
        params: { numbers: paymentTabOrderNumbers.join(',') },
      });
      return (res.data?.data || []) as FinancialControlEntry[];
    },
    enabled: activeTab === 'APPROVED' && paymentTabOrderNumbers.length > 0,
  });

  const financialEntriesByOcNumber = useMemo(() => {
    const map = new Map<string, FinancialControlEntry[]>();
    for (const entry of financialEntriesForPaymentTab) {
      const key = (entry.ocNumber || '').trim().toLowerCase();
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return map;
  }, [financialEntriesForPaymentTab]);

  const displayedOrders = useMemo(() => {
    if (activeTab === 'FINALIZADAS') {
      return sortPurchaseOrdersByMostRecent(finalizedOrders);
    }
    if (activeTab === 'APPROVED' && hasActivePaymentDueFilters) {
      return filteredOrdersBySearch.filter((order) => {
        const entries =
          financialEntriesByOcNumber.get(order.orderNumber.trim().toLowerCase()) ?? [];
        const { dueDate } = resolvePaymentListInstallmentValues(order, 'payment', entries);
        return isOcDueDateInPaymentFilterRange(dueDate, paymentDueFilters);
      });
    }
    return filteredOrdersBySearch;
  }, [
    activeTab,
    finalizedOrders,
    filteredOrdersBySearch,
    hasActivePaymentDueFilters,
    paymentDueFilters,
    financialEntriesByOcNumber,
  ]);

  /** Pagamento / comprovante: permissão da aba (admin já incluso nas flags). */
  const canActPaymentUi = canActOcPayment;
  const canActProofCorrectionUi = canActOcProofCorrection;
  const canActValidateProofUi = canActOcValidateProof;
  const canActAttachBoletoUi = canActOcAttachBoleto;
  const canActAttachNfUi = canActOcAttachNf;
  const canEditOcInReview =
    canActOcCorrection ||
    (!!selectedOrder?.creator?.id && selectedOrder.creator.id === currentUserId);

  const canEditBoletoParcels =
    !!selectedOrder &&
    selectedOrder.status === 'APPROVED' &&
    selectedOrder.paymentType === 'BOLETO' &&
    canActAttachBoletoUi &&
    showInAttachBoletoTab(selectedOrder);

  const handleBoletoParcelsSaved = (payload: { data: unknown }) => {
    const updated = (payload as { data?: PurchaseOrder })?.data;
    if (updated?.id) {
      applyOcLocalPatch(queryClient, setSelectedOrder, updated.id, {
        paymentBoletoInstallments: updated.paymentBoletoInstallments,
        paymentBoletoUrl: updated.paymentBoletoUrl,
        paymentBoletoName: updated.paymentBoletoName,
        paymentBoletoPhaseReleased: updated.paymentBoletoPhaseReleased,
        paymentParcelCount: updated.paymentParcelCount,
        updatedAt: updated.updatedAt
      });
    }
  };

  const formatDate = (d?: string) => (d ? new Date(d).toLocaleDateString('pt-BR') : '-');
  /** Ex.: R$100,00 (sem espaço após R$), conforme detalhes da OC */
  const formatBrlCompact = (v: number) =>
    `R$${new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(v)}`;

  const handleExportFinalizedCsv = async () => {
    setExportingFinalizedCsv(true);
    try {
      const res = await api.get('/purchase-orders/export-finalized-csv', {
        params: {
          q: effectiveSearchTerm.trim() || undefined,
          orderDateFrom: finalizedFilters.orderDateFrom || undefined,
          orderDateTo: finalizedFilters.orderDateTo || undefined,
          supplierId: finalizedFilters.supplierId || undefined,
          costCenterId: finalizedFilters.costCenterId || undefined
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
    } finally {
      setExportingFinalizedCsv(false);
    }
  };

  const openOrderDetail = (o: PurchaseOrder) => {
    /** Abre na hora com o que já está na lista; o detalhe completo e o estoque entram em background. */
    lastOcDetailOrderIdRef.current = o.id;
    setOcDetailTab(defaultOcDetailModalTab(o.status));
    setSelectedOrder(o);
    void queryClient.fetchQuery({
      queryKey: ['purchase-order-detail', o.id],
      queryFn: async () => {
        const res = await api.get(`/purchase-orders/${o.id}`);
        return res.data?.data as PurchaseOrder | undefined;
      },
      staleTime: 0
    });
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

  const resolveOcFreightAmountStr = (order: OcFormOrderSource) => {
    const itemsSub = (order.items || []).reduce((sum, item) => {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const lineTotal = Number.isFinite(qty) && Number.isFinite(unitPrice) ? qty * unitPrice : 0;
      return sum + lineTotal;
    }, 0);
    const freightStored =
      order.freightAmount != null && order.freightAmount !== ''
        ? Number(order.freightAmount)
        : Math.max(0, Number(order.amountToPay ?? 0) - itemsSub);
    return Number.isFinite(freightStored) ? String(freightStored) : '0';
  };

  const openEditOcWithOrder = (order: PurchaseOrder) => {
    if (order.status !== 'IN_REVIEW') return;
    if (!order.creator?.id || order.creator.id !== currentUserId) return;

    const formValues = buildOcFormValuesFromOrder(order, {
      stripCorrectionNotes: stripOcCorrectionBlocksFromNotes,
      materialLineLabel,
      parseFreight: resolveOcFreightAmountStr
    });

    const invalid = formValues.items.some((it) => !it.materialId || !it.unit);
    if (invalid) {
      toast.error('Não foi possível carregar os itens da OC para edição.');
      return;
    }

    setSelectedOrder(order);
    setEditOcForm(formValues);
    setEditSupplierSearch(
      getOcSupplierLabel(order.supplier as OcSupplierOption) || order.supplier?.name || ''
    );
    setShowEditOcModal(true);
  };

  const handleOpenEditOc = () => {
    if (!selectedOrder) return;
    openEditOcWithOrder(selectedOrder);
  };

  const handleOpenEditOcForOrder = async (o: PurchaseOrder) => {
    setOrderDetailLoadingId(o.id);
    try {
      const res = await api.get(`/purchase-orders/${o.id}`);
      const order = res.data?.data as PurchaseOrder | undefined;
      if (!order) {
        toast.error('Não foi possível carregar a OC.');
        return;
      }
      openEditOcWithOrder(order);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Erro ao carregar a OC.');
    } finally {
      setOrderDetailLoadingId(null);
    }
  };

  const handleSaveEditOc = () => {
    if (!selectedOrder || !editOcForm) return;
    if (!editOcForm.supplierId) {
      toast.error('Selecione o fornecedor.');
      return;
    }
    if (
      isEditOcAvistaPaymentIncomplete(
        editOcForm.paymentType,
        editOcForm.paymentDetails,
        editOcForm.pixKeyType,
        editOcForm.pixKey
      )
    ) {
      toast.error('Preencha dados do pagamento, tipo e chave Pix para pagamento à vista.');
      return;
    }
    const freightParsed = parseMoneyInput(editOcForm.freightAmount);
    const freightAmount = freightParsed != null && freightParsed >= 0 ? freightParsed : 0;
    const correctionBlocks = extractOcCorrectionBlocks(selectedOrder.notes);
    const userNotes = editOcForm.notes.trim();
    const mergedNotes = [userNotes, correctionBlocks].filter(Boolean).join('\n\n') || null;

    const payload = {
      supplierId: editOcForm.supplierId,
      paymentType: editOcForm.paymentType,
      paymentCondition: editOcForm.paymentType === 'AVISTA' ? 'AVISTA' : editOcForm.paymentCondition,
      paymentDetails: editOcForm.paymentDetails.trim() || null,
      pixKeyType: editOcForm.paymentType === 'AVISTA' ? editOcForm.pixKeyType.trim() : null,
      pixKey: editOcForm.paymentType === 'AVISTA' ? editOcForm.pixKey.trim() : null,
      freightAmount,
      notes: mergedNotes,
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

  const isIntegratedFlux = embedded && hideTabs;
  const flushInTabsCard = isIntegratedFlux && flushInCard;
  const integratedMeta = isIntegratedFlux ? EMBEDDED_OC_TAB_META[activeTab] : null;
  const integratedListCount = displayedOrders.length;
  const showToolbarSearch =
    !hideSearch && (Boolean(onSearchChange) || activeTab === 'FINALIZADAS');
  const showToolbarCnab = activeTab === 'APPROVED' && canActPaymentUi;
  const showToolbarPaymentDueFilter = activeTab === 'APPROVED';
  const showToolbarFinalizedExtras = activeTab === 'FINALIZADAS';
  const showHeaderToolbar =
    showToolbarSearch ||
    showToolbarCnab ||
    showToolbarPaymentDueFilter ||
    showToolbarFinalizedExtras ||
    showApprovalPhaseFilter;
  const hasActiveApprovalPhaseFilter = approvalListPhase !== 'pending';
  const orderForActionMenu = ocActionMenu
    ? displayedOrders.find((o) => o.id === ocActionMenu.orderId)
    : undefined;

  const financialEntryInitialValues = useMemo(
    () => (financialEntryOrder ? buildFormFromPurchaseOrder(financialEntryOrder) : undefined),
    [financialEntryOrder]
  );

  const financialEntryInitialFormFromSelectedOrder = useMemo(
    () => (selectedOrder ? buildFormFromPurchaseOrder(selectedOrder) : undefined),
    [selectedOrder]
  );

  const listHeaderToolbar = showHeaderToolbar ? (
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {showToolbarSearch && (
          <div className="relative min-w-[240px] flex-1 sm:w-[300px] sm:flex-none sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              inputMode="search"
              autoComplete="off"
              value={effectiveSearchTerm}
              onChange={(e) => setEffectiveSearchTerm(e.target.value)}
              placeholder="Buscar OC, RM, fornecedor, centro de custo..."
              className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            {effectiveSearchTerm ? (
              <button
                type="button"
                onClick={() => setEffectiveSearchTerm('')}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        )}
        {showApprovalPhaseFilter && (
          <button
            type="button"
            onClick={() => setIsApprovalFiltersModalOpen(true)}
            className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              hasActiveApprovalPhaseFilter
                ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
            aria-label="Abrir filtro"
            title={hasActiveApprovalPhaseFilter ? 'Filtro (status ativo)' : 'Filtro'}
          >
            <Filter className="h-4 w-4" />
            {hasActiveApprovalPhaseFilter ? (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
            ) : null}
          </button>
        )}
        {showToolbarPaymentDueFilter && (
          <button
            type="button"
            onClick={() => setIsPaymentDueFiltersModalOpen(true)}
            className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              hasActivePaymentDueFilters
                ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
            aria-label="Filtrar por vencimento"
            title={
              hasActivePaymentDueFilters
                ? 'Filtro de vencimento ativo'
                : 'Filtrar por período de vencimento'
            }
          >
            <Filter className="h-4 w-4" />
            {hasActivePaymentDueFilters ? (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
            ) : null}
          </button>
        )}
        {showToolbarCnab && (
          <button
            type="button"
            onClick={() => {
              if (cnabGenerating || cnabSelectedIds.size === 0) return;
              handleGenerateCnabOc();
            }}
            aria-disabled={cnabGenerating || cnabSelectedIds.size === 0}
            title={
              cnabSelectedIds.size === 0
                ? 'Selecione ao menos uma OC na tabela'
                : 'Gerar remessa CNAB400 (Itaú) para as OCs selecionadas'
            }
            className={`flex h-10 min-w-[8.75rem] shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${
              cnabGenerating || cnabSelectedIds.size === 0
                ? 'cursor-not-allowed opacity-50'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {cnabGenerating ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 shrink-0" />
            )}
            <span className="whitespace-nowrap">CNAB400</span>
          </button>
        )}
        {showToolbarFinalizedExtras && (
          <>
            <button
              type="button"
              onClick={() => setIsFinalizedFiltersModalOpen(true)}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white transition-colors hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 ${
                hasActiveFinalizedFilters
                  ? 'border-blue-400 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                  : 'border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200'
              }`}
              aria-label="Abrir filtro"
              title={hasActiveFinalizedFilters ? 'Filtro (ativos)' : 'Filtro'}
            >
              <Filter className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleExportFinalizedCsv()}
              disabled={exportingFinalizedCsv}
              className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              {exportingFinalizedCsv ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Download className="h-4 w-4 shrink-0" />
              )}
              <span>Exportar CSV</span>
            </button>
          </>
        )}
      </div>
    ) : null;

  return (
    <>
      <section
        id="fluxo-oc"
        className={`${flushInTabsCard ? '' : 'scroll-mt-4'} ${
          isIntegratedFlux && isOcApprovalTab(activeTab) ? 'space-y-6' : ''
        }`}
      >
        {isIntegratedFlux && isOcApprovalTab(activeTab) && allowApprovalActions ? (
          <ApprovalPhaseStatCards
            cards={OC_APPROVAL_STAT_CARDS}
            activeFilter={approvalListPhase}
            counts={ocApprovalPhaseCounts}
            loading={listLoading}
            onSelect={setApprovalListPhase}
          />
        ) : null}
        <Card
          className={
            isIntegratedFlux
              ? `w-full ${flushInTabsCard ? 'rounded-none border-0 border-t-0 shadow-none' : ''}`
              : undefined
          }
        >
          {isIntegratedFlux && integratedMeta ? (
            <CardHeader className={`border-b-0 pb-1 ${flushInTabsCard ? 'pt-4' : ''}`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  {allowApprovalActions && isOcApprovalTab(activeTab) ? (
                    (() => {
                      const activeCard =
                        OC_APPROVAL_STAT_CARDS.find((c) => c.filter === approvalListPhase) ??
                        OC_APPROVAL_STAT_CARDS[0];
                      const PhaseIcon = activeCard.Icon;
                      return (
                        <>
                          <div className={`flex-shrink-0 rounded-lg p-2 sm:p-3 ${activeCard.iconBg}`}>
                            <PhaseIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${activeCard.iconColor}`} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                              {activeCard.label}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {approvalTabSubtitle(activeTab, approvalListPhase)}
                            </p>
                          </div>
                        </>
                      );
                    })()
                  ) : (
                    <>
                      <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                        <FileText className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {integratedMeta.title}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {approvalTabSubtitle(activeTab, approvalListPhase)}
                        </p>
                      </div>
                    </>
                  )}
                </div>
                {listHeaderToolbar}
              </div>
            </CardHeader>
          ) : null}
          {!hideTabs && (
            <OcFluxTabsNav
              activeTab={activeTab}
              onActiveTab={setActiveTab}
              tabCounts={tabCounts}
              finalizedTotal={finalizedTotal}
            />
          )}
          <CardContent className={isIntegratedFlux ? undefined : 'p-0'}>
            {listLoading ? (
              <div className={isIntegratedFlux ? 'text-center py-8' : 'px-6 py-12 text-center'}>
                <Loading message="Carregando ordens..." />
              </div>
            ) : (
              <div className={isIntegratedFlux ? undefined : 'table-scroll'}>
                {isIntegratedFlux && integratedListCount > 0 && (
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      {activeTab === 'FINALIZADAS' && finalizedPagination
                        ? (() => {
                            const total = finalizedPagination.total;
                            const page = finalizedPagination.page;
                            const limit = finalizedPagination.limit ?? integratedListCount;
                            const start = total === 0 ? 0 : (page - 1) * limit + 1;
                            const end = Math.min((page - 1) * limit + integratedListCount, total);
                            return `Mostrando ${start} a ${end} de ${total} ordens de compra`;
                          })()
                        : `Mostrando 1 a ${integratedListCount} de ${integratedListCount} ${
                            integratedListCount === 1 ? 'ordem de compra' : 'ordens de compra'
                          }`}
                    </span>
                    {activeTab === 'FINALIZADAS' &&
                    finalizedPagination &&
                    finalizedPagination.totalPages > 1 ? (
                      <span>{`Página ${finalizedPagination.page} de ${finalizedPagination.totalPages}`}</span>
                    ) : null}
                  </div>
                )}
                {isIntegratedFlux && integratedListCount === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">
                      {embeddedOcEmptyMessage(
                        activeTab,
                        !!searchTerm.trim(),
                        approvalListPhase,
                        hasActivePaymentDueFilters,
                      )}
                    </p>
                    {(effectiveSearchTerm.trim() || hasActiveFinalizedFilters) &&
                    activeTab === 'FINALIZADAS' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEffectiveSearchTerm('');
                          clearFinalizedFilters();
                        }}
                        className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Limpar filtros
                      </button>
                    ) : (effectiveSearchTerm.trim() || hasActivePaymentDueFilters) &&
                      activeTab === 'APPROVED' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEffectiveSearchTerm('');
                          clearPaymentDueFilters();
                        }}
                        className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Limpar filtros
                      </button>
                    ) : searchTerm.trim() && onSearchChange ? (
                      <button
                        type="button"
                        onClick={() => onSearchChange('')}
                        className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Limpar busca
                      </button>
                    ) : null}
                  </div>
                ) : (
                <div className={isIntegratedFlux ? 'table-scroll' : undefined}>
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      {activeTab === 'APPROVED' && (
                        <th className="w-12 min-w-[3rem] max-w-[3rem] px-2 sm:px-3 py-4">
                          <div className="flex items-center justify-center">
                          <OcStyledCheckbox
                            title="Selecionar todas"
                            ariaLabel="Selecionar todas as OCs"
                            checked={orders.length > 0 && orders.every((x) => cnabSelectedIds.has(x.id))}
                            onChange={(checked) => {
                              if (checked) {
                                setCnabSelectedIds(new Set(orders.map((x) => x.id)));
                              } else {
                                setCnabSelectedIds(new Set());
                              }
                            }}
                          />
                          </div>
                        </th>
                      )}
                      <th
                        scope="col"
                        className={`${cadastroListClasses.th} w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] text-center`}
                      >
                        OC
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Fornecedor
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Centro de Custo
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        RM
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        OS
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        Status de entrega
                      </th>
                      {ocListShowsOrderDateColumn(activeTab) && (
                        <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Data
                        </th>
                      )}
                      {ocListShowsOrderGrandTotalColumn(activeTab) && (
                        <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Valor Total
                        </th>
                      )}
                      {ocListShowsPaymentStatusColumn(activeTab) && (
                        <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                          Status
                        </th>
                      )}
                      {ocListShowsAttachBoletoStatusColumn(activeTab) && (
                        <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                          Situação
                        </th>
                      )}
                      {ocListShowsPaymentConditionColumn(activeTab) && (
                        <th className={ocListDocThCls}>Condição de pagamento</th>
                      )}
                      {ocListShowsInstallmentParcelColumn(activeTab) && (
                        <th className={ocListDocThCls}>Parcela</th>
                      )}
                      {ocListShowsInstallmentDueDateColumn(activeTab) && (
                        <th className={ocListDocThCls}>Vencimento</th>
                      )}
                      {ocListShowsInstallmentAmountColumn(activeTab) && (
                        <th className={ocListDocThCls}>Valor parcela</th>
                      )}
                      {ocListShowsDocumentColumns(activeTab) && (
                        <>
                          {ocListShowsBoletoColumn(activeTab) && (
                            <th className={ocListDocThCls}>Boleto</th>
                          )}
                          {ocListShowsParcelasColumn(activeTab) && (
                            <th className={ocListDocThCls}>Parcelas</th>
                          )}
                          {ocListShowsComprovanteColumn(activeTab) && (
                            <th className={ocListDocThCls}>Comprovante</th>
                          )}
                          {ocListShowsNfColumn(activeTab) && activeTab !== 'ATTACH_NF' && (
                            <th className={ocListDocThCls}>NF</th>
                          )}
                        </>
                      )}
                      {activeTab === 'ATTACH_NF' && (
                        <th className={ocListDocThCls}>NF</th>
                      )}
                      {allowApprovalActions && isOcApprovalTab(activeTab) && (
                        <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                          {APPROVAL_STATUS_COLUMN_TITLE}
                        </th>
                      )}
                      <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {isIntegratedFlux ? 'Ação' : 'Ações'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {displayedOrders.map((o: PurchaseOrder) => {
                      const listInstallmentModeForTab = ocListInstallmentMode(activeTab);
                      const paymentFinancialEntries =
                        financialEntriesByOcNumber.get(o.orderNumber.trim().toLowerCase()) ?? [];
                      return (
                      <tr
                        key={o.id}
                        className={getListTableRowClassName(true)}
                        onClick={() => openOrderDetail(o)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openOrderDetail(o);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Ver detalhes da ${o.orderNumber}`}
                      >
                        {activeTab === 'APPROVED' && (
                          <td
                            className="w-12 min-w-[3rem] max-w-[3rem] px-2 sm:px-3 py-4 align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-center">
                              <OcStyledCheckbox
                                checked={cnabSelectedIds.has(o.id)}
                                onChange={(checked) => {
                                  setCnabSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(o.id);
                                    else next.delete(o.id);
                                    return next;
                                  });
                                }}
                                ariaLabel={`Selecionar ${o.orderNumber}`}
                              />
                            </div>
                          </td>
                        )}
                        <td
                          className={`${cadastroListClasses.tdMono} w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] text-center`}
                          title={o.orderNumber}
                        >
                          <ListRowNavigableLabel className="font-medium">
                            {formatOcListDisplayId(o.orderNumber)}
                          </ListRowNavigableLabel>
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {o.supplier?.name || '-'}
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-center text-sm text-gray-900 dark:text-gray-100">
                          {(() => {
                            const cc = formatOcListCostCenter(o.materialRequest?.costCenter);
                            return (
                              <span className="line-clamp-2" title={cc.title}>
                                {cc.display}
                              </span>
                            );
                          })()}
                        </td>
                        <td
                          className="px-3 sm:px-6 py-4 text-sm text-center text-gray-600 dark:text-gray-400"
                          title={o.materialRequest?.requestNumber || undefined}
                        >
                          {formatRmListDisplayId(o.materialRequest?.requestNumber)}
                        </td>
                        <td
                          className="px-3 sm:px-6 py-4 text-sm text-center text-gray-900 dark:text-gray-100"
                          title={o.materialRequest?.serviceOrder?.trim() || undefined}
                        >
                          {(() => {
                            const os = stripOsSePrefix(o.materialRequest?.serviceOrder);
                            return os || '—';
                          })()}
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-center whitespace-nowrap">
                          <OcListDeliveryStatusCellContent
                            movement={latestOcMovementByOrderNumber.get(
                              normalizeOcNumberKey(o.orderNumber)
                            )}
                            orderStatus={o.status}
                          />
                        </td>
                        {ocListShowsOrderDateColumn(activeTab) && (
                          <td className="px-3 sm:px-6 py-4 text-sm text-center text-gray-900 dark:text-gray-100">
                            {formatDate(o.orderDate)}
                          </td>
                        )}
                        {ocListShowsOrderGrandTotalColumn(activeTab) && (
                          <td className="px-3 sm:px-6 py-4 text-sm text-center tabular-nums text-gray-900 dark:text-gray-100">
                            {formatCurrency(orderGrandTotal(o))}
                          </td>
                        )}
                        {ocListShowsPaymentStatusColumn(activeTab) && (
                          <td className="px-3 sm:px-6 py-4 text-center whitespace-nowrap">
                            {(() => {
                              const entries =
                                financialEntriesByOcNumber.get(o.orderNumber.trim().toLowerCase()) ??
                                [];
                              const paymentStatus = getOcPaymentListStatus(o, entries);
                              return (
                                <span className={ocPaymentListStatusClass(paymentStatus)}>
                                  {ocPaymentListStatusLabel(paymentStatus)}
                                </span>
                              );
                            })()}
                          </td>
                        )}
                        {ocListShowsAttachBoletoStatusColumn(activeTab) && (
                          <td className="px-3 sm:px-6 py-4 text-center">
                            <OcListAttachBoletoStatusCellContent order={o} />
                          </td>
                        )}
                        {ocListShowsPaymentConditionColumn(activeTab) && (
                          <td className={ocListDocTdCls}>
                            <div className={ocListDocCellInnerCls}>
                              <span
                                className="text-gray-800 dark:text-gray-200 whitespace-nowrap"
                                title={formatOcListPaymentCondition(o, paymentConditionLabelMap)}
                              >
                                {formatOcListPaymentCondition(o, paymentConditionLabelMap)}
                              </span>
                            </div>
                          </td>
                        )}
                        {ocListShowsInstallmentParcelColumn(activeTab) && (
                          <td className={ocListDocTdCls}>
                            <div className={ocListDocCellInnerCls}>
                              <OcListInstallmentParcelCellContent
                                order={o}
                                installmentMode={listInstallmentModeForTab}
                              />
                            </div>
                          </td>
                        )}
                        {ocListShowsInstallmentDueDateColumn(activeTab) && (
                          <td className={ocListDocTdCls}>
                            <div className={ocListDocCellInnerCls}>
                              <OcListInstallmentDueDateCellContent
                                order={o}
                                installmentMode={listInstallmentModeForTab}
                                financialEntries={paymentFinancialEntries}
                              />
                            </div>
                          </td>
                        )}
                        {ocListShowsInstallmentAmountColumn(activeTab) && (
                          <td className={ocListDocTdCls}>
                            <div className={ocListDocCellInnerCls}>
                              <OcListInstallmentAmountCellContent
                                order={o}
                                installmentMode={listInstallmentModeForTab}
                                financialEntries={paymentFinancialEntries}
                              />
                            </div>
                          </td>
                        )}
                        {ocListShowsDocumentColumns(activeTab) && (
                          <>
                            {ocListShowsBoletoColumn(activeTab) && (
                              <td className={ocListDocTdCls}>
                                <div className={ocListDocCellInnerCls}>
                                  <OcListBoletoCellContent
                                    order={o}
                                    singleInstallmentMode={listInstallmentModeForTab}
                                  />
                                </div>
                              </td>
                            )}
                            {ocListShowsParcelasColumn(activeTab) && (
                              <td className={ocListDocTdCls}>
                                <div className={ocListDocCellInnerCls}>
                                  <OcListParcelasCellContent order={o} />
                                </div>
                              </td>
                            )}
                            {ocListShowsComprovanteColumn(activeTab) && (
                              <td className={ocListDocTdCls}>
                                <div className={ocListDocCellInnerCls}>
                                  <OcListComprovanteCellContent
                                    order={o}
                                    proofValidationOnly={activeTab === 'PROOF_VALIDATION' || activeTab === 'PROOF_CORRECTION'}
                                  />
                                </div>
                              </td>
                            )}
                            {ocListShowsNfColumn(activeTab) && activeTab !== 'ATTACH_NF' && (
                              <td className={ocListDocTdCls}>
                                <div className={ocListDocCellInnerCls}>
                                  <OcListNfCellContent order={o} />
                                </div>
                              </td>
                            )}
                          </>
                        )}
                        {activeTab === 'ATTACH_NF' && (
                          <td className={ocListDocTdCls}>
                            <div className={ocListDocCellInnerCls}>
                              <OcListNfCellContent order={o} />
                            </div>
                          </td>
                        )}
                        {allowApprovalActions && isOcApprovalTab(activeTab) && (
                          <td className="px-3 sm:px-6 py-4 text-center whitespace-nowrap">
                            <ApprovalStatusBadge kind={ocToApprovalStatus(o.status)} />
                          </td>
                        )}
                        <td
                          className="px-3 sm:px-6 py-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-1 flex-wrap">
                            {!isIntegratedFlux && (
                              <>
                                {o.status === 'PENDING_PROOF_VALIDATION' && canActValidateProofUi && (
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
                                {showListApprovalActions(o.status) && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      approveMutation.mutate({
                                        id: o.id,
                                        currentStatus: o.status,
                                        unbOnlyGestor: isOcUnbCostCenter(o)
                                      })
                                    }
                                    className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors inline-flex"
                                    title={approvalLabel(o.status, isOcUnbCostCenter(o))}
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                )}
                                {showListApprovalActions(o.status) && (
                                  <button
                                    type="button"
                                    onClick={() => openOcCorrectionModal(o)}
                                    className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors inline-flex"
                                    title="Enviar para CORREÇÃO OC"
                                  >
                                    <Wrench className="w-4 h-4" />
                                  </button>
                                )}
                                {showListApprovalActions(o.status) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectTarget(o);
                                      setRejectReason('');
                                    }}
                                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors inline-flex"
                                    title="Cancelar"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                                {o.status === 'IN_REVIEW' &&
                                  o.creator?.id &&
                                  currentUserId === o.creator.id && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditOcForOrder(o)}
                                        disabled={orderDetailLoadingId === o.id}
                                        className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors inline-flex disabled:opacity-50"
                                        title="Editar"
                                      >
                                        {orderDetailLoadingId === o.id ? (
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <Pencil className="w-4 h-4" />
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => resubmitOcMutation.mutate(o)}
                                        disabled={resubmitOcMutation.isPending}
                                        className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors inline-flex disabled:opacity-50"
                                        title="Enviar para Aprovação"
                                      >
                                        <Send className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                <button
                                  type="button"
                                  onClick={() => handleExportPdf(o.id)}
                                  disabled={pdfExportingId === o.id}
                                  className="inline-flex rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700/50"
                                  title="Baixar OC"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openOrderDetail(o)}
                                  className="inline-flex rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                                  title="Ver detalhes"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              </>
                            )}
                            {isIntegratedFlux && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  setOcActionMenu((prev) => {
                                    if (prev?.orderId === o.id) return null;
                                    const pos = computeOcActionMenuPosition(r);
                                    return { orderId: o.id, ...pos };
                                  });
                                }}
                                className={rowActionMenuButtonClass(ocActionMenu?.orderId === o.id)}
                                aria-label="Menu de ações"
                                aria-expanded={ocActionMenu?.orderId === o.id}
                                aria-haspopup="menu"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
                </div>
                )}
                {activeTab === 'FINALIZADAS' &&
                  finalizedPagination &&
                  finalizedPagination.totalPages > 1 &&
                  displayedOrders.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Página {finalizedPagination.page} de {finalizedPagination.totalPages}
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
                {!isIntegratedFlux &&
                  ((activeTab === 'FINALIZADAS' && displayedOrders.length === 0 && !listLoading) ||
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
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setRejectTarget(null); setRejectReason(''); }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Cancelar OC</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{rejectTarget.orderNumber}</p>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo *</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-4"
              placeholder="Informe o motivo do cancelamento..."
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                onClick={() => rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason.trim() })}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </AppModalOverlay>
      )}

      {returnItemTarget && (
        <Modal
          isOpen={!!returnItemTarget}
          onClose={() => {
            if (returnItemToRmMutation.isPending) return;
            setReturnItemTarget(null);
            setReturnItemReason('');
          }}
          title="Devolver item à RM"
          size="md"
          confirmBeforeClose={false}
          elevated
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {(selectedOrder?.items?.length ?? 0) <= 1
                ? 'Este é o único item da OC. Ao devolver, a OC será cancelada e o item volta para a mesma RM, para um novo mapa de cotação.'
                : 'O item sai desta OC e volta para a mesma RM, para um novo mapa de cotação com outro fornecedor. A OC permanece com os demais itens.'}
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
              <p className="text-xs text-gray-500 dark:text-gray-400">Item</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {materialLineLabel(returnItemTarget.item.material)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Qtd {Number(returnItemTarget.item.quantity)} {returnItemTarget.item.unit || ''}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Motivo *
              </label>
              <textarea
                value={returnItemReason}
                onChange={(e) => setReturnItemReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                placeholder="Ex.: fornecedor não tinha o item no momento da compra"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setReturnItemTarget(null);
                  setReturnItemReason('');
                }}
                disabled={returnItemToRmMutation.isPending}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!returnItemReason.trim() || returnItemToRmMutation.isPending || !returnItemTarget.item.id}
                onClick={() => {
                  if (!returnItemTarget.item.id) return;
                  returnItemToRmMutation.mutate({
                    orderId: returnItemTarget.orderId,
                    itemId: returnItemTarget.item.id,
                    reason: returnItemReason.trim(),
                  });
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {returnItemToRmMutation.isPending ? 'Devolvendo…' : 'Devolver à RM'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {correctionTarget && (
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setCorrectionTarget(null);
              setCorrectionReason('');
            }}
          />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Enviar para CORREÇÃO OC</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Quem criou a OC poderá ajustar e reenviá-la para aprovação. {correctionTarget.orderNumber}
            </p>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo da correção *</label>
            <textarea
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-4"
              placeholder="Descreva o que precisa ser ajustado na OC..."
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setCorrectionTarget(null);
                  setCorrectionReason('');
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!correctionReason.trim() || correctionOcMutation.isPending}
                onClick={() =>
                  correctionOcMutation.mutate({
                    id: correctionTarget.id,
                    reason: correctionReason.trim()
                  })
                }
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {correctionOcMutation.isPending ? 'Enviando...' : 'Enviar para correção'}
              </button>
            </div>
          </div>
        </AppModalOverlay>
      )}

      {showEditOcModal && selectedOrder && editOcForm && (
        <>
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={requestCloseEditOc} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Editar Ordem de Compra</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {selectedOrder.orderNumber}
                  {selectedOrder.materialRequest?.requestNumber
                    ? ` · RM: ${formatRmListDisplayId(selectedOrder.materialRequest.requestNumber)}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={requestCloseEditOc}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <OcPurchaseOrderFormFields
              mode="edit"
              values={editOcForm}
              correctionInfo={parseLastOcCorrectionInfo(selectedOrder.notes)}
              parseMoneyInput={parseMoneyInput}
              onChange={(patch) => setEditOcForm((prev) => (prev ? { ...prev, ...patch } : prev))}
              onItemChange={(index, patch) =>
                setEditOcForm((prev) => {
                  if (!prev) return prev;
                  const nextItems = prev.items.map((item, i) =>
                    i === index ? { ...item, ...patch } : item
                  );
                  return { ...prev, items: nextItems };
                })
              }
              supplierField={{
                supplierId: editOcForm.supplierId,
                supplierLabel: editSupplierSearch,
                onSupplierChange: (supplier) => {
                  setEditOcForm((prev) => (prev ? { ...prev, supplierId: supplier.id } : prev));
                  setEditSupplierSearch(getOcSupplierLabel(supplier));
                },
              }}
            />

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
                disabled={
                  updateOcDetailsMutation.isPending ||
                  !editOcForm.supplierId ||
                  isEditOcAvistaPaymentIncomplete(
                    editOcForm.paymentType,
                    editOcForm.paymentDetails,
                    editOcForm.pixKeyType,
                    editOcForm.pixKey
                  )
                }
                onClick={handleSaveEditOc}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {updateOcDetailsMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </AppModalOverlay>
        {editOcConfirmUi}
        </>
      )}

      {selectedOrder && !showEditOcModal && !correctionTarget && typeof document !== 'undefined'
        ? createPortal(
        <>
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto p-4">
          <div className="absolute inset-0 bg-black/50" onClick={requestCloseSelectedOrder} />
          <div
            className={`relative my-auto flex w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800 ${
              selectedOrder.status !== 'IN_REVIEW' && ocDetailTab === 'comentarios'
                ? 'h-[min(92dvh,calc(100dvh-2rem))]'
                : 'max-h-[min(92dvh,calc(100dvh-2rem))]'
            } ${selectedOrder.status === 'IN_REVIEW' ? 'max-w-2xl' : 'max-w-4xl'}`}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-2">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {selectedOrder.status === 'IN_REVIEW'
                    ? 'Ordem de Compra'
                    : `Ordem de Compra No. ${formatOcListDisplayId(selectedOrder.orderNumber)}`}
                </h2>
                {selectedOrder.status === 'IN_REVIEW' ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{selectedOrder.orderNumber}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={requestCloseSelectedOrder}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400 shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {selectedOrder.status !== 'IN_REVIEW' ? (
              <div
                className="shrink-0 border-b border-gray-200 dark:border-gray-700 px-5"
                role="tablist"
                aria-label="Seções da OC"
              >
                <div className="flex gap-1 table-scroll -mb-px">
                  {OC_DETAIL_MODAL_TABS.map((tab) => {
                    const active = ocDetailTab === tab.id;
                    return (
                      <AppModalTabButton
                        key={tab.id}
                        active={active}
                        onClick={() => setOcDetailTab(tab.id)}
                        className="shrink-0 px-3 py-2.5 text-sm"
                      >
                        {tab.label}
                      </AppModalTabButton>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div
              ref={ocDetailScrollRef}
              className={
                selectedOrder.status !== 'IN_REVIEW' && ocDetailTab === 'comentarios'
                  ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-5 pt-4 pb-4'
                  : 'flex-1 overflow-y-auto px-5 py-4'
              }
            >
            {selectedOrder.status === 'IN_REVIEW' ? (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  RM: {formatRmListDisplayId(selectedOrder.materialRequest?.requestNumber)}
                  <span className="mx-2">·</span>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[selectedOrder.status] || ''}`}
                  >
                    {purchaseOrderPhaseLabel(selectedOrder.status)}
                  </span>
                </p>
                <OcPurchaseOrderFormFields
                  mode="view"
                  values={buildOcFormValuesFromOrder(selectedOrder, {
                    stripCorrectionNotes: stripOcCorrectionBlocksFromNotes,
                    materialLineLabel,
                    parseFreight: resolveOcFreightAmountStr
                  })}
                  paymentConditionLabel={
                    selectedOrder.paymentCondition
                      ? paymentConditionLabelMap[selectedOrder.paymentCondition] ||
                        selectedOrder.paymentCondition
                      : undefined
                  }
                  correctionInfo={parseLastOcCorrectionInfo(selectedOrder.notes)}
                  supplierField={{
                    supplierId: selectedOrder.supplier?.id ?? '',
                    supplierLabel:
                      getOcSupplierLabel(selectedOrder.supplier as OcSupplierOption) ||
                      selectedOrder.supplier?.name ||
                      '—',
                  }}
                />
              </>
            ) : (
            <div
              className={
                ocDetailTab === 'comentarios'
                  ? 'flex h-full min-h-0 flex-col text-sm'
                  : 'space-y-5 text-sm'
              }
            >
              {ocDetailTab === 'resumo' ? (
                (() => {
                  const cc = selectedOrder.materialRequest?.costCenter;
                  const costCenterLabel = (() => {
                    if (!cc) return '—';
                    const name = cc.name != null ? String(cc.name).trim() : '';
                    return name || '—';
                  })();
                  const showValues = [
                    'APPROVED',
                    'PENDING_PROOF_VALIDATION',
                    'PENDING_PROOF_CORRECTION',
                    'PENDING_NF_ATTACHMENT',
                    'SENT',
                    'FINALIZED',
                    'PARTIALLY_RECEIVED',
                    'RECEIVED'
                  ].includes(selectedOrder.status);
                  const notes = stripOcCorrectionBlocksFromNotes(selectedOrder.notes);
                  const description = selectedOrder.materialRequest?.description?.trim() || '';
                  const paymentDetails = selectedOrder.paymentDetails?.trim() || '';
                  const paymentTypeLabel = selectedOrder.paymentType
                    ? OC_PAYMENT_TYPE_LABELS[selectedOrder.paymentType] || selectedOrder.paymentType
                    : null;
                  const paymentConditionLabel = selectedOrder.paymentCondition
                    ? paymentConditionLabelMap[selectedOrder.paymentCondition] ||
                      selectedOrder.paymentCondition
                    : null;

                  const infoRows: { label: string; value: React.ReactNode; stacked?: boolean }[] = [
                    {
                      label: 'RM',
                      value: formatRmListDisplayId(selectedOrder.materialRequest?.requestNumber)
                    },
                    {
                      label: 'Centro de custo',
                      value: costCenterLabel
                    },
                    {
                      label: 'Ordem de serviço',
                      value: stripOsSePrefix(selectedOrder.materialRequest?.serviceOrder) || '—'
                    },
                    {
                      label: 'Data',
                      value: formatDate(selectedOrder.orderDate)
                    }
                  ];
                  if (paymentTypeLabel) {
                    infoRows.push({ label: 'Tipo de pagamento', value: paymentTypeLabel });
                  }
                  if (paymentConditionLabel) {
                    infoRows.push({ label: 'Condição', value: paymentConditionLabel });
                  }
                  if (selectedOrder.paymentType === 'AVISTA' && selectedOrder.pixKeyType) {
                    infoRows.push({ label: 'Tipo de chave PIX', value: selectedOrder.pixKeyType });
                  }
                  if (selectedOrder.paymentType === 'AVISTA' && selectedOrder.pixKey) {
                    infoRows.push({
                      label: 'Chave PIX',
                      value: (
                        <span className="break-all font-mono text-xs">{selectedOrder.pixKey}</span>
                      )
                    });
                  }
                  if (description) {
                    infoRows.push({
                      label: 'Descrição da solicitação',
                      value: <span className="whitespace-pre-wrap leading-relaxed">{description}</span>,
                      stacked: true
                    });
                  }
                  if (paymentDetails) {
                    infoRows.push({
                      label: 'Dados de pagamento',
                      value: <span className="whitespace-pre-wrap leading-relaxed">{paymentDetails}</span>,
                      stacked: true
                    });
                  }
                  if (notes) {
                    infoRows.push({
                      label: 'Observações',
                      value: <span className="whitespace-pre-wrap leading-relaxed">{notes}</span>,
                      stacked: true
                    });
                  }

                  return (
                    <div className="space-y-4">
                      <div className="overflow-hidden">
                        <div className="pt-1 pb-4 border-b border-gray-200 dark:border-gray-700">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            Fornecedor
                          </p>
                          <p className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                            {selectedOrder.supplier?.name || '—'}
                          </p>
                        </div>

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
                              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">
                                {row.label}
                              </dt>
                              <dd
                                className={
                                  row.stacked
                                    ? 'text-sm text-gray-900 dark:text-gray-100 text-left min-w-0'
                                    : 'text-sm text-gray-900 dark:text-gray-100 sm:text-right min-w-0'
                                }
                              >
                                {row.value}
                              </dd>
                            </div>
                          ))}
                        </dl>

                        {showValues ? (
                          <div className="grid grid-cols-3 gap-3 pt-4">
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-3.5">
                              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                Itens
                              </p>
                              <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                {formatBrlCompact(totalOrder(selectedOrder.items))}
                              </p>
                            </div>
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-3.5">
                              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                Frete
                              </p>
                              <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                {formatBrlCompact(orderFreightValue(selectedOrder))}
                              </p>
                            </div>
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-3.5">
                              <p className="text-[11px] font-medium text-red-600/80 dark:text-red-400/90">
                                Total
                              </p>
                              <p className="mt-1 text-sm sm:text-base font-semibold tabular-nums text-red-700 dark:text-red-300">
                                {formatBrlCompact(orderGrandTotal(selectedOrder))}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </div>

                    </div>
                  );
                })()
              ) : null}

              {ocDetailTab === 'materiais' ? (
                <OcOrderMaterialsTable
                  order={selectedOrder}
                  canReturnItem={canReturnOcItemOnOrder(selectedOrder)}
                  returningItemId={
                    returnItemToRmMutation.isPending && returnItemTarget
                      ? returnItemTarget.item.id
                      : null
                  }
                  onReturnItem={(item) => {
                    setReturnItemReason('');
                    setReturnItemTarget({ orderId: selectedOrder.id, item });
                  }}
                />
              ) : null}
              {ocDetailTab === 'pagamento' ? (
              <>
              {isOcBoletoPaymentType(selectedOrder.paymentType) && (
                <OcDetailSection>
                  {selectedOrder.status === 'APPROVED' && orderNeedsPaymentBoleto(selectedOrder) ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                      {(selectedOrder.paymentParcelCount ?? 1) > 1
                        ? 'A parcela atual é obrigatória. As demais podem ser anexadas agora, se quiser.'
                        : 'Informe vencimento e anexe o arquivo do boleto.'}
                    </p>
                  ) : null}
                  {selectedOrder.status === 'APPROVED' &&
                  orderNeedsPaymentBoleto(selectedOrder) &&
                  canSendCurrentBoletoToPayment(selectedOrder) ? (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Boletos anexados. Confirme o envio para liberar a fase Pagamento.
                    </p>
                  ) : null}
                  {selectedOrder.status === 'APPROVED' &&
                  !orderNeedsPaymentBoleto(selectedOrder) &&
                  canSendCurrentBoletoToPayment(selectedOrder) &&
                  selectedOrder.paymentBoletoPhaseReleased !== true ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                      O boleto da próxima parcela já está anexado. Confira o arquivo e, se
                      estiver errado, use Trocar antes de enviar ao financeiro.
                    </p>
                  ) : null}
                  <BoletoParcelasList
                    order={selectedOrder}
                    hideAttachmentLinks
                    editable={canEditBoletoParcels}
                    onSaved={handleBoletoParcelsSaved}
                    onReleaseToPayment={
                      canEditBoletoParcels &&
                      selectedOrder.paymentBoletoPhaseReleased !== true &&
                      (orderNeedsPaymentBoleto(selectedOrder) ||
                        canSendCurrentBoletoToPayment(selectedOrder))
                        ? (id) => releasePaymentBoletoPhaseMutation.mutate(id)
                        : undefined
                    }
                    releasePending={
                      releasePaymentBoletoPhaseMutation.isPending &&
                      releasePaymentBoletoPhaseMutation.variables === selectedOrder.id
                    }
                  />
                </OcDetailSection>
              )}
              {selectedOrder.status === 'PENDING_PROOF_VALIDATION' && canActValidateProofUi && (
                <OcDetailSection
                  title="Validação do comprovante"
                  description="Revise o arquivo enviado e confirme para liberar a fase Anexar NF."
                  className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
                >
                  {(() => {
                    const parcelCount = selectedOrder.paymentParcelCount ?? 1;
                    const isBoletoMulti =
                      isOcBoletoPaymentType(selectedOrder.paymentType) && parcelCount > 1;
                    const instRows = parsePaymentBoletoInstallments(
                      selectedOrder.paymentBoletoInstallments
                    );
                    const proofItems: { label: string; url: string; fileName: string }[] = [];

                    if (isBoletoMulti) {
                      const idx = proofValidationInstallmentIndex(selectedOrder);
                      if (idx != null) {
                        const row = instRows[idx];
                        const url = (row?.installmentProofUrl || '').trim();
                        if (url) {
                          proofItems.push({
                            label: `Parcela ${idx + 1}`,
                            url,
                            fileName:
                              row?.installmentProofName?.trim() ||
                              `Comprovante parcela ${idx + 1}`
                          });
                        }
                      }
                    } else {
                      const url =
                        (selectedOrder.paymentProofUrl || '').trim() ||
                        (instRows[0]?.installmentProofUrl || '').trim();
                      if (url) {
                        proofItems.push({
                          label: 'Comprovante de pagamento',
                          url,
                          fileName:
                            selectedOrder.paymentProofName?.trim() ||
                            instRows[0]?.installmentProofName?.trim() ||
                            'Comprovante pagamento'
                        });
                      }
                    }

                    return (
                      <>
                        {proofItems.length > 0 ? (
                          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                            {proofItems.map((item) => (
                              <li
                                key={item.url}
                                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                              >
                                <div className="min-w-0 flex items-start gap-3">
                                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                                    <FileText className="h-4 w-4" />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                      {item.label}
                                    </p>
                                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                      {item.fileName}
                                    </p>
                                  </div>
                                </div>
                                <OcAttachmentActions
                                  url={item.url}
                                  fileName={item.fileName}
                                  variant="buttons"
                                />
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Nenhum comprovante encontrado para revisar.
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={
                              validateProofMutation.isPending ||
                              requestProofCorrectionMutation.isPending
                            }
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
                            className="inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {validateProofMutation.isPending ? 'Validando…' : 'Validar'}
                          </button>
                          <button
                            type="button"
                            disabled={
                              validateProofMutation.isPending ||
                              requestProofCorrectionMutation.isPending
                            }
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
                            className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                          >
                            {requestProofCorrectionMutation.isPending ? 'Enviando…' : 'Solicitar correção'}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </OcDetailSection>
              )}
              {selectedOrder.status === 'PENDING_PROOF_VALIDATION' && !canActValidateProofUi && (
                <OcDetailSection
                  title="Validação do comprovante"
                  description="Comprovante enviado. Aguardando validação do financeiro."
                  className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
                >
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Assim que for validado, a OC segue para a fase Anexar NF.
                  </p>
                </OcDetailSection>
              )}
              {selectedOrder.status === 'PENDING_NF_ATTACHMENT' && (
                <OcDetailSection
                  title="Notas fiscais"
                  description="Informe o número da NF e anexe o arquivo. NFs do estoque sincronizam automaticamente."
                  className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
                >
                  {parseOcNfAttachments(selectedOrder.nfAttachments).length > 0 ? (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                      {parseOcNfAttachments(selectedOrder.nfAttachments).map((nf, idx) => (
                        <li
                          key={`${nf.url}-${idx}`}
                          className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0 flex items-start gap-3">
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                              <FileText className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {nf.number
                                  ? `Nota Fiscal ${nf.number}`
                                  : `Nota Fiscal ${idx + 1}`}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                {nf.name || 'Arquivo anexado'}
                                {isStockSyncedDocumentUrl(nf.url) ? ' · Estoque' : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <OcAttachmentActions
                              url={nf.url}
                              fileName={nf.name || `NF ${idx + 1}`}
                              variant="buttons"
                            />
                            {canUserManageNfOnOrder(selectedOrder, canActAttachNfUi) ? (
                              <button
                                type="button"
                                disabled={removeNfMutation.isPending}
                                onClick={() =>
                                  removeNfMutation.mutate({ id: selectedOrder.id, index: idx })
                                }
                                className="rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-red-400 disabled:opacity-50"
                              >
                                Remover
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhuma NF anexada ainda.
                    </p>
                  )}
                  {canUserManageNfOnOrder(selectedOrder, canActAttachNfUi) ? (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                          Número da Nota Fiscal *
                        </label>
                        <input
                          type="text"
                          value={nfNumberDraft}
                          onChange={(e) => setNfNumberDraft(e.target.value)}
                          placeholder="Ex.: 123456"
                          aria-invalid={nfNumberConflict}
                          className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 dark:bg-gray-800 dark:text-gray-100 ${
                            nfNumberConflict
                              ? 'border-red-500 ring-1 ring-red-500/40 dark:border-red-500'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}
                        />
                        {nfNumberConflictMessage ? (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                            {nfNumberConflictMessage}
                          </p>
                        ) : null}
                      </div>
                      <OcProofFilePicker
                        file={nfFileDraft}
                        uploading={appendNfMutation.isPending}
                        selectLabel="Selecionar NF"
                        emptyHint="PDF ou imagem"
                        onChange={(file) => setNfFileDraft(file)}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={
                            !nfFileDraft ||
                            !nfNumberDraft.trim() ||
                            nfNumberConflict ||
                            appendNfMutation.isPending
                          }
                          onClick={() => {
                            if (!nfFileDraft || !nfNumberDraft.trim() || nfNumberConflict) {
                              if (nfNumberConflictMessage) toast.error(nfNumberConflictMessage);
                              return;
                            }
                            appendNfMutation.mutate({
                              id: selectedOrder.id,
                              file: nfFileDraft,
                              nfNumber: nfNumberDraft
                            });
                          }}
                          className="inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {appendNfMutation.isPending ? 'Anexando…' : 'Anexar NF'}
                        </button>
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
                          className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
                        >
                          {completeOcToFinalizedMutation.isPending
                            ? 'Finalizando…'
                            : 'Finalizar OC'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </OcDetailSection>
              )}
              </>
              ) : null}
              {ocDetailTab === 'estoque' ? (
              (() => {
                  const stockReceipt = selectedOrder.stockReceipt;
                  const hasReceipts = Boolean(stockReceipt?.hasReceipts);
                  const exitBatches = stockReceipt?.exitBatches ?? [];
                  const hasExits =
                    Boolean(stockReceipt?.hasExits) || exitBatches.length > 0;
                  const hasAnyStockActivity = hasReceipts || hasExits;
                  const stockStillLoading =
                    isFetchingStockReceipt && selectedOrderStockReceipt === undefined;

                  if (stockStillLoading) {
                    return (
                      <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        Carregando movimentações do estoque…
                      </p>
                    );
                  }

                  if (!hasAnyStockActivity) {
                    return (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Nenhum recebimento ou saída registrado no estoque para esta OC.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-6">
                      {hasReceipts ? (
                        <>
                          <div className="table-scroll rounded-xl border border-gray-200 dark:border-gray-700 px-4 sm:px-5">
                            <table className="w-full text-xs sm:text-sm">
                              <thead>
                                <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                                  <th className="pt-4 pb-3 pr-2 font-medium text-xs text-gray-500 dark:text-gray-400">
                                    Material
                                  </th>
                                  <th className="pt-4 pb-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
                                    Pedido
                                  </th>
                                  <th className="pt-4 pb-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
                                    Recebido
                                  </th>
                                  <th className="pt-4 pb-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
                                    Falta
                                  </th>
                                  <th className="pt-4 pb-3 pl-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
                                    Unidade
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {(stockReceipt?.lines || []).map((line, idx) => (
                                  <tr
                                    key={`${line.materialLabel}-${idx}`}
                                    className="text-gray-900 dark:text-gray-100"
                                  >
                                    <td className="py-3 pr-2 align-top max-w-[200px] sm:max-w-none">
                                      {line.materialLabel}
                                    </td>
                                    <td className="py-3 px-2 text-center whitespace-nowrap align-top tabular-nums">
                                      {line.ordered.toLocaleString('pt-BR')}
                                    </td>
                                    <td className="py-3 px-2 text-center whitespace-nowrap align-top tabular-nums">
                                      {line.received.toLocaleString('pt-BR')}
                                    </td>
                                    <td
                                      className={`py-3 px-2 text-center whitespace-nowrap align-top font-semibold tabular-nums ${
                                        line.gap > 0
                                          ? 'text-red-600 dark:text-red-400'
                                          : 'text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      {line.gap.toLocaleString('pt-BR')}
                                    </td>
                                    <td className="py-3 pl-2 text-center whitespace-nowrap align-top">
                                      {line.unit}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <OcStockMovementHistoryList
                            title="Histórico de entradas"
                            batches={stockReceipt?.batches || []}
                          />
                        </>
                      ) : null}
                      <OcStockMovementHistoryList
                        title="Histórico de saídas"
                        batches={exitBatches}
                      />
                    </div>
                  );
                })()
              ) : null}
              {ocDetailTab === 'pagamento' ? (
              <>
              {selectedOrderInFinancialLaunchPhase && (
                <OcDetailSection
                  title="Controle financeiro"
                  className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
                >
                  {hasFinancialEntryForOc ? (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                      {financialEntriesByOc.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {formatFinancialCurrency(entry.finalValue ?? entry.originalValue)}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                              {MONTHS_PT[entry.paymentMonth - 1]}/{entry.paymentYear}
                              {entry.supplierName ? ` · ${entry.supplierName}` : ''}
                            </p>
                          </div>
                          {canActPaymentUi ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFinancialEntry(entry);
                                setFinancialEntryModalOpen(true);
                              }}
                              title="Editar"
                              aria-label="Editar lançamento"
                              className="inline-flex items-center justify-center p-1.5 rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/80 dark:hover:text-gray-100 shrink-0"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhum lançamento vinculado a esta OC.
                    </p>
                  )}
                  {canActPaymentUi ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFinancialEntry(null);
                        setFinancialEntryModalOpen(true);
                      }}
                      className="inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                    >
                      {hasFinancialEntryForOc ? 'Novo lançamento' : 'Registrar lançamento'}
                    </button>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Sem permissão na aba Pagamento para registrar lançamentos.
                    </p>
                  )}
                </OcDetailSection>
              )}
              {selectedOrder.status === 'APPROVED' &&
                selectedOrder.paymentType === 'BOLETO' &&
                selectedOrder.paymentBoletoPhaseReleased &&
                useParallelBoletoPaymentFlow(selectedOrder) && (
                  <OcDetailSection
                    title="Comprovantes"
                    className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
                  >
                    {(() => {
                      const n = selectedOrder.paymentParcelCount ?? 1;
                      const rows = parsePaymentBoletoInstallments(selectedOrder.paymentBoletoInstallments);
                      const targets = financeProofTargetInstallmentIndices(selectedOrder);
                      return (
                        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                          {Array.from({ length: n }, (_, idx) => {
                            if (!targets.includes(idx)) return null;
                            const row = rows[idx];
                            const st = rowStatus(row);
                            const proofUrl =
                              (row?.installmentProofUrl || '').trim() ||
                              (st === 'PAID' && (selectedOrder.paymentProofUrl || '').trim()
                                ? (selectedOrder.paymentProofUrl || '').trim()
                                : '');
                            return (
                              <li key={idx} className="py-3 first:pt-0 last:pb-0 space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                      Parcela {romanParcelLabel(idx)}
                                    </p>
                                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                      {installmentStatusLabel(st, !!((row?.boletoUrl || '').trim()), {
                                        orderStatus: selectedOrder.status,
                                        hasProof: !!proofUrl
                                      })}
                                    </p>
                                  </div>
                                  {proofUrl ? (
                                    <span
                                      className="inline-flex shrink-0 text-emerald-600 dark:text-emerald-400"
                                      title="Anexado"
                                      aria-label="Anexado"
                                    >
                                      <Check className="w-4 h-4" />
                                    </span>
                                  ) : null}
                                </div>
                                  {!proofUrl &&
                                  canActPaymentUi &&
                                  hasFinancialEntryForOcInstallment(financialEntriesByOc, {
                                    installmentIndex: idx,
                                    parcelCount: n,
                                    installmentDueDate: row?.dueDate
                                  }) ? (
                                    <OcProofFilePicker
                                      file={installmentProofDraftByIdx[idx] ?? null}
                                      uploading={
                                        attachBoletoInstallmentProofMutation.isPending &&
                                        attachBoletoInstallmentProofMutation.variables?.installmentIndex ===
                                          idx
                                      }
                                      onChange={(file) => {
                                        if (!file) return;
                                        setInstallmentProofDraftByIdx((prev) => ({
                                          ...prev,
                                          [idx]: file
                                        }));
                                        attachBoletoInstallmentProofMutation.mutate({
                                          id: selectedOrder.id,
                                          file,
                                          installmentIndex: idx
                                        });
                                      }}
                                    />
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        );
                      })()}
                    {!hasFinancialEntryForOc ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Registre o lançamento no Controle financeiro para anexar o comprovante.
                      </p>
                    ) : canActPaymentUi ? (
                      <button
                        type="button"
                        disabled={
                          submitProofValidationMutation.isPending ||
                          attachBoletoInstallmentProofMutation.isPending ||
                          !canClickSubmitProofValidation
                        }
                        onClick={() => handleSubmitProofValidation()}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {submitProofValidationMutation.isPending
                          ? 'Enviando…'
                          : 'Enviar para validação'}
                      </button>
                    ) : null}
                  </OcDetailSection>
                )}
              {selectedOrder.status === 'APPROVED' &&
                selectedOrder.paymentType === 'BOLETO' &&
                selectedOrderInFinancialLaunchPhase &&
                showSequentialInstallmentProofSection(selectedOrder) && (
                  <OcDetailSection
                    title="Comprovante"
                    className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
                  >
                    {(() => {
                      const instRows = parsePaymentBoletoInstallments(selectedOrder.paymentBoletoInstallments);
                      const curIdx = visiblePaymentBoletoInstallmentIndex(selectedOrder);
                      const curRow = curIdx != null ? instRows[curIdx] : undefined;
                      const proofUrl = (curRow?.installmentProofUrl || '').trim();
                      const parcelLabel =
                        curIdx != null
                          ? `${curIdx + 1}/${selectedOrder.paymentParcelCount ?? 1}`
                          : '';
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                Parcela {parcelLabel}
                              </p>
                              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                {proofUrl
                                  ? 'Comprovante anexado'
                                  : hasFinancialEntryForCurrentProofInstallment
                                    ? 'PDF ou imagem'
                                    : 'Aguardando lançamento financeiro'}
                              </p>
                            </div>
                            {proofUrl ? (
                              <span
                                className="inline-flex shrink-0 text-emerald-600 dark:text-emerald-400"
                                title="Anexado"
                                aria-label="Anexado"
                              >
                                <Check className="w-4 h-4" />
                              </span>
                            ) : null}
                          </div>
                          {hasFinancialEntryForCurrentProofInstallment && !proofUrl ? (
                            <OcProofFilePicker
                              file={installmentProofFileDraft}
                              uploading={attachBoletoInstallmentProofMutation.isPending}
                              onChange={(file) => {
                                if (!file || !selectedOrder) return;
                                setInstallmentProofFileDraft(file);
                                const idx = visiblePaymentBoletoInstallmentIndex(selectedOrder);
                                if (idx == null) {
                                  toast.error('Não foi possível identificar a parcela do comprovante.');
                                  return;
                                }
                                attachBoletoInstallmentProofMutation.mutate({
                                  id: selectedOrder.id,
                                  file,
                                  installmentIndex: idx
                                });
                              }}
                            />
                          ) : proofUrl ? (
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-sm text-gray-700 dark:text-gray-200">
                                {curRow?.installmentProofName?.trim() || 'Comprovante'}
                              </p>
                              <OcAttachmentActions
                                url={proofUrl}
                                fileName={
                                  curRow?.installmentProofName?.trim() || 'Comprovante'
                                }
                                variant="buttons"
                              />
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Registre o lançamento desta parcela no Controle financeiro para anexar.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    {hasFinancialEntryForCurrentProofInstallment && canActPaymentUi ? (
                      <button
                        type="button"
                        disabled={
                          submitProofValidationMutation.isPending ||
                          attachBoletoInstallmentProofMutation.isPending ||
                          !canClickSubmitProofValidation
                        }
                        onClick={() => handleSubmitProofValidation()}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {submitProofValidationMutation.isPending
                          ? 'Enviando…'
                          : 'Enviar para validação'}
                      </button>
                    ) : null}
                  </OcDetailSection>
                )}
              {((selectedOrder.status === 'APPROVED' &&
                selectedOrderInFinancialLaunchPhase &&
                !orderNeedsPaymentBoleto(selectedOrder) &&
                canAttachComprovanteForBoletoOrder(selectedOrder) &&
                !useParallelBoletoPaymentFlow(selectedOrder) &&
                !showSequentialInstallmentProofSection(selectedOrder)) ||
                selectedOrder.status === 'PENDING_PROOF_CORRECTION') && (
                <OcDetailSection
                  title={
                    selectedOrder.status === 'PENDING_PROOF_CORRECTION'
                      ? 'Correção do comprovante'
                      : 'Comprovante'
                  }
                  className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          Comprovante de pagamento
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {selectedOrder.paymentProofUrl?.trim() ||
                          lastPaidInstallmentProofUrl(selectedOrder)
                            ? 'Arquivo disponível'
                            : hasFinancialEntryForOc ||
                                selectedOrder.status === 'PENDING_PROOF_CORRECTION'
                              ? 'PDF ou imagem'
                              : 'Aguardando lançamento financeiro'}
                        </p>
                      </div>
                      {selectedOrder.paymentProofUrl?.trim() ||
                      lastPaidInstallmentProofUrl(selectedOrder) ? (
                        <span
                          className="inline-flex shrink-0 text-emerald-600 dark:text-emerald-400"
                          title="Anexado"
                          aria-label="Anexado"
                        >
                          <Check className="w-4 h-4" />
                        </span>
                      ) : null}
                    </div>
                    {selectedOrder.status === 'PENDING_PROOF_CORRECTION' && !canActProofCorrectionUi ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Apenas o financeiro pode substituir e reenviar.
                      </p>
                    ) : selectedOrder.status === 'PENDING_PROOF_CORRECTION' ||
                      hasFinancialEntryForOc ? (
                      <OcProofFilePicker
                        file={proofFileDraft}
                        uploading={attachPaymentProofMutation.isPending}
                        onChange={(file) => {
                          if (!file || !selectedOrder) return;
                          setProofFileDraft(file);
                          attachPaymentProofMutation.mutate({
                            id: selectedOrder.id,
                            file
                          });
                        }}
                      />
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Registre o lançamento no Controle financeiro para anexar.
                      </p>
                    )}
                  </div>
                  {(selectedOrder.status === 'PENDING_PROOF_CORRECTION'
                    ? canActProofCorrectionUi
                    : hasFinancialEntryForOc && canActPaymentUi) && (
                    <button
                      type="button"
                      disabled={
                        submitProofValidationMutation.isPending ||
                        attachPaymentProofMutation.isPending ||
                        !(
                          canClickSubmitProofValidation ||
                          (selectedOrder.status === 'PENDING_PROOF_CORRECTION' &&
                            Boolean(selectedOrder.paymentProofUrl?.trim()))
                        )
                      }
                      onClick={() => handleSubmitProofValidation()}
                      className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {submitProofValidationMutation.isPending
                        ? 'Enviando…'
                        : selectedOrder.status === 'PENDING_PROOF_CORRECTION'
                          ? 'Reenviar para validação'
                          : 'Enviar para validação'}
                    </button>
                  )}
                </OcDetailSection>
              )}
              </>
              ) : null}
              {ocDetailTab === 'documentos' ? (
              (() => {
                const documentEntries = collectOcDocumentEntries(
                  selectedOrder,
                  selectedOrderStockAttachments
                );
                const documentBlocks = groupOcDocumentBlocks(documentEntries, selectedOrder);
                const quoteMap = selectedOrder.quoteMap;
                const demandSheetFiles = parseRmDemandSheetAttachments(selectedOrder.materialRequest);
                const blockCls =
                  'rounded-xl border border-gray-200 p-4 dark:border-gray-700 space-y-0';

                return (
                  <div id="oc-quote-map" className="scroll-mt-4 space-y-4">
                    <OcDetailSection title="Ficha de Demanda" className={blockCls}>
                      <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {demandSheetFiles.length === 0 ? (
                          <OcDetailDocumentItem
                            label="Arquivo"
                            subtitle="Não anexado na RM"
                            pending
                          />
                        ) : (
                          demandSheetFiles.map((file, index) => (
                            <OcDetailDocumentItem
                              key={`${file.url}-${index}`}
                              label={
                                demandSheetFiles.length > 1 ? `Arquivo ${index + 1}` : 'Arquivo'
                              }
                              subtitle={file.name}
                              url={file.url}
                              fileName={file.name}
                            />
                          ))
                        )}
                      </div>
                    </OcDetailSection>

                    <OcDetailSection title="Mapa de Cotação" className={blockCls}>
                      <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {quoteMap ? (
                          <OcDetailDocumentItem
                            label="Arquivo"
                            subtitle={`Criado em ${formatDate(quoteMap.createdAt)}`}
                            onView={async () => {
                              try {
                                await openQuoteMapSnapshotPdf(quoteMap.id, selectedOrder.id);
                              } catch {
                                toast.error('Não foi possível abrir o mapa de cotação.');
                              }
                            }}
                            onDownload={async () => {
                              try {
                                await downloadQuoteMapSnapshotPdf(
                                  quoteMap.id,
                                  selectedOrder.orderNumber,
                                  selectedOrder.supplier?.name,
                                  selectedOrder.id
                                );
                              } catch {
                                toast.error('Não foi possível baixar o mapa de cotação.');
                              }
                            }}
                          />
                        ) : (
                          <OcDetailDocumentItem
                            label="Arquivo"
                            subtitle="Não anexado"
                            pending
                          />
                        )}
                      </div>
                    </OcDetailSection>

                    {documentBlocks.map((block) => (
                      <OcDetailSection key={block.id} title={block.title} className={blockCls}>
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                          {block.items.map((doc) => (
                            <OcDetailDocumentItem
                              key={doc.id}
                              label={doc.label}
                              subtitle={doc.subtitle}
                              url={doc.url}
                              fileName={doc.fileName}
                              pending={doc.pending}
                            />
                          ))}
                        </div>
                      </OcDetailSection>
                    ))}
                  </div>
                );
              })()
              ) : null}
              {ocDetailTab === 'comentarios' ? (
                <OcCommentsSection
                  purchaseOrderId={selectedOrder.id}
                  currentUserId={currentUserId}
                />
              ) : null}
            </div>
            )}
            </div>
            {(showListApprovalActions(selectedOrder.status) ||
              (selectedOrder.status === 'IN_REVIEW' && canEditOcInReview)) && (
            <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 px-5 py-3 rounded-b-xl">
            <div className="flex flex-wrap gap-2">
              {showListApprovalActions(selectedOrder.status) && (
                <button
                  type="button"
                  onClick={() =>
                    approveMutation.mutate({
                      id: selectedOrder.id,
                      currentStatus: selectedOrder.status,
                      unbOnlyGestor: isOcUnbCostCenter(selectedOrder)
                    })
                  }
                  disabled={approveMutation.isPending}
                  className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4 shrink-0" />
                  {approvalLabel(selectedOrder.status, isOcUnbCostCenter(selectedOrder))}
                </button>
              )}
              {showListApprovalActions(selectedOrder.status) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectTarget(selectedOrder);
                      setRejectReason('');
                    }}
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => openOcCorrectionModal(selectedOrder)}
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                  >
                    Correção OC
                  </button>
                </>
              )}
              {selectedOrder.status === 'IN_REVIEW' && canEditOcInReview && (
                <>
                  <button
                    type="button"
                    onClick={handleOpenEditOc}
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => resubmitOcMutation.mutate(selectedOrder)}
                    disabled={resubmitOcMutation.isPending}
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {resubmitOcMutation.isPending ? 'Enviando…' : 'Enviar para Aprovação'}
                  </button>
                </>
              )}
            </div>
            </div>
            )}
          </div>
        </AppModalOverlay>
        {selectedOrderConfirmUi}
        </>,
        document.body
      )
      : null}

      {boletoParcelModalOrder && (
        <BoletoParcelasModal
          key={boletoParcelModalOrder.id}
          order={boletoParcelModalOrder}
          editable={
            boletoParcelModalOrder.status === 'APPROVED' &&
            boletoParcelModalOrder.paymentType === 'BOLETO' &&
            canActAttachBoletoUi
          }
          onClose={() => setBoletoParcelModalOrder(null)}
          onSaved={handleBoletoParcelsSaved}
          onReleaseToPayment={(id) => releasePaymentBoletoPhaseMutation.mutate(id)}
          releasePending={
            releasePaymentBoletoPhaseMutation.isPending &&
            releasePaymentBoletoPhaseMutation.variables === boletoParcelModalOrder.id
          }
        />
      )}

      {selectedOrder && financialEntryModalOpen && (
        <FinancialControlEntryFormModal
          isOpen={financialEntryModalOpen}
          onClose={() => {
            setFinancialEntryModalOpen(false);
            setEditingFinancialEntry(null);
          }}
          initialForm={
            editingFinancialEntry ? undefined : financialEntryInitialFormFromSelectedOrder
          }
          editingEntry={editingFinancialEntry}
          lockOcNumber={!editingFinancialEntry}
          simplifiedFromOc={!editingFinancialEntry}
          title={
            editingFinancialEntry
              ? `Editar lançamento — ${selectedOrder.orderNumber}`
              : `Registrar pagamento — ${selectedOrder.orderNumber}`
          }
        />
      )}

      {isApprovalFiltersModalOpen && (
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsApprovalFiltersModalOpen(false)}
            aria-hidden
          />
          <div className="relative mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
              <button
                type="button"
                onClick={() => setIsApprovalFiltersModalOpen(false)}
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                aria-label="Fechar filtros"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Exibir
                </label>
                <StringSingleSelectDropdown
                  value={approvalListPhase}
                  onChange={(v) => setApprovalListPhase(v as OcApprovalListPhase)}
                  options={OC_APPROVAL_LIST_PHASE_OPTIONS}
                  allowEmpty={false}
                />
              </div>
              {approvalListPhase === 'approved_by_me' ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Lista as OCs em que você registrou aprovação nesta fase (compras, gestor ou
                  diretoria), em qualquer status atual do fluxo.
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setApprovalListPhase('pending');
                  setIsApprovalFiltersModalOpen(false);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <RotateCcw className="h-4 w-4" />
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setIsApprovalFiltersModalOpen(false)}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Aplicar
              </button>
            </div>
          </div>
        </AppModalOverlay>
      )}

      <Modal
        isOpen={isPaymentDueFiltersModalOpen}
        onClose={() => setIsPaymentDueFiltersModalOpen(false)}
        title="Filtros — Pagamento"
        size="md"
        contentOverflowVisible
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Exibe OCs cuja parcela em aberto vence no período informado.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Vencimento (de)
              </label>
              <DatePickerField
                value={paymentDueFilters.dueDateFrom}
                onChange={(dueDateFrom) =>
                  setPaymentDueFilters((f) => ({ ...f, dueDateFrom }))
                }
                placeholder="dd/mm/aaaa"
                noFocusRing
                aria-label="Vencimento de"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Vencimento (até)
              </label>
              <DatePickerField
                value={paymentDueFilters.dueDateTo}
                onChange={(dueDateTo) => setPaymentDueFilters((f) => ({ ...f, dueDateTo }))}
                placeholder="dd/mm/aaaa"
                noFocusRing
                aria-label="Vencimento até"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPaymentDueFiltersModalOpen(false)}
            >
              Fechar
            </Button>
          </div>
        </div>
      </Modal>

      {isFinalizedFiltersModalOpen && (
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsFinalizedFiltersModalOpen(false)}
            aria-hidden
          />
          <div className="relative mx-4 w-full max-w-2xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
              <button
                type="button"
                onClick={() => setIsFinalizedFiltersModalOpen(false)}
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                aria-label="Fechar filtros"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Data OC (de)
                  </label>
                  <input
                    type="date"
                    value={finalizedFilters.orderDateFrom}
                    onChange={(e) =>
                      setFinalizedFilters((f) => ({ ...f, orderDateFrom: e.target.value }))
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Data OC (até)
                  </label>
                  <input
                    type="date"
                    value={finalizedFilters.orderDateTo}
                    onChange={(e) =>
                      setFinalizedFilters((f) => ({ ...f, orderDateTo: e.target.value }))
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Fornecedor
                  </label>
                  <StringSingleSelectDropdown
                    value={finalizedFilters.supplierId}
                    onChange={(supplierId) =>
                      setFinalizedFilters((f) => ({ ...f, supplierId }))
                    }
                    options={supplierFilterSelectOptions}
                    allowEmpty={false}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Centro de custo
                  </label>
                  <StringSingleSelectDropdown
                    value={finalizedFilters.costCenterId}
                    onChange={(costCenterId) =>
                      setFinalizedFilters((f) => ({ ...f, costCenterId }))
                    }
                    options={costCenterFilterSelectOptions}
                    allowEmpty={false}
                  />
                </div>
              </div>
              <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                A exportação CSV usa a busca do cabeçalho e estes filtros (até 25 mil linhas).
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  clearFinalizedFilters();
                  setIsFinalizedFiltersModalOpen(false);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <RotateCcw className="h-4 w-4" />
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setIsFinalizedFiltersModalOpen(false)}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </AppModalOverlay>
      )}

      {ocActionMenu &&
        orderForActionMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0"
            style={{ zIndex: Z_ACTION_MENU }}
            onClick={() => setOcActionMenu(null)}
          >
            <div
              role="menu"
              className="absolute w-56 overflow-y-auto overflow-x-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
              style={{
                top: ocActionMenu.top,
                left: ocActionMenu.left,
                maxHeight: ocActionMenu.maxHeight,
                transform: ocActionMenu.placement === 'above' ? 'translateY(-100%)' : undefined,
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOcActionMenu(null);
                  openOrderDetail(orderForActionMenu);
                }}
                className={OC_MENU_ITEM_CLASS}
              >
                <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>Ver detalhes</span>
              </button>
              {activeTab === 'ATTACH_BOLETO' &&
                showInAttachBoletoTab(orderForActionMenu) &&
                canActAttachBoletoUi && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOcActionMenu(null);
                      setBoletoParcelModalOrder(orderForActionMenu);
                    }}
                    className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                  >
                    <Banknote className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
                    <span>Anexar boleto</span>
                  </button>
                )}
              {activeTab === 'ATTACH_BOLETO' &&
                canActAttachBoletoUi &&
                canSendCurrentBoletoToPayment(orderForActionMenu) &&
                orderForActionMenu.paymentBoletoPhaseReleased !== true && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={
                      releasePaymentBoletoPhaseMutation.isPending &&
                      releasePaymentBoletoPhaseMutation.variables === orderForActionMenu.id
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setOcActionMenu(null);
                      releasePaymentBoletoPhaseMutation.mutate(orderForActionMenu.id);
                    }}
                    className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                  >
                    {releasePaymentBoletoPhaseMutation.isPending &&
                    releasePaymentBoletoPhaseMutation.variables === orderForActionMenu.id ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Send className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    )}
                    <span>Enviar para Pagamento</span>
                  </button>
                )}
              {canActPaymentUi &&
                orderForActionMenu.status === 'APPROVED' &&
                activeTab !== 'ATTACH_BOLETO' &&
                isOcInFinancialLaunchPhase(orderForActionMenu) &&
                (() => {
                  const menuFinanceEntries =
                    financialEntriesByOcNumber.get(
                      orderForActionMenu.orderNumber.trim().toLowerCase()
                    ) ?? [];
                  const menuPaymentStatus = getOcPaymentListStatus(
                    orderForActionMenu,
                    menuFinanceEntries
                  );
                  if (menuPaymentStatus === 'lancado') return null;
                  return (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOcActionMenu(null);
                        setFinancialEntryOrder(orderForActionMenu);
                      }}
                      className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                    >
                      <CircleDollarSign className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>Fazer lançamento</span>
                    </button>
                  );
                })()}
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOcActionMenu(null);
                  handleExportPdf(orderForActionMenu.id);
                }}
                disabled={pdfExportingId === orderForActionMenu.id}
                className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
              >
                {pdfExportingId === orderForActionMenu.id ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-600 dark:text-slate-300" />
                ) : (
                  <Download className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
                )}
                <span>Baixar OC</span>
              </button>
              {canUserAttachNfOnOrder(orderForActionMenu, canActAttachNfUi) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOcActionMenu(null);
                    openOrderDetail(orderForActionMenu);
                  }}
                  className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                >
                  <FileText className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                  <span>Anexar NF</span>
                </button>
              )}
              {canUserFinalizeOcWithNf(orderForActionMenu, canActAttachNfUi) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOcActionMenu(null);
                    if (
                      !window.confirm(
                        'Finalizar esta OC? Ela irá para a fase Finalizadas. Confirme se todas as NFs necessárias foram anexadas.'
                      )
                    ) {
                      return;
                    }
                    completeOcToFinalizedMutation.mutate(orderForActionMenu.id);
                  }}
                  disabled={completeOcToFinalizedMutation.isPending}
                  className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                >
                  {completeOcToFinalizedMutation.isPending ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Send className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  )}
                  <span>Finalizar OC</span>
                </button>
              )}
              {orderForActionMenu.status === 'PENDING_PROOF_VALIDATION' && canActValidateProofUi && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOcActionMenu(null);
                    if (
                      !window.confirm(
                        'Confirmar validação do comprovante e liberar a fase Anexar NF para o comprador?'
                      )
                    ) {
                      return;
                    }
                    validateProofMutation.mutate(orderForActionMenu.id);
                  }}
                  disabled={validateProofMutation.isPending}
                  className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                >
                  {validateProofMutation.isPending ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-600 dark:text-teal-400" />
                  ) : (
                    <Check className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                  )}
                  <span>Validar comprovante</span>
                </button>
              )}
              {showListApprovalActions(orderForActionMenu.status) && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOcActionMenu(null);
                      approveMutation.mutate({
                        id: orderForActionMenu.id,
                        currentStatus: orderForActionMenu.status,
                        unbOnlyGestor: isOcUnbCostCenter(orderForActionMenu)
                      });
                    }}
                    disabled={approveMutation.isPending}
                    className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-green-600 dark:text-green-400" />
                    ) : (
                      <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                    )}
                    <span>
                      {approvalLabel(
                        orderForActionMenu.status,
                        isOcUnbCostCenter(orderForActionMenu)
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOcActionMenu(null);
                      openOcCorrectionModal(orderForActionMenu);
                    }}
                    className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                  >
                    <Wrench className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>Enviar para correção</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOcActionMenu(null);
                      setRejectTarget(orderForActionMenu);
                      setRejectReason('');
                    }}
                    className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                  >
                    <X className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>Cancelar</span>
                  </button>
                </>
              )}
              {orderForActionMenu.status === 'IN_REVIEW' &&
                (canActOcCorrection ||
                  (!!orderForActionMenu.creator?.id &&
                    currentUserId === orderForActionMenu.creator.id)) && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOcActionMenu(null);
                        handleOpenEditOcForOrder(orderForActionMenu);
                      }}
                      disabled={orderDetailLoadingId === orderForActionMenu.id}
                      className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                    >
                      {orderDetailLoadingId === orderForActionMenu.id ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-600 dark:text-slate-300" />
                      ) : (
                        <Pencil className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
                      )}
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOcActionMenu(null);
                        resubmitOcMutation.mutate(orderForActionMenu);
                      }}
                      disabled={resubmitOcMutation.isPending}
                      className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                    >
                      {resubmitOcMutation.isPending ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <Send className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      )}
                      <span>Enviar para Aprovação</span>
                    </button>
                  </>
                )}
            </div>
          </div>,
          document.body
        )}

      <FinancialControlEntryModal
        isOpen={!!financialEntryOrder}
        onClose={() => setFinancialEntryOrder(null)}
        initialValues={financialEntryInitialValues}
        simplifiedFromOc
      />
    </>
  );
}
