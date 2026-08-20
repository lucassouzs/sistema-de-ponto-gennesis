import { prisma, getPrisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BorderService, BorderData } from './BorderService';
import { stockShortfallService } from './StockShortfallService';
import { isUnbCostCenterRecord } from '../lib/unbCostCenterScope';
import {
  collectInvoicesForOrderFromMovements,
  collectLatestPaymentSlipsPerParcelFromMovements,
  extractOcNumberFromMovementNotes,
  type StockPaymentSlipParsed
} from '../utils/stockMovementNotes';
import { isValidNfNumber, normalizeNfNumberKey } from '../utils/nfInvoiceNumber';
import {
  isOcStatusAllowingReturnItemToRm,
  OC_STATUSES_COVERING_RM_ITEMS,
} from '../lib/rmProcurementCoverage';
import { assertUserCanReturnOcItemToRm } from '../lib/ocApprovalAccess';

/** Lock distinto do requestNumber de RM (91827365) — serializa só a sequência de OC. */
const PURCHASE_ORDER_NUMBER_ADVISORY_LOCK = 91827366;

/**
 * Transação com advisory lock + generateOrderNumber + create.
 * Include de create é enxuto (purchaseOrderIncludeCreate) para não segurar o lock
 * com joins pesados. Timeouts altos cobrem fila sob concorrência na Railway.
 */
const PURCHASE_ORDER_CREATE_TX_OPTIONS = {
  maxWait: Number(process.env.PURCHASE_ORDER_CREATE_TX_MAX_WAIT_MS) || 30_000,
  timeout: Number(process.env.PURCHASE_ORDER_CREATE_TX_TIMEOUT_MS) || 90_000,
};

/**
 * updateStatus: update + include detalhado (joins pesados).
 * Sob concorrência (http.batch do k6) + pool connection_limit=5 + latência Railway,
 * o default Prisma (maxWait 2s / timeout 5s) estoura P2028.
 */
const PURCHASE_ORDER_STATUS_TX_OPTIONS = {
  maxWait: Number(process.env.PURCHASE_ORDER_STATUS_TX_MAX_WAIT_MS) || 30_000,
  timeout: Number(process.env.PURCHASE_ORDER_STATUS_TX_TIMEOUT_MS) || 90_000,
};

function labelForOcCorrectionSource(previousStatus: string): string {
  if (previousStatus === 'PENDING') return 'Gestor';
  if (previousStatus === 'PENDING_DIRETORIA') return 'Diretoria';
  if (previousStatus === 'PENDING_COMPRAS' || previousStatus === 'DRAFT') return 'Compras';
  return 'Aprovação';
}

async function resolveUserDisplayName(userId?: string): Promise<string | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  const name = (user?.name || user?.email || '').trim();
  return name || null;
}

function buildOcCorrectionNoteHeader(params: {
  prefix: string;
  role: string;
  actorName: string | null;
}): string {
  const at = new Date().toLocaleString('pt-BR');
  if (params.actorName) {
    return `[${params.prefix} — ${params.role} em ${at} — ${params.actorName}]`;
  }
  return `[${params.prefix} — ${params.role} em ${at}]`;
}

export type BoletoInstallmentPaymentStatus = 'PENDING_BOLETO' | 'AWAITING_PAYMENT' | 'PAID';

export type BoletoInstallmentStored = {
  amount: number;
  dueDate: string;
  boletoUrl: string | null;
  boletoName: string | null;
  paymentStatus?: BoletoInstallmentPaymentStatus | null;
  /** Comprovante do pagamento desta parcela (financeiro, enquanto AWAITING_PAYMENT ou após PAID) */
  installmentProofUrl?: string | null;
  installmentProofName?: string | null;
};

function normalizeParcelDueDaysJson(input: unknown): number[] {
  if (input == null) return [];
  if (Array.isArray(input)) {
    return input
      .map((x) => Math.round(Number(x)))
      .filter((n) => Number.isFinite(n) && n >= 0);
  }
  return [];
}

function parseStoredInstallments(raw: unknown): BoletoInstallmentStored[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map((x: Record<string, unknown>) => {
    const ps = x.paymentStatus;
    const paymentStatus =
      ps === 'PENDING_BOLETO' || ps === 'AWAITING_PAYMENT' || ps === 'PAID' ? ps : undefined;
    const ipu = x.installmentProofUrl;
    const ipn = x.installmentProofName;
    return {
      amount: Number(x.amount),
      dueDate: typeof x.dueDate === 'string' ? x.dueDate.slice(0, 10) : '',
      boletoUrl: typeof x.boletoUrl === 'string' && x.boletoUrl.trim() ? String(x.boletoUrl).trim() : null,
      boletoName: typeof x.boletoName === 'string' && x.boletoName.trim() ? String(x.boletoName).trim() : null,
      paymentStatus,
      installmentProofUrl:
        typeof ipu === 'string' && ipu.trim() ? String(ipu).trim() : null,
      installmentProofName:
        typeof ipn === 'string' && ipn.trim() ? String(ipn).trim() : null
    };
  });
}

function rowStatus(row: BoletoInstallmentStored | undefined): BoletoInstallmentPaymentStatus {
  const s = row?.paymentStatus;
  if (s === 'PAID' || s === 'AWAITING_PAYMENT' || s === 'PENDING_BOLETO') return s;
  return 'PENDING_BOLETO';
}

/** Todas as parcelas com boleto e sem paymentStatus (cadastro antigo). */
function isLegacyBulkNoExplicitStatus(inst: BoletoInstallmentStored[], parcelCount: number): boolean {
  if (inst.length < parcelCount) return false;
  for (let i = 0; i < parcelCount; i++) {
    if (!((inst[i]?.boletoUrl || '').trim())) return false;
    if (inst[i]?.paymentStatus) return false;
  }
  return true;
}

function allMultiInstallmentsPaid(
  inst: BoletoInstallmentStored[],
  parcelCount: number
): boolean {
  if (inst.length < parcelCount) return false;
  for (let i = 0; i < parcelCount; i++) {
    if (rowStatus(inst[i]) !== 'PAID') return false;
  }
  return true;
}

function allInstallmentsHaveBoleto(inst: BoletoInstallmentStored[], parcelCount: number): boolean {
  if (parcelCount <= 1 || inst.length < parcelCount) return false;
  for (let i = 0; i < parcelCount; i++) {
    if (!((inst[i]?.boletoUrl || '').trim())) return false;
  }
  return true;
}

function useParallelBoletoPaymentFlow(_inst: BoletoInstallmentStored[], _parcelCount: number): boolean {
  return false;
}

/** Parcela corrente para comprovante/lançamento (sequencial). */
function resolveSequentialInstallmentProofIndex(
  inst: BoletoInstallmentStored[],
  parcelCount: number
): number {
  const aw = inst.findIndex((r) => rowStatus(r) === 'AWAITING_PAYMENT');
  if (aw >= 0 && aw < parcelCount) return aw;
  for (let i = 0; i < parcelCount; i++) {
    if (rowStatus(inst[i]) === 'PAID') continue;
    if ((inst[i]?.boletoUrl || '').trim()) return i;
  }
  return -1;
}

function firstNonPaidInstallmentWithProof(
  inst: BoletoInstallmentStored[],
  parcelCount: number
): number {
  for (let i = 0; i < parcelCount; i++) {
    if (rowStatus(inst[i]) === 'PAID') continue;
    if ((inst[i]?.installmentProofUrl || '').trim()) return i;
  }
  return -1;
}

function allInstallmentsHavePaymentProof(inst: BoletoInstallmentStored[], parcelCount: number): boolean {
  if (inst.length < parcelCount) return false;
  for (let i = 0; i < parcelCount; i++) {
    if (!((inst[i]?.installmentProofUrl || '').trim())) return false;
  }
  return true;
}

/** Coloca parcelas com boleto em AWAITING_PAYMENT (fluxo em lote). */
function promoteParallelInstallmentsToAwaitingPayment(
  inst: BoletoInstallmentStored[]
): BoletoInstallmentStored[] {
  return inst.map((row) => {
    const st = rowStatus(row);
    if (st === 'PAID') return row;
    if (!((row.boletoUrl || '').trim())) return row;
    if (st === 'AWAITING_PAYMENT') return row;
    return { ...row, paymentStatus: 'AWAITING_PAYMENT' as const };
  });
}

/** Replica comprovante geral da OC nas parcelas pagas que ainda não têm comprovante por parcela. */
function spreadOrderPaymentProofToPaidInstallments(
  inst: BoletoInstallmentStored[],
  parcelCount: number,
  paymentProofUrl: string | null | undefined,
  paymentProofName: string | null | undefined
): BoletoInstallmentStored[] | null {
  const url = (paymentProofUrl || '').trim();
  if (!url || parcelCount <= 1) return null;
  let changed = false;
  const next = inst.map((row, i) => {
    if (i >= parcelCount) return row;
    if ((row.installmentProofUrl || '').trim()) return row;
    if (rowStatus(row) !== 'PAID') return row;
    changed = true;
    return {
      ...row,
      installmentProofUrl: url,
      installmentProofName: (paymentProofName || '').trim() || null
    };
  });
  return changed ? next : null;
}

export type NfAttachmentStored = {
  url: string;
  name: string | null;
  uploadedAt: string;
  /** Número da nota fiscal (obrigatório em novos anexos). */
  number?: string | null;
};

function parseNfAttachments(raw: unknown): NfAttachmentStored[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: NfAttachmentStored[] = [];
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
        : new Date().toISOString();
    const number =
      typeof rec.number === 'string' && rec.number.trim() ? String(rec.number).trim() : null;
    out.push({ url: u, name, uploadedAt, number });
  }
  return out;
}

async function findInvoiceNumberConflict(
  numberRaw: string,
  excludePurchaseOrderId?: string
): Promise<{ orderNumber: string; purchaseOrderId: string } | null> {
  const numberKey = normalizeNfNumberKey(numberRaw);
  if (!numberKey) return null;
  const existing = await prisma.purchaseOrderInvoiceNumber.findUnique({
    where: { numberKey },
    select: {
      purchaseOrderId: true,
      purchaseOrder: { select: { orderNumber: true } }
    }
  });
  if (!existing) return null;
  if (excludePurchaseOrderId && existing.purchaseOrderId === excludePurchaseOrderId) {
    return null;
  }
  return {
    purchaseOrderId: existing.purchaseOrderId,
    orderNumber: existing.purchaseOrder.orderNumber
  };
}

/** `OC-2026-0008` → `8` (rótulo curto nas mensagens). */
function formatOcShortLabel(orderNumber: string): string {
  const trimmed = orderNumber.trim();
  const match = trimmed.match(/^OC-\d{4}-(\d+)$/i);
  if (match) return String(parseInt(match[1], 10));
  const lastSegment = trimmed.split('-').pop();
  if (lastSegment && /^\d+$/.test(lastSegment)) {
    return String(parseInt(lastSegment, 10));
  }
  return trimmed;
}

/**
 * Preenche o número da NF nos lançamentos do Controle Financeiro da OC
 * (quando a NF é anexada depois do lançamento na fase Pagamento).
 */
async function prependNfToFinancialControlParcels(
  orderNumber: string,
  nfNumber: string
): Promise<void> {
  const oc = orderNumber.trim();
  const nf = nfNumber.trim();
  if (!oc || !nf) return;
  const entries = await prisma.financialControlEntry.findMany({
    where: { ocNumber: { equals: oc, mode: 'insensitive' } },
    select: { id: true, parcelNumber: true, nfNumber: true }
  });
  for (const entry of entries) {
    const currentNf = (entry.nfNumber || '').trim();
    let parcel = (entry.parcelNumber || '').trim();
    // Dados legados ainda combinados em parcelNumber (ex.: 556713-2/2)
    const combined =
      parcel.match(/^(\d+)-(\d+\/\d+)$/) || parcel.match(/^(\d+)-(\d{1,3})$/);
    if (combined) {
      const legacyNf = combined[1].trim();
      parcel = combined[2];
      if (!currentNf || currentNf === legacyNf) {
        await prisma.financialControlEntry.update({
          where: { id: entry.id },
          data: {
            nfNumber: currentNf || legacyNf || nf,
            parcelNumber: parcel || null
          }
        });
        continue;
      }
    }
    if (currentNf) continue;
    await prisma.financialControlEntry.update({
      where: { id: entry.id },
      data: {
        nfNumber: nf,
        ...(parcel ? { parcelNumber: parcel } : {})
      }
    });
  }
}

async function claimInvoiceNumberForOrder(
  purchaseOrderId: string,
  numberRaw: string
): Promise<string> {
  const display = String(numberRaw || '').trim();
  const numberKey = normalizeNfNumberKey(display);
  if (!numberKey) {
    throw new Error('Número da nota fiscal é obrigatório');
  }
  const conflict = await findInvoiceNumberConflict(display, purchaseOrderId);
  if (conflict) {
    throw new Error(`Nota fiscal já existe na OC ${formatOcShortLabel(conflict.orderNumber)}`);
  }
  try {
    await prisma.purchaseOrderInvoiceNumber.upsert({
      where: { numberKey },
      create: {
        numberKey,
        number: display,
        purchaseOrderId
      },
      update: {
        number: display,
        purchaseOrderId
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raced = await findInvoiceNumberConflict(display, purchaseOrderId);
      throw new Error(
        raced
          ? `Nota fiscal já existe na OC ${formatOcShortLabel(raced.orderNumber)}`
          : 'Nota fiscal já existe'
      );
    }
    throw err;
  }
  return display;
}

async function releaseInvoiceNumberForOrder(
  purchaseOrderId: string,
  numberRaw: string | null | undefined
): Promise<void> {
  const numberKey = normalizeNfNumberKey(numberRaw);
  if (!numberKey) return;
  await prisma.purchaseOrderInvoiceNumber.deleteMany({
    where: { purchaseOrderId, numberKey }
  });
}

/** Departamento financeiro ou cargo Administrador (mesma regra do front em gerenciar materiais). */
async function assertUserIsFinanceOrAdmin(
  userId: string | undefined,
  errorMessage = 'Apenas o financeiro pode realizar esta ação'
): Promise<void> {
  if (!userId) {
    throw new Error('Usuário não autenticado');
  }
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { employee: { select: { department: true, position: true } } }
  });
  const pos = row?.employee?.position?.trim();
  const dept = (row?.employee?.department || '').toLowerCase();
  if (pos === 'Administrador' || dept.includes('financeiro')) return;
  throw new Error(errorMessage);
}

