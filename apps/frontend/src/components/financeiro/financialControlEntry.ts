import {
  parsePaymentBoletoInstallments,
  visiblePaymentBoletoInstallmentIndex,
  type OrderBoletoPhasePick,
} from '@/components/oc/ocPaymentBoleto';
import { formatOcFinancialControlOriginNote } from '@/components/oc/ocListDisplay';

export type { FinancialControlStatus } from '@/lib/financialControlStatus';
export {
  FINANCIAL_CONTROL_STATUS_OPTIONS as STATUS_OPTIONS,
} from '@/lib/financialControlStatus';

import type { FinancialControlStatus } from '@/lib/financialControlStatus';

export type FinancialControlConsorcio = 'brasilia' | 'hub';

export type FinancialControlApplicationType = 'MATERIAL' | 'SERVICO' | 'MISTO';

export const FINANCIAL_CONTROL_APPLICATION_TYPE_OPTIONS: Array<{
  value: FinancialControlApplicationType;
  label: string;
}> = [
  { value: 'MATERIAL', label: 'Material' },
  { value: 'SERVICO', label: 'Serviço' },
  { value: 'MISTO', label: 'Misto' },
];

export const FINANCIAL_CONTROL_APPLICATION_TYPE_LABELS: Record<
  FinancialControlApplicationType,
  string
> = {
  MATERIAL: 'Material',
  SERVICO: 'Serviço',
  MISTO: 'Misto',
};

export function formatApplicationTypeLabel(
  value: string | null | undefined
): string {
  if (!value) return '—';
  const key = value.trim().toUpperCase() as FinancialControlApplicationType;
  return FINANCIAL_CONTROL_APPLICATION_TYPE_LABELS[key] || value;
}

export const FINANCIAL_CONTROL_CONSORCIO_OPTIONS: Array<{
  value: FinancialControlConsorcio;
  label: string;
}> = [
  { value: 'brasilia', label: 'Consórcio Predial Brasília' },
  { value: 'hub', label: 'Consórcio Predial HUB' },
];

export const FINANCIAL_CONTROL_CONSORCIO_LABELS: Record<FinancialControlConsorcio, string> = {
  brasilia: 'Consórcio Predial Brasília',
  hub: 'Consórcio Predial HUB',
};

/** Consórcio fixo no lançamento rápido a partir da OC (aba Pagamento). */
export const FINANCIAL_CONTROL_OC_DEFAULT_CONSORCIO: FinancialControlConsorcio = 'brasilia';
export const FINANCIAL_CONTROL_OC_CONSORCIO_LABEL = 'Consórcio Predial Brasília';
export const FINANCIAL_CONTROL_OC_CONSORCIO_FIELD_LABEL = 'Contrato';

export type FinancialControlAttachment = { url: string; name: string };

export interface FinancialControlEntry {
  id: string;
  consorcio: FinancialControlConsorcio;
  paymentMonth: number;
  paymentYear: number;
  status: FinancialControlStatus;
  osCode: string | null;
  supplierName: string | null;
  nfNumber: string | null;
  parcelNumber: string | null;
  emissionDate: string | null;
  boleto: string | null;
  dueDate: string | null;
  originalValue: string | number | null;
  ocNumber: string | null;
  finalValue: string | number | null;
  paidDate: string | null;
  remainingDays: number | null;
  receivedNote: string | null;
  notes: string | null;
  applicationType?: FinancialControlApplicationType | string | null;
  attachments?: FinancialControlAttachment[] | null;
  createdAt: string;
  updatedAt: string;
}

export function parseFinancialControlAttachments(raw: unknown): FinancialControlAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const url = String((item as { url?: unknown }).url || '').trim();
      if (!url) return null;
      const name = String((item as { name?: unknown }).name || '').trim() || 'Arquivo anexado';
      return { url, name };
    })
    .filter((item): item is FinancialControlAttachment => Boolean(item));
}

export const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function financialControlSupplierSelectOption(supplier: {
  code?: string | null;
  name?: string | null;
  tradeName?: string | null;
}) {
  const legalName = String(supplier.name || '').trim();
  const tradeName = String(supplier.tradeName || '').trim();
  const displayName = tradeName || legalName;
  const label = supplier.code ? `${supplier.code} - ${displayName}` : displayName;
  return {
    value: label,
    label,
    searchText: [supplier.code, legalName, tradeName].filter(Boolean).join(' '),
  };
}

