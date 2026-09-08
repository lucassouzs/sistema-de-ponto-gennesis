'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import {
  FINANCIAL_CONTROL_OC_CONSORCIO_FIELD_LABEL,
  FINANCIAL_CONTROL_OC_CONSORCIO_LABEL,
  MONTHS_PT,
  formatCurrencyValue,
  formatDateDisplayPtBr,
  parseCurrencyInput,
  type EntryFormState,
} from '@/components/financeiro/financialControlEntry';
import { formatOcListDisplayId } from '@/components/oc/ocListDisplay';

type FinancialControlOcQuickLaunchProps = {
  form: EntryFormState;
  interestValue: string;
  onInterestChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isSaving: boolean;
  submitLabel?: string;
};

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 border-b border-gray-100 dark:border-gray-700/80 last:border-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="text-sm font-medium text-gray-900 dark:text-gray-100 text-right">{value}</dd>
    </div>
  );
}

function CurrencyInput({
  value,
  onChange,
  placeholder = '0,00',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      onChange('');
      return;
    }
    const number = parseInt(digits, 10) / 100;
    onChange(
      number.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  };

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400 pointer-events-none">
        R$
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white text-right tabular-nums"
      />
    </div>
  );
}

function sumCurrencyValues(base: string, extra: string): string {
  const a = parseCurrencyInput(base) ?? 0;
  const b = parseCurrencyInput(extra) ?? 0;
  const total = Math.round((a + b) * 100) / 100;
  return formatCurrencyValue(total);
}

export function FinancialControlOcQuickLaunch({
  form,
  interestValue,
  onInterestChange,
  onClose,
  onSubmit,
  isSaving,
  submitLabel = 'Confirmar lançamento',
}: FinancialControlOcQuickLaunchProps) {
  const baseValue = form.originalValue.trim() || form.finalValue.trim();
  const totalValue = sumCurrencyValues(baseValue, interestValue);
  const baseDisplay = baseValue ? `R$ ${baseValue}` : '—';
  const totalDisplay = totalValue ? `R$ ${totalValue}` : '—';

  return (
    <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
      <dl className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 px-4 py-1">
        <SummaryRow label={FINANCIAL_CONTROL_OC_CONSORCIO_FIELD_LABEL} value={FINANCIAL_CONTROL_OC_CONSORCIO_LABEL} />
        <SummaryRow
          label="OC"
          value={form.ocNumber ? formatOcListDisplayId(form.ocNumber) : '—'}
        />
        <SummaryRow label="Fornecedor" value={form.supplierName || '—'} />
        {form.nfNumber ? <SummaryRow label="NF" value={form.nfNumber} /> : null}
        {form.parcelNumber ? <SummaryRow label="Parcela" value={form.parcelNumber} /> : null}
        <SummaryRow label="Valor" value={baseDisplay} />
        <SummaryRow
          label="Referência"
          value={`${MONTHS_PT[form.paymentMonth - 1]}/${form.paymentYear}`}
        />
        <SummaryRow label="Pagamento em" value={formatDateDisplayPtBr(form.paidDate)} />
        {form.dueDate ? (
          <SummaryRow label="Vencimento" value={formatDateDisplayPtBr(form.dueDate)} />
        ) : null}
      </dl>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Juros (opcional)
          </label>
          <CurrencyInput value={interestValue} onChange={onInterestChange} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Valor total
          </label>
          <div className="flex h-[42px] items-center justify-end rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm font-semibold tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-100">
            {totalDisplay}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSaving || !parseCurrencyInputSafe(baseValue)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function parseCurrencyInputSafe(value: string): boolean {
  if (!value.trim()) return false;
  const digitsOnly = value.replace(/\D/g, '');
  return digitsOnly.length > 0;
}
