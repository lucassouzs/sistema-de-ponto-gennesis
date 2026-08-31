'use client';

import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import {
  formatCurrencyInputBrFromNumber,
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';

export function FormCurrencyField({
  value,
  onChange,
  placeholder = 'R$ 0,00',
  className,
  readOnly = false,
}: {
  value: string | number | null | undefined;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}) {
  const display =
    value === null || value === undefined || value === ''
      ? ''
      : typeof value === 'number'
        ? formatCurrencyInputBrFromNumber(value)
        : maskCurrencyInputBrOrEmpty(String(value));

  const readOnlyCls =
    'cursor-not-allowed bg-gray-50 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300';

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      readOnly={readOnly}
      disabled={readOnly}
      onChange={(e) => {
        if (readOnly) return;
        const masked = maskCurrencyInputBrOrEmpty(e.target.value);
        onChange(parseCurrencyInputBr(masked));
      }}
      placeholder={placeholder}
      className={`${className ?? `${FORM_FIELD_INPUT_CLS} h-10`} ${readOnly ? readOnlyCls : ''}`}
    />
  );
}
