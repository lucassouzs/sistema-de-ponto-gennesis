'use client';

import React, { useState } from 'react';

const ACTIVE =
  'app-tab--active rounded-xl bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-500';
const INACTIVE =
  'bg-transparent text-gray-500 hover:bg-transparent hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200';
const DISABLED =
  'cursor-not-allowed bg-transparent text-gray-400 opacity-70 dark:text-gray-500';

const SEGMENT_ACTIVE =
  'rounded-lg bg-white text-red-600 shadow-sm dark:bg-gray-700 dark:text-red-400';
const SEGMENT_INACTIVE =
  'rounded-lg text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200';

export function appTabClassName({
  active,
  popped = false,
  disabled = false,
  className = ''
}: {
  active: boolean;
  popped?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const state = disabled
    ? DISABLED
    : active
      ? `${ACTIVE}${popped ? ' app-tab--pop' : ''}`
      : INACTIVE;
  return `app-tab inline-flex items-center justify-center ${className} ${state}`
    .replace(/\s+/g, ' ')
    .trim();
}

type AppTabButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
};

export function AppTabButton({
  active,
  className = '',
  disabled,
  onClick,
  children,
  type = 'button',
  ...rest
}: AppTabButtonProps) {
  const [popped, setPopped] = useState(false);

  return (
    <button
      type={type}
      role="tab"
      aria-selected={active}
      disabled={disabled}
      className={appTabClassName({ active, popped, disabled: Boolean(disabled), className })}
      onClick={(event) => {
        if (disabled) return;
        setPopped(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setPopped(true));
        });
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Sub-filtro / 2ª linha: trilho cinza, sem competir com as abas principais. */
export function AppSegmentedControl({
  children,
  className = '',
  'aria-label': ariaLabel
}: {
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-xl bg-gray-100 p-1 dark:bg-gray-800/80 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

type AppSegmentedButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
};

export function AppSegmentedButton({
  active,
  className = '',
  disabled,
  children,
  type = 'button',
  ...rest
}: AppSegmentedButtonProps) {
  return (
    <button
      type={type}
      role="tab"
      aria-selected={active}
      disabled={disabled}
      className={`inline-flex items-center justify-center px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
        active ? SEGMENT_ACTIVE : SEGMENT_INACTIVE
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
