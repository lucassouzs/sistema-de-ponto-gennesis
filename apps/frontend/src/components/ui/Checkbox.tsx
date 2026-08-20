'use client';

import React, { useEffect, useRef } from 'react';
import { clsx } from 'clsx';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export interface CheckboxIndicatorProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange?: () => void;
  disabled?: boolean;
  className?: string;
  /** Quando true, renderiza como <button>; senão só o quadrado (uso dentro de <label>). */
  asButton?: boolean;
}

/** Quadrado do checkbox — mesmo visual da página de login. */
export function CheckboxIndicator({
  checked,
  indeterminate = false,
  onChange,
  disabled,
  className,
  asButton = false,
}: CheckboxIndicatorProps) {
  const active = checked || indeterminate;
  const box = (
    <div
      className={clsx(
        'box-border flex size-5 shrink-0 items-center justify-center overflow-hidden rounded border-2 transition-colors duration-200',
        active
          ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
          : 'border-gray-300 bg-white group-hover:border-red-500 dark:border-gray-600 dark:bg-gray-800 dark:group-hover:border-red-400',
      )}
    >
      {/* Espaço reservado sempre — evita salto de altura ao marcar */}
      <span className="flex size-3 items-center justify-center" aria-hidden>
        {indeterminate ? (
          <span className="block h-0.5 w-2.5 rounded-full bg-white" />
        ) : (
          <svg
            className={clsx('size-3 text-white', checked ? 'opacity-100' : 'opacity-0')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </span>
    </div>
  );

  if (asButton) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={clsx(
          'group size-5 shrink-0 rounded focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
      >
        {box}
      </button>
    );
  }

  return <div className={clsx('relative size-5 shrink-0', className)}>{box}</div>;
}

/** Checkbox compacto para tabelas — mesmo visual da página de login. */
export function TableCheckbox({
  checked,
  indeterminate = false,
  onChange,
  ariaLabel,
  onClick,
  disabled = false,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  onClick?: (e: React.MouseEvent<HTMLLabelElement>) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate, checked]);

  return (
    <label
      className={clsx(
        'relative inline-flex size-5 shrink-0 items-center justify-center group',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      )}
      onClick={onClick}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
        className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
      />
      <CheckboxIndicator checked={checked} indeterminate={indeterminate} disabled={disabled} />
    </label>
  );
}

/** Checkbox visual igual ao da página de login (Permanecer conectado). */
export function Checkbox({ checked, onChange, label, disabled, className }: CheckboxProps) {
  return (
    <label
      className={clsx(
        'flex items-center space-x-3 cursor-pointer group',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
        />
        <CheckboxIndicator checked={checked} />
      </span>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
        {label}
      </span>
    </label>
  );
}
