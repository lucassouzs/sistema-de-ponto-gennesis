'use client';

import React, { useMemo, useState } from 'react';
import { Banknote, Check, FileUp, Loader2, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { OcAttachmentActions } from '@/components/oc/OcAttachmentActions';
import { DatePickerField } from '@/components/ui/DatePickerField';
import {
  buyerActiveInstallmentIndex,
  hasAwaitingInstallmentPayment,
  installmentStatusLabel,
  installmentStatusBadgeClass,
  parsePaymentBoletoInstallments,
  romanParcelLabel,
  rowStatus,
  useParallelBoletoPaymentFlow,
  type BoletoInstallmentRow
} from '@/components/oc/ocPaymentBoleto';
import {
  buildInitialRows,
  draftToRow,
  formatDueDateBr,
  formatMoneyDisplay,
  installmentsStateKey,
  parseMoneyInput,
  rowsToInstallments,
  redistributeInstallmentAmounts,
  parseOrderTotalAmount,
  validateInstallmentAmountsSum,
  type BoletoParcelasOrderFields,
  type RowDraft
} from '@/components/oc/boletoParcelasUtils';
import { maskCurrencyInputBrOrEmpty } from '@/lib/maskCurrencyBr';

export type BoletoParcelasListProps = {
  order: BoletoParcelasOrderFields & {
    id: string;
    orderNumber?: string;
    status?: string | null;
  };
  /** Exibe linha de comprovante (histórico / fase pagamento). */
  showComprovante?: boolean;
  /** Oculta links de boleto/comprovante (uso na aba Pagamento). */
  hideAttachmentLinks?: boolean;
  /** Permite editar valor, vencimento e anexo nas parcelas liberadas. */
  editable?: boolean;
  /** Texto auxiliar acima da lista. */
  hint?: string;
  onSaved?: (payload: { data: unknown }) => void;
  /** Após salvar o boleto da parcela atual, envia a OC para a fase Pagamento. */
  onReleaseToPayment?: (orderId: string) => void;
  releasePending?: boolean;
  className?: string;
};

function BoletoParcelasListInner({
  order,
  showComprovante = false,
  hideAttachmentLinks = false,
  editable = false,
  hint,
  onSaved,
  onReleaseToPayment,
  releasePending = false,
  className = ''
}: BoletoParcelasListProps) {
  const n = order.paymentParcelCount ?? 1;
  const [rows, setRows] = useState<RowDraft[]>(() => buildInitialRows(order));
  const [saving, setSaving] = useState(false);
  const [persistedOrder, setPersistedOrder] = useState<
    (BoletoParcelasOrderFields & { id: string }) | null
  >(null);

  const phaseReleased = order.paymentBoletoPhaseReleased === true;
  const financeHasCurrentParcel = hasAwaitingInstallmentPayment({
    status: 'APPROVED',
    paymentType: 'BOLETO',
    paymentParcelCount: order.paymentParcelCount,
    paymentBoletoInstallments: order.paymentBoletoInstallments,
    paymentBoletoPhaseReleased: order.paymentBoletoPhaseReleased
  });
  const parallelFlow = useParallelBoletoPaymentFlow({
    status: 'APPROVED',
    paymentType: 'BOLETO',
    paymentParcelCount: order.paymentParcelCount,
    paymentBoletoInstallments: order.paymentBoletoInstallments,
    paymentBoletoPhaseReleased: order.paymentBoletoPhaseReleased
  });
  const activeIdx = useMemo(
    () =>
      buyerActiveInstallmentIndex({
        status: 'APPROVED',
        paymentType: 'BOLETO',
        paymentParcelCount: order.paymentParcelCount,
        paymentBoletoInstallments: rows.map(draftToRow),
        paymentBoletoPhaseReleased: order.paymentBoletoPhaseReleased
      }),
    [order.paymentParcelCount, order.paymentBoletoPhaseReleased, rows]
  );

  const parsedRows = useMemo(() => rows.map(draftToRow), [rows]);
  const storedRows = useMemo(
    () => parsePaymentBoletoInstallments(order.paymentBoletoInstallments),
    [order.paymentBoletoInstallments]
  );
  const orderProofUrl = (order.paymentProofUrl || '').trim();
  const orderProofName = (order.paymentProofName || '').trim();
  const orderTotal = useMemo(() => parseOrderTotalAmount(order), [order.amountToPay]);

  const isRowLocked = (index: number, st: ReturnType<typeof rowStatus>) =>
    st === 'PAID' || st === 'AWAITING_PAYMENT';

  const handleAmountChange = (index: number, rawValue: string) => {
    const masked = maskCurrencyInputBrOrEmpty(rawValue);
    setRows((prev) => {
      const locked =
        n <= 1
          ? [false]
          : prev.map((r, j) => {
              const st = rowStatus(draftToRow(r));
              return isRowLocked(j, st);
            });

      const { rows: next, wasCapped } =
        n <= 1
          ? redistributeInstallmentAmounts(prev, index, masked, orderTotal, locked)
          : redistributeInstallmentAmounts(prev, index, masked, orderTotal, locked);

      if (wasCapped && orderTotal > 0) {
        const lockedSum = prev.reduce((s, r, i) => {
          if (i === index || !locked[i]) return s;
          return s + (parseMoneyInput(r.amount) ?? 0);
        }, 0);
        const maxAllowed = Math.max(0, orderTotal - lockedSum);
        toast.error(
          `O valor não pode ultrapassar ${formatMoneyDisplay(maxAllowed)} (total da OC: ${formatMoneyDisplay(orderTotal)}).`
        );
      }

      return next;
    });
  };

  const amountValidation = useMemo(
    () => validateInstallmentAmountsSum(rows, orderTotal),
    [rows, orderTotal]
  );

  const canSave = useMemo(() => {
    if (!editable || activeIdx == null) return false;
    if (!amountValidation.valid) return false;
    const active = rows[activeIdx];
    if (!active || parseMoneyInput(active.amount) == null || !(active.dueDate ?? '').trim()) {
      return false;
    }
    return !!(active.boletoUrl || '').trim();
  }, [rows, editable, activeIdx, amountValidation.valid]);

  const showSaveAndRelease =
    !!onReleaseToPayment && order.paymentBoletoPhaseReleased !== true;

  const uploadForIndex = async (index: number, file: File) => {
    if (!editable) return;
    const st = rowStatus(parsedRows[index]);
    if (st !== 'PENDING_BOLETO') {
      toast.error('Esta parcela não pode ser alterada.');
      return;
    }
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, uploading: true } : r)));
    try {
      const fd = new FormData();
      fd.append('boleto', file);
      const up = await api.post('/purchase-orders/upload-boleto', fd);
      const url = up.data?.data?.url as string | undefined;
      const originalName = up.data?.data?.originalName as string | undefined;
      if (!url) throw new Error('Resposta inválida do upload');
      setRows((prev) =>
        prev.map((r, i) =>
          i === index ? { ...r, boletoUrl: url, boletoName: originalName ?? file.name, uploading: false } : r
        )
      );
      toast.success(`Boleto da parcela ${romanParcelLabel(index)} anexado.`);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg || 'Erro ao enviar arquivo');
      setRows((prev) => prev.map((r, i) => (i === index ? { ...r, uploading: false } : r)));
    }
  };

  const handleSave = async (andRelease = false): Promise<boolean> => {
    if (!amountValidation.valid) {
      toast.error(amountValidation.message || 'Valores das parcelas inválidos.');
      return false;
    }
    if (!editable || !canSave) {
      toast.error('Preencha valor e vencimento e anexe o boleto da parcela atual.');
      return false;
    }
    const installments: BoletoInstallmentRow[] = rowsToInstallments(rows);
    setSaving(true);
    try {
      const res = await api.patch(`/purchase-orders/${order.id}/payment-boleto-installments`, {
        installments
      });
      const updated = (res.data as { data?: BoletoParcelasOrderFields & { id: string } })?.data;
      if (updated) setPersistedOrder(updated);
      onSaved?.(res.data);
      if (andRelease && onReleaseToPayment) {
        onReleaseToPayment(order.id);
      } else {
        toast.success('Parcela salva.');
      }
      return true;
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg || 'Erro ao salvar parcelas');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {hint ? <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{hint}</p> : null}
      {editable && orderTotal > 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Total da OC: <span className="font-medium text-gray-700 dark:text-gray-300">{formatMoneyDisplay(orderTotal)}</span>
          {n > 1 ? ' — ao alterar uma parcela, as demais ajustam automaticamente.' : '.'}
        </p>
      ) : null}
      {!amountValidation.valid && amountValidation.message ? (
        <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
          {amountValidation.message}
        </p>
      ) : null}
      {phaseReleased && editable && !parallelFlow && financeHasCurrentParcel ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          Parcela com o financeiro: só é possível editar parcelas ainda em &quot;Anexar boleto&quot;.
        </p>
      ) : null}
      {phaseReleased && parallelFlow ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          Todos os boletos já estão anexados. Anexe os comprovantes na seção &quot;Comprovantes&quot; abaixo.
        </p>
      ) : null}

      {editable ? (
        <div className="space-y-3">
          {Array.from({ length: n }, (_, i) => {
            const row = rows[i] ?? buildInitialRows(order)[i];
            const stored = storedRows[i];
            const instRow: BoletoInstallmentRow = stored
              ? { ...draftToRow(row), ...stored }
              : parsedRows[i] ?? draftToRow(row);
            const st = rowStatus(instRow);
            const locked = st === 'PAID' || st === 'AWAITING_PAYMENT';
            const isPendingEditable = !locked && st === 'PENDING_BOLETO' && !parallelFlow;
            return !isPendingEditable;
          }).some(Boolean) ? (
            <div className="table-scroll rounded-xl border border-gray-200 dark:border-gray-700 px-4 sm:px-5">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                    <th className="pt-4 pb-3 pr-2 font-medium text-xs text-gray-500 dark:text-gray-400">
                      Parcela
                    </th>
                    <th className="pt-4 pb-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center">
                      Vencimento
                    </th>
                    <th className="pt-4 pb-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center">
                      Status
                    </th>
                    <th className="pt-4 pb-3 pl-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {Array.from({ length: n }, (_, i) => {
                    const row = rows[i] ?? buildInitialRows(order)[i];
                    const stored = storedRows[i];
                    const instRow: BoletoInstallmentRow = stored
                      ? { ...draftToRow(row), ...stored }
                      : parsedRows[i] ?? draftToRow(row);
                    const st = rowStatus(instRow);
                    const locked = st === 'PAID' || st === 'AWAITING_PAYMENT';
                    const isPendingEditable = !locked && st === 'PENDING_BOLETO' && !parallelFlow;
                    if (isPendingEditable) return null;
                    const boletoHref = (row?.boletoUrl || instRow?.boletoUrl || '').trim();
                    const proofHref =
                      (instRow?.installmentProofUrl || '').trim() ||
                      ((st === 'PAID' || st === 'AWAITING_PAYMENT') && orderProofUrl
                        ? orderProofUrl
                        : '');
                    const statusOpts = { orderStatus: order.status, hasProof: !!proofHref };
                    return (
                      <tr key={i} className="text-gray-900 dark:text-gray-100">
                        <td className="py-3 pr-2 align-top whitespace-nowrap text-sm font-medium">
                          {n > 1 ? `Parcela ${i + 1}` : 'Parcela única'}
                        </td>
                        <td className="py-3 px-2 text-center align-top whitespace-nowrap">
                          {formatDueDateBr(row?.dueDate || instRow?.dueDate)}
                        </td>
                        <td className="py-3 px-2 text-center align-top whitespace-nowrap">
                          <span className={installmentStatusBadgeClass(st, !!boletoHref, statusOpts)}>
                            {installmentStatusLabel(st, !!boletoHref, statusOpts)}
                          </span>
                        </td>
                        <td className="py-3 pl-2 text-center align-top whitespace-nowrap tabular-nums font-medium">
                          {formatMoneyDisplay(parseMoneyInput(row?.amount ?? '') ?? instRow?.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {Array.from({ length: n }, (_, i) => {
            const row = rows[i] ?? buildInitialRows(order)[i];
            const stored = storedRows[i];
            const instRow: BoletoInstallmentRow = stored
              ? { ...draftToRow(row), ...stored }
              : parsedRows[i] ?? draftToRow(row);
            const st = rowStatus(instRow);
            const locked = st === 'PAID' || st === 'AWAITING_PAYMENT';
            const isActiveParcel = activeIdx === i;
            const isFutureParcel = activeIdx != null && i > activeIdx && st === 'PENDING_BOLETO';
            const isPendingEditable = !locked && st === 'PENDING_BOLETO' && !parallelFlow;
            if (!isPendingEditable) return null;

            const amount = parseMoneyInput(row?.amount ?? '');
            const rowAmountInvalid =
              orderTotal > 0 &&
              (amount == null ||
                amount < 0 ||
                amount > orderTotal + 0.001 ||
                !amountValidation.valid);
            const boletoHref = (row?.boletoUrl || instRow?.boletoUrl || '').trim();
            const boletoName =
              row?.boletoName?.trim() ||
              instRow?.boletoName?.trim() ||
              `Boleto parcela ${romanParcelLabel(i)}`;

            return (
              <section
                key={i}
                className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {n > 1 ? `Parcela ${i + 1}` : 'Boleto'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {isActiveParcel
                        ? 'Obrigatória · informe vencimento, valor e anexe o boleto'
                        : isFutureParcel
                          ? 'Opcional · pode anexar agora se quiser'
                          : 'Informe vencimento, valor e anexe o boleto'}
                    </p>
                  </div>
                  {boletoHref ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 shrink-0">
                      <Check className="w-3.5 h-3.5" />
                      Anexado
                    </span>
                  ) : isActiveParcel ? (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-red-600 dark:text-red-400 shrink-0">
                      Obrigatória
                    </span>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                      Vencimento
                    </label>
                    <DatePickerField
                      value={row?.dueDate ?? ''}
                      onChange={(v) => {
                        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, dueDate: v } : r)));
                      }}
                      placeholder="dd/mm/aaaa"
                      noFocusRing
                      aria-label={`Vencimento da parcela ${i + 1}`}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                      Valor
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={row?.amount ?? ''}
                      onChange={(e) => handleAmountChange(i, e.target.value)}
                      className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${
                        rowAmountInvalid
                          ? 'border-red-500 dark:border-red-500 ring-1 ring-red-500/30'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                      placeholder="R$ 0,00"
                      aria-invalid={rowAmountInvalid}
                    />
                    {rowAmountInvalid && amount != null && amount > orderTotal + 0.001 ? (
                      <span className="mt-1 block text-[11px] text-red-600 dark:text-red-400">
                        Máximo: {formatMoneyDisplay(orderTotal)}
                      </span>
                    ) : null}
                  </div>
                </div>

                {boletoHref ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700">
                    <div className="min-w-0 flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                        <Banknote className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {boletoName}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Boleto anexado</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <OcAttachmentActions
                        url={boletoHref}
                        fileName={boletoName}
                        variant="buttons"
                      />
                      <label className="cursor-pointer">
                        <span className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100">
                          <FileUp className="h-3.5 w-3.5" />
                          Trocar
                        </span>
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          className="hidden"
                          disabled={row?.uploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            void uploadForIndex(i, file);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <label
                    className={`flex min-h-14 items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 transition-colors ${
                      row?.uploading
                        ? 'cursor-not-allowed border-gray-200 text-gray-400 dark:border-gray-700 dark:text-gray-500'
                        : 'cursor-pointer border-gray-300 text-gray-700 hover:border-red-400 hover:bg-red-50/40 dark:border-gray-600 dark:text-gray-200 dark:hover:border-red-500/70 dark:hover:bg-red-950/20'
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                      {row?.uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileUp className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {row?.uploading ? 'Anexando…' : 'Anexar boleto'}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                        PDF ou imagem
                      </span>
                    </span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      disabled={row?.uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        void uploadForIndex(i, file);
                      }}
                    />
                  </label>
                )}
              </section>
            );
          })}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={!canSave || saving || releasePending}
              onClick={() => void handleSave(false)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              {saving && !releasePending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                'Salvar'
              )}
            </button>
            {showSaveAndRelease ? (
              <button
                type="button"
                disabled={!canSave || saving || releasePending}
                onClick={() => void handleSave(true)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {releasePending || saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {releasePending ? 'Enviando…' : 'Salvando…'}
                  </>
                ) : (
                  'Salvar e enviar'
                )}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
      <div className="table-scroll rounded-xl border border-gray-200 dark:border-gray-700 px-4 sm:px-5">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="text-left border-b border-gray-200 dark:border-gray-700">
              <th className="pt-4 pb-3 pr-2 font-medium text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                Parcela
              </th>
              <th className="pt-4 pb-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
                Vencimento
              </th>
              <th className="pt-4 pb-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
                Status
              </th>
              {(!hideAttachmentLinks || editable) && (
                <th className="pt-4 pb-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
                  Boleto
                </th>
              )}
              {showComprovante ? (
                <th className="pt-4 pb-3 px-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
                  Comprovante
                </th>
              ) : null}
              <th className="pt-4 pb-3 pl-2 font-medium text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
                Valor
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
      {Array.from({ length: n }, (_, i) => {
        const row = rows[i] ?? buildInitialRows(order)[i];
        const stored = storedRows[i];
        const instRow: BoletoInstallmentRow = stored
          ? { ...draftToRow(row), ...stored }
          : parsedRows[i] ?? draftToRow(row);
        const st = rowStatus(instRow);
        const locked = st === 'PAID' || st === 'AWAITING_PAYMENT';
        const isActiveParcel = activeIdx === i;
        const isFutureParcel = activeIdx != null && i > activeIdx && st === 'PENDING_BOLETO';
        const isWaitingPreviousParcel =
          !parallelFlow &&
          i > 0 &&
          Array.from({ length: i }, (_, previousIndex) => {
            const previousDraft = rows[previousIndex] ?? buildInitialRows(order)[previousIndex];
            const previousStored = storedRows[previousIndex];
            const previousRow: BoletoInstallmentRow = previousStored
              ? { ...draftToRow(previousDraft), ...previousStored }
              : parsedRows[previousIndex] ?? draftToRow(previousDraft);
            return rowStatus(previousRow) !== 'PAID';
          }).some(Boolean);
        const isPendingEditable = editable && !locked && st === 'PENDING_BOLETO' && !parallelFlow;
        const rowEditable = isPendingEditable;
        const fileEditable = isPendingEditable;
        const amount = parseMoneyInput(row?.amount ?? '');
        const rowAmountInvalid =
          rowEditable &&
          orderTotal > 0 &&
          (amount == null ||
            amount < 0 ||
            amount > orderTotal + 0.001 ||
            !amountValidation.valid);
        const boletoHref = (row?.boletoUrl || instRow?.boletoUrl || '').trim();
        const proofHref =
          (instRow?.installmentProofUrl || '').trim() ||
          ((st === 'PAID' || st === 'AWAITING_PAYMENT') && orderProofUrl ? orderProofUrl : '');
        const hasProof = !!proofHref;
        const statusOpts = {
          orderStatus: order.status,
          hasProof
        };
        const statusClass = isWaitingPreviousParcel
          ? 'inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
          : installmentStatusBadgeClass(st, !!boletoHref, statusOpts);
        const statusLabel = isWaitingPreviousParcel
          ? 'Aguardando parcela anterior'
          : installmentStatusLabel(st, !!boletoHref, statusOpts);
        const proofName =
          instRow?.installmentProofName?.trim() ||
          (proofHref === orderProofUrl && orderProofName ? orderProofName : '');
        const showBoletoLinks = !hideAttachmentLinks;
        const showProofLinks = showComprovante && !hideAttachmentLinks;
        const showBoletoColumn = !hideAttachmentLinks || editable;

        return (
          <tr key={i} className="text-gray-900 dark:text-gray-100">
            <td className="py-3 pr-2 align-top whitespace-nowrap">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {n > 1 ? `Parcela ${i + 1}` : 'Parcela única'}
                </span>
                {editable && isActiveParcel ? (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
                    Obrigatória
                  </span>
                ) : null}
                {isFutureParcel ? (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Opcional
                  </span>
                ) : null}
              </div>
            </td>
            <td className="py-3 px-2 text-center align-top whitespace-nowrap">
              {formatDueDateBr(row?.dueDate || instRow?.dueDate)}
            </td>
            <td className="py-3 px-2 text-center align-top whitespace-nowrap">
              <span className={statusClass}>{statusLabel}</span>
            </td>
            {showBoletoColumn ? (
              <td className="py-3 px-2 text-center align-top">
                {showBoletoLinks && boletoHref ? (
                  <OcAttachmentActions
                    url={boletoHref}
                    fileName={row?.boletoName?.trim() || `Boleto parcela ${romanParcelLabel(i)}`}
                    icon={Banknote}
                  />
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">—</span>
                )}
              </td>
            ) : null}
            {showComprovante ? (
              <td className="py-3 px-2 text-center align-top">
                {proofHref && showProofLinks ? (
                  <OcAttachmentActions
                    url={proofHref}
                    fileName={proofName || `Comprovante parcela ${romanParcelLabel(i)}`}
                    icon={Receipt}
                  />
                ) : proofHref && hideAttachmentLinks ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-medium text-xs">
                    <Check className="w-3.5 h-3.5" />
                    Anexado
                  </span>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">—</span>
                )}
              </td>
            ) : null}
            <td className="py-3 pl-2 text-center align-top whitespace-nowrap tabular-nums">
              <span className="font-medium">{formatMoneyDisplay(amount ?? instRow?.amount)}</span>
            </td>
          </tr>
        );
      })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

/** Remonta o estado interno quando os dados da OC mudam (evita loop de useEffect). */
export function BoletoParcelasList(props: BoletoParcelasListProps) {
  return <BoletoParcelasListInner key={installmentsStateKey(props.order)} {...props} />;
}
