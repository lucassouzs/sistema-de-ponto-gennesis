export const CURRENT_STATUS_OPTIONS = [
  { value: 'ENTREGA_FORNECEDOR_CIF', label: 'Entrega Fornecedor - CIF', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200' },
  { value: 'APROVADO_SUPRIMENTOS', label: 'Aguardando - Suprimentos', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200' },
  { value: 'ENTREGA_LOGISTICA_FOB', label: 'Entrega Logística - FOB', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' },
  { value: 'ENTREGUE', label: 'Entregue', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  { value: 'APROVAR_DIR', label: 'Aprovar - DIR', className: 'bg-red-700 text-white dark:bg-red-800 dark:text-red-100' },
  { value: 'CANCELADO', label: 'Cancelado', className: 'bg-gray-700 text-white dark:bg-gray-600 dark:text-gray-100' },
] as const;

export const PAYMENT_STATUS_OPTIONS = [
  { value: 'OK', label: 'Ok', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  { value: 'AGUARDANDO_PAGAMENTO', label: 'Aguardando - Pagamento', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200' },
  { value: 'BOLETO', label: 'Boleto', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
  { value: 'A_VISTA', label: 'À Vista', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200' },
  { value: 'CANCELADO', label: 'Cancelado', className: 'bg-gray-700 text-white dark:bg-gray-600 dark:text-gray-100' },
  { value: 'CREDITO', label: 'Crédito', className: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200' },
] as const;

export const STOCK_SHORTFALL_TYPE_OPTIONS = [
  { value: 'NORMAL', label: 'Normal', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  { value: 'CORRECAO', label: 'Correção', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
] as const;

export const FINAL_STATUS_OPTIONS = [
  { value: 'PENDENTE', label: 'Pendente', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  { value: 'CONCLUIDO', label: 'Concluído', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  { value: 'CANCELADO', label: 'Cancelado', className: 'bg-gray-700 text-white dark:bg-gray-600 dark:text-gray-100' },
] as const;

export const POLO_OPTIONS = [
  { value: 'DF', label: 'DF' },
  { value: 'GO', label: 'GO' },
] as const;

export const DELIVERY_TYPE_OPTIONS = [
  { value: 'CIF', label: 'Entrega Fornecedor - CIF' },
  { value: 'FOB', label: 'Entrega Logística - FOB' },
] as const;

export const RECEIPT_TYPE_OPTIONS = [
  { value: 'TOTAL', label: 'Total', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  { value: 'PARCIAL', label: 'Parcial', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' },
] as const;

export type CurrentStatusValue = (typeof CURRENT_STATUS_OPTIONS)[number]['value'];
export type PaymentStatusValue = (typeof PAYMENT_STATUS_OPTIONS)[number]['value'];
export type StockShortfallTypeValue = (typeof STOCK_SHORTFALL_TYPE_OPTIONS)[number]['value'];
export type FinalStatusValue = (typeof FINAL_STATUS_OPTIONS)[number]['value'];
export type PoloValue = (typeof POLO_OPTIONS)[number]['value'];
export type DeliveryTypeValue = (typeof DELIVERY_TYPE_OPTIONS)[number]['value'];
export type ReceiptTypeValue = (typeof RECEIPT_TYPE_OPTIONS)[number]['value'];

export function normalizeDeliveryType(value: string | null | undefined): DeliveryTypeValue | '' {
  if (!value) return '';
  const upper = value.trim().toUpperCase();
  if (upper === 'CIF' || upper.includes('CIF')) return 'CIF';
  if (upper === 'FOB' || upper.includes('FOB')) return 'FOB';
  return '';
}

export function statusBadge(
  value: string | null | undefined,
  options: readonly { value: string; label: string; className: string }[]
) {
  const found = options.find((o) => o.value === value);
  if (!found) return { label: value || '—', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };
  return { label: found.label, className: found.className };
}

export function formatCurrency(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

/** Compara apenas o dia (sem horário): venceu se a previsão é anterior a hoje. */
export function isDeliveryDateOverdue(expectedDelivery: string | null | undefined): boolean {
  if (!expectedDelivery) return false;
  const due = new Date(expectedDelivery);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export function shortfallTypeLabel(value: StockShortfallTypeValue | null | undefined): string {
  if (!value) return '—';
  return statusBadge(value, STOCK_SHORTFALL_TYPE_OPTIONS).label;
}

type DeliveryStatusParts = {
  currentStatus: string;
  paymentStatus: string;
  finalStatus: string;
};

/** Um único rótulo para a listagem, preservando detalhe no title (tooltip). */
export function consolidatedDeliveryStatus(row: DeliveryStatusParts): {
  label: string;
  className: string;
  title: string;
} {
  const current = statusBadge(row.currentStatus, CURRENT_STATUS_OPTIONS);
  const payment = statusBadge(row.paymentStatus, PAYMENT_STATUS_OPTIONS);
  const final = statusBadge(row.finalStatus, FINAL_STATUS_OPTIONS);
  const title = `Entrega: ${current.label}\nPagamento: ${payment.label}\nFinal: ${final.label}`;

  const isCancelled =
    row.finalStatus === 'CANCELADO' ||
    row.currentStatus === 'CANCELADO' ||
    row.paymentStatus === 'CANCELADO';
  if (isCancelled) {
    return { label: 'Cancelado', className: final.className, title };
  }

  const paymentPending =
    row.paymentStatus === 'AGUARDANDO_PAGAMENTO' || row.paymentStatus === 'BOLETO';
  const paymentOk = row.paymentStatus === 'OK';

  if (row.finalStatus === 'CONCLUIDO') {
    if (paymentOk) {
      return { label: 'Concluído', className: final.className, title };
    }
    if (paymentPending) {
      return {
        label: `Concluído · ${payment.label}`,
        className: payment.className,
        title,
      };
    }
    return { label: `Concluído · ${payment.label}`, className: final.className, title };
  }

  if (paymentPending && row.currentStatus !== 'ENTREGUE') {
    return {
      label: `${current.label} · ${payment.label}`,
      className: current.className,
      title,
    };
  }

  if (row.currentStatus === 'ENTREGUE' && paymentPending) {
    return {
      label: `Entregue · ${payment.label}`,
      className: payment.className,
      title,
    };
  }

  if (row.currentStatus === 'ENTREGUE') {
    return { label: current.label, className: current.className, title };
  }

  return { label: current.label, className: current.className, title };
}

export type PurchaseOrderDeliverySource = {
  orderNumber: string;
  status?: string | null;
  paymentType?: string | null;
  paymentCondition?: string | null;
  paymentProofUrl?: string | null;
  amountToPay?: unknown;
  orderDate?: string | null;
  expectedDelivery?: string | null;
  paymentBoletoInstallments?: unknown;
  supplier?: { id: string; name?: string | null } | null;
  materialRequest?: { requestNumber?: string | null } | null;
};

function toInputDateValue(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** Previsão de entrega: campo da OC ou estimativa a partir de boleto/condição de pagamento. */
export function deriveExpectedDeliveryFromPurchaseOrder(
  po: Pick<
    PurchaseOrderDeliverySource,
    'expectedDelivery' | 'orderDate' | 'paymentCondition' | 'paymentBoletoInstallments'
  >
): string {
  const direct = toInputDateValue(po.expectedDelivery);
  if (direct) return direct;

  const installments = po.paymentBoletoInstallments;
  if (Array.isArray(installments) && installments.length > 0) {
    const sorted = [...installments].sort((a, b) => {
      const da = new Date(String((a as { dueDate?: string }).dueDate || '')).getTime();
      const db = new Date(String((b as { dueDate?: string }).dueDate || '')).getTime();
      return da - db;
    });
    const firstDue = toInputDateValue((sorted[0] as { dueDate?: string }).dueDate);
    if (firstDue) return firstDue;
  }

  if (po.orderDate && po.paymentCondition) {
    const base = new Date(po.orderDate);
    if (!Number.isNaN(base.getTime())) {
      const cond = po.paymentCondition.toUpperCase();
      let days = 0;
      if (cond.includes('30')) days = 30;
      else if (cond.includes('28')) days = 28;
      else if (cond.includes('AVISTA')) days = 0;
      if (days > 0) {
        base.setDate(base.getDate() + days);
        return base.toISOString().slice(0, 10);
      }
      if (cond.includes('AVISTA')) {
        return base.toISOString().slice(0, 10);
      }
    }
  }

  if (po.orderDate) {
    return toInputDateValue(po.orderDate);
  }

  return '';
}

export function deriveDeliveryPaymentStatusFromPurchaseOrder(
  po: Pick<PurchaseOrderDeliverySource, 'status' | 'paymentType' | 'paymentProofUrl'>
): PaymentStatusValue {
  if (po.status === 'CANCELLED') return 'CANCELADO';
  if (po.paymentProofUrl) return 'OK';
  const paymentType = (po.paymentType || '').trim().toUpperCase();
  if (paymentType === 'BOLETO') return 'BOLETO';
  if (paymentType === 'AVISTA') return 'A_VISTA';
  return 'AGUARDANDO_PAGAMENTO';
}

export function deriveDeliveryCurrentStatusFromPurchaseOrder(
  po: Pick<PurchaseOrderDeliverySource, 'status'>
): CurrentStatusValue {
  const status = po.status || '';
  if (status === 'CANCELLED' || status === 'REJECTED') return 'CANCELADO';
  if (status === 'RECEIVED' || status === 'PARTIALLY_RECEIVED') return 'ENTREGUE';
  return 'APROVADO_SUPRIMENTOS';
}