export interface EntryFormState {
  id?: string;
  consorcio: FinancialControlConsorcio | '';
  paymentMonth: number;
  paymentYear: number;
  status: FinancialControlStatus;
  osCode: string;
  supplierName: string;
  nfNumber: string;
  parcelNumber: string;
  emissionDate: string;
  boleto: string;
  dueDate: string;
  originalValue: string;
  ocNumber: string;
  finalValue: string;
  paidDate: string;
  remainingDays: string;
  receivedNote: string;
  notes: string;
  applicationType: FinancialControlApplicationType | '';
  attachments: FinancialControlAttachment[];
}

export function parseCurrencyInput(value: string): number | null {
  if (!value) return null;
  const digitsOnly = value.replace(/\D/g, '');
  if (!digitsOnly) return null;
  const n = parseInt(digitsOnly, 10) / 100;
  return isNaN(n) ? null : n;
}

export function formatCurrencyValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(n)) return '';
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function calcRemainingDays(dueDate: string, paidDate: string): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return null;
  const ref = paidDate ? new Date(paidDate) : new Date();
  if (isNaN(ref.getTime())) return null;
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return Math.floor((a - b) / (1000 * 60 * 60 * 24));
}

export function todayDateInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDateDisplayPtBr(isoDate: string): string {
  if (!isoDate) return '—';
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}
export function dateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildInitialForm(
  month: number,
  year: number,
  consorcio: FinancialControlConsorcio | '' = ''
): EntryFormState {
  return {
    consorcio,
    paymentMonth: month,
    paymentYear: year,
    status: 'AGUARDAR_PAGAMENTO',
    osCode: '',
    supplierName: '',
    nfNumber: '',
    parcelNumber: '',
    emissionDate: '',
    boleto: 'Não',
    dueDate: '',
    originalValue: '',
    ocNumber: '',
    finalValue: '',
    paidDate: '',
    remainingDays: '',
    receivedNote: '',
    notes: '',
    applicationType: '',
    attachments: [],
  };
}

export function entryToForm(entry: FinancialControlEntry): EntryFormState {
  return {
    id: entry.id,
    consorcio: entry.consorcio === 'hub' ? 'hub' : 'brasilia',
    paymentMonth: entry.paymentMonth,
    paymentYear: entry.paymentYear,
    status: entry.status,
    osCode: entry.osCode || '',
    supplierName: entry.supplierName || '',
    nfNumber: entry.nfNumber || '',
    parcelNumber: entry.parcelNumber || '',
    emissionDate: dateInputValue(entry.emissionDate),
    boleto: entry.boleto || '',
    dueDate: dateInputValue(entry.dueDate),
    originalValue: formatCurrencyValue(entry.originalValue),
    ocNumber: entry.ocNumber || '',
    finalValue: formatCurrencyValue(entry.finalValue),
    paidDate: dateInputValue(entry.paidDate),
    remainingDays:
      entry.remainingDays !== null && entry.remainingDays !== undefined ? String(entry.remainingDays) : '',
    receivedNote: entry.receivedNote || '',
    notes: entry.notes || '',
    applicationType: (() => {
      const v = (entry.applicationType || '').trim().toUpperCase();
      if (v === 'MATERIAL' || v === 'SERVICO' || v === 'MISTO') return v;
      return '';
    })(),
    attachments: parseFinancialControlAttachments(entry.attachments),
  };
}

export function buildFinancialEntryPayload(form: EntryFormState) {
  if (form.consorcio !== 'brasilia' && form.consorcio !== 'hub') {
    throw new Error('Selecione o consórcio do lançamento');
  }
  const computedRemainingDays = calcRemainingDays(form.dueDate, form.paidDate);
  return {
    consorcio: form.consorcio,
    paymentMonth: form.paymentMonth,
    paymentYear: form.paymentYear,
    status: form.status,
    osCode: form.osCode || null,
    supplierName: form.supplierName || null,
    nfNumber: form.nfNumber || null,
    parcelNumber: form.parcelNumber || null,
    emissionDate: form.emissionDate || null,
    boleto: (() => {
      const normalized = (form.boleto || '').trim().toLowerCase();
      if (normalized === 'sim') return 'Sim';
      if (normalized === 'não' || normalized === 'nao' || !normalized) return 'Não';
      return form.boleto.trim();
    })(),
    dueDate: form.dueDate || null,
    originalValue: parseCurrencyInput(form.originalValue),
    ocNumber: form.ocNumber || null,
    finalValue: parseCurrencyInput(form.finalValue),
    paidDate: form.paidDate || null,
    remainingDays: computedRemainingDays,
    receivedNote: form.receivedNote || null,
    notes: form.notes || null,
    applicationType: form.applicationType || null,
    attachments: form.attachments,
  };
}

