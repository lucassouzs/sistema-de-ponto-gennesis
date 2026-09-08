'use client';

import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import {
  formatPercentFromNumber,
  maskPercentInput,
  parsePercentInput,
} from '@/lib/maskPercent';

const readOnlyCls =
  'cursor-not-allowed bg-gray-50 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300';

export function FormPercentField({
  value,
  onChange,
  placeholder = '0%',
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
        ? formatPercentFromNumber(value)
        : maskPercentInput(String(value));

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      readOnly={readOnly}
      disabled={readOnly}
      onChange={(e) => {
        if (readOnly) return;
        const masked = maskPercentInput(e.target.value);
        onChange(parsePercentInput(masked));
      }}
      placeholder={placeholder}
      className={`${className ?? `${FORM_FIELD_INPUT_CLS} h-10`} ${readOnly ? readOnlyCls : ''}`}
    />
  );
}