async function resolvePaymentProofUrlForOrder(order: {
  paymentProofUrl: string | null;
  paymentType: string | null;
  paymentCondition: string | null;
  paymentBoletoInstallments: unknown;
}): Promise<string> {
  let proofUrl = (order.paymentProofUrl || '').trim();
  if (proofUrl) return proofUrl;
  if (order.paymentType === 'BOLETO') {
    const [meta] = await enrichOrdersParcelPlans([
      { paymentCondition: order.paymentCondition }
    ]);
    if (meta.paymentParcelCount > 1) {
      const inst = parseStoredInstallments(order.paymentBoletoInstallments);
      if (allMultiInstallmentsPaid(inst, meta.paymentParcelCount)) {
        const last = inst[meta.paymentParcelCount - 1];
        const u = (last?.installmentProofUrl || '').trim();
        if (u) return u;
      }
      if (useParallelBoletoPaymentFlow(inst, meta.paymentParcelCount)) {
        for (let i = meta.paymentParcelCount - 1; i >= 0; i--) {
          const u = (inst[i]?.installmentProofUrl || '').trim();
          if (u) return u;
        }
      }
    }
  }
  return '';
}

function ymdAddDays(ymdOrDate: Date | string, addDays: number): string {
  const d = typeof ymdOrDate === 'string' ? new Date(ymdOrDate) : new Date(ymdOrDate);
  if (Number.isNaN(d.getTime())) {
    const t = new Date();
    t.setDate(t.getDate() + addDays);
    return t.toISOString().slice(0, 10);
  }
  d.setDate(d.getDate() + addDays);
  return d.toISOString().slice(0, 10);
}

function splitAmountInInstallments(total: number, n: number): number[] {
  if (!Number.isFinite(total) || n < 1) return Array.from({ length: Math.max(n, 0) }, () => 0);
  const cents = Math.round(total * 100);
  const q = Math.floor(cents / n);
  const r = cents % n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = q + (i === n - 1 ? r : 0);
    out.push(c / 100);
  }
  return out;
}

function buildEmptyPaymentInstallments(
  parcelCount: number,
  parcelDueDays: number[],
  totalAmount: number,
  orderDate: Date
): BoletoInstallmentStored[] {
  const amounts = splitAmountInInstallments(totalAmount, parcelCount);
  return Array.from({ length: parcelCount }, (_, i) => ({
    amount: amounts[i] ?? 0,
    dueDate: ymdAddDays(
      orderDate,
      parcelDueDays[i] ?? parcelDueDays[parcelDueDays.length - 1] ?? 30
    ),
    boletoUrl: null,
    boletoName: null,
    paymentStatus: 'PENDING_BOLETO' as const,
  }));
}

function buildCreationPaymentInstallments(
  drafts: { boletoUrl: string; boletoName?: string | null; dueDate?: string | null }[],
  parcelCount: number,
  parcelDueDays: number[],
  totalAmount: number,
  orderDate: Date
): BoletoInstallmentStored[] {
  const amounts = splitAmountInInstallments(totalAmount, parcelCount);
  return Array.from({ length: parcelCount }, (_, i) => {
    const draftDue = (drafts[i]?.dueDate || '').trim().slice(0, 10);
    const dueDate =
      /^\d{4}-\d{2}-\d{2}$/.test(draftDue)
        ? draftDue
        : ymdAddDays(
            orderDate,
            parcelDueDays[i] ?? parcelDueDays[parcelDueDays.length - 1] ?? 30
          );
    return {
      amount: amounts[i] ?? 0,
      dueDate,
      boletoUrl: (drafts[i]?.boletoUrl || '').trim(),
      boletoName: (drafts[i]?.boletoName || '').trim() || null,
      paymentStatus: 'PENDING_BOLETO' as const,
    };
  });
}

async function enrichOrdersParcelPlans<T extends { paymentCondition: string | null }>(
  orders: T[]
): Promise<Array<T & { paymentParcelCount: number; paymentParcelDueDays: number[] }>> {
  const codes = [...new Set(orders.map((o) => o.paymentCondition).filter(Boolean))] as string[];
  const condMap = new Map<string, { parcelCount: number; parcelDueDays: unknown }>();
  if (codes.length > 0) {
    const conds = await prisma.paymentCondition.findMany({ where: { code: { in: codes } } });
    for (const c of conds) condMap.set(c.code, { parcelCount: c.parcelCount, parcelDueDays: c.parcelDueDays });
  }
  return orders.map((o) => {
    const c = o.paymentCondition ? condMap.get(o.paymentCondition) : undefined;
    const paymentParcelCount = c?.parcelCount && c.parcelCount >= 1 ? c.parcelCount : 1;
    const paymentParcelDueDays = normalizeParcelDueDaysJson(c?.parcelDueDays);
    return { ...o, paymentParcelCount, paymentParcelDueDays };
  });
}

/** Boleto anexado na criação (parcela única): pula fase Anexar Boleto e libera Pagamento. */
function buildCreationBoletoAutoReleaseData(
  order: {
    paymentType: string | null;
    boletoAttachmentUrl: string | null;
    boletoAttachmentName: string | null;
    paymentBoletoUrl: string | null;
    paymentBoletoName: string | null;
    paymentBoletoPhaseReleased: boolean;
  },
  paymentParcelCount: number
): {
  paymentBoletoUrl?: string;
  paymentBoletoName?: string | null;
  paymentBoletoPhaseReleased: boolean;
} | null {
  if (order.paymentType !== 'BOLETO') return null;
  if (order.paymentBoletoPhaseReleased) return null;
  if (paymentParcelCount > 1) return null;
  const creationUrl = (order.boletoAttachmentUrl || '').trim();
  if (!creationUrl) return null;

  const data: {
    paymentBoletoUrl?: string;
    paymentBoletoName?: string | null;
    paymentBoletoPhaseReleased: boolean;
  } = { paymentBoletoPhaseReleased: true };

  if (!(order.paymentBoletoUrl || '').trim()) {
    data.paymentBoletoUrl = creationUrl;
    data.paymentBoletoName = (order.boletoAttachmentName || '').trim() || null;
  }
  return data;
}

export interface CreatePurchaseOrderData {
  materialRequestId?: string;
  quoteMapId?: string;
  supplierId: string;
  expectedDelivery?: Date;
  deliveryAddress?: string;
  paymentType?: string;
  paymentCondition?: string;
  paymentDetails?: string;
  pixKeyType?: string;
  pixKey?: string;
  boletoAttachmentUrl?: string;
  boletoAttachmentName?: string;
  /** Um boleto por parcela quando a condição de pagamento tem parcelCount > 1. */
  creationBoletoInstallments?: Array<{ boletoUrl: string; boletoName?: string | null }>;
  /** Frete (R$). Total a pagar gravado = soma dos itens + frete. */
  freightAmount?: number;
  /** @deprecated Ignorado: o total é sempre calculado como itens + frete. */
  amountToPay?: number;
  notes?: string;
  attachments?: Array<{ url: string; name: string }>;
  items: {
    materialRequestItemId?: string;
    materialId: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    notes?: string;
  }[];
}

export interface UpdatePurchaseOrderDetailsData {
  supplierId?: string;
  expectedDelivery?: Date | string | null;
  deliveryAddress?: string | null;
  paymentType?: string | null;
  paymentCondition?: string | null;
  paymentDetails?: string | null;
  pixKeyType?: string | null;
  pixKey?: string | null;
  freightAmount?: number | string | null;
  notes?: string | null;
  items?: {
    materialRequestItemId?: string | null;
    materialId: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    notes?: string | null;
  }[];
}

/**
 * Gera número único de OC (formato: OC-YYYY-NNNN).
 * Deve ser chamado dentro de uma transação que já obteve o advisory lock.
 */
async function generateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `OC-${year}-`;
  const last = await tx.purchaseOrder.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  let n = 1;
  if (last) {
    const num = parseInt(last.orderNumber.replace(prefix, ''), 10);
    if (!isNaN(num)) n = num + 1;
  }
  return `${prefix}${n.toString().padStart(4, '0')}`;
}

/** Reserva N números consecutivos sob o mesmo peek (lock já obtido). */
async function generateOrderNumbers(tx: Prisma.TransactionClient, count: number): Promise<string[]> {
  if (count <= 0) return [];
  const year = new Date().getFullYear();
  const prefix = `OC-${year}-`;
  const last = await tx.purchaseOrder.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  let n = 1;
  if (last) {
    const num = parseInt(last.orderNumber.replace(prefix, ''), 10);
    if (!isNaN(num)) n = num + 1;
  }
  return Array.from({ length: count }, (_, i) => `${prefix}${(n + i).toString().padStart(4, '0')}`);
}

type PreparedOcItemCreate = {
  materialRequestItemId: string | null;
  materialId: string;
  quantity: Decimal;
  unit: string;
  unitPrice: Decimal;
  totalPrice: Decimal;
  notes: string | null;
};

type PreparedOcCreateData = {
  orderNumber?: string;
  materialRequestId: string | null;
  quoteMapId: string | null;
  supplierId: string;
  expectedDelivery: Date | null;
  deliveryAddress: string | null;
  paymentType: string | null;
  paymentCondition: string | null;
  paymentDetails: string | null;
  pixKeyType: string | null;
  pixKey: string | null;
  boletoAttachmentUrl: string | null;
  boletoAttachmentName: string | null;
  paymentBoletoInstallments?: Prisma.InputJsonValue;
  freightAmount: Decimal;
  amountToPay: Decimal;
  notes: string | null;
  attachments?: Prisma.InputJsonValue;
  createdBy: string;
  items: { create: PreparedOcItemCreate[] };
};

export type CreatePurchaseOrderOptions = {
  /** Evita rebuscar a SC quando o caller já validou quantidades. */
  maxQtyByRmItem?: Map<string, Decimal> | null;
  /** Evita rebuscar condição de pagamento no loop do mapa. */
  paymentConditionRow?: { parcelCount: number | null; parcelDueDays: unknown } | null;
  /** Prefetch de várias condições (mapa de cotação com fornecedores distintos). */
  paymentConditionByCode?: Map<string, { parcelCount: number | null; parcelDueDays: unknown }>;
};

/** Listagem: joins enxutos (detalhe completo via getById). */
const purchaseOrderIncludeList = {
  supplier: {
    select: {
      id: true,
      code: true,
      name: true,
      cnpj: true,
      bank: true,
      agency: true,
      account: true,
      accountDigit: true
    }
  },
  quoteMap: { select: { id: true, createdAt: true } },
  materialRequest: {
    select: {
      id: true,
      requestNumber: true,
      serviceOrder: true,
      description: true,
      costCenter: { select: { id: true, code: true, name: true } }
    }
  },
  creator: { select: { id: true, name: true, email: true } },
  items: {
    select: {
      id: true,
      quantity: true,
      unit: true,
      unitPrice: true,
      totalPrice: true,
      materialId: true,
      material: { select: { id: true, name: true, description: true, unit: true } }
    }
  }
} as const;

/** Listagem resumida (mapa/gerenciar): sem itens — bem mais leve. */
const purchaseOrderIncludeListSummary = {
  supplier: { select: { id: true, code: true, name: true } },
  materialRequest: {
    select: {
      id: true,
      requestNumber: true,
      costCenter: { select: { id: true, code: true, name: true } }
    }
  },
  creator: { select: { id: true, name: true } },
  /** Vínculos leves para saber quais itens da RM já estão em OC ativa. */
  items: { select: { materialRequestItemId: true } }
} as const;

/**
 * Create/generate: include enxuto (sem quoteMap completo nem todos os itens da SC).
 * O detalhe pesado fica em getById — evita segurar o advisory lock por ~8–11s.
 */
const purchaseOrderIncludeCreate = {
  supplier: { select: { id: true, code: true, name: true, cnpj: true } },
  materialRequest: {
    select: {
      id: true,
      requestNumber: true,
      serviceOrder: true,
      costCenter: { select: { id: true, code: true, name: true } }
    }
  },
  creator: { select: { id: true, name: true, email: true } },
  items: { include: { material: { select: { id: true, name: true, description: true, sinapiCode: true } } } }
} as const;

const purchaseOrderIncludeDetail = {
  supplier: true,
  quoteMap: {
    include: {
      suppliers: { include: { supplier: true } },
      winners: { include: { winnerSupplier: true, materialRequestItem: { include: { material: true } } } }
    }
  },
  materialRequest: {
    select: {
      id: true,
      requestNumber: true,
      serviceOrder: true,
      description: true,
      demandSheet: true,
      demandSheetAttachmentUrl: true,
      demandSheetAttachmentName: true,
      demandSheetAttachments: true,
      requester: true,
      costCenter: true,
      items: { include: { material: true } },
      quoteMaps: { orderBy: { createdAt: 'desc' as const }, take: 1 }
    }
  },
  creator: { select: { id: true, name: true, email: true } },
  items: { include: { material: true, materialRequestItem: true } }
} as const;

/** PDF da OC: só campos do documento — sem quoteMap / itens da SC (getById fica pesado). */
const purchaseOrderIncludePdf = {
  supplier: {
    select: {
      code: true,
      name: true,
      cnpj: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      contactName: true,
      bank: true,
      agency: true,
      account: true,
      accountDigit: true,
      pixKeyType: true,
      pixKey: true
    }
  },
  materialRequest: {
    select: {
      requestNumber: true,
      serviceOrder: true,
      description: true,
      costCenter: { select: { name: true } }
    }
  },
  creator: { select: { name: true, email: true } },
  items: {
    select: {
      quantity: true,
      unit: true,
      unitPrice: true,
      totalPrice: true,
      notes: true,
      material: {
        select: { name: true, description: true, sinapiCode: true }
      }
    }
  }
} as const;

