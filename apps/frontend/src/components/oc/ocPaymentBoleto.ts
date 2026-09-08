export type BoletoInstallmentPaymentStatus = 'PENDING_BOLETO' | 'AWAITING_PAYMENT' | 'PAID';

export type BoletoInstallmentRow = {
  amount: number;
  dueDate: string;
  boletoUrl: string | null;
  boletoName: string | null;
  paymentStatus?: BoletoInstallmentPaymentStatus | null;
  installmentProofUrl?: string | null;
  installmentProofName?: string | null;
};

export function parsePaymentBoletoInstallments(raw: unknown): BoletoInstallmentRow[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
    .map((x) => {
    const ps = x.paymentStatus;
    const paymentStatus =
      ps === 'PENDING_BOLETO' || ps === 'AWAITING_PAYMENT' || ps === 'PAID' ? ps : undefined;
    const ipu = x.installmentProofUrl;
    const ipn = x.installmentProofName;
    return {
      amount: Number(x.amount),
      dueDate: typeof x.dueDate === 'string' ? x.dueDate.slice(0, 10) : '',
      boletoUrl:
        typeof x.boletoUrl === 'string' && x.boletoUrl.trim() ? String(x.boletoUrl).trim() : null,
      boletoName:
        typeof x.boletoName === 'string' && x.boletoName.trim() ? String(x.boletoName).trim() : null,
      paymentStatus,
      installmentProofUrl:
        typeof ipu === 'string' && ipu.trim() ? String(ipu).trim() : null,
      installmentProofName:
        typeof ipn === 'string' && ipn.trim() ? String(ipn).trim() : null
    };
  });
}

export function rowStatus(row: BoletoInstallmentRow | undefined): BoletoInstallmentPaymentStatus {
  const s = row?.paymentStatus;
  if (s === 'PAID' || s === 'AWAITING_PAYMENT' || s === 'PENDING_BOLETO') return s;
  return 'PENDING_BOLETO';
}

/** Todas as parcelas da condição de pagamento já têm arquivo de boleto. */
export function allInstallmentsHaveBoleto(rows: BoletoInstallmentRow[], n: number): boolean {
  if (n <= 1 || rows.length < n) return false;
  for (let i = 0; i < n; i++) {
    if (!(rows[i]?.boletoUrl || '').trim()) return false;
  }
  return true;
}

/** Pagamento em lote desativado — sempre uma parcela por vez. */
export function useParallelBoletoPaymentFlow(_o: OrderBoletoPhasePick): boolean {
  return false;
}

/** Índice da parcela visível na fase Pagamento (parcela corrente: aguardando ou próxima a enviar/pagar). */
export function visiblePaymentBoletoInstallmentIndex(o: OrderBoletoPhasePick): number | null {
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1) {
    if (effectivePaymentBoletoUrl(o)) return 0;
    const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
    if ((rows[0]?.boletoUrl || '').trim()) return 0;
    return null;
  }
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  for (let i = 0; i < n; i++) {
    if (rowStatus(rows[i]) === 'AWAITING_PAYMENT') return i;
  }
  for (let i = 0; i < n; i++) {
    if (rowStatus(rows[i]) === 'PAID') continue;
    if ((rows[i]?.boletoUrl || '').trim()) return i;
    return null;
  }
  return null;
}

/** Dados da parcela corrente na aba Pagamento (valor, vencimento, boleto). */
export function visiblePaymentInstallmentRow(o: OrderBoletoPhasePick): BoletoInstallmentRow | null {
  const idx = visiblePaymentBoletoInstallmentIndex(o);
  if (idx == null) return null;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  return rows[idx] ?? null;
}

/** Índice da parcela com comprovante aguardando validação (primeira não PAID com proof). */
export function proofValidationInstallmentIndex(
  o: OrderBoletoPhasePick & { paymentProofUrl?: string | null }
): number | null {
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1) {
    if ((o.paymentProofUrl || '').trim() || effectivePaymentBoletoUrl(o)) return 0;
    return null;
  }
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  for (let i = 0; i < n; i++) {
    if (rowStatus(rows[i]) === 'PAID') continue;
    if ((rows[i]?.installmentProofUrl || '').trim()) return i;
  }
  return null;
}

export function proofValidationInstallmentRow(
  o: OrderBoletoPhasePick & { paymentProofUrl?: string | null }
): BoletoInstallmentRow | null {
  const idx = proofValidationInstallmentIndex(o);
  if (idx == null) return null;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  return rows[idx] ?? null;
}