/** Monta payload do lançamento rápido da OC (valor da parcela + juros opcionais). */
export function buildQuickLaunchPayload(form: EntryFormState, interestValue = ''): ReturnType<typeof buildFinancialEntryPayload> {
  const base = parseCurrencyInput(form.originalValue || form.finalValue) ?? 0;
  const interest = parseCurrencyInput(interestValue) ?? 0;
  const total = Math.round((base + interest) * 100) / 100;
  const interestNote = interest > 0 ? `Juros: ${formatCurrencyValue(interest)}` : '';
  const receivedNote = [form.receivedNote, interestNote].filter(Boolean).join(' | ');
  return buildFinancialEntryPayload({
    ...form,
    originalValue: formatCurrencyValue(base),
    finalValue: formatCurrencyValue(total),
    receivedNote,
  });
}

function orderItemsTotal(items: Array<{ totalPrice: number }>): number {
  return items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
}

export function orderGrandTotalForFinancialEntry(order: {
  items?: Array<{ totalPrice: number }>;
  freightAmount?: number | string | null;
  amountToPay?: number | string | null;
}): number {
  const items = orderItemsTotal(order.items ?? []);
  const fRaw = order.freightAmount;
  if (fRaw != null && fRaw !== '' && Number.isFinite(Number(fRaw))) {
    return Math.round((items + Number(fRaw)) * 100) / 100;
  }
  const paid = order.amountToPay != null && order.amountToPay !== '' ? Number(order.amountToPay) : NaN;
  if (Number.isFinite(paid)) return paid;
  return Math.round(items * 100) / 100;
}

/** Separa NF e parcela de valor legado combinado (ex.: `556713-2/2`). */
export function splitNfAndParcelDisplay(raw: string | null | undefined): {
  nfNumber: string | null;
  parcelNumber: string | null;
} {
  if (raw == null) return { nfNumber: null, parcelNumber: null };
  const s = String(raw).trim();
  if (!s) return { nfNumber: null, parcelNumber: null };

  const withSlash = s.match(/^(\d+)-(\d+\/\d+)$/);
  if (withSlash) return { nfNumber: withSlash[1], parcelNumber: withSlash[2] };

  const withShortParcel = s.match(/^(\d+)-(\d{1,3})$/);
  if (withShortParcel) return { nfNumber: withShortParcel[1], parcelNumber: withShortParcel[2] };

  if (/^\d+\/\d+$/.test(s)) return { nfNumber: null, parcelNumber: s };

  return { nfNumber: s, parcelNumber: null };
}

/** Resolve NF e parcela para exibição (campos separados ou legado combinado). */
export function resolveNfAndParcelForDisplay(entry: {
  nfNumber?: string | null;
  parcelNumber?: string | null;
}): { nfNumber: string | null; parcelNumber: string | null } {
  const nf = (entry.nfNumber || '').trim();
  const parcel = (entry.parcelNumber || '').trim();
  if (nf) {
    return { nfNumber: nf, parcelNumber: parcel || null };
  }
  if (!parcel) return { nfNumber: null, parcelNumber: null };
  return splitNfAndParcelDisplay(parcel);
}

/** Prefixo de anexo NF em nfAttachments da OC. */
export function firstNfNumberFromAttachments(raw: unknown): string | null {
  if (!raw || !Array.isArray(raw)) return null;
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const number = (x as { number?: unknown }).number;
    if (typeof number === 'string' && number.trim()) return number.trim();
  }
  return null;
}

/**
 * Verifica se existe lançamento financeiro da parcela corrente
 * (ex.: parcela 2 só libera com lançamento "2/2", não o da parcela 1).
 */