export class PurchaseOrderService {
  private async prepareCreatePayload(
    data: CreatePurchaseOrderData,
    userId: string,
    options?: CreatePurchaseOrderOptions,
  ): Promise<PreparedOcCreateData> {
    if (!data.supplierId || !data.items?.length) {
      throw new Error('Fornecedor e itens são obrigatórios');
    }

    if (data.paymentType === 'AVISTA') {
      if (!data.paymentDetails?.trim()) {
        throw new Error('Dados do pagamento são obrigatórios para pagamento à vista');
      }
      if (!data.pixKeyType?.trim()) {
        throw new Error('Tipo de chave PIX é obrigatório para pagamento à vista');
      }
      if (!data.pixKey?.trim()) {
        throw new Error('Chave PIX é obrigatória para pagamento à vista');
      }
    }
    if (data.paymentType === 'CARTAO') {
      if (!data.paymentDetails?.trim()) {
        throw new Error('Dados do pagamento são obrigatórios para pagamento por cartão');
      }
      // Cartão não exige PIX nem boletos: o backend só monta parcelas/arquivos quando paymentType === 'BOLETO'.
    }

    let maxQtyByRmItem: Map<string, Decimal> | null = null;
    if (options && 'maxQtyByRmItem' in options) {
      maxQtyByRmItem = options.maxQtyByRmItem ?? null;
    } else if (data.materialRequestId) {
      const rm = await prisma.materialRequest.findUnique({
        where: { id: data.materialRequestId },
        select: { items: { select: { id: true, quantity: true, status: true } } },
      });
      if (rm?.items?.length) {
        maxQtyByRmItem = new Map(
          rm.items
            .filter((it) => it.status !== 'CANCELLED')
            .map((it) => [it.id, new Decimal(it.quantity)])
        );
      }
    }

    const items = data.items.map((i) => {
      const qty = new Decimal(i.quantity);
      if (maxQtyByRmItem && i.materialRequestItemId) {
        const maxQ = maxQtyByRmItem.get(i.materialRequestItemId);
        if (!maxQ) throw new Error('Item da requisição inválido na OC');
        if (qty.lte(0)) throw new Error('Quantidade deve ser maior que zero');
        if (qty.gt(maxQ)) throw new Error('Quantidade da OC não pode exceder a solicitada na SC');
      }
      const price = new Decimal(i.unitPrice);
      const total = qty.mul(price);
      return {
        materialRequestItemId: i.materialRequestItemId || null,
        materialId: i.materialId,
        quantity: qty,
        unit: i.unit,
        unitPrice: price,
        totalPrice: total,
        notes: i.notes || null,
      };
    });
    const freight =
      data.freightAmount !== undefined && data.freightAmount !== null && !Number.isNaN(Number(data.freightAmount))
        ? new Decimal(data.freightAmount)
        : new Decimal(0);
    if (freight.lt(0)) {
      throw new Error('Frete não pode ser negativo');
    }
    const itemsSum = items.reduce((s, row) => s.plus(row.totalPrice), new Decimal(0));
    const amountToPay = itemsSum.plus(freight);

    let paymentBoletoInstallments: Prisma.InputJsonValue | undefined;
    let boletoAttachmentUrl = data.boletoAttachmentUrl || null;
    let boletoAttachmentName = data.boletoAttachmentName || null;

    if (data.paymentType === 'BOLETO' && data.paymentCondition) {
      let cond: { parcelCount: number | null; parcelDueDays: unknown } | null | undefined;
      if (options?.paymentConditionByCode) {
        cond = options.paymentConditionByCode.get(data.paymentCondition) ?? null;
      } else if (options && 'paymentConditionRow' in options) {
        cond = options.paymentConditionRow;
      } else {
        cond = await prisma.paymentCondition.findUnique({
          where: { code: data.paymentCondition },
          select: { parcelCount: true, parcelDueDays: true },
        });
      }
      const parcelCount = cond?.parcelCount && cond.parcelCount >= 1 ? cond.parcelCount : 1;
      const parcelDueDays = normalizeParcelDueDaysJson(cond?.parcelDueDays);

      if (parcelCount > 1) {
        const drafts = data.creationBoletoInstallments;
        const hasBoletoDrafts = Array.isArray(drafts) && drafts.some((d) => (d?.boletoUrl || '').trim());
        if (hasBoletoDrafts) {
          if (!Array.isArray(drafts) || drafts.length !== parcelCount) {
            throw new Error(`Anexe ${parcelCount} boletos (um para cada parcela).`);
          }
          for (let i = 0; i < parcelCount; i++) {
            if (!(drafts[i]?.boletoUrl || '').trim()) {
              throw new Error(`Anexe o boleto da parcela ${i + 1}.`);
            }
          }
          paymentBoletoInstallments = buildCreationPaymentInstallments(
            drafts,
            parcelCount,
            parcelDueDays,
            Number(amountToPay),
            new Date(),
          ) as unknown as Prisma.InputJsonValue;
        } else {
          paymentBoletoInstallments = buildEmptyPaymentInstallments(
            parcelCount,
            parcelDueDays,
            Number(amountToPay),
            new Date(),
          ) as unknown as Prisma.InputJsonValue;
        }
        boletoAttachmentUrl = null;
        boletoAttachmentName = null;
      } else if (!(boletoAttachmentUrl || '').trim()) {
        paymentBoletoInstallments = buildEmptyPaymentInstallments(
          1,
          parcelDueDays,
          Number(amountToPay),
          new Date(),
        ) as unknown as Prisma.InputJsonValue;
      }
    }

    return {
      materialRequestId: data.materialRequestId || null,
      quoteMapId: data.quoteMapId || null,
      supplierId: data.supplierId,
      expectedDelivery: data.expectedDelivery || null,
      deliveryAddress: data.deliveryAddress || null,
      paymentType: data.paymentType || null,
      paymentCondition: data.paymentCondition || null,
      paymentDetails: data.paymentDetails || null,
      pixKeyType: data.pixKeyType?.trim() || null,
      pixKey: data.pixKey?.trim() || null,
      boletoAttachmentUrl,
      boletoAttachmentName,
      ...(paymentBoletoInstallments ? { paymentBoletoInstallments } : {}),
      freightAmount: freight,
      amountToPay,
      notes: data.notes || null,
      attachments: (() => {
        const files = Array.isArray(data.attachments)
          ? data.attachments
              .map((item) => ({
                url: String(item?.url || '').trim().slice(0, 2000),
                name: String(item?.name || '').trim().slice(0, 500) || 'Arquivo anexado',
              }))
              .filter((item) => item.url)
          : [];
        return files.length > 0 ? (files as Prisma.InputJsonValue) : undefined;
      })(),
      createdBy: userId,
      items: { create: items },
    };
  }

  /** UNB: só aprovação do gestor (pula compras e diretoria). Demais CCs: PENDING_COMPRAS. */
  private async resolveInitialApprovalStatus(
    tx: Prisma.TransactionClient,
    materialRequestId: string | null,
  ): Promise<'PENDING_COMPRAS' | 'PENDING'> {
    if (!materialRequestId) return 'PENDING_COMPRAS';
    const rm = await tx.materialRequest.findUnique({
      where: { id: materialRequestId },
      select: { costCenter: { select: { name: true, code: true } } },
    });
    return isUnbCostCenterRecord(rm?.costCenter) ? 'PENDING' : 'PENDING_COMPRAS';
  }

  private async createRowInTx(
    tx: Prisma.TransactionClient,
    createDataBase: PreparedOcCreateData & { orderNumber: string },
  ) {
    const initialStatus = await this.resolveInitialApprovalStatus(
      tx,
      createDataBase.materialRequestId,
    );

    const toUnchecked = (
      row: PreparedOcCreateData & { orderNumber: string },
      status: string,
    ): Prisma.PurchaseOrderUncheckedCreateInput =>
      ({
        ...row,
        status: status as any,
      }) as Prisma.PurchaseOrderUncheckedCreateInput;

    try {
      return await tx.purchaseOrder.create({
        data: toUnchecked(createDataBase, initialStatus),
        include: purchaseOrderIncludeCreate,
      });
    } catch (error: any) {
      const msg = typeof error?.message === 'string' ? error.message : '';
      const isPrismaValidation = error?.name === 'PrismaClientValidationError' && msg;
      if (isPrismaValidation && msg.includes('PENDING_COMPRAS') && initialStatus === 'PENDING_COMPRAS') {
        return await tx.purchaseOrder.create({
          data: toUnchecked(createDataBase, 'PENDING'),
          include: purchaseOrderIncludeCreate,
        });
      }
      if (isPrismaValidation && msg.includes('quoteMapId') && createDataBase.quoteMapId) {
        const { quoteMapId: _omit, ...withoutQuote } = createDataBase;
        return await tx.purchaseOrder.create({
          data: toUnchecked({ ...withoutQuote, quoteMapId: null }, initialStatus),
          include: purchaseOrderIncludeCreate,
        });
      }
      throw error;
    }
  }

