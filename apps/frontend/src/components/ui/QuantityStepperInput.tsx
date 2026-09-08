'use client';

import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const numberInputClass =
  'min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 tabular-nums outline-none dark:text-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]';

const numberInputClassSm =
  'min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-gray-900 tabular-nums outline-none dark:text-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]';

type QuantityStepperInputProps = {
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  required?: boolean;
  size?: 'md' | 'sm';
  placeholder?: string;
  allowEmpty?: boolean;
};

export function QuantityStepperInput({
  value,
  onChange,
  unit,
  min = 1,
  max,
  required = false,
  size = 'md',
  placeholder,
  allowEmpty = false,
}: QuantityStepperInputProps) {
  const clamp = (n: number) => {
    let v = Math.floor(n);
    if (!Number.isFinite(v)) return allowEmpty ? 0 : min;
    if (allowEmpty && v <= 0) return 0;
    if (v < min) v = min;
    if (max != null && v > max) v = max;
    return v;
  };

  const normalized = allowEmpty && value <= 0 ? 0 : clamp(value);
  const shellClass =
    size === 'sm'
      ? 'flex overflow-hidden rounded border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
      : 'flex overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800';
  const stepBtnClass =
    'flex flex-1 items-center justify-center text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200';
  const unitClass =
    size === 'sm'
      ? 'flex shrink-0 items-center border-l border-gray-300 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-600 dark:text-gray-400'
      : 'flex shrink-0 items-center border-l border-gray-300 px-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-600 dark:text-gray-400';

  const bump = (delta: number) => {
    const base = allowEmpty && normalized <= 0 ? 0 : normalized;
    onChange(clamp(base + delta));
  };

  const canDecrease = allowEmpty ? normalized > 0 : normalized > min;

  return (
    <div className={shellClass} data-form-field-shell="true">
      <input
        type="number"
        required={required}
        min={allowEmpty ? 0 : min}
        max={max}
        placeholder={placeholder}
        value={normalized > 0 ? normalized : ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (allowEmpty && raw === '') {
            onChange(0);
            return;
          }
          const parsed = parseInt(raw, 10);
          onChange(Number.isFinite(parsed) ? clamp(parsed) : allowEmpty ? 0 : min);
        }}
        className={size === 'sm' ? numberInputClassSm : numberInputClass}
      />
      <span className={unitClass}>{unit?.trim() || '—'}</span>
      <div className="flex w-8 shrink-0 flex-col border-l border-gray-300 dark:border-gray-600">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Aumentar quantidade"
          onClick={() => bump(1)}
          disabled={max != null && normalized >= max}
          className={`${stepBtnClass} border-b border-gray-300 dark:border-gray-600 disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Diminuir quantidade"
          onClick={() => bump(-1)}
          disabled={!canDecrease}
          className={`${stepBtnClass} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
