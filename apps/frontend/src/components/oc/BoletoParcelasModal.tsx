'use client';

import React, { useMemo, useState } from 'react';
import { Banknote, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import {
  parsePaymentBoletoInstallments,
  romanParcelLabel,
  rowStatus,
  buyerActiveInstallmentIndex,
  installmentStatusLabel,
  type BoletoInstallmentRow,
  type BoletoInstallmentPaymentStatus
} from '@/components/oc/ocPaymentBoleto';

export type BoletoParcelasModalOrder = {
  id: string;
  orderNumber: string;
  orderDate: string;
  amountToPay?: number | string | null;
  paymentParcelCount?: number;
  paymentParcelDueDays?: number[];
  paymentBoletoInstallments?: unknown;
  paymentBoletoPhaseReleased?: boolean | null;
};

function ymdAddDays(ymd: string, add: number): string {
  const base = ymd.includes('T') ? ymd : `${ymd}T12:00:00`;
  const d = new Date(base);
  if (Number.isNaN(d.getTime())) {
    const t = new Date();
    t.setDate(t.getDate() + add);
    return t.toISOString().slice(0, 10);
  }
  d.setDate(d.getDate() + add);
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

function formatMoneyBr(n: number): string {
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoneyInput(value: string): number | null {
  const cleaned = value.trim().replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  if (!cleaned) return null;
  const x = parseFloat(cleaned);
  return Number.isFinite(x) ? x : null;
}

type RowDraft = {
  amount: string;
  dueDate: string;
  boletoUrl: string | null;
  boletoName: string | null;
  uploading: boolean;
  paymentStatus?: BoletoInstallmentPaymentStatus | null;
};

function buildInitialRows(order: BoletoParcelasModalOrder): RowDraft[] {
  const n = order.paymentParcelCount ?? 1;
  const days = order.paymentParcelDueDays?.length ? order.paymentParcelDueDays : [30];
  const existing = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
  const total = Number(order.amountToPay);
  const amounts = splitAmountInInstallments(Number.isFinite(total) ? total : 0, n);
  return Array.from({ length: n }, (_, i) => {
    const ex = existing[i];
    const d = days[i] ?? days[days.length - 1] ?? 30;
    return {
      amount: formatMoneyBr(Number.isFinite(ex?.amount) ? ex.amount : amounts[i] ?? 0),
      dueDate: ex?.dueDate || ymdAddDays(order.orderDate, d),
      boletoUrl: ex?.boletoUrl ?? null,
      boletoName: ex?.boletoName ?? null,
      uploading: false,
      paymentStatus: ex?.paymentStatus
    };
  });
}

function draftToRow(d: RowDraft): BoletoInstallmentRow {
  return {
    amount: parseMoneyInput(d.amount) ?? 0,
    dueDate: d.dueDate.trim().slice(0, 10),
    boletoUrl: d.boletoUrl,
    boletoName: d.boletoName,
    paymentStatus: d.paymentStatus
  };
}

export type BoletoParcelasModalProps = {
  order: BoletoParcelasModalOrder;
  onClose: () => void;
  onSaved: (payload: { data: unknown }) => void;
};

export function BoletoParcelasModal({ order, onClose, onSaved }: BoletoParcelasModalProps) {
  const n = order.paymentParcelCount ?? 1;
  const [rows, setRows] = useState<RowDraft[]>(() => buildInitialRows(order));
  const [saving, setSaving] = useState(false);

  const phaseReleased = order.paymentBoletoPhaseReleased === true;
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

  const canSave = useMemo(() => {
    if (!rows.every((r) => parseMoneyInput(r.amount) != null && r.dueDate?.trim())) return false;
    if (phaseReleased) return false;
    if (activeIdx === null) return false;
    return !!(rows[activeIdx]?.boletoUrl || '').trim();
  }, [rows, activeIdx, phaseReleased]);

  const uploadForIndex = async (index: number, file: File) => {
    if (phaseReleased) {
      toast.error('Aguarde o financeiro liberar a próxima parcela.');
      return;
    }
    if (activeIdx !== index) {
      toast.error(`Anexe o boleto apenas na parcela ${romanParcelLabel(activeIdx ?? 0)} (sequência).`);
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

  const handleSave = async () => {
    if (phaseReleased) {
      toast.error('Aguarde o financeiro liberar a próxima parcela.');
      return;
    }
    if (!canSave) {
      toast.error('Preencha valor e vencimento em todas as parcelas e anexe o boleto da parcela atual.');
      return;
    }
    const installments: BoletoInstallmentRow[] = rows.map((r) => {
      const amt = parseMoneyInput(r.amount);
      return {
        amount: amt ?? 0,
        dueDate: r.dueDate.trim().slice(0, 10),
        boletoUrl: (r.boletoUrl || '').trim() || null,
        boletoName: (r.boletoName || '').trim() || null,
        paymentStatus: r.paymentStatus
      };
    });
    setSaving(true);
    try {
      const res = await api.patch(`/purchase-orders/${order.id}/payment-boleto-installments`, { installments });
      toast.success('Dados das parcelas salvos.');
      onSaved(res.data);
      onClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg || 'Erro ao salvar parcelas');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Boletos por parcela</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {order.orderNumber} — {n} parcela{n > 1 ? 's' : ''} (condição de pagamento). Envie uma parcela por vez
              ao financeiro.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {phaseReleased && (
          <p className="mb-4 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            Esta OC está com o financeiro para pagamento da parcela em aberto. Após o pagamento, o financeiro libera a
            próxima anexação aqui.
          </p>
        )}

        <div className="space-y-5">
          {rows.map((row, i) => {
            const st = rowStatus(draftToRow(row));
            const locked = st === 'PAID' || st === 'AWAITING_PAYMENT';
            const fileLocked = locked || phaseReleased || (activeIdx !== null && i !== activeIdx);
            const amountLocked = locked;

            return (
              <div
                key={i}
                className="rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-violet-900 dark:text-violet-200 uppercase tracking-wide">
                    Parcela {romanParcelLabel(i)}
                  </p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                    {installmentStatusLabel(st)}
                  </span>
                </div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Valor da parcela ({romanParcelLabel(i)})
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={amountLocked}
                    value={row.amount}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((prev) => prev.map((r, j) => (j === i ? { ...r, amount: v } : r)));
                    }}
                    className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 disabled:opacity-60"
                    placeholder="0,00"
                  />
                </label>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Data de vencimento ({romanParcelLabel(i)})
                  <input
                    type="date"
                    disabled={amountLocked}
                    value={row.dueDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((prev) => prev.map((r, j) => (j === i ? { ...r, dueDate: v } : r)));
                    }}
                    className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 disabled:opacity-60"
                  />
                </label>
                <div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Anexar boleto ({romanParcelLabel(i)})
                  </p>
                  {!fileLocked ? (
                    <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 font-medium shrink-0">
                        <Banknote className="w-3.5 h-3.5" />
                        Escolher arquivo
                      </span>
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        className="hidden"
                        disabled={row.uploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          void uploadForIndex(i, file);
                        }}
                      />
                    </label>
                  ) : (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {st === 'PAID'
                        ? 'Parcela já paga.'
                        : st === 'AWAITING_PAYMENT'
                          ? 'Aguardando pagamento pelo financeiro.'
                          : 'Aguarde a parcela anterior.'}
                    </p>
                  )}
                  {row.uploading ? (
                    <span className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Enviando...
                    </span>
                  ) : row.boletoUrl ? (
                    <a
                      href={absoluteUploadUrl(row.boletoUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
                    >
                      {row.boletoName?.trim() || 'Abrir boleto'}
                    </a>
                  ) : !fileLocked ? (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">PDF ou imagem (até 15 MB)</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={() => void handleSave()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