export type OcListInstallmentMode = 'payment' | 'proof-validation' | 'attach-boleto';

export function listInstallmentIndex(
  o: OrderBoletoPhasePick & { paymentProofUrl?: string | null },
  mode: OcListInstallmentMode
): number | null {
  if (mode === 'attach-boleto') return buyerActiveInstallmentIndex(o);
  return mode === 'payment'
    ? visiblePaymentBoletoInstallmentIndex(o)
    : proofValidationInstallmentIndex(o);
}

export function listInstallmentRow(
  o: OrderBoletoPhasePick & { paymentProofUrl?: string | null },
  mode: OcListInstallmentMode
): BoletoInstallmentRow | null {
  const idx = listInstallmentIndex(o, mode);
  if (idx == null) return null;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  return rows[idx] ?? null;
}

export function allInstallmentsHavePaymentProof(rows: BoletoInstallmentRow[], n: number): boolean {
  if (n <= 1 || rows.length < n) return false;
  for (let i = 0; i < n; i++) {
    if (!((rows[i]?.installmentProofUrl || '').trim())) return false;
  }
  return true;
}

/** Exibe comprovante geral da OC na seção documentos (oculto quando cada parcela já tem o seu). */
export function shouldShowOrderLevelPaymentProofInDocuments(
  o: OrderBoletoPhasePick & { paymentProofUrl?: string | null }
): boolean {
  if (!(o.paymentProofUrl || '').trim()) return false;
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1 || o.paymentType !== 'BOLETO') return true;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  return !allInstallmentsHavePaymentProof(rows, n);
}

function isLegacyBulkNoExplicitStatus(rows: BoletoInstallmentRow[], n: number): boolean {
  if (rows.length < n) return false;
  for (let i = 0; i < n; i++) {
    if (!(rows[i]?.boletoUrl || '').trim()) return false;
    if (rows[i]?.paymentStatus) return false;
  }
  return true;
}

export function allMultiInstallmentsPaid(rows: BoletoInstallmentRow[], n: number): boolean {
  if (n <= 1) return true;
  if (rows.length < n) return false;
  for (let i = 0; i < n; i++) {
    if (rowStatus(rows[i]) !== 'PAID') return false;
  }
  return true;
}

export type OrderBoletoPhasePick = {
  status: string;
  paymentType?: string | null;
  boletoAttachmentUrl?: string | null;
  paymentBoletoUrl?: string | null;
  paymentBoletoInstallments?: unknown;
  paymentParcelCount?: number;
  paymentBoletoPhaseReleased?: boolean | null;
};

export function hasCreationBoletoAttachment(o: { boletoAttachmentUrl?: string | null }): boolean {
  return !!((o.boletoAttachmentUrl || '').trim());
}

/** Boleto efetivo para parcela única (criação ou fase Anexar Boleto). */
export function effectivePaymentBoletoUrl(o: {
  paymentBoletoUrl?: string | null;
  boletoAttachmentUrl?: string | null;
  paymentParcelCount?: number;
}): string {
  const payment = (o.paymentBoletoUrl || '').trim();
  if (payment) return payment;
  if ((o.paymentParcelCount ?? 1) <= 1 && hasCreationBoletoAttachment(o)) {
    return (o.boletoAttachmentUrl || '').trim();
  }
  return '';
}

export function effectivePaymentBoletoName(o: {
  paymentBoletoName?: string | null;
  boletoAttachmentName?: string | null;
  paymentBoletoUrl?: string | null;
  boletoAttachmentUrl?: string | null;
  paymentParcelCount?: number;
}): string {
  if ((o.paymentBoletoUrl || '').trim()) {
    return (o.paymentBoletoName || '').trim() || 'Boleto pagamento';
  }
  if ((o.paymentParcelCount ?? 1) <= 1 && hasCreationBoletoAttachment(o)) {
    return (o.boletoAttachmentName || '').trim() || 'Boleto criação OC';
  }
  return 'Boleto';
}

/** Parcela única com boleto na criação: equivalente a fase Pagamento liberada. */
export function isCreationBoletoPaymentPhaseReady(o: OrderBoletoPhasePick): boolean {
  if (o.paymentType !== 'BOLETO') return false;
  if ((o.paymentParcelCount ?? 1) > 1) return false;
  return hasCreationBoletoAttachment(o);
}