  async create(data: CreatePurchaseOrderData, userId: string, options?: CreatePurchaseOrderOptions) {
    const createDataBase = await this.prepareCreatePayload(data, userId, options);

    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${PURCHASE_ORDER_NUMBER_ADVISORY_LOCK})`,
      );
      const orderNumber = await generateOrderNumber(tx);
      return this.createRowInTx(tx, { ...createDataBase, orderNumber });
    }, PURCHASE_ORDER_CREATE_TX_OPTIONS);
  }

  /**
   * Cria várias OCs (ex.: mapa de cotação) com um único advisory lock e números consecutivos.
   * Prep/validação ficam fora da transação para manter o lock curto.
   */
  async createMany(entries: CreatePurchaseOrderData[], userId: string, options?: CreatePurchaseOrderOptions) {
    if (entries.length === 0) return [];
    if (entries.length === 1) {
      return [await this.create(entries[0], userId, options)];
    }

    const prepared: PreparedOcCreateData[] = [];
    for (const data of entries) {
      prepared.push(await this.prepareCreatePayload(data, userId, options));
    }

    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${PURCHASE_ORDER_NUMBER_ADVISORY_LOCK})`,
      );
      const orderNumbers = await generateOrderNumbers(tx, prepared.length);
      const created: Awaited<ReturnType<PurchaseOrderService['createRowInTx']>>[] = [];
      for (let i = 0; i < prepared.length; i++) {
        created.push(await this.createRowInTx(tx, { ...prepared[i], orderNumber: orderNumbers[i] }));
      }
      return created;
    }, PURCHASE_ORDER_CREATE_TX_OPTIONS);
  }

  private buildPurchaseOrderListWhere(filters: {
    status?: string;
    supplierId?: string;
    materialRequestId?: string;
    costCenterId?: string;
    costCenterIds?: string[];
    serviceOrderId?: string;
    serviceOrderText?: string;
    orderDateFrom?: string;
    orderDateTo?: string;
    q?: string;
  }): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.materialRequestId) where.materialRequestId = filters.materialRequestId;

    const andParts: object[] = [];

    if (filters.costCenterId) {
      andParts.push({ materialRequest: { costCenterId: filters.costCenterId } });
    } else if (filters.costCenterIds?.length) {
      andParts.push({ materialRequest: { costCenterId: { in: filters.costCenterIds } } });
    }

    const serviceOrderParts: object[] = [];
    if (filters.serviceOrderId?.trim()) {
      serviceOrderParts.push({
        materialRequest: { serviceOrderId: filters.serviceOrderId.trim() }
      });
    }
    if (filters.serviceOrderText?.trim()) {
      serviceOrderParts.push({
        materialRequest: {
          serviceOrder: { equals: filters.serviceOrderText.trim(), mode: 'insensitive' as const }
        }
      });
    }
    if (serviceOrderParts.length === 1) {
      andParts.push(serviceOrderParts[0]);
    } else if (serviceOrderParts.length > 1) {
      andParts.push({ OR: serviceOrderParts });
    }

    if (filters.status) {
      const parts = filters.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length > 1) {
        andParts.push({ status: { in: parts } });
      } else if (parts.length === 1) {
        where.status = parts[0];
      }
    }

    if (filters.orderDateFrom || filters.orderDateTo) {
      const range: { gte?: Date; lte?: Date } = {};
      if (filters.orderDateFrom) {
        const d = new Date(filters.orderDateFrom);
        if (!Number.isNaN(d.getTime())) range.gte = d;
      }
      if (filters.orderDateTo) {
        const d = new Date(filters.orderDateTo);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          range.lte = d;
        }
      }
      if (range.gte || range.lte) {
        andParts.push({ orderDate: range });
      }
    }

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      andParts.push({
        OR: [
          { orderNumber: { contains: q, mode: 'insensitive' as const } },
          { supplier: { name: { contains: q, mode: 'insensitive' as const } } },
          { materialRequest: { requestNumber: { contains: q, mode: 'insensitive' as const } } }
        ]
      });
    }

    if (andParts.length > 0) {
      where.AND = andParts;
    }
    return where;
  }

  async list(filters: {
    status?: string;
    supplierId?: string;
    materialRequestId?: string;
    costCenterId?: string;
    costCenterIds?: string[];
    serviceOrderId?: string;
    serviceOrderText?: string;
    orderDateFrom?: string;
    orderDateTo?: string;
    q?: string;
    page?: number;
    limit?: number;
    /** false = listagem leve (sem itens) — mapa/gerenciar só precisam do vínculo RM. */
    includeItems?: boolean;
  }) {
    const where = this.buildPurchaseOrderListWhere(filters);
    const page = filters.page || 1;
    const limit = Math.min(Math.max(filters.limit || 20, 1), 500);
    const skip = (page - 1) * limit;
    const includeItems = filters.includeItems !== false;
    const include = includeItems
      ? purchaseOrderIncludeList
      : purchaseOrderIncludeListSummary;
    const [orders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { orderNumber: 'desc' }],
        include
      }),
      prisma.purchaseOrder.count({ where })
    ]);
    /** Listagem = só leitura. Syncs de estoque/boleto ficam no lançamento de estoque e nas mutações. */
    const enriched = await enrichOrdersParcelPlans(orders);
    return { orders: enriched, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * CSV (UTF-8 com BOM) — OCs finalizadas ou enviadas (legado), com os mesmos filtros da listagem.
   */
  async exportFinalizedOrdersCsv(filters: {
    supplierId?: string;
    costCenterId?: string;
    costCenterIds?: string[];
    orderDateFrom?: string;
    orderDateTo?: string;
    q?: string;
  }): Promise<string> {
    const where = this.buildPurchaseOrderListWhere({
      status: 'FINALIZED,SENT',
      supplierId: filters.supplierId,
      costCenterId: filters.costCenterId,
      costCenterIds: filters.costCenterIds,
      orderDateFrom: filters.orderDateFrom,
      orderDateTo: filters.orderDateTo,
      q: filters.q
    });
    const orders = await prisma.purchaseOrder.findMany({
      where,
      take: 25_000,
      orderBy: [{ updatedAt: 'desc' }, { orderNumber: 'desc' }],
      include: purchaseOrderIncludeList
    });
    const rows = await enrichOrdersParcelPlans(orders);

    const esc = (v: string | number | null | undefined) => {
      const s = v == null || v === '' ? '' : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const header = [
      'Nº OC',
      'Data OC',
      'Centro de custo',
      'Fornecedor',
      'CNPJ Fornecedor',
      'SC',
      'OS',
      'Status',
      'Tipo pagamento',
      'Condição',
      'Valor itens',
      'Frete',
      'Valor a pagar',
      'Criador',
      'Atualizado em'
    ];

    const lines = [header.join(';')];
    for (const o of rows) {
      const itemsTotal = (o.items || []).reduce((s, it) => s + Number(it.totalPrice || 0), 0);
      const cc = o.materialRequest?.costCenter as { code?: string; name?: string } | undefined;
      const ccLabel = cc ? [cc.code, cc.name].filter(Boolean).join(' — ') : '';
      const freightNum = o.freightAmount != null ? Number(o.freightAmount) : 0;
      lines.push(
        [
          esc(o.orderNumber),
          esc(o.orderDate ? new Date(o.orderDate).toLocaleDateString('pt-BR') : ''),
          esc(ccLabel),
          esc(o.supplier?.name),
          esc(o.supplier?.cnpj),
          esc(o.materialRequest?.requestNumber),
          esc(o.materialRequest?.serviceOrder),
          esc(o.status),
          esc(o.paymentType),
          esc(o.paymentCondition),
          esc(itemsTotal.toFixed(2).replace('.', ',')),
          esc(Number.isFinite(freightNum) ? freightNum.toFixed(2).replace('.', ',') : ''),
          esc(o.amountToPay != null ? Number(o.amountToPay).toFixed(2).replace('.', ',') : ''),
          esc(o.creator?.name),
          esc(o.updatedAt ? new Date(o.updatedAt).toLocaleString('pt-BR') : '')
        ].join(';')
      );
    }
    return `\uFEFF${lines.join('\n')}`;
  }

  async getById(id: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: purchaseOrderIncludeDetail
    });
    if (!order) return null;

    /** GET de detalhe deve ser só leitura e rápido — syncs pesados ficam na listagem / mutações / estoque. */
    const [withPlan] = await enrichOrdersParcelPlans([order]);
    return withPlan;
  }

  /** Dados mínimos para gerar o PDF da OC no cliente (bem mais leve que getById). */
  async getForPdf(id: string) {
    return prisma.purchaseOrder.findUnique({
      where: { id },
      include: purchaseOrderIncludePdf
    });
  }

  /** Contexto leve para PATCH /status (evita getById com joins pesados só para checar permissão). */
  async getStatusChangeContext(id: string) {
    return prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        materialRequest: {
          select: { costCenter: { select: { id: true } } }
        }
      }
    });
  }

  /** Resumo de recebimento/saída no estoque (consulta separada para não atrasar a abertura da modal). */
  async getStockReceiptSummary(id: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        orderNumber: true,
        items: { include: { material: true } }
      }
    });
    if (!order) return null;
    return stockShortfallService.getReceiptSummaryForOrderNumber(order.orderNumber, {
      items: order.items
    });
  }

  async updateStatus(
    id: string,
    status: string,
    userId?: string,
    options?: { rejectionReason?: string }
  ) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: { select: { materialRequestItemId: true } },
        materialRequest: {
          select: { costCenter: { select: { name: true, code: true } } },
        },
      },
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }

    const st = order.status;
    const isUnbOc = isUnbCostCenterRecord(order.materialRequest?.costCenter);
    let requestedStatus = status;

    // UNB: reenvio pós-correção volta direto para o gestor (não para compras).
    if (requestedStatus === 'PENDING_COMPRAS' && st === 'IN_REVIEW' && isUnbOc) {
      requestedStatus = 'PENDING';
    }

    // Fase 1 (compras): PENDING_COMPRAS | DRAFT → PENDING
    // UNB: também IN_REVIEW → PENDING (reenvio após correção)
    if (requestedStatus === 'PENDING') {
      const okFromCompras = st === 'PENDING_COMPRAS' || st === 'DRAFT';
      const okUnbResubmit = isUnbOc && st === 'IN_REVIEW';
      if (!okFromCompras && !okUnbResubmit) {
        throw new Error('Apenas OC em rascunho ou na fase de compras pode seguir para aprovação do gestor');
      }
      if (okUnbResubmit && (!userId || order.createdBy !== userId)) {
        throw new Error('Apenas quem criou a OC pode reenviá-la após correção');
      }
    }

    // Fase 2 (gestor): PENDING → PENDING_DIRETORIA (não se aplica a UNB)
    if (requestedStatus === 'PENDING_DIRETORIA') {
      if (isUnbOc) {
        throw new Error('OC de centro de custo UNB não passa por aprovação da diretoria');
      }
      if (st !== 'PENDING') {
        throw new Error('Apenas OC na fase do gestor pode seguir para aprovação da diretoria');
      }
    }

    // Diretoria: PENDING_DIRETORIA → APPROVED
    // UNB: gestor aprova direto PENDING → APPROVED
    if (requestedStatus === 'APPROVED') {
      const okFromDiretoria = st === 'PENDING_DIRETORIA';
      const okUnbGestor = isUnbOc && st === 'PENDING';
      if (!okFromDiretoria && !okUnbGestor) {
        throw new Error(
          isUnbOc
            ? 'A OC UNB só pode ser aprovada na fase do gestor'
            : 'A OC só pode ser aprovada após aprovação do gestor (fase diretoria)',
        );
      }
    }

    if (requestedStatus === 'IN_REVIEW') {
      if (st !== 'PENDING_COMPRAS' && st !== 'PENDING' && st !== 'DRAFT' && st !== 'PENDING_DIRETORIA') {
        throw new Error('Apenas OC nas fases de aprovação ou rascunho pode ir para correção');
      }
    }

    if (requestedStatus === 'REJECTED') {
      if (st !== 'PENDING_COMPRAS' && st !== 'PENDING' && st !== 'DRAFT' && st !== 'PENDING_DIRETORIA') {
        throw new Error('Apenas OC pendente de aprovação pode ser reprovada');
      }
    }

    if (requestedStatus === 'PENDING_COMPRAS' && st === 'IN_REVIEW') {
      if (!userId || order.createdBy !== userId) {
        throw new Error('Apenas quem criou a OC pode reenviá-la após correção');
      }
    }

    // A partir daqui, `status` segue o status efetivo (pode ter sido remapeado p/ UNB).
    status = requestedStatus;

    let fillPaymentProofFromLastInstallment: { paymentProofUrl: string; paymentProofName: string | null } | null =
      null;

    if (status === 'PENDING_PROOF_CORRECTION') {
      if (st !== 'PENDING_PROOF_VALIDATION') {
        throw new Error('Apenas OC em validação do comprovante pode ir para correção do comprovante');
      }
    }

    // Pagamento (ou correção) → validação do comprovante (exige comprovante anexado)
    if (status === 'PENDING_PROOF_VALIDATION') {
      if (st !== 'APPROVED' && st !== 'PENDING_PROOF_CORRECTION') {
        throw new Error(
          'Apenas OC na fase Pagamento ou em correção do comprovante pode ser enviada para validação do comprovante'
        );
      }
      const fcCount = await prisma.financialControlEntry.count({
        where: { ocNumber: { equals: order.orderNumber.trim(), mode: 'insensitive' } }
      });
      if (fcCount === 0) {
        throw new Error(
          'Registre o lançamento desta OC no Controle Financeiro antes de enviar o comprovante para validação'
        );
      }
      if (st === 'PENDING_PROOF_CORRECTION') {
        // Permissão da aba Correção Comprovante é validada na rota (assertOcFlowStatusChange).
      }
      let boletoMeta: { paymentParcelCount: number } | null = null;
      if (order.paymentType === 'BOLETO') {
        const [meta] = await enrichOrdersParcelPlans([order]);
        boletoMeta = meta;
        if (!order.paymentBoletoPhaseReleased && meta.paymentParcelCount <= 1) {
          throw new Error(
            'Envie a OC para a fase Pagamento (botão após anexar o boleto) antes de enviar o comprovante para validação'
          );
        }
      }
      let proofUrl = (order.paymentProofUrl || '').trim();
      let proofName = ((order.paymentProofName || '').trim() || null) as string | null;

      if (order.paymentType === 'BOLETO' && boletoMeta && boletoMeta.paymentParcelCount > 1) {
        const n = boletoMeta.paymentParcelCount;
        const inst = parseStoredInstallments(order.paymentBoletoInstallments);
        const parallel = useParallelBoletoPaymentFlow(inst, n);
        if (parallel) {
          if (!allInstallmentsHavePaymentProof(inst, n)) {
            throw new Error(
              'Anexe o comprovante de pagamento em todas as parcelas antes de enviar para validação'
            );
          }
        } else {
          if (allMultiInstallmentsPaid(inst, n)) {
            if (!proofUrl && !allInstallmentsHavePaymentProof(inst, n)) {
              throw new Error(
                'Anexe o comprovante de pagamento antes de enviar para validação'
              );
            }
          } else {
            const proofIdx = firstNonPaidInstallmentWithProof(inst, n);
            if (proofIdx < 0) {
              throw new Error(
                'Anexe o comprovante de pagamento da parcela atual antes de enviar para validação'
              );
            }
          }
        }
        if (!proofUrl) {
          for (let i = 0; i < n; i++) {
            const fromInst = (inst[i]?.installmentProofUrl || '').trim();
            if (fromInst) {
              proofUrl = fromInst;
              proofName = ((inst[i]?.installmentProofName || '').trim() || null) as string | null;
              break;
            }
          }
        }
      }

      if (!proofUrl) {
        throw new Error('Anexe o comprovante de pagamento antes de enviar para validação');
      }

      if (!(order.paymentProofUrl || '').trim() && proofUrl) {
        fillPaymentProofFromLastInstallment = { paymentProofUrl: proofUrl, paymentProofName: proofName };
      }
    }

    let targetStatus = status;
    let sequentialAfterProofValidation: {
      paymentBoletoInstallments: BoletoInstallmentStored[];
      paymentBoletoPhaseReleased: boolean;
      paymentProofUrl: null;
      paymentProofName: null;
    } | null = null;

    if (targetStatus === 'PENDING_NF_ATTACHMENT' && st === 'PENDING_PROOF_VALIDATION') {
      const forSeq = await prisma.purchaseOrder.findUnique({
        where: { id },
        select: {
          paymentType: true,
          paymentCondition: true,
          paymentBoletoInstallments: true
        }
      });
      if (forSeq?.paymentType === 'BOLETO') {
        const [meta] = await enrichOrdersParcelPlans([forSeq]);
        const n = meta.paymentParcelCount;
        if (n > 1) {
          const inst = parseStoredInstallments(forSeq.paymentBoletoInstallments);
          if (!useParallelBoletoPaymentFlow(inst, n)) {
            const proofIdx = firstNonPaidInstallmentWithProof(inst, n);
            if (proofIdx >= 0) {
              const next = inst.map((row, j) =>
                j === proofIdx ? { ...row, paymentStatus: 'PAID' as const } : row
              );
              if (!allMultiInstallmentsPaid(next, n)) {
                targetStatus = 'APPROVED';
                sequentialAfterProofValidation = {
                  paymentBoletoInstallments: next,
                  paymentBoletoPhaseReleased: false,
                  paymentProofUrl: null,
                  paymentProofName: null
                };
              } else {
                sequentialAfterProofValidation = {
                  paymentBoletoInstallments: next,
                  paymentBoletoPhaseReleased: true,
                  paymentProofUrl: null,
                  paymentProofName: null
                };
              }
            }
          }
        }
      }
    }

    if (targetStatus === 'PENDING_NF_ATTACHMENT') {
      if (st !== 'PENDING_PROOF_VALIDATION') {
        throw new Error('Apenas OC em validação de comprovante pode seguir para anexo de NF');
      }
      void this.syncNfAttachmentsFromStockReceipt(order.orderNumber).catch((err) => {
        console.error('[PurchaseOrder] syncNfAttachmentsFromStockReceipt before NF phase', order.orderNumber, err);
      });
      const forProof = await prisma.purchaseOrder.findUnique({
        where: { id },
        select: {
          paymentProofUrl: true,
          paymentType: true,
          paymentCondition: true,
          paymentBoletoInstallments: true
        }
      });
      if (!forProof) {
        throw new Error('Ordem de compra não encontrada');
      }
      const p = await resolvePaymentProofUrlForOrder(forProof);
      if (!p) {
        throw new Error('Registre o comprovante de pagamento antes de liberar a fase de anexo de NF');
      }
    }

    if (status === 'FINALIZED') {
      if (st !== 'PENDING_NF_ATTACHMENT') {
        throw new Error('A OC só pode ser finalizada após anexar a(s) nota(s) fiscal(is)');
      }
      if (!userId) {
        throw new Error('Usuário não autenticado');
      }
      const row = await prisma.purchaseOrder.findUnique({
        where: { id },
        select: { nfAttachments: true }
      });
      if (!row) {
        throw new Error('Ordem de compra não encontrada');
      }
      const nfs = parseNfAttachments(row.nfAttachments);
      if (nfs.length === 0) {
        throw new Error('Anexe ao menos uma nota fiscal antes de finalizar a OC');
      }
    }

    const data: any = {
      status: targetStatus,
      updatedAt: new Date(),
      ...(fillPaymentProofFromLastInstallment || {}),
      ...(sequentialAfterProofValidation || {})
    };

    if (status === 'PENDING' && userId && (st === 'PENDING_COMPRAS' || st === 'DRAFT')) {
      data.comprasApprovedBy = userId;
      data.comprasApprovedAt = new Date();
    }

    if (status === 'PENDING_DIRETORIA' && userId && st === 'PENDING') {
      data.gestorApprovedBy = userId;
      data.gestorApprovedAt = new Date();
    }

    if (status === 'APPROVED' && userId) {
      // UNB: aprovação do gestor já finaliza (grava gestor + aprovador final).
      if (isUnbOc && st === 'PENDING') {
        data.gestorApprovedBy = userId;
        data.gestorApprovedAt = new Date();
      }
      data.approvedBy = userId;
      data.approvedAt = new Date();
      const [meta] = await enrichOrdersParcelPlans([{ paymentCondition: order.paymentCondition }]);
      const release = buildCreationBoletoAutoReleaseData(order, meta.paymentParcelCount);
      if (release) {
        Object.assign(data, release);
      }
    }

    if (
      status === 'IN_REVIEW' ||
      (status === 'PENDING_COMPRAS' && st === 'IN_REVIEW') ||
      (status === 'PENDING' && st === 'IN_REVIEW')
    ) {
      data.comprasApprovedBy = null;
      data.comprasApprovedAt = null;
      data.gestorApprovedBy = null;
      data.gestorApprovedAt = null;
      data.approvedBy = null;
      data.approvedAt = null;
    } else if (status === 'REJECTED' || status === 'PENDING' || status === 'PENDING_DIRETORIA') {
      data.approvedBy = null;
      data.approvedAt = null;
    }

    if (status === 'REJECTED' && options?.rejectionReason) {
      const note = `[Cancelamento ${new Date().toLocaleString('pt-BR')}] ${options.rejectionReason}`;
      data.notes = order.notes ? `${order.notes}\n\n${note}` : note;
    }

    if (status === 'PENDING_PROOF_CORRECTION' && options?.rejectionReason?.trim()) {
      const actorName = await resolveUserDisplayName(userId);
      const header = buildOcCorrectionNoteHeader({
        prefix: 'Correção comprovante',
        role: 'Financeiro',
        actorName,
      });
      const note = `${header}\n${options.rejectionReason.trim()}`;
      data.notes = order.notes ? `${order.notes}\n\n${note}` : note;
    }

    if (status === 'IN_REVIEW' && options?.rejectionReason?.trim()) {
      const actorName = await resolveUserDisplayName(userId);
      const header = buildOcCorrectionNoteHeader({
        prefix: 'Correção OC',
        role: labelForOcCorrectionSource(st),
        actorName,
      });
      const note = `${header}\n${options.rejectionReason.trim()}`;
      data.notes = order.notes ? `${order.notes}\n\n${note}` : note;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.update({
        where: { id },
        data,
        // Resposta leve — o front atualiza a lista summary; detalhe completo vem do GET :id
        include: purchaseOrderIncludeListSummary
      });

      if (status === 'REJECTED' && order.materialRequestId) {
        const rmItemIds = order.items
          .map((i) => i.materialRequestItemId)
          .filter((id): id is string => Boolean(id));
        if (rmItemIds.length > 0) {
          await tx.materialRequestItem.updateMany({
            where: { id: { in: rmItemIds } },
            data: {
              status: 'CANCELLED',
              updatedAt: new Date(),
            },
          });
        }
      }

      return po;
    }, PURCHASE_ORDER_STATUS_TX_OPTIONS);

    if (status === 'APPROVED') {
      void this.syncDocumentsFromStockReceipt(order.orderNumber).catch((err) => {
        console.error('[PurchaseOrder] syncDocumentsFromStockReceipt on APPROVED', order.orderNumber, err);
      });
    }

    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  async updateDetails(id: string, data: UpdatePurchaseOrderDetailsData, userId?: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, status: true, createdBy: true, freightAmount: true }
    });

    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }

    if (!userId || order.createdBy !== userId) {
      throw new Error('Apenas o criador da OC pode editar a OC em correção');
    }

    if (order.status !== 'IN_REVIEW') {
      throw new Error('A OC só pode ser editada durante a CORREÇÃO OC');
    }

    const nextPaymentType =
      data.paymentType !== undefined && data.paymentType !== null ? data.paymentType : undefined;

    if (nextPaymentType === 'AVISTA') {
      if (!data.paymentDetails?.trim()) {
        throw new Error('Dados do pagamento são obrigatórios para pagamento à vista');
      }
      if (!data.pixKeyType?.trim()) {
        throw new Error('Tipo de chave PIX é obrigatório para pagamento à vista');
      }
      if (!data.pixKey?.trim()) {
        throw new Error('Chave PIX é obrigatória para pagamento à vista');
      }
    }

    const expectedDelivery =
      data.expectedDelivery !== undefined && data.expectedDelivery !== null && data.expectedDelivery !== ''
        ? new Date(data.expectedDelivery)
        : null;

    let freightToStore: Decimal;
    if (data.freightAmount !== undefined && data.freightAmount !== null && data.freightAmount !== '') {
      freightToStore = new Decimal(Number(data.freightAmount));
    } else {
      freightToStore =
        order.freightAmount != null ? new Decimal(order.freightAmount) : new Decimal(0);
    }
    if (freightToStore.lt(0)) {
      throw new Error('Frete não pode ser negativo');
    }

    const supplierId = data.supplierId;
    const items = data.items;

    await prisma.$transaction(async (tx) => {
      let itemsSum = new Decimal(0);

      if (items && Array.isArray(items)) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
        const createdItems = items.map((i) => {
          const qty = new Decimal(i.quantity);
          const price = new Decimal(i.unitPrice);
          const total = qty.mul(price);
          itemsSum = itemsSum.plus(total);
          return {
            purchaseOrderId: id,
            materialRequestItemId: i.materialRequestItemId ?? null,
            materialId: i.materialId,
            quantity: qty,
            unit: i.unit,
            unitPrice: price,
            totalPrice: total,
            notes: i.notes ?? null
          };
        });
        if (createdItems.length > 0) {
          await tx.purchaseOrderItem.createMany({ data: createdItems });
        }
      } else {
        const rows = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
        itemsSum = rows.reduce((s, it) => s.plus(new Decimal(it.totalPrice)), new Decimal(0));
      }

      const amountToPay = itemsSum.plus(freightToStore);

      await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: supplierId !== undefined ? supplierId : undefined,
          expectedDelivery,
          deliveryAddress: data.deliveryAddress !== undefined ? data.deliveryAddress : undefined,
          paymentType: data.paymentType !== undefined ? data.paymentType : undefined,
          paymentCondition: data.paymentCondition !== undefined ? data.paymentCondition : undefined,
          paymentDetails: data.paymentDetails !== undefined ? data.paymentDetails : undefined,
          pixKeyType:
            nextPaymentType === 'BOLETO'
              ? null
              : data.pixKeyType !== undefined
                ? data.pixKeyType?.trim() || null
                : undefined,
          pixKey:
            nextPaymentType === 'BOLETO'
              ? null
              : data.pixKey !== undefined
                ? data.pixKey?.trim() || null
                : undefined,
          freightAmount: freightToStore,
          amountToPay,
          notes: data.notes !== undefined ? data.notes : undefined,
          updatedAt: new Date()
        }
      });
    });

    const refreshed = await this.getById(id);
    return refreshed;
  }

  /**
   * Financeiro: anexa boleto para pagamento em OC já aprovada, tipo BOLETO.
   * Compatível só com 1 parcela; com várias parcelas use savePaymentBoletoInstallments.
   */
  async attachPaymentBoleto(
    id: string,
    data: { paymentBoletoUrl: string; paymentBoletoName?: string },
    _userId?: string
  ) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        orderDate: true,
        amountToPay: true
      }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'APPROVED') {
      throw new Error('Só é possível anexar boleto de pagamento em OC aprovada');
    }
    if (order.paymentType !== 'BOLETO') {
      throw new Error('Anexo de boleto para pagamento aplica-se apenas a OC com pagamento em boleto');
    }
    const [meta] = await enrichOrdersParcelPlans([order]);
    if (meta.paymentParcelCount > 1) {
      throw new Error(
        'Esta OC tem várias parcelas na condição de pagamento. Use o formulário de parcelas para anexar cada boleto.'
      );
    }
    const url = (data.paymentBoletoUrl || '').trim();
    if (!url) {
      throw new Error('URL do arquivo do boleto é obrigatória');
    }
    const name = (data.paymentBoletoName || '').trim() || null;
    const amt =
      order.amountToPay != null && String(order.amountToPay).trim() !== ''
        ? Number(order.amountToPay)
        : 0;
    const days = meta.paymentParcelDueDays[0] ?? 30;
    const due = ymdAddDays(order.orderDate, days);
    const row: BoletoInstallmentStored = {
      amount: Number.isFinite(amt) ? amt : 0,
      dueDate: due,
      boletoUrl: url,
      boletoName: name,
      paymentStatus: 'PENDING_BOLETO'
    };
    return await prisma.purchaseOrder.update({
      where: { id },
      data: {
        paymentBoletoUrl: url,
        paymentBoletoName: name,
        paymentBoletoInstallments: [row] as unknown as Prisma.InputJsonValue,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeListSummary
    }).then(async (o) => {
      const [e] = await enrichOrdersParcelPlans([o]);
      return e;
    });
  }

  /**
   * Grava todas as parcelas de boleto (valor, vencimento, anexo por parcela).
   */
  async savePaymentBoletoInstallments(
    id: string,
    body: {
      installments: Array<{
        amount: number;
        dueDate: string;
        boletoUrl?: string | null;
        boletoName?: string | null;
      }>;
    },
    _userId?: string
  ) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        paymentBoletoInstallments: true,
        amountToPay: true
      }
    });
    if (!order) throw new Error('Ordem de compra não encontrada');
    if (order.status !== 'APPROVED') {
      throw new Error('Só é possível registrar boletos em OC aprovada');
    }
    if (order.paymentType !== 'BOLETO') {
      throw new Error('Parcelas de boleto aplicam-se apenas a OC com pagamento em boleto');
    }
    const [meta] = await enrichOrdersParcelPlans([order]);
    const parcelCount = meta.paymentParcelCount;
    if (body.installments.length !== parcelCount) {
      throw new Error(`Envie exatamente ${parcelCount} parcela(s), conforme a condição de pagamento.`);
    }
    const existing = parseStoredInstallments(order.paymentBoletoInstallments);
    const merged: BoletoInstallmentStored[] = body.installments.map((row, i) => {
      const prev = existing[i] || {};
      const prevSt = rowStatus(prev);
      if (prevSt === 'AWAITING_PAYMENT' || prevSt === 'PAID') {
        return {
          amount: prev.amount,
          dueDate: prev.dueDate,
          boletoUrl: prev.boletoUrl,
          boletoName: prev.boletoName,
          paymentStatus: prevSt,
          installmentProofUrl: prev.installmentProofUrl ?? null,
          installmentProofName: prev.installmentProofName ?? null
        };
      }
      const urlIn = row.boletoUrl;
      const url =
        urlIn !== undefined && urlIn !== null && String(urlIn).trim() !== ''
          ? String(urlIn).trim()
          : prev.boletoUrl || null;
      const nameIn = row.boletoName;
      const name =
        nameIn !== undefined && nameIn !== null && String(nameIn).trim() !== ''
          ? String(nameIn).trim()
          : url
            ? prev.boletoName || null
            : null;
      const amount = Number(row.amount);
      const dueDate = String(row.dueDate || '').trim().slice(0, 10);
      return {
        amount,
        dueDate,
        boletoUrl: url,
        boletoName: name,
        paymentStatus: 'PENDING_BOLETO' as const
      };
    });
    for (const m of merged) {
      if (!Number.isFinite(m.amount) || m.amount < 0) {
        throw new Error('Valor da parcela inválido');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(m.dueDate)) {
        throw new Error('Data de vencimento inválida (use AAAA-MM-DD)');
      }
    }
    const orderTotal =
      order.amountToPay != null && String(order.amountToPay).trim() !== ''
        ? Number(order.amountToPay)
        : NaN;
    if (Number.isFinite(orderTotal)) {
      const sumCents = merged.reduce((s, m) => s + Math.round(Number(m.amount) * 100), 0);
      const totalCents = Math.round(orderTotal * 100);
      if (sumCents !== totalCents) {
        throw new Error(
          `A soma das parcelas deve ser igual ao total da OC (R$ ${orderTotal.toFixed(2).replace('.', ',')}).`
        );
      }
      for (const m of merged) {
        if (Number(m.amount) > orderTotal) {
          throw new Error('Nenhuma parcela pode ultrapassar o total da OC.');
        }
      }
    }
    const data: Prisma.PurchaseOrderUpdateInput = {
      paymentBoletoInstallments: merged as unknown as Prisma.InputJsonValue,
      updatedAt: new Date()
    };
    if (parcelCount === 1 && merged[0]?.boletoUrl) {
      data.paymentBoletoUrl = merged[0].boletoUrl;
      data.paymentBoletoName = merged[0].boletoName;
    } else if (parcelCount === 1 && !merged[0]?.boletoUrl) {
      data.paymentBoletoUrl = null;
      data.paymentBoletoName = null;
    } else {
      data.paymentBoletoUrl = null;
      data.paymentBoletoName = null;
    }
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data,
      include: purchaseOrderIncludeListSummary
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Anexa comprovante de pagamento na fase Pagamento (OC aprovada).
   */
  async attachPaymentProof(
    id: string,
    data: { paymentProofUrl: string; paymentProofName?: string },
    userId?: string
  ) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        paymentBoletoInstallments: true,
        paymentBoletoPhaseReleased: true,
        createdBy: true,
      },
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'APPROVED' && order.status !== 'PENDING_PROOF_CORRECTION') {
      throw new Error(
        'Só é possível anexar comprovante na fase Pagamento ou em correção do comprovante'
      );
    }
    if (order.paymentType === 'BOLETO' && !order.paymentBoletoPhaseReleased) {
      throw new Error(
        'Confirme o envio para a fase Pagamento (botão após anexar o boleto) antes de anexar o comprovante'
      );
    }
    const url = (data.paymentProofUrl || '').trim();
    if (!url) {
      throw new Error('Arquivo do comprovante é obrigatório');
    }
    const proofName = (data.paymentProofName || '').trim() || null;
    const updateData: Prisma.PurchaseOrderUpdateInput = {
      paymentProofUrl: url,
      paymentProofName: proofName,
      updatedAt: new Date()
    };
    if (order.paymentType === 'BOLETO') {
      const [meta] = await enrichOrdersParcelPlans([{ paymentCondition: order.paymentCondition }]);
      const n = meta.paymentParcelCount;
      if (n > 1) {
        const inst = parseStoredInstallments(order.paymentBoletoInstallments);
        if (!allMultiInstallmentsPaid(inst, n)) {
          throw new Error(
            'Aguarde o pagamento de todas as parcelas (financeiro libera cada uma) antes de anexar o comprovante'
          );
        }
        const spread = spreadOrderPaymentProofToPaidInstallments(inst, n, url, proofName);
        if (spread) {
          updateData.paymentBoletoInstallments = spread as unknown as Prisma.InputJsonValue;
        }
      }
    }
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: purchaseOrderIncludeListSummary
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Anexa uma NF na fase após validação do comprovante (qualquer usuário autenticado com acesso à OC).
   */
  async appendNfAttachment(
    id: string,
    data: { nfUrl: string; nfName?: string | null; nfNumber?: string | null },
    userId?: string
  ) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, orderNumber: true, status: true, createdBy: true, nfAttachments: true }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'PENDING_NF_ATTACHMENT') {
      throw new Error('Só é possível anexar NF quando a OC está na fase Anexar NF');
    }
    if (!userId) {
      throw new Error('Usuário não autenticado');
    }
    const url = (data.nfUrl || '').trim();
    if (!url) {
      throw new Error('Arquivo da nota fiscal é obrigatório');
    }
    if (!isValidNfNumber(data.nfNumber)) {
      throw new Error('Número da nota fiscal é obrigatório');
    }
    const list = parseNfAttachments(order.nfAttachments);
    const incomingKey = normalizeNfNumberKey(data.nfNumber);
    const alreadyOnOrder = list.some(
      (nf) => nf.number && normalizeNfNumberKey(nf.number) === incomingKey
    );
    if (alreadyOnOrder) {
      throw new Error('Esta nota fiscal já está anexada nesta OC');
    }
    const nfNumber = await claimInvoiceNumberForOrder(id, String(data.nfNumber));
    const name = (data.nfName || '').trim() || null;
    list.push({
      url,
      name,
      uploadedAt: new Date().toISOString(),
      number: nfNumber
    });
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        nfAttachments: list as unknown as Prisma.InputJsonValue,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeListSummary
    });
    await prependNfToFinancialControlParcels(order.orderNumber, nfNumber);
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Remove uma NF anexada (ainda na fase Anexar NF).
   */
  async removeNfAttachment(id: string, index: number, userId?: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, status: true, createdBy: true, nfAttachments: true }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'PENDING_NF_ATTACHMENT') {
      throw new Error('Só é possível remover NF na fase Anexar NF');
    }
    if (!userId) {
      throw new Error('Usuário não autenticado');
    }
    const list = parseNfAttachments(order.nfAttachments);
    if (!Number.isInteger(index) || index < 0 || index >= list.length) {
      throw new Error('Índice da nota fiscal inválido');
    }
    const [removed] = list.splice(index, 1);
    if (removed?.number) {
      await releaseInvoiceNumberForOrder(id, removed.number);
    }
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        nfAttachments: list.length > 0 ? (list as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeListSummary
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Valida se o número de NF pode ser usado nesta OC (ou em entrada de estoque vinculada).
   * @throws se já existir em outra OC
   */
  async assertInvoiceNumberAvailable(
    nfNumber: string,
    options?: { excludePurchaseOrderId?: string; excludeOrderNumber?: string }
  ): Promise<void> {
    if (!isValidNfNumber(nfNumber)) {
      throw new Error('Número da nota fiscal é obrigatório');
    }
    let excludeId = options?.excludePurchaseOrderId;
    if (!excludeId && options?.excludeOrderNumber?.trim()) {
      const po = await prisma.purchaseOrder.findUnique({
        where: { orderNumber: options.excludeOrderNumber.trim() },
        select: { id: true }
      });
      excludeId = po?.id;
    }
    const conflict = await findInvoiceNumberConflict(nfNumber, excludeId);
    if (conflict) {
      throw new Error(`Nota fiscal já existe na OC ${formatOcShortLabel(conflict.orderNumber)}`);
    }
  }

  /** Consulta se o nº da NF já está em uso (outra OC). */
  async checkInvoiceNumberAvailability(
    nfNumber: string,
    excludePurchaseOrderId?: string
  ): Promise<{ available: boolean; conflictOrderNumber?: string }> {
    if (!isValidNfNumber(nfNumber)) {
      return { available: true };
    }
    const conflict = await findInvoiceNumberConflict(nfNumber, excludePurchaseOrderId);
    if (conflict) {
      return { available: false, conflictOrderNumber: conflict.orderNumber };
    }
    return { available: true };
  }

  /** Reserva o número da NF para a OC (entrada de estoque). */
  async registerInvoiceNumberForOrderNumber(
    orderNumber: string,
    nfNumber: string
  ): Promise<void> {
    const trimmed = orderNumber.trim();
    if (!trimmed) throw new Error('Número da OC é obrigatório');
    const po = await prisma.purchaseOrder.findUnique({
      where: { orderNumber: trimmed },
      select: { id: true }
    });
    if (!po) throw new Error('Ordem de compra não encontrada');
    await claimInvoiceNumberForOrder(po.id, nfNumber);
  }

  /**
   * Comprador envia a parcela atual para o financeiro pagar (uma de cada vez em multi-parcela).
   */
  async releasePaymentBoletoPhase(id: string, _userId?: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        paymentBoletoUrl: true,
        paymentBoletoInstallments: true,
        paymentBoletoPhaseReleased: true,
        amountToPay: true
      }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'APPROVED') {
      throw new Error('Só é possível confirmar fase Pagamento em OC aprovada');
    }
    if (order.paymentType !== 'BOLETO') {
      throw new Error('Confirmação aplica-se apenas a OC com pagamento em boleto');
    }
    if (order.paymentBoletoPhaseReleased) {
      throw new Error('Esta OC já está com o financeiro para a parcela atual');
    }
    const [meta] = await enrichOrdersParcelPlans([order]);
    const n = meta.paymentParcelCount;

    const orderTotal =
      order.amountToPay != null && String(order.amountToPay).trim() !== ''
        ? Number(order.amountToPay)
        : NaN;
    if (Number.isFinite(orderTotal)) {
      const instForSum = parseStoredInstallments(order.paymentBoletoInstallments);
      const rowsForSum =
        instForSum.length >= n
          ? instForSum.slice(0, n)
          : [
              ...instForSum,
              ...Array.from({ length: n - instForSum.length }, () => ({
                amount: 0,
                dueDate: '',
                boletoUrl: null,
                boletoName: null,
                paymentStatus: 'PENDING_BOLETO' as const
              }))
            ];
      const sumCents = rowsForSum.reduce((s, m) => s + Math.round(Number(m.amount) * 100), 0);
      const totalCents = Math.round(orderTotal * 100);
      if (sumCents !== totalCents) {
        throw new Error(
          `A soma das parcelas deve ser igual ao total da OC (R$ ${orderTotal.toFixed(2).replace('.', ',')}).`
        );
      }
      for (const m of rowsForSum) {
        if (Number(m.amount) > orderTotal) {
          throw new Error('Nenhuma parcela pode ultrapassar o total da OC.');
        }
      }
    }

    if (n <= 1) {
      if (!((order.paymentBoletoUrl || '').trim())) {
        throw new Error('Anexe o boleto antes de enviar para a fase Pagamento');
      }
    } else {
      let inst = parseStoredInstallments(order.paymentBoletoInstallments);
      if (inst.length < n) {
        throw new Error('Registre as parcelas (valores e vencimentos) antes de enviar o boleto');
      }
      for (let i = 0; i < n; i++) {
        const st = rowStatus(inst[i]);
        if (st === 'PAID') continue;
        if (st === 'AWAITING_PAYMENT') {
          throw new Error('Aguarde o financeiro registrar o pagamento desta parcela antes de enviar outra');
        }
        if (st === 'PENDING_BOLETO') {
          if (!((inst[i]?.boletoUrl || '').trim())) {
            throw new Error(`Anexe o boleto da parcela ${i + 1} antes de enviar para a fase Pagamento`);
          }
          const next = inst.map((row, j) =>
            j === i ? { ...row, paymentStatus: 'AWAITING_PAYMENT' as const } : row
          );
          const updated = await prisma.purchaseOrder.update({
            where: { id },
            data: {
              paymentBoletoInstallments: next as unknown as Prisma.InputJsonValue,
              paymentBoletoUrl: null,
              paymentBoletoName: null,
              paymentBoletoPhaseReleased: true,
              updatedAt: new Date()
            },
            include: purchaseOrderIncludeListSummary
          });
          const [e] = await enrichOrdersParcelPlans([updated]);
          return e;
        }
      }
      throw new Error('Não há parcela pendente de envio ao financeiro');
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        paymentBoletoPhaseReleased: true,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeListSummary
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Financeiro: anexa comprovante do pagamento da parcela atual (em AWAITING_PAYMENT).
   */
  async attachBoletoInstallmentPaymentProof(
    id: string,
    data: { paymentProofUrl: string; paymentProofName?: string; installmentIndex?: number },
    _userId?: string
  ) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        paymentBoletoInstallments: true,
        paymentBoletoPhaseReleased: true
      }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'APPROVED') {
      throw new Error('Só é possível anexar comprovante em OC aprovada');
    }
    if (order.paymentType !== 'BOLETO') {
      throw new Error('Comprovante de parcela aplica-se apenas a OC em boleto');
    }
    const [meta] = await enrichOrdersParcelPlans([order]);
    const n = meta.paymentParcelCount;
    if (n <= 1) {
      throw new Error('Use o comprovante geral da OC para pagamento em parcela única');
    }
    const inst = parseStoredInstallments(order.paymentBoletoInstallments);
    const idx =
      data.installmentIndex != null && data.installmentIndex >= 0
        ? data.installmentIndex
        : resolveSequentialInstallmentProofIndex(inst, n);
    if (idx < 0 || idx >= n) {
      throw new Error('Não há parcela aguardando pagamento para anexar comprovante');
    }
    if (!order.paymentBoletoPhaseReleased) {
      await prisma.purchaseOrder.update({
        where: { id },
        data: { paymentBoletoPhaseReleased: true, updatedAt: new Date() }
      });
    }
    const target = inst[idx];
    if (!((target?.boletoUrl || '').trim())) {
      throw new Error(`A parcela ${idx + 1} ainda não tem boleto anexado`);
    }
    const url = (data.paymentProofUrl || '').trim();
    if (!url) {
      throw new Error('Arquivo do comprovante é obrigatório');
    }
    const name = (data.paymentProofName || '').trim() || null;
    const next = inst.map((row, j) => {
      if (j !== idx) return row;
      const base = { ...row, installmentProofUrl: url, installmentProofName: name };
      if (rowStatus(row) === 'PENDING_BOLETO') {
        return { ...base, paymentStatus: 'AWAITING_PAYMENT' as const };
      }
      return base;
    });
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        paymentBoletoInstallments: next as unknown as Prisma.InputJsonValue,
        paymentBoletoPhaseReleased: true,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeListSummary
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Financeiro: após pagar a parcela em aberto, devolve a OC ao comprador para anexar o próximo boleto.
   */
  async returnAfterBoletoInstallmentPaid(id: string, _userId?: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        paymentBoletoInstallments: true,
        paymentBoletoPhaseReleased: true
      }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'APPROVED') {
      throw new Error('Só é possível usar esta ação em OC aprovada');
    }
    if (order.paymentType !== 'BOLETO') {
      throw new Error('Esta ação aplica-se apenas a OC em boleto');
    }
    if (!order.paymentBoletoPhaseReleased) {
      throw new Error('A OC não está na fase Pagamento aguardando pagamento de parcela');
    }
    const [meta] = await enrichOrdersParcelPlans([order]);
    const n = meta.paymentParcelCount;
    if (n <= 1) {
      throw new Error('Fluxo por parcela aplica-se apenas a OC com mais de uma parcela na condição de pagamento');
    }
    const inst = parseStoredInstallments(order.paymentBoletoInstallments);
    const idx = inst.findIndex((r) => rowStatus(r) === 'AWAITING_PAYMENT');
    if (idx < 0) {
      throw new Error('Não há parcela aguardando pagamento para liberar a próxima');
    }
    const cur = inst[idx];
    if (!((cur.installmentProofUrl || '').trim())) {
      throw new Error('Anexe o comprovante de pagamento desta parcela antes de liberar a próxima');
    }
    const next = inst.map((row, j) =>
      j === idx ? { ...row, paymentStatus: 'PAID' as const } : row
    );
    const allPaid = allMultiInstallmentsPaid(next, n);
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        paymentBoletoInstallments: next as unknown as Prisma.InputJsonValue,
        paymentBoletoPhaseReleased: allPaid,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeListSummary
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Volta OC em boleto para a fila "Anexar Boleto" (remove boleto de pagamento já anexado).
   */
  async reopenAttachPaymentBoleto(id: string, _userId?: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, status: true, paymentType: true, paymentBoletoUrl: true, paymentBoletoInstallments: true }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'APPROVED') {
      throw new Error('Só é possível reabrir anexo de boleto em OC aprovada (fase Pagamento)');
    }
    if (order.paymentType !== 'BOLETO') {
      throw new Error('Reabrir fase de boleto aplica-se apenas a pagamento em boleto (parcelado)');
    }
    const inst = parseStoredInstallments(order.paymentBoletoInstallments);
    const hasInstUrl = inst.some((x) => (x.boletoUrl || '').trim());
    const hasLegacy = (order.paymentBoletoUrl || '').trim().length > 0;
    if (!hasLegacy && !hasInstUrl) {
      throw new Error('Não há boleto de pagamento anexado para remover');
    }
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        paymentBoletoUrl: null,
        paymentBoletoName: null,
        paymentBoletoInstallments: Prisma.JsonNull,
        paymentBoletoPhaseReleased: false,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeListSummary
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Remessa CNAB400 (mesmo layout do módulo financeiro / borderô Itaú) para OCs em Pagamento.
   * Exige fornecedor com banco, agência e conta preenchidos.
   */
  async generateCnab400Remessa(orderIds: string[]): Promise<{ content: string; skippedOrderNumbers: string[] }> {
    const uniqueIds = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new Error('Selecione ao menos uma ordem de compra');
    }

    const orders = await prisma.purchaseOrder.findMany({
      where: { id: { in: uniqueIds }, status: 'APPROVED' },
      include: { supplier: true, items: true }
    });

    if (orders.length !== uniqueIds.length) {
      throw new Error('Alguma OC não existe ou não está aprovada (fase Pagamento)');
    }

    const skippedOrderNumbers: string[] = [];
    const borderItems: BorderData[] = [];
    const borderService = new BorderService();

    for (const o of orders) {
      if (o.paymentType === 'BOLETO' && !o.paymentBoletoPhaseReleased) {
        skippedOrderNumbers.push(o.orderNumber);
        continue;
      }
      const s = o.supplier;
      const bank = (s.bank || '').trim();
      const agency = (s.agency || '').trim();
      const account = (s.account || '').trim();
      if (!bank || !agency || !account) {
        skippedOrderNumbers.push(o.orderNumber);
        continue;
      }

      const itemsTotal = o.items.reduce((sum, it) => sum + Number(it.totalPrice), 0);
      let amount =
        o.amountToPay != null && String(o.amountToPay).trim() !== ''
          ? Number(o.amountToPay)
          : itemsTotal;

      if (o.paymentType === 'BOLETO') {
        const [ocMeta] = await enrichOrdersParcelPlans([o]);
        if (ocMeta.paymentParcelCount > 1) {
          const inst = parseStoredInstallments(o.paymentBoletoInstallments);
          const aw = inst.findIndex((r) => rowStatus(r) === 'AWAITING_PAYMENT');
          if (aw >= 0) {
            const part = Number(inst[aw]?.amount);
            if (Number.isFinite(part) && part > 0) {
              amount = part;
            }
          }
        }
      }

      if (!(amount > 0)) {
        skippedOrderNumbers.push(o.orderNumber);
        continue;
      }

      let doc = (s.cnpj || '').replace(/\D/g, '');
      if (doc.length <= 11) {
        doc = doc.padStart(14, '0');
      } else {
        doc = doc.slice(0, 14);
      }

      borderItems.push({
        date: new Date().toLocaleDateString('pt-BR'),
        name: s.name,
        amount,
        bank,
        accountType: 'CORRENTE',
        agency,
        operation: null,
        account,
        digit: (s.accountDigit || '0').trim().slice(0, 1) || '0',
        pixKeyType: null,
        pixKey: null,
        cpf: doc
      });
    }

    if (borderItems.length === 0) {
      throw new Error(
        'Nenhuma OC selecionada tem fornecedor com banco, agência e conta cadastrados. Cadastre em Suprimentos → Fornecedores.'
      );
    }

    const content = await borderService.generateCNAB400FromBorderData(borderItems);
    return { content, skippedOrderNumbers };
  }

  /** Status em que parcelas de boleto já existem e podem ser preenchidas a partir do estoque. */
  private static readonly STOCK_BOLETO_SYNC_STATUSES = new Set([
    'APPROVED',
    'PENDING_PROOF_VALIDATION',
    'PENDING_PROOF_CORRECTION',
    'PENDING_NF_ATTACHMENT',
    'SENT',
    'FINALIZED',
    'PARTIALLY_RECEIVED',
    'RECEIVED'
  ]);

  private async persistBoletoInstallmentsFromStock(
    orderId: string,
    base: BoletoInstallmentStored[],
    parcelCount: number
  ): Promise<void> {
    const data: Prisma.PurchaseOrderUpdateInput = {
      paymentBoletoInstallments: base as unknown as Prisma.InputJsonValue,
      updatedAt: new Date()
    };
    if (parcelCount === 1 && base[0]?.boletoUrl) {
      data.paymentBoletoUrl = base[0].boletoUrl;
      data.paymentBoletoName = base[0].boletoName;
    } else if (parcelCount === 1 && !base[0]?.boletoUrl) {
      data.paymentBoletoUrl = null;
      data.paymentBoletoName = null;
    } else {
      data.paymentBoletoUrl = null;
      data.paymentBoletoName = null;
    }
    await prisma.purchaseOrder.update({ where: { id: orderId }, data });
  }

  /**
   * Boleto já anexado na criação (parcela única): copia para pagamento e libera fase Pagamento.
   */
  async maybeSkipAttachBoletoFromCreation(orderId: string): Promise<boolean> {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        boletoAttachmentUrl: true,
        boletoAttachmentName: true,
        paymentBoletoUrl: true,
        paymentBoletoName: true,
        paymentBoletoPhaseReleased: true
      }
    });
    if (!order || order.status !== 'APPROVED' || order.paymentType !== 'BOLETO') return false;

    const [meta] = await enrichOrdersParcelPlans([order]);
    const release = buildCreationBoletoAutoReleaseData(order, meta.paymentParcelCount);
    if (!release) return false;

    await prisma.purchaseOrder.update({
      where: { id: orderId },
      data: { ...release, updatedAt: new Date() }
    });
    return true;
  }

  /** Corrige OCs aprovadas com flag de fase Pagamento sem parcela AWAITING_PAYMENT (estado inconsistente). */
  async normalizeStaleBoletoPhaseReleased(orderId: string): Promise<boolean> {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        paymentBoletoUrl: true,
        boletoAttachmentUrl: true,
        paymentBoletoInstallments: true,
        paymentBoletoPhaseReleased: true
      }
    });
    if (!order || order.status !== 'APPROVED' || order.paymentType !== 'BOLETO') return false;
    if (!order.paymentBoletoPhaseReleased) return false;

    const [meta] = await enrichOrdersParcelPlans([order]);
    const n = meta.paymentParcelCount;
    if (n <= 1) {
      if ((order.paymentBoletoUrl || '').trim() || (order.boletoAttachmentUrl || '').trim()) return false;
    } else {
      const inst = parseStoredInstallments(order.paymentBoletoInstallments);
      if (inst.some((r) => rowStatus(r) === 'AWAITING_PAYMENT')) return false;
      let needsReset = false;
      for (let i = 0; i < n; i++) {
        const st = rowStatus(inst[i]);
        if (st === 'PENDING_BOLETO' && !((inst[i]?.boletoUrl || '').trim())) {
          needsReset = true;
          break;
        }
      }
      if (!needsReset) return false;
    }

    await prisma.purchaseOrder.update({
      where: { id: orderId },
      data: { paymentBoletoPhaseReleased: false, updatedAt: new Date() }
    });
    return true;
  }

  async normalizeStaleBoletoPhaseReleasedToListedOrders<T extends {
    id: string;
    status: string;
    paymentType: string | null;
    paymentCondition: string | null;
    paymentBoletoUrl: string | null;
    boletoAttachmentUrl: string | null;
    paymentBoletoInstallments: unknown;
    paymentBoletoPhaseReleased: boolean;
    paymentParcelCount: number;
  }>(orders: T[]): Promise<T[]> {
    const next = [...orders];
    for (let i = 0; i < next.length; i++) {
      const changed = await this.normalizeStaleBoletoPhaseReleased(next[i].id);
      if (changed) next[i] = { ...next[i], paymentBoletoPhaseReleased: false };
    }
    return next;
  }

  /** Corrige OCs já aprovadas que tinham boleto na criação mas ainda pediam reanexo. */
  async applyCreationBoletoAutoReleaseToListedOrders<T extends {
    id: string;
    status: string;
    paymentType: string | null;
    paymentCondition: string | null;
    boletoAttachmentUrl: string | null;
    boletoAttachmentName: string | null;
    paymentBoletoUrl: string | null;
    paymentBoletoName: string | null;
    paymentBoletoPhaseReleased: boolean;
    paymentParcelCount: number;
  }>(orders: T[]): Promise<T[]> {
    const next = [...orders];
    for (let i = 0; i < next.length; i++) {
      const o = next[i];
      if (o.status !== 'APPROVED' || o.paymentType !== 'BOLETO' || o.paymentBoletoPhaseReleased) continue;
      if (!(o.boletoAttachmentUrl || '').trim()) continue;
      const release = buildCreationBoletoAutoReleaseData(o, o.paymentParcelCount);
      if (!release) continue;
      await prisma.purchaseOrder.update({
        where: { id: o.id },
        data: { ...release, updatedAt: new Date() }
      });
      next[i] = { ...o, ...release };
    }
    return next;
  }

  /**
   * Com todos os boletos já anexados e fase Pagamento ativa, alinha parcelas pendentes para AWAITING_PAYMENT
   * (evita devolver OC ao comprador entre parcelas).
   */
  async normalizeParallelBoletoInstallmentsIfNeeded(orderId: string): Promise<void> {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        paymentBoletoInstallments: true,
        paymentBoletoPhaseReleased: true
      }
    });
    if (!order || order.status !== 'APPROVED' || order.paymentType !== 'BOLETO') return;
    if (!order.paymentBoletoPhaseReleased) return;

    const [meta] = await enrichOrdersParcelPlans([order]);
    const n = meta.paymentParcelCount;
    if (n <= 1) return;

    const inst = parseStoredInstallments(order.paymentBoletoInstallments);
    if (!useParallelBoletoPaymentFlow(inst, n)) return;
    if (!allInstallmentsHaveBoleto(inst, n)) return;

    const promoted = promoteParallelInstallmentsToAwaitingPayment(inst);
    const before = JSON.stringify(inst);
    const after = JSON.stringify(promoted);
    if (before === after) return;

    await prisma.purchaseOrder.update({
      where: { id: orderId },
      data: {
        paymentBoletoInstallments: promoted as unknown as Prisma.InputJsonValue,
        paymentBoletoPhaseReleased: true,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Quando o comprovante foi anexado só no nível da OC, replica nas parcelas pagas sem comprovante.
   */
  async syncInstallmentProofsFromOrderPaymentProof(orderId: string): Promise<void> {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      select: {
        paymentType: true,
        paymentCondition: true,
        paymentProofUrl: true,
        paymentProofName: true,
        paymentBoletoInstallments: true
      }
    });
    if (!order || order.paymentType !== 'BOLETO') return;
    const proofUrl = (order.paymentProofUrl || '').trim();
    if (!proofUrl) return;

    const [meta] = await enrichOrdersParcelPlans([order]);
    const n = meta.paymentParcelCount;
    if (n <= 1) return;

    const inst = parseStoredInstallments(order.paymentBoletoInstallments);
    const spread = spreadOrderPaymentProofToPaidInstallments(
      inst,
      n,
      proofUrl,
      order.paymentProofName
    );
    if (!spread) return;

    await prisma.purchaseOrder.update({
      where: { id: orderId },
      data: {
        paymentBoletoInstallments: spread as unknown as Prisma.InputJsonValue,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Sincroniza boletos das entradas de estoque para as parcelas da OC.
   * Preenche parcelas vazias e substitui arquivos quando o estoque envia um boleto mais recente.
   */
  async syncBoletoInstallmentsFromStockReceipt(orderNumber: string): Promise<void> {
    const trimmed = orderNumber.trim();
    if (!trimmed) return;

    const order = await prisma.purchaseOrder.findUnique({
      where: { orderNumber: trimmed },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        orderDate: true,
        amountToPay: true,
        paymentBoletoInstallments: true
      }
    });
    if (!order) return;
    if (order.paymentType !== 'BOLETO') return;
    if (!PurchaseOrderService.STOCK_BOLETO_SYNC_STATUSES.has(order.status)) return;

    const inMovements = await prisma.stockMovement.findMany({
      where: { type: 'IN', notes: { contains: trimmed, mode: 'insensitive' } },
      select: { notes: true },
      take: 5000,
      orderBy: { createdAt: 'desc' }
    });

    const [meta] = await enrichOrdersParcelPlans([order]);
    const parcelCount = meta.paymentParcelCount;
    const existing = parseStoredInstallments(order.paymentBoletoInstallments);
    const totalPay =
      order.amountToPay != null && String(order.amountToPay).trim() !== ''
        ? Number(order.amountToPay)
        : 0;
    const defaultAmountPerParcel =
      parcelCount > 0 && Number.isFinite(totalPay) ? totalPay / parcelCount : 0;

    const base: BoletoInstallmentStored[] = Array.from({ length: parcelCount }, (_, i) => {
      const prev = existing[i];
      const days = meta.paymentParcelDueDays[i] ?? meta.paymentParcelDueDays[0] ?? 30;
      const dueDate =
        (prev?.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(prev.dueDate))
          ? prev.dueDate
          : ymdAddDays(order.orderDate, days);
      return {
        amount:
          prev && Number.isFinite(prev.amount) && prev.amount >= 0
            ? prev.amount
            : defaultAmountPerParcel,
        dueDate,
        boletoUrl: prev?.boletoUrl ?? null,
        boletoName: prev?.boletoName ?? null,
        paymentStatus: prev ? rowStatus(prev) : 'PENDING_BOLETO',
        installmentProofUrl: prev?.installmentProofUrl ?? null,
        installmentProofName: prev?.installmentProofName ?? null
      };
    });

    const latestByParcel = collectLatestPaymentSlipsPerParcelFromMovements(
      inMovements,
      trimmed,
      base.map((row) => row.dueDate)
    );
    if (latestByParcel.size === 0) return;

    const applyStockSlipToParcel = (parcelIndex: number, slip: StockPaymentSlipParsed): void => {
      const row = base[parcelIndex];
      if (!row) return;
      if (rowStatus(row) === 'PAID') return;

      const nextUrl = (slip.url || '').trim();
      if (!nextUrl) return;

      row.boletoUrl = nextUrl;
      row.boletoName = (slip.name || '').trim() || row.boletoName;
      if (slip.amount != null && Number.isFinite(slip.amount) && slip.amount >= 0) {
        row.amount = slip.amount;
      }
      if (slip.dueDateYmd && /^\d{4}-\d{2}-\d{2}$/.test(slip.dueDateYmd)) {
        row.dueDate = slip.dueDateYmd;
      }
      if (rowStatus(row) === 'PENDING_BOLETO') {
        row.paymentStatus = 'PENDING_BOLETO';
      }
    };

    for (const [parcelIndex, slip] of latestByParcel) {
      applyStockSlipToParcel(parcelIndex, slip);
    }

    const installmentChanged = (prev: BoletoInstallmentStored | undefined, next: BoletoInstallmentStored) => {
      const prevUrl = (prev?.boletoUrl || '').trim();
      const nextUrl = (next.boletoUrl || '').trim();
      if (prevUrl !== nextUrl) return true;
      const prevName = (prev?.boletoName || '').trim();
      const nextName = (next.boletoName || '').trim();
      if (prevName !== nextName) return true;
      if (prev && Number.isFinite(prev.amount) && prev.amount !== next.amount) return true;
      if ((prev?.dueDate || '') !== (next.dueDate || '')) return true;
      return false;
    };

    const hasChanges = base.some((row, i) => installmentChanged(existing[i], row));
    if (!hasChanges) return;

    await this.persistBoletoInstallmentsFromStock(order.id, base, parcelCount);
    await this.maybeAutoReleasePaymentBoletoPhaseFromStock(order.id);
  }

  /**
   * Sincroniza NF anexadas na entrada de estoque para nfAttachments da OC.
   */
  async syncNfAttachmentsFromStockReceipt(orderNumber: string): Promise<void> {
    const trimmed = orderNumber.trim();
    if (!trimmed) return;

    const order = await prisma.purchaseOrder.findUnique({
      where: { orderNumber: trimmed },
      select: { id: true, status: true, nfAttachments: true }
    });
    if (!order) return;
    if (!PurchaseOrderService.STOCK_BOLETO_SYNC_STATUSES.has(order.status)) return;

    const inMovements = await prisma.stockMovement.findMany({
      where: { type: 'IN', notes: { contains: trimmed, mode: 'insensitive' } },
      select: { notes: true },
      take: 5000,
      orderBy: { createdAt: 'desc' }
    });

    const invoices = collectInvoicesForOrderFromMovements(inMovements, trimmed);
    if (invoices.length === 0) return;

    const existing = parseNfAttachments(order.nfAttachments);
    const seen = new Set(existing.map((n) => n.url));
    let changed = false;
    const newlyClaimedNfNumbers: string[] = [];
    for (const inv of invoices) {
      if (!inv.url || seen.has(inv.url)) continue;
      const nfNumber = (inv.number || '').trim();
      if (nfNumber) {
        try {
          await claimInvoiceNumberForOrder(order.id, nfNumber);
          newlyClaimedNfNumbers.push(nfNumber);
        } catch (err) {
          console.error(
            '[PurchaseOrder] syncNf skip (número NF em conflito)',
            trimmed,
            nfNumber,
            err
          );
          continue;
        }
      }
      seen.add(inv.url);
      existing.push({
        url: inv.url,
        name: inv.name || null,
        uploadedAt: new Date().toISOString(),
        number: nfNumber || null
      });
      changed = true;
    }
    if (!changed) return;

    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        nfAttachments: existing as unknown as Prisma.InputJsonValue,
        updatedAt: new Date()
      }
    });
    for (const nfNumber of newlyClaimedNfNumbers) {
      await prependNfToFinancialControlParcels(trimmed, nfNumber);
    }
  }

  /** Sincroniza boleto e NF do estoque para a OC. */
  async syncDocumentsFromStockReceipt(orderNumber: string): Promise<void> {
    await this.syncBoletoInstallmentsFromStockReceipt(orderNumber);
    await this.syncNfAttachmentsFromStockReceipt(orderNumber);
  }

  /**
   * Boletos vindos do estoque: libera fase Pagamento automaticamente (pula Anexar Boleto).
   */
  private async maybeAutoReleasePaymentBoletoPhaseFromStock(orderId: string): Promise<void> {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        paymentBoletoUrl: true,
        paymentBoletoInstallments: true,
        paymentBoletoPhaseReleased: true
      }
    });
    if (!order || order.status !== 'APPROVED' || order.paymentType !== 'BOLETO') return;
    if (order.paymentBoletoPhaseReleased) return;

    const [meta] = await enrichOrdersParcelPlans([order]);
    const n = meta.paymentParcelCount;
    const inst = parseStoredInstallments(order.paymentBoletoInstallments);

    let canRelease = false;
    if (n <= 1) {
      canRelease =
        !!((order.paymentBoletoUrl || '').trim()) || !!((inst[0]?.boletoUrl || '').trim());
    } else {
      for (let i = 0; i < n; i++) {
        const st = rowStatus(inst[i]);
        if (st === 'PAID') continue;
        if (st === 'AWAITING_PAYMENT') return;
        if (st === 'PENDING_BOLETO') {
          canRelease = !!((inst[i]?.boletoUrl || '').trim());
          break;
        }
      }
    }
    if (!canRelease) return;

    try {
      await this.releasePaymentBoletoPhase(orderId);
    } catch (err) {
      console.error('[PurchaseOrder] maybeAutoReleasePaymentBoletoPhaseFromStock', orderId, err);
    }
  }

  /** Reprocessa OCs com entradas de estoque que tenham boletos nas observações. */
  async rebuildBoletoInstallmentsFromAllStockMovements(): Promise<void> {
    const movements = await prisma.stockMovement.findMany({
      where: { type: 'IN', notes: { not: null } },
      select: { notes: true },
      take: 15000,
      orderBy: { createdAt: 'desc' }
    });
    const ocNumbers = new Set<string>();
    for (const m of movements) {
      const oc = extractOcNumberFromMovementNotes(m.notes);
      if (oc) ocNumbers.add(oc);
    }
    for (const orderNumber of ocNumbers) {
      try {
        await this.syncDocumentsFromStockReceipt(orderNumber);
      } catch (err) {
        console.error('[PurchaseOrder] rebuildBoleto sync', orderNumber, err);
      }
    }
  }

  async listComments(purchaseOrderId: string) {
    const db = getPrisma() as typeof prisma & {
      purchaseOrderComment?: {
        findMany: (args: unknown) => Promise<any[]>;
      };
      auditLog?: {
        findMany: (args: unknown) => Promise<any[]>;
      };
    };

    const existing = await db.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      select: {
        id: true,
        createdAt: true,
        status: true,
        creator: { select: { id: true, name: true, profilePhotoUrl: true } },
        comprasApprovedAt: true,
        comprasApprover: { select: { id: true, name: true, profilePhotoUrl: true } },
        gestorApprovedAt: true,
        gestorApprover: { select: { id: true, name: true, profilePhotoUrl: true } },
        approvedAt: true,
        approver: { select: { id: true, name: true, profilePhotoUrl: true } },
        invoiceNumbers: { select: { id: true, number: true, createdAt: true } },
      },
    });
    if (!existing) throw new Error('Ordem de compra não encontrada');

    type Author = { id: string; name: string; profilePhotoUrl?: string | null };
    type FeedItem = {
      id: string;
      kind: 'comment' | 'system';
      content: string;
      createdAt: string;
      author: Author | null;
    };

    const feed: FeedItem[] = [];

    const pushSystem = (id: string, at: Date | string | null | undefined, text: string, author?: Author | null) => {
      if (!at || !text.trim()) return;
      const createdAt = typeof at === 'string' ? at : at.toISOString();
      feed.push({
        id,
        kind: 'system',
        content: text.trim(),
        createdAt,
        author: author ?? null,
      });
    };

    if (existing.creator) {
      pushSystem(
        `sys-created-${existing.id}`,
        existing.createdAt,
        `${existing.creator.name} criou a ordem de compra`,
        existing.creator
      );
    }
    if (existing.comprasApprovedAt && existing.comprasApprover) {
      pushSystem(
        `sys-compras-${existing.id}`,
        existing.comprasApprovedAt,
        `${existing.comprasApprover.name} aprovou no compras`,
        existing.comprasApprover
      );
    }
    if (existing.gestorApprovedAt && existing.gestorApprover) {
      pushSystem(
        `sys-gestor-${existing.id}`,
        existing.gestorApprovedAt,
        `${existing.gestorApprover.name} aprovou como gestor`,
        existing.gestorApprover
      );
    }
    if (existing.approvedAt && existing.approver) {
      pushSystem(
        `sys-approved-${existing.id}`,
        existing.approvedAt,
        `${existing.approver.name} aprovou como diretoria`,
        existing.approver
      );
    }
    for (const inv of existing.invoiceNumbers || []) {
      pushSystem(
        `sys-nf-${inv.id}`,
        inv.createdAt,
        `NF ${inv.number} foi adicionada à ordem de compra`
      );
    }

    // Eventos de auditoria (rejeição / exclusão — aprovações já vêm dos campos da OC)
    if (db.auditLog?.findMany) {
      try {
        const audits = await db.auditLog.findMany({
          where: {
            entity: 'PurchaseOrder',
            entityId: purchaseOrderId,
            action: { in: ['REJECT', 'DELETE'] },
          },
          orderBy: { createdAt: 'asc' },
          take: 50,
        });
        const userIds = Array.from(
          new Set(audits.map((a: any) => a.userId).filter(Boolean))
        ) as string[];
        const users =
          userIds.length > 0
            ? await db.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true, profilePhotoUrl: true },
              })
            : [];
        const userById = new Map(users.map((u) => [u.id, u]));
        for (const a of audits) {
          const summary = String(a.summary || '').trim();
          if (!summary) continue;
          const author = a.userId ? userById.get(a.userId) || null : null;
          const who = author?.name ? `${author.name} ` : '';
          const rest = summary.charAt(0).toLowerCase() + summary.slice(1);
          pushSystem(
            `sys-audit-${a.id}`,
            a.createdAt,
            `${who}${rest}`.replace(/\s+/g, ' ').trim(),
            author
          );
        }
      } catch (err) {
        console.warn('[PurchaseOrder] falha ao carregar auditoria no feed:', err);
      }
    }

    if (db.purchaseOrderComment?.findMany) {
      const rows = await db.purchaseOrderComment.findMany({
        where: { purchaseOrderId },
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { id: true, name: true, profilePhotoUrl: true } },
        },
      });
      for (const c of rows) {
        feed.push({
          id: c.id,
          kind: 'comment',
          content: c.content,
          createdAt: c.createdAt.toISOString(),
          author: {
            id: c.author.id,
            name: c.author.name,
            profilePhotoUrl: c.author.profilePhotoUrl,
          },
        });
      }
    }

    feed.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return feed;
  }

  async createComment(purchaseOrderId: string, userId: string, content: string) {
    const text = content.trim();
    if (!text) throw new Error('Escreva um comentário');
    if (text.length > 4000) throw new Error('Comentário muito longo (máx. 4000 caracteres)');

    const db = getPrisma() as typeof prisma & {
      purchaseOrderComment?: {
        create: (args: unknown) => Promise<any>;
      };
    };

    if (!db.purchaseOrderComment?.create) {
      throw new Error(
        'Comentários de OC indisponíveis no servidor. Rode `npx prisma generate` em apps/backend e reinicie o backend.'
      );
    }

    const existing = await db.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      select: { id: true },
    });
    if (!existing) throw new Error('Ordem de compra não encontrada');

    const comment = await db.purchaseOrderComment.create({
      data: {
        purchaseOrderId,
        userId,
        content: text,
      },
      include: {
        author: { select: { id: true, name: true, profilePhotoUrl: true } },
      },
    });

    return {
      id: comment.id,
      kind: 'comment' as const,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      author: {
        id: comment.author.id,
        name: comment.author.name,
        profilePhotoUrl: comment.author.profilePhotoUrl,
      },
    };
  }

  async deleteComment(commentId: string, userId: string, isAdmin: boolean) {
    const db = getPrisma() as typeof prisma & {
      purchaseOrderComment?: {
        findUnique: (args: unknown) => Promise<any>;
        delete: (args: unknown) => Promise<any>;
      };
    };
    if (!db.purchaseOrderComment?.findUnique) {
      throw new Error('Comentários de OC indisponíveis no servidor');
    }
    const comment = await db.purchaseOrderComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true },
    });
    if (!comment) throw new Error('Comentário não encontrado');
    if (!isAdmin && comment.userId !== userId) {
      throw new Error('Sem permissão para excluir este comentário');
    }
    await db.purchaseOrderComment.delete({ where: { id: commentId } });
  }

  /**
   * Remove um item da OC e devolve à RM para novo mapa/cotação (mesmo requestNumber).
   * Só em fases pré-aprovação; exige ≥2 itens na OC.
   */
  async returnItemToMaterialRequest(
    purchaseOrderId: string,
    purchaseOrderItemId: string,
    userId: string,
    isAdmin: boolean,
    reason: string,
    options?: { cancelItem?: boolean }
  ) {
    const reasonText = reason.trim();
    if (!reasonText) throw new Error('Informe o motivo da retirada do item');
    if (reasonText.length > 2000) throw new Error('Motivo muito longo (máx. 2000 caracteres)');
    if (!userId) throw new Error('Usuário não autenticado');

    const order = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        items: {
          include: {
            material: { select: { id: true, name: true, description: true, sinapiCode: true } },
          },
        },
        materialRequest: {
          select: {
            id: true,
            requestNumber: true,
            status: true,
            costCenter: { select: { id: true } },
          },
        },
      },
    });
    if (!order) throw new Error('Ordem de compra não encontrada');

    if (!isOcStatusAllowingReturnItemToRm(order.status)) {
      throw new Error(
        'Só é possível retirar itens da OC antes da validação de comprovante / conclusão do fluxo'
      );
    }

    // Pagamento: se já existe lançamento no Controle Financeiro, não permite.
    if (order.status === 'APPROVED') {
      const launchCount = await prisma.financialControlEntry.count({
        where: { ocNumber: { equals: order.orderNumber, mode: 'insensitive' } },
      });
      if (launchCount > 0) {
        throw new Error(
          'Não é possível devolver itens após o lançamento financeiro desta OC'
        );
      }
    }

    // Administrador ou permissão Controle «Devolver item da OC à RM».
    await assertUserCanReturnOcItemToRm(userId, isAdmin);

    const line = order.items.find((i) => i.id === purchaseOrderItemId);
    if (!line) throw new Error('Item não encontrado nesta ordem de compra');

    const isLastItem = order.items.length <= 1;
    const cancelItem = options?.cancelItem === true;

    const materialLabel =
      line.material?.name?.trim() ||
      line.material?.description?.trim() ||
      line.material?.sinapiCode?.trim() ||
      line.materialId;

    const actorName = await resolveUserDisplayName(userId);
    const at = new Date().toLocaleString('pt-BR');
    const noteHeader = actorName
      ? cancelItem
        ? `[Item cancelado — ${at} — ${actorName}]`
        : `[Item devolvido à RM — ${at} — ${actorName}]`
      : cancelItem
        ? `[Item cancelado — ${at}]`
        : `[Item devolvido à RM — ${at}]`;
    const noteBody = `${materialLabel} (qtd ${Number(line.quantity)} ${line.unit || ''}). Motivo: ${reasonText}`;
    const cancelNote = isLastItem
      ? `\n\n[OC cancelada — ${cancelItem ? 'item cancelado' : 'último item devolvido à RM'} em ${at}]`
      : '';
    const note = `${noteHeader}\n${noteBody}${cancelNote}`;
    const nextNotes = order.notes?.trim() ? `${order.notes.trim()}\n\n${note}` : note;

    const rmItemId = line.materialRequestItemId;

    await prisma.$transaction(async (tx) => {
      if (!isLastItem) {
        await tx.purchaseOrderItem.delete({ where: { id: line.id } });
      }

      const remaining = isLastItem
        ? order.items
        : await tx.purchaseOrderItem.findMany({
            where: { purchaseOrderId },
            select: { totalPrice: true },
          });
      const itemsSum = remaining.reduce(
        (acc, i) => acc.plus(new Decimal(i.totalPrice)),
        new Decimal(0)
      );
      const freight =
        order.freightAmount != null ? new Decimal(order.freightAmount) : new Decimal(0);
      const amountToPay = itemsSum.plus(freight);

      await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: {
          amountToPay,
          notes: nextNotes,
          ...(isLastItem ? { status: 'CANCELLED' as const } : {}),
          updatedAt: new Date(),
        },
      });

      if (rmItemId) {
        await tx.materialRequestItem.update({
          where: { id: rmItemId },
          data: {
            status: cancelItem ? 'CANCELLED' : 'APPROVED',
            fulfilledQuantity: null,
            updatedAt: new Date(),
          },
        });

        if (!cancelItem) {
          // Remove vencedores/preços do item em mapas antigos para não travar nova cotação.
          await tx.quoteMapWinnerItem.deleteMany({ where: { materialRequestItemId: rmItemId } });
          await tx.quoteMapSupplierItem.deleteMany({ where: { materialRequestItemId: rmItemId } });
        }
      }

      if (order.materialRequestId && order.materialRequest?.status === 'APPROVED') {
        await tx.materialRequestComment.create({
          data: {
            materialRequestId: order.materialRequestId,
            userId,
            content: isLastItem
              ? cancelItem
                ? `Item cancelado na OC ${order.orderNumber} (OC cancelada): ${noteBody}`
                : `Último item devolvido da OC ${order.orderNumber} (OC cancelada) para nova cotação: ${noteBody}`
              : cancelItem
                ? `Item cancelado e retirado da OC ${order.orderNumber}: ${noteBody}`
                : `Item devolvido da OC ${order.orderNumber} para nova cotação: ${noteBody}`,
          },
        });
      }

      await tx.purchaseOrderComment.create({
        data: {
          purchaseOrderId,
          userId,
          content: isLastItem
            ? cancelItem
              ? `Item cancelado (OC cancelada): ${noteBody}`
              : `Último item retirado e devolvido à RM (OC cancelada): ${noteBody}`
            : cancelItem
              ? `Item cancelado e retirado da OC: ${noteBody}`
              : `Item retirado e devolvido à RM: ${noteBody}`,
        },
      });
    });

    const fresh = await this.getById(purchaseOrderId);
    if (!fresh) throw new Error('Ordem de compra não encontrada após a retirada');
    return fresh;
  }

  /** Itens da RM que já estão em OC ativa (não rejeitada/cancelada). */
  async getCoveredMaterialRequestItemIds(materialRequestId: string): Promise<string[]> {
    const rows = await prisma.purchaseOrderItem.findMany({
      where: {
        materialRequestItemId: { not: null },
        purchaseOrder: {
          materialRequestId,
          status: { in: [...OC_STATUSES_COVERING_RM_ITEMS] },
        },
      },
      select: { materialRequestItemId: true },
    });
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.materialRequestItemId) ids.add(row.materialRequestItemId);
    }
    return [...ids];
  }
}
