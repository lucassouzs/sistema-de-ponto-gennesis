import {
  parsePaymentBoletoInstallments,
  rowStatus,
  type BoletoInstallmentRow,
  type BoletoInstallmentPaymentStatus
} from '@/components/oc/ocPaymentBoleto';
import {
  formatCurrencyInputBrFromNumber,
  parseCurrencyInputBr
} from '@/lib/maskCurrencyBr';

export type BoletoParcelasOrderFields = {
  orderDate?: string | null;
  amountToPay?: number | string | null;
  paymentParcelCount?: number;
  paymentParcelDueDays?: number[];
  paymentBoletoInstallments?: unknown;
  paymentBoletoPhaseReleased?: boolean | null;
  paymentProofUrl?: string | null;
  paymentProofName?: string | null;
};

export type RowDraft = {
  amount: string;
  dueDate: string;
  boletoUrl: string | null;
  boletoName: string | null;
  uploading: boolean;
  paymentStatus?: BoletoInstallmentPaymentStatus | null;
};

export function ymdAddDays(ymd: string | undefined | null, add: number): string {
  const raw = (ymd ?? '').trim();
  if (!raw) {
    const t = new Date();
    t.setDate(t.getDate() + add);
    return t.toISOString().slice(0, 10);
  }
  const base = raw.includes('T') ? raw : `${raw}T12:00:00`;
  const d = new Date(base);
  if (Number.isNaN(d.getTime())) {
    const t = new Date();
    t.setDate(t.getDate() + add);
    return t.toISOString().slice(0, 10);
  }
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

export function splitAmountInInstallments(total: number, n: number): number[] {
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

export function formatMoneyBr(n: number): string {
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatMoneyDisplay(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `R$ ${formatMoneyBr(Number(n))}`;
}

export function formatDueDateBr(ymd: string | undefined | null): string {
  const s = (ymd || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export function parseMoneyInput(value: string): number | null {
  return parseCurrencyInputBr(value);
}

export function parseOrderTotalAmount(order: BoletoParcelasOrderFields): number {
  const total = Number(order.amountToPay);
  return Number.isFinite(total) ? total : 0;
}

/** Ao editar o valor de uma parcela, ajusta as demais editáveis para manter a soma = total da OC. */
export function redistributeInstallmentAmounts(
  rows: RowDraft[],
  editedIndex: number,
  rawEditedValue: string,
  orderTotal: number,
  rowLocked: boolean[]
): { rows: RowDraft[]; wasCapped: boolean } {
  if (rows.length <= 1) {
    const parsed = parseMoneyInput(rawEditedValue);
    if (parsed == null) {
      return {
        rows: rows.map((r, i) => (i === editedIndex ? { ...r, amount: rawEditedValue } : r)),
        wasCapped: false
      };
    }
    const maxAllowed = Math.max(0, orderTotal);
    const clamped = Math.max(0, Math.min(parsed, maxAllowed));
    return {
      rows: rows.map((r, i) =>
        i === editedIndex ? { ...r, amount: formatCurrencyInputBrFromNumber(clamped) } : r
      ),
      wasCapped: parsed > maxAllowed + 0.001
    };
  }

  const next = rows.map((r) => ({ ...r }));

  const parsedEdited = parseMoneyInput(rawEditedValue);
  if (parsedEdited == null) {
    next[editedIndex] = { ...next[editedIndex], amount: rawEditedValue };
    return { rows: next, wasCapped: false };
  }

  const lockedSum = rows.reduce((s, r, i) => {
    if (i === editedIndex || !rowLocked[i]) return s;
    return s + (parseMoneyInput(r.amount) ?? 0);
  }, 0);

  const maxAllowed = Math.max(0, orderTotal - lockedSum);
  const clamped = Math.max(0, Math.min(parsedEdited, maxAllowed));
  const wasCapped = parsedEdited > maxAllowed + 0.001;

  next[editedIndex] = { ...next[editedIndex], amount: formatCurrencyInputBrFromNumber(clamped) };

  const remainder = Math.max(0, Math.round((orderTotal - lockedSum - clamped) * 100) / 100);

  const otherEditableIndices = rows
    .map((_, i) => i)
    .filter((i) => i !== editedIndex && !rowLocked[i]);

  if (otherEditableIndices.length === 0) {
    return { rows: next, wasCapped };
  }

  if (otherEditableIndices.length === 1) {
    const j = otherEditableIndices[0];
    next[j] = { ...next[j], amount: formatCurrencyInputBrFromNumber(remainder) };
    return { rows: next, wasCapped };
  }

  const parts = splitAmountInInstallments(remainder, otherEditableIndices.length);
  otherEditableIndices.forEach((j, k) => {
    next[j] = { ...next[j], amount: formatCurrencyInputBrFromNumber(parts[k] ?? 0) };
  });
  return { rows: next, wasCapped };
}

export function sumInstallmentAmounts(rows: RowDraft[]): number {
  return rows.reduce((s, r) => s + (parseMoneyInput(r.amount) ?? 0), 0);
}

export function validateInstallmentAmountsSum(
  rows: RowDraft[],
  orderTotal: number
): { valid: boolean; message?: string; sum: number } {
  if (orderTotal <= 0 || rows.length === 0) {
    return { valid: true, sum: 0 };
  }

  const parsed = rows.map((r) => parseMoneyInput(r.amount));
  if (parsed.some((a) => a == null)) {
    return { valid: false, message: 'Informe o valor de todas as parcelas.', sum: 0 };
  }

  const amounts = parsed as number[];
  if (amounts.some((a) => a < 0)) {
    return { valid: false, message: 'Valor da parcela inválido.', sum: sumInstallmentAmounts(rows) };
  }
  if (amounts.some((a) => a > orderTotal + 0.001)) {
    return {
      valid: false,
      message: `Nenhuma parcela pode ultrapassar o total da OC (${formatMoneyDisplay(orderTotal)}).`,
      sum: sumInstallmentAmounts(rows)
    };
  }

  const sum = amounts.reduce((a, b) => a + b, 0);
  const sumCents = Math.round(sum * 100);
  const totalCents = Math.round(orderTotal * 100);

  if (sumCents > totalCents) {
    return {
      valid: false,
      message: `A soma das parcelas (${formatMoneyDisplay(sum)}) ultrapassa o total da OC (${formatMoneyDisplay(orderTotal)}).`,
      sum
    };
  }

  if (sumCents !== totalCents) {
    return {
      valid: false,
      message: `A soma das parcelas (${formatMoneyDisplay(sum)}) deve ser igual ao total da OC (${formatMoneyDisplay(orderTotal)}).`,
      sum
    };
  }

  return { valid: true, sum };
}

/** Corrige parcelas salvas com soma ou valor acima do total da OC (mantém parcelas já no financeiro/pagas). */
export function normalizeRowAmountsToOrderTotal(rows: RowDraft[], orderTotal: number): RowDraft[] {
  if (orderTotal <= 0 || rows.length === 0) return rows;
  if (validateInstallmentAmountsSum(rows, orderTotal).valid) return rows;

  const locked = rows.map((r) => {
    const st = rowStatus(draftToRow(r));
    return st === 'PAID' || st === 'AWAITING_PAYMENT';
  });

  const lockedSum = rows.reduce(
    (s, r, i) => (locked[i] ? s + (parseMoneyInput(r.amount) ?? 0) : s),
    0
  );
  const remainder = Math.max(0, Math.round((orderTotal - lockedSum) * 100) / 100);
  const editableIndices = rows.map((_, i) => i).filter((i) => !locked[i]);
  if (editableIndices.length === 0) return rows;

  const parts = splitAmountInInstallments(remainder, editableIndices.length);
  const next = rows.map((r) => ({ ...r }));
  editableIndices.forEach((idx, k) => {
    next[idx] = {
      ...next[idx],
      amount: formatCurrencyInputBrFromNumber(parts[k] ?? 0)
    };
  });
  return next;
}

export function buildInitialRows(order: BoletoParcelasOrderFields): RowDraft[] {
  const n = order.paymentParcelCount ?? 1;
  const days = order.paymentParcelDueDays?.length ? order.paymentParcelDueDays : [30];
  const existing = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
  const total = parseOrderTotalAmount(order);
  const amounts = splitAmountInInstallments(total, n);
  const rows = Array.from({ length: n }, (_, i) => {
    const ex = existing[i];
    const d = days[i] ?? days[days.length - 1] ?? 30;
    return {
      amount: formatCurrencyInputBrFromNumber(
        Number.isFinite(ex?.amount) ? ex.amount : amounts[i] ?? 0
      ),
      dueDate: ex?.dueDate || ymdAddDays(order.orderDate, d),
      boletoUrl: ex?.boletoUrl ?? null,
      boletoName: ex?.boletoName ?? null,
      uploading: false,
      paymentStatus: ex?.paymentStatus
    };
  });
  return normalizeRowAmountsToOrderTotal(rows, total);
}

export function draftToRow(d: RowDraft): BoletoInstallmentRow {
  return {
    amount: parseMoneyInput(d.amount) ?? 0,
    dueDate: (d.dueDate ?? '').trim().slice(0, 10),
    boletoUrl: d.boletoUrl,
    boletoName: d.boletoName,
    paymentStatus: d.paymentStatus
  };
}

export function installmentsStateKey(order: BoletoParcelasOrderFields & { id: string }): string {
  return `${order.id}:${JSON.stringify(order.paymentBoletoInstallments ?? null)}:${order.paymentBoletoPhaseReleased ?? ''}:${order.paymentParcelCount ?? 1}:${order.paymentProofUrl ?? ''}`;
}

export function rowsToInstallments(rows: RowDraft[]): BoletoInstallmentRow[] {
  return rows.map((r) => {
    const amt = parseMoneyInput(r.amount);
    return {
      amount: amt ?? 0,
      dueDate: (r.dueDate ?? '').trim().slice(0, 10),
      boletoUrl: (r.boletoUrl || '').trim() || null,
      boletoName: (r.boletoName || '').trim() || null,
      paymentStatus: r.paymentStatus
    };
  });
}
