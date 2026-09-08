import type { FinancialControlEntry } from '@/lib/financialControlEntry';
import { hasFinancialEntryForOcInstallment } from '@/components/financeiro/financialControlEntry';
import {
  allMultiInstallmentsPaid,
  parsePaymentBoletoInstallments,
  rowStatus,
  visiblePaymentBoletoInstallmentIndex,
  type OrderProofValidationPick,
} from '@/components/oc/ocPaymentBoleto';

export type OcPaymentListStatus = 'pendente' | 'lancado';

export function isOcPaymentCompleted(o: OrderProofValidationPick): boolean {
  if (o.paymentType === 'BOLETO') {
    const n = o.paymentParcelCount ?? 1;
    const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
    if (n > 1) {
      return allMultiInstallmentsPaid(rows, n);
    }
    if (rowStatus(rows[0]) === 'PAID') return true;
  }
  return !!((o.paymentProofUrl || '').trim());
}

/**
 * Na lista da aba Pagamento da OC, "Lançado" = já existe lançamento no Controle Financeiro
 * (da parcela corrente, em boleto parcelado).
 */
function isFinanceEntryLaunched(
  e: Pick<FinancialControlEntry, 'status' | 'paidDate'>
): boolean {
  if (e.status === 'CANCELADO') return false;
  return true;
}

export function getOcPaymentListStatus(
  o: OrderProofValidationPick,
  entriesForOc: Pick<
    FinancialControlEntry,
    'status' | 'paidDate' | 'parcelNumber' | 'dueDate'
  >[]
): OcPaymentListStatus {
  const launchedEntries = entriesForOc.filter(isFinanceEntryLaunched);

  if (o.paymentType === 'BOLETO' && (o.paymentParcelCount ?? 1) > 1) {
    const n = o.paymentParcelCount ?? 1;
    const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
    const curIdx = visiblePaymentBoletoInstallmentIndex(o);

    if (allMultiInstallmentsPaid(rows, n)) return 'lancado';

    if (curIdx != null) {
      if (rowStatus(rows[curIdx]) === 'PAID') return 'lancado';
      if (
        hasFinancialEntryForOcInstallment(launchedEntries, {
          installmentIndex: curIdx,
          parcelCount: n,
          installmentDueDate: rows[curIdx]?.dueDate,
        })
      ) {
        return 'lancado';
      }
      return 'pendente';
    }

    return launchedEntries.length > 0 ? 'lancado' : 'pendente';
  }

  if (launchedEntries.length === 0 && !isOcPaymentCompleted(o)) return 'pendente';
  return 'lancado';
}

export function ocPaymentListStatusLabel(status: OcPaymentListStatus): string {
  return status === 'lancado' ? 'Lançado' : 'Pendente';
}

const ocListStatusPillBase =
  'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap';

export function ocPaymentListStatusClass(status: OcPaymentListStatus): string {
  return status === 'lancado'
    ? `${ocListStatusPillBase} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200`
    : `${ocListStatusPillBase} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200`;
}