/** OC na fase Pagamento (ou correção) em que o lançamento no Controle Financeiro é exigido. */
export function isOcInFinancialLaunchPhase(o: OrderBoletoPhasePick): boolean {
  if (o.status !== 'APPROVED' && o.status !== 'PENDING_PROOF_CORRECTION') return false;
  if (o.paymentType === 'BOLETO') {
    if (o.paymentBoletoPhaseReleased === true) return true;
    const n = o.paymentParcelCount ?? 1;
    if (n <= 1) return isCreationBoletoPaymentPhaseReady(o);
    return false;
  }
  return true;
}

/** Exibe bloco de anexar comprovante da parcela corrente (fluxo sequencial). */
export function showSequentialInstallmentProofSection(
  o: OrderBoletoPhasePick,
  _hasFinancialEntry?: boolean
): boolean {
  const n = o.paymentParcelCount ?? 1;
  if (o.status !== 'APPROVED' || o.paymentType !== 'BOLETO' || n <= 1) return false;
  if (useParallelBoletoPaymentFlow(o)) return false;
  // Só na fase Pagamento — em Anexar Boleto o comprovante fica oculto.
  if (o.paymentBoletoPhaseReleased !== true) return false;
  const idx = visiblePaymentBoletoInstallmentIndex(o);
  if (idx == null) return false;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  const row = rows[idx];
  if (rowStatus(row) !== 'AWAITING_PAYMENT') return false;
  return !!((row?.boletoUrl || '').trim());
}

/** Comprovante já anexado na parcela corrente (sequencial). */
export function currentSequentialInstallmentHasProof(o: OrderBoletoPhasePick): boolean {
  const idx = visiblePaymentBoletoInstallmentIndex(o);
  if (idx == null) return false;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  const row = rows[idx];
  return !!((row?.installmentProofUrl || '').trim());
}

/** Índice da parcela em que o comprador pode anexar/editar boleto (sequencial). */
export function buyerActiveInstallmentIndex(o: OrderBoletoPhasePick): number | null {
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1) return 0;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  for (let i = 0; i < n; i++) {
    const st = rowStatus(rows[i]);
    if (st === 'PAID') continue;
    if (st === 'AWAITING_PAYMENT') return null;
    if (st === 'PENDING_BOLETO') return i;
  }
  return null;
}

export function installmentStatusLabel(
  st: BoletoInstallmentPaymentStatus,
  hasBoleto = false,
  opts?: { orderStatus?: string | null; hasProof?: boolean }
): string {
  if (st === 'AWAITING_PAYMENT' && opts?.hasProof) {
    if (opts.orderStatus === 'PENDING_PROOF_VALIDATION') return 'Pago';
    if (opts.orderStatus === 'PENDING_PROOF_CORRECTION') return 'Correção do comprovante';
    return 'Comprovante anexado';
  }
  switch (st) {
    case 'PAID':
      return 'Pago';
    case 'AWAITING_PAYMENT':
      return 'Aguardando pagamento';
    default:
      return hasBoleto ? 'Pronta p/ envio' : 'Pendente';
  }
}

export function installmentStatusBadgeClass(
  st: BoletoInstallmentPaymentStatus,
  hasBoleto = false,
  opts?: { orderStatus?: string | null; hasProof?: boolean }
): string {
  const pill = 'inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap';
  if (st === 'AWAITING_PAYMENT' && opts?.hasProof) {
    if (opts.orderStatus === 'PENDING_PROOF_VALIDATION') {
      return `${pill} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200`;
    }
    if (opts.orderStatus === 'PENDING_PROOF_CORRECTION') {
      return `${pill} bg-amber-100 text-amber-900 dark:bg-amber-900/35 dark:text-amber-200`;
    }
    return `${pill} bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300`;
  }
  switch (st) {
    case 'PAID':
      return `${pill} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200`;
    case 'AWAITING_PAYMENT':
      return `${pill} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200`;
    default:
      return hasBoleto
        ? `${pill} bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300`
        : `${pill} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300`;
  }
}

/** Pode enviar a parcela atual ao financeiro (boleto da parcela corrente anexado). */
export function canSendCurrentBoletoToPayment(o: OrderBoletoPhasePick): boolean {
  if (o.status !== 'APPROVED' || o.paymentType !== 'BOLETO') return false;
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1) {
    if (effectivePaymentBoletoUrl(o)) return true;
    const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
    return !!(rows[0]?.boletoUrl || '').trim();
  }
  if (o.paymentBoletoPhaseReleased) return false;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  if (rows.length < n) return false;
  for (let i = 0; i < n; i++) {
    const st = rowStatus(rows[i]);
    if (st === 'PAID') continue;
    if (st === 'AWAITING_PAYMENT') return false;
    if (st === 'PENDING_BOLETO') {
      return !!(rows[i]?.boletoUrl || '').trim();
    }
  }
  return false;
}