export function hasFinancialEntryForOcInstallment(
  entries: Array<{ parcelNumber?: string | null; dueDate?: string | null }>,
  opts: {
    installmentIndex: number;
    parcelCount: number;
    installmentDueDate?: string | null;
  }
): boolean {
  if (!entries.length) return false;
  const { installmentIndex, parcelCount, installmentDueDate } = opts;
  if (parcelCount <= 1) return true;

  const expected = installmentIndex + 1;
  const fullLabel = `${expected}/${parcelCount}`;
  const shortLabel = String(expected);

  const matchedByParcel = entries.some((entry) => {
    const raw = (entry.parcelNumber || '').trim();
    if (!raw) return false;
    if (raw === fullLabel || raw === shortLabel) return true;
    const slash = raw.match(/^(\d+)\s*\/\s*\d+$/);
    if (slash && Number(slash[1]) === expected) return true;
    const resolved = resolveNfAndParcelForDisplay(entry).parcelNumber?.trim() || '';
    if (resolved === fullLabel || resolved === shortLabel) return true;
    const resolvedSlash = resolved.match(/^(\d+)\s*\/\s*\d+$/);
    return !!(resolvedSlash && Number(resolvedSlash[1]) === expected);
  });
  if (matchedByParcel) return true;

  const due = (installmentDueDate || '').trim().slice(0, 10);
  if (due) {
    return entries.some((entry) => (entry.dueDate || '').trim().slice(0, 10) === due);
  }

  return false;
}

/** Pré-preenche o formulário a partir de uma OC (fase pagamento). */
export function buildFormFromPurchaseOrder(
  order: OrderBoletoPhasePick & {
    orderNumber: string;
    orderDate: string;
    paymentType?: string | null;
    supplier?: { name?: string | null };
    materialRequest?: {
      serviceOrder?: string | null;
      requestNumber?: string;
      costCenter?: { name?: string | null; code?: string | null };
    } | null;
    items?: Array<{ totalPrice: number }>;
    freightAmount?: number | string | null;
    amountToPay?: number | string | null;
    nfAttachments?: unknown;
  }
): EntryFormState {
  const now = new Date();
  const ocTotal = orderGrandTotalForFinancialEntry(order);

  /** Só a OS da RM — nunca usar código do contrato/centro de custo. */
  const osCode = order.materialRequest?.serviceOrder?.trim() || '';

  let parcelNumber = '';
  let dueDate = '';
  let installmentAmount = ocTotal;
  const n = order.paymentParcelCount ?? 1;

  if (order.paymentType === 'BOLETO') {
    const rows = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
    const parcelTotal = n > 1 ? n : rows.length || 1;
    const idx = visiblePaymentBoletoInstallmentIndex(order);
    const pick = idx != null ? rows[idx] : rows[0];
    if (pick) {
      dueDate = pick.dueDate || '';
      parcelNumber = parcelTotal > 1 ? `${(idx ?? 0) + 1}/${parcelTotal}` : '1/1';
      if (Number.isFinite(pick.amount) && pick.amount > 0) {
        installmentAmount = pick.amount;
      }
    } else if (parcelTotal > 1) {
      parcelNumber = `1/${parcelTotal}`;
    }
  } else if (n > 1) {
    parcelNumber = `1/${n}`;
  }

  const amountStr = formatCurrencyValue(installmentAmount);
  const rmRef = order.materialRequest?.requestNumber
    ? `RM: ${order.materialRequest.requestNumber}`
    : '';

  return {
    paymentMonth: now.getMonth() + 1,
    paymentYear: now.getFullYear(),
    consorcio: FINANCIAL_CONTROL_OC_DEFAULT_CONSORCIO,
    status: 'LANCADO',
    osCode,
    supplierName: (order.supplier?.name || '').trim(),
    nfNumber: firstNfNumberFromAttachments(order.nfAttachments) || '',
    parcelNumber,
    emissionDate: dateInputValue(order.orderDate),
    boleto: order.paymentType === 'BOLETO' ? 'Sim' : 'Não',
    dueDate,
    originalValue: amountStr,
    ocNumber: order.orderNumber,
    finalValue: amountStr,
    paidDate: '',
    remainingDays: '',
    receivedNote: formatOcFinancialControlOriginNote(order.orderNumber),
    notes: rmRef,
    applicationType: '',
    attachments: [],
  };
}
