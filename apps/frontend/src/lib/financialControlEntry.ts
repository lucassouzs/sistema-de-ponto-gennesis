export type { FinancialControlStatus } from '@/lib/financialControlStatus';
export { FINANCIAL_CONTROL_STATUS_OPTIONS as STATUS_OPTIONS } from '@/lib/financialControlStatus';

import type { FinancialControlStatus } from '@/lib/financialControlStatus';

export type FinancialControlConsorcio = 'brasilia' | 'hub';

export interface FinancialControlEntry {
  id: string;
  consorcio?: FinancialControlConsorcio;
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
  attachments?: Array<{ url: string; name: string }> | null;
  createdAt: string;
  updatedAt: string;
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
  attachments: Array<{ url: string; name: string }>;
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

export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(n)) return '-';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

function dateInputValue(value: string | null | undefined): string {
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
    attachments: Array.isArray(entry.attachments)
      ? entry.attachments
          .map((item) => ({
            url: String(item?.url || '').trim(),
            name: String(item?.name || '').trim() || 'Arquivo anexado',
          }))
          .filter((item) => item.url)
      : [],
  };
}

export function buildInitialFormFromPurchaseOrder(order: {
  orderNumber: string;
  orderDate?: string;
  amountToPay?: number | string | null;
  paymentType?: string | null;
  supplier?: { name?: string | null };
  materialRequest?: { serviceOrder?: string | null } | null;
}): EntryFormState {
  const now = new Date();
  const orderD = order.orderDate ? new Date(order.orderDate) : now;
  const amount = Number(order.amountToPay);
  const amountStr = Number.isFinite(amount) && amount > 0 ? formatCurrencyValue(amount) : '';
  return {
    consorcio: '',
    paymentMonth: Number.isNaN(orderD.getTime()) ? now.getMonth() + 1 : orderD.getMonth() + 1,
    paymentYear: Number.isNaN(orderD.getTime()) ? now.getFullYear() : orderD.getFullYear(),
    status: 'LANCADO',
    osCode: (order.materialRequest?.serviceOrder || '').trim(),
    supplierName: (order.supplier?.name || '').trim(),
    nfNumber: '',
    parcelNumber: '',
    emissionDate: '',
    boleto: order.paymentType === 'BOLETO' ? 'Sim' : 'Não',
    dueDate: '',
    originalValue: amountStr,
    ocNumber: order.orderNumber,
    finalValue: amountStr,
    paidDate: '',
    remainingDays: '',
    receivedNote: '',
    notes: '',
    attachments: [],
  };
}

export function formToPayload(form: EntryFormState) {
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
    boleto: form.boleto || null,
    dueDate: form.dueDate || null,
    originalValue: parseCurrencyInput(form.originalValue),
    ocNumber: form.ocNumber || null,
    finalValue: parseCurrencyInput(form.finalValue),
    paidDate: form.paidDate || null,
    remainingDays: computedRemainingDays,
    receivedNote: form.receivedNote || null,
    notes: form.notes || null,
    attachments: form.attachments,
  };
}