/** @deprecated use canSendCurrentBoletoToPayment — mesmo critério para o botão de envio */
export const allPaymentBoletosAttached = canSendCurrentBoletoToPayment;

export function hasAwaitingInstallmentPayment(o: OrderBoletoPhasePick): boolean {
  if ((o.paymentParcelCount ?? 1) <= 1) return false;
  return parsePaymentBoletoInstallments(o.paymentBoletoInstallments).some(
    (r) => rowStatus(r) === 'AWAITING_PAYMENT'
  );
}

/** Comprovante do pagamento já anexado na parcela em AWAITING_PAYMENT. */
export function awaitingBoletoInstallmentHasProof(o: OrderBoletoPhasePick): boolean {
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  const aw = rows.find((r) => rowStatus(r) === 'AWAITING_PAYMENT');
  if (!aw) return false;
  return !!((aw.installmentProofUrl || '').trim());
}

/**
 * OC na aba "Anexar Boleto" (comprador). Só quando falta anexar o boleto da parcela corrente.
 * Com boleto já anexado, a OC fica na aba Pagamento (envio ao financeiro).
 */
export function orderNeedsPaymentBoleto(o: OrderBoletoPhasePick): boolean {
  if (o.status !== 'APPROVED' || o.paymentType !== 'BOLETO') return false;
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1) {
    if (isCreationBoletoPaymentPhaseReady(o)) return false;
    if (effectivePaymentBoletoUrl(o)) return false;
    const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
    if (rows.length > 0) return !(rows[0]?.boletoUrl || '').trim();
    return true;
  }
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  if (hasAwaitingInstallmentPayment(o)) return false;

  for (let i = 0; i < n; i++) {
    const st = rowStatus(rows[i]);
    if (st === 'PAID') continue;
    if (st === 'AWAITING_PAYMENT') return false;
    return !(rows[i]?.boletoUrl || '').trim();
  }

  if (allMultiInstallmentsPaid(rows, n)) {
    if (o.paymentBoletoPhaseReleased === undefined) return false;
    return o.paymentBoletoPhaseReleased !== true;
  }
  return false;
}

/** OC visível na aba Anexar Boleto: falta boleto da parcela corrente ou já anexou e falta enviar ao financeiro. */
export function showInAttachBoletoTab(o: OrderBoletoPhasePick): boolean {
  if (o.status !== 'APPROVED' || o.paymentType !== 'BOLETO') return false;
  if (orderNeedsPaymentBoleto(o)) return true;
  return canSendCurrentBoletoToPayment(o) && o.paymentBoletoPhaseReleased !== true;
}

/** Comprovante disponível na fase Pagamento (sequencial: todas pagas; em lote: todas com comprovante por parcela). */
export function canAttachComprovanteForBoletoOrder(o: OrderBoletoPhasePick): boolean {
  if (o.paymentType !== 'BOLETO') return true;
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1) return true;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  if (useParallelBoletoPaymentFlow(o)) {
    return (
      o.paymentBoletoPhaseReleased === true &&
      allInstallmentsHavePaymentProof(rows, n)
    );
  }
  return allMultiInstallmentsPaid(rows, n);
}

export type OrderProofValidationPick = OrderBoletoPhasePick & {
  paymentProofUrl?: string | null;
};

/**
 * Envio para validação do comprovante: aceita comprovante geral da OC ou,
 * em boleto parcelado com todas as parcelas pagas, o comprovante já anexado na última parcela.
 */
export function canSubmitProofValidationWithFinancialEntry(
  o: OrderProofValidationPick,
  hasFinancialControlEntry: boolean
): boolean {
  if (!hasFinancialControlEntry) return false;
  return canSubmitBoletoToProofValidation(o);
}

/** Mensagens do que falta para habilitar "Enviar para Validação Comprovante". */
export function getProofValidationSubmitBlockers(
  o: OrderProofValidationPick,
  hasFinancialControlEntry: boolean
): string[] {
  const blockers: string[] = [];
  if (!hasFinancialControlEntry) {
    blockers.push(
      'Registre o lançamento no Controle Financeiro para habilitar o envio à validação.'
    );
  } else if (!canSubmitBoletoToProofValidation(o)) {
    if (o.paymentType === 'BOLETO' && useParallelBoletoPaymentFlow(o)) {
      blockers.push(
        'Anexe o comprovante de pagamento em todas as parcelas antes de enviar para validação.'
      );
    } else {
      blockers.push('Anexe o comprovante de pagamento antes de enviar para validação.');
    }
  }
  return blockers;
}

export function canSubmitBoletoToProofValidation(o: OrderProofValidationPick): boolean {
  if ((o.paymentProofUrl || '').trim()) return true;
  if (o.paymentType !== 'BOLETO') return false;
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1) return false;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  if (useParallelBoletoPaymentFlow(o)) {
    return (
      o.paymentBoletoPhaseReleased === true &&
      allInstallmentsHavePaymentProof(rows, n)
    );
  }
  return currentSequentialInstallmentHasProof(o);
}

/** Parcelas em que o financeiro ainda pode anexar comprovante (fluxo em lote). */
export function financeProofTargetInstallmentIndices(o: OrderBoletoPhasePick): number[] {
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1 || !useParallelBoletoPaymentFlow(o) || o.paymentBoletoPhaseReleased !== true) {
    return [];
  }
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const st = rowStatus(rows[i]);
    if (st === 'PAID' || st === 'AWAITING_PAYMENT' || st === 'PENDING_BOLETO') {
      if ((rows[i]?.boletoUrl || '').trim()) out.push(i);
    }
  }
  return out;
}

/** Comprovante da última parcela (quando todas pagas), para exibir se não houver paymentProofUrl. */
export function lastPaidInstallmentProofUrl(
  o: OrderBoletoPhasePick
): { url: string; name: string | null } | null {
  const n = o.paymentParcelCount ?? 1;
  if (o.paymentType !== 'BOLETO' || n <= 1) return null;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  if (!allMultiInstallmentsPaid(rows, n)) return null;
  const last = rows[n - 1];
  const url = (last?.installmentProofUrl || '').trim();
  if (!url) return null;
  const name = (last?.installmentProofName || '').trim() || null;
  return { url, name };
}

export function hasAnyPaymentBoletoAttachment(o: {
  paymentBoletoUrl?: string | null;
  boletoAttachmentUrl?: string | null;
  paymentParcelCount?: number;
  paymentBoletoInstallments?: unknown;
}): boolean {
  if (effectivePaymentBoletoUrl(o)) return true;
  return parsePaymentBoletoInstallments(o.paymentBoletoInstallments).some((x) => (x.boletoUrl || '').trim());
}

export const ROMAN_PARCEL_LABELS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function romanParcelLabel(index: number): string {
  return ROMAN_PARCEL_LABELS[index] ?? `${index + 1}ª`;
}

/** Próxima parcela após a que está em AWAITING_PAYMENT (para mensagens pós-pagamento). */
export function nextInstallmentAfterAwaiting(o: OrderBoletoPhasePick): number | null {
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1) return null;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  const aw = rows.findIndex((r) => rowStatus(r) === 'AWAITING_PAYMENT');
  if (aw < 0) return null;
  for (let i = aw + 1; i < n; i++) {
    if (rowStatus(rows[i]) !== 'PAID') return i;
  }
  return null;
}

export function nextInstallmentAfterAwaitingHasBoleto(o: OrderBoletoPhasePick): boolean {
  const idx = nextInstallmentAfterAwaiting(o);
  if (idx == null) return false;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  return !!((rows[idx]?.boletoUrl || '').trim());
}

export function returnAfterBoletoInstallmentPaidButtonLabel(o: OrderBoletoPhasePick): string {
  const nextIdx = nextInstallmentAfterAwaiting(o);
  if (nextIdx == null) return 'Parcela paga — concluir pagamentos';
  if (nextInstallmentAfterAwaitingHasBoleto(o)) {
    return `Parcela paga — liberar parcela ${romanParcelLabel(nextIdx)} para Pagamento`;
  }
  return `Parcela paga — liberar anexação da parcela ${romanParcelLabel(nextIdx)}`;
}

export function returnAfterBoletoInstallmentPaidConfirmMessage(o: OrderBoletoPhasePick): string {
  const nextIdx = nextInstallmentAfterAwaiting(o);
  if (nextIdx == null) {
    return 'Confirmar que esta parcela foi paga? Esta era a última parcela.';
  }
  if (nextInstallmentAfterAwaitingHasBoleto(o)) {
    return `Confirmar pagamento desta parcela? A parcela ${romanParcelLabel(nextIdx)} já tem boleto anexado e poderá ser enviada para a fase Pagamento.`;
  }
  return `Confirmar pagamento desta parcela? A OC voltará para Anexar Boleto — falta anexar o boleto da parcela ${romanParcelLabel(nextIdx)}.`;
}
